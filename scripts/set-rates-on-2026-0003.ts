import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const updated = await db.importOrder.updateMany({
    where: {
      orderNumber: "2026-0003",
      company: { name: { contains: "Zdeb" } },
    },
    data: {
      usdToPlnRate: 3.7,
      cnyToPlnRate: 0.5375,
      eurToPlnRate: 4.2348,
    },
  });
  console.log("Zaktualizowano:", updated.count, "zamówienie");

  const o = await db.importOrder.findFirst({
    where: {
      orderNumber: "2026-0003",
      company: { name: { contains: "Zdeb" } },
    },
    select: {
      orderNumber: true,
      usdToPlnRate: true,
      cnyToPlnRate: true,
      eurToPlnRate: true,
    },
  });
  console.log("Po update:", o);
  const totalUsd =
    8.464 * (413 + 463 + 663 + 613 + 263 + 263 + 263) +
    5.182 * 1900 +
    2.073 * 1100;
  console.log("Suma USD produktów:", totalUsd.toFixed(2));
  console.log("Suma PLN @ 3.7:", (totalUsd * 3.7).toFixed(2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
