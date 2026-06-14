/** Odczyt arkusza MojeGS1 z surowych wierszy (bez automatycznego nagłówka). */
import path from "node:path";
import * as XLSX from "xlsx";

function main() {
  const file = path.join(process.cwd(), "data", "kody materialy.xlsx");
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets["MojeGS1"];
  // Surowo: każdy wiersz jako array
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: false,
    defval: "",
  });
  console.log(`Łączna liczba wierszy: ${rows.length}`);
  console.log(`Pierwsza 10 wierszy (skrócone do 4 kolumn):`);
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] as unknown[];
    const snippet = r.slice(0, 4).map((v) => {
      const s = String(v ?? "");
      return s.length > 40 ? s.slice(0, 40) + "…" : s;
    });
    console.log(`  R${i + 1}: [${snippet.join(" | ")}]`);
  }
  // Wypisz pełną zawartość 3 ostatnich wierszy z danymi (gdzie powinny być
  // właściwe rekordy)
  console.log("\nWiersze z danymi (od R5 wstecz pierwsze 5):");
  for (let i = 4; i < Math.min(rows.length, 9); i++) {
    const r = rows[i] as unknown[];
    console.log(`R${i + 1}:`);
    r.forEach((v, c) => {
      const s = String(v ?? "").trim();
      if (s) console.log(`  C${c + 1}: ${s}`);
    });
  }
}

main();
