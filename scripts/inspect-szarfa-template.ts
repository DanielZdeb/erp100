import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Szablon zestawu — bierzemy 3 istniejące (6M, 7M, 8M w kolorze BLACK)
  const samples = await db.product.findMany({
    where: { productCode: { in: ["AS-6M-BLACK", "AS-7M-BLACK", "AS-8M-BLACK"] } },
    select: {
      id: true,
      productCode: true,
      name: true,
      categoryId: true,
      category: { select: { name: true } },
      status: true,
      color: true,
      eanCode: true,
      weightKg: true,
      customsDutyPct: true,
      compositionMode: true,
      requiredComponentsTotal: true,
      bundleShippingMode: true,
      bundleShippingBoxId: true,
      defaultSalePriceAllegroPln: true,
      defaultSalePriceSklepPln: true,
      companyId: true,
      components: {
        select: {
          componentId: true,
          quantity: true,
          sortOrder: true,
          component: { select: { productCode: true } },
        },
      },
    },
    orderBy: { productCode: "asc" },
  });
  console.log("=== Istniejące szablony AS-*M-BLACK ===\n");
  for (const s of samples) {
    console.log(`${s.productCode}`);
    console.log(`  Nazwa: ${s.name}`);
    console.log(`  CategoryId: ${s.categoryId} (${s.category?.name})`);
    console.log(`  Status: ${s.status}, Kolor: ${s.color}`);
    console.log(`  EAN: ${s.eanCode}`);
    console.log(`  Waga: ${s.weightKg}, Cło: ${s.customsDutyPct}`);
    console.log(`  Mode: ${s.compositionMode}, req: ${s.requiredComponentsTotal}`);
    console.log(`  Bundle: ${s.bundleShippingMode} / ${s.bundleShippingBoxId}`);
    console.log(`  Cena Allegro: ${s.defaultSalePriceAllegroPln}, Sklep: ${s.defaultSalePriceSklepPln}`);
    console.log(`  CompanyId: ${s.companyId}`);
    console.log(`  Komponenty:`);
    for (const c of s.components) {
      console.log(`    - ${c.component.productCode} × ${c.quantity} (sort ${c.sortOrder})`);
    }
    console.log();
  }

  // Sprawdź czy materiały DARKBEIGE istnieją
  const matCodes = [
    "M-AS-150-6M-DARKBEIGE",
    "M-AS-150-7M-DARKBEIGE",
    "M-AS-150-8M-DARKBEIGE",
  ];
  const mats = await db.product.findMany({
    where: { productCode: { in: matCodes } },
    select: { id: true, productCode: true, name: true },
  });
  console.log("=== Materiały DARKBEIGE ===");
  for (const m of matCodes) {
    const found = mats.find((x) => x.productCode === m);
    console.log(`  ${found ? "✓" : "✗"} ${m}${found ? ` → ${found.name}` : ""}`);
  }

  // Sprawdź czy AS-*M-DARKBEIGE już istnieje (idempotency)
  const existingDarkbeige = await db.product.findMany({
    where: { productCode: { in: ["AS-6M-DARKBEIGE", "AS-7M-DARKBEIGE", "AS-8M-DARKBEIGE"] } },
    select: { productCode: true },
  });
  console.log("\n=== Czy AS-*M-DARKBEIGE już są ===");
  for (const code of ["AS-6M-DARKBEIGE", "AS-7M-DARKBEIGE", "AS-8M-DARKBEIGE"]) {
    const found = existingDarkbeige.find((x) => x.productCode === code);
    console.log(`  ${found ? "JEST" : "BRAK"}: ${code}`);
  }
}
main()
  .catch(console.error)
  .finally(() => db.$disconnect());
