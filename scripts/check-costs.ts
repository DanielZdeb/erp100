import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const order = await db.importOrder.findFirst({
    where: { orderNumber: "2026-0006" },
    select: {
      id: true,
      orderNumber: true,
      country: true,
      items: { select: { quantity: true } },
      costs: {
        select: {
          id: true,
          type: true,
          name: true,
          amountPln: true,
          currency: true,
          paid: true,
        },
        orderBy: { type: "asc" },
      },
    },
  });
  if (!order) {
    console.log("Brak zamowienia 2026-0006");
    return;
  }
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  console.log(
    `Order ${order.orderNumber} (${order.country}), id=${order.id}, totalQty=${totalQty}`,
  );
  console.log("\nCosts:");
  console.log(
    "  TYPE                     AMOUNT_PLN  CURR  PAID  NAME",
  );
  for (const c of order.costs) {
    console.log(
      `  ${c.type.padEnd(22)} ${String(c.amountPln).padStart(12)}  ${c.currency.padEnd(4)} ${String(c.paid).padEnd(5)} ${c.name ?? ""}`,
    );
  }
  const sum = order.costs.reduce((s, c) => s + c.amountPln, 0);
  console.log(`\nTotal: ${sum} zl`);
  console.log(
    `\nPer-szt (jesli wszystko by szlo do logistyki): ${(sum / totalQty).toFixed(2)} zl/szt`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
