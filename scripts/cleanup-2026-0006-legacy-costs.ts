/**
 * Usuwa legacy / CN-only koszty z PL zamówienia 2026-0006:
 *  • CLO — CN-specyficzne, w PL nieaplikowalne
 *  • PROWIZJA_POSREDNIKA — j.w.
 *  • CIECIE — legacy oznaczenie z czasów gdy nie było KROJENIE
 *
 * Te rekordy są ukryte w UI PL (sekcja Płatności nie ma na nie wierszy),
 * ale kalkulator je liczy — przez to per szt logistyki wzrasta.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const order = await db.importOrder.findFirst({
    where: { orderNumber: "2026-0006" },
    select: { id: true, country: true },
  });
  if (!order) {
    console.log("Brak zamowienia 2026-0006");
    return;
  }
  if (order.country !== "POLAND") {
    console.log("Zamowienie nie jest PL — nie ruszam.");
    return;
  }
  const res = await db.importOrderCost.deleteMany({
    where: {
      orderId: order.id,
      type: { in: ["CLO", "PROWIZJA_POSREDNIKA", "CIECIE"] },
    },
  });
  console.log(`Usunieto ${res.count} rekordow.`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
