import * as XLSX from "xlsx";

const wb = XLSX.readFile(
  "C:/Users/zdebd/projekty-zdeb/GitHub/API KRS/erp-firma/acro zamowienia/2026.xlsx",
);
const ws = wb.Sheets["Sheet1"];
const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

// Header w wierszu [14]:
// 16:Length cm 17:Width cm 18:Height cm 19:Packing qty 20:Carton 21:CBM/ctn
// 22:Total CBM 23:Net wt/ctn 24:Total net wt 25:Gross wt/ctn 26:Total gross wt
console.log(
  "SKU".padEnd(28),
  "Qty".padStart(5),
  "L×W×H".padStart(12),
  "Pack/ctn".padStart(8),
  "Ctn".padStart(5),
  "CBM/ctn".padStart(8),
  "NetW/ctn".padStart(9),
  "GrossW/ctn".padStart(10),
);
for (let i = 15; i < data.length; i++) {
  const row = data[i] as unknown[];
  if (!row || row.length === 0) continue;
  const sku = typeof row[3] === "string" ? row[3].trim() : null;
  const qty = typeof row[6] === "number" ? row[6] : 0;
  if (!sku || qty <= 0) continue;
  const l = row[16],
    w = row[17],
    h = row[18];
  const pack = row[19],
    ctn = row[20],
    cbmCtn = row[21];
  const nw = row[23],
    gw = row[25];
  console.log(
    sku.padEnd(28),
    String(qty).padStart(5),
    `${l ?? "—"}×${w ?? "—"}×${h ?? "—"}`.padStart(12),
    String(pack ?? "—").padStart(8),
    String(ctn ?? "—").padStart(5),
    typeof cbmCtn === "number" ? cbmCtn.toFixed(4).padStart(8) : "—".padStart(8),
    typeof nw === "number" ? nw.toFixed(2).padStart(9) : "—".padStart(9),
    typeof gw === "number" ? gw.toFixed(2).padStart(10) : "—".padStart(10),
  );
}
