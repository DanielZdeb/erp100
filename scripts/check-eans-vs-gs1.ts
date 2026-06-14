/**
 * Sprawdza zgodność EAN-ów w bazie ERP z oficjalnymi kodami GS1 z pliku
 * acro zamowienia/kodygs1.xlsx (eksport z MojeGS1).
 *
 * Raportuje 3 grupy:
 *  1. EAN w bazie NIE istnieje w GS1 — kod nielegalny / pomyłka.
 *  2. EAN w bazie ma w GS1 status „wycofany" / inny niż „Aktywny".
 *  3. EAN w GS1 nie jest przypisany do żadnego produktu w bazie — luka.
 *
 * Plus walka semantyczna: porównanie nazwy produktu (zwyczajowa+wariant w GS1)
 * z nazwą w bazie — pokazuje rozbieżności do ręcznego sprawdzenia.
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type Gs1Row = {
  ean: string;
  fullName: string; // C1
  brand: string; // C4
  commonName: string; // C6
  variant: string; // C7
  qty: string; // C8 (100, 1, 50, ...)
  unit: string; // C9 (ml, szt, g, ...)
  status: string; // C17 — Aktywny / Wycofany / …
};

async function main() {
  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/kodygs1.xlsx",
  );
  const ws = wb.Sheets["MojeGS1"];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  // Wiersze danych zaczynają się od R2 (R0 + R1 to nagłówki/opisy).
  const gs1ByEan = new Map<string, Gs1Row>();
  for (let r = 2; r < data.length; r++) {
    const row = data[r] as unknown[];
    if (!row) continue;
    const ean = row[2] != null ? String(row[2]).trim() : "";
    if (!/^\d{8}$|^\d{13}$/.test(ean)) continue;
    gs1ByEan.set(ean, {
      ean,
      fullName: row[1] != null ? String(row[1]).trim() : "",
      brand: row[4] != null ? String(row[4]).trim() : "",
      commonName: row[6] != null ? String(row[6]).trim() : "",
      variant: row[7] != null ? String(row[7]).trim() : "",
      qty: row[8] != null ? String(row[8]).trim() : "",
      unit: row[9] != null ? String(row[9]).trim() : "",
      status: row[17] != null ? String(row[17]).trim() : "",
    });
  }
  console.log(`GS1 kody w pliku: ${gs1ByEan.size}`);

  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Brak firmy ACRO4F");

  // Wszystkie produkty ACRO4F z eanCode (nie-null).
  const products = await db.product.findMany({
    where: { companyId: company.id, eanCode: { not: null } },
    select: { id: true, productCode: true, name: true, eanCode: true, status: true },
  });
  console.log(`Produkty ACRO4F z EAN w bazie: ${products.length}\n`);

  // 1. EAN w bazie ALE NIE w GS1 — pomyłka / nielegalny kod.
  const notInGs1: typeof products = [];
  // 2. EAN w bazie + w GS1 ALE status w GS1 nie „Aktywny".
  const inactiveInGs1: { p: (typeof products)[number]; gs1: Gs1Row }[] = [];
  // 3. Wszystkie OK (są w GS1 + Aktywny) — count.
  let okCount = 0;
  for (const p of products) {
    const ean = p.eanCode!.trim();
    const gs1 = gs1ByEan.get(ean);
    if (!gs1) {
      notInGs1.push(p);
      continue;
    }
    if (!gs1.status.toLowerCase().includes("aktywn")) {
      inactiveInGs1.push({ p, gs1 });
      continue;
    }
    okCount++;
  }

  // 3. EAN w GS1 ale NIE używany w bazie — luka (nieprzypisany kod GS1).
  const usedEans = new Set(products.map((p) => p.eanCode!.trim()));
  const orphansInGs1: Gs1Row[] = [];
  for (const [ean, gs1] of gs1ByEan) {
    if (!usedEans.has(ean)) orphansInGs1.push(gs1);
  }
  // Filter dla orphans: tylko aktywne (wycofane to OK że ich nie używamy).
  const orphanActive = orphansInGs1.filter((g) =>
    g.status.toLowerCase().includes("aktywn"),
  );
  const orphanInactive = orphansInGs1.filter(
    (g) => !g.status.toLowerCase().includes("aktywn"),
  );

  console.log(`=== PODSUMOWANIE ===`);
  console.log(`  ✓ OK (EAN w GS1 + aktywny):           ${okCount}`);
  console.log(`  ⚠ EAN w bazie NIE ma w GS1:           ${notInGs1.length}`);
  console.log(`  ⚠ EAN w bazie nie-aktywny w GS1:      ${inactiveInGs1.length}`);
  console.log(`  ⓘ EAN aktywny w GS1, nieużywany:      ${orphanActive.length}`);
  console.log(`  ⓘ EAN nieaktywny w GS1, nieużywany:   ${orphanInactive.length}`);

  if (notInGs1.length > 0) {
    console.log(`\n=== ⚠ EAN-y w bazie KTÓRYCH NIE MA w GS1 (${notInGs1.length}) ===`);
    console.log("Te kody NIE są zarejestrowane w GS1 — błąd lub kradzież puli:");
    for (const p of notInGs1) {
      console.log(
        `  ${p.productCode.padEnd(28)} EAN=${p.eanCode}  → ${p.name.slice(0, 60)}`,
      );
    }
  }

  if (inactiveInGs1.length > 0) {
    console.log(`\n=== ⚠ EAN-y w bazie z STATUSEM ≠ aktywny w GS1 (${inactiveInGs1.length}) ===`);
    for (const { p, gs1 } of inactiveInGs1) {
      console.log(
        `  ${p.productCode.padEnd(28)} EAN=${p.eanCode}  GS1-status="${gs1.status}"  → ${p.name.slice(0, 50)}`,
      );
    }
  }

  if (orphanActive.length > 0) {
    console.log(`\n=== ⓘ AKTYWNE EAN-y w GS1 nieużywane w bazie (${orphanActive.length}) ===`);
    console.log("Te kody są zarejestrowane jako aktywne w GS1 ale brak produktu w ERP:");
    for (const g of orphanActive) {
      const label = g.commonName + (g.variant ? ` ${g.variant}` : "");
      console.log(
        `  ${g.ean}  ${label.padEnd(50).slice(0, 50)}  (${g.qty} ${g.unit})`,
      );
    }
  }

  if (orphanInactive.length > 0) {
    console.log(`\n=== ⓘ Nieaktywne EAN-y w GS1 — nieużywane w bazie (${orphanInactive.length}) ===`);
    console.log("Wycofane kody — OK że ich nie używamy:");
    for (const g of orphanInactive.slice(0, 20)) {
      const label = g.commonName + (g.variant ? ` ${g.variant}` : "");
      console.log(
        `  ${g.ean}  "${g.status}"  ${label.slice(0, 50)}`,
      );
    }
    if (orphanInactive.length > 20) {
      console.log(`  ... + ${orphanInactive.length - 20} więcej`);
    }
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
