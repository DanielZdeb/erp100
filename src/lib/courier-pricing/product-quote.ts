/**
 * Wycena wysyłki dla pojedynczego produktu — używana w trading row
 * (lista produktów, karta produktu) do zastąpienia legacy
 * `calculateShipping` z CourierRate.
 *
 * Bierze primary box + waga produktu + preferowane usługi z produktu.
 * Zakłada 1 produkt na paczkę (typowa wysyłka B2C). Dla
 * wieloproduktowych zamówień użyj `priceAllServices` bezpośrednio.
 */

import { priceAllServices } from "./index";
import type { PricedService } from "./types";

export type ProductBox = {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  weightKg: number | null;
};

export type ProductShippingQuote = {
  /** Cena którą pokazujemy domyślnie w kolumnie „Wysyłka". */
  primary: PricedService | null;
  /** Najtańsza applicable (do podświetlenia korony). */
  cheapest: PricedService | null;
  /** Wszystkie applicable usługi posortowane po cenie. */
  applicable: PricedService[];
  /** Czy `primary` to wynik preferencji usera (gwiazdka). */
  primaryIsPreferred: boolean;
};

export function quoteShippingForProduct(input: {
  productWeightKg: number | null;
  primaryBox: ProductBox | null;
  preferredServiceCodes: string[];
  /** Lista kodów usług WYŁĄCZONYCH dla tego produktu — silnik je odrzuca. */
  excludedServiceCodes?: string[];
  /** Lista marek (INPOST / DHL) wyłączonych w całości dla tego produktu. */
  excludedBrands?: string[];
}): ProductShippingQuote | null {
  if (!input.primaryBox) {
    return null;
  }
  const boxWeight = input.primaryBox.weightKg ?? 0;
  const productWeight = input.productWeightKg ?? 0;
  // 1 sztuka produktu w paczce
  const packageWeight = boxWeight + productWeight;
  if (
    input.primaryBox.widthCm <= 0 ||
    input.primaryBox.heightCm <= 0 ||
    input.primaryBox.depthCm <= 0 ||
    packageWeight <= 0
  ) {
    return null;
  }

  const allServices = priceAllServices(
    [
      {
        widthCm: input.primaryBox.widthCm,
        heightCm: input.primaryBox.heightCm,
        depthCm: input.primaryBox.depthCm,
        weightKg: packageWeight,
      },
    ],
    {},
  );
  const excludedSet = new Set(input.excludedServiceCodes ?? []);
  const excludedBrandSet = new Set(input.excludedBrands ?? []);
  const applicable = allServices
    .filter((s) => s.applicable)
    .filter(
      (s) => !excludedSet.has(s.serviceCode) && !excludedBrandSet.has(s.brand),
    )
    .sort((a, b) => a.totalNetPln - b.totalNetPln);

  const cheapest = applicable[0] ?? null;
  const preferredSet = new Set(input.preferredServiceCodes);
  const preferredApplicable = applicable.find((s) => preferredSet.has(s.serviceCode));

  const primary = preferredApplicable ?? cheapest;
  const primaryIsPreferred = !!preferredApplicable;

  return {
    primary,
    cheapest,
    applicable,
    primaryIsPreferred,
  };
}
