/**
 * Tworzy 14 wariantów Krzesła TYP D (7 siedzisk × 2 zestawy nóg) jako produkty
 * ZESTAW.
 *
 * Każdy wariant:
 * - compositionMode: ZESTAW
 * - 2 komponenty: 1× siedzisko (kolor X) + 1× zestaw nóg (B/G)
 * - bundleShippingMode: SINGLE_CARTON
 * - bundleShippingBoxId: istniejący ShippingBox „Krzesła TYP D" 45×54×58
 * - defaultUnitPriceUsd: suma cen komponentów (siedzisko + nogi)
 * - wymiary: 45×54×58 cm (jak pudełko)
 *
 * Import (cbm + koszt) jest auto-liczony z komponentów przez logikę
 * kalkulatora zamówień LUZEM — siedziska wchodzą w 68m³/2941 szt, nogi
 * w 68m³/68000 szt. Sumowanie per-zamówienie odbywa się w warstwie kalkulacji.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Seat = {
  sku: string;
  colorLabel: string;
};

type Legs = {
  sku: string;
  suffix: "B" | "G";
  colorLabel: string;
};

const SEATS: Seat[] = [
  { sku: "KD-LIGHTBEIGE", colorLabel: "Bardzo jasny beż" },
  { sku: "KD-POWDERPINK", colorLabel: "Pudrowy róż" },
  { sku: "KD-DARKBEIGE", colorLabel: "Ciemnobeżowy" },
  { sku: "KD-BLACK", colorLabel: "Czarne" },
  { sku: "KD-DARKGRAY", colorLabel: "Ciemnoszare" },
  { sku: "KD-GRAY", colorLabel: "Szare" },
  { sku: "KD-NAVYBLUE", colorLabel: "Granatowe" },
];

const LEGS: Legs[] = [
  { sku: "KD-LEGS-B", suffix: "B", colorLabel: "czarne" },
  { sku: "KD-LEGS-G", suffix: "G", colorLabel: "złote" },
];

async function main() {
  const typD = await db.category.findFirst({
    where: { name: "TYP-D" },
    select: { id: true, companyId: true },
  });
  if (!typD) {
    throw new Error("Brak kategorii TYP-D");
  }

  const shippingBox = await db.shippingBox.findFirst({
    where: { name: "Krzesła TYP D" },
    select: { id: true, name: true, widthCm: true, heightCm: true, depthCm: true },
  });
  if (!shippingBox) {
    throw new Error('Brak ShippingBox "Krzesła TYP D" w bibliotece');
  }
  console.log(
    `Pudełko: ${shippingBox.name} ${shippingBox.widthCm}×${shippingBox.heightCm}×${shippingBox.depthCm} cm (id ${shippingBox.id})`,
  );

  // Załaduj komponenty (siedziska + nogi) z bazy żeby mieć ich ceny i id
  const seatRows = await db.product.findMany({
    where: { productCode: { in: SEATS.map((s) => s.sku) } },
    select: { id: true, productCode: true, defaultUnitPriceUsd: true },
  });
  const legsRows = await db.product.findMany({
    where: { productCode: { in: LEGS.map((l) => l.sku) } },
    select: { id: true, productCode: true, defaultUnitPriceUsd: true },
  });
  const seatById = new Map(seatRows.map((p) => [p.productCode, p]));
  const legsById = new Map(legsRows.map((p) => [p.productCode, p]));

  for (const s of SEATS) {
    if (!seatById.has(s.sku)) throw new Error(`Brak siedziska ${s.sku} w bazie`);
  }
  for (const l of LEGS) {
    if (!legsById.has(l.sku)) throw new Error(`Brak nóg ${l.sku} w bazie`);
  }

  let created = 0;
  let skipped = 0;
  for (const seat of SEATS) {
    for (const legs of LEGS) {
      const seatProd = seatById.get(seat.sku)!;
      const legsProd = legsById.get(legs.sku)!;
      const newSku = `${seat.sku}-${legs.suffix}`;
      const newName = `Krzesło TYP D | ${seat.colorLabel} | Nogi ${legs.colorLabel}`;
      const priceSum =
        (seatProd.defaultUnitPriceUsd ?? 0) + (legsProd.defaultUnitPriceUsd ?? 0);

      // Pomiń jeśli już istnieje (re-run idempotentny)
      const existing = await db.product.findFirst({
        where: { productCode: newSku },
        select: { id: true },
      });
      if (existing) {
        console.log(`  ⊙ ${newSku} już istnieje, pomijam`);
        skipped++;
        continue;
      }

      const created_p = await db.product.create({
        data: {
          companyId: typD.companyId,
          categoryId: typD.id,
          status: "PLANOWANY",
          compositionMode: "ZESTAW",
          isComponent: false,
          requiredComponentsTotal: 2,
          name: newName,
          productCode: newSku,
          color: seat.colorLabel,
          unit: "szt",
          producer: "ZDĘBU",
          vatRatePct: 23.0,
          widthCm: 45,
          depthCm: 54,
          heightCm: 58,
          // Import ZESTAW: dane są pochodne z komponentów, sam ZESTAW nie ma
          // unitsPerContainer/referenceContainerM3.
          importMode: "KARTON", // wartość ignorowana dla ZESTAW
          defaultUnitPriceUsd: Number(priceSum.toFixed(3)),
          // Pakowanie zestawu: SINGLE_CARTON = własny karton z biblioteki.
          // Drugi tryb (INDIVIDUAL_PACKAGING) bierze pakowanie z komponentów.
          bundleShippingMode: "SINGLE_CARTON",
          bundleShippingBoxId: shippingBox.id,
          // Komponenty
          components: {
            create: [
              {
                componentId: seatProd.id,
                quantity: 1,
                sortOrder: 0,
                allowVariants: false,
              },
              {
                componentId: legsProd.id,
                quantity: 1,
                sortOrder: 1,
                allowVariants: false,
              },
            ],
          },
        },
        select: { id: true, productCode: true, name: true },
      });
      console.log(`  ✓ ${created_p.productCode}  ${created_p.name}  →  $${priceSum.toFixed(3)}/szt`);
      created++;
    }
  }

  console.log(`\nGotowe. Utworzono ${created}, pominięto ${skipped}.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
