import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Znajdź kategorię "Stoły" (case-insensitive)
  const cats = await db.category.findMany({
    where: { name: { contains: "tół", mode: "insensitive" } },
    select: { id: true, name: true, level: true, parent: { select: { name: true } } },
  });
  console.log(`Kategorie pasujące do "stół":`);
  for (const c of cats) {
    console.log(
      `  ${c.id}  L${c.level}  ${c.parent?.name ?? "—"} > ${c.name}`,
    );
  }

  // Też "stoly" bez ogonka
  const cats2 = await db.category.findMany({
    where: {
      OR: [
        { name: { equals: "Stoły", mode: "insensitive" } },
        { name: { equals: "Stoly", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, level: true },
  });
  console.log(`\nKategorie "Stoły"/"Stoly":`);
  for (const c of cats2) console.log(`  ${c.id}  L${c.level}  ${c.name}`);

  if (cats2.length > 0) {
    const stolyCatId = cats2[0].id;
    // Wszystkie produkty w "Stoły" + podkategorie
    const allCatIds = [stolyCatId];
    const queue = [stolyCatId];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const kids = await db.category.findMany({
        where: { parentId: cur },
        select: { id: true, name: true },
      });
      for (const k of kids) {
        allCatIds.push(k.id);
        queue.push(k.id);
      }
    }
    console.log(`\nWszystkie ID kategorii (z podkategoriami): ${allCatIds.length}`);

    const products = await db.product.findMany({
      where: { categoryId: { in: allCatIds } },
      select: {
        id: true,
        productCode: true,
        name: true,
        compositionMode: true,
        isComponent: true,
        category: { select: { name: true, parent: { select: { name: true } } } },
        _count: { select: { components: true, orderItems: true } },
      },
      orderBy: { productCode: "asc" },
    });
    console.log(`\nProdukty (${products.length}):`);
    for (const p of products) {
      const tag = p.isComponent ? "KOMP" : p.compositionMode;
      console.log(
        `  [${tag.padEnd(11)}] ${p.productCode.padEnd(22)} ${p.name.slice(0, 60)} | ${p.category?.parent?.name ?? "—"} > ${p.category?.name ?? "—"} | komp=${p._count.components} zam=${p._count.orderItems}`,
      );
    }
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
