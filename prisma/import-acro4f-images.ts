/**
 * Import zdjęć produktów ACRO4F z `towary/acro4f.xml`.
 * Strategia:
 *  - external URLs (linki do acro4f.com — nie pobieramy plików)
 *  - rozdzielczość large (1600×1600) z <large><image>
 *  - dopasowanie produktu po iaiId (zapisany przy initial import)
 *  - alt = nazwa produktu (polska)
 *  - isPrimary = priority=1; sortOrder = priority
 *  - idempotentny: pomija produkt który ma już zdjęcia
 *
 * Uruchomienie: npx tsx prisma/import-acro4f-images.ts
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const TARGET_COMPANY_SLUG = "acro4f";
const XML_PATH = join(__dirname, "..", "towary", "acro4f.xml");

async function main() {
  const company = await db.company.findUnique({
    where: { slug: TARGET_COMPANY_SLUG },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error(`Firma ${TARGET_COMPANY_SLUG} nie istnieje.`);
    process.exit(1);
  }
  console.log(`Cel: ${company.name}\n`);
  const companyId = company.id;

  console.log(`Parsuję ${XML_PATH}…`);
  const raw = readFileSync(XML_PATH, "utf-8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    cdataPropName: "#cdata",
    parseAttributeValue: false,
    isArray: (name) =>
      ["product", "image", "name", "long_desc", "short_desc"].includes(name),
  });
  const parsed = parser.parse(raw);
  const products = parsed.offer?.products?.product;
  if (!Array.isArray(products)) {
    console.error("Brak <product> w XML.");
    process.exit(1);
  }
  console.log(`Znaleziono ${products.length} produktów w XML.\n`);

  let totalProductsProcessed = 0;
  let productsSkipped = 0;
  let productsNoMatch = 0;
  let totalImagesCreated = 0;

  for (const p of products) {
    const iaiId = String(p["@_id"] ?? "");
    if (!iaiId) continue;

    // Match po iaiId
    const dbProduct = await db.product.findFirst({
      where: { companyId, iaiId },
      select: {
        id: true,
        name: true,
        _count: { select: { images: true } },
      },
    });
    if (!dbProduct) {
      productsNoMatch++;
      continue;
    }
    if (dbProduct._count.images > 0) {
      productsSkipped++;
      continue;
    }

    // Wyciągnij <images><large><image>
    const largeImages = p.images?.large?.image as
      | Array<{
          "@_url"?: string;
          "@_priority"?: string;
          "@_iaiext:priority"?: string;
        }>
      | undefined;
    if (!Array.isArray(largeImages) || largeImages.length === 0) {
      totalProductsProcessed++;
      continue;
    }

    // Sortuj wg priority (z iaiext:priority lub priority)
    const sorted = largeImages
      .map((img) => ({
        url: img["@_url"] ?? "",
        priority:
          Number(img["@_iaiext:priority"] ?? img["@_priority"] ?? 999) || 999,
      }))
      .filter((img) => img.url)
      .sort((a, b) => a.priority - b.priority);

    if (sorted.length === 0) {
      totalProductsProcessed++;
      continue;
    }

    // Utwórz ProductImage[]
    let primarySet = false;
    for (const img of sorted) {
      await db.productImage.create({
        data: {
          productId: dbProduct.id,
          url: img.url,
          alt: dbProduct.name,
          sortOrder: img.priority,
          isPrimary: !primarySet,
        },
      });
      primarySet = true;
      totalImagesCreated++;
    }

    totalProductsProcessed++;
    if (totalProductsProcessed % 20 === 0) {
      console.log(
        `  przetworzono ${totalProductsProcessed} produktów, dodano ${totalImagesCreated} zdjęć…`,
      );
    }
  }

  await db.$disconnect();
  console.log(`\n✔ Zakończono:`);
  console.log(`  Produkty przetworzone: ${totalProductsProcessed}`);
  console.log(`  Produkty pominięte (już miały zdjęcia): ${productsSkipped}`);
  console.log(`  Produkty bez dopasowania w bazie: ${productsNoMatch}`);
  console.log(`  Zdjęcia dodane: ${totalImagesCreated}`);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
