/**
 * Migruje manual rury pole dance z Product.productManualJson (per-produkt)
 * do katalogu ProductManual + przypisanie do podkategorii „Rury".
 *
 * - Czyta JSON z RP-SILVER (any RP-*) — wszystkie mają tę samą treść.
 * - Tworzy ProductManual „Rura do pole dance — montaż i konserwacja".
 * - Pinuje do podkategorii „Rury" (parent „Rury pole dance"), includeDescendants=true.
 * - Czyści productManualJson na wszystkich 6 RP-* (były tam jako leftover).
 *
 * Idempotentne — jeśli ProductManual o tej nazwie już istnieje, pomija.
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MANUAL_NAME = "Rura do pole dance — montaż i konserwacja";

async function main() {
  // Źródło — RP-SILVER
  const source = await db.product.findFirst({
    where: { productCode: "RP-SILVER" },
    select: {
      id: true,
      companyId: true,
      categoryId: true,
      productManualJson: true,
      manualHeaderRanges: true,
      manualTemplate: true,
      manualPageSize: true,
      manualHeaderLang: true,
      manualHeaderTitle: true,
      category: { select: { id: true, name: true, parentId: true } },
    },
  });
  if (!source) throw new Error("Brak RP-SILVER");
  if (!source.productManualJson) {
    throw new Error("Brak manuala na RP-SILVER — nic do migracji");
  }
  console.log(`Źródło: RP-SILVER (kategoria: ${source.category?.name})`);

  // Znajdź podkategorię „Rury" (parent „Rury pole dance")
  const rurySubcat = await db.category.findFirst({
    where: {
      companyId: source.companyId,
      name: "Rury",
      parent: { name: "Rury pole dance" },
    },
    select: { id: true, name: true, parent: { select: { name: true } } },
  });
  if (!rurySubcat) throw new Error('Brak podkategorii "Rury" w "Rury pole dance"');
  console.log(`Cel: ${rurySubcat.parent?.name} > ${rurySubcat.name}  (${rurySubcat.id})`);

  // Czy już jest taki ProductManual? (idempotent)
  let manual = await db.productManual.findFirst({
    where: { companyId: source.companyId, name: MANUAL_NAME },
    select: { id: true },
  });
  if (manual) {
    console.log(`ProductManual już istnieje: ${manual.id} — aktualizuję treść`);
    await db.productManual.update({
      where: { id: manual.id },
      data: {
        manualJson: source.productManualJson as Prisma.InputJsonValue,
        headerRanges:
          source.manualHeaderRanges == null
            ? Prisma.JsonNull
            : (source.manualHeaderRanges as Prisma.InputJsonValue),
        template: source.manualTemplate,
        pageSize: source.manualPageSize,
        headerLang: source.manualHeaderLang,
        headerTitle: source.manualHeaderTitle,
      },
    });
  } else {
    manual = await db.productManual.create({
      data: {
        companyId: source.companyId,
        name: MANUAL_NAME,
        manualJson: source.productManualJson as Prisma.InputJsonValue,
        headerRanges:
          source.manualHeaderRanges == null
            ? Prisma.JsonNull
            : (source.manualHeaderRanges as Prisma.InputJsonValue),
        template: source.manualTemplate,
        pageSize: source.manualPageSize,
        kind: "STANDARD",
        headerLang: source.manualHeaderLang,
        headerTitle: source.manualHeaderTitle,
      },
      select: { id: true },
    });
    console.log(`Utworzono ProductManual: ${manual.id}`);
  }

  // Pinuj do kategorii „Rury"
  const existingAssign = await db.productManualCategory.findFirst({
    where: { manualId: manual.id, categoryId: rurySubcat.id },
    select: { id: true },
  });
  if (existingAssign) {
    console.log("Przypisanie kategoryjne już istnieje");
  } else {
    await db.productManualCategory.create({
      data: {
        manualId: manual.id,
        categoryId: rurySubcat.id,
        includeDescendants: true,
      },
    });
    console.log(`Przypisano do kategorii „${rurySubcat.name}"`);
  }

  // Wyczyść productManualJson na wszystkich 6 RP-* — były tam jako leftover
  const cleared = await db.product.updateMany({
    where: { productCode: { startsWith: "RP-" } },
    data: {
      productManualJson: Prisma.JsonNull,
      manualHeaderRanges: Prisma.JsonNull,
    },
  });
  console.log(`Wyczyszczono productManualJson na ${cleared.count} produktach RP-*`);

  console.log(`\nGotowe. Otwórz /produkty/instrukcje — instrukcja będzie widoczna.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
