import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { kalkulujKontener, effectiveRateFromTranches } from "../src/lib/kalkulacje";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const o = await db.importOrder.findFirst({
    where: { orderNumber: "ZI-2026-001" },
    include: {
      costs: true,
      goodsTranches: true,
      items: {
        include: {
          saleChannels: true,
          product: { select: { productCode: true, name: true } },
        },
      },
    },
  });
  if (!o) {
    // Spróbuj 2026-0001 lub inną — może numer odmienny
    const orders = await db.importOrder.findMany({
      where: { orderNumber: { contains: "ZI" } },
      select: { orderNumber: true, name: true, company: { select: { name: true } } },
    });
    console.log("Brak ZI-2026-001. Dostępne:");
    for (const ox of orders) console.log(" ", ox.orderNumber, "|", ox.name, "|", ox.company?.name);
    return;
  }

  console.log(`Order ${o.orderNumber}  [${o.status}]`);
  console.log(`  containerSize=${o.containerSizeM3}  USD/PLN=${o.usdToPlnRate}  CNY/PLN=${o.cnyToPlnRate}  VAT=${o.vatRate}`);

  console.log(`\nCosts (${o.costs.length}):`);
  let totalCosts = 0;
  for (const c of o.costs) {
    totalCosts += c.amountPln;
    console.log(`  ${c.title ?? c.kind ?? "?"}: ${c.amountPln.toFixed(2)} zł  (paid=${c.paid})`);
  }
  console.log(`  ⌐ SUMA costs: ${totalCosts.toFixed(2)} zł`);

  console.log(`\nTranches (${o.goodsTranches.length}):`);
  for (const t of o.goodsTranches) {
    console.log(
      `  ${t.phase}  pct=${t.percentage}  paid=${t.paid}  cur=${t.paidCurrency}  rate=${t.paidExchangeRate}  amount=${t.paidAmountOriginal}`,
    );
  }

  console.log(`\nItems (${o.items.length}):`);
  let totalGoods = 0;
  for (const it of o.items) {
    const goodsValue = it.quantity * (it.unitPriceUsd ?? 0) * (it.usdToPlnRate ?? o.usdToPlnRate ?? 0);
    totalGoods += goodsValue;
    console.log(`  ${it.product.productCode} qty=${it.quantity}  USD/szt=${it.unitPriceUsd}  cbm/szt=${it.cbmPerUnit}  goodsValue=${goodsValue.toFixed(2)} zł`);
    for (const sc of it.saleChannels) {
      const revenue = sc.salePricePln * it.quantity;
      console.log(`    [${sc.channel}] cena=${sc.salePricePln} × ${it.quantity} = ${revenue.toFixed(2)} zł  prow=${sc.commissionPct}  ad=${sc.adCostPln}  other=${sc.otherCostPln}  share=${sc.shareOfQty}  custShip=${sc.customerShippingPln}`);
    }
  }
  console.log(`\n  ⌐ SUMA goods: ${totalGoods.toFixed(2)} zł`);

  // Uruchom kalkulator i pokaż wynik
  const effectiveTrancheUsd = effectiveRateFromTranches(o.goodsTranches, "USD");
  const effectiveTrancheCny = effectiveRateFromTranches(o.goodsTranches, "CNY");
  console.log(`\n  Effective tranche rate USD=${effectiveTrancheUsd}  CNY=${effectiveTrancheCny}`);

  const calc = kalkulujKontener({
    rates: {
      cnyToPln: o.cnyToPlnRate ?? 0,
      usdToPln: o.usdToPlnRate ?? 0,
      vatRate: o.vatRate ?? 0.23,
    },
    containerSizeM3: o.containerSizeM3 ?? 28,
    costs: o.costs.map((c) => ({ amountPln: c.amountPln })),
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
      customsDutyPct: null,
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

  console.log(`\n=== Wynik kalkulatora ===`);
  console.log(`  containerCount: ${calc.containerCount}`);
  console.log(`  usedCbm: ${calc.usedCbm.toFixed(2)}`);
  console.log(`  fillRate: ${(calc.fillRate * 100).toFixed(1)}%`);
  console.log(`  totalGoodsValuePln: ${calc.totalGoodsValuePln.toFixed(2)} zł`);
  console.log(`  totalCustomsDutyPln: ${calc.totalCustomsDutyPln.toFixed(2)} zł`);
  console.log(`  totalLandedPln: ${calc.totalLandedPln.toFixed(2)} zł`);
  console.log(`  totalRevenuePln: ${calc.totalRevenuePln.toFixed(2)} zł`);
  console.log(`  totalProfitPln: ${calc.totalProfitPln.toFixed(2)} zł`);
  console.log(`  marginPct: ${calc.marginPct.toFixed(2)}%`);

  console.log(`\n  SPRAWDZENIE: revenue - landed = profit + (inne_koszty - cust_ship)?`);
  console.log(`  ${calc.totalRevenuePln.toFixed(2)} - ${calc.totalLandedPln.toFixed(2)} = ${(calc.totalRevenuePln - calc.totalLandedPln).toFixed(2)}`);
  console.log(`  totalProfit jest: ${calc.totalProfitPln.toFixed(2)}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
