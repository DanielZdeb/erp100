/**
 * Aktualizuje cbmPerUnit na pozycjach siedzisk w zamówieniu 2026-0003 (Zdeb
 * Invest) do nowej wartości 68/1470 m³/szt. Nogi zostawiamy z 0 CBM.
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
  const order = await db.importOrder.findFirst({
    where: {
      orderNumber: "2026-0003",
      company: { name: { contains: "Zdeb" } },
    },
    select: { id: true },
  });
  if (!order) throw new Error("Brak zamówienia 2026-0003");

  const newCbm = 68 / 1470; // 0.046258...
  const updated = await db.importOrderItem.updateMany({
    where: {
      orderId: order.id,
      product: { productCode: { in: SEAT_SKUS } },
    },
    data: { cbmPerUnit: newCbm },
  });
  console.log(`✓ Zaktualizowano pozycji siedzisk: ${updated.count}`);

  const items = await db.importOrderItem.findMany({
    where: { orderId: order.id },
    orderBy: { sortOrder: "asc" },
    select: {
      product: { select: { productCode: true } },
      quantity: true,
      cbmPerUnit: true,
    },
  });
  let totalCbm = 0;
  console.log("\nSKU             QTY     CBM/szt    CBM total");
  for (const it of items) {
    const line = (it.cbmPerUnit ?? 0) * it.quantity;
    totalCbm += line;
    console.log(
      it.product.productCode.padEnd(16),
      String(it.quantity).padStart(5),
      "  " + (it.cbmPerUnit?.toFixed(5) ?? "—").padStart(8),
      "   " + line.toFixed(3).padStart(7) + " m³",
    );
  }
  const containersNeeded = totalCbm / 68;
  console.log(
    `\nSuma CBM: ${totalCbm.toFixed(3)} m³  /  68 m³ kontener  =  ${containersNeeded.toFixed(2)} kontener${containersNeeded >= 2 ? "ów" : "a"}  (${((containersNeeded % 1) * 100).toFixed(1)}% drugiego)`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
