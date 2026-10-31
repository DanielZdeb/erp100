/**
 * Pure (bez db) funkcja wyliczająca ekonomikę produktu — jedno źródło prawdy
 * używane w panelu /produkty (inline + snapshot cache) oraz w server-util
 * `recomputeOneProductEconomics` (snapshot write).
 *
 * Zasada: WSZYSTKIE wejścia (produkt, ostatnia pozycja, cennik kuriera,
 * fulfillment, defaulty kanałów) są przekazywane w argumentach — nic nie
 * jest pobierane z db wewnątrz. Dzięki temu można to wywołać:
 *   • w SSR panelu (inline fallback przy cache miss)
 *   • w server-util recomputeOne (fetch + compute + upsert snapshot)
 *   • w testach / benchmarku bez bazy
 *
 * Zwrócona struktura (24 pola) jest 1:1 serializowana do `ProductEconomySnapshot.data`.
 */

import { calculateShipping } from "@/lib/shipping-calc";

export type LastItemRecord = {
  quantity: number;
  unitPriceCny: number | null;
  unitPriceUsd: number | null;
  unitPricePln: number | null;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  order: {
    cnyToPlnRate: number | null;
    usdToPlnRate: number | null;
  };
};

export type ProductForEconomics = {
  weightKg: number | null;
  cbmPerUnit: number | null;
  unitsPerPallet: number | null;
  /** Kategoria produktu — używana do detekcji dopłat per kategoria (np. blat). */
  categoryId: string | null;
  defaultUnitPriceCny: number | null;
  defaultUnitPriceUsd: number | null;
  defaultUnitPricePln: number | null;
  defaultSalePriceAllegroPln: number | null;
  defaultSalePriceSklepPln: number | null;
  defaultAllegroCommissionPct: number | null;
  defaultSklepCommissionPct: number | null;
  defaultAllegroOtherCostPln: number | null;
  defaultSklepOtherCostPln: number | null;
  defaultAllegroCustomerShippingPln: number | null;
  defaultSklepCustomerShippingPln: number | null;
  defaultSklepAdCostPln: number | null;
  /** Liczba unikalnych SKU w wysyłce klientowi:
   * 1 dla produktów całościowych, N dla KOMPONENTOWY (= liczba komponentów). */
  skuCount: number;
  shippingBoxes: {
    box: {
      id: string;
      name: string;
      internalCode: string | null;
      widthCm: number;
      heightCm: number;
      depthCm: number;
      weightKg: number | null;
      purchasePricePln: number | null;
    };
    unitsPerBox: number;
    isPrimary: boolean;
    purpose: "SHIPPING" | "FACTORY";
  }[];
};

export type CourierRateForEconomics = Parameters<typeof calculateShipping>[3][number];

export type FulfillmentForEconomics = {
  mode: "MALE" | "HURTOWE";
  warehouseType: "GROUND" | "HIGH_RACK";
  orderOpeningCost: number;
  shippingCostPerSku: number;
  palletStorageCostPerMonth: number;
  perPiecePln: number;
  ownCarrierPln: number;
};

export type SaleDefaultsForEconomics = {
  allegroCommissionPct: number | null;
  allegroCustomerShippingPln: number | null;
  allegroAdCostPln: number | null;
  sklepCommissionPct: number | null;
  sklepCustomerShippingPln: number | null;
  sklepAdCostPln: number | null;
};

export type ProductEconomicsResult = {
  lastQty: number | null;
  totalCbm: number | null;
  purchasePricePln: number | null;
  prowizjaPerUnit: number;
  cloPerUnit: number;
  logisticsPerUnit: number | null;
  productionSumPerUnit: number | null;
  totalCostPerUnit: number | null;
  lastTotalPln: number | null;
  shippingPerUnit: number | null;
  boxPricePerUnit: number | null;
  fulfillmentPerUnit: number | null;
  fulfillmentBreakdown: {
    orderOpening: number;
    mode: "MALE" | "HURTOWE";
    perSku: number;
    skuCount: number;
    perPiece: number;
    ownCarrier: number;
    palletPerUnit: number;
    palletRate: number;
    warehouseType: "GROUND" | "HIGH_RACK";
    unitsPerPallet: number | null;
    total: number;
  } | null;
  allegroPrice: number | null;
  allegroPct: number | null;
  allegroOther: number | null;
  allegroCustShip: number | null;
  allegroProfit: number | null;
  allegroMargin: number | null;
  sklepPrice: number | null;
  sklepPct: number | null;
  sklepOther: number | null;
  sklepCustShip: number | null;
  sklepAdCost: number | null;
  sklepProfit: number | null;
  sklepMargin: number | null;
};

export function computeProductEconomics(
  product: ProductForEconomics,
  lastItem: LastItemRecord | null,
  courierRates: CourierRateForEconomics[],
  fulfillment: FulfillmentForEconomics,
  /** Domyślne wartości kanałów sprzedaży — fallback gdy produkt ma null. */
  saleDefaults: SaleDefaultsForEconomics,
  logisticsPerUnit: number | null = null,
  /** Override z silnika InPost+DHL — gdy ustawione, używamy zamiast legacy
   * calculateShipping z CourierRate. */
  shippingOverridePln: number | null = null,
  /** Override ceny zakupu w PLN — używane dla ZESTAW (suma ostatnich cen
   *  zakupu komponentów). Gdy ustawione, ignorujemy lastItem/defaultPrice. */
  bundlePurchasePlnOverride: number | null = null,
  /** Dodatkowe komponenty kosztu z calc kontenera ostatniego zamówienia.
   *  Prowizja pośrednika (per-value) i cło importowe (per-product) były
   *  wcześniej wliczane do logistyki — teraz mamy je osobno. Marża musi je
   *  uwzględnić w totalCostPerUnit. */
  importExtras: {
    prowizjaPerUnit: number;
    cloPerUnit: number;
  } = { prowizjaPerUnit: 0, cloPerUnit: 0 },
): ProductEconomicsResult {
  // Wszystkie wartości PLN traktujemy jako NETTO — przeliczenie do brutto
  // robi warstwa renderu (× factor). Patrz JSX poniżej.
  // Cena zakupu — priorytet: cena jawnie wpisana na ostatniej pozycji
  // (unitPriceCny/Usd/Pln), potem dopiero defaulty produktu. Wcześniej
  // defaulty mieszały się z kursem zamówienia (np. defaultCny × order.cnyRate)
  // nawet gdy pozycja była wyceniona w USD — i panel pokazywał inną cenę
  // niż kontener. Teraz: wybieramy walutę od pozycji, defaulty tylko gdy
  // pozycja nie ma ŻADNEJ wpisanej ceny.
  const cnyRate =
    lastItem?.cnyToPlnRate ?? lastItem?.order.cnyToPlnRate ?? null;
  const usdRate =
    lastItem?.usdToPlnRate ?? lastItem?.order.usdToPlnRate ?? null;
  let purchasePricePln: number | null = null;
  if (lastItem?.unitPriceCny != null && cnyRate) {
    purchasePricePln = lastItem.unitPriceCny * cnyRate;
  } else if (lastItem?.unitPriceUsd != null && usdRate) {
    purchasePricePln = lastItem.unitPriceUsd * usdRate;
  } else if (lastItem?.unitPricePln != null && lastItem.unitPricePln > 0) {
    // PL (produkcja krajowa): cena bezpośrednio w PLN — nie ma kursu walut.
    purchasePricePln = lastItem.unitPricePln;
  } else {
    // Pozycja nie ma żadnej wpisanej ceny → fallback na defaulty produktu.
    if (product.defaultUnitPriceCny != null && cnyRate) {
      purchasePricePln = product.defaultUnitPriceCny * cnyRate;
    } else if (product.defaultUnitPriceUsd != null && usdRate) {
      purchasePricePln = product.defaultUnitPriceUsd * usdRate;
    } else if (
      product.defaultUnitPricePln != null &&
      product.defaultUnitPricePln > 0
    ) {
      purchasePricePln = product.defaultUnitPricePln;
    }
  }
  // ZESTAW: nadpisz ceną sumaryczną komponentów
  if (bundlePurchasePlnOverride != null) {
    purchasePricePln = bundlePurchasePlnOverride;
  }

  // Ilość / CBM z ostatniego zamówienia
  const lastQty = lastItem?.quantity ?? null;
  const totalCbm =
    lastQty != null && product.cbmPerUnit != null
      ? lastQty * product.cbmPerUnit
      : null;
  const lastTotalPln =
    lastQty != null && purchasePricePln != null
      ? lastQty * purchasePricePln
      : null;

  // Wysyłka — preferujemy override z silnika InPost+DHL.
  // Legacy fallback: najtańszy kurier z pinniętego box w/g CourierRate.
  // Preferujemy SHIPPING; gdy brak — używamy FACTORY (produkt wysyłany
  // w tym pudle z Chin, więc wymiary są realne dla kuriera).
  let shippingPerUnit: number | null = shippingOverridePln;
  if (shippingPerUnit == null) {
    const courierPins = product.shippingBoxes.filter(
      (pb) => pb.purpose === "SHIPPING",
    );
    const fallbackPins =
      courierPins.length > 0
        ? courierPins
        : product.shippingBoxes.filter((pb) => pb.purpose === "FACTORY");
    const shippingOptions = calculateShipping(
      { weightKg: product.weightKg },
      1,
      fallbackPins.map((pb) => ({
        box: pb.box,
        unitsPerBox: pb.unitsPerBox,
        isPrimary: pb.isPrimary,
      })),
      courierRates,
    );
    const primary =
      shippingOptions.find((o) => o.isPrimary && o.cheapest) ??
      shippingOptions.find((o) => o.cheapest) ??
      null;
    shippingPerUnit =
      primary?.cheapest && primary.unitsPerBox > 0
        ? primary.cheapest.pricePerBox / primary.unitsPerBox
        : null;
  }

  // Karton wysyłkowy per szt: cena zakupu primary box / sztuk w pudełku.
  // Bierzemy primary (jeśli ma `purchasePricePln`), inaczej najtańsze pudełko
  // z ceną — albo null gdy żadne nie ma uzupełnionej ceny.
  // TYLKO SHIPPING — FACTORY box (z Chin) nie wchodzi w koszt wysyłki kurierem.
  const shippingPins = product.shippingBoxes.filter(
    (b) => b.purpose === "SHIPPING",
  );
  const primaryBox = shippingPins.find((b) => b.isPrimary);
  const boxWithPrice = primaryBox?.box.purchasePricePln
    ? primaryBox
    : shippingPins.find((b) => b.box.purchasePricePln);
  const boxPricePerUnit =
    boxWithPrice &&
    boxWithPrice.box.purchasePricePln &&
    boxWithPrice.unitsPerBox > 0
      ? boxWithPrice.box.purchasePricePln / boxWithPrice.unitsPerBox
      : null;

  // Fulfillment per szt — model umowy E-Packman (Załącznik 2):
  //   otwarcie + perSKU × skuCount + perPiece × 1 + ownCarrier + magazyn
  // Tryb (małe/hurtowe) i typ magazynu (ziemia/regał wysoki) wybiera
  // user w ustawieniach; tu używamy aktywnych stawek.
  const palletPerUnit =
    product.unitsPerPallet && product.unitsPerPallet > 0
      ? fulfillment.palletStorageCostPerMonth / product.unitsPerPallet
      : 0;
  const fulfillRaw =
    fulfillment.orderOpeningCost +
    fulfillment.shippingCostPerSku * product.skuCount +
    fulfillment.perPiecePln +
    fulfillment.ownCarrierPln +
    palletPerUnit;
  const fulfillmentPerUnit = fulfillRaw > 0 ? fulfillRaw : null;
  const fulfillmentBreakdown = fulfillmentPerUnit
    ? {
        orderOpening: fulfillment.orderOpeningCost,
        mode: fulfillment.mode,
        perSku: fulfillment.shippingCostPerSku,
        skuCount: product.skuCount,
        perPiece: fulfillment.perPiecePln,
        ownCarrier: fulfillment.ownCarrierPln,
        palletPerUnit,
        palletRate: fulfillment.palletStorageCostPerMonth,
        warehouseType: fulfillment.warehouseType,
        unitsPerPallet: product.unitsPerPallet ?? null,
        total: fulfillRaw,
      }
    : null;

  // Suma w kolumnie „Koszty z Chin" — landed per szt:
  //   zakup + prowizja + cło + logistyka shared.
  // Identyczna logika jak w items-tab zamówienia.
  const productionSumPerUnit =
    (purchasePricePln ?? 0) +
    importExtras.prowizjaPerUnit +
    importExtras.cloPerUnit +
    (logisticsPerUnit ?? 0);
  // Pełna suma kosztów per szt (do liczenia marży Allegro/Sklep).
  const totalCostPerUnit =
    productionSumPerUnit +
    (shippingPerUnit ?? 0) +
    (boxPricePerUnit ?? 0) +
    (fulfillmentPerUnit ?? 0);

  // Allegro / Sklep — ceny domyślne traktujemy jako NETTO (zgodnie z
  // konwencją: wszędzie w systemie wpisujemy netto, brutto = × 1.23 przy
  // renderze).
  // Per-produkt overrides; gdy null → użyj systemowych wartości domyślnych.
  const allegroPrice = product.defaultSalePriceAllegroPln;
  const allegroPct =
    product.defaultAllegroCommissionPct ?? saleDefaults.allegroCommissionPct;
  const allegroOther =
    product.defaultAllegroOtherCostPln ?? saleDefaults.allegroAdCostPln;
  const allegroCustShip =
    product.defaultAllegroCustomerShippingPln ??
    saleDefaults.allegroCustomerShippingPln;
  const allegroCommissionPln =
    allegroPrice != null && allegroPct != null
      ? allegroPrice * allegroPct
      : 0;
  const allegroProfit =
    allegroPrice != null
      ? allegroPrice -
        totalCostPerUnit -
        allegroCommissionPln -
        (allegroOther ?? 0) +
        (allegroCustShip ?? 0)
      : null;
  // Marża liczona od BAZOWEJ ceny (bez wysyłki klienta), żeby porównywać jak
  // u Allegro: marża per produkt vs cena produktu.
  const allegroMargin =
    allegroPrice != null && allegroProfit != null && allegroPrice > 0
      ? (allegroProfit / allegroPrice) * 100
      : null;

  const sklepPrice = product.defaultSalePriceSklepPln;
  const sklepPct =
    product.defaultSklepCommissionPct ?? saleDefaults.sklepCommissionPct;
  const sklepOther = product.defaultSklepOtherCostPln;
  const sklepCustShip =
    product.defaultSklepCustomerShippingPln ??
    saleDefaults.sklepCustomerShippingPln;
  const sklepAdCost =
    product.defaultSklepAdCostPln ?? saleDefaults.sklepAdCostPln;
  const sklepCommissionPln =
    sklepPrice != null && sklepPct != null ? sklepPrice * sklepPct : 0;
  const sklepProfit =
    sklepPrice != null
      ? sklepPrice -
        totalCostPerUnit -
        sklepCommissionPln -
        (sklepOther ?? 0) -
        (sklepAdCost ?? 0) +
        (sklepCustShip ?? 0)
      : null;
  const sklepMargin =
    sklepPrice != null && sklepProfit != null && sklepPrice > 0
      ? (sklepProfit / sklepPrice) * 100
      : null;

  return {
    lastQty,
    totalCbm,
    purchasePricePln,
    prowizjaPerUnit: importExtras.prowizjaPerUnit,
    cloPerUnit: importExtras.cloPerUnit,
    logisticsPerUnit,
    productionSumPerUnit:
      productionSumPerUnit > 0 ? productionSumPerUnit : null,
    totalCostPerUnit: totalCostPerUnit > 0 ? totalCostPerUnit : null,
    lastTotalPln,
    shippingPerUnit,
    boxPricePerUnit,
    fulfillmentPerUnit,
    fulfillmentBreakdown,
    allegroPrice,
    allegroPct,
    allegroOther,
    allegroCustShip,
    allegroProfit,
    allegroMargin,
    sklepPrice,
    sklepPct,
    sklepOther,
    sklepCustShip,
    sklepAdCost,
    sklepProfit,
    sklepMargin,
  };
}
