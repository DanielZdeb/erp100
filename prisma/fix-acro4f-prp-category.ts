/**
 * Naprawia produkty PRP-50CM-* (Przedłużki rury pole dance) które straciły
 * kategorię przez bug w Zod transform w updateProductAuditFieldAction.
 *
 * Re-przypisuje je do kategorii "Rury pole dance" w firmie ACRO4F.
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

  // Znajdź kategorię "Rury pole dance"
  const cat = await db.category.findFirst({
    where: { companyId: company.id, name: "Rury pole dance" },
    select: { id: true },
  });
  if (!cat) {
    console.error("Kategoria 'Rury pole dance' nie istnieje.");
    process.exit(1);
  }

  // Zaktualizuj wszystkie PRP-50CM-* bez kategorii
  const result = await db.product.updateMany({
    where: {
      companyId: company.id,
      productCode: { startsWith: "PRP-50CM-" },
      categoryId: null,
    },
    data: { categoryId: cat.id },
  });

  console.log(`✓ Przypisano ${result.count} produkt(ów) PRP-50CM-* do "Rury pole dance"`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
