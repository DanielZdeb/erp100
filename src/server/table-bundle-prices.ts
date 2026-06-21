"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { getFulfillmentSettings } from "./system-settings";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji.");
  return session.user;
}

/**
 * Ustawia defaultSalePriceSklepPln dla wszystkich zestawow stolowych
 * (compositionMode=ZESTAW, name LIKE 'Zestaw stół%') tak, zeby marza
 * sklep wyniosla ~targetMarginPct (default 50%).
 *
 * Kalkulacja per zestaw:
 *  - cost_per_unit_netto: suma kosztow komponentow rekursywnie
 *    (snapshot ProductPriceHistory.landedCostPln dla importu, lub
 *    defaultUnitPricePln dla PL/lokalnych; zagniezdzone ZESTAW splaszczane)
 *  - magazyn_netto = fulfillment per sztuke (otwarcie + SKU + perPiece)
 *  - costs_brutto = (cost + magazyn) × 1.23
 *  - sale_brutto = costs_brutto / (1 - targetMarginPct - commission_pct)
 *  - round up do X9 (np. 4693 -> 4699)
 *  - zapisuje sale_netto = sale_brutto / 1.23
 *
 * UWAGA: nie wlicza wysylki kuriera (zalozenie: zestaw stolowy wysylany
 * na palecie, klient placi wysylke osobno przez defaultSklepCustomerShippingPln).
 */
export async function recomputeTableBundlePricesAction(
  targetMarginPct: number = 0.5,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();
  const fulfillment = await getFulfillmentSettings();
  const warehousePerUnitNetto =
    fulfillment.orderOpeningCost +
    fulfillment.shippingCostPerSku +
    fulfillment.perPiecePln;

  // Pobierz WSZYSTKIE produkty firmy + ich snapshoty i komponenty —
  // zeby rekursja kosztow zestawow byla offline (bez wielokrotnych queries).
  const products = await db.product.findMany({
    where: { companyId },
    select: {
      id: true,
      productCode: true,
      name: true,
      compositionMode: true,
      defaultUnitPricePln: true,
      defaultSklepCommissionPct: true,
      components: {
        select: {
          componentId: true,
          quantity: true,
        },
      },
      priceHistory: {
        select: {
          landedCostPln: true,
          recordedAt: true,
        },
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
    },
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  // Cache rekursji + ochrona przed cyklami.
  const costCache = new Map<string, number | null>();
  function getCostNetto(productId: string, visited: Set<string>): number | null {
    if (costCache.has(productId)) return costCache.get(productId)!;
    if (visited.has(productId)) return null;
    visited.add(productId);

    const p = byId.get(productId);
    if (!p) return null;

    // 1) ZESTAW -> rekursja po komponentach.
    if (p.compositionMode === "ZESTAW" && p.components.length > 0) {
      let sum = 0;
      let anyMissing = false;
      for (const c of p.components) {
        const cc = getCostNetto(c.componentId, visited);
        if (cc == null) {
          anyMissing = true;
        } else {
          sum += cc * c.quantity;
        }
      }
      const result = anyMissing ? null : sum;
      costCache.set(productId, result);
      return result;
    }

    // 2) Snapshot landed (import).
    const snap = p.priceHistory[0]?.landedCostPln;
    if (snap != null && snap > 0) {
      costCache.set(productId, snap);
      return snap;
    }

    // 3) PL: defaultUnitPricePln (cena zakupu netto, bez logistyki).
    if (p.defaultUnitPricePln != null && p.defaultUnitPricePln > 0) {
      costCache.set(productId, p.defaultUnitPricePln);
      return p.defaultUnitPricePln;
    }

    costCache.set(productId, null);
    return null;
  }

  // Filtr docelowy: zestawy stolowe.
  const tableBundles = products.filter(
    (p) =>
      p.compositionMode === "ZESTAW" &&
      (p.name.toLowerCase().startsWith("zestaw stół") ||
        p.name.toLowerCase().startsWith("zestaw stol")),
  );

  const results: Array<{
    code: string;
    name: string;
    cost: number;
    warehouse: number;
    saleNetto: number;
    saleBrutto: number;
    margin: number;
  }> = [];
  let updated = 0;
  let skipped = 0;

  for (const b of tableBundles) {
    const costNetto = getCostNetto(b.id, new Set<string>());
    if (costNetto == null) {
      skipped++;
      continue;
    }
    const commissionPct = b.defaultSklepCommissionPct ?? 0.01;
    const costsBrutto = (costNetto + warehousePerUnitNetto) * 1.23;
    const denom = 1 - targetMarginPct - commissionPct;
    if (denom <= 0) {
      skipped++;
      continue;
    }
    const saleBruttoTarget = costsBrutto / denom;
    const saleBruttoRounded =
      Math.ceil((saleBruttoTarget + 1) / 10) * 10 - 1;
    const saleNetto =
      Math.round((saleBruttoRounded / 1.23) * 100) / 100;

    await db.product.update({
      where: { id: b.id },
      data: { defaultSalePriceSklepPln: saleNetto },
    });

    const actualMargin =
      (saleBruttoRounded -
        costsBrutto -
        saleBruttoRounded * commissionPct) /
      saleBruttoRounded;

    updated++;
    results.push({
      code: b.productCode,
      name: b.name,
      cost: costNetto * 1.23,
      warehouse: warehousePerUnitNetto * 1.23,
      saleNetto,
      saleBrutto: saleBruttoRounded,
      margin: actualMargin,
    });
  }

  revalidatePath("/produkty");
  revalidatePath("/sprzedaz/produkty");

  return {
    ok: true as const,
    updated,
    skipped,
    results: results.sort((a, b) => b.saleBrutto - a.saleBrutto),
  };
}
