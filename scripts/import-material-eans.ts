/**
 * Wgrywa kody EAN (GTIN) materiałów z pliku data/kody materialy.xlsx.
 *
 * Struktura arkusza MojeGS1:
 *   • C3 (kol 3) = GTIN
 *   • C22 (kol 22) = SKU produktu (Product.productCode)
 *   • Dane od R3 (R1, R2 to nagłówki/opisy)
 *
 * Bez --apply: dry-run (pokazuje co by zmieniło).
 */
import "dotenv/config";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type RowMapping = { sku: string; ean: string };

function readMappings(): RowMapping[] {
  const file = path.join(process.cwd(), "data", "kody materialy.xlsx");
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["MojeGS1"];
  if (!ws) throw new Error('Brak arkusza "MojeGS1" w pliku.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });

  const mappings: RowMapping[] = [];
  // Wiersze danych zaczynają się od R3 (index 2). Iterujemy do końca, ale
  // przerywamy gdy w SKU/GTIN brak danych — zazwyczaj plik MojeGS1 ma 1000
  // pustych wierszy na końcu.
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const ean = String(r[2] ?? "").trim(); // kol C
    const sku = String(r[21] ?? "").trim(); // kol V (index 21)
    if (!sku && !ean) continue;
    if (!sku) {
      console.warn(`  R${i + 1}: brak SKU (GTIN=${ean}) — pomijam`);
      continue;
    }
    if (!ean) {
      console.warn(`  R${i + 1}: brak GTIN (SKU=${sku}) — pomijam`);
      continue;
    }
    if (!/^\d{8}$|^\d{12,14}$/.test(ean)) {
      console.warn(`  R${i + 1}: nieprawidłowy GTIN „${ean}" (SKU=${sku})`);
      continue;
    }
    mappings.push({ sku, ean });
  }
  return mappings;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const mappings = readMappings();
  console.log(`Wczytano ${mappings.length} mapowań SKU → GTIN z pliku.\n`);

  let updated = 0;
  let alreadyOk = 0;
  let notFound = 0;
  let conflicts = 0;

  for (const m of mappings) {
    const product = await db.product.findFirst({
      where: { productCode: m.sku },
      select: { id: true, eanCode: true, name: true },
    });
    if (!product) {
      console.log(`  [BRAK]  ${m.sku.padEnd(28)}  (produkt nieznany)`);
      notFound++;
      continue;
    }
    if (product.eanCode === m.ean) {
      alreadyOk++;
      continue;
    }
    if (product.eanCode && product.eanCode !== m.ean) {
      console.log(
        `  [KONF]  ${m.sku.padEnd(28)}  stary=${product.eanCode}  nowy=${m.ean}`,
      );
      conflicts++;
    } else {
      console.log(`  [SET ]  ${m.sku.padEnd(28)}  ean=${m.ean}`);
    }
    if (apply) {
      await db.product.update({
        where: { id: product.id },
        data: { eanCode: m.ean },
      });
    }
    updated++;
  }

  console.log("\n=== Podsumowanie ===");
  console.log(`  Wczytano:         ${mappings.length}`);
  console.log(`  Do aktualizacji:  ${updated}`);
  console.log(`     w tym konflikty (nadpisanie): ${conflicts}`);
  console.log(`  Bez zmian:        ${alreadyOk}`);
  console.log(`  Brak w bazie:     ${notFound}`);

  if (!apply) {
    console.log(
      "\nTO BYL DRY-RUN. Aby zapisać: npx tsx scripts/import-material-eans.ts --apply",
    );
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
