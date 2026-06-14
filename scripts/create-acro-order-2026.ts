/**
 * Tworzy zamówienie ACRO4F na podstawie 2026.xlsx (Fullbax K-17/05/2026-F).
 * Dodaje TYLKO produkty istniejące w bazie. Brakujące SKU raportuje na konsoli.
 *
 * Koszty logistyki wpisane z "Kalkulacja kosztów" sheet (PLN netto).
 * Cło NIE dodawane jako osobny koszt — system auto-liczy z product.customsDutyPct
 * (jeśli ustawione). Można doliczyć ręcznie w UI gdyby trzeba.
 */

import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const USD_RATE = 3.6356;
const ORDER_NAME = "Fullbax K-17/05/2026-F (kontener 40HQ)";
const CONTAINER_M3 = 68;

// Koszty logistyki w PLN netto (z arkusza "Kalkulacja kosztów")
const LOGISTICS_COSTS: {
  title: string;
  amountPln: number;
  type:
    | "KONTROLA_JAKOSCI"
    | "ODPRAWA"
    | "KOSZTY_TERMINALOWE"
    | "TRANSPORT_LADOWY"
    | "TRANSPORT_MORSKI"
    | "CLO"
    | "PROWIZJA_POSREDNIKA"
    | "VAT"
    | "INNE";
}[] = [
  { title: "Fracht z Chin", amountPln: 10543.24, type: "TRANSPORT_MORSKI" },
  { title: "Koszty FOB", amountPln: 3635.6, type: "KOSZTY_TERMINALOWE" },
  { title: "Koszty załadunku", amountPln: 472.63, type: "KOSZTY_TERMINALOWE" },
  { title: "Przelewy do Chin", amountPln: 450, type: "INNE" },
  { title: "Koszty lokalne w Chinach", amountPln: 7271.2, type: "INNE" },
  { title: "Odprawa celna", amountPln: 1000, type: "ODPRAWA" },
  { title: "Cło [towar + transport]", amountPln: 16651.05, type: "CLO" },
  { title: "Transport z portu do magazynu", amountPln: 9000, type: "TRANSPORT_LADOWY" },
  { title: "Quality Check", amountPln: 2000, type: "KONTROLA_JAKOSCI" },
  { title: "Prowizja", amountPln: 26048.76, type: "PROWIZJA_POSREDNIKA" },
];

type ItemRow = {
  sku: string;
  qty: number;
  unitPriceUsd: number;
};

async function nextOrderNumber(companyId: string): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await db.importOrder.findMany({
    where: { companyId, orderNumber: { startsWith: `${year}-` } },
    select: { orderNumber: true },
  });
  let maxSeq = 0;
  for (const o of existing) {
    const m = o.orderNumber.match(/^\d{4}-(\d+)$/);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }
  return `${year}-${String(maxSeq + 1).padStart(4, "0")}`;
}

async function main() {
  // ── Wczytaj Excel ───────────────────────────────────────────────────
  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
  );
  const ws = wb.Sheets["Sheet1"];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const itemsFromXlsx: ItemRow[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;
    const sku = typeof row[3] === "string" ? row[3].trim() : null;
    const qty = typeof row[6] === "number" ? row[6] : 0;
    const unitPrice = typeof row[8] === "number" ? row[8] : 0;
    if (sku && qty > 0 && unitPrice > 0) {
      itemsFromXlsx.push({ sku, qty, unitPriceUsd: unitPrice });
    }
  }
  console.log(`Pozycji z SKU w pliku: ${itemsFromXlsx.length}`);

  // ── Firma ACRO4F ─────────────────────────────────────────────────────
  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Brak firmy ACRO4F");
  console.log(`Firma: ${company.name}`);

  // ── Produkty w bazie ────────────────────────────────────────────────
  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      productCode: { in: itemsFromXlsx.map((i) => i.sku) },
    },
    select: {
      id: true,
      productCode: true,
      name: true,
      defaultUnitPriceUsd: true,
      cbmPerUnit: true,
      referenceContainerM3: true,
      unitsPerContainer: true,
      boxWidthCm: true,
      boxHeightCm: true,
      boxDepthCm: true,
      unitsPerBox: true,
    },
  });
  const pMap = new Map(products.map((p) => [p.productCode, p]));
  console.log(`Znalezionych w bazie: ${products.length}`);

  const missing: string[] = [];
  const toAdd: { product: (typeof products)[number]; qty: number; usd: number }[] = [];
  for (const it of itemsFromXlsx) {
    const p = pMap.get(it.sku);
    if (!p) {
      missing.push(`${it.sku} (qty=${it.qty}, $${it.unitPriceUsd})`);
    } else {
      toAdd.push({ product: p, qty: it.qty, usd: it.unitPriceUsd });
    }
  }
  console.log(`Do dodania: ${toAdd.length}`);
  if (missing.length > 0) {
    console.log(`\n⚠ BRAKUJE w bazie (${missing.length}) — POMINIĘTE:`);
    for (const m of missing) console.log(`    ${m}`);
  }

  // ── Twórca: pierwszy user ACRO4F lub jakikolwiek ─────────────────────
  const creator =
    (await db.user.findFirst({
      where: { companyId: company.id },
      select: { id: true, email: true },
    })) ??
    (await db.user.findFirst({ select: { id: true, email: true } }));
  if (!creator) throw new Error("Brak żadnego usera");
  console.log(`Creator: ${creator.email}`);

  const orderNumber = await nextOrderNumber(company.id);
  console.log(`\nTworzę zamówienie ${orderNumber}…`);

  const order = await db.importOrder.create({
    data: {
      companyId: company.id,
      orderNumber,
      name: ORDER_NAME,
      status: "PLANOWANE",
      createdById: creator.id,
      containerType: "FORTY_FT",
      containerSizeM3: CONTAINER_M3,
      usdToPlnRate: USD_RATE,
      vatRate: 0.23,
      orderedAt: new Date("2026-04-17"),
      notes: `Import z 2026.xlsx (Fullbax). Kontener 40HQ. Pominięto ${missing.length} pozycji bez SKU w bazie (patrz konsola).`,
    },
    select: { id: true, orderNumber: true },
  });

  // Status history
  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: "PLANOWANE",
      changedById: creator.id,
    },
  });

  // Domyślne 3 transze 30/40/30
  await db.orderGoodsTranche.createMany({
    data: [
      { orderId: order.id, phase: "PRE_PRODUCTION", percentage: 0.3 },
      { orderId: order.id, phase: "POST_PRODUCTION", percentage: 0.4 },
      { orderId: order.id, phase: "IN_PORT", percentage: 0.3 },
    ],
  });

  // Logistyka — wpisane jako osobne wpisy. amountPln = NETTO (isNetto=true).
  for (const c of LOGISTICS_COSTS) {
    await db.importOrderCost.create({
      data: {
        orderId: order.id,
        type: c.type,
        name: c.type === "INNE" ? c.title : null,
        amountPln: c.amountPln,
        amount: c.amountPln,
        currency: "PLN",
        isNetto: true,
        vatRate: 0.23,
        exchangeRate: 1,
        paid: false,
        notes: c.title,
      },
    });
  }
  const totalLogistics = LOGISTICS_COSTS.reduce((s, c) => s + c.amountPln, 0);
  console.log(`✓ Dodano ${LOGISTICS_COSTS.length} kosztów logistyki: ${totalLogistics.toFixed(2)} zł`);

  // Pozycje
  let totalUsd = 0;
  let totalCbm = 0;
  let sort = 0;
  for (const it of toAdd) {
    const p = it.product;
    // CBM/szt — preferuj zapisaną wartość, fallback na referenceContainer
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
        sortOrder: sort++,
      },
    });
    const usdLine = it.usd * it.qty;
    totalUsd += usdLine;
    totalCbm += (cbm ?? 0) * it.qty;
  }

  console.log(`\n✓ Utworzono ${order.orderNumber}`);
  console.log(`  Pozycji: ${toAdd.length}`);
  console.log(`  Suma USD: $${totalUsd.toFixed(2)}`);
  console.log(`  Suma PLN @ ${USD_RATE}: ${(totalUsd * USD_RATE).toFixed(2)} zł`);
  console.log(`  Suma CBM: ${totalCbm.toFixed(2)} m³`);
  console.log(`  Logistyka: ${totalLogistics.toFixed(2)} zł`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
