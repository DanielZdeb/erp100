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
      items: {
        include: {
          saleChannels: true,
          product: {
            select: {
              productCode: true,
              importMode: true,
              unitsPerBox: true,
              innerBoxesPerMaster: true,
              masterBoxWidthCm: true,
              masterBoxHeightCm: true,
              masterBoxDepthCm: true,
              shippingBoxes: {
                include: { box: { select: { weightKg: true, purchasePricePln: true } } },
              },
              customsDutyPct: true,
              category: {
                select: { customsDutyPct: true, parent: { select: { customsDutyPct: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!o) {
    console.log("Brak 2026-0005");
    return;
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

  // Sum jak items-tab (netto):
  let totalQty = 0;
  let totalCbm = 0;
  let totalLandedNetto = 0;
  let totalLogisticsNetto = 0;
  let allegroRev = 0;
  let allegroProf = 0;
  let sklepRev = 0;
  let sklepProf = 0;
  for (const ic of calc.items) {
    totalQty += ic.quantity;
    totalCbm += ic.totalCbm;
    totalLandedNetto += ic.landedTotalPln;
    totalLogisticsNetto += ic.allocatedLogisticsPln;
    for (const ch of ic.channels) {
      if (ch.channel === "Allegro") {
        allegroRev += ch.channelRevenue;
        allegroProf += ch.channelProfit;
      } else if (ch.channel === "Sklep") {
        sklepRev += ch.channelRevenue;
        sklepProf += ch.channelProfit;
      }
    }
  }
  const vat = 1.23;
  console.log(`=== TOTALS dla 2026-0005 ===`);
  console.log(`  qty total: ${totalQty}`);
  console.log(`  CBM total: ${totalCbm.toFixed(2)} m³`);
  console.log(`  ─ Netto ────────────────────`);
  console.log(`  Goods value:    ${calc.totalGoodsValuePln.toFixed(2)} zł`);
  console.log(`  Logistyka:      ${totalLogisticsNetto.toFixed(2)} zł`);
  console.log(`  Cło:            ${calc.totalCustomsDutyPln.toFixed(2)} zł`);
  console.log(`  Landed total:   ${totalLandedNetto.toFixed(2)} zł  =  goods + log + cło`);
  console.log(`  ─ Brutto (× 1.23) ──────────`);
  console.log(`  Goods value:    ${(calc.totalGoodsValuePln * vat).toFixed(2)} zł`);
  console.log(`  Logistyka:      ${(totalLogisticsNetto * vat).toFixed(2)} zł  ← screen 74,318?`);
  console.log(`  Landed total:   ${(totalLandedNetto * vat).toFixed(2)} zł  ← screen 667,162?`);
  console.log(`  ─ Allegro/Sklep ─────────────`);
  console.log(`  Allegro revenue netto: ${allegroRev.toFixed(2)}  brutto: ${(allegroRev * vat).toFixed(2)}`);
  console.log(`  Allegro profit  netto: ${allegroProf.toFixed(2)}  brutto: ${(allegroProf * vat).toFixed(2)}`);
  console.log(`  Sklep   revenue netto: ${sklepRev.toFixed(2)}    brutto: ${(sklepRev * vat).toFixed(2)}`);
  console.log(`  Sklep   profit  netto: ${sklepProf.toFixed(2)}    brutto: ${(sklepProf * vat).toFixed(2)}`);
  if (allegroRev > 0) {
    console.log(`  Allegro margin: ${((allegroProf / allegroRev) * 100).toFixed(1)}%`);
  }
  if (sklepRev > 0) {
    console.log(`  Sklep   margin: ${((sklepProf / sklepRev) * 100).toFixed(1)}%`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
