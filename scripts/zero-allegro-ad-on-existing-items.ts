/**
 * Zeruje adCostPln na wszystkich istniejących Allegro saleChannelach w
 * zamówieniach — bo kalkulator listy produktów nie odejmuje adCost dla
 * Allegro, a orders calc tak. To było źródłem rozjazdu marży/zysku.
 *
 * Marketingowy koszt Allegro siedzi w `otherCostPln` (INNE) — tam jest
 * jeden raz odejmowany przez obie strony.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const before = await db.itemSaleChannel.count({
    where: { channel: "Allegro", adCostPln: { not: null } },
  });
  console.log(`Allegro kanałów z adCostPln != null: ${before}`);

  if (before === 0) {
    console.log("Nic do roboty.");
    await db.$disconnect();
    return;
  }

  const updated = await db.itemSaleChannel.updateMany({
    where: { channel: "Allegro", adCostPln: { not: null } },
    data: { adCostPln: null },
  });
  console.log(`✓ Wyzerowano adCostPln na ${updated.count} kanałach Allegro`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
