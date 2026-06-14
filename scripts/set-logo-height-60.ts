/**
 * Ustawia `logoHeightPt: 60` we wszystkich istniejących instrukcjach (`ProductManual`).
 * Idempotent — można uruchamiać wielokrotnie.
 *
 * Uruchom: npx tsx scripts/set-logo-height-60.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const result = await db.productManual.updateMany({
    data: { logoHeightPt: 60 },
  });
  console.log(`✓ Zaktualizowano ${result.count} instrukcji — logoHeightPt = 60`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
