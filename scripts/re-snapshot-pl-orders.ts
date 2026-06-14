/**
 * Wymusza re-snapshot cen dla WSZYSTKICH zamówień PL w statusie który
 * normalnie wyzwala snapshot (DOGADYWANE i wyżej).
 *
 * Powód: starszy bug w `snapshotOrderPricesToHistory` pomijał `unitPricePln`
 * — dla PL zamówień (które trzymają cenę w PLN bezpośrednio, bez USD/CNY)
 * snapshot zapisywał `factoryPln = null` i lista produktów wczytywała 0 zł.
 *
 * Po fixie kodu (orders.ts) ten skrypt naprawia historyczne dane.
 *
 * Bez --apply: dry-run.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { snapshotOrderPricesToHistory } from "../src/server/orders";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const SNAPSHOT_STATUSES = [
  "DOGADYWANE",
  "PRODUKOWANE",
  "WYPRODUKOWANE",
  "WYSLANE",
  "ODEBRANE",
  "W_MAGAZYNIE",
] as const;

async function main() {
  const apply = process.argv.includes("--apply");

  const orders = await db.importOrder.findMany({
    where: {
      country: "POLAND",
      status: { in: SNAPSHOT_STATUSES as unknown as string[] },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      _count: { select: { items: true } },
    },
    orderBy: { orderNumber: "asc" },
  });

  console.log(
    `Znaleziono ${orders.length} zamowien PL w statusie >= DOGADYWANE.\n`,
  );
  for (const o of orders) {
    console.log(
      `  ${o.orderNumber.padEnd(12)} ${o.status.padEnd(14)} ${o._count.items} pozycji`,
    );
  }

  if (!apply) {
    console.log(
      "\nTO BYL DRY-RUN. Aby zsynchronizowac: npx tsx scripts/re-snapshot-pl-orders.ts --apply",
    );
    return;
  }

  console.log("\nWykonuje snapshot...\n");
  let ok = 0;
  let fail = 0;
  for (const o of orders) {
    try {
      await snapshotOrderPricesToHistory(o.id);
      console.log(`  [OK]    ${o.orderNumber}`);
      ok++;
    } catch (e) {
      console.error(
        `  [FAIL]  ${o.orderNumber}: ${e instanceof Error ? e.message : e}`,
      );
      fail++;
    }
  }
  console.log(`\nZakonczono. OK=${ok}, FAIL=${fail}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
