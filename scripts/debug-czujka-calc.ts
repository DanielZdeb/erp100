import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const p = await db.product.findFirst({
    where: { name: { contains: "Czujka dymu", mode: "insensitive" } },
    select: {
      id: true,
      productCode: true,
      name: true,
      defaultUnitPriceUsd: true,
      defaultUnitPriceCny: true,
      defaultSalePriceAllegroPln: true,
      defaultSalePriceSklepPln: true,
      defaultAllegroCommissionPct: true,
      defaultSklepCommissionPct: true,
      defaultAllegroOtherCostPln: true,
      defaultSklepOtherCostPln: true,
      defaultAllegroCustomerShippingPln: true,
      defaultSklepCustomerShippingPln: true,
      defaultSklepAdCostPln: true,
      weightKg: true,
      cbmPerUnit: true,
      unitsPerBox: true,
      orderItems: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          quantity: true,
          unitPriceUsd: true,
          unitPriceCny: true,
          usdToPlnRate: true,
          cnyToPlnRate: true,
          cbmPerUnit: true,
          order: {
            select: {
              orderNumber: true,
              status: true,
              usdToPlnRate: true,
              cnyToPlnRate: true,
              containerSizeM3: true,
            },
          },
        },
      },
    },
  });
  if (!p) {
    console.log("Brak Czujka dymu");
    return;
  }
  console.log("Produkt:", p.productCode, "-", p.name);
  console.log("\nDefaulty produktu:");
  console.log(`  defaultUnitPriceUsd: ${p.defaultUnitPriceUsd}`);
  console.log(`  defaultUnitPriceCny: ${p.defaultUnitPriceCny}`);
  console.log(`  defaultSalePriceAllegroPln: ${p.defaultSalePriceAllegroPln}`);
  console.log(`  defaultSalePriceSklepPln: ${p.defaultSalePriceSklepPln}`);
  console.log(`  defaultAllegroCommissionPct: ${p.defaultAllegroCommissionPct}`);
  console.log(`  defaultSklepCommissionPct: ${p.defaultSklepCommissionPct}`);
  console.log(`  defaultAllegroOtherCostPln: ${p.defaultAllegroOtherCostPln}`);
  console.log(`  defaultSklepOtherCostPln: ${p.defaultSklepOtherCostPln}`);
  console.log(
    `  defaultAllegroCustomerShippingPln: ${p.defaultAllegroCustomerShippingPln}`,
  );
  console.log(
    `  defaultSklepCustomerShippingPln: ${p.defaultSklepCustomerShippingPln}`,
  );
  console.log(`  defaultSklepAdCostPln: ${p.defaultSklepAdCostPln}`);

  if (p.orderItems.length > 0) {
    const it = p.orderItems[0];
    console.log("\nOstatnia pozycja zamówienia:");
    console.log(
      `  ${it.order.orderNumber} [${it.order.status}]  qty=${it.quantity}`,
    );
    console.log(
      `  unitPriceUsd=${it.unitPriceUsd}  cny=${it.unitPriceCny}  cbm/szt=${it.cbmPerUnit}`,
    );
    console.log(
      `  kursy USD=${it.usdToPlnRate ?? it.order.usdToPlnRate}  CNY=${it.cnyToPlnRate ?? it.order.cnyToPlnRate}`,
    );
    const usd = it.unitPriceUsd ?? p.defaultUnitPriceUsd ?? 0;
    const usdRate = it.usdToPlnRate ?? it.order.usdToPlnRate ?? 0;
    console.log(`  → cena zakupu PLN/szt = ${usd} × ${usdRate} = ${(usd * usdRate).toFixed(2)}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
