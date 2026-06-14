/**
 * Tworzy zamówienie kontenerowe dla ACRO4F na podstawie pliku
 * `acro zamowienia/szarfy.xlsx` (szarfy, hamaki do jogi, hamaki dla dzieci,
 * mocowania sufitowe, karabinki).
 *
 * Format xlsx: kolumny Produkt | Ilość | cena za sztukę faktura $
 * Status: PLANOWANE
 * Kontener: 40' (tekstylia, dużo metrów bieżących — sporo objętości)
 * Tryb płatności: 30/40/30 (standard Fullbax)
 *
 * Uruchomienie: npx tsx prisma/create-acro4f-order-szarfy.ts
 */

import "dotenv/config";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const COMPANY_SLUG = "acro4f";
const CREATOR_EMAIL = "contact@acro4f.com";
const XLSX_PATH = join(__dirname, "..", "acro zamowienia", "szarfy.xlsx");

const ORDER_NAME = "Szarfy + hamaki + mocowania — Fullbax 2026";
const NOTES = `Źródło: acro zamowienia/szarfy.xlsx
Dostawca: Fullbax Limited (HK)
Incoterms: EXW (standard Fullbax)
Płatność: 30% deposit / 40% before loading / 30% balance after loading
Produkcja: ~30-35 dni roboczych od opłaty zaliczki`;

type XlsxRow = [string, number, number]; // SKU, qty, unitPriceUsd

// Mapa aliasów SKU — xlsx używa nieco innych oznaczeń kolorów dla hamaków
// do jogi (AH) niż baza. Mapowanie:
//   R.BLUE → BLUE (Royal Blue = niebieski)
//   S.BLUE → L.BLUE (Sky Blue = jasnoniebieski)
// Szarfy (AS) i hamaki dla dzieci (KH) używają R.BLUE/S.BLUE w obu miejscach.
const SKU_ALIASES: Record<string, string> = {
  "AH-4X2.8M-R.BLUE": "AH-4X2.8M-BLUE",
  "AH-5X2.8M-R.BLUE": "AH-5X2.8M-BLUE",
  "AH-6X2.8M-R.BLUE": "AH-6X2.8M-BLUE",
  "AH-4X2.8M-S.BLUE": "AH-4X2.8M-L.BLUE",
  "AH-5X2.8M-S.BLUE": "AH-5X2.8M-L.BLUE",
  "AH-6X2.8M-S.BLUE": "AH-6X2.8M-L.BLUE",
};

function resolveSku(sku: string): string {
  return SKU_ALIASES[sku] ?? sku;
}

function readXlsx(): Array<{
  sku: string;
  originalSku: string;
  quantity: number;
  unitPriceUsd: number;
}> {
  const wb = XLSX.readFile(XLSX_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(sheet, {
    header: 1,
    defval: null,
  });
  const items: Array<{
    sku: string;
    originalSku: string;
    quantity: number;
    unitPriceUsd: number;
  }> = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[0]) continue;
    const originalSku = String(r[0]).trim();
    const sku = resolveSku(originalSku);
    const qty = Number(r[1]);
    const price = Number(r[2]);
    if (!sku || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) {
      continue;
    }
    items.push({ sku, originalSku, quantity: qty, unitPriceUsd: price });
  }
  return items;
}

async function fetchUsdRate(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.nbp.pl/api/exchangerates/rates/A/USD/?format=json",
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rates: { mid: number }[] };
    return data.rates[0]?.mid ?? null;
  } catch {
    return null;
  }
}

async function nextOrderNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.importOrder.count({
    where: { companyId, orderNumber: { startsWith: `${year}-` } },
  });
  return `${year}-${String(count + 1).padStart(4, "0")}`;
}

async function main() {
  // 1. Firma + user
  const company = await db.company.findUnique({
    where: { slug: COMPANY_SLUG },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error(`Firma ${COMPANY_SLUG} nie istnieje.`);
    process.exit(1);
  }
  const creator = await db.user.findUnique({
    where: { email: CREATOR_EMAIL },
    select: { id: true, email: true },
  });
  if (!creator) {
    console.error(`User ${CREATOR_EMAIL} nie istnieje.`);
    process.exit(1);
  }
  console.log(`Cel: ${company.name} (twórca: ${creator.email})\n`);

  // 2. Wczytaj xlsx
  const items = readXlsx();
  console.log(`Wczytano ${items.length} pozycji z xlsx`);

  // 3. Pobierz produkty po SKU
  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      productCode: { in: items.map((i) => i.sku) },
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      cbmPerUnit: true,
    },
  });
  const bySku = new Map(products.map((p) => [p.productCode, p]));
  const missing = items.filter((i) => !bySku.has(i.sku));
  if (missing.length > 0) {
    console.error(
      `Brak produktów w bazie:\n${missing.map((m) => `  - ${m.sku}`).join("\n")}`,
    );
    process.exit(1);
  }
  console.log(`Dopasowano wszystkie ${items.length} pozycji do produktów\n`);

  // 4. Idempotency
  const existing = await db.importOrder.findFirst({
    where: { companyId: company.id, name: ORDER_NAME },
    select: { id: true, orderNumber: true },
  });
  if (existing) {
    console.log(
      `Zamówienie "${ORDER_NAME}" już istnieje (nr ${existing.orderNumber}). Pomijam.`,
    );
    await db.$disconnect();
    return;
  }

  // 5. Kurs USD z NBP
  const usdToPln = await fetchUsdRate();
  console.log(
    `Kurs USD/PLN: ${usdToPln != null ? usdToPln.toFixed(4) : "(NBP niedostępne)"}\n`,
  );

  // 6. Twórz zamówienie
  const orderNumber = await nextOrderNumber(company.id);
  console.log(`Numer zamówienia: ${orderNumber}`);

  const order = await db.importOrder.create({
    data: {
      companyId: company.id,
      orderNumber,
      name: ORDER_NAME,
      createdById: creator.id,
      cnyToPlnRate: null,
      usdToPlnRate: usdToPln,
      vatRate: 0.23,
      containerType: "FORTY_FT",
      containerSizeM3: 68,
      estimatedProductionDays: 32,
      notes: NOTES,
    },
  });
  console.log(`Utworzono ImportOrder id=${order.id}\n`);

  // 7. Historia statusu
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: "PLANOWANE",
      changedById: creator.id,
    },
  });

  // 8. Pozycje
  let sortOrder = 0;
  let totalUsd = 0;
  let totalQty = 0;
  // Grupowanie po prefiksie kategorii do podsumowania
  const byPrefix = new Map<string, { qty: number; value: number }>();
  for (const item of items) {
    const p = bySku.get(item.sku)!;
    const itemTotal = item.unitPriceUsd * item.quantity;
    totalUsd += itemTotal;
    totalQty += item.quantity;
    const prefix = item.sku.split("-")[0];
    const agg = byPrefix.get(prefix) ?? { qty: 0, value: 0 };
    agg.qty += item.quantity;
    agg.value += itemTotal;
    byPrefix.set(prefix, agg);
    await db.importOrderItem.create({
      data: {
        orderId: order.id,
        productId: p.id,
        quantity: item.quantity,
        unitPriceUsd: item.unitPriceUsd,
        unitPriceCny: null,
        unitPriceIsBrutto: false,
        cbmPerUnit: p.cbmPerUnit,
        usdToPlnRate: usdToPln,
        cnyToPlnRate: null,
        sortOrder: sortOrder++,
      },
    });
  }

  // 9. Transze 30/40/30
  const PHASES = [
    {
      phase: "PRE_PRODUCTION" as const,
      pct: 0.3,
      label: "30% deposit (do opłaty)",
    },
    {
      phase: "POST_PRODUCTION" as const,
      pct: 0.4,
      label: "40% before loading",
    },
    {
      phase: "IN_PORT" as const,
      pct: 0.3,
      label: "30% balance after loading",
    },
  ];
  for (const ph of PHASES) {
    await db.orderGoodsTranche.create({
      data: {
        orderId: order.id,
        phase: ph.phase,
        percentage: ph.pct,
        paid: false,
        notes: `${ph.label} · plan: $${(totalUsd * ph.pct).toFixed(2)}`,
      },
    });
  }

  console.log("Podsumowanie po typach:");
  const prefixLabels: Record<string, string> = {
    AS: "Szarfy akrobatyczne (AS)",
    AH: "Hamaki do jogi (AH)",
    KH: "Hamaki dla dzieci (KH)",
    HS: "Mocowania sufitowe (HS)",
    KAR: "Karabinki (KAR)",
  };
  for (const [prefix, agg] of [...byPrefix.entries()].sort()) {
    const label = prefixLabels[prefix] ?? prefix;
    console.log(
      `  ${label.padEnd(30)} ${String(agg.qty).padStart(5)} szt = $${agg.value.toFixed(2)}`,
    );
  }

  console.log(`\n✔ Zakończono:`);
  console.log(`  Numer: ${orderNumber}`);
  console.log(`  Pozycji: ${items.length}`);
  console.log(`  Sztuk łącznie: ${totalQty}`);
  console.log(`  Wartość EXW: $${totalUsd.toFixed(2)}`);
  if (usdToPln != null) {
    console.log(`  Wartość PLN: ${(totalUsd * usdToPln).toFixed(2)} zł`);
  }
  console.log(`  Transze: 30/40/30 (USD)`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
