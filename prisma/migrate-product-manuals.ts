/**
 * Migracja: dla każdego Productu z istniejącą instrukcją (productManualJson,
 * manualTemplate inne niż domyślne, lub manualHeaderRanges) tworzy osobny
 * ProductManual i przypisuje do niego ten produkt. Stare pola na Product
 * zostawiamy nietknięte (backward compat) — frontend będzie czytał z nowych.
 *
 *   npx tsx prisma/migrate-product-manuals.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Znajdź produkty z istniejącą treścią instrukcji
  const products = await db.product.findMany({
    where: {
      OR: [
        { productManualJson: { not: { equals: null as never } } },
        { manualHeaderRanges: { not: { equals: null as never } } },
      ],
    },
    select: {
      id: true,
      name: true,
      companyId: true,
      productCode: true,
      productManualJson: true,
      manualTemplate: true,
      manualPageSize: true,
      manualHeaderLang: true,
      manualHeaderTitle: true,
      manualHeaderRanges: true,
      manualFooterCustom: true,
      manualAssignments: { select: { id: true } },
    },
  });

  console.log(`Produkty z instrukcją do migracji: ${products.length}\n`);

  let created = 0;
  let skipped = 0;
  for (const p of products) {
    if (p.manualAssignments.length > 0) {
      console.log(`  · ${p.productCode} — już zassignowany, pomijam`);
      skipped++;
      continue;
    }
    const name = `Instrukcja: ${p.name}`.slice(0, 200);
    // Wstaw lub znajdź istniejącą po nazwie (idempotentność migracji)
    const existing = await db.productManual.findFirst({
      where: { companyId: p.companyId, name },
      select: { id: true },
    });
    let manualId: string;
    if (existing) {
      manualId = existing.id;
      console.log(`  · ${p.productCode}: użyto istniejącej "${name}"`);
    } else {
      const m = await db.productManual.create({
        data: {
          companyId: p.companyId,
          name,
          manualJson: p.productManualJson ?? undefined,
          template: p.manualTemplate,
          pageSize: p.manualPageSize,
          headerLang: p.manualHeaderLang,
          headerTitle: p.manualHeaderTitle,
          headerRanges: p.manualHeaderRanges ?? undefined,
          footerCustom: p.manualFooterCustom,
        },
        select: { id: true },
      });
      manualId = m.id;
      created++;
      console.log(`  ✓ ${p.productCode} — utworzono ProductManual ${manualId}`);
    }
    // Przypisz produkt do tej instrukcji
    await db.productManualProduct.upsert({
      where: { manualId_productId: { manualId, productId: p.id } },
      create: { manualId, productId: p.id },
      update: {},
    });
  }

  console.log(`\n✓ Utworzono ${created} nowych instrukcji, ${skipped} pominięto.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
