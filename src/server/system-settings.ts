"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId, tryGetCurrentCompanyId } from "@/lib/tenant";
import {
  CONTAINER_M3,
  CONTAINER_TYPES,
  type ContainerTypeT,
} from "@/lib/container-types";
import {
  FULFILLMENT_MODES,
  WAREHOUSE_TYPES,
  type FulfillmentMode,
  type FulfillmentSettings,
  type FulfillmentSettingsInput,
  type WarehouseType,
} from "@/lib/fulfillment";
import type {
  SaleChannelDefaults,
  SaleChannelDefaultsInput,
} from "@/lib/sale-channel-defaults";

const KEY_DEFAULT_CONTAINER = "default_container_type";

// Legacy keys — używane jako fallback do uzupełnienia nowych pól.
const KEY_SHIPPING_COST_PER_SKU = "fulfillment_shipping_cost_per_sku";
const KEY_PALLET_STORAGE_COST_PER_MONTH =
  "fulfillment_pallet_storage_cost_per_month";
const KEY_ORDER_OPENING_COST = "fulfillment_order_opening_cost";

// Nowe klucze (umowa E-Packman, Załącznik 2).
const KEY_MODE = "fulfillment_mode";
const KEY_OPENING_SMALL = "fulfillment_opening_small";
const KEY_PER_SKU_SMALL = "fulfillment_per_sku_small";
const KEY_OPENING_BULK = "fulfillment_opening_bulk";
const KEY_PER_SKU_BULK = "fulfillment_per_sku_bulk";
const KEY_PER_PIECE = "fulfillment_per_piece";
const KEY_OWN_CARRIER = "fulfillment_own_carrier";
const KEY_WAREHOUSE_TYPE = "fulfillment_warehouse_type";
const KEY_PALLET_GROUND = "fulfillment_pallet_ground";
const KEY_PALLET_HIGH_RACK = "fulfillment_pallet_high_rack";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

export async function getDefaultContainerType(): Promise<ContainerTypeT> {
  const companyId = await tryGetCurrentCompanyId();
  const row = await db.systemConfig.findFirst({
    where: { companyId, key: KEY_DEFAULT_CONTAINER },
  });
  const raw = row?.value;
  if (raw && (CONTAINER_TYPES as readonly string[]).includes(raw)) {
    return raw as ContainerTypeT;
  }
  return "TWENTY_FT";
}

/** Upsert klucza systemConfig — scope: bieżąca firma użytkownika. */
async function upsertSystemConfig(key: string, value: string) {
  const companyId = await getCurrentCompanyId();
  const existing = await db.systemConfig.findFirst({
    where: { companyId, key },
  });
  if (existing) {
    await db.systemConfig.update({
      where: { id: existing.id },
      data: { value },
    });
  } else {
    await db.systemConfig.create({ data: { companyId, key, value } });
  }
}

export async function getDefaultContainerM3(): Promise<number> {
  const type = await getDefaultContainerType();
  return CONTAINER_M3[type] ?? 28;
}

export async function setDefaultContainerTypeAction(
  type: ContainerTypeT,
): Promise<{ ok: true }> {
  await requireUser();
  if (!(CONTAINER_TYPES as readonly string[]).includes(type)) {
    throw new Error("Nieprawidłowy typ kontenera.");
  }
  await upsertSystemConfig(KEY_DEFAULT_CONTAINER, type);
  revalidatePath("/ustawienia");
  revalidatePath("/zamowienia/nowy");
  return { ok: true };
}

// ─── Fulfillment ─────────────────────────────────────────────────────
// Typy i stałe definiowane są w `@/lib/fulfillment` (re-eksport powyżej).

async function getRow(key: string): Promise<string | null> {
  const companyId = await tryGetCurrentCompanyId();
  const row = await db.systemConfig.findFirst({
    where: { companyId, key },
  });
  return row?.value ?? null;
}

async function getFloatConfig(key: string, fallback = 0): Promise<number> {
  const raw = await getRow(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function getEnumConfig<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): Promise<T> {
  const raw = await getRow(key);
  if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
  return fallback;
}

export async function getFulfillmentSettings(): Promise<FulfillmentSettings> {
  // Legacy fallback: jeśli nowe klucze są puste, użyj starych jako wartości
  // wstępne — żeby migracja nie wykasowała danych dotychczas wpisanych.
  const [
    legacyOpening,
    legacyPerSku,
    legacyPallet,
    mode,
    openingSmall,
    perSkuSmall,
    openingBulk,
    perSkuBulk,
    perPiece,
    ownCarrier,
    warehouseType,
    palletGround,
    palletHighRack,
  ] = await Promise.all([
    getFloatConfig(KEY_ORDER_OPENING_COST, 3.91),
    getFloatConfig(KEY_SHIPPING_COST_PER_SKU, 0.5),
    getFloatConfig(KEY_PALLET_STORAGE_COST_PER_MONTH, 1.5),
    getEnumConfig(KEY_MODE, FULFILLMENT_MODES, "MALE"),
    getFloatConfig(KEY_OPENING_SMALL, -1),
    getFloatConfig(KEY_PER_SKU_SMALL, -1),
    getFloatConfig(KEY_OPENING_BULK, -1),
    getFloatConfig(KEY_PER_SKU_BULK, -1),
    getFloatConfig(KEY_PER_PIECE, -1),
    getFloatConfig(KEY_OWN_CARRIER, -1),
    getEnumConfig(KEY_WAREHOUSE_TYPE, WAREHOUSE_TYPES, "GROUND"),
    getFloatConfig(KEY_PALLET_GROUND, -1),
    getFloatConfig(KEY_PALLET_HIGH_RACK, -1),
  ]);

  // Defaulty z umowy E-Packman + propagacja legacy do "MALE".
  const openingSmallFinal =
    openingSmall >= 0 ? openingSmall : legacyOpening || 3.91;
  const perSkuSmallFinal = perSkuSmall >= 0 ? perSkuSmall : legacyPerSku || 0.5;
  const openingBulkFinal = openingBulk >= 0 ? openingBulk : 7.91;
  const perSkuBulkFinal = perSkuBulk >= 0 ? perSkuBulk : 1.5;
  const perPieceFinal = perPiece >= 0 ? perPiece : 0.05;
  const ownCarrierFinal = ownCarrier >= 0 ? ownCarrier : 1.0;
  const palletGroundFinal =
    palletGround >= 0 ? palletGround : legacyPallet || 1.5;
  const palletHighRackFinal = palletHighRack >= 0 ? palletHighRack : 1.0;

  const activeOpening =
    mode === "HURTOWE" ? openingBulkFinal : openingSmallFinal;
  const activePerSku = mode === "HURTOWE" ? perSkuBulkFinal : perSkuSmallFinal;
  const activePallet =
    warehouseType === "HIGH_RACK" ? palletHighRackFinal : palletGroundFinal;

  return {
    mode,
    openingSmallPln: openingSmallFinal,
    perSkuSmallPln: perSkuSmallFinal,
    openingBulkPln: openingBulkFinal,
    perSkuBulkPln: perSkuBulkFinal,
    perPiecePln: perPieceFinal,
    ownCarrierPln: ownCarrierFinal,
    warehouseType,
    palletGroundPln: palletGroundFinal,
    palletHighRackPln: palletHighRackFinal,
    orderOpeningCost: activeOpening,
    shippingCostPerSku: activePerSku,
    palletStorageCostPerMonth: activePallet,
  };
}

export async function setFulfillmentSettingsAction(
  input: FulfillmentSettingsInput,
): Promise<{ ok: true }> {
  await requireUser();

  const nonNegative = (raw: number | string | undefined): number | null => {
    if (raw === undefined || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, n);
  };

  const mode =
    (FULFILLMENT_MODES as readonly string[]).includes(String(input.mode))
      ? (input.mode as FulfillmentMode)
      : null;
  const warehouseType = (WAREHOUSE_TYPES as readonly string[]).includes(
    String(input.warehouseType),
  )
    ? (input.warehouseType as WarehouseType)
    : null;

  const writes: { key: string; value: string }[] = [];
  if (mode) writes.push({ key: KEY_MODE, value: mode });
  if (warehouseType)
    writes.push({ key: KEY_WAREHOUSE_TYPE, value: warehouseType });

  const float = (key: string, raw: number | string | undefined) => {
    const v = nonNegative(raw);
    if (v != null) writes.push({ key, value: String(v) });
  };
  float(KEY_OPENING_SMALL, input.openingSmallPln);
  float(KEY_PER_SKU_SMALL, input.perSkuSmallPln);
  float(KEY_OPENING_BULK, input.openingBulkPln);
  float(KEY_PER_SKU_BULK, input.perSkuBulkPln);
  float(KEY_PER_PIECE, input.perPiecePln);
  float(KEY_OWN_CARRIER, input.ownCarrierPln);
  float(KEY_PALLET_GROUND, input.palletGroundPln);
  float(KEY_PALLET_HIGH_RACK, input.palletHighRackPln);

  const companyId = await getCurrentCompanyId();
  await db.$transaction(async (tx) => {
    for (const w of writes) {
      const existing = await tx.systemConfig.findFirst({
        where: { companyId, key: w.key },
      });
      if (existing) {
        await tx.systemConfig.update({
          where: { id: existing.id },
          data: { value: w.value },
        });
      } else {
        await tx.systemConfig.create({
          data: { companyId, key: w.key, value: w.value },
        });
      }
    }
  });

  revalidatePath("/ustawienia");
  revalidatePath("/produkty");
  return { ok: true };
}

// ─── Domyślne ustawienia kanałów sprzedaży (Allegro / Sklep) ─────────

const KEY_ALLEGRO_COMMISSION = "sale_default_allegro_commission";
const KEY_ALLEGRO_CUSTOMER_SHIPPING = "sale_default_allegro_customer_shipping";
const KEY_ALLEGRO_AD_COST = "sale_default_allegro_ad_cost";
const KEY_SKLEP_COMMISSION = "sale_default_sklep_commission";
const KEY_SKLEP_CUSTOMER_SHIPPING = "sale_default_sklep_customer_shipping";
const KEY_SKLEP_AD_COST = "sale_default_sklep_ad_cost";

/**
 * Pobiera systemowe wartości domyślne kanałów sprzedaży. Zwraca `null` dla
 * pól nieustawionych — wtedy produkt sam musi mieć wartość.
 */
export async function getSaleChannelDefaults(): Promise<SaleChannelDefaults> {
  const [aCom, aShip, aAd, sCom, sShip, sAd] = await Promise.all([
    getRow(KEY_ALLEGRO_COMMISSION),
    getRow(KEY_ALLEGRO_CUSTOMER_SHIPPING),
    getRow(KEY_ALLEGRO_AD_COST),
    getRow(KEY_SKLEP_COMMISSION),
    getRow(KEY_SKLEP_CUSTOMER_SHIPPING),
    getRow(KEY_SKLEP_AD_COST),
  ]);
  const parse = (raw: string | null): number | null => {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    allegroCommissionPct: parse(aCom),
    allegroCustomerShippingPln: parse(aShip),
    allegroAdCostPln: parse(aAd),
    sklepCommissionPct: parse(sCom),
    sklepCustomerShippingPln: parse(sShip),
    sklepAdCostPln: parse(sAd),
  };
}

export async function setSaleChannelDefaultsAction(
  input: SaleChannelDefaultsInput,
): Promise<{ ok: true }> {
  await requireUser();

  const parseNonNeg = (
    raw: number | string | null | undefined,
  ): string | null => {
    if (raw === undefined || raw === null || raw === "") return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return String(Math.max(0, n));
  };

  const writes: { key: string; value: string | null }[] = [
    { key: KEY_ALLEGRO_COMMISSION, value: parseNonNeg(input.allegroCommissionPct) },
    {
      key: KEY_ALLEGRO_CUSTOMER_SHIPPING,
      value: parseNonNeg(input.allegroCustomerShippingPln),
    },
    { key: KEY_ALLEGRO_AD_COST, value: parseNonNeg(input.allegroAdCostPln) },
    { key: KEY_SKLEP_COMMISSION, value: parseNonNeg(input.sklepCommissionPct) },
    {
      key: KEY_SKLEP_CUSTOMER_SHIPPING,
      value: parseNonNeg(input.sklepCustomerShippingPln),
    },
    { key: KEY_SKLEP_AD_COST, value: parseNonNeg(input.sklepAdCostPln) },
  ];

  const companyId = await getCurrentCompanyId();
  await db.$transaction(async (tx) => {
    for (const w of writes) {
      if (w.value == null) {
        await tx.systemConfig.deleteMany({
          where: { companyId, key: w.key },
        });
      } else {
        const existing = await tx.systemConfig.findFirst({
          where: { companyId, key: w.key },
        });
        if (existing) {
          await tx.systemConfig.update({
            where: { id: existing.id },
            data: { value: w.value },
          });
        } else {
          await tx.systemConfig.create({
            data: { companyId, key: w.key, value: w.value },
          });
        }
      }
    }
  });

  revalidatePath("/ustawienia");
  revalidatePath("/produkty");
  return { ok: true };
}
