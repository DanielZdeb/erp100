/**
 * Auto-przypisanie: produkty „Hamki do jogi" (CN) →
 *   karton zbiorczy = ShippingBox 60×40×50 (CHINA_STANDARD, isCollective=true)
 *     z purposeText "Hamki do jogi z chin"
 *   innerBoxesPerMaster = 12 sztuk pudełek (inner) na 1 zbiorczy
 *
 * Wpisuje wymiary masterBox na produkcie (masterBoxWidthCm/HeightCm/DepthCm)
 * + innerBoxesPerMaster. Dodatkowo pinuje box jako primary do produktu jako
 * COLLECTIVE relację (jeśli model na to pozwala — schema pokazuje
 * ProductShippingBox z purpose BoxPurpose, nie ma osobnego "COLLECTIVE" więc
 * wymiary trzymamy tylko bezpośrednio na Product).
 *
 *   npx tsx prisma/fix-acro4f-hamki-master.ts
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
  console.log(`Cel: ${company.name}\n`);

  // ── Znajdź karton zbiorczy ───────────────────────────────────────
  // Filtr: CHINA_STANDARD + isCollective + wymiary 60×40×50.
  const box = await db.shippingBox.findFirst({
    where: {
      companyId: company.id,
      origin: "CHINA_STANDARD",
      isCollective: true,
      widthCm: 60,
      heightCm: 40,
      depthCm: 50,
    },
    select: {
      id: true,
      name: true,
      widthCm: true,
      heightCm: true,
      depthCm: true,
      purposeText: true,
    },
  });
  if (!box) {
    console.error(
      "Nie znaleziono kartonu zbiorczego 60×40×50 (CHINA_STANDARD).",
    );
    process.exit(1);
  }
  console.log(
    `Karton zbiorczy: ${box.name} (${box.widthCm}×${box.heightCm}×${box.depthCm} cm)\n`,
  );

  // ── Znajdź produkty Hamki do jogi (CN) ────────────────────────────
  // Pattern: nazwa zawiera "Hamki do jogi" — case-insensitive.
  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      archived: false,
      name: { contains: "Hamak do jogi", mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      productCode: true,
      masterBoxWidthCm: true,
      masterBoxHeightCm: true,
      masterBoxDepthCm: true,
      innerBoxesPerMaster: true,
    },
  });
  console.log(`Produktów do aktualizacji: ${products.length}`);
  for (const p of products) {
    console.log(`  • ${p.productCode} — ${p.name}`);
  }
  console.log();

  let updated = 0;
  for (const p of products) {
    await db.product.update({
      where: { id: p.id },
      data: {
        masterBoxWidthCm: box.widthCm,
        masterBoxHeightCm: box.heightCm,
        masterBoxDepthCm: box.depthCm,
        innerBoxesPerMaster: 12,
      },
    });
    updated++;
  }
  console.log(
    `✓ Zaktualizowano ${updated} produktów: zbiorczy ${box.widthCm}×${box.heightCm}×${box.depthCm}, inner/zbiorczy=12`,
  );

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
