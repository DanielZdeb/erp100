/**
 * Usuwa puste kategorie (bez produktów i bez podkategorii) z firmy ACRO4F.
 * Idempotentny — bezpieczny do uruchomienia wielokrotnie.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true },
  });
  if (!company) {
    console.error("ACRO4F nie istnieje.");
    process.exit(1);
  }

  const emptyCats = await db.category.findMany({
    where: {
      companyId: company.id,
      products: { none: {} },
      children: { none: {} },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (emptyCats.length === 0) {
    console.log("Brak pustych kategorii do usunięcia.");
    await db.$disconnect();
    return;
  }

  console.log(`Usuwam ${emptyCats.length} pustych kategorii:`);
  for (const c of emptyCats) console.log(`  • ${c.name}`);

  await db.category.deleteMany({
    where: { id: { in: emptyCats.map((c) => c.id) } },
  });

  console.log("\n✔ Usunięto.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
