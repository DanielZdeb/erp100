import { PrismaClient } from "../src/generated/prisma/client.js";
const db = new PrismaClient();
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
if (!order) { console.log("Brak zamowienia"); process.exit(0); }
const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
console.log(`Order ${order.orderNumber} (${order.country}), id=${order.id}, totalQty=${totalQty}`);
console.log("Costs:");
for (const c of order.costs) {
  console.log(`  ${c.type.padEnd(22)} ${String(c.amountPln).padStart(12)} zl  paid=${c.paid} name=${c.name ?? ""}`);
}
const sum = order.costs.reduce((s, c) => s + c.amountPln, 0);
console.log(`Total costs: ${sum} zl`);
await db.$disconnect();
