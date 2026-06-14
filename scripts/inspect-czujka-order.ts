import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const o = await db.importOrder.findFirst({
    where: { orderNumber: "2026-0004" },
    include: {
      costs: true,
      goodsTranches: true,
      items: { include: { saleChannels: true, product: { select: { name: true, productCode: true } } } },
    },
  });
  if (!o) {
    console.log("Brak 2026-0004");
    return;
  }
  console.log(`Order ${o.orderNumber}  [${o.status}]`);
  console.log(`  containerSizeM3=${o.containerSizeM3}  containerType=${o.containerType}`);
  console.log(`  USD/PLN=${o.usdToPlnRate}  CNY/PLN=${o.cnyToPlnRate}  VAT=${o.vatRate}`);
  console.log(`\nCosts (${o.costs.length}):`);
  for (const c of o.costs) {
    console.log(`  ${c.kind ?? "?"}  ${c.title ?? "—"}  ${c.amountPln} PLN`);
  }
  console.log(`\nTranches (${o.goodsTranches.length}):`);
  for (const t of o.goodsTranches) {
    console.log(
      `  ${t.phase}  pct=${t.percentage}  paid=${t.paid}  cur=${t.paidCurrency}  rate=${t.paidExchangeRate}  amount=${t.paidAmountOriginal}`,
    );
  }
  console.log(`\nItems (${o.items.length}):`);
  for (const it of o.items) {
    console.log(`  ${it.product.productCode}  ${it.product.name}`);
    console.log(
      `    qty=${it.quantity}  USD/szt=${it.unitPriceUsd}  CNY/szt=${it.unitPriceCny}  cbm/szt=${it.cbmPerUnit}`,
    );
    console.log(
      `    item USD rate=${it.usdToPlnRate}  item CNY rate=${it.cnyToPlnRate}`,
    );
    console.log(`    saleChannels (${it.saleChannels.length}):`);
    for (const sc of it.saleChannels) {
      console.log(
        `      ${sc.channel}  cena=${sc.salePricePln}  prow=${sc.commissionPct ?? sc.commissionFlat}  share=${sc.shareOfQty}  kurier=${sc.shippingCostPln}  fulfillment=${sc.fulfillmentPln}  inne=${sc.otherCostPln}  ad=${sc.adCostPln}  pak=${sc.packagingCostPln}  custShip=${sc.customerShippingPln}`,
      );
    }
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
