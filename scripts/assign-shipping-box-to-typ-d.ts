/**
 * Pinuje ShippingBox „Krzesła TYP D" (45×54×58) jako PRIMARY pudełko wysyłkowe
 * do wszystkich 14 ZESTAWÓW krzeseł w TYP-D.
 *
 * Tworzy rekordy ShippingBoxProductRule { purpose: SHIPPING, unitsPerBox: 1,
 * isPrimary: true } — tę relację czyta UI w „Pakowanie wysyłkowe".
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const box = await db.shippingBox.findFirst({
    where: { name: "Krzesła TYP D" },
    select: { id: true },
  });
  if (!box) throw new Error('Brak ShippingBox "Krzesła TYP D"');

  const typD = await db.category.findFirst({ where: { name: "TYP-D" } });
  const sets = await db.product.findMany({
    where: { categoryId: typD!.id, compositionMode: "ZESTAW" },
    select: { id: true, productCode: true },
  });

  let created = 0;
  let skipped = 0;
  for (const p of sets) {
    const existing = await db.shippingBoxProductRule.findFirst({
      where: { boxId: box.id, productId: p.id, purpose: "SHIPPING" },
      select: { id: true },
    });
    if (existing) {
      console.log(`  ⊙ ${p.productCode} już ma to pudełko przypisane`);
      skipped++;
      continue;
    }
    // Wyczyść poprzedni primary dla SHIPPING (jeśli był inny)
    await db.shippingBoxProductRule.updateMany({
      where: { productId: p.id, purpose: "SHIPPING", isPrimary: true },
      data: { isPrimary: false },
    });
    await db.shippingBoxProductRule.create({
      data: {
        boxId: box.id,
        productId: p.id,
        purpose: "SHIPPING",
        unitsPerBox: 1,
        isPrimary: true,
      },
    });
    console.log(`  ✓ ${p.productCode}  →  Krzesła TYP D 45×54×58`);
    created++;
  }

  console.log(`\nGotowe. Utworzono ${created}, pominięto ${skipped}.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
