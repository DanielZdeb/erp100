import * as XLSX from "xlsx";
import path from "node:path";

const filePath = path.join(
  "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
);
const wb = XLSX.readFile(filePath);
console.log("Sheets:", wb.SheetNames);
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  const range = ws["!ref"];
  console.log(`\n=== Sheet "${sheetName}"  range=${range} ===`);
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  console.log(`Rows: ${data.length}`);
  // tylko Sheet1 — pełne dumpowanie produktów
  if (sheetName !== "Sheet1") continue;
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row || (Array.isArray(row) && row.length === 0)) continue;
    // pomijaj wiersze headerowe i podsumowujące
    const cellNum = (row as unknown[])[0];
    const cellName = (row as unknown[])[2];
    const cellSku = (row as unknown[])[3];
    const cellQty = (row as unknown[])[6];
    const cellUnitPrice = (row as unknown[])[8];
    // wyświetlaj tylko wiersze z produktami (mają qty)
    if (typeof cellQty === "number" && cellQty > 0) {
      console.log(
        `  [${i}] num=${cellNum}  SKU=${cellSku ?? "—"}  qty=${cellQty}  unit=$${cellUnitPrice}  name="${String(cellName ?? "").slice(0, 60).replace(/[\r\n]+/g, " ")}"`,
      );
    }
  }
}
