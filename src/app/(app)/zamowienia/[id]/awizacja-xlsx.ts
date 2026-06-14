/**
 * Generator XLSX awizacji z prawdziwym formatowaniem (kolory, ramki,
 * szerokości kolumn, scalanie, freeze panes) — exceljs.
 *
 * Stylizacja zgodna z podglądem awizacji:
 *  - Header rows z gradientem slate
 *  - Kolumna "Przyjęta" podświetlona żółtym (do wpisania przez magazyn)
 *  - Sekcje "ODBIORCA / KIEROWCA / POJAZD / TOWAR" z bold + tłem
 *  - Bottom SUM row pogrubiony
 *  - Notatki w żółtym callout boxie
 */

import ExcelJS from "exceljs";

export type XlsxGoodsItem = {
  productCode: string;
  productName: string;
  eanCode: string | null;
  code128: string | null;
  quantity: number;
  totalCbm: number;
  weightKg: number | null;
  importMode: "KARTON" | "LUZEM";
  unitsPerBox: number | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
};

export type XlsxInput = {
  orderNumber: string;
  orderName: string | null;
  items: XlsxGoodsItem[];
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  vehicleType: string;
  deliveryDate: string;
  awizacjaNotes: string;
  companyName: string;
  warehouseAddress: string;
  palletCount: number;
  palletLabel: string;
};

// Kolory ARGB (Excel używa AARRGGBB, A = alpha FF dla nieprzezroczystego)
const COLORS = {
  slate900: "FF1E293B",
  slate700: "FF334155",
  slate500: "FF64748B",
  slate200: "FFE2E8F0",
  slate100: "FFF1F5F9",
  slate50: "FFF8FAFC",
  amber50: "FFFEF3C7",
  amber200: "FFFDE68A",
  amber600: "FFD97706",
  amber800: "FF92400E",
  emerald100: "FFD1FAE5",
  emerald700: "FF047857",
  orange700: "FFC2410C",
  white: "FFFFFFFF",
};

function describeCarton(it: XlsxGoodsItem): {
  isLuzem: boolean;
  dimensionsCm: string | null;
  cartonCount: number | null;
  unitsPerBoxText: string;
} {
  if (it.importMode === "LUZEM") {
    return {
      isLuzem: true,
      dimensionsCm: null,
      cartonCount: null,
      unitsPerBoxText: "luzem",
    };
  }
  const w = it.boxWidthCm;
  const h = it.boxHeightCm;
  const d = it.boxDepthCm;
  const dims =
    w && h && d
      ? `${fmt(w)}×${fmt(h)}×${fmt(d)} cm`
      : null;
  const cartonCount =
    it.unitsPerBox && it.unitsPerBox > 0
      ? Math.ceil(it.quantity / it.unitsPerBox)
      : null;
  return {
    isLuzem: false,
    dimensionsCm: dims,
    cartonCount,
    unitsPerBoxText: it.unitsPerBox ? `${it.unitsPerBox} szt/kart` : "—",
  };
}

function fmt(v: number): string {
  return Number.isInteger(v) ? v.toString() : v.toFixed(1);
}

export async function generateAwizacjaXlsx(input: XlsxInput): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ERP " + input.companyName;
  wb.created = new Date();

  const ws = wb.addWorksheet("Awizacja", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true },
    properties: { defaultRowHeight: 18 },
  });

  // ── Szerokości kolumn (A-I = 9 kolumn jak tabela towaru) ─────────
  ws.columns = [
    { width: 6 }, // A — Lp
    { width: 22 }, // B — SKU
    { width: 38 }, // C — Nazwa
    { width: 24 }, // D — Karton (wymiary + szt/kart)
    { width: 18 }, // E — EAN-13
    { width: 18 }, // F — CODE-128
    { width: 11 }, // G — Dekl.
    { width: 13 }, // H — Przyjęta (do wpisu)
    { width: 9 }, // I — Kart.
    { width: 11 }, // J — CBM
  ];

  let row = 1;

  // ── Nagłówek + meta (1 wiersz tytuł, 1 wiersz info) ──────────────
  ws.mergeCells(`A${row}:J${row}`);
  const headerCell = ws.getCell(`A${row}`);
  headerCell.value = "AWIZACJA DOSTAWY";
  headerCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.slate900 } };
  headerCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 22;
  row++;

  ws.mergeCells(`A${row}:J${row}`);
  const metaCell = ws.getCell(`A${row}`);
  metaCell.value = `Zamówienie #${input.orderNumber}${input.orderName ? " · " + input.orderName : ""} · Wygenerowano: ${new Date().toLocaleString("pl-PL")}`;
  metaCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: COLORS.slate500 } };
  metaCell.alignment = { horizontal: "center" };
  ws.getRow(row).height = 14;
  row++;

  // ── ODBIORCA (1 wiersz: nagłówek+dane inline) ────────────────────
  drawSectionHeader(ws, row, "A", "J", "ODBIORCA");
  ws.getRow(row).height = 14;
  row++;
  ws.mergeCells(`A${row}:J${row}`);
  const recipCell = ws.getCell(`A${row}`);
  recipCell.value = `${input.companyName} · ${input.warehouseAddress}`;
  recipCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.slate900 } };
  recipCell.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
  ws.getRow(row).height = 16;
  row++;

  // ── KIEROWCA + POJAZD (2 wiersze: nagłówki, dane) ────────────────
  drawSectionHeader(ws, row, "A", "E", "KIEROWCA");
  drawSectionHeader(ws, row, "F", "J", "POJAZD");
  ws.getRow(row).height = 14;
  row++;
  ws.mergeCells(`A${row}:E${row}`);
  const driverCell = ws.getCell(`A${row}`);
  driverCell.value = `${input.driverName || "—"} · ${input.driverPhone || "—"}`;
  driverCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.slate900 } };
  driverCell.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
  ws.mergeCells(`F${row}:J${row}`);
  const vehicleCell = ws.getCell(`F${row}`);
  vehicleCell.value = `${input.vehiclePlate || "—"}${input.vehicleType ? " · " + input.vehicleType : ""}`;
  vehicleCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.slate900 } };
  vehicleCell.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
  ws.getRow(row).height = 16;
  row++;

  // ── TERMIN + PALETY (1 wiersz nagłówek, 1 wiersz dane) ───────────
  drawSectionHeader(ws, row, "A", "F", "TERMIN DOSTAWY");
  drawSectionHeader(ws, row, "G", "J", "PRZEWID. PALET");
  ws.getRow(row).height = 14;
  row++;
  ws.mergeCells(`A${row}:F${row}`);
  const termCell = ws.getCell(`A${row}`);
  termCell.value = input.deliveryDate
    ? new Date(input.deliveryDate).toLocaleString("pl-PL", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : "—";
  termCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.slate900 } };
  termCell.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
  ws.mergeCells(`G${row}:J${row}`);
  const palCell = ws.getCell(`G${row}`);
  palCell.value = `${input.palletCount} palet · ${input.palletLabel.replace(`${input.palletCount} palet `, "")}`;
  palCell.font = { name: "Calibri", size: 9, color: { argb: COLORS.slate700 } };
  palCell.alignment = { horizontal: "left", indent: 1, vertical: "middle", wrapText: true };
  ws.getRow(row).height = 18;
  row += 2;

  // ── Tabela TOWAR DO PRZYJĘCIA ────────────────────────────────────
  drawSectionHeader(
    ws,
    row,
    "A",
    "J",
    `TOWAR DO PRZYJĘCIA (${input.items.length} SKU)`,
  );
  row++;

  // Nagłówki tabeli
  const headers = [
    "Lp.",
    "SKU",
    "Nazwa",
    "Karton",
    "EAN-13",
    "CODE-128",
    "Dekl.",
    "Przyjęta",
    "Kart.",
    "CBM",
  ];
  headers.forEach((label, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = label;
    cell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: COLORS.slate900 },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: i === 7 ? COLORS.amber200 : COLORS.slate200 },
    };
    cell.alignment = {
      horizontal:
        i === 0 || i >= 6 ? "center" : i === 1 || i === 2 ? "left" : "center",
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.slate500 } },
      bottom: { style: "medium", color: { argb: COLORS.slate700 } },
      left: { style: "thin", color: { argb: COLORS.slate500 } },
      right: { style: "thin", color: { argb: COLORS.slate500 } },
    };
  });
  ws.getRow(row).height = 24;
  row++;

  // Wiersze danych
  let totalQty = 0;
  let totalCartons = 0;
  let totalCbm = 0;
  let totalWeight = 0;
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const carton = describeCarton(it);
    totalQty += it.quantity;
    totalCbm += it.totalCbm;
    if (it.weightKg) totalWeight += it.weightKg * it.quantity;
    if (carton.cartonCount) totalCartons += carton.cartonCount;

    const cells = [
      String(i + 1),
      it.productCode,
      it.productName,
      carton.isLuzem
        ? "luzem"
        : [carton.dimensionsCm, carton.unitsPerBoxText]
            .filter(Boolean)
            .join("\n"),
      it.eanCode ?? "",
      it.code128 ?? "",
      it.quantity,
      "", // Przyjęta — puste, do wpisania przez magazyn
      carton.isLuzem ? "luzem" : carton.cartonCount ?? "",
      it.totalCbm,
    ];

    cells.forEach((value, ci) => {
      const cell = ws.getCell(row, ci + 1);
      cell.value = value;
      cell.font = {
        name: ci === 1 || ci === 4 || ci === 5 ? "Consolas" : "Calibri",
        size: ci === 1 ? 9 : 10,
        bold: ci === 2 || ci === 6, // Nazwa + Dekl. pogrubione
        color: {
          argb: carton.isLuzem && (ci === 3 || ci === 8) ? COLORS.orange700 : COLORS.slate900,
        },
      };
      cell.alignment = {
        horizontal:
          ci === 0 || ci >= 6
            ? "center"
            : ci === 1 || ci === 2
              ? "left"
              : "center",
        vertical: "middle",
        wrapText: true,
        indent: ci === 1 || ci === 2 ? 1 : 0,
      };
      // Tło — alternating + żółta kolumna Przyjęta
      const bgColor =
        ci === 7
          ? COLORS.amber50
          : i % 2 === 0
            ? COLORS.white
            : COLORS.slate50;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: bgColor },
      };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.slate200 } },
        bottom: { style: "thin", color: { argb: COLORS.slate200 } },
        left: {
          style: ci === 7 ? "medium" : "thin",
          color: { argb: ci === 7 ? COLORS.amber600 : COLORS.slate200 },
        },
        right: {
          style: ci === 7 ? "medium" : "thin",
          color: { argb: ci === 7 ? COLORS.amber600 : COLORS.slate200 },
        },
      };
      // Format liczbowy dla CBM
      if (ci === 9 && typeof value === "number") {
        cell.numFmt = "0.000";
      }
    });
    ws.getRow(row).height = carton.isLuzem ? 28 : 36;
    row++;
  }

  // Wiersz SUMA
  const sumCells = [
    "Σ",
    "RAZEM",
    `${input.items.length} SKU`,
    "",
    "",
    "",
    totalQty,
    "", // Przyjęta razem — puste
    totalCartons > 0 ? totalCartons : "",
    totalCbm,
  ];
  sumCells.forEach((value, ci) => {
    const cell = ws.getCell(row, ci + 1);
    cell.value = value;
    cell.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: COLORS.slate900 },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: ci === 7 ? COLORS.amber200 : COLORS.slate200 },
    };
    cell.alignment = {
      horizontal: ci === 0 || ci >= 6 ? "center" : "left",
      vertical: "middle",
      indent: ci === 1 ? 1 : 0,
    };
    cell.border = {
      top: { style: "medium", color: { argb: COLORS.slate700 } },
      bottom: { style: "medium", color: { argb: COLORS.slate700 } },
      left: { style: "thin", color: { argb: COLORS.slate500 } },
      right: { style: "thin", color: { argb: COLORS.slate500 } },
    };
    if (ci === 9 && typeof value === "number") cell.numFmt = "0.000";
  });
  ws.getRow(row).height = 24;
  row++;

  // Szacowana waga pod tabelą
  if (totalWeight > 0) {
    ws.mergeCells(`A${row}:J${row}`);
    const wCell = ws.getCell(`A${row}`);
    wCell.value = `Szacowana waga: ${totalWeight.toFixed(0)} kg`;
    wCell.font = {
      name: "Calibri",
      size: 10,
      bold: true,
      color: { argb: COLORS.slate700 },
    };
    wCell.alignment = { horizontal: "right", indent: 1 };
    row++;
  }
  row++;

  // ── Notatki (callout żółty) ──────────────────────────────────────
  if (input.awizacjaNotes.trim()) {
    ws.mergeCells(`A${row}:J${row}`);
    const notesHeader = ws.getCell(`A${row}`);
    notesHeader.value = "⚠ NOTATKI DO DOKUMENTU";
    notesHeader.font = {
      name: "Calibri",
      size: 11,
      bold: true,
      color: { argb: COLORS.amber800 },
    };
    notesHeader.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.amber50 },
    };
    notesHeader.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
    notesHeader.border = {
      top: { style: "medium", color: { argb: COLORS.amber600 } },
      left: { style: "medium", color: { argb: COLORS.amber600 } },
      right: { style: "medium", color: { argb: COLORS.amber600 } },
    };
    ws.getRow(row).height = 22;
    row++;
    ws.mergeCells(`A${row}:J${row}`);
    const notesBody = ws.getCell(`A${row}`);
    notesBody.value = input.awizacjaNotes;
    notesBody.font = {
      name: "Calibri",
      size: 10,
      color: { argb: COLORS.amber800 },
    };
    notesBody.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.amber50 },
    };
    notesBody.alignment = {
      horizontal: "left",
      vertical: "top",
      indent: 1,
      wrapText: true,
    };
    notesBody.border = {
      bottom: { style: "medium", color: { argb: COLORS.amber600 } },
      left: { style: "medium", color: { argb: COLORS.amber600 } },
      right: { style: "medium", color: { argb: COLORS.amber600 } },
    };
    const lines = input.awizacjaNotes.split("\n").length;
    ws.getRow(row).height = Math.max(40, lines * 18);
    row += 2;
  }

  // ── Podpisy ──────────────────────────────────────────────────────
  row += 2;
  ws.getCell(`A${row}`).value = "_______________________________";
  ws.getCell(`F${row}`).value = "_______________________________";
  row++;
  ws.getCell(`A${row}`).value = "Podpis kierowcy";
  ws.getCell(`A${row}`).font = { name: "Calibri", size: 9, color: { argb: COLORS.slate500 } };
  ws.getCell(`F${row}`).value = "Podpis przyjmującego (magazyn)";
  ws.getCell(`F${row}`).font = { name: "Calibri", size: 9, color: { argb: COLORS.slate500 } };

  // Bez freeze panes — żaden wiersz nie jest zablokowany przy scrollu

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ─── Helpery ─────────────────────────────────────────────────────────

function drawSectionHeader(
  ws: ExcelJS.Worksheet,
  row: number,
  startCol: string,
  endCol: string,
  label: string,
) {
  ws.mergeCells(`${startCol}${row}:${endCol}${row}`);
  const cell = ws.getCell(`${startCol}${row}`);
  cell.value = label;
  cell.font = {
    name: "Calibri",
    size: 9,
    bold: true,
    color: { argb: COLORS.white },
  };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.slate700 },
  };
  cell.alignment = { horizontal: "left", indent: 1, vertical: "middle" };
  ws.getRow(row).height = 18;
}

function drawKv(
  ws: ExcelJS.Worksheet,
  row: number,
  labelCol: string,
  valueColStart: string,
  label: string,
  value: string,
  bold: boolean,
) {
  const labelCell = ws.getCell(`${labelCol}${row}`);
  labelCell.value = label + ":";
  labelCell.font = {
    name: "Calibri",
    size: 9,
    color: { argb: COLORS.slate500 },
  };
  labelCell.alignment = { horizontal: "left", indent: 1 };

  const valCell = ws.getCell(`${valueColStart}${row}`);
  valCell.value = value;
  valCell.font = {
    name: "Calibri",
    size: 10,
    bold,
    color: { argb: COLORS.slate900 },
  };
  valCell.alignment = { horizontal: "left", indent: 1 };
}
