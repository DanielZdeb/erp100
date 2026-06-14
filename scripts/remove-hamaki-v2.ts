/**
 * Usuwa z aktywnego batcha wszystkie obrazy produktów których nazwa zaczyna
 * się od „Hamak dla dzieci" lub „Huśtawka sensoryczna" (rodzina hamaków
 * dziecięcych chusta sensoryczna), OR które są w poddrzewie kategorii
 * „Hamaki dla dzieci".
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function categoryIdsInSubtree(rootId: string): Promise<string[]> {
  const all: string[] = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const kids = await db.category.findMany({
      where: { parentId: cur },
      select: { id: true },
    });
    for (const k of kids) {
      all.push(k.id);
      queue.push(k.id);
    }
  }
  return all;
}

async function main() {
  const batch = await db.productPhotoBatch.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, _count: { select: { images: true } } },
  });
  if (!batch) throw new Error("Brak batcha");
  console.log(`Batch: ${batch.name}  obrazy=${batch._count.images}  id=${batch.id}`);

  const rootCat = await db.category.findFirst({
    where: { name: "Hamaki dla dzieci" },
    select: { id: true, name: true },
  });
  const catIds = rootCat ? await categoryIdsInSubtree(rootCat.id) : [];
  console.log(`Kategorie w poddrzewie „Hamaki dla dzieci": ${catIds.length}`);

  // Produkty: w poddrzewie kategorii ORAZ po nazwie (fallback gdy kategorie się
  // nie pokrywają)
  const products = await db.product.findMany({
    where: {
      OR: [
        { categoryId: { in: catIds } },
        { name: { contains: "Hamak dla dzieci", mode: "insensitive" } },
        { name: { contains: "Huśtawka sensoryczna", mode: "insensitive" } },
      ],
    },
    select: { id: true, productCode: true, name: true, categoryId: true },
  });
  console.log(`Pasujące produkty: ${products.length}`);
  for (const p of products) {
    console.log(`  ${p.productCode}  ${p.name}`);
  }

  const productIds = products.map((p) => p.id);
  const imagesToDelete = await db.productPhotoImage.findMany({
    where: { batchId: batch.id, productId: { in: productIds } },
    select: { id: true, productId: true },
  });
  console.log(`\nDo usunięcia obrazów: ${imagesToDelete.length}`);

  if (imagesToDelete.length === 0) {
    console.log("Nic do roboty.");
    await db.$disconnect();
    return;
  }

  const skuByProductId = new Map(products.map((p) => [p.id, p.productCode]));
  const skuCount = new Map<string, number>();
  for (const img of imagesToDelete) {
    const code = skuByProductId.get(img.productId) ?? "?";
    skuCount.set(code, (skuCount.get(code) ?? 0) + 1);
  }
  for (const [code, n] of [...skuCount.entries()].sort()) {
    console.log(`  ✗ ${code}: ${n} obrazów`);
  }

  const deleted = await db.productPhotoImage.deleteMany({
    where: { id: { in: imagesToDelete.map((i) => i.id) } },
  });
  console.log(`\n✓ Usunięto ${deleted.count} obrazów`);

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
