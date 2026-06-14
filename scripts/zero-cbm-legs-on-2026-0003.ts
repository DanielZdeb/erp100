import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const order = await db.importOrder.findFirst({
    where: {
      orderNumber: "2026-0003",
      company: { name: { contains: "Zdeb" } },
    },
    select: { id: true },
  });
  if (!order) throw new Error("Brak zamówienia 2026-0003 (Zdeb)");

  const updated = await db.importOrderItem.updateMany({
    where: {
      orderId: order.id,
      product: { productCode: { in: ["KD-LEGS-G", "KD-LEGS-B"] } },
    },
    data: { cbmPerUnit: 0 },
  });
  console.log(`Zaktualizowano pozycje: ${updated.count}`);

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
  console.log("\nSKU             QTY     CBM/szt   CBM total");
  for (const it of items) {
    const line = (it.cbmPerUnit ?? 0) * it.quantity;
    totalCbm += line;
    console.log(
      it.product.productCode.padEnd(16),
      String(it.quantity).padStart(5),
      "  " + (it.cbmPerUnit?.toFixed(5) ?? "—").padStart(7),
      "   " + line.toFixed(3).padStart(7) + " m³",
    );
  }
  console.log(`\nSuma CBM: ${totalCbm.toFixed(3)} m³  /  68 m³ kontener  =  ${((totalCbm / 68) * 100).toFixed(1)}% wypełnienia`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
