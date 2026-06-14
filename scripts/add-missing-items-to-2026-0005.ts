/**
 * Dodaje brakujące pozycje (utworzone wcześniej) do zamówienia 2026-0005
 * z pliku 2026.xlsx. Wykorzystuje xlsx jako źródło ilości + cen.
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
  );
  const ws = wb.Sheets["Sheet1"];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const items: { sku: string; qty: number; usd: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;
    const sku = typeof row[3] === "string" ? row[3].trim() : null;
    const qty = typeof row[6] === "number" ? row[6] : 0;
    const unitPrice = typeof row[8] === "number" ? row[8] : 0;
    if (sku && qty > 0 && unitPrice > 0) {
      items.push({ sku, qty, usd: unitPrice });
    }
  }

  const order = await db.importOrder.findFirst({
    where: {
      orderNumber: "2026-0005",
      company: { name: { contains: "ACRO" } },
    },
    select: {
      id: true,
      orderNumber: true,
      items: {
        select: { product: { select: { productCode: true } } },
        orderBy: { sortOrder: "desc" },
        take: 1,
      },
    },
  });
  if (!order) throw new Error("Brak 2026-0005");

  // Bierz ostatni sortOrder + 1
  const existingSorts = await db.importOrderItem.findMany({
    where: { orderId: order.id },
    select: { sortOrder: true, product: { select: { productCode: true } } },
  });
  let nextSort = Math.max(0, ...existingSorts.map((s) => s.sortOrder)) + 1;
  const existingSkus = new Set(
    existingSorts.map((s) => s.product.productCode),
  );

  // Tylko te SKU które:
  // 1. Są w xlsx
  // 2. Nie są jeszcze w zamówieniu
  // 3. Istnieją w bazie
  const skusToAdd = items.filter((i) => !existingSkus.has(i.sku));
  const productsInDb = await db.product.findMany({
    where: {
      productCode: { in: skusToAdd.map((i) => i.sku) },
      company: { name: { contains: "ACRO" } },
    },
    select: {
      id: true,
      productCode: true,
      cbmPerUnit: true,
      referenceContainerM3: true,
      unitsPerContainer: true,
    },
  });
  const productMap = new Map(productsInDb.map((p) => [p.productCode, p]));

  let added = 0;
  let stillMissing = 0;
  for (const it of skusToAdd) {
    const p = productMap.get(it.sku);
    if (!p) {
      console.log(`  ⚠ ${it.sku} NADAL brak w bazie — pomijam`);
      stillMissing++;
      continue;
    }
    const cbm =
      p.cbmPerUnit ??
      (p.referenceContainerM3 && p.unitsPerContainer
        ? p.referenceContainerM3 / p.unitsPerContainer
        : null);
    await db.importOrderItem.create({
      data: {
        orderId: order.id,
        productId: p.id,
        quantity: it.qty,
        unitPriceUsd: it.usd,
        cbmPerUnit: cbm,
        sortOrder: nextSort++,
      },
    });
    console.log(`  ✓ ${it.sku.padEnd(28)} qty=${it.qty}  $${it.usd}`);
    added++;
  }

  console.log(`\nGotowe. Dodano ${added}, brak ${stillMissing}.`);
  console.log(`Skipped (nazwa "colorful" lub bez SKU) zostaje pominięta — to manual print, nie produkt.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
