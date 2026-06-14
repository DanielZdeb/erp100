/**
 * Restrukturyzacja kategorii ACRO4F do układu sprzed importu:
 *
 *   • Hamaki dla dzieci
 *       └── 3 m          ← wszystkie hamaki dla dzieci
 *   • Hamaki do jogi CN  ← rename z "Hamaki do jogi"
 *       ├── 4 m
 *       ├── 5 m
 *       └── 6 m
 *   • Magnezja pole dance (bez subs)
 *   • Mocowania sufitowe  (bez subs)
 *   • Rury pole dance     (bez subs)
 *   • Szarfy akrobatyczne CN ← rename z "Szarfy akrobatyczne aerial"
 *       ├── 6 m
 *       ├── 7 m
 *       └── 8 m
 *
 * Rozmiar wyciągany ze środka nazwy produktu (po `|`).
 *
 * Uruchomienie: npx tsx prisma/restructure-acro4f-categories.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const RENAMES: Record<string, string> = {
  "Hamaki do jogi": "Hamaki do jogi CN",
  "Szarfy akrobatyczne aerial": "Szarfy akrobatyczne CN",
};

// Które kategorie mają mieć subkategorie po rozmiarach
const SIZE_PARENTS = new Set([
  "Hamaki dla dzieci",
  "Hamaki do jogi CN",
  "Szarfy akrobatyczne CN",
]);

function extractSize(name: string): string | null {
  const parts = name.split("|").map((s) => s.trim());
  if (parts.length < 3) return null;
  for (let i = 1; i < parts.length - 1; i++) {
    const p = parts[i];
    if (/\d/.test(p) && /\b(m|cm|ml)\b/i.test(p)) {
      return p;
    }
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

async function main() {
  const company = await db.company.findUnique({
    where: { slug: "acro4f" },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error("ACRO4F nie istnieje.");
    process.exit(1);
  }
  const companyId = company.id;
  console.log(`Cel: ${company.name}\n`);

  // ── 1. Rename ────────────────────────────────────────────────────
  for (const [oldName, newName] of Object.entries(RENAMES)) {
    const cat = await db.category.findFirst({
      where: { companyId, name: oldName },
      select: { id: true },
    });
    if (!cat) {
      console.log(`[rename] "${oldName}" nie istnieje — pomijam`);
      continue;
    }
    const alreadyNewName = await db.category.findFirst({
      where: { companyId, name: newName, id: { not: cat.id } },
    });
    if (alreadyNewName) {
      console.log(`[rename] "${newName}" już istnieje — pomijam rename`);
      continue;
    }
    await db.category.update({
      where: { id: cat.id },
      data: { name: newName },
    });
    console.log(`[rename] "${oldName}" → "${newName}"`);
  }

  // ── 2. Subkategorie po rozmiarach ────────────────────────────────
  async function ensureSubCategory(
    parentId: string,
    parentName: string,
    sizeLabel: string,
  ): Promise<string> {
    const existing = await db.category.findFirst({
      where: { companyId, parentId, name: sizeLabel },
      select: { id: true },
    });
    if (existing) return existing.id;
    // Slug unique per firma
    const baseSlug = slugify(`${parentName}-${sizeLabel}`) || "kategoria";
    let slug = baseSlug;
    let suffix = 1;
    while (
      await db.category.findFirst({
        where: { companyId, slug },
        select: { id: true },
      })
    ) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }
    const created = await db.category.create({
      data: {
        companyId,
        name: sizeLabel,
        slug,
        level: 2,
        parentId,
        sortOrder: 0,
      },
      select: { id: true },
    });
    console.log(`  + subkategoria "${sizeLabel}" pod "${parentName}"`);
    return created.id;
  }

  for (const parentName of SIZE_PARENTS) {
    const parent = await db.category.findFirst({
      where: { companyId, name: parentName },
      select: { id: true },
    });
    if (!parent) {
      console.log(`[sub] parent "${parentName}" nie istnieje — pomijam`);
      continue;
    }
    console.log(`\n[sub] ${parentName}`);
    const products = await db.product.findMany({
      where: { companyId, categoryId: parent.id },
      select: { id: true, name: true },
    });
    let repinned = 0;
    let skipped = 0;
    for (const p of products) {
      const size = extractSize(p.name);
      if (!size) {
        skipped++;
        continue;
      }
      const subId = await ensureSubCategory(parent.id, parentName, size);
      await db.product.update({
        where: { id: p.id },
        data: { categoryId: subId },
      });
      repinned++;
    }
    console.log(
      `  → przepięto ${repinned} produktów, pominięto (brak rozmiaru) ${skipped}`,
    );
  }

  await db.$disconnect();
  console.log("\n✔ Restrukturyzacja zakończona.");
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
