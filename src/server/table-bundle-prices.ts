"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { getFulfillmentSettings } from "./system-settings";
import { quoteShippingForProduct } from "@/lib/courier-pricing/product-quote";

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
      weightKg: true,
      preferredShippingServices: true,
      excludedShippingServices: true,
      excludedShippingBrands: true,
      components: {
        select: {
          componentId: true,
          quantity: true,
        },
      },
      shippingBoxes: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          isPrimary: true,
          purpose: true,
          box: {
            select: {
              widthCm: true,
              heightCm: true,
              depthCm: true,
              weightKg: true,
              purchasePricePln: true,
            },
          },
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

  // Splaszczanie ZESTAW do leaves (proste produkty z pudlami). Per leaf
  // znajduje primary box, liczy quote kuriera. Multiplier zachowuje
  // quantity rodzicow (np. 6 krzesel × 1 paczka = 6 paczek).
  type Leaf = {
    productId: string;
    qty: number;
  };
  function flattenForShipping(productId: string, multiplier: number, visited: Set<string>): Leaf[] {
    if (visited.has(productId)) return [];
    visited.add(productId);
    const p = byId.get(productId);
    if (!p) return [];
    if (p.compositionMode === "ZESTAW" && p.components.length > 0) {
      const out: Leaf[] = [];
      for (const c of p.components) {
        out.push(...flattenForShipping(c.componentId, multiplier * c.quantity, new Set(visited)));
      }
      return out;
    }
    return [{ productId, qty: multiplier }];
  }

  function getShippingNetto(rootId: string, parentShippingBrand: string[]): number {
    const leaves = flattenForShipping(rootId, 1, new Set());
    let total = 0;
    for (const leaf of leaves) {
      const p = byId.get(leaf.productId);
      if (!p) continue;
      const pin =
        p.shippingBoxes.find((b) => b.purpose === "SHIPPING" && b.isPrimary) ??
        p.shippingBoxes.find((b) => b.purpose === "SHIPPING") ??
        p.shippingBoxes.find((b) => b.purpose === "FACTORY" && b.isPrimary) ??
        p.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
        null;
      if (!pin) continue;
      const quote = quoteShippingForProduct({
        productWeightKg: p.weightKg,
        primaryBox: {
          widthCm: pin.box.widthCm,
          heightCm: pin.box.heightCm,
          depthCm: pin.box.depthCm,
          weightKg: pin.box.weightKg,
        },
        preferredServiceCodes: [],
        excludedServiceCodes: [],
        excludedBrands: parentShippingBrand,
      });
      const cheap = quote?.cheapest?.totalNetPln;
      if (cheap == null) continue;
      total += cheap * leaf.qty;
    }
    return total;
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
    shipping: number;
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
    const shippingNetto = getShippingNetto(b.id, b.excludedShippingBrands);
    const commissionPct = b.defaultSklepCommissionPct ?? 0.01;
    const costsBrutto =
      (costNetto + shippingNetto + warehousePerUnitNetto) * 1.23;
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
      shipping: shippingNetto * 1.23,
      warehouse: warehousePerUnitNetto * 1.23,
      saleNetto,
      saleBrutto: saleBruttoRounded,
      margin: actualMargin,
    });
  }

  // revalidatePath wywołane jako fire-and-forget żeby nie blokować render
  // (Next 16 nie pozwala revalidate wewnątrz renderu strony).
  try {
    revalidatePath("/produkty");
    revalidatePath("/sprzedaz/produkty");
  } catch {
    // ignore — strona przelicz-stoly jest dynamic i tak zwroci swieze dane
  }

  return {
    ok: true as const,
    updated,
    skipped,
    results: results.sort((a, b) => b.saleBrutto - a.saleBrutto),
  };
}
