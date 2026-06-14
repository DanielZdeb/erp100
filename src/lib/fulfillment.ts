/**
 * Stałe i typy fulfillmentu — wydzielone z `server/system-settings.ts`,
 * bo plik server actions może eksportować tylko async funkcje.
 *
 * Stawki domyślne pochodzą z umowy E-Packman (Załącznik 2: Cennik).
 */

export const FULFILLMENT_MODES = ["MALE", "HURTOWE"] as const;
export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

export const WAREHOUSE_TYPES = ["GROUND", "HIGH_RACK"] as const;
export type WarehouseType = (typeof WAREHOUSE_TYPES)[number];

/**
 * Pełna konfiguracja fulfillmentu. Pola `orderOpeningCost`,
 * `shippingCostPerSku`, `palletStorageCostPerMonth` to wartości pochodne
 * (aktywne pod obecny `mode` + `warehouseType`) — utrzymane dla zgodności
 * wstecznej z konsumentami starszego API.
 */
export type FulfillmentSettings = {
  /** "MALE" = ≤25 szt/zam (3,91/0,50), "HURTOWE" = >25 (7,91/1,50). */
  mode: FulfillmentMode;
  /** Stawka otwarcia dla trybu MALE. */
  openingSmallPln: number;
  /** Stawka per SKU dla trybu MALE. */
  perSkuSmallPln: number;
  /** Stawka otwarcia dla trybu HURTOWE. */
  openingBulkPln: number;
  /** Stawka per SKU dla trybu HURTOWE. */
  perSkuBulkPln: number;
  /** Opłata za każdą sztukę w zamówieniu (umowa: 0,05 zł). */
  perPiecePln: number;
  /** Dopłata za korzystanie z własnej umowy kurierskiej (1 zł/zam). */
  ownCarrierPln: number;
  /** Typ magazynu — wybiera aktywną stawkę palety. */
  warehouseType: WarehouseType;
  /** Magazyn ziemia / regały półkowe (1,50 zł / EPal / mc). */
  palletGroundPln: number;
  /** Magazyn regały wysokiego składu (1,00 zł / EPal / mc). */
  palletHighRackPln: number;

  // ─── Pola pochodne — kompatybilne z istniejącym kodem ───
  /** Aktywna stawka otwarcia (zależna od `mode`). */
  orderOpeningCost: number;
  /** Aktywna stawka per SKU (zależna od `mode`). */
  shippingCostPerSku: number;
  /** Aktywna stawka magazynu palety / mc (zależna od `warehouseType`). */
  palletStorageCostPerMonth: number;
};

export type FulfillmentSettingsInput = {
  mode?: FulfillmentMode | string;
  openingSmallPln?: number | string;
  perSkuSmallPln?: number | string;
  openingBulkPln?: number | string;
  perSkuBulkPln?: number | string;
  perPiecePln?: number | string;
  ownCarrierPln?: number | string;
  warehouseType?: WarehouseType | string;
  palletGroundPln?: number | string;
  palletHighRackPln?: number | string;
};
