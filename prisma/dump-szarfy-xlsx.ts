import * as XLSX from "xlsx";
import { join } from "node:path";

const path = join(__dirname, "..", "acro zamowienia", "szarfy.xlsx");
const wb = XLSX.readFile(path);
console.log("Sheets:", wb.SheetNames);
for (const sheetName of wb.SheetNames) {
  console.log(`\n=== Sheet: ${sheetName} ===`);
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  for (let i = 0; i < rows.length; i++) {
    console.log(`Row ${i}:`, JSON.stringify(rows[i]));
  }
}
