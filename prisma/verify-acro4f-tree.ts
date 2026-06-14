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
  if (!company) return;

  const productCount = await db.product.count({
    where: { companyId: company.id },
  });

  // Drzewo: level 1 + ich dzieci
  const level1 = await db.category.findMany({
    where: { companyId: company.id, level: 1 },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { products: true } },
      children: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: { select: { products: true } },
        },
      },
    },
  });

  console.log(`${company.name}:`);
  console.log(`  produkty łącznie: ${productCount}\n`);
  for (const c of level1) {
    const own = c._count.products;
    const childTotal = c.children.reduce((s, ch) => s + ch._count.products, 0);
    console.log(
      `  • ${c.name} (${own + childTotal} produktów${
        c.children.length > 0 ? `, ${c.children.length} subkategorii` : ""
      })`,
    );
    for (const sub of c.children) {
      console.log(`      └── ${sub.name}: ${sub._count.products}`);
    }
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
