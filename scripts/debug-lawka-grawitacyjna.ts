import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const p = await db.product.findFirst({
    where: { productCode: "INVERFIT-S-BLACK" },
    select: {
      id: true,
      productCode: true,
      name: true,
      defaultUnitPriceUsd: true,
      defaultUnitPriceCny: true,
      cbmPerUnit: true,
      orderItems: {
        select: {
          quantity: true,
          unitPriceUsd: true,
          cbmPerUnit: true,
          usdToPlnRate: true,
          order: {
            select: {
              orderNumber: true,
              status: true,
              usdToPlnRate: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  console.log(JSON.stringify(p, null, 2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
