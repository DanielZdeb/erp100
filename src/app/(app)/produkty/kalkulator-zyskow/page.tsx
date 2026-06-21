import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { getFulfillmentSettings } from "@/server/system-settings";
import { quoteShippingForProduct } from "@/lib/courier-pricing/product-quote";
import { KalkulatorZyskowClient } from "./client";

export const dynamic = "force-dynamic";

export default async function KalkulatorZyskowPage() {
  const companyId = await getCurrentCompanyId();
  const fulfillment = await getFulfillmentSettings();
  const warehousePerUnitNetto =
    fulfillment.orderOpeningCost +
    fulfillment.shippingCostPerSku +
    fulfillment.perPiecePln;

  // Pobierz wszystkie produkty z cenami sprzedazy + ich koszty
  const products = await db.product.findMany({
    where: {
      companyId,
      archived: false,
      // Tylko produkty z cena sprzedazy (defaultSalePriceSklepPln) — bez
      // sensu jest wpisywac szt dla produktow ktore nie sa na sprzedaz.
      defaultSalePriceSklepPln: { not: null, gt: 0 },
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      compositionMode: true,
      weightKg: true,
      defaultUnitPricePln: true,
      defaultSalePriceSklepPln: true,
      defaultSklepCommissionPct: true,
      defaultSklepAdCostPln: true,
      defaultSklepCustomerShippingPln: true,
      preferredShippingServices: true,
      excludedShippingServices: true,
      excludedShippingBrands: true,
      category: { select: { id: true, name: true } },
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
        select: { landedCostPln: true, recordedAt: true },
        orderBy: { recordedAt: "desc" },
        take: 1,
      },
      images: {
        where: { archived: false, status: "READY" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { url: true, thumbnailWebpUrl: true },
      },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  // Recursive cost — analogiczne do table-bundle-prices
  const costCache = new Map<string, number | null>();
  function getCostNetto(id: string, visited: Set<string>): number | null {
    if (costCache.has(id)) return costCache.get(id)!;
    if (visited.has(id)) return null;
    visited.add(id);
    const p = byId.get(id);
    if (!p) return null;
    if (p.compositionMode === "ZESTAW" && p.components.length > 0) {
      let sum = 0;
      let any = false;
      for (const c of p.components) {
        const cc = getCostNetto(c.componentId, visited);
        if (cc == null) any = true;
        else sum += cc * c.quantity;
      }
      const r = any ? null : sum;
      costCache.set(id, r);
      return r;
    }
    const snap = p.priceHistory[0]?.landedCostPln;
    if (snap != null && snap > 0) {
      costCache.set(id, snap);
      return snap;
    }
    if (p.defaultUnitPricePln != null && p.defaultUnitPricePln > 0) {
      costCache.set(id, p.defaultUnitPricePln);
      return p.defaultUnitPricePln;
    }
    costCache.set(id, null);
    return null;
  }

  // Shipping per leaf (jak w table-bundle-prices)
  function flattenShip(
    id: string,
    mult: number,
    visited: Set<string>,
  ): Array<{ pid: string; qty: number }> {
    if (visited.has(id)) return [];
    visited.add(id);
    const p = byId.get(id);
    if (!p) return [];
    if (p.compositionMode === "ZESTAW" && p.components.length > 0) {
      const out: Array<{ pid: string; qty: number }> = [];
      for (const c of p.components) {
        out.push(...flattenShip(c.componentId, mult * c.quantity, new Set(visited)));
      }
      return out;
    }
    return [{ pid: id, qty: mult }];
  }

  function getShippingNetto(rootId: string, excludedBrands: string[]): number {
    const leaves = flattenShip(rootId, 1, new Set());
    let total = 0;
    for (const leaf of leaves) {
      const p = byId.get(leaf.pid);
      if (!p) continue;
      const pin =
        p.shippingBoxes.find((b) => b.purpose === "SHIPPING" && b.isPrimary) ??
        p.shippingBoxes.find((b) => b.purpose === "SHIPPING") ??
        p.shippingBoxes.find((b) => b.purpose === "FACTORY" && b.isPrimary) ??
        p.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
        null;
      if (!pin) continue;
      const q = quoteShippingForProduct({
        productWeightKg: p.weightKg,
        primaryBox: {
          widthCm: pin.box.widthCm,
          heightCm: pin.box.heightCm,
          depthCm: pin.box.depthCm,
          weightKg: pin.box.weightKg,
        },
        preferredServiceCodes: [],
        excludedServiceCodes: [],
        excludedBrands: excludedBrands,
      });
      const cheap = q?.cheapest?.totalNetPln;
      if (cheap == null) continue;
      total += cheap * leaf.qty;
    }
    return total;
  }

  // Pre-compute per produkt do widoku
  const rows = products.map((p) => {
    const costNetto = getCostNetto(p.id, new Set()) ?? 0;
    const shippingNetto = getShippingNetto(p.id, p.excludedShippingBrands);
    const sale = p.defaultSalePriceSklepPln ?? 0;
    const commPct = p.defaultSklepCommissionPct ?? 0.01;
    const adCost = p.defaultSklepAdCostPln ?? 0;
    const custShip = p.defaultSklepCustomerShippingPln ?? 0;

    return {
      id: p.id,
      productCode: p.productCode,
      name: p.name,
      image: p.images[0]?.thumbnailWebpUrl ?? p.images[0]?.url ?? null,
      categoryName: p.category?.name ?? "(brak)",
      // Wszystkie wartosci NETTO. Client mnozy × 1.23 dla brutto i × qty.
      salePriceNetto: sale,
      costNetto,
      shippingCostNetto: shippingNetto,
      warehouseCostNetto: warehousePerUnitNetto,
      commissionPct: commPct,
      adCostNetto: adCost,
      customerShipNetto: custShip,
    };
  });

  return (
    <KalkulatorZyskowClient rows={rows} />
  );
}
