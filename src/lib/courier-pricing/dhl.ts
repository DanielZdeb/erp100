/**
 * Silnik wyceny DHL eCommerce na bazie negocjowanej oferty 909575.
 *
 * Źródło: `umowy kurierskie/DHL.pdf` — sekcje:
 *  • DHL Parcel Polska (od drzwi do drzwi, do 31.5 kg)
 *  • DHL Parcel Premium (od drzwi do drzwi, gwarancja)
 *  • DHL Parcel 9 / 12 (express)
 *  • DHL Parcel Economy (POP / Locker, do 25 kg, mały gabaryt)
 *  • DHL Parcel MAX (>31.5 kg) — Paczka / Półpaleta / Paleta
 *  • Dopłata wolumetryk, NST, dłużycowy, paliwo 24.5%
 *
 * Waga przestrzenna (dimensional weight): A×B×C [cm] / 4000 = kg
 * Cena wg max(waga_rzeczywista, waga_przestrzenna).
 */

import type {
  CourierServiceCatalogEntry,
  PackageInput,
  PriceBreakdownLine,
  PricedService,
  ShippingOptions,
} from "./types";
import { detectNstDhl } from "./nst";

// ─── Stałe z umowy ──────────────────────────────────────────────────

const VAT_RATE = 0.23;
const DIM_DIVISOR = 4000;
/** Opłata paliwowa (sama) — dla paczek standardowych (longest ≤ 120 cm). */
const FUEL_SURCHARGE_PCT_STANDARD = 0.245;
/** Opłata paliwowa + drogowa łącznie (DHL nalicza obie jako jeden % od
 *  ceny bazowej) — dla paczek dłużycowych / borderline (longest > 120 cm).
 *  Kalibracja na wycenach Anety (Produkt 125×82×10 23,5kg = 22,99 zł i
 *  132×76×12,5 30kg = 24,99 zł, dłużycak 190×100×6 z docx = 33,63/86 = 39,1%). */
const FUEL_SURCHARGE_PCT_LONG = 0.404;
/** Próg „borderline dłużycaka" — powyżej tego longest DHL stosuje paliwo +
 *  drogową, ale dłużycowy 85 zł nalicza tylko powyżej `DLUZYCOWY_THRESHOLD_CM`. */
const LONG_PARCEL_THRESHOLD_CM = 120;
/** Próg dłużycowego — fee 85 zł nalicza się gdy longest > 150 cm
 *  (w nowym kontrakcie z deklaracją 500/mc, podniesiony ze 120 cm). */
const DLUZYCOWY_THRESHOLD_CM = 150;

function fuelSurchargePct(longestCm: number): number {
  return longestCm > LONG_PARCEL_THRESHOLD_CM
    ? FUEL_SURCHARGE_PCT_LONG
    : FUEL_SURCHARGE_PCT_STANDARD;
}

/** Tabele cenowe — netto, BEZ paliwa. */
const PARCEL_POLSKA_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 1, pln: 9.75 },
  { upTo: 3, pln: 9.95 },
  { upTo: 5, pln: 10.35 },
  { upTo: 10, pln: 11.75 },
  { upTo: 20, pln: 13.75 },
  { upTo: 31.5, pln: 14.95 },
];

const PARCEL_PREMIUM_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 1, pln: 12.1 },
  { upTo: 3, pln: 12.3 },
  { upTo: 5, pln: 12.7 },
  { upTo: 10, pln: 14.1 },
  { upTo: 20, pln: 16.1 },
  { upTo: 31.5, pln: 17.3 },
];

const PARCEL_9_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 1, pln: 27.5 },
  { upTo: 3, pln: 28.0 },
  { upTo: 5, pln: 29.0 },
  { upTo: 10, pln: 33.0 },
  { upTo: 20, pln: 38.5 },
  { upTo: 31.5, pln: 42.0 },
];

const PARCEL_12_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 1, pln: 18.0 },
  { upTo: 3, pln: 18.5 },
  { upTo: 5, pln: 19.0 },
  { upTo: 10, pln: 21.5 },
  { upTo: 20, pln: 25.0 },
  { upTo: 31.5, pln: 27.25 },
];

const PARCEL_ECONOMY_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 1, pln: 7.15 },
  { upTo: 3, pln: 7.35 },
  { upTo: 5, pln: 7.75 },
  { upTo: 10, pln: 8.85 },
  { upTo: 20, pln: 10.55 },
  { upTo: 25, pln: 11.55 }, // economy limit 25 kg
];

const ECONOMY_LIMITS = { wMax: 64, hMax: 38, dMax: 41, kgMax: 25 };
// Min limit Economy: 15 × 11 × 1 cm — pomijam (zwykle większe paczki)

const PARCEL_MAX_PACZKA_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 40, pln: 50.0 },
  { upTo: 50, pln: 55.0 },
];

const PARCEL_MAX_POLPALETA_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 40, pln: 73.99 },
  { upTo: 50, pln: 75.0 },
  { upTo: 100, pln: 84.0 },
  { upTo: 200, pln: 99.0 },
];

const PARCEL_MAX_PALETA_PRICES: { upTo: number; pln: number }[] = [
  { upTo: 40, pln: 94.9 },
  { upTo: 50, pln: 95.89 },
  { upTo: 100, pln: 109.89 },
  { upTo: 200, pln: 129.9 },
  { upTo: 400, pln: 139.9 },
  { upTo: 600, pln: 159.91 },
  { upTo: 800, pln: 169.9 },
  { upTo: 1000, pln: 179.91 },
];

/** Rabat za wieloelementową przesyłkę Parcel Polska (% od ceny bazowej). */
const MULTI_ELEMENT_DISCOUNT = [
  { fromCount: 2, toCount: 5, pct: 0.15 },
  { fromCount: 6, toCount: 10, pct: 0.25 },
  { fromCount: 11, toCount: 15, pct: 0.35 },
];

const SURCHARGES = {
  /** NST dla przesyłek do 31.5 kg — cena netto po rabacie umownym
   *  (cennikowa ~36 zł, rabat 72.22% → 10 zł netto). */
  nstStandardPln: 10.0,
  /** NST dla przesyłek powyżej 31.5 kg (Max) — cena netto po dodatkowym
   *  rabacie -50 zł od cennikowej. */
  nstMaxPln: 50.0,
  /** Dłużycowy (jeden wymiar > DLUZYCOWY_THRESHOLD_CM). */
  dluzycowyPln: 85.0,
  /** @deprecated zastąpione przez wolumetrykForChargeable() — bracketowane. */
  dimWeightSurchargePln: 2.0,
  /** COD — % wartości COD, min 1.50 PLN. */
  codPct: 0.015,
  codMinPln: 1.5,
  /** Ubezpieczenie do 50000 PLN — % wartości. */
  insurancePctTo50k: 0.0004, // 0.04%
  /** Ubezpieczenie > 50000 do 100000 — % wartości. */
  insurancePctTo100k: 0.0012, // 0.12% (dla MAX)
} as const;

// ─── Helpers ────────────────────────────────────────────────────────

function dimWeight(p: PackageInput): number {
  return (p.widthCm * p.heightCm * p.depthCm) / DIM_DIVISOR;
}

function chargeableWeight(p: PackageInput): number {
  return Math.max(p.weightKg, dimWeight(p));
}

/**
 * Dopłata wolumetryk — zależna od typu paczki:
 *  - Standard (longest ≤ 120 cm): flat 2 zł (zgodnie z docx Anety —
 *    chair 60×54×54 chargeable 43,74 = 2 zł).
 *  - Borderline dłużycak (120 < longest ≤ 150 cm): tier wg chargeable:
 *    ≤30 kg → 2 zł, 30–31,5 kg → 4 zł, 31,5–50 → 12 zł, 50–110 → 19, >110 → 50.
 *  - Pełny dłużycak (longest > 150 cm): osobno + dłużycowy 85 zł.
 */
function wolumetrykPln(longestCm: number, chargeableKg: number): number {
  if (longestCm <= LONG_PARCEL_THRESHOLD_CM) return 2.0;
  if (chargeableKg <= 30) return 2.0;
  if (chargeableKg <= 31.5) return 4.0;
  if (chargeableKg <= 50) return 12.0;
  if (chargeableKg <= 110) return 19.0;
  return 50.0;
}

function priceByWeight(
  weightKg: number,
  table: { upTo: number; pln: number }[],
): number | null {
  for (const row of table) {
    if (weightKg <= row.upTo) return row.pln;
  }
  return null;
}

/**
 * Cennik DHL używa "Waga elementu" zwykle interpretowanej jako CHARGEABLE
 * weight (= max wagi rzeczywistej i przestrzennej). Dla chargeable
 * przekraczającego najwyższy bracket umowy (31.5 kg → 14.95 zł) używamy
 * najwyższego bracketu jako sufitu.
 *
 * Wolumetryk +2 zł to OSOBNA dopłata (nie część bracketu).
 *
 * UWAGA: w praktyce Aneta z DHL przy wycenie dla paczek 54×54×60 (dim 43.74 kg,
 * actual 10 kg) używa bracketu "do 20" (13.75 zł) zamiast "do 31.5" (14.95 zł).
 * Nasza implementacja jest konserwatywna (wyższa) — bezpieczniejsza dla
 * planowania marży, ale przy nadaniu rzeczywiste cena może być niższa.
 */
function priceByChargeableWeight(
  chargeableKg: number,
  table: { upTo: number; pln: number }[],
): number {
  const directMatch = priceByWeight(chargeableKg, table);
  if (directMatch != null) return directMatch;
  // Chargeable > last bracket → cap na najwyższym bracket
  return table[table.length - 1].pln;
}

function fitsParcelPolska(p: PackageInput): { fits: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const longest = Math.max(p.widthCm, p.heightCm, p.depthCm);
  if (p.weightKg > 31.5)
    reasons.push(`waga ${p.weightKg} kg > 31.5 kg (Parcel Polska)`);
  if (longest > 200)
    reasons.push(`dług. ${longest} cm > 200 cm (Parcel Polska)`);
  return { fits: reasons.length === 0, reasons };
}

function fitsEconomy(p: PackageInput): { fits: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const sorted = [p.widthCm, p.heightCm, p.depthCm].sort((a, b) => a - b);
  const [small, mid, big] = sorted;
  if (small > ECONOMY_LIMITS.dMax)
    reasons.push(`min wymiar ${small} cm > ${ECONOMY_LIMITS.dMax} cm`);
  if (mid > ECONOMY_LIMITS.hMax)
    reasons.push(`średni ${mid} cm > ${ECONOMY_LIMITS.hMax} cm`);
  if (big > ECONOMY_LIMITS.wMax)
    reasons.push(`max wymiar ${big} cm > ${ECONOMY_LIMITS.wMax} cm`);
  if (p.weightKg > ECONOMY_LIMITS.kgMax)
    reasons.push(`waga ${p.weightKg} kg > ${ECONOMY_LIMITS.kgMax} kg (Economy)`);
  return { fits: reasons.length === 0, reasons };
}

function multiElementDiscount(count: number): number {
  for (const r of MULTI_ELEMENT_DISCOUNT) {
    if (count >= r.fromCount && count <= r.toCount) return r.pct;
  }
  return 0;
}

function dhlCommonSurcharges(
  packages: PackageInput[],
  options: ShippingOptions,
  variant: "STANDARD" | "MAX",
  autoNstCount: number,
): { lines: PriceBreakdownLine[]; total: number } {
  const lines: PriceBreakdownLine[] = [];
  let total = 0;

  // COD — % wartości, min 1.50 PLN
  if (options.codAmountPln && options.codAmountPln > 0) {
    const calc = options.codAmountPln * SURCHARGES.codPct;
    const cod = Math.max(SURCHARGES.codMinPln, calc);
    lines.push({
      label: `COD ${(SURCHARGES.codPct * 100).toFixed(1)}% (min ${SURCHARGES.codMinPln} zł)`,
      pln: cod,
    });
    total += cod;
  }

  // Ubezpieczenie
  if (options.insuredValuePln && options.insuredValuePln > 0) {
    const val = options.insuredValuePln;
    const pct =
      variant === "MAX" ? SURCHARGES.insurancePctTo100k : SURCHARGES.insurancePctTo50k;
    const ins = val * pct;
    lines.push({
      label: `Ubezpieczenie ${(pct * 100).toFixed(2)}% × ${val} zł`,
      pln: ins,
    });
    total += ins;
  }

  // NST — auto-wykryte lub wymuszone
  const nstCount = options.forceNonStandard
    ? packages.length
    : autoNstCount;
  if (nstCount > 0) {
    const perPln =
      variant === "MAX" ? SURCHARGES.nstMaxPln : SURCHARGES.nstStandardPln;
    const nst = perPln * nstCount;
    const labelPrefix = options.forceNonStandard ? "NST (wymuszone)" : "NST (auto-wykryte)";
    lines.push({
      label: `${labelPrefix} (${nstCount}× ${perPln.toFixed(2)} zł)`,
      pln: nst,
    });
    total += nst;
  }

  return { lines, total };
}

// ─── Generic Parcel pricing (przy każdej z 4 wag-tabel) ─────────────

function priceDhlParcel(
  packages: PackageInput[],
  options: ShippingOptions,
  table: { upTo: number; pln: number }[],
  serviceCode: string,
  serviceLabel: string,
  deliveryMode: string,
  allowMultiElement: boolean,
  applyMultiDiscount: boolean,
): PricedService {
  const fuelOn = options.fuelSurcharge !== false;
  const reasons: string[] = [];
  const breakdown: PriceBreakdownLine[] = [];
  let basePln = 0;
  let fuelPln = 0;
  /** Paliwo liczone per paczka (różne stawki dla standardu vs dłużycaka). */
  let fuelPerElementPln = 0;
  /** Czy mamy mieszane stawki paliwa (do labelu w breakdown). */
  const fuelRatesUsed = new Set<number>();
  let surchargesPln = 0;
  let totalActual = 0;
  let totalDim = 0;
  let dimWeightSurcharge = 0;
  let dluzycowyTotal = 0;
  let autoNstCount = 0;
  let cappedChargeableCount = 0;
  let applicable = true;
  // Split bazy + paliwa: standard vs NST. Rabat wieloelementowy stosuje się
  // TYLKO do standardowych paczek. NST są wyłączone z grupowania w wielopaku
  // (regulamin DHL — paczki niestandardowe rozliczane są osobno per element).
  let standardBasePln = 0;
  let nstBasePln = 0;
  let standardFuelPln = 0;
  let nstFuelPln = 0;
  let standardPackageCount = 0;

  if (!allowMultiElement && packages.length > 1) {
    applicable = false;
    reasons.push(
      `Usługa wymaga 1 elementu — przekazano ${packages.length}`,
    );
  }
  if (packages.length > 15) {
    applicable = false;
    reasons.push(`Max 15 elementów (przekazano ${packages.length})`);
  }

  for (let i = 0; i < packages.length; i++) {
    const p = packages[i];
    const fit = fitsParcelPolska(p);
    if (!fit.fits && serviceCode !== "DHL_PARCEL_ECONOMY") {
      applicable = false;
      reasons.push(`Paczka ${i + 1}: ${fit.reasons.join("; ")}`);
    }
    if (serviceCode === "DHL_PARCEL_ECONOMY") {
      const econFit = fitsEconomy(p);
      if (!econFit.fits) {
        applicable = false;
        reasons.push(`Paczka ${i + 1}: ${econFit.reasons.join("; ")}`);
      }
    }
    const actual = p.weightKg;
    const dim = dimWeight(p);
    totalActual += actual;
    totalDim += dim;
    // Walidacja limitu actual: usługa Standard ma cap actual ≤ 31.5 kg
    const topBracket = table[table.length - 1].upTo;
    if (actual > topBracket) {
      applicable = false;
      reasons.push(
        `Paczka ${i + 1}: waga rzeczywista ${actual} kg przekracza ${topBracket} kg (max dla usługi)`,
      );
    }
    // Cennik DHL używa wagi gabarytowej (chargeable). Cap na top bracket umowy.
    const chargeable = Math.max(actual, dim);
    const elementPrice = priceByChargeableWeight(chargeable, table);
    basePln += elementPrice;
    if (chargeable > topBracket && serviceCode !== "DHL_PARCEL_ECONOMY") {
      cappedChargeableCount++;
    }
    // Paliwo per paczka — różne stawki zależne od longest.
    const longest = Math.max(p.widthCm, p.heightCm, p.depthCm);
    const elementFuelRate = fuelSurchargePct(longest);
    fuelRatesUsed.add(elementFuelRate);
    const elementFuelPln = elementPrice * elementFuelRate;
    fuelPerElementPln += elementFuelPln;
    // Wolumetryk dopłata — gdy waga przestrzenna przekracza rzeczywistą.
    // Stawka: flat 2 zł dla standardu, tier dla borderline-dłużycaka.
    if (dim > actual + 0.001) {
      dimWeightSurcharge += wolumetrykPln(longest, chargeable);
    }
    // Dłużycowy fee (>DLUZYCOWY_THRESHOLD_CM, nowy kontrakt: 150 cm)
    if (longest > DLUZYCOWY_THRESHOLD_CM) {
      dluzycowyTotal += SURCHARGES.dluzycowyPln;
    }
    // Auto-NST (dla DHL Standard variant) — silnik sam wykrywa niestandardowość
    const nst = detectNstDhl(p);
    const isNst =
      options.forceNonStandard || nst.isNonStandard;
    if (nst.isNonStandard && !options.forceNonStandard) {
      autoNstCount++;
    }
    // Klasyfikacja do bucketu wielopaka. NST + dłużycowy (każda przesyłka
    // niestandardowa) wypadają z grupowania — rozliczane osobno po pełnej
    // stawce, bez rabatu skali.
    if (isNst) {
      nstBasePln += elementPrice;
      nstFuelPln += elementFuelPln;
    } else {
      standardBasePln += elementPrice;
      standardFuelPln += elementFuelPln;
      standardPackageCount++;
    }
  }

  if (applicable) {
    // Multi-element discount (Parcel Polska / Premium) — rabat na cenę
    // bazową STANDARDOWYCH paczek (NST wykluczone z wielopaka). Próg zniżki
    // liczony od liczby paczek standardowych, nie całkowitej. Paliwo dla
    // standardowych jest skalowane tym samym współczynnikiem, paliwo NST
    // zostaje bez zmian.
    if (applyMultiDiscount && standardPackageCount > 1) {
      const disc = multiElementDiscount(standardPackageCount);
      if (disc > 0) {
        const discountPln = standardBasePln * disc;
        const nstNote =
          nstBasePln > 0
            ? ` · NST (${packages.length - standardPackageCount} szt) bez rabatu`
            : "";
        breakdown.push({
          label: `Rabat wieloelementowy ${(disc * 100).toFixed(0)}% × ${standardPackageCount} standardowych${nstNote}`,
          pln: -discountPln,
        });
        standardBasePln -= discountPln;
        standardFuelPln *= 1 - disc;
        basePln = standardBasePln + nstBasePln;
        fuelPerElementPln = standardFuelPln + nstFuelPln;
      }
    }

    breakdown.unshift({
      label: `${serviceLabel} × ${packages.length}`,
      pln: round(basePln),
    });
    if (cappedChargeableCount > 0) {
      breakdown.push({
        label: `ℹ Waga gabarytowa > ${table[table.length - 1].upTo} kg — bracket capped na top umowy (rzeczywista cena DHL może być niższa)`,
        pln: 0,
      });
    }

    if (dimWeightSurcharge > 0) {
      breakdown.push({
        label: `Dopłata wolumetryk (bracket wg chargeable kg)`,
        pln: dimWeightSurcharge,
      });
      surchargesPln += dimWeightSurcharge;
    }
    if (dluzycowyTotal > 0) {
      breakdown.push({
        label: `Dłużycowy (${(dluzycowyTotal / SURCHARGES.dluzycowyPln).toFixed(0)} szt.)`,
        pln: dluzycowyTotal,
      });
      surchargesPln += dluzycowyTotal;
    }

    // Wg umowy DHL: "Podstawowa cena usługi (bez usług dodatkowych)
    // każdorazowo zostanie powiększona o wyrażoną procentowo opłatę
    // paliwową i drogową". Stawka zależna od longest paczki:
    //  - standard (≤120 cm): paliwowa 24,5 %
    //  - dłużycak (>120 cm): paliwowa+drogowa 40,4 % (łącznie)
    if (fuelOn) {
      fuelPln = fuelPerElementPln;
      const ratesArr = Array.from(fuelRatesUsed);
      const label =
        ratesArr.length === 1
          ? `Opłata paliwowa${ratesArr[0] > 0.3 ? " + drogowa" : ""} ${(ratesArr[0] * 100).toFixed(1)}% (od ceny bazowej)`
          : `Opłata paliwowa/drogowa per element (mieszane stawki: ${ratesArr.map((r) => (r * 100).toFixed(1) + "%").join(", ")})`;
      breakdown.push({ label, pln: fuelPln });
    }

    const extra = dhlCommonSurcharges(
      packages,
      options,
      "STANDARD",
      autoNstCount,
    );
    breakdown.push(...extra.lines);
    surchargesPln += extra.total;
  }

  const totalNet = basePln + fuelPln + surchargesPln;
  return {
    brand: "DHL",
    serviceCode,
    serviceLabel,
    deliveryMode,
    applicable,
    reasons,
    basePricePln: round(basePln),
    fuelSurchargePln: round(fuelPln),
    surchargesPln: round(surchargesPln),
    totalNetPln: round(totalNet),
    totalGrossPln: round(totalNet * (1 + VAT_RATE)),
    breakdown: breakdown.map((b) => ({ ...b, pln: round(b.pln) })),
    elementCount: packages.length,
    totalActualWeightKg: round(totalActual),
    totalDimWeightKg: round(totalDim),
  };
}

// ─── MAX (Paczka / Półpaleta / Paleta) ──────────────────────────────

function priceDhlMax(
  packages: PackageInput[],
  options: ShippingOptions,
  table: { upTo: number; pln: number }[],
  serviceCode: string,
  serviceLabel: string,
  deliveryMode: string,
): PricedService {
  const fuelOn = options.fuelSurcharge !== false;
  const reasons: string[] = [];
  const breakdown: PriceBreakdownLine[] = [];
  let basePln = 0;
  let fuelPln = 0;
  let surchargesPln = 0;
  let totalActual = 0;
  let applicable = true;

  if (packages.length > 5) {
    applicable = false;
    reasons.push(`Max 5 elementów (przekazano ${packages.length})`);
  }

  let autoNstCount = 0;
  for (let i = 0; i < packages.length; i++) {
    const p = packages[i];
    totalActual += p.weightKg;
    const elementPrice = priceByWeight(p.weightKg, table);
    if (elementPrice == null) {
      applicable = false;
      reasons.push(
        `Paczka ${i + 1}: waga ${p.weightKg} kg przekracza limit tabeli (max ${table[table.length - 1].upTo} kg)`,
      );
    } else {
      basePln += elementPrice;
    }
    // Auto-NST dla MAX też
    const nst = detectNstDhl(p);
    if (nst.isNonStandard && !options.forceNonStandard) {
      autoNstCount++;
    }
  }

  if (applicable) {
    breakdown.push({
      label: `${serviceLabel} × ${packages.length}`,
      pln: round(basePln),
    });
    // MAX (>31,5 kg) — zawsze paliwowa + drogowa łącznie (40,4%),
    // bo to przesyłki niestandardowe wagowo, a nie tylko gabarytowo.
    if (fuelOn) {
      fuelPln = basePln * FUEL_SURCHARGE_PCT_LONG;
      breakdown.push({
        label: `Opłata paliwowa + drogowa ${(FUEL_SURCHARGE_PCT_LONG * 100).toFixed(1)}%`,
        pln: fuelPln,
      });
    }
    const extra = dhlCommonSurcharges(packages, options, "MAX", autoNstCount);
    breakdown.push(...extra.lines);
    surchargesPln += extra.total;
  }

  const totalNet = basePln + fuelPln + surchargesPln;
  return {
    brand: "DHL",
    serviceCode,
    serviceLabel,
    deliveryMode,
    applicable,
    reasons,
    basePricePln: round(basePln),
    fuelSurchargePln: round(fuelPln),
    surchargesPln: round(surchargesPln),
    totalNetPln: round(totalNet),
    totalGrossPln: round(totalNet * (1 + VAT_RATE)),
    breakdown: breakdown.map((b) => ({ ...b, pln: round(b.pln) })),
    elementCount: packages.length,
    totalActualWeightKg: round(totalActual),
    totalDimWeightKg: 0,
  };
}

// ─── Public API ─────────────────────────────────────────────────────

export function priceDhlAllServices(
  packages: PackageInput[],
  options: ShippingOptions,
): PricedService[] {
  return [
    priceDhlParcel(
      packages,
      options,
      PARCEL_POLSKA_PRICES,
      "DHL_PARCEL_POLSKA",
      "DHL Parcel Polska",
      "Od drzwi do drzwi (D+1)",
      true,
      true,
    ),
    priceDhlParcel(
      packages,
      options,
      PARCEL_PREMIUM_PRICES,
      "DHL_PARCEL_PREMIUM",
      "DHL Parcel Premium",
      "Od drzwi do drzwi z gwarancją (D+1)",
      true,
      true,
    ),
    priceDhlParcel(
      packages,
      options,
      PARCEL_9_PRICES,
      "DHL_PARCEL_9",
      "DHL Parcel 9",
      "Do drzwi do 9:00 (D+1)",
      true,
      false,
    ),
    priceDhlParcel(
      packages,
      options,
      PARCEL_12_PRICES,
      "DHL_PARCEL_12",
      "DHL Parcel 12",
      "Do drzwi do 12:00 (D+1)",
      true,
      false,
    ),
    priceDhlParcel(
      packages,
      options,
      PARCEL_ECONOMY_PRICES,
      "DHL_PARCEL_ECONOMY",
      "DHL Parcel Economy",
      "Do punktu DHL POP / DHL Locker",
      false,
      false,
    ),
    priceDhlMax(
      packages,
      options,
      PARCEL_MAX_PACZKA_PRICES,
      "DHL_PARCEL_MAX_PACZKA",
      "DHL Parcel MAX Paczka",
      "Od drzwi do drzwi (>31.5 kg)",
    ),
    priceDhlMax(
      packages,
      options,
      PARCEL_MAX_POLPALETA_PRICES,
      "DHL_PARCEL_MAX_POLPALETA",
      "DHL Parcel MAX Półpaleta",
      "Półpaleta (burta-burta)",
    ),
    priceDhlMax(
      packages,
      options,
      PARCEL_MAX_PALETA_PRICES,
      "DHL_PARCEL_MAX_PALETA",
      "DHL Parcel MAX Paleta",
      "Pełna paleta (burta-burta)",
    ),
  ];
}

// ─── Katalog usług (do "Pasuje do kurierów" w bibliotece pudełek) ───

const FUEL_NOTE_STANDARD = `Paliwo + drogowa ${(FUEL_SURCHARGE_PCT_STANDARD * 100).toFixed(1)}% (>${LONG_PARCEL_THRESHOLD_CM} cm: ${(FUEL_SURCHARGE_PCT_LONG * 100).toFixed(1)}%)`;
const SURCHARGE_NOTES_STANDARD = [
  `NST +${SURCHARGES.nstStandardPln.toFixed(0)} zł, dłużycowy (>${DLUZYCOWY_THRESHOLD_CM} cm) +${SURCHARGES.dluzycowyPln.toFixed(0)} zł, wolumetryk +2 zł (waga przestrzenna = W×H×D/${DIM_DIVISOR})`,
];
const SURCHARGE_NOTES_MAX = [
  `NST +${SURCHARGES.nstMaxPln.toFixed(0)} zł, dłużycowy (>${DLUZYCOWY_THRESHOLD_CM} cm) +${SURCHARGES.dluzycowyPln.toFixed(0)} zł`,
];

export function getDhlServiceCatalog(): CourierServiceCatalogEntry[] {
  return [
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_POLSKA",
      serviceLabel: "DHL Parcel Polska",
      deliveryMode: "Door-to-door D+1",
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: 31.5,
      brackets: PARCEL_POLSKA_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: [
        ...SURCHARGE_NOTES_STANDARD,
        `Multi-paczka: -15% (2-5 szt), -25% (6-10 szt), -35% (11-15 szt)`,
      ],
    },
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_PREMIUM",
      serviceLabel: "DHL Parcel Premium",
      deliveryMode: "Door-to-door D+1 z gwarancją",
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: 31.5,
      brackets: PARCEL_PREMIUM_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: SURCHARGE_NOTES_STANDARD,
    },
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_9",
      serviceLabel: "DHL Parcel 9",
      deliveryMode: "Express dostawa do 9:00",
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: 31.5,
      brackets: PARCEL_9_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: SURCHARGE_NOTES_STANDARD,
    },
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_12",
      serviceLabel: "DHL Parcel 12",
      deliveryMode: "Express dostawa do 12:00",
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: 31.5,
      brackets: PARCEL_12_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: SURCHARGE_NOTES_STANDARD,
    },
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_ECONOMY",
      serviceLabel: "DHL Parcel Economy",
      deliveryMode: "POP / Locker (D+1)",
      dimensionLimits: {
        minSideMaxCm: ECONOMY_LIMITS.hMax,
        midSideMaxCm: ECONOMY_LIMITS.dMax,
        longestMaxCm: ECONOMY_LIMITS.wMax,
      },
      maxWeightKg: ECONOMY_LIMITS.kgMax,
      brackets: PARCEL_ECONOMY_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: [
        `Limit POP/Locker: ${ECONOMY_LIMITS.wMax}×${ECONOMY_LIMITS.hMax}×${ECONOMY_LIMITS.dMax} cm, do ${ECONOMY_LIMITS.kgMax} kg`,
      ],
    },
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_MAX_PACZKA",
      serviceLabel: "DHL Parcel MAX Paczka",
      deliveryMode: "Paczka 31,5 - 50 kg",
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: 50,
      brackets: PARCEL_MAX_PACZKA_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: SURCHARGE_NOTES_MAX,
    },
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_MAX_POLPALETA",
      serviceLabel: "DHL Parcel MAX Półpaleta",
      deliveryMode: "Półpaleta do 200 kg",
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: 200,
      brackets: PARCEL_MAX_POLPALETA_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: SURCHARGE_NOTES_MAX,
    },
    {
      brand: "DHL",
      serviceCode: "DHL_PARCEL_MAX_PALETA",
      serviceLabel: "DHL Parcel MAX Paleta",
      deliveryMode: "Pełna paleta do 1000 kg",
      dimensionLimits: {
        minSideMaxCm: null,
        midSideMaxCm: null,
        longestMaxCm: null,
      },
      maxWeightKg: 1000,
      brackets: PARCEL_MAX_PALETA_PRICES.map((r) => ({
        upToKg: r.upTo,
        pricePln: r.pln,
      })),
      fuelSurchargeNote: FUEL_NOTE_STANDARD,
      notes: SURCHARGE_NOTES_MAX,
    },
  ];
}

// ─── Math helpers ───────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
