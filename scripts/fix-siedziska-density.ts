/**
 * Korekta gęstości siedzisk Krzesła D:
 *   stare: 2941 szt / 68 m³ → 0.02312 m³/szt
 *   nowe:  1470 szt / 68 m³ → 0.04658 m³/szt
 *
 * Aktualizujemy `unitsPerContainer` na wszystkich 7 siedziskach. cbmPerUnit
 * zostawiamy null — auto-kalkulacja na bieżąco z referenceContainerM3.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SEAT_SKUS = [
  "KD-LIGHTBEIGE",
  "KD-POWDERPINK",
  "KD-DARKBEIGE",
  "KD-BLACK",
  "KD-DARKGRAY",
  "KD-GRAY",
  "KD-NAVYBLUE",
];

async function main() {
  const updated = await db.product.updateMany({
    where: { productCode: { in: SEAT_SKUS } },
    data: {
      unitsPerContainer: 1470,
      cbmPerUnit: null, // auto-recalc
    },
  });
  console.log(`✓ Zaktualizowano siedziska: ${updated.count}/${SEAT_SKUS.length}`);
  console.log(`Nowa gęstość: 68 m³ / 1470 szt = ${(68 / 1470).toFixed(5)} m³/szt`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
