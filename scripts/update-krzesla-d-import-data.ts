/**
 * Aktualizuje 7 wariantów kolorystycznych Krzesła D danymi importowymi:
 * - importMode: LUZEM
 * - unitsPerContainer: 2941 (do kontenera 68 m³)
 * - referenceContainerM3: 68
 * - wymiary: 45×54×58 cm (szer×głęb×wys)
 * - defaultUnitPriceUsd: 8.464 (cena zakupu w Chinach per sztuka)
 *
 * Nie usuwa nic — produkty są w aktywnym zamówieniu, modyfikuje tylko
 * specyfikację importową.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TARGETS: Array<{ sku: string; ean: string }> = [
  { sku: "KD-LIGHTBEIGE", ean: "5906546531846" },
  { sku: "KD-POWDERPINK", ean: "5906546531853" },
  { sku: "KD-DARKBEIGE", ean: "5906546531860" },
  { sku: "KD-BLACK", ean: "5906546531877" },
  { sku: "KD-DARKGRAY", ean: "5906546531884" },
  { sku: "KD-GRAY", ean: "5906546531891" },
  { sku: "KD-NAVYBLUE", ean: "5906546531907" },
];

async function main() {
  let updated = 0;
  let missing = 0;
  for (const t of TARGETS) {
    const p = await db.product.findFirst({
      where: { productCode: t.sku },
      select: { id: true, productCode: true, eanCode: true, name: true },
    });
    if (!p) {
      console.log(`  ❌ Nie znaleziono ${t.sku}`);
      missing++;
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
        unitsPerContainer: 2941,
        referenceContainerM3: 68,
        widthCm: 45,
        depthCm: 54,
        heightCm: 58,
        defaultUnitPriceUsd: 8.464,
        // Reset wymiarów kartonu (LUZEM → nie ma kartonu importowego)
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
        // cbmPerUnit zostawiamy null — autokalkulacja zrobi: 68/2941 = 0.02312
        cbmPerUnit: null,
      },
    });
    console.log(`  ✓ ${t.sku}  ${p.name}`);
    updated++;
  }
  console.log(`\nGotowe. Zaktualizowano: ${updated}/${TARGETS.length}, brakuje: ${missing}`);
  console.log(`\nKalkulacja cbm/szt: 68 m³ / 2941 szt = ${(68 / 2941).toFixed(5)} m³/szt`);
  console.log(`Cena pełnego kontenera: 8.464 × 2941 = $${(8.464 * 2941).toFixed(2)}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
