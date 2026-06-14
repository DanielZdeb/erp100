/**
 * Aktualizuje pole eanCode na produktach ACRO4F na podstawie pliku
 * acro zamowienia/2026.xlsx. Dopasowanie po productCode (SKU).
 *
 * Zachowanie:
 *  - Tylko produkty firmy ACRO4F.
 *  - Jeśli produkt już ma eanCode i jest TAKI SAM jak w xlsx → pomiń.
 *  - Jeśli produkt ma eanCode ale INNY niż w xlsx → loguj ostrzeżenie i
 *    NIE nadpisuj (user może świadomie różnić — wymagaj decyzji).
 *  - Jeśli produkt nie ma eanCode → zapisz z xlsx.
 *  - Jeśli w xlsx brak EAN → pomiń wiersz.
 *
 * Pass `--write` żeby faktycznie zapisać. Domyślnie dry-run.
 */
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type XlsxItem = { sku: string; ean: string; nameEn: string };

async function main() {
  const writeMode = process.argv.includes("--write");
  const forceConflicts = process.argv.includes("--force-conflicts");
  console.log(writeMode ? "[WRITE MODE]" : "[DRY-RUN — bez zapisu, użyj --write]");
  if (forceConflicts) {
    console.log("[--force-conflicts] Nadpisuję też produkty z konfliktem (plik = źródło prawdy).");
  }

  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
  );
  const ws = wb.Sheets["Sheet1"];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  // Zbierz wszystkie pary SKU → EAN. Pomiń puste.
  const skuToEan = new Map<string, XlsxItem>();
  for (const row of data) {
    if (!row) continue;
    const r = row as unknown[];
    const sku = typeof r[3] === "string" ? r[3].trim() : "";
    const ean = r[4] != null ? String(r[4]).trim() : "";
    const nameEn = typeof r[2] === "string" ? r[2].slice(0, 60) : "";
    if (!sku || !ean) continue;
    if (!/^\d{8}$|^\d{13}$/.test(ean)) continue;
    // Pierwsze wystąpienie wygrywa (kolejne duplikaty zwykle te same dane).
    if (!skuToEan.has(sku)) {
      skuToEan.set(sku, { sku, ean, nameEn });
    }
  }
  console.log(`\nUnikalnych SKU+EAN w pliku: ${skuToEan.size}`);

  // Znajdź firmę ACRO.
  const company = await db.company.findFirst({
    where: { name: { contains: "ACRO" } },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Brak firmy ACRO4F");
  console.log(`Firma: ${company.name}`);

  // Pobierz wszystkie produkty z SKU które są w pliku.
  const skus = [...skuToEan.keys()];
  const products = await db.product.findMany({
    where: {
      companyId: company.id,
      productCode: { in: skus },
    },
    select: { id: true, productCode: true, name: true, eanCode: true },
  });
  const productBySku = new Map(products.map((p) => [p.productCode, p]));
  console.log(`Produkty w bazie (dopasowane): ${products.length} / ${skus.length}`);

  // Klasyfikuj.
  let toSetCount = 0; // brak eanCode → zapis
  let conflictCount = 0; // ma eanCode inne niż w xlsx → ostrzeżenie
  let okCount = 0; // ma eanCode taki sam → pomiń
  let missingProductCount = 0; // SKU z xlsx nie ma produktu w bazie

  const conflicts: string[] = [];
  const toSet: { id: string; sku: string; ean: string; name: string }[] = [];
  const conflictsToOverwrite: { id: string; sku: string; oldEan: string; newEan: string; name: string }[] = [];
  const missing: string[] = [];

  for (const [sku, x] of skuToEan) {
    const p = productBySku.get(sku);
    if (!p) {
      missingProductCount++;
      missing.push(`  ${sku.padEnd(28)} → ${x.ean}  (${x.nameEn})`);
      continue;
    }
    if (!p.eanCode) {
      toSetCount++;
      toSet.push({ id: p.id, sku, ean: x.ean, name: p.name });
    } else if (p.eanCode.trim() === x.ean) {
      okCount++;
    } else {
      conflictCount++;
      conflicts.push(
        `  ${sku.padEnd(28)}  BAZA=${p.eanCode.padEnd(13)}  XLSX=${x.ean}  → ${p.name.slice(0, 40)}`,
      );
      conflictsToOverwrite.push({
        id: p.id,
        sku,
        oldEan: p.eanCode,
        newEan: x.ean,
        name: p.name,
      });
    }
  }

  console.log(`\n=== KLASYFIKACJA ===`);
  console.log(`  Do zapisu (brak eanCode):    ${toSetCount}`);
  console.log(`  OK (już mają taki sam EAN):  ${okCount}`);
  console.log(`  KONFLIKT (różny EAN):        ${conflictCount}`);
  console.log(`  Brak produktu w bazie:       ${missingProductCount}`);

  if (toSet.length > 0) {
    console.log(`\n=== DO ZAPISU (${toSet.length}) ===`);
    for (const it of toSet) {
      console.log(
        `  ${it.sku.padEnd(28)} ← ${it.ean}  → ${it.name.slice(0, 50)}`,
      );
    }
  }

  if (conflicts.length > 0) {
    console.log(`\n=== KONFLIKTY (${conflicts.length}) ===`);
    console.log(`Produkt ma już INNY EAN — sprawdź ręcznie, nie nadpisuję:`);
    for (const c of conflicts) console.log(c);
  }

  if (missing.length > 0) {
    console.log(`\n=== SKU z xlsx bez produktu w bazie (${missing.length}) ===`);
    for (const m of missing.slice(0, 20)) console.log(m);
    if (missing.length > 20) console.log(`  ... + ${missing.length - 20} więcej`);
  }

  // NAJPIERW konflikty — żeby zwolnić stare EANy które są przypisane błędnie
  // (np. PASTELPINK ma EAN należący do RP-SILVER → musimy najpierw przepisać
  // PASTELPINK, dopiero potem RP-SILVER dostanie swój EAN bez kolizji unique).
  if (writeMode && forceConflicts && conflictsToOverwrite.length > 0) {
    console.log(`\n=== KROK 1: nadpisuję ${conflictsToOverwrite.length} konflikt(y)... ===`);
    for (const it of conflictsToOverwrite) {
      await db.product.update({
        where: { id: it.id },
        data: { eanCode: it.newEan },
      });
      console.log(`  ${it.sku.padEnd(28)} ${it.oldEan} → ${it.newEan}`);
    }
    console.log("✓ Konflikty rozwiązane.");
  } else if (writeMode && !forceConflicts && conflictsToOverwrite.length > 0) {
    console.log(
      `\nUwaga: ${conflictsToOverwrite.length} konflikt(ów) NIE zostało nadpisanych. Dodaj --force-conflicts żeby przepisać.`,
    );
  }

  if (writeMode && toSet.length > 0) {
    console.log(`\n=== KROK 2: zapisuję ${toSet.length} brakujących eanCode... ===`);
    for (const it of toSet) {
      await db.product.update({
        where: { id: it.id },
        data: { eanCode: it.ean },
      });
    }
    console.log("✓ Zapisano nowe EANy.");
  } else if (!writeMode && toSet.length > 0) {
    console.log(`\nUruchom z flagą --write żeby faktycznie zapisać ${toSet.length} EANów.`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
