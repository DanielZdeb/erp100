/**
 * Punkt wejścia do silnika wyceny kurierów.
 *
 * `priceAllServices` — zwraca wycenę WSZYSTKICH dostępnych usług InPost + DHL.
 * `recommend` — wybiera najtańszą + najszybszą + sortuje wszystkie.
 */

export type {
  CourierBrand,
  PackageInput,
  ShippingOptions,
  PricedService,
  PriceBreakdownLine,
  Recommendation,
  CourierServiceCatalogEntry,
  WeightBracket,
} from "./types";

import type {
  CourierServiceCatalogEntry,
  PackageInput,
  PricedService,
  Recommendation,
  ShippingOptions,
} from "./types";

import { getInPostServiceCatalog, priceInPostAllServices } from "./inpost";
import { getDhlServiceCatalog, priceDhlAllServices } from "./dhl";

/** Kolejność "szybkości" usług — niższy = szybszy. */
const SPEED_RANK: Record<string, number> = {
  DHL_PARCEL_9: 1,
  DHL_PARCEL_12: 2,
  DHL_PARCEL_PREMIUM: 3,
  DHL_PARCEL_POLSKA: 4,
  INPOST_KURIER_STANDARD: 5,
  INPOST_PACZKOMAT_A: 6,
  INPOST_PACZKOMAT_B: 6,
  INPOST_PACZKOMAT_C: 6,
  DHL_PARCEL_ECONOMY: 7,
  DHL_PARCEL_MAX_PACZKA: 8,
  DHL_PARCEL_MAX_POLPALETA: 9,
  DHL_PARCEL_MAX_PALETA: 10,
};

export function priceAllServices(
  packages: PackageInput[],
  options: ShippingOptions = {},
): PricedService[] {
  return [
    ...priceInPostAllServices(packages, options),
    ...priceDhlAllServices(packages, options),
  ];
}

/**
 * Zwraca pełny katalog usług kurierskich (InPost + DHL) wraz z limitami
 * wymiarowymi, przedziałami wagowymi i notatkami o paliwie/dopłatach.
 *
 * Źródło: hardcoded'owany cennik z negocjowanych umów (`inpost.ts`, `dhl.ts`).
 * Używane przez "Pasuje do kurierów" w bibliotece pudełek — żeby nie polegać
 * na ręcznie wprowadzanych `CourierRate` w DB.
 */
export function getCourierServiceCatalog(): CourierServiceCatalogEntry[] {
  return [...getInPostServiceCatalog(), ...getDhlServiceCatalog()];
}

/**
 * Sprawdza czy pudełko mieści się w limicie wymiarowym usługi.
 *
 * Zwraca null gdy pasuje, albo string z powodem odrzucenia.
 * Wymiary porównywane do limitów po sortowaniu (najkrótszy ↔ minSideMaxCm,
 * najdłuższy ↔ longestMaxCm, środkowy ↔ midSideMaxCm).
 */
export function checkServiceDimensionalFit(
  box: { widthCm: number; heightCm: number; depthCm: number },
  service: CourierServiceCatalogEntry,
): string | null {
  const sorted = [box.widthCm, box.heightCm, box.depthCm].sort((a, b) => a - b);
  const [shortest, mid, longest] = sorted;
  const lim = service.dimensionLimits;
  const reasons: string[] = [];
  if (lim.minSideMaxCm != null && shortest > lim.minSideMaxCm) {
    reasons.push(
      `najkrótszy bok ${shortest} cm > ${lim.minSideMaxCm} cm`,
    );
  }
  if (lim.midSideMaxCm != null && mid > lim.midSideMaxCm) {
    reasons.push(`średni bok ${mid} cm > ${lim.midSideMaxCm} cm`);
  }
  if (lim.longestMaxCm != null && longest > lim.longestMaxCm) {
    reasons.push(
      `najdłuższy bok ${longest} cm > ${lim.longestMaxCm} cm`,
    );
  }
  return reasons.length === 0 ? null : reasons.join(", ");
}

export function recommend(
  packages: PackageInput[],
  options: ShippingOptions = {},
): Recommendation {
  const all = priceAllServices(packages, options);
  const applicable = all.filter((s) => s.applicable);

  let cheapest: PricedService | null = null;
  for (const s of applicable) {
    if (!cheapest || s.totalNetPln < cheapest.totalNetPln) cheapest = s;
  }
  let fastest: PricedService | null = null;
  for (const s of applicable) {
    const rank = SPEED_RANK[s.serviceCode] ?? 99;
    const bestRank = fastest ? SPEED_RANK[fastest.serviceCode] ?? 99 : 99;
    if (!fastest || rank < bestRank) fastest = s;
  }

  // Sort: applicable cena rosnąco najpierw, potem nieapplicable
  const sorted = [
    ...applicable.slice().sort((a, b) => a.totalNetPln - b.totalNetPln),
    ...all.filter((s) => !s.applicable),
  ];

  return { cheapest, fastest, all: sorted };
}
