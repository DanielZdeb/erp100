import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseMaterialSku } from "../src/lib/material-bolts";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const products = await db.product.findMany({
    where: { productCode: { startsWith: "M-" } },
    select: { productCode: true, name: true },
    orderBy: { productCode: "asc" },
  });
  console.log(`Znaleziono ${products.length} materialow.\n`);
  console.log("KOD".padEnd(28) + "KOLOR".padEnd(15) + "NAZWA");
  console.log("-".repeat(80));
  for (const p of products) {
    const parsed = parseMaterialSku(p.productCode);
    const color = parsed?.color ?? "?";
    console.log(p.productCode.padEnd(28) + color.padEnd(15) + p.name);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
