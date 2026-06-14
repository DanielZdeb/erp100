/**
 * Tworzy nowe zamówienie importowe dla Zdeb Invest:
 * - kontener FORTY_FT (68 m³)
 * - 7 siedzisk po wskazanej ilości (suma 2941 — pełny kontener LUZEM)
 * - 2 zestawy nóg (1900 złotych + 1100 czarnych)
 *
 * Suma cbm:
 *   2941 × 0.02312 ≈ 67.99 m³  (siedziska — pełny kontener)
 *   3000 × 0.001   = 3.00 m³   (nogi)
 *   ➜ ~71 m³ → 2 kontenery 68 m³ (luźna kalkulacja).
 *
 * Zauważ: Jeden kontener nie pomieści wszystkiego — system pokaże 2× kontenery
 * przy fillRate ~52%. Ok, user sam to oceni.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const ITEMS: Array<{ sku: string; qty: number }> = [
  { sku: "KD-LIGHTBEIGE", qty: 413 },
  { sku: "KD-POWDERPINK", qty: 463 },
  { sku: "KD-DARKBEIGE", qty: 663 },
  { sku: "KD-BLACK", qty: 613 },
  { sku: "KD-DARKGRAY", qty: 263 },
  { sku: "KD-GRAY", qty: 263 },
  { sku: "KD-NAVYBLUE", qty: 263 },
  { sku: "KD-LEGS-G", qty: 1900 },
  { sku: "KD-LEGS-B", qty: 1100 },
];

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
  const zdebInvest = await db.company.findFirst({
    where: { name: { contains: "Zdeb Invest" } },
    select: { id: true, name: true },
  });
  if (!zdebInvest) throw new Error("Brak firmy Zdeb Invest");
  console.log(`Firma: ${zdebInvest.name}`);

  // Załaduj produkty
  const products = await db.product.findMany({
    where: { productCode: { in: ITEMS.map((i) => i.sku) } },
    select: {
      id: true,
      productCode: true,
      defaultUnitPriceUsd: true,
      cbmPerUnit: true,
      referenceContainerM3: true,
      unitsPerContainer: true,
    },
  });
  const bySku = new Map(products.map((p) => [p.productCode, p]));
  for (const it of ITEMS) {
    if (!bySku.has(it.sku)) throw new Error(`Brak produktu ${it.sku}`);
  }

  // Znajdź user-creatora — pierwszego usera dla tej firmy
  const creator = await db.user.findFirst({
    where: { companyId: zdebInvest.id },
    select: { id: true, email: true },
  });
  if (!creator) {
    // Fallback do pierwszego dowolnego usera
    const anyUser = await db.user.findFirst({ select: { id: true, email: true } });
    if (!anyUser) throw new Error("Brak żadnego usera w bazie");
    console.log(`Brak usera dla Zdeb Invest, używam ${anyUser.email}`);
  }
  const createdById = (creator ?? (await db.user.findFirst({ select: { id: true } }))!).id;

  const orderNumber = await nextOrderNumber(zdebInvest.id);
  console.log(`Tworzę zamówienie ${orderNumber}…`);

  const order = await db.importOrder.create({
    data: {
      companyId: zdebInvest.id,
      orderNumber,
      name: "Krzesła TYP D — kontener 1",
      status: "PLANOWANE",
      createdById,
      containerType: "FORTY_FT",
      containerSizeM3: 68,
      vatRate: 0.23,
    },
    select: { id: true, orderNumber: true },
  });

  await db.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: null,
      toStatus: "PLANOWANE",
      changedById: createdById,
    },
  });
  await db.orderGoodsTranche.createMany({
    data: [
      { orderId: order.id, phase: "PRE_PRODUCTION", percentage: 0.3 },
      { orderId: order.id, phase: "POST_PRODUCTION", percentage: 0.4 },
      { orderId: order.id, phase: "IN_PORT", percentage: 0.3 },
    ],
  });

  let sort = 0;
  let totalUsd = 0;
  let totalCbm = 0;
  for (const it of ITEMS) {
    const p = bySku.get(it.sku)!;
    // cbm auto: LUZEM = referenceContainerM3 / unitsPerContainer
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
        unitPriceUsd: p.defaultUnitPriceUsd,
        cbmPerUnit: cbm,
        sortOrder: sort++,
      },
    });
    const lineUsd = (p.defaultUnitPriceUsd ?? 0) * it.qty;
    const lineCbm = (cbm ?? 0) * it.qty;
    totalUsd += lineUsd;
    totalCbm += lineCbm;
    console.log(
      `  ✓ ${it.sku.padEnd(15)} qty=${String(it.qty).padStart(5)}  $${lineUsd.toFixed(2).padStart(10)}  cbm=${lineCbm.toFixed(3).padStart(7)} m³`,
    );
  }

  console.log(
    `\nUtworzono ${order.orderNumber}.  Suma:  $${totalUsd.toFixed(2)}  /  ${totalCbm.toFixed(2)} m³  (≈ ${Math.ceil(totalCbm / 68)} × 68m³ kontener)`,
  );
  console.log(`URL: /zamowienia/${order.id}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
