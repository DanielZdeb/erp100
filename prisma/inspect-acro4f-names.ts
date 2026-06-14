import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({ where: { slug: "acro4f" } });
  if (!company) return;
  const cats = await db.category.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  for (const c of cats) {
    const ps = await db.product.findMany({
      where: { companyId: company.id, categoryId: c.id },
      select: { name: true },
      orderBy: { name: "asc" },
      take: 10,
    });
    console.log("=== " + c.name + " ===");
    for (const p of ps) console.log("  " + p.name);
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
