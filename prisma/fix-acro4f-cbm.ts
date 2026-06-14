/**
 * Fix: dla ACRO4F oblicza i zapisuje cbmPerUnit dla produktów oraz pozycji
 * zamówień gdzie jest null/0. Bierze wymiary kartonu z primary FACTORY
 * pinu (ShippingBox), bo XML import nie zapisał wymiarów na samym produkcie.
 *
 *   cbmPerUnit = (boxW × boxH × boxD / 1_000_000) / unitsPerBox
 *
 * Po naprawie pozycji zamówień również recompute potrzebny — bo snapshot
 * w ImportOrderItem.cbmPerUnit jest zamrożony przy dodaniu pozycji.
 *
 * Uruchomienie: npx tsx prisma/fix-acro4f-cbm.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error("ACRO4F nie istnieje.");
    process.exit(1);
  }
  console.log(`Cel: ${company.name}\n`);

  // ── 1. Produkty: oblicz cbmPerUnit z primary FACTORY pinu ────────
  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      OR: [{ cbmPerUnit: null }, { cbmPerUnit: 0 }],
    },
    select: {
      id: true,
      name: true,
      productCode: true,
      boxWidthCm: true,
      boxHeightCm: true,
      boxDepthCm: true,
      unitsPerBox: true,
      shippingBoxes: {
        where: { purpose: "FACTORY" },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          unitsPerBox: true,
          box: {
            select: {
              widthCm: true,
              heightCm: true,
              depthCm: true,
              name: true,
            },
          },
        },
      },
    },
  });
  console.log(`Produkty z brakującym cbmPerUnit: ${products.length}`);

  let prodFixed = 0;
  let prodSkippedNoBox = 0;
  for (const p of products) {
    // Efektywne wymiary: product.box*Cm > primary FACTORY pin > skip
    const factoryPin = p.shippingBoxes[0];
    const w = p.boxWidthCm ?? factoryPin?.box.widthCm ?? null;
    const h = p.boxHeightCm ?? factoryPin?.box.heightCm ?? null;
    const d = p.boxDepthCm ?? factoryPin?.box.depthCm ?? null;
    const upb = p.unitsPerBox ?? factoryPin?.unitsPerBox ?? null;

    if (w == null || h == null || d == null || upb == null || upb <= 0) {
      prodSkippedNoBox++;
      continue;
    }
    const cbm = (w * h * d) / 1_000_000 / upb;
    await db.product.update({
      where: { id: p.id },
      data: {
        cbmPerUnit: cbm,
        // Sync wymiarów importowych z pinu jeśli na produkcie były null
        // (potrzebne też dla auto-recalc w innych miejscach kodu)
        boxWidthCm: p.boxWidthCm ?? w,
        boxHeightCm: p.boxHeightCm ?? h,
        boxDepthCm: p.boxDepthCm ?? d,
        unitsPerBox: p.unitsPerBox ?? upb,
      },
    });
    prodFixed++;
  }
  console.log(
    `  ✓ zaktualizowano: ${prodFixed} produkt(ów)\n  ⚠ pominięto (brak boxa lub upb): ${prodSkippedNoBox}\n`,
  );

  // ── 2. Pozycje zamówień (snapshot cbmPerUnit) ─────────────────────
  const items = await db.importOrderItem.findMany({
    where: {
      order: { companyId: company.id },
      OR: [{ cbmPerUnit: null }, { cbmPerUnit: 0 }],
    },
    select: {
      id: true,
      productId: true,
      product: { select: { cbmPerUnit: true, productCode: true } },
    },
  });
  console.log(`Pozycje zamówień z brakującym cbmPerUnit: ${items.length}`);

  let itemsFixed = 0;
  let itemsSkipped = 0;
  for (const it of items) {
    const cbm = it.product.cbmPerUnit;
    if (cbm == null || cbm <= 0) {
      itemsSkipped++;
      continue;
    }
    await db.importOrderItem.update({
      where: { id: it.id },
      data: { cbmPerUnit: cbm },
    });
    itemsFixed++;
  }
  console.log(
    `  ✓ zaktualizowano: ${itemsFixed} pozycji\n  ⚠ pominięto (produkt nadal bez CBM): ${itemsSkipped}\n`,
  );

  console.log("✔ Fix zakończony.");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
