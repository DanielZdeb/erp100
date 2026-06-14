/**
 * Usuwa 9 starych krzeseł CALOSCIOWY z kategorii TYP-D (KD-*-B, KD-*-G).
 * 2 z nich są w zamówieniu 2026-0003 (DOGADYWANE) — zdejmuje też ich
 * pozycje z tego zamówienia, samego zamówienia nie rusza.
 *
 * Komponenty KD-LIGHTBEIGE itd. + KD-LEGS-G/B zostawia nienaruszone —
 * będą reużyte w nowych wariantach ZESTAW.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const typD = await db.category.findFirst({
    where: { name: "TYP-D" },
    select: { id: true, name: true },
  });
  if (!typD) {
    console.log("Brak kategorii TYP-D — nic do roboty");
    return;
  }

  // Usuwamy tylko CALOSCIOWY (pełne krzesła), nie KOMPONENTY — w TYP-D nie ma
  // komponentów ale zabezpieczamy się przed pomyłką.
  const toDelete = await db.product.findMany({
    where: {
      categoryId: typD.id,
      compositionMode: "CALOSCIOWY",
      isComponent: false,
    },
    select: { id: true, productCode: true, name: true },
  });

  console.log(`Do usunięcia: ${toDelete.length} produktów`);

  await db.$transaction(async (tx) => {
    // 1) Usuń pozycje zamówień wskazujące na te produkty
    const deletedOrderItems = await tx.importOrderItem.deleteMany({
      where: { productId: { in: toDelete.map((p) => p.id) } },
    });
    console.log(`  → usunięto ${deletedOrderItems.count} pozycji zamówień`);

    // 2) Usuń obrazy produktów
    const deletedImages = await tx.productImage.deleteMany({
      where: { productId: { in: toDelete.map((p) => p.id) } },
    });
    console.log(`  → usunięto ${deletedImages.count} obrazów`);

    // 3) Usuń pliki produktów (jeśli są)
    const deletedFiles = await tx.productFile.deleteMany({
      where: { productId: { in: toDelete.map((p) => p.id) } },
    });
    console.log(`  → usunięto ${deletedFiles.count} plików`);

    // 4) Usuń same produkty
    for (const p of toDelete) {
      await tx.product.delete({ where: { id: p.id } });
      console.log(`  ✗ ${p.productCode}  ${p.name}`);
    }
  });

  console.log(`\nGotowe. Usunięto ${toDelete.length} produktów z TYP-D.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
