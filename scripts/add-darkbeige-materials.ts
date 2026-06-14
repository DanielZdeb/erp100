/**
 * Dodaje 4 nowe produkty materiałowe w kolorze ciemnobeżowy:
 *   M-KH-150-4M-DARKBEIGE
 *   M-AS-150-6M-DARKBEIGE
 *   M-AS-150-7M-DARKBEIGE
 *   M-AS-150-8M-DARKBEIGE
 *
 * Klonuje wszystkie pola scalar (kategoria, ceny, wymiary, lengthM, color)
 * z istniejących produktów BLACK tej samej długości.
 *
 * Bez --apply: dry-run.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const NEW_COLOR_CODE = "DARKBEIGE";
const NEW_COLOR_LABEL = "ciemnobeżowy"; // używane w name

// Lista wariantów: SKU template'a (BLACK) → docelowe SKU + nowa nazwa
const VARIANTS = [
  {
    templateSku: "M-KH-150-4M-BLACK",
    newSku: "M-KH-150-4M-DARKBEIGE",
    newName: "Materiał hamak dla dzieci 4 m - ciemnobeżowy",
  },
  {
    templateSku: "M-AS-150-6M-BLACK",
    newSku: "M-AS-150-6M-DARKBEIGE",
    newName: "Materiał szarfa akrobatyczna 6m - ciemnobeżowa",
  },
  {
    templateSku: "M-AS-150-7M-BLACK",
    newSku: "M-AS-150-7M-DARKBEIGE",
    newName: "Materiał szarfa akrobatyczna 7m - ciemnobeżowa",
  },
  {
    templateSku: "M-AS-150-8M-BLACK",
    newSku: "M-AS-150-8M-DARKBEIGE",
    newName: "Materiał szarfa akrobatyczna 8m - ciemnobeżowa",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");

  for (const v of VARIANTS) {
    const tpl = await db.product.findFirst({
      where: { productCode: v.templateSku },
    });
    if (!tpl) {
      console.error(`[!] Brak template'a ${v.templateSku} — pomijam.`);
      continue;
    }

    const existing = await db.product.findFirst({
      where: { productCode: v.newSku },
      select: { id: true },
    });
    if (existing) {
      console.log(`[SKIP] ${v.newSku} już istnieje (id=${existing.id})`);
      continue;
    }

    console.log(
      `[CREATE] ${v.newSku}  (klon z ${v.templateSku}, kat=${tpl.categoryId ?? "—"}, lengthM=${tpl.lengthM ?? "—"}, pricePerMeter=${tpl.defaultPricePerMeterPln ?? "—"})`,
    );

    if (!apply) continue;

    // Klonuj wszystkie scalar fields oprócz id, productCode, name, EAN/code128.
    // EAN/code128 zostawiamy null bo są unique per firma — user nada ręcznie.
    const {
      id: _id,
      productCode: _pc,
      name: _n,
      eanCode: _ean,
      code128: _c128,
      iaiId: _iai,
      iaiGroupId: _iaig,
      storeUrl: _store,
      createdAt: _ca,
      updatedAt: _ua,
      ...cloneable
    } = tpl;

    await db.product.create({
      data: {
        ...cloneable,
        productCode: v.newSku,
        name: v.newName,
        color: NEW_COLOR_LABEL,
        status: "PLANOWANY",
      },
    });
  }

  if (!apply) {
    console.log("");
    console.log(
      "TO BYL DRY-RUN. Aby utworzyc: npx tsx scripts/add-darkbeige-materials.ts --apply",
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
