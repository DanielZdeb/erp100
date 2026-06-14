import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true },
  });
  if (!company) return;

  // Produkty bez CBM
  const noCbm = await db.product.findMany({
    where: {
      companyId: company.id,
      OR: [{ cbmPerUnit: null }, { cbmPerUnit: 0 }],
    },
    select: {
      productCode: true,
      name: true,
      shippingBoxes: {
        where: { purpose: "FACTORY" },
        select: {
          unitsPerBox: true,
          box: { select: { name: true, widthCm: true, heightCm: true, depthCm: true } },
        },
      },
    },
  });
  console.log(`Produkty BEZ cbmPerUnit (${noCbm.length}):`);
  for (const p of noCbm) {
    const pin = p.shippingBoxes[0];
    console.log(
      `  ${p.productCode.padEnd(20)} pin=${pin ? `${pin.box.name} (${pin.box.widthCm}×${pin.box.heightCm}×${pin.box.depthCm}, ${pin.unitsPerBox} szt)` : "brak"}`,
    );
  }

  // Sample produkty z poprawionym CBM (rury)
  console.log("\nSample (RP-* + PRP-*):");
  const sample = await db.product.findMany({
    where: {
      companyId: company.id,
      productCode: { in: ["RP-SILVER", "RP-GOLD", "PRP-50CM-SILVER"] },
    },
    select: { productCode: true, cbmPerUnit: true, boxWidthCm: true, boxHeightCm: true, boxDepthCm: true, unitsPerBox: true },
  });
  for (const p of sample) {
    console.log(
      `  ${p.productCode.padEnd(20)} cbm=${p.cbmPerUnit?.toFixed(4) ?? "—"} m³ box=${p.boxWidthCm}×${p.boxHeightCm}×${p.boxDepthCm} szt/kart=${p.unitsPerBox}`,
    );
  }

  // Pozycje bez CBM
  const noCbmItems = await db.importOrderItem.findMany({
    where: {
      order: { companyId: company.id },
      OR: [{ cbmPerUnit: null }, { cbmPerUnit: 0 }],
    },
    select: {
      product: { select: { productCode: true } },
      order: { select: { orderNumber: true } },
    },
  });
  console.log(`\nPozycje BEZ cbmPerUnit (${noCbmItems.length}):`);
  for (const it of noCbmItems) {
    console.log(`  ${it.order.orderNumber} : ${it.product.productCode}`);
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
