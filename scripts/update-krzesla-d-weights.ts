/**
 * Ustawia wagi (kg) dla wszystkich produktów krzeseł TYP D:
 * - siedziska (KD-LIGHTBEIGE…KD-NAVYBLUE) — 4 kg
 * - nogi (KD-LEGS-B/G) — 0.5 kg
 * - ZESTAWY (KD-*-B / KD-*-G) — 4.5 kg (suma komponentów)
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
const LEGS_SKUS = ["KD-LEGS-B", "KD-LEGS-G"];

async function main() {
  // siedziska
  const seats = await db.product.updateMany({
    where: { productCode: { in: SEAT_SKUS } },
    data: { weightKg: 4.0 },
  });
  console.log(`✓ Siedziska (4 kg): ${seats.count}/${SEAT_SKUS.length}`);

  // nogi
  const legs = await db.product.updateMany({
    where: { productCode: { in: LEGS_SKUS } },
    data: { weightKg: 0.5 },
  });
  console.log(`✓ Nogi (0.5 kg): ${legs.count}/${LEGS_SKUS.length}`);

  // ZESTAWY — wszystkie produkty w TYP-D z compositionMode=ZESTAW
  const typD = await db.category.findFirst({ where: { name: "TYP-D" } });
  const sets = await db.product.updateMany({
    where: { categoryId: typD!.id, compositionMode: "ZESTAW" },
    data: { weightKg: 4.5 },
  });
  console.log(`✓ ZESTAWY krzeseł (4.5 kg): ${sets.count}`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
