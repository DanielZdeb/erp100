import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const typD = await db.category.findFirst({
    where: { name: "TYP-D" },
    select: { id: true },
  });
  if (!typD) {
    console.log("Brak kategorii TYP-D");
    return;
  }

  const products = await db.product.findMany({
    where: { categoryId: typD.id },
    select: {
      id: true,
      name: true,
      productCode: true,
      compositionMode: true,
      isComponent: true,
      bundleShippingMode: true,
      _count: {
        select: {
          components: true,
          orderItems: true,
          images: true,
          files: true,
          stageCompletions: true,
        },
      },
    },
  });

  console.log(`Produkty w TYP-D (${products.length}):`);
  for (const p of products) {
    console.log(
      `  ${p.productCode}  ${p.compositionMode}  komp=${p._count.components}  zam=${p._count.orderItems}  img=${p._count.images}  manuals=${p._count.manuals}`,
    );
  }

  // Pokaż jakie konkretnie pozycje zamówień się odwołują
  console.log("\nOdwołania w zamówieniach:");
  for (const p of products) {
    if (p._count.orderItems > 0) {
      const items = await db.importOrderItem.findMany({
        where: { productId: p.id },
        select: {
          id: true,
          quantity: true,
          order: {
            select: {
              orderNumber: true,
              status: true,
              company: { select: { name: true } },
            },
          },
        },
      });
      for (const it of items) {
        console.log(
          `  ${p.productCode} → zamówienie ${it.order.orderNumber} (${it.order.company?.name ?? "?"}) [${it.order.status}] qty=${it.quantity}`,
        );
      }
    }
  }

  // Sprawdź również biblioteki pudełek z "TYP D" lub "krzesło"
  console.log("\nIstniejące ShippingBox z 'krzes' lub 'TYP-D':");
  const boxes = await db.shippingBox.findMany({
    where: {
      OR: [
        { name: { contains: "krzes", mode: "insensitive" } },
        { name: { contains: "TYP D", mode: "insensitive" } },
        { name: { contains: "TYP-D", mode: "insensitive" } },
        { internalCode: { contains: "S-W", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, internalCode: true, widthCm: true, heightCm: true, depthCm: true },
  });
  for (const b of boxes) {
    console.log(
      `  ${b.internalCode ?? "—"}  ${b.name}  ${b.widthCm}×${b.heightCm}×${b.depthCm} cm`,
    );
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
