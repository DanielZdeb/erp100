/**
 * Tworzy zamówienie kontenerowe dla ACRO4F na podstawie proformy
 * Fullbax Limited (faktura K-17/06/2025-F, order ref S-10-6-167-2025).
 *
 * 8 pozycji, łącznie 619 sztuk, $25 417,13 EXW.
 * Tryb płatności: 30% deposit / 40% before loading / 30% balance.
 * Produkcja: ~30-35 dni roboczych.
 *
 * Status: PLANOWANE (zaliczka już opłacona wg PDF, ale UI pozwoli przesunąć).
 *
 * Uruchomienie: npx tsx prisma/create-acro4f-order-rury.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const COMPANY_SLUG = "acro4f";
const CREATOR_EMAIL = "contact@acro4f.com";

// Mapowanie SKU produktów w bazie → ilość + cena netto USD z proformy
const ITEMS: Array<{
  sku: string;
  quantity: number;
  unitPriceUsd: number;
}> = [
  { sku: "PRP-50CM-SILVER", quantity: 34, unitPriceUsd: 9.42 },
  { sku: "PRP-50CM-BLACK", quantity: 10, unitPriceUsd: 12.52 },
  { sku: "PRP-50CM-PINK", quantity: 5, unitPriceUsd: 12.52 },
  { sku: "RP-SILVER", quantity: 350, unitPriceUsd: 39.2 },
  { sku: "RP-GOLD", quantity: 45, unitPriceUsd: 52.54 },
  { sku: "RP-BLACK", quantity: 125, unitPriceUsd: 49.57 },
  { sku: "RP-MULTI", quantity: 30, unitPriceUsd: 54.57 },
  { sku: "RP-PINK", quantity: 20, unitPriceUsd: 49.57 },
];

const ORDER_NAME = "Rury pole dance — Fullbax 06/2025";
const PROFORMA_REF = "PI K-17/06/2025-F · Order S-10-6-167-2025";
const NOTES = `${PROFORMA_REF}
Dostawca: Fullbax Limited (HK)
Incoterms: EXW
Płatność: 30% deposit / 40% before loading / 30% balance after loading
Produkcja: ~30-35 dni roboczych od opłaty zaliczki
Made by: Sherly/Krzysztof`;

async function fetchUsdRate(): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.nbp.pl/api/exchangerates/rates/A/USD/?format=json",
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      rates: { mid: number }[];
    };
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
    select: { id: true, name: true, email: true },
  });
  if (!creator) {
    console.error(`User ${CREATOR_EMAIL} nie istnieje.`);
    process.exit(1);
  }
  console.log(`Cel: ${company.name} (twórca: ${creator.email})\n`);

  // 2. Walidacja: wszystkie SKU istnieją w bazie
  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      productCode: { in: ITEMS.map((i) => i.sku) },
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      cbmPerUnit: true,
      unitsPerPallet: true,
    },
  });
  const bySku = new Map(products.map((p) => [p.productCode, p]));
  const missing = ITEMS.filter((i) => !bySku.has(i.sku));
  if (missing.length > 0) {
    console.error(
      `Brak produktów: ${missing.map((m) => m.sku).join(", ")}`,
    );
    process.exit(1);
  }

  // 3. Idempotency: czy zamówienie już istnieje?
  const existing = await db.importOrder.findFirst({
    where: { companyId: company.id, name: ORDER_NAME },
    select: { id: true, orderNumber: true },
  });
  if (existing) {
    console.log(
      `Zamówienie "${ORDER_NAME}" już istnieje (nr ${existing.orderNumber}, id=${existing.id}). Pomijam.`,
    );
    await db.$disconnect();
    return;
  }

  // 4. Kurs USD z NBP
  const usdToPln = await fetchUsdRate();
  console.log(
    `Kurs USD/PLN: ${usdToPln != null ? usdToPln.toFixed(4) : "(NBP niedostępne)"}\n`,
  );

  // 5. Tworzymy zamówienie
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
      containerType: "FORTY_FT", // 619 rur ~2.5m → 40'
      containerSizeM3: 68,
      estimatedProductionDays: 32,
      notes: NOTES,
    },
  });
  console.log(`Utworzono ImportOrder id=${order.id}`);

  // 6. Historia statusu (jak w createOrderAction)
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: "PLANOWANE",
      changedById: creator.id,
    },
  });

  // 7. Pozycje
  let sortOrder = 0;
  let totalUsd = 0;
  let totalQty = 0;
  for (const item of ITEMS) {
    const p = bySku.get(item.sku)!;
    const itemTotal = item.unitPriceUsd * item.quantity;
    totalUsd += itemTotal;
    totalQty += item.quantity;
    await db.importOrderItem.create({
      data: {
        orderId: order.id,
        productId: p.id,
        quantity: item.quantity,
        unitPriceUsd: item.unitPriceUsd,
        unitPriceCny: null,
        unitPriceIsBrutto: false, // EXW = netto
        cbmPerUnit: p.cbmPerUnit,
        usdToPlnRate: usdToPln,
        cnyToPlnRate: null,
        sortOrder: sortOrder++,
      },
    });
    console.log(
      `  + ${p.productCode.padEnd(20)} × ${String(item.quantity).padStart(4)} × $${item.unitPriceUsd.toFixed(2)} = $${itemTotal.toFixed(2)}`,
    );
  }

  // 8. Transze towarowe — 30/40/30 wg PDF.
  // Wg PDF pierwsza transza (30% deposit) jest już opłacona — ale nie znamy
  // kursu po jakim. User oznaczy paid i wpisze kurs w UI. Zostawiamy wszystkie
  // jako paid=false z procentem + notatka z kwotą USD do referencji.
  const PHASES = [
    {
      phase: "PRE_PRODUCTION" as const,
      pct: 0.3,
      label: "30% deposit (wg PDF już opłacone — oznacz w UI)",
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

  console.log(`\n✔ Zakończono:`);
  console.log(`  Numer: ${orderNumber}`);
  console.log(`  Pozycji: ${ITEMS.length}`);
  console.log(`  Sztuk łącznie: ${totalQty}`);
  console.log(`  Wartość EXW: $${totalUsd.toFixed(2)}`);
  console.log(`  Transze: 30/40/30 (USD)`);

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
