/**
 * Wypisuje pierwsze kilka wierszy danych z xlsx — sprawdzenie czy
 * kolumna C4 (EAN) faktycznie pasuje do SKU z C3.
 */
import "dotenv/config";
import * as XLSX from "xlsx";

async function main() {
  const wb = XLSX.readFile(
    "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
  );
  const ws = wb.Sheets["Sheet1"];
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  console.log("Próbka wierszy z danymi (R10..R30):");
  console.log("idx | C3 (SKU)                     | C4 (EAN?)        | C2 (name)");
  console.log("----|------------------------------|------------------|-----------");
  for (let r = 8; r < Math.min(40, data.length); r++) {
    const row = data[r] as unknown[];
    if (!row) continue;
    const sku = row[3];
    const ean = row[4];
    const name = row[2];
    if (sku == null && ean == null) continue;
    console.log(
      `R${r.toString().padStart(2)} | ${String(sku ?? "—").padEnd(28).slice(0, 28)} | ${String(ean ?? "—").padEnd(16).slice(0, 16)} | ${String(name ?? "—").slice(0, 50)}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
