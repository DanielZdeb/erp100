/**
 * Eksport materiałów do Excela — pogrupowanych wg KOLORU, w każdej grupie
 * 4 wiersze w stałej kolejności długości:
 *   M-KH-150-4M-{COLOR}
 *   M-AS-150-6M-{COLOR}
 *   M-AS-150-7M-{COLOR}
 *   M-AS-150-8M-{COLOR}
 *
 * Plik zapisany do `data/materialy.xlsx` (gitignored).
 */
import "dotenv/config";
import path from "node:path";
import { promises as fs } from "node:fs";
import ExcelJS from "exceljs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseMaterialSku } from "../src/lib/material-bolts";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// Sekwencja długości (PREFIX + długość)
const LENGTH_SEQ: { sku: (color: string) => string; lengthLabel: string }[] = [
  { sku: (c) => `M-KH-150-4M-${c}`, lengthLabel: "4 m" },
  { sku: (c) => `M-AS-150-6M-${c}`, lengthLabel: "6 m" },
  { sku: (c) => `M-AS-150-7M-${c}`, lengthLabel: "7 m" },
  { sku: (c) => `M-AS-150-8M-${c}`, lengthLabel: "8 m" },
];

// Mapa kodu koloru → polska nazwa (do kolumny "Kolor")
const COLOR_LABELS: Record<string, string> = {
  BLACK: "Czarny",
  "D.GREEN": "Ciemnozielony",
  DARKGREY: "Ciemnoszary",
  DARKBEIGE: "Ciemnobeżowy",
  GOLD: "Złoty",
  GREEN: "Zielony",
  GREY: "Szary",
  PASTELPINK: "Pastelowy róż",
  PINK: "Różowy",
  PIST: "Pistacjowy",
  PURPLE: "Fioletowy",
  "R.BLUE": "Granatowy",
  "S.BLUE": "Jasnoniebieski",
  WHITE: "Biały",
};

async function main() {
  const products = await db.product.findMany({
    where: { productCode: { startsWith: "M-" } },
    select: { productCode: true, name: true },
  });

  // Zbierz dostępne kolory
  const colors = new Set<string>();
  for (const p of products) {
    const parsed = parseMaterialSku(p.productCode);
    if (parsed) colors.add(parsed.color);
  }
  // Sortuj kolory wg polskiej nazwy (lub kodu jeśli brak nazwy)
  const sortedColors = Array.from(colors).sort((a, b) =>
    (COLOR_LABELS[a] ?? a).localeCompare(COLOR_LABELS[b] ?? b, "pl"),
  );

  // Index produktów po SKU dla szybkiego lookupu
  const byCode = new Map(products.map((p) => [p.productCode, p]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP firmy";
  wb.created = new Date(2026, 5, 14);

  const ws = wb.addWorksheet("Materiały", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Nagłówki
  ws.columns = [
    { header: "Kolor", key: "colorLabel", width: 18 },
    { header: "Kod koloru", key: "colorCode", width: 14 },
    { header: "Długość", key: "lengthLabel", width: 10 },
    { header: "Kod produktu (SKU)", key: "sku", width: 28 },
    { header: "Nazwa", key: "name", width: 50 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E7FF" }, // indigo-100
  };
  ws.getRow(1).alignment = { vertical: "middle" };

  // Wiersze: dla każdego koloru 4 długości
  let rowIdx = 2;
  for (const colorCode of sortedColors) {
    const colorStartRow = rowIdx;
    for (const { sku, lengthLabel } of LENGTH_SEQ) {
      const productCode = sku(colorCode);
      const product = byCode.get(productCode);
      ws.addRow({
        colorLabel: COLOR_LABELS[colorCode] ?? colorCode,
        colorCode: colorCode,
        lengthLabel: lengthLabel,
        sku: productCode,
        name: product?.name ?? "(BRAK W BAZIE)",
      });
      // SKU mono-font
      ws.getRow(rowIdx).getCell("sku").font = { name: "Consolas", size: 10 };
      // Brakujące podświetl na rose
      if (!product) {
        ws.getRow(rowIdx).getCell("name").font = {
          color: { argb: "FFBE123C" },
          italic: true,
        };
      }
      rowIdx++;
    }
    // Merge kolor + nazwa w jednej kolumnie A i B żeby zgrupować wzrokowo
    ws.mergeCells(`A${colorStartRow}:A${rowIdx - 1}`);
    ws.mergeCells(`B${colorStartRow}:B${rowIdx - 1}`);
    ws.getCell(`A${colorStartRow}`).alignment = {
      vertical: "middle",
      horizontal: "left",
    };
    ws.getCell(`B${colorStartRow}`).alignment = {
      vertical: "middle",
      horizontal: "center",
    };
    ws.getCell(`A${colorStartRow}`).font = { bold: true };
    // Cienka kreska między grupami kolorów
    ws.getRow(rowIdx - 1).border = {
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  }

  // Wszystkie komórki: thin grid
  for (let r = 1; r < rowIdx; r++) {
    for (let c = 1; c <= 5; c++) {
      const cell = ws.getRow(r).getCell(c);
      cell.border = {
        ...cell.border,
        top: { style: "hair", color: { argb: "FFE2E8F0" } },
        left: { style: "hair", color: { argb: "FFE2E8F0" } },
        right: { style: "hair", color: { argb: "FFE2E8F0" } },
      };
    }
  }

  // Wypisz
  const outDir = path.join(process.cwd(), "data");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "materialy.xlsx");
  await wb.xlsx.writeFile(outPath);

  console.log(`Zapisano: ${outPath}`);
  console.log(
    `Liczba kolorow: ${sortedColors.length}, lacznie wierszy: ${rowIdx - 2}`,
  );
}

main()
  .catch((e) => console.error(e))
  .finally(() => db.$disconnect());
