/**
 * Backfill rozbicia landed cost (prowizja + cło + logistyka per szt) dla
 * istniejących snapshotów ProductPriceHistory. Dotyczy wszystkich zamówień
 * w statusie W_MAGAZYNIE — przelicza je przez `kalkulujKontener` i nadpisuje
 * 3 nowe pola w snapshotach.
 *
 * Po deployu lista produktów czyta te wartości zamiast liczyć je live.
 *
 * Idempotentne — można odpalać wielokrotnie. Każdy snapshot upsertuje się
 * po (productId, importOrderId).
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { kalkulujKontener } from "../src/lib/kalkulacje";
import { resolveCustomsDutyPct } from "../src/lib/customs-duty";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Wszystkie zamówienia DOGADYWANE+ (po negocjacji) — snapshot powstaje
  // od tego punktu. Lista produktów czyta z tych snapshotów.
  const orders = await db.importOrder.findMany({
    where: {
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
    select: {
      id: true,
      orderNumber: true,
      containerSizeM3: true,
      vatRate: true,
      cnyToPlnRate: true,
      usdToPlnRate: true,
      goodsTranches: {
        select: {
          paidCurrency: true,
          paidExchangeRate: true,
          paidAmountOriginal: true,
        },
      },
      costs: { select: { amountPln: true, type: true } },
      items: {
        select: {
          id: true,
          productId: true,
          quantity: true,
          cbmPerUnit: true,
          unitPriceUsd: true,
          unitPriceCny: true,
          cnyToPlnRate: true,
          usdToPlnRate: true,
          unitPriceIsBrutto: true,
          product: {
            select: {
              customsDutyPct: true,
              category: {
                select: {
                  customsDutyPct: true,
                  parent: {
                    select: {
                      customsDutyPct: true,
                      parent: { select: { customsDutyPct: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  console.log(`Zamówień DOGADYWANE+: ${orders.length}`);

  let totalUpdated = 0;
  let totalCreated = 0;
  for (const o of orders) {
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
        cnyToPlnRate: it.cnyToPlnRate,
        usdToPlnRate: it.usdToPlnRate,
        unitPriceIsBrutto: it.unitPriceIsBrutto,
        customsDutyPct: resolveCustomsDutyPct({
          customsDutyPct: it.product?.customsDutyPct ?? null,
          category: it.product?.category ?? null,
        }),
        saleChannels: [],
      })),
    });

    for (let i = 0; i < o.items.length; i++) {
      const it = o.items[i];
      const calcIt = calc.items[i];
      if (!calcIt) continue;
      const q = Math.max(1, it.quantity);
      const effUsd = it.usdToPlnRate ?? o.usdToPlnRate ?? 0;
      const effCny = it.cnyToPlnRate ?? o.cnyToPlnRate ?? 0;
      const factoryPln =
        it.unitPriceUsd != null && it.unitPriceUsd > 0
          ? it.unitPriceUsd * effUsd
          : it.unitPriceCny != null && it.unitPriceCny > 0
            ? it.unitPriceCny * effCny
            : null;
      const data = {
        productId: it.productId,
        importOrderId: o.id,
        factoryPriceUsd: it.unitPriceUsd,
        factoryPriceCny: it.unitPriceCny,
        factoryPricePln: factoryPln,
        landedCostPln: calcIt.landedCostPerUnitPln,
        prowizjaPerUnitPln: calcIt.allocatedBrokerCommissionPln / q,
        cloPerUnitPln: calcIt.customsDutyPln / q,
        logisticsPerUnitPln: calcIt.allocatedLogisticsPln / q,
        cbmPerUnit: it.cbmPerUnit,
      };
      const existing = await db.productPriceHistory.findFirst({
        where: { productId: it.productId, importOrderId: o.id },
        select: { id: true },
      });
      if (existing) {
        await db.productPriceHistory.update({
          where: { id: existing.id },
          data,
        });
        totalUpdated++;
      } else {
        await db.productPriceHistory.create({ data });
        totalCreated++;
      }
    }
    console.log(
      `  ${o.orderNumber}: ${o.items.length} snapshotów (utworzono: ${totalCreated}, zaktualizowano: ${totalUpdated})`,
    );
  }
  console.log(
    `\n=== TOTAL: utworzono ${totalCreated}, zaktualizowano ${totalUpdated} ===`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
