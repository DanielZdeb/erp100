/**
 * Usuń produkt SZA-0002 ("Materiał szarfa 6x1,5 m Fiolet") z bazy ACRO4F.
 * Sprawdza zależności (orderItems, productComponents, shippingBoxes) i usuwa
 * kaskadowo to co da się — onDelete: Cascade na ProductShippingBox, komponentach.
 * Order items mają restrict — jeśli produkt jest w zamówieniu, deletion failuje.
 *
 *   npx tsx prisma/delete-acro4f-sza-0002.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("ACRO4F nie istnieje.");

  const product = await db.product.findFirst({
    where: { companyId: company.id, productCode: "SZA-0002" },
    select: {
      id: true,
      name: true,
      productCode: true,
      isComponent: true,
      _count: {
        select: {
          orderItems: true,
          components: true,
          asComponentIn: true,
        },
      },
    },
  });
  if (!product) {
    console.log("Nie znaleziono produktu SZA-0002.");
    await db.$disconnect();
    return;
  }

  console.log(`Znaleziony produkt:`);
  console.log(`  • ${product.productCode} — ${product.name}`);
  console.log(`  • komponent: ${product.isComponent}`);
  console.log(`  • orderItems: ${product._count.orderItems}`);
  console.log(`  • components (slots): ${product._count.components}`);
  console.log(`  • used as component in: ${product._count.asComponentIn}`);

  if (product._count.orderItems > 0) {
    console.error(
      `\n✘ Produkt jest w ${product._count.orderItems} zamówieniach — najpierw usuń pozycje zamówień.`,
    );
    await db.$disconnect();
    process.exit(1);
  }

  // Pokaż w czym jest używany jako komponent — żeby user wiedział co stracił.
  if (product._count.asComponentIn > 0) {
    const usedIn = await db.productComponent.findMany({
      where: { componentId: product.id },
      select: {
        product: { select: { productCode: true, name: true } },
      },
    });
    console.log(`\nUsuwam też powiązania (komponent w ${usedIn.length} produktach):`);
    for (const u of usedIn) {
      console.log(`  · ${u.product.productCode} — ${u.product.name}`);
    }
  }

  await db.$transaction([
    db.productComponent.deleteMany({ where: { componentId: product.id } }),
    db.product.delete({ where: { id: product.id } }),
  ]);
  console.log(`\n✓ Usunięto produkt ${product.productCode}.`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
