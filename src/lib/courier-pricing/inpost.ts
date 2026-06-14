/**
 * Silnik wyceny InPost na bazie negocjowanej umowy (Taryfikator nr 55161178).
 *
 * Źródło: `umowy kurierskie/inpost.pdf` — sekcje:
 *  • Paczkomat 24/7 — Gabaryt A/B/C
 *  • Kurier Standard — per kg (do 50)
 *  • Opłaty dodatkowe (paliwo, COD, ubezpieczenie, NST, ponadgabaryt)
 */

import type {
  CourierServiceCatalogEntry,
  PackageInput,
  PriceBreakdownLine,
  PricedService,
  ShippingOptions,
} from "./types";
import { detectNstInpost } from "./nst";

// ─── Stałe z umowy ──────────────────────────────────────────────────

/** Cennik podstawowy Paczkomat 24/7 (PLN netto bez paliwa). */
const PACZKOMAT_PRICE_PLN = {
  A: 8.43, // 8 × 38 × 64 cm, do 25 kg
  B: 8.53, // 19 × 38 × 64 cm, do 25 kg
  C: 8.84, // 41 × 38 × 64 cm, do 25 kg
} as const;

/** Limity wymiarów dla gabarytów Paczkomat (cm × cm × cm, max waga). */
const PACZKOMAT_LIMITS = {
  A: { w: 8, h: 38, d: 64, kg: 25 },
  B: { w: 19, h: 38, d: 64, kg: 25 },
  C: { w: 41, h: 38, d: 64, kg: 25 },
} as const;

/** Kurier Standard — cena netto wg wagi rzeczywistej lub gabarytowej.
 *  Brackety ≤30 kg = standardowe Kurier. Brackety ≤40 i ≤50 kg = obejmują
 *  ukrytą opłatę ponadgabarytową (76.55 zł / 93.58 zł ponad bracket ≤30).
 *  Dlatego w pricerze cappujemy chargeable weight z dim weight do 30 kg
 *  (standard cap), a brackety ≤40/≤50 odpalają TYLKO gdy actual waga > 30,
 *  bo wtedy paczka jest realnie ponadgabarytowa. */
const KURIER_STANDARD_RANGES: {
  /** górny limit przedziału wagi (kg) */
  upTo: number;
  pln: number;
}[] = [
  { upTo: 10, pln: 8.73 },
  { upTo: 20, pln: 10.39 },
  { upTo: 30, pln: 11.26 },
  { upTo: 40, pln: 86.81 },
  { upTo: 50, pln: 104.84 },
];

/** Standardowy max weight dla brackets — dim weight powyżej tego nie pcha
 *  paczki do droższych brackets (te są zarezerwowane dla actual > 30 kg). */
const KURIER_STANDARD_CAP_KG = 30;
const KURIER_MAX_WEIGHT_KG = 50;

/** Hard limity fizyczne InPost Kurier (z regulaminu):
 *   • najdłuższy bok ≤ 120 cm
 *   • suma wszystkich wymiarów ≤ 220 cm
 *  Paczka spoza tych limitów = InPost odmawia przyjęcia, niezależnie od opłat
 *  ponadgabarytowych. Wcześniej kod dodawał tylko surcharge „dłużycowa" przy
 *  >120 cm, co dawało fałszywie tanie wyceny dla paczek >>120 (np. 186×86×6
 *  wracała ze stawką ~12 zł + 100 zł dłużycowej, podczas gdy InPost taki ładunek
 *  w ogóle nie wozi). */
const KURIER_MAX_LONGEST_CM = 120;
const KURIER_MAX_SUM_DIMS_CM = 220;

/** Opłaty dodatkowe — wartości po negocjowanym rabacie. */
const SURCHARGES = {
  /** Opłata paliwowa + drogowa: % od ceny podstawowej.
   *  Zgodnie z Załącznikiem 1 umowy Taryfikator 55161178:
   *   • Kurier Standard: 8,00 %
   *   • Paczkomat 24/7: 13,00 %
   *  Realne stawki InPost wahają się miesięcznie wyżej, ale w umowie sztywno
   *  zapisano te wartości — używamy ich, żeby kalkulacja zgadzała się
   *  z fakturą-przykładową z PDF (Załącznik 1). */
  fuelKurierPct: 0.08,
  fuelPaczkomatPct: 0.13,
  /** Pobranie COD (do 5000 PLN). */
  codDo5000Pln: 1.4,
  /** Ubezpieczenie ponad bazową 1000 PLN. */
  ubezp_do10000Pln: 2.09,
  ubezp_do20000Pln: 2.44,
  ubezp_do50000Pln: 5.0,
  /** Niestandardowa (przekracza wymiary gabarytu albo asymetria). */
  nstPaczkaPln: 22.0,
  /** Dłużycowa (jeden wymiar > 120 cm dla Kuriera). */
  dluzycowaPaczkaPln: 100.0,
  /** Ponadgabarytowa (Paczkomat) — > 500×500×800 mm albo > 30 kg. */
  ponadgabarytPlnPaczkomat: 253.74,
} as const;

const VAT_RATE = 0.23;

// ─── Helpers ────────────────────────────────────────────────────────

function maxWeight(p: PackageInput): number {
  return p.weightKg;
}

function fitsInPaczkomat(
  p: PackageInput,
  gab: keyof typeof PACZKOMAT_LIMITS,
): { fits: boolean; reasons: string[] } {
  const limit = PACZKOMAT_LIMITS[gab];
  // Najmniejszy bok < limit.w (głębokość skrytki), średni < limit.h, dłuższy < limit.d
  const sorted = [p.widthCm, p.heightCm, p.depthCm].sort((a, b) => a - b);
  const [small, mid, big] = sorted;
  const reasons: string[] = [];
  if (small > limit.w)
    reasons.push(`min. wymiar ${small} cm > ${limit.w} cm (skrytka ${gab})`);
  if (mid > limit.h)
    reasons.push(`średni wymiar ${mid} cm > ${limit.h} cm (skrytka ${gab})`);
  if (big > limit.d)
    reasons.push(`max wymiar ${big} cm > ${limit.d} cm (skrytka ${gab})`);
  if (p.weightKg > limit.kg)
    reasons.push(`waga ${p.weightKg} kg > ${limit.kg} kg (skrytka ${gab})`);
  return { fits: reasons.length === 0, reasons };
}

function kurierBasePln(weightKg: number): number {
  for (const range of KURIER_STANDARD_RANGES) {
    if (weightKg <= range.upTo) return range.pln;
  }
  // Powyżej 50 kg — usługa nie obsługuje
  return Infinity;
}

function commonSurcharges(
  packageCount: number,
  options: ShippingOptions,
  variant: "PACZKOMAT" | "KURIER",
  autoNstCount: number,
): { lines: PriceBreakdownLine[]; total: number } {
  const lines: PriceBreakdownLine[] = [];
  let total = 0;

  if (options.codAmountPln && options.codAmountPln > 0) {
    const cod = SURCHARGES.codDo5000Pln * packageCount;
    lines.push({
      label: `COD (${packageCount}× ${SURCHARGES.codDo5000Pln.toFixed(2)} zł)`,
      pln: cod,
    });
    total += cod;
  }

  if (options.insuredValuePln && options.insuredValuePln > 1000) {
    const val = options.insuredValuePln;
    let ubezp = 0;
    if (val <= 10000) ubezp = SURCHARGES.ubezp_do10000Pln;
    else if (val <= 20000) ubezp = SURCHARGES.ubezp_do20000Pln;
    else ubezp = SURCHARGES.ubezp_do50000Pln;
    const total_ubezp = ubezp * packageCount;
    lines.push({
      label: `Ubezpieczenie (${packageCount}× ${ubezp.toFixed(2)} zł)`,
      pln: total_ubezp,
    });
    total += total_ubezp;
  }

  // NST tylko dla Kuriera (Paczkomat ma „ponadgabarytowa" jako osobna kategoria)
  if (variant === "KURIER") {
    const nstCount = options.forceNonStandard ? packageCount : autoNstCount;
    if (nstCount > 0) {
      const nst = SURCHARGES.nstPaczkaPln * nstCount;
      const labelPrefix = options.forceNonStandard
        ? "Niestandardowa (wymuszone)"
        : "Niestandardowa (auto-wykryte)";
      lines.push({
        label: `${labelPrefix} (${nstCount}× ${SURCHARGES.nstPaczkaPln.toFixed(2)} zł)`,
        pln: nst,
      });
      total += nst;
    }
  }

  return { lines, total };
}

// ─── PACZKOMAT — wycena ─────────────────────────────────────────────

function priceInPostPaczkomat(
  packages: PackageInput[],
  options: ShippingOptions,
  gabaryt: "A" | "B" | "C",
): PricedService {
  const fuelOn = options.fuelSurcharge !== false;
  const breakdown: PriceBreakdownLine[] = [];
  const reasons: string[] = [];
  let basePln = 0;
  let fuelPln = 0;
  let surchargesPln = 0;

  // Paczkomat 24/7: każdy element to osobna przesyłka. Cena za każdy.
  let applicable = true;
  for (let i = 0; i < packages.length; i++) {
    const p = packages[i];
    const fit = fitsInPaczkomat(p, gabaryt);
    if (!fit.fits) {
      applicable = false;
      reasons.push(`Paczka ${i + 1}: ${fit.reasons.join("; ")}`);
    }
    basePln += PACZKOMAT_PRICE_PLN[gabaryt];
  }

  if (applicable) {
    breakdown.push({
      label: `Paczkomat Gabaryt ${gabaryt} × ${packages.length}`,
      pln: basePln,
    });
    if (fuelOn) {
      fuelPln = basePln * SURCHARGES.fuelPaczkomatPct;
      breakdown.push({
        label: `Opłata paliwowa ${(SURCHARGES.fuelPaczkomatPct * 100).toFixed(0)}%`,
        pln: fuelPln,
      });
    }
    const extra = commonSurcharges(packages.length, options, "PACZKOMAT", 0);
    breakdown.push(...extra.lines);
    surchargesPln = extra.total;
  }

  const totalNet = basePln + fuelPln + surchargesPln;
  return {
    brand: "INPOST",
    serviceCode: `INPOST_PACZKOMAT_${gabaryt}`,
    serviceLabel: `InPost Paczkomat 24/7 — Gabaryt ${gabaryt}`,
    deliveryMode: "Do paczkomatu",
    applicable,
    reasons,
    basePricePln: round(basePln),
    fuelSurchargePln: round(fuelPln),
    surchargesPln: round(surchargesPln),
    totalNetPln: round(totalNet),
    totalGrossPln: round(totalNet * (1 + VAT_RATE)),
    breakdown: breakdown.map((b) => ({ ...b, pln: round(b.pln) })),
    elementCount: packages.length,
    totalActualWeightKg: sum(packages.map((p) => maxWeight(p))),
    totalDimWeightKg: 0,
  };
}

// ─── KURIER Standard — wycena ───────────────────────────────────────

function priceInPostKurier(
  packages: PackageInput[],
  options: ShippingOptions,
): PricedService {
  const fuelOn = options.fuelSurcharge !== false;
  const breakdown: PriceBreakdownLine[] = [];
  const reasons: string[] = [];
  let basePln = 0;
  let fuelPln = 0;
  let surchargesPln = 0;
  let applicable = true;

  let autoNstCount = 0;
  for (let i = 0; i < packages.length; i++) {
    const p = packages[i];
    // Hard limity fizyczne (max waga + max wymiary). Powyżej tych progów
    // InPost odmawia przyjęcia — wycena nie ma sensu, oznaczamy applicable=false.
    if (p.weightKg > KURIER_MAX_WEIGHT_KG) {
      applicable = false;
      reasons.push(
        `Paczka ${i + 1}: waga ${p.weightKg} kg > ${KURIER_MAX_WEIGHT_KG} kg`,
      );
    }
    const sortedSides = [p.widthCm, p.heightCm, p.depthCm].sort(
      (a, b) => b - a,
    );
    const longestCm = sortedSides[0];
    const sumDimsCm = p.widthCm + p.heightCm + p.depthCm;
    if (longestCm > KURIER_MAX_LONGEST_CM) {
      applicable = false;
      reasons.push(
        `Paczka ${i + 1}: najdłuższy bok ${longestCm} cm > ${KURIER_MAX_LONGEST_CM} cm (limit InPost Kurier)`,
      );
    }
    if (sumDimsCm > KURIER_MAX_SUM_DIMS_CM) {
      applicable = false;
      reasons.push(
        `Paczka ${i + 1}: suma wymiarów ${sumDimsCm} cm > ${KURIER_MAX_SUM_DIMS_CM} cm (limit InPost Kurier)`,
      );
    }
    // InPost Kurier liczy cenę wg WAGI GABARYTOWEJ (większej z rzeczywistej
    // i wagi przestrzennej L×W×H/4000). Realnie: paczka 76×73×14 cm × 10 kg
    // rzeczywiste → 19,4 kg gabarytowe → bracket „10–20 kg" = 10,39 zł
    // (a nie 8,73 zł z bracketu „do 10 kg").
    //
    // ALE: dim weight cappujemy do 30 kg (KURIER_STANDARD_CAP_KG) — brackety
    // ≤40/≤50 mają wbudowaną opłatę ponadgabarytową, której nie chcemy
    // automatycznie wpisywać tylko dlatego że dim weight wyszedł >30. Te
    // brackety odpalają TYLKO gdy ACTUAL waga > 30 kg (= realna ponadgabar.).
    const dimWeight = (p.widthCm * p.heightCm * p.depthCm) / 4000;
    const dimCapped = Math.min(dimWeight, KURIER_STANDARD_CAP_KG);
    const chargeableKg = Math.max(p.weightKg, dimCapped);
    let perPaczka = kurierBasePln(chargeableKg);
    if (!Number.isFinite(perPaczka)) {
      perPaczka = 0;
    }
    basePln += perPaczka;

    // Auto-detekcja NST + dłużycowy (InPost rules: girth > 150, longest > 100)
    const nst = detectNstInpost(p);
    if (nst.isDluzycowy) {
      surchargesPln += SURCHARGES.dluzycowaPaczkaPln;
      breakdown.push({
        label: `Paczka ${i + 1}: dłużycowa (>120 cm)`,
        pln: SURCHARGES.dluzycowaPaczkaPln,
      });
    }
    if (nst.isNonStandard && !nst.isDluzycowy && !options.forceNonStandard) {
      autoNstCount++;
    }
  }

  if (applicable && basePln > 0) {
    breakdown.unshift({
      label: `Kurier Standard × ${packages.length}`,
      pln: basePln,
    });
    if (fuelOn) {
      fuelPln = basePln * SURCHARGES.fuelKurierPct;
      breakdown.push({
        label: `Opłata paliwowa ${(SURCHARGES.fuelKurierPct * 100).toFixed(0)}%`,
        pln: fuelPln,
      });
    }
    const extra = commonSurcharges(
      packages.length,
      options,
      "KURIER",
      autoNstCount,
    );
    breakdown.push(...extra.lines);
    surchargesPln += extra.total;
  }

  const totalNet = basePln + fuelPln + surchargesPln;
  return {
    brand: "INPOST",
    serviceCode: "INPOST_KURIER_STANDARD",
    serviceLabel: "InPost Kurier Standard",
    deliveryMode: "Do drzwi",
    applicable,
    reasons,
    basePricePln: round(basePln),
    fuelSurchargePln: round(fuelPln),
    surchargesPln: round(surchargesPln),
    totalNetPln: round(totalNet),
    totalGrossPln: round(totalNet * (1 + VAT_RATE)),
    breakdown: breakdown.map((b) => ({ ...b, pln: round(b.pln) })),
    elementCount: packages.length,
    totalActualWeightKg: sum(packages.map((p) => maxWeight(p))),
    totalDimWeightKg: 0,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

export function priceInPostAllServices(
  packages: PackageInput[],
  options: ShippingOptions,
): PricedService[] {
  return [
    priceInPostPaczkomat(packages, options, "A"),
    priceInPostPaczkomat(packages, options, "B"),
    priceInPostPaczkomat(packages, options, "C"),
    priceInPostKurier(packages, options),
  ];
}

// ─── Katalog usług (do "Pasuje do kurierów" w bibliotece pudełek) ───

const FUEL_NOTE_PACZKOMAT = `Paliwo + drogowa ${(SURCHARGES.fuelPaczkomatPct * 100).toFixed(1)}%`;
const FUEL_NOTE_KURIER = `Paliwo + drogowa ${(SURCHARGES.fuelKurierPct * 100).toFixed(1)}%`;

export function getInPostServiceCatalog(): CourierServiceCatalogEntry[] {
  return [
    {
      brand: "INPOST",
      serviceCode: "INPOST_PACZKOMAT_A",
      serviceLabel: "Paczkomat A",
      deliveryMode: "Paczkomat 24/7",
      dimensionLimits: {
        minSideMaxCm: PACZKOMAT_LIMITS.A.w,
        midSideMaxCm: PACZKOMAT_LIMITS.A.h,
        longestMaxCm: PACZKOMAT_LIMITS.A.d,
      },
      maxWeightKg: PACZKOMAT_LIMITS.A.kg,
      brackets: [
        { upToKg: PACZKOMAT_LIMITS.A.kg, pricePln: PACZKOMAT_PRICE_PLN.A },
      ],
      fuelSurchargeNote: FUEL_NOTE_PACZKOMAT,
      notes: [`Skrytka 8×38×64 cm, do 25 kg · COD/ubezp. opcjonalne`],
    },
    {
      brand: "INPOST",
      serviceCode: "INPOST_PACZKOMAT_B",
      serviceLabel: "Paczkomat B",
      deliveryMode: "Paczkomat 24/7",
      dimensionLimits: {
        minSideMaxCm: PACZKOMAT_LIMITS.B.w,
        midSideMaxCm: PACZKOMAT_LIMITS.B.h,
        longestMaxCm: PACZKOMAT_LIMITS.B.d,
      },
      maxWeightKg: PACZKOMAT_LIMITS.B.kg,
      brackets: [
        { upToKg: PACZKOMAT_LIMITS.B.kg, pricePln: PACZKOMAT_PRICE_PLN.B },
      ],
      fuelSurchargeNote: FUEL_NOTE_PACZKOMAT,
      notes: [`Skrytka 19×38×64 cm, do 25 kg`],
    },
    {
      brand: "INPOST",
      serviceCode: "INPOST_PACZKOMAT_C",
      serviceLabel: "Paczkomat C",
      deliveryMode: "Paczkomat 24/7",
      dimensionLimits: {
        minSideMaxCm: PACZKOMAT_LIMITS.C.w,
        midSideMaxCm: PACZKOMAT_LIMITS.C.h,
        longestMaxCm: PACZKOMAT_LIMITS.C.d,
      },
      maxWeightKg: PACZKOMAT_LIMITS.C.kg,
      brackets: [
        { upToKg: PACZKOMAT_LIMITS.C.kg, pricePln: PACZKOMAT_PRICE_PLN.C },
      ],
      fuelSurchargeNote: FUEL_NOTE_PACZKOMAT,
      notes: [`Skrytka 41×38×64 cm, do 25 kg · największa skrytka`],
    },
    {
      brand: "INPOST",
      serviceCode: "INPOST_KURIER_STANDARD",
      serviceLabel: "Kurier Standard",
      deliveryMode: "Kurier od drzwi do drzwi",
      // InPost Kurier nie ma twardych limitów wymiarowych w umowie —
      // tylko longest > 120 cm uruchamia dłużycowy (+100 zł).
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: KURIER_MAX_WEIGHT_KG,
      brackets: KURIER_STANDARD_RANGES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_KURIER,
      notes: [
        `Dłużycowy (>120 cm) +${SURCHARGES.dluzycowaPaczkaPln.toFixed(0)} zł`,
        `NST (niestandardowa) +${SURCHARGES.nstPaczkaPln.toFixed(0)} zł`,
      ],
    },
  ];
}

// ─── Math helpers ───────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function sum(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0);
}
