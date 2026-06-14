/**
 * Aktualizuje 2 warianty nóg do krzesła D (KD-LEGS-G, KD-LEGS-B) danymi
 * importowymi:
 * - importMode: LUZEM
 * - referenceContainerM3: 68
 * - unitsPerContainer: 68000 (bo 2000 szt zajmuje 2 m³ → skalujemy do 68 m³)
 * - defaultUnitPriceUsd: 5.182 (złote) / 2.073 (czarne)
 *
 * Wymiary nóg nie zostały podane przez usera — zostawiamy null. Karton też,
 * bo LUZEM.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TARGETS: Array<{ sku: string; ean: string; priceUsd: number }> = [
  { sku: "KD-LEGS-G", ean: "5906546531921", priceUsd: 5.182 },
  { sku: "KD-LEGS-B", ean: "5906546531914", priceUsd: 2.073 },
];

async function main() {
  let updated = 0;
  for (const t of TARGETS) {
    const p = await db.product.findFirst({
      where: { productCode: t.sku },
      select: { id: true, productCode: true, name: true, eanCode: true },
    });
    if (!p) {
      console.log(`  ❌ Nie znaleziono ${t.sku}`);
      continue;
    }
    if (p.eanCode && p.eanCode !== t.ean) {
      console.log(
        `  ⚠️  ${t.sku}: EAN w bazie (${p.eanCode}) ≠ ten z listy (${t.ean}) — nadpisuję`,
      );
    }
    await db.product.update({
      where: { id: p.id },
      data: {
        eanCode: t.ean,
        importMode: "LUZEM",
        unitsPerContainer: 68000,
        referenceContainerM3: 68,
        defaultUnitPriceUsd: t.priceUsd,
        // Reset wymiarów kartonu (LUZEM)
        boxWidthCm: null,
        boxHeightCm: null,
        boxDepthCm: null,
        boxWeightKg: null,
        unitsPerBox: null,
        masterBoxWidthCm: null,
        masterBoxHeightCm: null,
        masterBoxDepthCm: null,
        masterBoxWeightKg: null,
        innerBoxesPerMaster: null,
        cbmPerUnit: null, // auto: 68/68000 = 0.001 m³/szt
      },
    });
    console.log(`  ✓ ${t.sku}  ${p.name}  →  $${t.priceUsd}/szt`);
    updated++;
  }
  console.log(`\nGotowe. Zaktualizowano: ${updated}/${TARGETS.length}`);
  console.log(`\nKalkulacja cbm/szt: 2 m³ / 2000 szt = 0.001 m³/szt (= 68/68000)`);
  console.log(`Cena pełnego kontenera złotych: 5.182 × 68000 = $${(5.182 * 68000).toLocaleString()}`);
  console.log(`Cena pełnego kontenera czarnych: 2.073 × 68000 = $${(2.073 * 68000).toLocaleString()}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
