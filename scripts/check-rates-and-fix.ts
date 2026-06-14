import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("=== Kursy z innych zamówień ===");
  const orders = await db.importOrder.findMany({
    where: {
      OR: [
        { usdToPlnRate: { not: null } },
        { cnyToPlnRate: { not: null } },
        { eurToPlnRate: { not: null } },
      ],
    },
    select: {
      orderNumber: true,
      usdToPlnRate: true,
      cnyToPlnRate: true,
      eurToPlnRate: true,
      company: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const o of orders) {
    console.log(
      `  ${o.orderNumber}  ${o.company?.name?.slice(0, 25)}  USD=${o.usdToPlnRate}  CNY=${o.cnyToPlnRate}  EUR=${o.eurToPlnRate}`,
    );
  }
  if (orders.length === 0) {
    console.log("  (brak — żadne zamówienie nie ma kursu)");
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
