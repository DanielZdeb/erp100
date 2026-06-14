/**
 * Konwertuje wszystkie produkty BUNDLE-* w kategorii Stoły (+ podkategorie)
 * z compositionMode=KOMPONENTOWY na ZESTAW.
 *
 * - Komponenty (ProductComponent) zostają — ich `quantity` opisuje ile sztuk
 *   w 1 zestawie (1 blat + 1 nogi + 4/6/8 krzeseł).
 * - Domyślnie bundleShippingMode = INDIVIDUAL_PACKAGING (każdy w swoim pudle).
 * - Nie dotyka produktów z aktywnymi zamówieniami (defensive).
 *
 * Idempotentny: pomija produkty już w trybie ZESTAW.
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
  const stolyRoot = await db.category.findFirst({
    where: { name: "Stoły", parentId: null },
    select: { id: true, name: true },
  });
  if (!stolyRoot) {
    // fallback: po name (bez parentId filter)
    const fallback = await db.category.findFirst({
      where: { name: "Stoły" },
      select: { id: true, name: true },
    });
    if (!fallback) throw new Error('Brak kategorii "Stoły"');
    console.log(`Używam: ${fallback.name} (${fallback.id})`);
    process.exit(1);
  }

  const catIds = await categoryIdsInSubtree(stolyRoot.id);
  console.log(`Kategoria "Stoły" + podkategorie: ${catIds.length}`);

  const products = await db.product.findMany({
    where: { categoryId: { in: catIds } },
    select: {
      id: true,
      productCode: true,
      name: true,
      compositionMode: true,
      bundleShippingMode: true,
      _count: { select: { orderItems: true, components: true } },
    },
  });
  console.log(`Produktów w gałęzi: ${products.length}\n`);

  let updated = 0;
  let skipped = 0;
  let blocked = 0;

  for (const p of products) {
    if (p.compositionMode === "ZESTAW") {
      console.log(`  ⊙ ${p.productCode}  już ZESTAW (pomijam)`);
      skipped++;
      continue;
    }
    if (p._count.orderItems > 0) {
      console.log(
        `  ⚠ ${p.productCode}  w ${p._count.orderItems} zamówieniach — POMIJAM (bezpieczeństwo)`,
      );
      blocked++;
      continue;
    }
    if (p._count.components === 0) {
      console.log(
        `  ⚠ ${p.productCode}  brak komponentów — POMIJAM (nic do zestawu)`,
      );
      blocked++;
      continue;
    }
    await db.product.update({
      where: { id: p.id },
      data: {
        compositionMode: "ZESTAW",
        // Domyślnie pakowanie po komponentach — każdy w swoim pudle.
        // User może ręcznie przełączyć na SINGLE_CARTON w UI Pakowania zestawu.
        bundleShippingMode: p.bundleShippingMode ?? "INDIVIDUAL_PACKAGING",
      },
    });
    console.log(
      `  ✓ ${p.productCode}  ${p.compositionMode} → ZESTAW  (${p._count.components} komp.)`,
    );
    updated++;
  }

  console.log(
    `\nGotowe. Update: ${updated}  Skipped: ${skipped}  Blocked (orders): ${blocked}`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
