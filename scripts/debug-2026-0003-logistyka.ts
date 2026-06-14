import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { kalkulujKontener } from "../src/lib/kalkulacje";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const orders = await db.importOrder.findMany({
    where: { orderNumber: "2026-0003" },
    include: {
      costs: true,
      goodsTranches: true,
      company: { select: { name: true } },
      items: {
        include: {
          saleChannels: true,
          product: { select: { productCode: true, name: true } },
        },
      },
    },
  });

  for (const o of orders) {
    console.log(`\n=== Order ${o.orderNumber} | ${o.company?.name} | [${o.status}] ===`);
    console.log(`  containerSize=${o.containerSizeM3}  USD/PLN=${o.usdToPlnRate}`);

    let costsSum = 0;
    console.log(`  Costs (${o.costs.length}):`);
    for (const c of o.costs) {
      costsSum += c.amountPln;
      console.log(`    ${c.kind ?? "?"}  ${c.title ?? "—"}: ${c.amountPln.toFixed(2)} zł`);
    }
    console.log(`  ⌐ SUMA costs (logistyka w Płatnościach): ${costsSum.toFixed(2)} zł`);

    // Symuluj kalkulator
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

    console.log(`\n  === Wynik kalkulatora ===`);
    console.log(`  usedCbm: ${calc.usedCbm.toFixed(3)} m³`);
    console.log(`  containerCount: ${calc.containerCount}`);
    console.log(`  totalContainerVolume: ${(calc.containerCount * (o.containerSizeM3 ?? 28)).toFixed(2)} m³`);
    console.log(`  fillRate: ${(calc.fillRate * 100).toFixed(1)}%`);
    console.log(`  costPerM3: ${calc.costPerM3.toFixed(2)} zł/m³`);
    console.log(`  totalCostsPln (logistyka w calc): ${calc.totalCostsPln.toFixed(2)} zł`);

    // Allokowana logistyka per item
    let allocSum = 0;
    console.log(`\n  Allokowana logistyka per item:`);
    for (let i = 0; i < o.items.length; i++) {
      const it = o.items[i];
      const ci = calc.items[i];
      const perUnit = ci.allocatedLogisticsPln / Math.max(1, it.quantity);
      allocSum += ci.allocatedLogisticsPln;
      console.log(
        `    ${it.product.productCode.padEnd(20)} qty=${String(it.quantity).padStart(4)}  cbm/szt=${(it.cbmPerUnit ?? 0).toFixed(5)}  allocated=${ci.allocatedLogisticsPln.toFixed(2)} zł  per_szt=${perUnit.toFixed(2)} zł`,
      );
    }
    console.log(`  ⌐ SUMA allokowanej logistyki: ${allocSum.toFixed(2)} zł`);

    console.log(`\n  ⚠ ROZJAZD: costs ${costsSum.toFixed(2)} vs allocated ${allocSum.toFixed(2)} = ${(costsSum - allocSum).toFixed(2)} zł nieprzydzielone`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
