import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { bundleSkuCount } from "../src/lib/bundle-packaging";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const sample = await db.product.findMany({
    where: { productCode: { startsWith: "BUNDLE-" }, compositionMode: "ZESTAW" },
    select: {
      id: true,
      productCode: true,
      name: true,
      compositionMode: true,
      bundleShippingMode: true,
      components: {
        select: {
          quantity: true,
          component: { select: { productCode: true, name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    take: 3,
  });
  for (const p of sample) {
    const skuCount = bundleSkuCount("ZESTAW", p.components);
    console.log(`\n${p.productCode}  [${p.compositionMode}]  shippingMode=${p.bundleShippingMode}`);
    console.log(`  ${p.name}`);
    console.log(`  Komponenty (${p.components.length}):`);
    for (const c of p.components) {
      console.log(`    ${c.quantity}× ${c.component.productCode}  ${c.component.name.slice(0, 50)}`);
    }
    console.log(`  → SKU dla fulfillmentu: ${skuCount}`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
