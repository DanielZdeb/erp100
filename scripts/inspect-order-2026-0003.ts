import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const order = await db.importOrder.findFirst({
    where: {
      orderNumber: "2026-0003",
      company: { name: { contains: "Zdeb" } },
    },
    select: {
      id: true,
      orderNumber: true,
      name: true,
      usdToPlnRate: true,
      cnyToPlnRate: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          product: { select: { productCode: true, defaultUnitPriceUsd: true } },
          quantity: true,
          unitPriceUsd: true,
          unitPriceCny: true,
          cbmPerUnit: true,
        },
      },
    },
  });
  if (!order) {
    console.log("Brak zamówienia");
    return;
  }
  console.log(`Order: ${order.orderNumber}  ${order.name ?? "—"}`);
  console.log(
    `Kursy: USD→PLN=${order.usdToPlnRate ?? "BRAK"}  CNY→PLN=${order.cnyToPlnRate ?? "BRAK"}`,
  );
  console.log("");
  console.log("SKU             QTY      USD/szt   CNY/szt   CBM/szt   prodDefault");
  for (const it of order.items) {
    console.log(
      it.product.productCode.padEnd(16),
      String(it.quantity).padStart(5),
      "  $" + String(it.unitPriceUsd ?? "—").padStart(8),
      "  " + String(it.unitPriceCny ?? "—").padStart(8),
      "  " + (it.cbmPerUnit?.toFixed(5) ?? "—").padStart(7),
      "   $" + String(it.product.defaultUnitPriceUsd ?? "—").padStart(8),
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
