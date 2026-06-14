/**
 * Usuwa z aktywnego batcha generowania grafik wszystkie pozycje produktów
 * z kategorii „Hamaki dla dzieci" (po nazwie kategorii).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const batch = await db.productPhotoBatch.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, _count: { select: { images: true } } },
  });
  if (!batch) throw new Error("Brak batcha");
  console.log(
    `Batch: ${batch.name ?? "—"}  [${batch.status}]  obrazy=${batch._count.images}  id=${batch.id}`,
  );

  const cat = await db.category.findFirst({
    where: { name: "Hamaki dla dzieci" },
    select: { id: true, name: true },
  });
  if (!cat) throw new Error('Brak kategorii "Hamaki dla dzieci"');

  // Wszystkie produkty z tej kategorii (i podkategorii)
  const products = await db.product.findMany({
    where: { categoryId: cat.id },
    select: { id: true, productCode: true, name: true },
  });
  console.log(`Produkty w „${cat.name}": ${products.length}`);

  const productIds = products.map((p) => p.id);
  const imagesToDelete = await db.productPhotoImage.findMany({
    where: { batchId: batch.id, productId: { in: productIds } },
    select: { id: true, productId: true, shotId: true },
  });
  console.log(`Do usunięcia obrazów: ${imagesToDelete.length}`);

  if (imagesToDelete.length === 0) {
    console.log("Nic do roboty.");
    await db.$disconnect();
    return;
  }

  // Pokaż które SKU
  const productById = new Map(products.map((p) => [p.id, p]));
  const skuCount = new Map<string, number>();
  for (const img of imagesToDelete) {
    const p = productById.get(img.productId);
    const code = p?.productCode ?? "?";
    skuCount.set(code, (skuCount.get(code) ?? 0) + 1);
  }
  for (const [code, n] of [...skuCount.entries()].sort()) {
    console.log(`  ✗ ${code}: ${n} obrazów`);
  }

  const deleted = await db.productPhotoImage.deleteMany({
    where: { id: { in: imagesToDelete.map((i) => i.id) } },
  });
  console.log(`\nUsunięto ${deleted.count} obrazów`);

  // Pokaż stan batcha po
  const remaining = await db.productPhotoImage.count({
    where: { batchId: batch.id },
  });
  console.log(`Pozostało w batchu: ${remaining} obrazów`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
