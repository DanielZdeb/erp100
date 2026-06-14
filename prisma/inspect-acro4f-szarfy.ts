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
  if (!company) return;
  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      OR: [
        { productCode: { startsWith: "AS-" } },
        { productCode: { startsWith: "AH-" } },
        { productCode: { startsWith: "KH-" } },
        { productCode: { startsWith: "HS-" } },
        { productCode: { startsWith: "KAR-" } },
      ],
    },
    orderBy: { productCode: "asc" },
    select: { productCode: true, name: true, weightKg: true },
  });
  console.log(`Found ${products.length} products:\n`);
  for (const p of products) {
    console.log(`${p.productCode.padEnd(25)} (${p.weightKg ?? "?"} kg) ${p.name}`);
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
