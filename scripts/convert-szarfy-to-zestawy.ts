/**
 * Konwertuje wszystkie produkty „Szarfa akrobatyczna" (CN, SKU `AS-{6,7,8}M-{COLOR}`)
 * na ZESTAWY składające się z:
 *   • komponentu materiału `M-AS-150-{N}M-{COLOR}`  (per kolor + długość)
 *   • komponentu mocowania `AERIALSILK-SET-BLACK`   (zawsze ten sam)
 *
 * Hamak dziecięcy (`AS-4M-*` i `KH-*`) pomijamy — user wyraźnie wskazał
 * tylko szarfy 6 / 7 / 8 m.
 *
 * Bez --apply: dry-run.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MOCOWANIE_SKU = "AERIALSILK-SET-BLACK";

function materialSkuFor(zestawSku: string): string | null {
  // AS-{6,7,8}M-{COLOR} → M-AS-150-{N}M-{COLOR}
  const m = zestawSku.match(/^AS-(\d+M)-(.+)$/);
  if (!m) return null;
  const [, length, color] = m;
  if (!["6M", "7M", "8M"].includes(length.toUpperCase())) return null;
  return `M-AS-150-${length.toUpperCase()}-${color}`;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const mocowanie = await db.product.findFirst({
    where: { productCode: MOCOWANIE_SKU },
    select: { id: true, productCode: true },
  });
  if (!mocowanie) {
    console.error(`[!] Brak komponentu mocowania ${MOCOWANIE_SKU} w bazie.`);
    return;
  }

  // Wszystkie szarfy CN (mode CALOSCIOWY lub już ZESTAW)
  const szarfy = await db.product.findMany({
    where: {
      productCode: { startsWith: "AS-" },
      NOT: [{ productCode: { startsWith: "AS-150-" } }],
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      compositionMode: true,
      requiredComponentsTotal: true,
      components: {
        select: {
          id: true,
          componentId: true,
          quantity: true,
          component: { select: { productCode: true } },
        },
      },
    },
    orderBy: { productCode: "asc" },
  });

  console.log(`Znaleziono ${szarfy.length} szarfy CN.\n`);

  let toUpdate = 0;
  let skipped = 0;
  for (const sz of szarfy) {
    const matSku = materialSkuFor(sz.productCode);
    if (!matSku) {
      console.log(
        `  [SKIP] ${sz.productCode} — nie pasuje do wzorca AS-{6/7/8}M-{COLOR}`,
      );
      skipped++;
      continue;
    }
    const material = await db.product.findFirst({
      where: { productCode: matSku },
      select: { id: true, productCode: true },
    });
    if (!material) {
      console.log(`  [SKIP] ${sz.productCode} — brak materiału ${matSku}`);
      skipped++;
      continue;
    }

    const hasMaterial = sz.components.some(
      (c) => c.componentId === material.id,
    );
    const hasMocowanie = sz.components.some(
      (c) => c.componentId === mocowanie.id,
    );
    const isZestaw = sz.compositionMode === "ZESTAW";

    if (hasMaterial && hasMocowanie && isZestaw && sz.requiredComponentsTotal === 2) {
      console.log(`  [OK]   ${sz.productCode} — już skonfigurowany`);
      continue;
    }

    console.log(
      `  [SET]  ${sz.productCode}  ← ${matSku} + ${mocowanie.productCode}`,
    );
    toUpdate++;

    if (!apply) continue;

    // Zmień mode na ZESTAW
    await db.product.update({
      where: { id: sz.id },
      data: {
        compositionMode: "ZESTAW",
        requiredComponentsTotal: 2,
      },
    });

    // Dodaj komponent materiału (jeśli nie ma)
    if (!hasMaterial) {
      await db.productComponent.create({
        data: {
          productId: sz.id,
          componentId: material.id,
          quantity: 1,
          sortOrder: 0,
        },
      });
    }
    // Dodaj komponent mocowania (jeśli nie ma)
    if (!hasMocowanie) {
      await db.productComponent.create({
        data: {
          productId: sz.id,
          componentId: mocowanie.id,
          quantity: 1,
          sortOrder: 1,
        },
      });
    }
  }

  console.log(
    `\nPodsumowanie: ${toUpdate} do zmiany, ${skipped} pominiętych, ${szarfy.length - toUpdate - skipped} bez zmian (już skonfigurowane).`,
  );
  if (!apply) {
    console.log(
      "\nTO BYL DRY-RUN. Aby zapisać: npx tsx scripts/convert-szarfy-to-zestawy.ts --apply",
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
