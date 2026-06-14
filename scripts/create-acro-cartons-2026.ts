/**
 * Z xlsx 2026 tworzy:
 *  1. Unikalne FACTORY pudełka (z Chin) — deduplikacja wg wymiarów
 *  2. Pinuje każdy produkt do odpowiedniego pudełka (purpose=FACTORY)
 *  3. Ustawia unitsPerBox = packing qty z xlsx
 *  4. (opcja) Tworzy lustrzane POLAND SHIPPING boxy
 *
 * Idempotentne — pomija istniejące.
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ALSO_CREATE_SHIPPING_BOXES = true;

type XlsxRow = {
  sku: string;
  qty: number;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  packingQty: number | null;
  cbmPerCarton: number | null;
};

async function main() {
  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
  );
  const ws = wb.Sheets["Sheet1"];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  const rows: XlsxRow[] = [];
  for (let i = 15; i < data.length; i++) {
    const r = data[i] as unknown[];
    if (!r || r.length === 0) continue;
    const sku = typeof r[3] === "string" ? r[3].trim() : null;
    const qty = typeof r[6] === "number" ? r[6] : 0;
    if (!sku || qty <= 0) continue;
    rows.push({
      sku,
      qty,
      lengthCm: typeof r[16] === "number" ? r[16] : null,
      widthCm: typeof r[17] === "number" ? r[17] : null,
      heightCm: typeof r[18] === "number" ? r[18] : null,
      packingQty: typeof r[19] === "number" ? Math.round(r[19] as number) : null,
      cbmPerCarton: typeof r[21] === "number" ? r[21] : null,
    });
  }
  console.log(`Pozycji z xlsx: ${rows.length}`);

  // Fallback: SKU bez wymiarów dziedziczą z podobnego (heurystyka per prefix)
  const FALLBACK_DIMS: Record<string, [number, number, number, number]> = {
    "PRP-50CM-MULTI": [58, 19, 32, 15], // jak SILVER
    "PRP-50CM-PINK": [58, 19, 32, 15], // jak SILVER
    "TAPEHOOP-WHITE-5M": [51, 33, 37.5, 196], // jak inne TAPEHOOP
  };
  for (const r of rows) {
    if (r.lengthCm == null && FALLBACK_DIMS[r.sku]) {
      const [l, w, h, p] = FALLBACK_DIMS[r.sku];
      r.lengthCm = l;
      r.widthCm = w;
      r.heightCm = h;
      r.packingQty = p;
    }
  }

  // Grupowanie po unikalnych wymiarach (L×W×H) → 1 pudełko z Chin
  const boxKey = (l: number, w: number, h: number) =>
    `${l}×${w}×${h}`;
  const uniqueDims = new Map<
    string,
    {
      lengthCm: number;
      widthCm: number;
      heightCm: number;
      cbm: number;
      examples: string[];
    }
  >();
  for (const r of rows) {
    if (r.lengthCm == null || r.widthCm == null || r.heightCm == null) continue;
    const key = boxKey(r.lengthCm, r.widthCm, r.heightCm);
    const cur = uniqueDims.get(key);
    if (cur) {
      cur.examples.push(r.sku);
    } else {
      uniqueDims.set(key, {
        lengthCm: r.lengthCm,
        widthCm: r.widthCm,
        heightCm: r.heightCm,
        cbm:
          r.cbmPerCarton ??
          (r.lengthCm * r.widthCm * r.heightCm) / 1_000_000,
        examples: [r.sku],
      });
    }
  }
  console.log(`Unikalnych wymiarów kartonów: ${uniqueDims.size}`);

  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true },
  });
  if (!company) throw new Error("Brak ACRO4F");

  // Krok 1: utwórz pudełka FACTORY (Chin)
  type BoxRecord = {
    id: string;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
  const factoryBoxes = new Map<string, BoxRecord>();
  for (const [key, dims] of uniqueDims) {
    const name = `Karton Chin ${dims.lengthCm}×${dims.widthCm}×${dims.heightCm} cm`;
    const existing = await db.shippingBox.findFirst({
      where: {
        companyId: company.id,
        widthCm: dims.lengthCm, // mapowanie: length → widthCm (najdłuższy bok)
        heightCm: dims.heightCm,
        depthCm: dims.widthCm,
        origin: "CHINA_STANDARD",
        packagingType: "BOX",
      },
      select: { id: true, widthCm: true, heightCm: true, depthCm: true },
    });
    if (existing) {
      console.log(`  ⊙ FACTORY ${key} już istnieje  (id ${existing.id})`);
      factoryBoxes.set(key, {
        id: existing.id,
        lengthCm: existing.widthCm,
        widthCm: existing.depthCm,
        heightCm: existing.heightCm,
      });
      continue;
    }
    const created = await db.shippingBox.create({
      data: {
        companyId: company.id,
        name,
        packagingType: "BOX",
        origin: "CHINA_STANDARD",
        isCollective: false,
        widthCm: dims.lengthCm,
        heightCm: dims.heightCm,
        depthCm: dims.widthCm,
      },
      select: { id: true, widthCm: true, heightCm: true, depthCm: true },
    });
    console.log(
      `  ✓ FACTORY ${name}  (${dims.examples.length} produktów)`,
    );
    factoryBoxes.set(key, {
      id: created.id,
      lengthCm: created.widthCm,
      widthCm: created.depthCm,
      heightCm: created.heightCm,
    });
  }

  // Krok 2: pinuj produkty do pudełek FACTORY (unitsPerBox = packing qty)
  let factoryPinsCreated = 0;
  let factoryPinsSkipped = 0;
  for (const r of rows) {
    if (r.lengthCm == null || r.widthCm == null || r.heightCm == null) continue;
    const key = boxKey(r.lengthCm, r.widthCm, r.heightCm);
    const box = factoryBoxes.get(key);
    if (!box) continue;
    const p = await db.product.findFirst({
      where: { companyId: company.id, productCode: r.sku },
      select: { id: true },
    });
    if (!p) continue;
    const upb = Math.max(1, r.packingQty ?? 1);
    const existing = await db.productShippingBox.findFirst({
      where: { productId: p.id, boxId: box.id, purpose: "FACTORY" },
      select: { id: true },
    });
    if (existing) {
      factoryPinsSkipped++;
      continue;
    }
    await db.productShippingBox.create({
      data: {
        productId: p.id,
        boxId: box.id,
        purpose: "FACTORY",
        unitsPerBox: upb,
        isPrimary: true,
      },
    });
    factoryPinsCreated++;
  }
  console.log(
    `\nFACTORY piny: utworzono ${factoryPinsCreated}, pominięto ${factoryPinsSkipped}`,
  );

  // Krok 3 (opcja): SHIPPING boxes (POLAND) o tych samych wymiarach
  if (ALSO_CREATE_SHIPPING_BOXES) {
    console.log(`\n--- SHIPPING (PL) boxes ---`);
    const shippingBoxes = new Map<string, string>();
    for (const [key, dims] of uniqueDims) {
      const name = `Karton wysyłkowy ${dims.lengthCm}×${dims.widthCm}×${dims.heightCm} cm`;
      const existing = await db.shippingBox.findFirst({
        where: {
          companyId: company.id,
          widthCm: dims.lengthCm,
          heightCm: dims.heightCm,
          depthCm: dims.widthCm,
          origin: "POLAND",
          packagingType: "BOX",
        },
        select: { id: true },
      });
      if (existing) {
        shippingBoxes.set(key, existing.id);
        continue;
      }
      const created = await db.shippingBox.create({
        data: {
          companyId: company.id,
          name,
          packagingType: "BOX",
          origin: "POLAND",
          isCollective: false,
          widthCm: dims.lengthCm,
          heightCm: dims.heightCm,
          depthCm: dims.widthCm,
        },
        select: { id: true },
      });
      shippingBoxes.set(key, created.id);
      console.log(`  ✓ SHIPPING ${name}`);
    }

    let shippingPinsCreated = 0;
    let shippingPinsSkipped = 0;
    for (const r of rows) {
      if (r.lengthCm == null || r.widthCm == null || r.heightCm == null) continue;
      const key = boxKey(r.lengthCm, r.widthCm, r.heightCm);
      const boxId = shippingBoxes.get(key);
      if (!boxId) continue;
      const p = await db.product.findFirst({
        where: { companyId: company.id, productCode: r.sku },
        select: { id: true },
      });
      if (!p) continue;
      const upb = Math.max(1, r.packingQty ?? 1);
      const existing = await db.productShippingBox.findFirst({
        where: { productId: p.id, boxId, purpose: "SHIPPING" },
        select: { id: true },
      });
      if (existing) {
        shippingPinsSkipped++;
        continue;
      }
      // Wyzeruj poprzedni primary SHIPPING (jeśli był)
      await db.productShippingBox.updateMany({
        where: { productId: p.id, purpose: "SHIPPING", isPrimary: true },
        data: { isPrimary: false },
      });
      await db.productShippingBox.create({
        data: {
          productId: p.id,
          boxId,
          purpose: "SHIPPING",
          unitsPerBox: upb,
          isPrimary: true,
        },
      });
      shippingPinsCreated++;
    }
    console.log(
      `\nSHIPPING piny: utworzono ${shippingPinsCreated}, pominięto ${shippingPinsSkipped}`,
    );
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
