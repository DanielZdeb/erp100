import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const items = await db.importOrderItem.findMany({
    where: { product: { name: { contains: "Czujka dymu" } } },
    select: {
      quantity: true,
      unitPriceUsd: true,
      cbmPerUnit: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          status: true,
          usdToPlnRate: true,
          containerSizeM3: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Pozycji w zamówieniach: ${items.length}`);
  for (const it of items) {
    console.log(
      `  ${it.order.orderNumber} [${it.order.status}]  qty=${it.quantity}  USD/szt=${it.unitPriceUsd}  cbm/szt=${it.cbmPerUnit}  kontener=${it.order.containerSizeM3}m³  kurs=${it.order.usdToPlnRate}`,
    );
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
