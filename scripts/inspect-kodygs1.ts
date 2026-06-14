/**
 * Wypisuje pierwsze 10 wierszy z kodygs1.xlsx — żeby zlokalizować kolumny
 * SKU i EAN przed porównaniem z bazą.
 */
import "dotenv/config";
import * as XLSX from "xlsx";

async function main() {
  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/kodygs1.xlsx",
  );
  console.log("Arkusze:", wb.SheetNames);
  for (const sheetName of wb.SheetNames) {
    console.log(`\n========= ${sheetName} =========`);
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    console.log(`Wierszy: ${data.length}`);
    for (let r = 0; r < Math.min(15, data.length); r++) {
      const row = data[r] as unknown[];
      if (!row || row.length === 0) {
        console.log(`R${r}: (pusty)`);
        continue;
      }
      console.log(`\n--- R${r} (${row.length} kolumn) ---`);
      for (let c = 0; c < Math.min(row.length, 20); c++) {
        const v = row[c];
        if (v == null || v === "") continue;
        const str = String(v).slice(0, 80);
        console.log(`  C${c.toString().padStart(2)}: ${str}`);
      }
    }

    // Wykryj kolumny z EAN-like (8/13 cyfr) — żeby szybko znaleźć tę z kodami.
    const eanLikeCounts = new Map<number, number>();
    for (let r = 0; r < data.length; r++) {
      const row = data[r] as unknown[];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v == null) continue;
        const str = String(v).trim();
        if (/^\d{8}$|^\d{13}$/.test(str)) {
          eanLikeCounts.set(c, (eanLikeCounts.get(c) ?? 0) + 1);
        }
      }
    }
    console.log("\nKolumny EAN-like:");
    for (const [col, count] of [...eanLikeCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  C${col}: ${count} EANów`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
