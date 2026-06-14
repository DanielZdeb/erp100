import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const batches = await db.productPhotoBatch.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { images: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log("=== Batche ===");
  for (const b of batches) {
    console.log(
      `  ${b.id}  [${b.status}]  ${b.name ?? "—"}  obrazy=${b._count.images}  ${b.createdAt.toISOString()}`,
    );
  }

  // Znajdź pozycje z "chusta sensoryczna" lub "Hamak dla dzieci"
  const matchingProducts = await db.product.findMany({
    where: {
      OR: [
        { name: { contains: "chusta sensoryczna", mode: "insensitive" } },
        { name: { contains: "Hamak dla dzieci", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, productCode: true },
  });
  console.log("\n=== Pasujące produkty ===");
  for (const p of matchingProducts) {
    console.log(`  ${p.productCode}  ${p.name}  id=${p.id}`);
  }

  // Pokaż które batche mają zdjęcia tych produktów
  if (matchingProducts.length > 0) {
    const images = await db.productPhotoImage.findMany({
      where: { productId: { in: matchingProducts.map((p) => p.id) } },
      select: {
        id: true,
        batchId: true,
        productId: true,
        status: true,
        product: { select: { productCode: true, name: true } },
        batch: { select: { name: true, status: true } },
      },
    });
    console.log(`\n=== Obrazy pasujących produktów (${images.length}) ===`);
    const byBatch = new Map<string, typeof images>();
    for (const img of images) {
      const list = byBatch.get(img.batchId) ?? [];
      list.push(img);
      byBatch.set(img.batchId, list);
    }
    for (const [batchId, imgs] of byBatch) {
      console.log(
        `\n  Batch ${batchId} (${imgs[0].batch?.name ?? "—"}, ${imgs[0].batch?.status}):  ${imgs.length} obrazów`,
      );
      const byProduct = new Map<string, number>();
      for (const img of imgs) {
        byProduct.set(
          img.product.productCode,
          (byProduct.get(img.product.productCode) ?? 0) + 1,
        );
      }
      for (const [code, count] of byProduct) {
        console.log(`    ${code}: ${count} obrazów`);
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
