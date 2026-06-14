/**
 * Recompute cbmPerUnit dla produktów ACRO4F które mają ustawiony karton zbiorczy
 * (masterBoxWidthCm + innerBoxesPerMaster). Master ma priorytet bo zawiera
 * realną gęstość pakowania (puste przestrzenie w masterze są wliczane).
 *
 *   cbmPerUnit = (masterW × masterH × masterD / 1_000_000)
 *                / (innerBoxesPerMaster × unitsPerBox)
 *
 * Aktualizuje też snapshot cbmPerUnit w ImportOrderItem dla tych produktów.
 *
 *   npx tsx prisma/recompute-acro4f-cbm-master.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cbmFromMasterBox } from "../src/lib/kalkulacje";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("ACRO4F nie istnieje.");
  console.log(`Cel: ${company.name}\n`);

  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      archived: false,
      masterBoxWidthCm: { not: null },
      masterBoxHeightCm: { not: null },
      masterBoxDepthCm: { not: null },
      innerBoxesPerMaster: { not: null, gt: 0 },
      unitsPerBox: { not: null, gt: 0 },
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      masterBoxWidthCm: true,
      masterBoxHeightCm: true,
      masterBoxDepthCm: true,
      innerBoxesPerMaster: true,
      unitsPerBox: true,
      cbmPerUnit: true,
    },
  });
  console.log(`Produkty z kartonem zbiorczym: ${products.length}`);

  let updated = 0;
  let unchanged = 0;
  for (const p of products) {
    const newCbm = cbmFromMasterBox(
      p.masterBoxWidthCm,
      p.masterBoxHeightCm,
      p.masterBoxDepthCm,
      p.innerBoxesPerMaster,
      p.unitsPerBox,
    );
    if (newCbm == null) continue;
    if (p.cbmPerUnit != null && Math.abs(p.cbmPerUnit - newCbm) < 1e-5) {
      unchanged++;
      continue;
    }
    await db.product.update({
      where: { id: p.id },
      data: { cbmPerUnit: newCbm },
    });
    console.log(
      `  ${p.productCode}: ${p.cbmPerUnit?.toFixed(4) ?? "—"} → ${newCbm.toFixed(4)}`,
    );
    updated++;
  }
  console.log(`\n✓ Zaktualizowano: ${updated}, bez zmian: ${unchanged}\n`);

  // ── Re-snapshot ImportOrderItem.cbmPerUnit ────────────────────────
  const items = await db.importOrderItem.findMany({
    where: {
      order: { companyId: company.id },
      productId: { in: products.map((p) => p.id) },
    },
    select: {
      id: true,
      productId: true,
      cbmPerUnit: true,
      product: { select: { cbmPerUnit: true, productCode: true } },
    },
  });
  console.log(`Pozycje zamówień do re-snapshotu: ${items.length}`);
  let itemsFixed = 0;
  for (const it of items) {
    const newCbm = it.product.cbmPerUnit;
    if (newCbm == null) continue;
    if (it.cbmPerUnit != null && Math.abs(it.cbmPerUnit - newCbm) < 1e-5)
      continue;
    await db.importOrderItem.update({
      where: { id: it.id },
      data: { cbmPerUnit: newCbm },
    });
    itemsFixed++;
  }
  console.log(`  ✓ zaktualizowano ${itemsFixed} pozycji`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
