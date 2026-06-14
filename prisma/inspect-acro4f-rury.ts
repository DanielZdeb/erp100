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
  const cat = await db.category.findFirst({
    where: { companyId: company.id, name: "Rury pole dance" },
    select: { id: true },
  });
  const ps = await db.product.findMany({
    where: { companyId: company.id, categoryId: cat?.id ?? "" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      productCode: true,
      eanCode: true,
      defaultUnitPriceUsd: true,
      weightKg: true,
      cbmPerUnit: true,
    },
  });
  for (const p of ps) {
    console.log(
      `${p.productCode.padEnd(20)} ${p.eanCode ?? "—".padEnd(13)} waga=${p.weightKg ?? "—"} kg cbm=${p.cbmPerUnit ?? "—"} m³ | ${p.name}`,
    );
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
