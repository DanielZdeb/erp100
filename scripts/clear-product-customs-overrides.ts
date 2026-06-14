/**
 * Czyści customsDutyPct na poziomie produktu dla produktów w kategoriach
 * ACRO4F (gdzie ustawiliśmy customsDutyPct na poziomie kategorii). Dzięki
 * temu produkty dziedziczą stawkę z kategorii (a nie ze starych przypadkowych
 * wartości na produkcie).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const CATEGORY_NAMES = [
  "Rury pole dance",
  "Szarfy akrobatyczne CN - Zestaw",
  "Szarfy akrobatyczna PL - materiały",
  "Materiały szarfa",
  "Hamaki do jogi CN - zestaw",
  "Hamaki dla dzieci",
  "Koła cyrkowe - zestaw",
  "Magnezja pole dance",
  "Mocowania sufitowe",
];

async function main() {
  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  // Znajdź wszystkie kategorie (w tym L2 podkategorie pod naszymi L1)
  const allCats = await db.category.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true, parentId: true },
  });
  const targetIds = new Set<string>();
  for (const cat of allCats) {
    if (CATEGORY_NAMES.includes(cat.name)) {
      targetIds.add(cat.id);
      // też podkategorie
      for (const sub of allCats) {
        if (sub.parentId === cat.id) targetIds.add(sub.id);
      }
    }
  }
  console.log(`Kategorie objęte (+ podkategorie): ${targetIds.size}`);

  const updated = await db.product.updateMany({
    where: {
      companyId: company.id,
      categoryId: { in: [...targetIds] },
      customsDutyPct: { not: null },
    },
    data: { customsDutyPct: null },
  });
  console.log(`✓ Wyzerowano customsDutyPct na ${updated.count} produktach`);
  console.log(`  (teraz dziedziczą z kategorii — RP-* z 6.5%, AH-* z 2.7%, etc.)`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
