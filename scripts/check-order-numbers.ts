import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Per firma
  const companies = await db.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    const orders = await db.importOrder.findMany({
      where: { companyId: c.id, orderNumber: { startsWith: "2026-" } },
      orderBy: { orderNumber: "asc" },
      select: { orderNumber: true, name: true },
    });
    if (orders.length === 0) continue;
    console.log(`=== ${c.name} (${orders.length} zam. w 2026) ===`);
    for (const o of orders) console.log(`  ${o.orderNumber}  ${o.name ?? "—"}`);
    const count = orders.length;
    console.log(`  → nextOrderNumber wygeneruje: 2026-${String(count + 1).padStart(4, "0")}`);
    const exists = orders.find(
      (o) => o.orderNumber === `2026-${String(count + 1).padStart(4, "0")}`,
    );
    if (exists) {
      console.log(`  ⚠️  KONFLIKT: ${exists.orderNumber} już istnieje!`);
    }
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
