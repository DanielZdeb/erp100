import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Sprawdź AHOOP-BLACK-105 i PRP-* dla wzoru
  const samples = await db.product.findMany({
    where: {
      productCode: { in: ["AHOOP-BLACK-105", "PRP-50CM-BLACK", "HS-BLACK"] },
    },
    select: {
      productCode: true,
      name: true,
      category: { select: { id: true, name: true } },
      defaultUnitPriceUsd: true,
      cbmPerUnit: true,
      referenceContainerM3: true,
      unitsPerContainer: true,
      importMode: true,
      weightKg: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      customsDutyPct: true,
      companyId: true,
    },
  });
  for (const s of samples) {
    console.log(JSON.stringify(s, null, 2));
    console.log("---");
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
