/**
 * Tworzy 23 brakujące produkty ACRO4F z pliku 2026.xlsx.
 *
 * Defaulty:
 * - companyId: ACRO4F
 * - status: AKTYWNY
 * - importMode: KARTON
 * - producer: ZDĘBU (lub null)
 * - vatRatePct: 23
 *
 * Każdy produkt z naprawą:
 * - defaultUnitPriceUsd: z xlsx
 * - cbmPerUnit: szacowany z kategorii lub null
 * - weightKg: szacowana
 *
 * Idempotentne — pomija jeśli SKU już istnieje.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type MissingProduct = {
  sku: string;
  name: string;
  color: string | null;
  categoryName: string;
  defaultUnitPriceUsd: number;
  weightKg: number | null;
  cbmPerUnit: number | null;
  customsDutyPct: number | null;
};

const COLOR_MAP: Record<string, string> = {
  BLACK: "Czarny",
  PINK: "Różowy",
  WHITE: "Biały",
  PURPLE: "Fioletowy",
  GOLD: "Złoty",
  SILVER: "Srebrny",
  MULTI: "Multikolor",
};

const PRODUCTS: MissingProduct[] = [
  // PRP-50CM-WHITE — przedłużka pole dance (biała)
  {
    sku: "PRP-50CM-WHITE",
    name: "Przedłużka rury pole dance 50cm | Biała | ACRO4F",
    color: "Biały",
    categoryName: "przedłużki",
    defaultUnitPriceUsd: 13.28,
    weightKg: 0.8,
    cbmPerUnit: 0.0024,
    customsDutyPct: null,
  },
  // KIDS-SET — hak z kotwami dla dzieci
  {
    sku: "KIDS-SET",
    name: "Hak z mocowaniem 4× kotwy do hamaka dla dzieci | Srebrny",
    color: "Srebrny",
    categoryName: "Mocowania sufitowe",
    defaultUnitPriceUsd: 4.3,
    weightKg: 0.5,
    cbmPerUnit: 0.0012,
    customsDutyPct: null,
  },
  // AERIALSILK-SET-BLACK — zestaw akcesoriów do aerial silk
  {
    sku: "AERIALSILK-SET-BLACK",
    name: "Zestaw akcesoriów aerial silk (krętlik + 2× karabiny + uchwyty) | Czarny",
    color: "Czarny",
    categoryName: "Mocowania sufitowe",
    defaultUnitPriceUsd: 15.54,
    weightKg: 1.0,
    cbmPerUnit: 0.002,
    customsDutyPct: null,
  },
  // YOGA-SET-BLACK — akcesoria do hamaka jogi
  {
    sku: "YOGA-SET-BLACK",
    name: "Zestaw akcesoriów do hamaka jogi (wstążki + karabiny + kotwy) | Czarny",
    color: "Czarny",
    categoryName: "Mocowania sufitowe",
    defaultUnitPriceUsd: 7.46,
    weightKg: 0.8,
    cbmPerUnit: 0.0015,
    customsDutyPct: null,
  },
];

// AHOOP — koła cyrkowe w 3 kolorach × 5 rozmiarów (85/90/95/100/105 cm)
const AHOOP_PRICES_BY_SIZE: Record<string, number> = {
  "85": 53.5,
  "90": 55.02,
  "95": 56.53,
  "100": 58.05,
  "105": 59.56,
};
const AHOOP_COLORS = ["BLACK", "PINK", "WHITE"] as const;
const AHOOP_SIZES = ["85", "90", "95", "100", "105"];
for (const color of AHOOP_COLORS) {
  for (const size of AHOOP_SIZES) {
    const sku = `AHOOP-${color}-${size}`;
    PRODUCTS.push({
      sku,
      name: `Koło cyrkowe ${size} cm | ${COLOR_MAP[color]}`,
      color: COLOR_MAP[color],
      categoryName: "Koła cyrkowe - zestaw",
      defaultUnitPriceUsd: AHOOP_PRICES_BY_SIZE[size],
      weightKg: 10,
      cbmPerUnit: 0.0644,
      customsDutyPct: 0.027, // 2.7% (sugerowane cło dla rur)
    });
  }
}

// TAPEHOOP — wraps do kół cyrkowych 5×5 m w 4 kolorach
const TAPEHOOP_COLORS = ["BLACK", "PURPLE", "PINK", "WHITE"] as const;
for (const color of TAPEHOOP_COLORS) {
  PRODUCTS.push({
    sku: `TAPEHOOP-${color}-5M`,
    name: `Taśma owijka do koła cyrkowego 5cm × 5m | ${COLOR_MAP[color]}`,
    color: COLOR_MAP[color],
    categoryName: "Koła cyrkowe - zestaw",
    defaultUnitPriceUsd: 3.27,
    weightKg: 0.3,
    cbmPerUnit: 0.0008,
    customsDutyPct: null,
  });
}

async function main() {
  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  const cats = await db.category.findMany({
    where: { companyId: company.id },
    select: { id: true, name: true },
  });
  const catMap = new Map(cats.map((c) => [c.name, c.id]));

  let created = 0;
  let skipped = 0;
  for (const p of PRODUCTS) {
    const existing = await db.product.findFirst({
      where: { productCode: p.sku, companyId: company.id },
      select: { id: true },
    });
    if (existing) {
      console.log(`  ⊙ ${p.sku} już istnieje, pomijam`);
      skipped++;
      continue;
    }
    const catId = catMap.get(p.categoryName);
    if (!catId) {
      console.log(
        `  ⚠ ${p.sku}: brak kategorii „${p.categoryName}" → produkt bez kategorii`,
      );
    }
    const productData = {
      companyId: company.id,
      categoryId: catId ?? null,
      status: "AKTYWNY" as const,
      compositionMode: "CALOSCIOWY" as const,
      isComponent: false,
      name: p.name,
      productCode: p.sku,
      color: p.color,
      producer: "ACRO4F",
      unit: "szt",
      vatRatePct: 23.0,
      defaultUnitPriceUsd: p.defaultUnitPriceUsd,
      cbmPerUnit: p.cbmPerUnit,
      weightKg: p.weightKg,
      importMode: "KARTON" as const,
      customsDutyPct: p.customsDutyPct,
    };
    await db.product.create({ data: productData });
    console.log(`  ✓ ${p.sku}  $${p.defaultUnitPriceUsd}  →  ${p.categoryName}`);
    created++;
  }
  console.log(`\nGotowe. Utworzono ${created}, pominięto ${skipped}, razem ${PRODUCTS.length}.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
