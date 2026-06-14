import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error("ACRO4F nie istnieje.");
    process.exit(1);
  }

  const [productsTotal, categoriesTotal, byCat] = await Promise.all([
    db.product.count({ where: { companyId: company.id } }),
    db.category.count({ where: { companyId: company.id } }),
    db.category.findMany({
      where: { companyId: company.id },
      select: {
        name: true,
        _count: { select: { products: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  console.log(`${company.name}:`);
  console.log(`  produkty: ${productsTotal}`);
  console.log(`  kategorie: ${categoriesTotal}`);
  for (const c of byCat) {
    console.log(`    • ${c.name}: ${c._count.products}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
