/**
 * Import produktów z eksportu IOF (IAI Shop) do ERP.
 *
 * Użycie:
 *   npx tsx scripts/import-iai-xml.ts towary/nogi.xml
 *
 * Co robi:
 *  - Parsuje XML (fast-xml-parser)
 *  - Upsertuje magazyny (po `externalId` = id z IAI)
 *  - Upsertuje kategorię (auto-tworzy level 1 jeśli nie istnieje)
 *  - Upsertuje produkt po `productCode` (= code_on_card z IAI)
 *  - Mapuje parametry IAI (Wysokość, Szerokość, Udźwig, Kształt, Przeznaczenie,
 *    Grubość profili, Podstawa) na odpowiednie pola Product
 *  - Parsuje wagę z opisu HTML (regex „Waga nóg: X kg")
 *  - Zastępuje obrazy (delete + recreate z URL-i)
 *  - Zastępuje stany magazynowe (upsert per magazyn)
 *
 * Cena: bierzemy netto z XML jako `defaultSalePriceSklepPln` (cena 1 jednostki —
 * dla nóg = 1 para). VAT zapisywany osobno.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

import { db } from "@/lib/db";

type AnyRec = Record<string, unknown>;

const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("Użycie: npx tsx scripts/import-iai-xml.ts <path-do-xml>");
  process.exit(1);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
  // Wymusza tablice nawet gdy jest 1 element — łatwiej iterować.
  isArray: (tagName) =>
    ["product", "image", "stock", "parameter", "size"].includes(tagName),
});

const xml = readFileSync(SOURCE, "utf-8");
const doc = parser.parse(xml) as AnyRec;

const productsNode = ((doc.offer as AnyRec).products as AnyRec).product;
const xmlProducts = Array.isArray(productsNode)
  ? (productsNode as AnyRec[])
  : [productsNode as AnyRec];

console.log(`Wczytano ${xmlProducts.length} produktów z ${SOURCE}\n`);

// ─── Helpers ──────────────────────────────────────────────────────────

function asArr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function readText(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "string") return node;
  if (typeof node === "object") {
    const rec = node as AnyRec;
    if (typeof rec["#text"] === "string") return rec["#text"] as string;
  }
  return null;
}

function attrStr(node: AnyRec | undefined, key: string): string | null {
  if (!node) return null;
  const v = node[`@_${key}`];
  if (v == null) return null;
  return String(v);
}

function attrFloat(node: AnyRec | undefined, key: string): number | null {
  const s = attrStr(node, key);
  if (s == null || s === "") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function attrInt(node: AnyRec | undefined, key: string): number | null {
  const n = attrFloat(node, key);
  return n == null ? null : Math.trunc(n);
}

/** Parsuje liczbę z tekstu typu „42 cm", „200 kg", „6x3 cm" → 42 / 200 / null. */
function parseLeadingNumber(s: string | null): number | null {
  if (s == null) return null;
  const m = s.match(/^\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Parsuje wagę z opisu HTML: „Waga nóg:</strong> 3 kg" → 3. */
function parseWeightFromDesc(desc: string | null): number | null {
  if (!desc) return null;
  const m = desc.match(
    /Waga\s+n[oó]g?:?\s*(?:<[^>]+>)*\s*([\d.,]+)\s*kg/i,
  );
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ─── Magazyny ─────────────────────────────────────────────────────────

const WAREHOUSE_NAMES: Record<string, string> = {
  "1": "Magazyn główny",
  "2": "Magazyn pomocniczy",
  "4": "Magazyn rezerwowy",
};

async function ensureWarehouses(): Promise<Map<string, string>> {
  const externalIds = new Set<string>();
  for (const p of xmlProducts) {
    for (const sz of asArr<AnyRec>(
      (p.sizes as AnyRec | undefined)?.size as AnyRec | AnyRec[],
    )) {
      for (const st of asArr<AnyRec>(sz.stock as AnyRec | AnyRec[])) {
        const id = attrStr(st, "id");
        if (id) externalIds.add(id);
      }
    }
  }
  const map = new Map<string, string>();
  let sort = 0;
  for (const ext of externalIds) {
    let w = await db.warehouse.findFirst({ where: { externalId: ext } });
    if (!w) {
      w = await db.warehouse.create({
        data: {
          externalId: ext,
          name: WAREHOUSE_NAMES[ext] ?? `Magazyn ${ext}`,
          sortOrder: sort++,
        },
      });
    }
    map.set(ext, w.id);
  }
  return map;
}

// ─── Kategorie ────────────────────────────────────────────────────────

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Czy `childId` jest potomkiem `ancestorId` (po linii parent → parent).
 * Używane przy re-imporcie do ochrony ręcznie wybranej sub-kategorii.
 */
async function isDescendantCategory(
  childId: string,
  ancestorId: string,
): Promise<boolean> {
  let current: string | null = childId;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    if (current === ancestorId && depth > 0) return true;
    const parent: { parentId: string | null } | null =
      await db.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
    current = parent?.parentId ?? null;
  }
  return false;
}

async function ensureCategory(name: string): Promise<string> {
  // Szukaj istniejącej kategorii po nazwie na DOWOLNYM poziomie (1/2/3).
  // Dzięki temu re-import nie utworzy duplikatu jeśli kategoria istnieje już
  // jako podkategoria (np. „Stelaż biurka elektrycznego" jako L2 pod „Biurka
  // elektryczne" — nie tworzymy ponownie na L1).
  // Preferujemy najpłytszą (najniższy level), żeby user trafiał na główną.
  const existing = await db.category.findFirst({
    where: { name },
    orderBy: { level: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  // Brak — utwórz nową jako L1.
  const slug = slugify(name);
  let finalSlug = slug;
  let suffix = 1;
  while (await db.category.findFirst({ where: { slug: finalSlug } })) {
    suffix += 1;
    finalSlug = `${slug}-${suffix}`;
  }
  const created = await db.category.create({
    data: { name, slug: finalSlug, level: 1, sortOrder: 0 },
  });
  return created.id;
}

// ─── Główna pętla ─────────────────────────────────────────────────────

async function main() {
  const warehouseMap = await ensureWarehouses();
  console.log(
    `Magazyny gotowe: ${[...warehouseMap.entries()].map(([k, v]) => `${k}→${v.slice(0, 6)}…`).join(", ")}\n`,
  );

  let created = 0;
  let updated = 0;
  let imagesCreated = 0;
  let stocksUpserted = 0;
  let bundlesProcessed = 0;
  let componentsLinked = 0;
  const errors: string[] = [];

  // Mapowanie iaiId → productId w bazie (do drugiego passa: bundle → komponenty)
  const iaiIdToProductId = new Map<string, string>();

  // ─── PASS 1: utwórz / zaktualizuj wszystkie produkty ───
  for (const p of xmlProducts) {
    try {
      const iaiId = attrStr(p, "id");
      const productType = attrStr(p, "type"); // "regular" lub "bundle"
      const isBundle = productType === "bundle";

      // Generalny fallback dla produktów bez `code_on_card`
      // (zarówno bundli jak i regularnych — np. stelaż id=54 nie ma SKU,
      // ale jest komponentem wielu biurek — musimy go też zaimportować).
      // Preferowany format dla SKU = `IAI-{id}` (czytelne); dla code wewnętrznego
      // sklepu (size.code) bierzemy jako fallback jeśli iaiId też brak.
      const sizeArrPre = asArr<AnyRec>(
        (p.sizes as AnyRec | undefined)?.size as AnyRec | AnyRec[],
      );
      const productCode =
        attrStr(p, "code_on_card") ??
        (iaiId ? (isBundle ? `BUNDLE-${iaiId}` : `IAI-${iaiId}`) : null) ??
        attrStr(sizeArrPre[0], "code");

      if (!productCode) {
        errors.push(
          `Brak code/id dla produktu (type=${productType}) — pomijam.`,
        );
        continue;
      }
      const vatRatePct = attrFloat(p, "vat") ?? 23.0;

      const desc = p.description as AnyRec | undefined;
      const name = readText(desc?.name) ?? productCode;
      const longDesc = readText(desc?.long_desc) ?? null;
      const shortDesc = readText(desc?.short_desc) ?? null;

      const producer = attrStr(p.producer as AnyRec | undefined, "name");
      const unit = attrStr(p.unit as AnyRec | undefined, "name") ?? "szt";
      const storeUrl =
        attrStr(p.card as AnyRec | undefined, "url_generated") ??
        attrStr(p.card as AnyRec | undefined, "url");

      const warranty = p.warranty as AnyRec | undefined;
      const warrantyName =
        attrStr(warranty, "panel_name") ?? attrStr(warranty, "name");
      const warrantyMonths = attrInt(warranty, "period");
      const warrantyType = attrStr(warranty, "type");

      const categoryName = attrStr(
        p.category as AnyRec | undefined,
        "name",
      );

      const iaiGroupId = attrStr(p.group as AnyRec | undefined, "id");

      // Parametry → konkretne pola
      const paramArr = asArr<AnyRec>(
        (p.parameters as AnyRec | undefined)?.parameter as
          | AnyRec
          | AnyRec[],
      );
      const params = new Map<string, string>();
      for (const x of paramArr) {
        const pname = attrStr(x, "name");
        const pvalue = attrStr(x.value as AnyRec | undefined, "name");
        if (pname && pvalue) params.set(pname, pvalue);
      }

      const heightCm = parseLeadingNumber(params.get("Wysokość") ?? null);
      const widthCm = parseLeadingNumber(params.get("Szerokość") ?? null);
      const depthCm = parseLeadingNumber(params.get("Głębokość") ?? null);
      const loadCapacityKg = parseLeadingNumber(params.get("Udźwig") ?? null);
      const profileSize = params.get("Grubość profili") ?? null;
      const shape = params.get("Kształt") ?? null;
      const baseShape = params.get("Podstawa") ?? null;
      const purposeText = params.get("Przeznaczenie") ?? null;

      // Sizes + cena + waga + stany
      const sizes = asArr<AnyRec>(
        (p.sizes as AnyRec | undefined)?.size as AnyRec | AnyRec[],
      );
      const firstSize = sizes[0];
      if (!firstSize) {
        errors.push(`${productCode}: brak rozmiarów, pomijam.`);
        continue;
      }
      const price = firstSize.price as AnyRec | undefined;
      const priceNet = attrFloat(price, "net");
      const sizeWeight =
        attrFloat(firstSize, "weight") ?? attrFloat(firstSize, "iaiext:weight_net");
      const descWeight = parseWeightFromDesc(longDesc);
      const weightKg =
        sizeWeight && sizeWeight > 0 ? sizeWeight : descWeight ?? null;

      // EAN / GTIN — w IOF jest jako `size.@_code_producer`, a typ kodu
      // (GTIN13 etc.) jako `product.@_producer_code_standard`. Bierzemy gdy
      // dostępne i wygląda na cyfrowy kod kreskowy (8–14 cyfr).
      const codeStandard = attrStr(p, "producer_code_standard");
      const codeProducer = attrStr(firstSize, "code_producer");
      let eanCode: string | null = null;
      if (codeProducer && /^\d{8,14}$/.test(codeProducer)) {
        eanCode = codeProducer;
      }

      // Kategoria
      const categoryId = categoryName
        ? await ensureCategory(categoryName)
        : null;

      // Upsert produkt — najpierw po iaiId (globalny ID z IAI Shop), potem po
      // productCode. Dzięki temu re-import po zmianie productCode/code_on_card
      // nie tworzy duplikatu.
      let existing = iaiId
        ? await db.product.findFirst({
            where: { iaiId },
            select: { id: true },
          })
        : null;
      if (!existing) {
        existing = await db.product.findFirst({
          where: { productCode },
          select: { id: true },
        });
      }

      // Sprawdź konflikt EAN — jeśli jest, omiń EAN dla tego produktu
      // (zostawi pole puste zamiast wybuchać).
      let safeEanCode = eanCode;
      if (eanCode) {
        const conflict = await db.product.findFirst({
          where: {
            eanCode,
            NOT: { productCode },
          },
          select: { productCode: true },
        });
        if (conflict) {
          errors.push(
            `${productCode}: EAN ${eanCode} już używany przez ${conflict.productCode} — pominięto.`,
          );
          safeEanCode = null;
        }
      }

      const productData = {
        name,
        productCode,
        eanCode: safeEanCode,
        iaiId,
        iaiGroupId,
        storeUrl,
        unit,
        producer,
        shortDescription: shortDesc,
        shopDescription: longDesc,
        vatRatePct,
        warrantyName,
        warrantyMonths,
        warrantyType,
        loadCapacityKg: loadCapacityKg ?? null,
        profileSize,
        shape,
        baseShape,
        purposeText,
        widthCm,
        heightCm,
        depthCm,
        weightKg,
        defaultSalePriceSklepPln: priceNet,
        categoryId,
        status: "AKTYWNY" as const,
        // Bundle = produkt złożony z innych SKU (zestaw, biurko z blatem + stelaż itp.)
        compositionMode: isBundle
          ? ("KOMPONENTOWY" as const)
          : ("CALOSCIOWY" as const),
        isComponent: false,
      };

      let productId: string;
      if (existing) {
        // Ochrona kategorii: jeśli produkt ma już ustawioną kategorię będącą
        // POTOMKIEM kategorii zaimportowanej z XML (np. ręcznie przepięty na
        // „Blaty → Z płyty MDF → 140x70x2,5" gdy XML mówi „Blaty"), zachowaj
        // bardziej szczegółową — re-import nie cofa pracy operatora.
        const current = await db.product.findUnique({
          where: { id: existing.id },
          select: { categoryId: true },
        });
        const preserveCategory =
          categoryId != null &&
          current?.categoryId != null &&
          current.categoryId !== categoryId &&
          (await isDescendantCategory(current.categoryId, categoryId));
        const updateData = preserveCategory
          ? { ...productData, categoryId: current.categoryId }
          : productData;
        await db.product.update({
          where: { id: existing.id },
          data: updateData,
        });
        productId = existing.id;
        updated += 1;
      } else {
        const newP = await db.product.create({ data: productData });
        productId = newP.id;
        created += 1;
      }
      // Zapamiętujemy mapowanie dla pass 2 (bundle → komponenty po iaiId)
      if (iaiId) iaiIdToProductId.set(iaiId, productId);

      // Obrazy: zastąp wszystkie
      const imagesNode = (p.images as AnyRec | undefined)?.large as
        | AnyRec
        | undefined;
      const largeImages = asArr<AnyRec>(
        imagesNode?.image as AnyRec | AnyRec[] | undefined,
      );
      // Posortuj po priority
      largeImages.sort((a, b) => {
        const pa = parseInt(attrStr(a, "iaiext:priority") ?? "0", 10);
        const pb = parseInt(attrStr(b, "iaiext:priority") ?? "0", 10);
        return pa - pb;
      });
      if (largeImages.length > 0) {
        await db.productImage.deleteMany({ where: { productId } });
        for (let i = 0; i < largeImages.length; i++) {
          const url = attrStr(largeImages[i], "url");
          if (!url) continue;
          await db.productImage.create({
            data: {
              productId,
              url,
              alt: name,
              sortOrder: i,
              isPrimary: i === 0,
            },
          });
          imagesCreated += 1;
        }
      }

      // Stany magazynowe
      const stocks = asArr<AnyRec>(firstSize.stock as AnyRec | AnyRec[]);
      for (const st of stocks) {
        const extId = attrStr(st, "id");
        if (!extId) continue;
        const warehouseId = warehouseMap.get(extId);
        if (!warehouseId) continue;
        const qty = attrFloat(st, "quantity") ?? 0;
        const avail = attrFloat(st, "available_stock_quantity") ?? qty;
        const availCode = attrStr(st, "availability_id");
        await db.stock.upsert({
          where: {
            productId_warehouseId: { productId, warehouseId },
          },
          create: {
            productId,
            warehouseId,
            quantity: qty,
            availableQuantity: avail,
            availabilityCode: availCode,
          },
          update: {
            quantity: qty,
            availableQuantity: avail,
            availabilityCode: availCode,
          },
        });
        stocksUpserted += 1;
      }

      console.log(
        `✓ ${productCode.padEnd(28)} ${isBundle ? "BUNDLE " : ""}${existing ? "updated" : "created"} (${largeImages.length} obrazów, ${stocks.length} stanów)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${attrStr(p, "code_on_card") ?? "?"}: ${msg}`);
    }
  }

  // ─── PASS 2: powiąż komponenty dla bundli ───
  console.log("\n─── Pass 2: wiązanie komponentów (zestawy → SKU) ───");
  for (const p of xmlProducts) {
    if (attrStr(p, "type") !== "bundle") continue;
    const iaiId = attrStr(p, "id");
    if (!iaiId) continue;
    const bundleProductId = iaiIdToProductId.get(iaiId);
    if (!bundleProductId) continue;

    const bundled = p.bundled as AnyRec | undefined;
    if (!bundled) continue;
    const children = asArr<AnyRec>(bundled.product as AnyRec | AnyRec[]);
    if (children.length === 0) continue;

    // Idempotentne: usuń stare powiązania i utwórz nowe
    await db.productComponent.deleteMany({
      where: { productId: bundleProductId },
    });

    let linked = 0;
    for (const ch of children) {
      const childIaiId = attrStr(ch, "id");
      const qty = attrFloat(ch, "quantity") ?? 1;
      const order = attrInt(ch, "order") ?? 0;
      if (!childIaiId) continue;
      const componentProductId = iaiIdToProductId.get(childIaiId);
      if (!componentProductId) {
        errors.push(
          `Bundle ${iaiId}: komponent iaiId=${childIaiId} nie znaleziony w bazie (poza tym importem) — pominięto.`,
        );
        continue;
      }
      await db.productComponent.create({
        data: {
          productId: bundleProductId,
          componentId: componentProductId,
          quantity: Math.max(1, Math.round(qty)),
          sortOrder: order,
        },
      });
      linked += 1;
      componentsLinked += 1;
    }
    bundlesProcessed += 1;
    const bundleName = readText(
      (p.description as AnyRec | undefined)?.name,
    );
    console.log(
      `✓ Bundle iaiId=${iaiId} (${bundleName?.slice(0, 50) ?? "?"}) → ${linked}/${children.length} komponentów`,
    );
  }

  console.log("\n=== Podsumowanie ===");
  console.log(`Utworzono nowych:  ${created}`);
  console.log(`Zaktualizowano:    ${updated}`);
  console.log(`Obrazy:            ${imagesCreated}`);
  console.log(`Stany mag.:        ${stocksUpserted}`);
  console.log(`Zestawy:           ${bundlesProcessed}`);
  console.log(`Komponenty zestaw.: ${componentsLinked}`);
  if (errors.length > 0) {
    console.log(`\n⚠ Błędy (${errors.length}):`);
    for (const err of errors) console.log(`  - ${err}`);
  }
}

main()
  .then(async () => {
    await db.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error("Błąd krytyczny:", e);
    await db.$disconnect();
    process.exit(1);
  });
