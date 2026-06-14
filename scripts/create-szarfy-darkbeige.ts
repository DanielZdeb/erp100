/**
 * Tworzy 3 nowe zestawy szarf akrobatycznych w kolorze ciemnobeżowym:
 *   - AS-6M-DARKBEIGE
 *   - AS-7M-DARKBEIGE
 *   - AS-8M-DARKBEIGE
 *
 * Wzorzec skopiowany z istniejących AS-*M-BLACK (najnowsze, świeżo
 * skonwertowane do ZESTAW przez convert-szarfy-to-zestawy.ts):
 *   • compositionMode = ZESTAW + requiredComponentsTotal = 2
 *   • bundleShippingMode = SINGLE_CARTON
 *     bundleShippingBoxId = „katron na nowe szafrt"
 *   • komponenty: M-AS-150-{N}M-DARKBEIGE × 1 + AERIALSILK-SET-BLACK × 1
 *   • ceny domyślne identyczne jak BLACK (per długość)
 *
 * EAN: zostawiamy null — user uzupełnia ręcznie w UI po utworzeniu.
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
const BUNDLE_BOX_NAME = "katron na nowe szafrt";

const SZARFY = [
  {
    code: "AS-6M-DARKBEIGE",
    name: "Szarfa akrobatyczna aerial silk | 6 m | Ciemnobeżowa",
    materialSku: "M-AS-150-6M-DARKBEIGE",
    categoryName: "6 m",
    priceAllegroPln: 324.39,
    priceSklepPln: 324.39,
  },
  {
    code: "AS-7M-DARKBEIGE",
    name: "Szarfa akrobatyczna aerial silk | 7 m | Ciemnobeżowa",
    materialSku: "M-AS-150-7M-DARKBEIGE",
    categoryName: "7 m",
    priceAllegroPln: 365.04,
    priceSklepPln: 365.04,
  },
  {
    code: "AS-8M-DARKBEIGE",
    name: "Szarfa akrobatyczna aerial silk | 8 m | Ciemnobeżowa",
    materialSku: "M-AS-150-8M-DARKBEIGE",
    categoryName: "8 m",
    priceAllegroPln: 405.69,
    priceSklepPln: 405.69,
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  // 1) Wspólne zależności
  const mocowanie = await db.product.findFirst({
    where: { productCode: MOCOWANIE_SKU },
    select: { id: true, companyId: true },
  });
  if (!mocowanie) {
    console.error(`[!] Brak komponentu mocowania ${MOCOWANIE_SKU}.`);
    return;
  }
  const companyId = mocowanie.companyId;
  if (!companyId) {
    console.error(`[!] Komponent ${MOCOWANIE_SKU} nie ma companyId.`);
    return;
  }
  const box = await db.shippingBox.findFirst({
    where: { name: BUNDLE_BOX_NAME, archived: false, companyId },
    select: { id: true },
  });
  if (!box) {
    console.error(`[!] Brak pudełka „${BUNDLE_BOX_NAME}".`);
    return;
  }

  console.log(`Mocowanie: ${MOCOWANIE_SKU} [${mocowanie.id}]`);
  console.log(`Pudełko: ${BUNDLE_BOX_NAME} [${box.id}]`);
  console.log(`Company: ${companyId}`);

  // Kategorie „6 m"/„7 m"/„8 m" duplikują się w bazie (PL-materiały i
  // CN-Zestaw). Bierzemy te z parent = „Szarfy akrobatyczne CN - Zestaw"
  // — to ten sam parent co AS-*M-BLACK używają.
  const blackTemplate = await db.product.findFirst({
    where: { productCode: "AS-6M-BLACK", companyId },
    select: { category: { select: { parentId: true, parent: { select: { name: true } } } } },
  });
  const correctParentId = blackTemplate?.category?.parentId ?? null;
  const correctParentName = blackTemplate?.category?.parent?.name ?? "?";
  console.log(
    `Parent kategorii: „${correctParentName}" [${correctParentId}]\n`,
  );

  // 2) Per-zestaw — sprawdź zależności + utwórz (idempotentnie)
  for (const sz of SZARFY) {
    console.log(`── ${sz.code} ──`);

    const exists = await db.product.findFirst({
      where: { productCode: sz.code, companyId },
      select: { id: true },
    });
    if (exists) {
      console.log(`  [OK]   już istnieje [${exists.id}], pomijam.`);
      continue;
    }
    const material = await db.product.findFirst({
      where: { productCode: sz.materialSku, companyId },
      select: { id: true, name: true },
    });
    if (!material) {
      console.log(`  [!]    brak materiału ${sz.materialSku} — POMIJAM.`);
      continue;
    }
    const category = await db.category.findFirst({
      where: {
        name: sz.categoryName,
        companyId,
        parentId: correctParentId,
      },
      select: { id: true },
    });
    if (!category) {
      console.log(
        `  [!]    brak kategorii „${sz.categoryName}" pod parent „${correctParentName}" — POMIJAM.`,
      );
      continue;
    }
    console.log(`  [NEW]  ${sz.name}`);
    console.log(`         kategoria: ${sz.categoryName} [${category.id}]`);
    console.log(`         materiał: ${sz.materialSku} [${material.id}]`);
    console.log(`         cena: ${sz.priceAllegroPln} zł (Allegro = Sklep)`);

    if (!apply) continue;

    await db.product.create({
      data: {
        companyId,
        productCode: sz.code,
        name: sz.name,
        categoryId: category.id,
        status: "AKTYWNY",
        weightKg: 2.399,
        compositionMode: "ZESTAW",
        requiredComponentsTotal: 2,
        bundleShippingMode: "SINGLE_CARTON",
        bundleShippingBoxId: box.id,
        defaultSalePriceAllegroPln: sz.priceAllegroPln,
        defaultSalePriceSklepPln: sz.priceSklepPln,
        components: {
          create: [
            { componentId: material.id, quantity: 1, sortOrder: 0 },
            { componentId: mocowanie.id, quantity: 1, sortOrder: 1 },
          ],
        },
      },
    });
    console.log(`  [✓]    utworzono.`);
  }

  if (!apply) {
    console.log(
      "\nTO BYŁ DRY-RUN. Aby utworzyć: npx tsx scripts/create-szarfy-darkbeige.ts --apply",
    );
  } else {
    console.log("\nGotowe.");
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
