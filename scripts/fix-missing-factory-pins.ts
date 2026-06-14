/**
 * Naprawa: znajdź produkty które mają wymiary kartonu (boxWidthCm/heightCm/
 * depthCm) ale brak FACTORY pinu w product.shippingBoxes — i auto-przypnij
 * pasujący karton z biblioteki (matching po wymiarach exact, origin=CHINA).
 *
 * Idempotent — bezpieczne wielokrotne uruchamianie. Pomija produkty które już
 * mają jakikolwiek FACTORY pin (nawet jeśli wymiary innego pudełka pasują).
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // Wszystkie produkty z wymiarami kartonu importowego
  const products = await db.product.findMany({
    where: {
      boxWidthCm: { not: null },
      boxHeightCm: { not: null },
      boxDepthCm: { not: null },
      archived: false,
    },
    include: {
      shippingBoxes: {
        select: { id: true, purpose: true, box: { select: { id: true } } },
      },
    },
  });

  // Wszystkie pudełka non-collective z biblioteki — do matchowania
  const libraryBoxes = await db.shippingBox.findMany({
    where: { archived: false, isCollective: false },
    select: { id: true, name: true, widthCm: true, heightCm: true, depthCm: true, origin: true },
  });

  let matched = 0;
  let alreadyPinned = 0;
  let noMatch = 0;
  let attached = 0;

  for (const p of products) {
    const hasFactoryPin = p.shippingBoxes.some((b) => b.purpose === "FACTORY");
    if (hasFactoryPin) {
      alreadyPinned++;
      continue;
    }
    // Match po dokładnych wymiarach (exact). Preferuj origin=CHINA_STANDARD.
    const candidates = libraryBoxes.filter(
      (b) =>
        b.widthCm === p.boxWidthCm &&
        b.heightCm === p.boxHeightCm &&
        b.depthCm === p.boxDepthCm,
    );
    if (candidates.length === 0) {
      noMatch++;
      console.log(
        `  ⚠ Brak matchu: ${p.productCode} (${p.boxWidthCm}×${p.boxHeightCm}×${p.boxDepthCm})`,
      );
      continue;
    }
    matched++;
    // Wybierz CN preferowanie, inaczej pierwszy
    const cn = candidates.find((c) => c.origin === "CHINA_STANDARD");
    const picked = cn ?? candidates[0];
    console.log(
      `  ✓ ${p.productCode}: ${picked.name} (${picked.widthCm}×${picked.heightCm}×${picked.depthCm}, ${picked.origin})`,
    );
    await db.productShippingBox.create({
      data: {
        productId: p.id,
        boxId: picked.id,
        purpose: "FACTORY",
        isPrimary: false,
        unitsPerBox: p.unitsPerBox ?? 1,
      },
    });
    attached++;
  }

  console.log("\nPodsumowanie:");
  console.log(`  Już miały pin:    ${alreadyPinned}`);
  console.log(`  Dopasowane:       ${matched}`);
  console.log(`  Brak matchu:      ${noMatch}`);
  console.log(`  Przypięto:        ${attached}`);
}

main().catch(console.error).finally(() => db.$disconnect());
