/**
 * Konsoliduje 2 manuale rury pole dance w 1:
 * - „Rury pole dance" (user-created, A5 + ACRO4F settings, 6 stron) — ZOSTAW
 * - „Rura do pole dance — montaż i konserwacja" (mój seed) — USUŃ
 *
 * Przed delete: przenieś przypisanie kategorii „Rury" z mojego na user'ski.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const keep = await db.productManual.findFirst({
    where: { name: "Rury pole dance" },
    select: { id: true, name: true, pageSize: true },
  });
  const old = await db.productManual.findFirst({
    where: { name: "Rura do pole dance — montaż i konserwacja" },
    select: {
      id: true,
      name: true,
      categoryAssignments: {
        select: {
          id: true,
          categoryId: true,
          includeDescendants: true,
          category: { select: { name: true } },
        },
      },
      productAssignments: {
        select: { id: true, productId: true },
      },
    },
  });
  if (!keep) {
    console.log('Brak manuala "Rury pole dance" — nic do konsolidacji');
    return;
  }
  if (!old) {
    console.log('Brak starego manuala — nic do konsolidacji');
    return;
  }
  console.log(`Zostaje: ${keep.name} (${keep.pageSize})  id=${keep.id}`);
  console.log(`Usuwam:  ${old.name}  id=${old.id}`);

  // Przenieś przypisania kategoryjne na keep — pomiń duplikaty
  for (const ca of old.categoryAssignments) {
    const dup = await db.productManualCategory.findFirst({
      where: { manualId: keep.id, categoryId: ca.categoryId },
      select: { id: true },
    });
    if (dup) {
      console.log(
        `  ⊙ Przypisanie do kategorii „${ca.category.name}" już istnieje u keep`,
      );
    } else {
      await db.productManualCategory.create({
        data: {
          manualId: keep.id,
          categoryId: ca.categoryId,
          includeDescendants: ca.includeDescendants,
        },
      });
      console.log(
        `  ✓ Przeniesiono przypisanie kategorii „${ca.category.name}" (includeDescendants=${ca.includeDescendants})`,
      );
    }
  }
  // Przenieś przypisania produktowe (jeśli są)
  for (const pa of old.productAssignments) {
    const dup = await db.productManualProduct.findFirst({
      where: { manualId: keep.id, productId: pa.productId },
      select: { id: true },
    });
    if (!dup) {
      await db.productManualProduct.create({
        data: { manualId: keep.id, productId: pa.productId },
      });
    }
  }

  // Usuń stary manual (cascade kasuje stare przypisania)
  await db.productManual.delete({ where: { id: old.id } });
  console.log(`\n✗ Usunięto stary manual ${old.id}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
