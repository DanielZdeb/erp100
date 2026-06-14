import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  console.log("=== Kategorie TYP-D ===");
  const cats = await db.category.findMany({
    where: { name: { contains: "TYP-D", mode: "insensitive" } },
    select: { id: true, name: true, parentId: true, level: true },
  });
  for (const c of cats) console.log(`  ${c.id}  L${c.level}  ${c.name}`);

  for (const c of cats) {
    const products = await db.product.findMany({
      where: { categoryId: c.id },
      orderBy: { productCode: "asc" },
      select: {
        id: true,
        name: true,
        productCode: true,
        eanCode: true,
        isComponent: true,
        compositionMode: true,
      },
    });
    console.log(`\n=== Produkty w „${c.name}" (${products.length}) ===`);
    for (const p of products) {
      const tag = p.isComponent ? "KOMP" : "PROD";
      console.log(
        `  [${tag}] ${p.productCode}  EAN=${p.eanCode ?? "—"}  ${p.name}`,
      );
    }
  }

  // Sprawdź czy są ImportOrderItems wskazujące na te produkty (blokery delete)
  console.log("\n=== Czy któryś produkt jest w aktywnym zamówieniu? ===");
  for (const c of cats) {
    const products = await db.product.findMany({
      where: { categoryId: c.id },
      select: { id: true, productCode: true },
    });
    for (const p of products) {
      const orderItems = await db.importOrderItem.count({
        where: { productId: p.id },
      });
      if (orderItems > 0) {
        console.log(`  ⚠️  ${p.productCode} jest w ${orderItems} pozycjach zamówień`);
      }
    }
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
