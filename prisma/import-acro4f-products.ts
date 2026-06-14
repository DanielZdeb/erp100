/**
 * Import produktów ACRO4F z `towary/acro4f.xml` (format IOF / IAI Shop).
 *
 * Strategia:
 *  - Parsuje XML przez fast-xml-parser
 *  - Bierze TYLKO polskie wersje (xml:lang="pol") — niemieckie pomija
 *  - Tworzy kategorie (level 1) jeśli nie istnieją w firmie ACRO4F
 *  - Tworzy produkty, mapując pola:
 *      - name        ← <name xml:lang="pol"> z <description>
 *      - productCode ← @code_on_card lub iaiext:code_external
 *      - eanCode     ← <size>.code_producer (GTIN13)
 *      - code128     ← null (brak w źródle)
 *      - categoryId  ← słownik z polskiej kategorii
 *      - vatRatePct  ← @vat
 *      - producer    ← <producer>.@name
 *      - weightKg    ← <size>.@weight w gramach / 1000
 *      - shortDescription ← <short_desc xml:lang="pol">
 *      - shopDescription  ← <long_desc xml:lang="pol">
 *      - storeUrl    ← <card>.@url
 *      - iaiId       ← @id
 *      - iaiGroupId  ← <group>.@id (jeśli istnieje)
 *      - defaultSalePriceAllegroPln / defaultSalePriceSklepPln ← <price>.@net
 *      - warrantyName / warrantyMonths / warrantyType ← <warranty>
 *  - status: AKTYWNY, compositionMode: CALOSCIOWY, importMode: KARTON
 *  - Pomija produkt jeśli SKU już istnieje w firmie (idempotentny)
 *
 * Uruchomienie: npx tsx prisma/import-acro4f-products.ts
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

// ─── Helpers ────────────────────────────────────────────────────────

/** Wybiera element z tablicy lokalizacji po xml:lang="pol". */
function pickPol<T extends { "@_xml:lang"?: string }>(
  arr: T | T[] | undefined,
): T | null {
  if (!arr) return null;
  const list = Array.isArray(arr) ? arr : [arr];
  return list.find((x) => x["@_xml:lang"] === "pol") ?? list[0] ?? null;
}

function cdataText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object") {
    // fast-xml-parser może zwrócić { "#text": "..." } albo bezpośrednio string
    const t = (v as { "#text"?: string })["#text"];
    if (typeof t === "string") return t.trim() || null;
  }
  return null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  // 1. Firma docelowa
  const company = await db.company.findUnique({
    where: { slug: TARGET_COMPANY_SLUG },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error(`Firma slug=${TARGET_COMPANY_SLUG} nie istnieje.`);
    process.exit(1);
  }
  console.log(`Cel: ${company.name} (companyId=${company.id})`);
  const companyId = company.id;

  // 2. Wczytaj XML
  console.log(`Wczytuję ${XML_PATH}…`);
  const raw = readFileSync(XML_PATH, "utf-8");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    cdataPropName: "#cdata",
    parseAttributeValue: false,
    isArray: (name) => {
      // Sekcje które mogą być pojedyncze lub tablicą — zawsze tablica.
      return [
        "product",
        "name",
        "long_desc",
        "short_desc",
        "iaiext:card_translation",
        "iaiext:unit_translation",
        "iaiext:category_translation",
        "iaiext:warranty_translation",
        "size",
        "image",
      ].includes(name);
    },
  });

  const parsed = parser.parse(raw);
  const products = parsed.offer?.products?.product;
  if (!Array.isArray(products)) {
    console.error("Brak <product> w XML lub niepoprawny format.");
    process.exit(1);
  }
  console.log(`Znaleziono ${products.length} produktów.`);

  // 3. Zbuduj słownik kategorii (cache name → categoryId)
  const categoryCache = new Map<string, string>();

  async function ensureCategory(name: string): Promise<string> {
    const cached = categoryCache.get(name);
    if (cached) return cached;
    // Szukaj istniejącej w firmie
    const existing = await db.category.findFirst({
      where: { companyId, name },
      select: { id: true },
    });
    if (existing) {
      categoryCache.set(name, existing.id);
      return existing.id;
    }
    // Stwórz nową (level 1, bez rodzica)
    let slug = slugify(name) || "kategoria";
    let suffix = 1;
    while (
      await db.category.findFirst({
        where: { companyId, slug },
        select: { id: true },
      })
    ) {
      suffix++;
      slug = `${slugify(name)}-${suffix}`;
    }
    const created = await db.category.create({
      data: {
        companyId,
        name,
        slug,
        level: 1,
        parentId: null,
        sortOrder: 0,
      },
      select: { id: true },
    });
    console.log(`  + kategoria: "${name}" (id=${created.id})`);
    categoryCache.set(name, created.id);
    return created.id;
  }

  // 4. Pętla po produktach
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const p of products) {
    try {
      // SKU — preferuj code_on_card, fallback do iaiext:code_external
      const sku =
        cdataText(p["@_code_on_card"]) ??
        cdataText(p["@_iaiext:code_external"]) ??
        null;
      if (!sku) {
        console.warn(`  ! brak SKU dla product id=${p["@_id"]} — pomijam`);
        skipped++;
        continue;
      }

      // Czy już istnieje?
      const exists = await db.product.findFirst({
        where: { companyId, productCode: sku },
        select: { id: true },
      });
      if (exists) {
        skipped++;
        continue;
      }

      // Kategoria — bierzemy <category> z xml:lang="pol"
      const categoryNode = pickPol(p["category"]);
      const categoryName = cdataText(categoryNode?.["@_name"]);
      const categoryId = categoryName ? await ensureCategory(categoryName) : null;

      // Producent
      const producerName = cdataText(p.producer?.["@_name"]);

      // VAT
      const vatRatePct = numOrNull(p["@_vat"]);

      // Nazwa polska
      const descNames = p.description?.name as
        | Array<{ "@_xml:lang": string; "#cdata"?: string }>
        | undefined;
      const polNameNode = descNames?.find((n) => n["@_xml:lang"] === "pol");
      const name = cdataText(polNameNode?.["#cdata"]) ?? sku;

      // Opisy polskie
      const longDescs = p.description?.long_desc as
        | Array<{ "@_xml:lang": string; "#cdata"?: string }>
        | undefined;
      const polLong = longDescs?.find((n) => n["@_xml:lang"] === "pol");
      const shopDescription = cdataText(polLong?.["#cdata"]);

      const shortDescs = p.description?.short_desc as
        | Array<{ "@_xml:lang": string; "#cdata"?: string }>
        | undefined;
      const polShort = shortDescs?.find((n) => n["@_xml:lang"] === "pol");
      const shortDescription = cdataText(polShort?.["#cdata"]);

      // Card / URL
      const cardUrl = cdataText(p.card?.["@_url"]);

      // Gwarancja
      const warrantyName = cdataText(p.warranty?.["@_name"]);
      const warrantyMonths = numOrNull(p.warranty?.["@_period"]);
      const warrantyType = cdataText(p.warranty?.["@_type"]);

      // Sizes — bierzemy pierwszy size (single-variant produkt)
      const sizes = p.sizes?.size as
        | Array<{
            "@_weight"?: string;
            "@_code_producer"?: string;
            price?: {
              "@_gross"?: string;
              "@_net"?: string;
            };
          }>
        | undefined;
      const firstSize = sizes?.[0];

      // Waga: weight to gramy (np. 17500 = 17.5 kg)
      const weightGrams = numOrNull(firstSize?.["@_weight"]);
      const weightKg = weightGrams != null ? weightGrams / 1000 : null;

      // EAN — code_producer (GTIN13)
      const eanCode = cdataText(firstSize?.["@_code_producer"]);

      // Ceny — preferuj net, fallback do gross (z VAT)
      const priceNet = numOrNull(firstSize?.price?.["@_net"]);

      // IAI ids
      const iaiId = cdataText(p["@_id"]);
      const iaiGroupId = cdataText(p.group?.["@_id"]);

      // Walidacja EAN unique per firma
      let eanFinal: string | null = eanCode;
      if (eanFinal) {
        const eanConflict = await db.product.findFirst({
          where: { companyId, eanCode: eanFinal },
          select: { id: true },
        });
        if (eanConflict) eanFinal = null; // pomijamy duplikat zamiast crash
      }
      // iaiId unique per firma
      let iaiIdFinal: string | null = iaiId;
      if (iaiIdFinal) {
        const iaiConflict = await db.product.findFirst({
          where: { companyId, iaiId: iaiIdFinal },
          select: { id: true },
        });
        if (iaiConflict) iaiIdFinal = null;
      }

      await db.product.create({
        data: {
          companyId,
          name,
          productCode: sku,
          eanCode: eanFinal,
          categoryId,
          status: "AKTYWNY",
          importMode: "KARTON",
          compositionMode: "CALOSCIOWY",
          isComponent: false,
          weightKg,
          vatRatePct,
          producer: producerName,
          shortDescription,
          shopDescription,
          storeUrl: cardUrl,
          iaiId: iaiIdFinal,
          iaiGroupId,
          warrantyName,
          warrantyMonths,
          warrantyType,
          // Ceny domyślne — net = netto
          defaultSalePriceAllegroPln: priceNet,
          defaultSalePriceSklepPln: priceNet,
        },
      });
      created++;
      if (created % 10 === 0) {
        console.log(`  utworzono ${created}…`);
      }
    } catch (e) {
      errors++;
      console.error(
        `  ! błąd dla product id=${p["@_id"]} sku=${p["@_code_on_card"]}: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  await db.$disconnect();
  console.log(
    `\n✔ Zakończono: utworzono ${created}, pominięto (już istniało lub brak SKU) ${skipped}, błędów ${errors}.`,
  );
  console.log(`Kategorie unikalne: ${categoryCache.size}`);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
