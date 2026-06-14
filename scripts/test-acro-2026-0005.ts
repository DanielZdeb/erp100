import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { kalkulujKontener } from "../src/lib/kalkulacje";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const o = await db.importOrder.findFirst({
    where: {
      orderNumber: "2026-0005",
      company: { name: { contains: "ACRO" } },
    },
    include: {
      costs: true,
      goodsTranches: true,
      items: { include: { product: { select: { productCode: true, customsDutyPct: true, category: { select: { customsDutyPct: true, parent: { select: { customsDutyPct: true } } } } } }, saleChannels: true } },
    },
  });
  if (!o) {
    console.log("Brak 2026-0005");
    return;
  }

  console.log(`Order: ${o.orderNumber}  costs=${o.costs.length} items=${o.items.length}`);
  for (const c of o.costs) {
    console.log(`  [${c.type}] ${c.notes ?? c.name ?? "—"}: ${c.amountPln.toFixed(2)} zł`);
  }

  const calc = kalkulujKontener({
    rates: {
      cnyToPln: o.cnyToPlnRate ?? 0,
      usdToPln: o.usdToPlnRate ?? 0,
      vatRate: o.vatRate ?? 0.23,
    },
    containerSizeM3: o.containerSizeM3 ?? 28,
    costs: o.costs.map((c) => ({ amountPln: c.amountPln, type: c.type })),
    goodsTranches: o.goodsTranches.map((t) => ({
      paidCurrency: t.paidCurrency,
      paidExchangeRate: t.paidExchangeRate,
      paidAmountOriginal: t.paidAmountOriginal,
    })),
    items: o.items.map((it) => ({
      quantity: it.quantity,
      cbmPerUnit: it.cbmPerUnit ?? 0,
      unitPriceUsd: it.unitPriceUsd,
      unitPriceCny: it.unitPriceCny,
      usdToPlnRate: it.usdToPlnRate,
      cnyToPlnRate: it.cnyToPlnRate,
      unitPriceIsBrutto: it.unitPriceIsBrutto,
      customsDutyPct:
        it.product.customsDutyPct ??
        it.product.category?.customsDutyPct ??
        it.product.category?.parent?.customsDutyPct ??
        null,
      saleChannels: it.saleChannels.map((sc) => ({
        channel: sc.channel,
        salePricePln: sc.salePricePln,
        commissionPct: sc.commissionPct,
        commissionFlat: sc.commissionFlat,
        shippingCostPln: sc.shippingCostPln,
        fulfillmentPln: sc.fulfillmentPln,
        packagingCostPln: sc.packagingCostPln,
        adCostPln: sc.adCostPln,
        otherCostPln: sc.otherCostPln,
        customerShippingPln: sc.customerShippingPln,
        shareOfQty: sc.shareOfQty,
      })),
    })),
  });

  console.log(`\nWynik:`);
  console.log(`  totalLandedPln: ${calc.totalLandedPln.toFixed(2)}`);
  console.log(`  totalGoodsValuePln: ${calc.totalGoodsValuePln.toFixed(2)}`);
  console.log(`  totalCustomsDutyPln: ${calc.totalCustomsDutyPln.toFixed(2)}`);
  console.log(`  costPerM3: ${calc.costPerM3.toFixed(2)} zł/m³`);
  console.log(`  containerCount: ${calc.containerCount}`);
  console.log(`  fillRate: ${(calc.fillRate * 100).toFixed(1)}%`);

  // Pokazujemy top 5 + bottom 5 (po wpływie na customsDuty)
  const sorted = [...calc.items].map((ci, idx) => ({
    code: o.items[idx].product.productCode,
    pct:
      o.items[idx].product.customsDutyPct ??
      o.items[idx].product.category?.customsDutyPct ??
      o.items[idx].product.category?.parent?.customsDutyPct ??
      0,
    goods: ci.goodsValuePln,
    logistics: ci.allocatedLogisticsPln,
    customs: ci.customsDutyPln,
    landed: ci.landedTotalPln,
    qty: o.items[idx].quantity,
  })).sort((a, b) => b.landed - a.landed);

  console.log(`\nTop 5 po landed:`);
  for (const s of sorted.slice(0, 5)) {
    console.log(
      `  ${s.code.padEnd(28)} qty=${String(s.qty).padStart(5)}  goods=${s.goods.toFixed(2).padStart(10)}  log=${s.logistics.toFixed(2).padStart(8)}  cło(pct=${(s.pct * 100).toFixed(1)}%)=${s.customs.toFixed(2).padStart(8)}  landed=${s.landed.toFixed(2)}`,
    );
  }
  console.log(`\nBottom 5 po landed:`);
  for (const s of sorted.slice(-5)) {
    console.log(
      `  ${s.code.padEnd(28)} qty=${String(s.qty).padStart(5)}  goods=${s.goods.toFixed(2).padStart(10)}  log=${s.logistics.toFixed(2).padStart(8)}  cło(pct=${(s.pct * 100).toFixed(1)}%)=${s.customs.toFixed(2).padStart(8)}  landed=${s.landed.toFixed(2)}`,
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
