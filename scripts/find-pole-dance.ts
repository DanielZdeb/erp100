import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const products = await db.product.findMany({
    where: {
      OR: [
        { name: { contains: "pole", mode: "insensitive" } },
        { name: { contains: "rura", mode: "insensitive" } },
        { productCode: { contains: "POLE", mode: "insensitive" } },
        { productCode: { contains: "RURA", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      company: { select: { name: true } },
      category: { select: { name: true, parent: { select: { name: true } } } },
      productManualJson: true,
    },
  });
  for (const p of products) {
    console.log(
      `${p.productCode}  |  ${p.name}  |  ${p.company?.name}  |  ${p.category?.parent?.name ?? "—"} > ${p.category?.name ?? "—"}  |  manual=${p.productManualJson ? "JEST" : "BRAK"}`,
    );
    console.log("  id:", p.id);
  }

  // Sprawdź też kategorie ACRO4F
  console.log("\n=== Kategorie ACRO4F ===");
  const acroComp = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true, name: true },
  });
  if (acroComp) {
    const cats = await db.category.findMany({
      where: { companyId: acroComp.id, level: 1 },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    for (const c of cats) console.log(`  ${c.id}  ${c.name}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
