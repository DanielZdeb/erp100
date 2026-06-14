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
  if (!company) return;

  const totalImages = await db.productImage.count({
    where: { product: { companyId: company.id } },
  });

  const productsWithImages = await db.product.count({
    where: { companyId: company.id, images: { some: {} } },
  });
  const productsWithoutImages = await db.product.count({
    where: { companyId: company.id, images: { none: {} } },
  });

  console.log(`${company.name}:`);
  console.log(`  zdjęcia łącznie: ${totalImages}`);
  console.log(`  produkty ze zdjęciami: ${productsWithImages}`);
  console.log(`  produkty bez zdjęć: ${productsWithoutImages}`);
  console.log(
    `  średnia zdjęć / produkt: ${(totalImages / Math.max(1, productsWithImages)).toFixed(1)}`,
  );

  // Pokaż przykład pierwszego produktu z primary
  const sample = await db.product.findFirst({
    where: { companyId: company.id, images: { some: {} } },
    select: {
      name: true,
      images: {
        orderBy: { sortOrder: "asc" },
        take: 3,
        select: { url: true, isPrimary: true, sortOrder: true },
      },
    },
  });
  if (sample) {
    console.log(`\nPrzykład: ${sample.name}`);
    for (const img of sample.images) {
      const tag = img.isPrimary ? "[PRIMARY]" : "         ";
      console.log(`  ${tag} #${img.sortOrder}: ${img.url}`);
    }
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
