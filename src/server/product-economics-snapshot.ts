"use server";

/**
 * Snapshot cache dla ekonomiki produktu — żeby panel /produkty otwierał
 * się instant zamiast liczyć wszystko za każdym razem (~30s przy 130+ produktach).
 *
 * Model danych: `ProductEconomySnapshot` 1:1 z Product, `data` to JSON z 24
 * wyliczonych liczb (patrz `src/lib/product-economics.ts` → `ProductEconomicsResult`).
 *
 * Życiorys snapshotu:
 *   • CREATE: pierwsza wizyta produktu w panelu — compute inline, upsert
 *     świeży snapshot z `isStale=false`.
 *   • STALE: hook na mutacji (edycja pozycji zamówienia, zmiana ceny
 *     produktu itd.) ustawia `isStale=true` dotknięte produkty.
 *   • GLOBAL BUMP: zmiana cennika kuriera / fulfillmentu wyzeruje wszystkim
 *     snapshotom w firmie `isStale=true` (bulk `updateMany`).
 *   • REFRESH: następna wizyta panelu po STALE/BUMP → compute + upsert
 *     ponownie (`isStale=false`).
 *
 * Fallback (brak snapshotu / isStale=true): compute w locie, zapis snapshotu
 * fire-and-forget. Pierwsza osoba która zobaczy dany produkt po STALE/BUMP
 * czeka pełen compute, kolejne lecą z cache.
 */

import type * as Prisma from "@/generated/prisma/internal/prismaNamespace";

import { db } from "@/lib/db";
import {
  computeProductEconomics,
  type ProductEconomicsResult,
} from "@/lib/product-economics";

// ─── Query inputów do compute ────────────────────────────────────────
//
// Wszystkie 5 potrzebuje computeProductEconomics: product, lastItem,
// courierRates, fulfillment, saleDefaults. Dla snapshotu per-produkt
// pobieramy JEDEN produkt + jego ostatnią pozycję zamówienia, cennik
// kuriera i ustawienia firmy. Większy koszt niż inline compute w panelu
// (który już ma wszystko w pamięci dla 130+ produktów), ale wywoływany
// tylko przy pojedynczych mutacjach (edycja ceny, upload PI itd.).
//
// NIE OBSŁUGUJE: ZESTAW (bundlePurchasePlnOverride) — bo wymaga rekursji
// po komponentach. Dla MVP snapshot ZESTAW-ów zapisuje bez override;
// panel wylicza override w locie (pozostaje szybki, bo baza komponentów
// jest już w pamięci przy renderze listy). Snapshot ZESTAW-u ma więc
// `purchasePricePln` z „własnej" ceny ZESTAW-u, nie z sumy komponentów —
// panel wymaga tego override'u przy renderze.

async function loadInputsForOneProduct(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      companyId: true,
      weightKg: true,
      cbmPerUnit: true,
      unitsPerPallet: true,
      categoryId: true,
      defaultUnitPriceCny: true,
      defaultUnitPriceUsd: true,
      defaultUnitPricePln: true,
      defaultSalePriceAllegroPln: true,
      defaultSalePriceSklepPln: true,
      defaultAllegroCommissionPct: true,
      defaultSklepCommissionPct: true,
      defaultAllegroOtherCostPln: true,
      defaultSklepOtherCostPln: true,
      defaultAllegroCustomerShippingPln: true,
      defaultSklepCustomerShippingPln: true,
      defaultSklepAdCostPln: true,
      compositionMode: true,
      // Dla ZESTAW: liczba komponentów = skuCount w fulfillmentcie
      // (osobny perSKU koszt per sztuka złożonego produktu).
      components: { select: { id: true } },
      shippingBoxes: {
        select: {
          unitsPerBox: true,
          isPrimary: true,
          purpose: true,
          box: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              widthCm: true,
              heightCm: true,
              depthCm: true,
              weightKg: true,
              purchasePricePln: true,
            },
          },
        },
      },
    },
  });
  if (!product) return null;

  const companyId = product.companyId;

  // skuCount: 1 dla całościowych, N dla KOMPONENTOWY (= liczba komponentów).
  const skuCount =
    product.compositionMode === "KOMPONENTOWY"
      ? Math.max(1, product.components.length)
      : 1;

  // lastItem: najnowsza ImportOrderItem produktu w statusie post-negotiation,
  // z priorytetem „ma jakąś wpisaną cenę". Identyczna logika jak w page.tsx.
  const items = await db.importOrderItem.findMany({
    where: {
      productId: product.id,
      order: {
        companyId,
        status: {
          in: [
            "DOGADYWANE",
            "PRODUKOWANE",
            "WYPRODUKOWANE",
            "WYSLANE",
            "ODEBRANE",
            "W_MAGAZYNIE",
          ],
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      quantity: true,
      unitPriceCny: true,
      unitPriceUsd: true,
      unitPricePln: true,
      cnyToPlnRate: true,
      usdToPlnRate: true,
      order: {
        select: {
          id: true,
          cnyToPlnRate: true,
          usdToPlnRate: true,
        },
      },
    },
  });
  const lastItemFull =
    items.find(
      (it) =>
        it.unitPriceCny != null ||
        it.unitPriceUsd != null ||
        it.unitPricePln != null,
    ) ??
    items[0] ??
    null;
  // Dla computeProductEconomics obcinamy order do pól przyjmowanych przez
  // typ `LastItemRecord` (bez order.id — nie jest w tej strukturze).
  const lastItem = lastItemFull
    ? {
        quantity: lastItemFull.quantity,
        unitPriceCny: lastItemFull.unitPriceCny,
        unitPriceUsd: lastItemFull.unitPriceUsd,
        unitPricePln: lastItemFull.unitPricePln,
        cnyToPlnRate: lastItemFull.cnyToPlnRate,
        usdToPlnRate: lastItemFull.usdToPlnRate,
        order: {
          cnyToPlnRate: lastItemFull.order.cnyToPlnRate,
          usdToPlnRate: lastItemFull.order.usdToPlnRate,
        },
      }
    : null;

  // importExtras + logisticsPerUnit — z ProductPriceHistory snapshotu
  // ostatniego zamówienia (prowizja pośrednika, cło, logistyka shared).
  // Bez tego snapshot miałby prowizja=0, cło=0, logistykę=null — a panel
  // już używa tych wartości z `econByItemId`, więc rozjechałby się.
  let importExtras = { prowizjaPerUnit: 0, cloPerUnit: 0 };
  let logisticsPerUnit: number | null = null;
  if (lastItemFull) {
    const pph = await db.productPriceHistory.findFirst({
      where: {
        productId: product.id,
        importOrderId: lastItemFull.order.id,
      },
      orderBy: { recordedAt: "desc" },
      select: {
        prowizjaPerUnitPln: true,
        cloPerUnitPln: true,
        logisticsPerUnitPln: true,
      },
    });
    if (pph) {
      importExtras = {
        prowizjaPerUnit: pph.prowizjaPerUnitPln ?? 0,
        cloPerUnit: pph.cloPerUnitPln ?? 0,
      };
      logisticsPerUnit = pph.logisticsPerUnitPln ?? null;
    }
  }

  // courierRates: wszystkie aktywne (identycznie jak w panelu /produkty).
  const courierRates = await db.courierRate.findMany({
    where: { courier: { active: true } },
    include: { courier: { select: { id: true, name: true } } },
    orderBy: { pricePln: "asc" },
  });

  // Fulfillment settings + sale defaults — oba są w `system-settings`.
  const { getFulfillmentSettings, getSaleChannelDefaults } = await import(
    "@/server/system-settings"
  );
  const [fulfillment, saleDefaults] = await Promise.all([
    getFulfillmentSettings(),
    getSaleChannelDefaults(),
  ]);

  return {
    importExtras,
    logisticsPerUnit,
    product: {
      weightKg: product.weightKg,
      cbmPerUnit: product.cbmPerUnit,
      unitsPerPallet: product.unitsPerPallet,
      categoryId: product.categoryId,
      defaultUnitPriceCny: product.defaultUnitPriceCny,
      defaultUnitPriceUsd: product.defaultUnitPriceUsd,
      defaultUnitPricePln: product.defaultUnitPricePln,
      defaultSalePriceAllegroPln: product.defaultSalePriceAllegroPln,
      defaultSalePriceSklepPln: product.defaultSalePriceSklepPln,
      defaultAllegroCommissionPct: product.defaultAllegroCommissionPct,
      defaultSklepCommissionPct: product.defaultSklepCommissionPct,
      defaultAllegroOtherCostPln: product.defaultAllegroOtherCostPln,
      defaultSklepOtherCostPln: product.defaultSklepOtherCostPln,
      defaultAllegroCustomerShippingPln:
        product.defaultAllegroCustomerShippingPln,
      defaultSklepCustomerShippingPln:
        product.defaultSklepCustomerShippingPln,
      defaultSklepAdCostPln: product.defaultSklepAdCostPln,
      skuCount,
      shippingBoxes: product.shippingBoxes,
    },
    lastItem,
    courierRates,
    fulfillment,
    saleDefaults,
    companyId,
  };
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Przelicz snapshot dla jednego produktu i zapisz. Wywoływane:
 *   • z panelu przy cache-miss (lazy)
 *   • z hook-ów mutacji synchronicznie po zapisie zmiany
 *
 * Nie-silent fail dla ZESTAW (bundle override liczony w locie w panelu).
 */
export async function recomputeOneProductEconomics(
  productId: string,
): Promise<ProductEconomicsResult | null> {
  const inputs = await loadInputsForOneProduct(productId);
  if (!inputs) return null;

  const result = computeProductEconomics(
    inputs.product,
    inputs.lastItem,
    inputs.courierRates,
    inputs.fulfillment,
    inputs.saleDefaults,
    inputs.logisticsPerUnit,
    null, // shippingOverridePln — snapshot nie zna aktualnego engine override
    null, // bundlePurchasePlnOverride — snapshot nie liczy bundli (ZESTAW)
    inputs.importExtras,
  );

  await db.productEconomySnapshot.upsert({
    where: { productId },
    update: {
      isStale: false,
      computedAt: new Date(),
      data: result as unknown as Prisma.InputJsonValue,
    },
    create: {
      productId,
      companyId: inputs.companyId,
      isStale: false,
      computedAt: new Date(),
      data: result as unknown as Prisma.InputJsonValue,
    },
  });

  return result;
}

/**
 * Oznacz jeden produkt jako „trzeba przeliczyć". Nie liczy — robi to panel
 * przy następnej wizycie (lazy). Używane w hook-ach mutacji produktu /
 * pozycji zamówienia.
 */
export async function invalidateProductEconomicsSnapshot(
  productId: string,
): Promise<void> {
  // Upsert z fallback: jak snapshotu jeszcze nie ma, utwórz pusty-stale.
  // Dzięki temu panel wie że produkt ma zacząć od compute, nawet gdy jeszcze
  // nigdy nie był otwarty.
  await db.productEconomySnapshot.upsert({
    where: { productId },
    update: { isStale: true },
    create: {
      productId,
      // companyId uzupełni się po compute — tutaj zostawiamy null jako placeholder.
      companyId: null,
      isStale: true,
      data: {} as Prisma.InputJsonValue,
    },
  });
}

/**
 * Oznacz wszystkie produkty firmy jako „trzeba przeliczyć". Używane przy
 * globalnej zmianie (cennik kuriera, ustawienia fulfillmentu, box).
 */
export async function invalidateAllProductEconomicsForCompany(
  companyId: string,
): Promise<void> {
  await db.productEconomySnapshot.updateMany({
    where: { companyId },
    data: { isStale: true },
  });
}

/**
 * Masowy helper dla hook-ów które chcą jedną mutacją oznaczyć kilka
 * produktów po productCode (np. upload PI aktualizuje N pozycji).
 */
export async function invalidateProductEconomicsSnapshotsByProductIds(
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  await db.productEconomySnapshot.updateMany({
    where: { productId: { in: productIds } },
    data: { isStale: true },
  });
}
