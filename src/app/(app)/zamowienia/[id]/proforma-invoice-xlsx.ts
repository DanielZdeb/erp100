/**
 * Generator XLSX Proforma Invoice — format kompatybilny z plikami od chińskich
 * dostawców (np. Fullbax). Jeden arkusz "PI" z nagłówkiem (From/To/Invoice No/
 * Date/Incoterms), tabelą pozycji oraz wierszami TOTAL + deposit I/II/balance.
 *
 * Kolumny tabeli pozycji (ten sam układ co w `LAWKI202640HC.xlsx`):
 *   A   = No.
 *   B   = Product photo (opcjonalnie — embed JPEG primary image)
 *   C   = Specification
 *   D   = Model name (= SKU / productCode)
 *   E   = EAN
 *   F   = Quantity
 *   G   = Unit (set / szt)
 *   H   = Unit price (EXW USD)
 *   I   = Total Amount (EXW USD) = F × H
 *   K   = Remark
 *   L   = Certificate
 *   N   = Length Cm (box depth)
 *   O   = Width Cm  (box width)
 *   P   = Height Cm (box height)
 *   Q   = Packing qty (sztuk w kartonie)
 *   R   = Carton (= Quantity / Packing qty, ceil)
 *   S   = CBM/ctn  (= L*W*H / 1 000 000)
 *   T   = Total CBM (= Carton × CBM/ctn)
 *   U   = Net Weight (kg) — unit weight
 *   V   = Total Net Weight (kg) = F × U
 *   W   = Gross Weight (kg) — carton weight
 *   X   = Total Gross Weight (kg) = Carton × W
 *
 * Fotki: dla kazdej pozycji z `primaryImageUrl` pobieramy obrazek jako Blob
 * (fetch client-side), konwertujemy przez FileReader na base64 i embedujemy
 * przez `wb.addImage` + `ws.addImage(id, { tl, ext })`. Fotka przyklejana jest
 * do kolumny B wiersza produktu, rozmiar ~90×90 px (wiersz ma height=90).
 *
 * Upload: ten sam plik mozna rozparsowac serwerowo przez `parseProformaXlsxFile`
 * w `src/server/order-proforma-sync.ts` i zsynchronizowac z ERP.
 */

import ExcelJS from "exceljs";

export type ProformaInvoiceItem = {
  productCode: string;
  productName: string;
  eanCode: string | null;
  specification: string | null;
  quantity: number;
  unitPriceUsd: number | null;
  /** Primary image URL (lokalny `/uploads/...` lub Vercel Blob). */
  primaryImageUrl: string | null;
  /** Wymiary kartonu importowego (box) w cm. */
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
  /** Sztuk w kartonie importowym. */
  unitsPerBox: number | null;
  /** Waga sztuki (kg) — net. */
  weightKg: number | null;
  /** Waga kartonu (kg) — gross. */
  boxWeightKg: number | null;
};

export type ProformaInvoiceHeader = {
  /** Z nagłówka "From" na PI — nasz dostawca/broker w HK (lub my sami jak sprzedajemy). */
  fromName: string;
  fromAddressLines: string[];
  /** Z nagłówka "To" — odbiorca towaru (zazwyczaj nasza społka). */
  toName: string;
  toAddressLines: string[];
  invoiceNumber: string;
  searchingNumber: string | null;
  invoiceDate: Date;
  madeBy: string | null;
  incoterms: string;
};

export type ProformaInvoiceInput = {
  header: ProformaInvoiceHeader;
  items: ProformaInvoiceItem[];
};

export type ProformaInvoiceOptions = {
  /** Czy embedowac fotki produktów (fetch URL → blob → base64). */
  includeImages: boolean;
};

const COL_WIDTHS: Record<string, number> = {
  A: 5,
  B: 18, // photo
  C: 32, // specification
  D: 20, // model name
  E: 16, // EAN
  F: 10, // qty
  G: 7, // unit
  H: 12, // unit price
  I: 14, // total
  J: 2,
  K: 16, // remark
  L: 12, // certificate
  M: 2,
  N: 8,
  O: 8,
  P: 8,
  Q: 10, // packing qty
  R: 8, // carton
  S: 10, // cbm/ctn
  T: 10, // total cbm
  U: 10, // net wt
  V: 12, // total net wt
  W: 10, // gross
  X: 12, // total gross
};

const HEADER_FILL = { argb: "FFE2E8F0" } as const;
const BORDER_THIN = { style: "thin" as const, color: { argb: "FFCBD5E1" } };

async function fetchImageAsBase64(
  url: string,
): Promise<{ data: string; ext: "png" | "jpeg" } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const ext: "png" | "jpeg" = blob.type.includes("png") ? "png" : "jpeg";
    const buf = await blob.arrayBuffer();
    // Konwersja ArrayBuffer -> base64 bez FileReadera (window.btoa + Uint8Array)
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(
        ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
      );
    }
    return { data: btoa(bin), ext };
  } catch {
    return null;
  }
}

export async function generateProformaInvoiceXlsx(
  input: ProformaInvoiceInput,
  options: ProformaInvoiceOptions,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ACRO4F ERP";
  wb.created = new Date();

  const ws = wb.addWorksheet("PI", {
    pageSetup: { orientation: "landscape", fitToPage: true },
  });

  // Szerokości kolumn
  for (const [col, w] of Object.entries(COL_WIDTHS)) {
    ws.getColumn(col).width = w;
  }

  // ─── Nagłówek PI (wiersze 1-11) ──────────────────────────────────
  ws.mergeCells("A1:L1");
  const title = ws.getCell("A1");
  title.value = "Proforma Invoice";
  title.font = { bold: true, size: 18 };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.getCell("A2").value = "From:";
  ws.getCell("A2").font = { bold: true };
  ws.getCell("A3").value = input.header.fromName;
  input.header.fromAddressLines.slice(0, 2).forEach((line, idx) => {
    ws.getCell(`A${4 + idx}`).value = line;
  });

  ws.getCell("I3").value = "Invoice Number:";
  ws.getCell("I3").font = { bold: true };
  ws.getCell("J3").value = input.header.invoiceNumber;

  if (input.header.searchingNumber) {
    ws.getCell("I4").value = "Searching Number:";
    ws.getCell("I4").font = { bold: true };
    ws.getCell("J4").value = input.header.searchingNumber;
  }

  ws.getCell("I5").value = "Date:";
  ws.getCell("I5").font = { bold: true };
  ws.getCell("J5").value = input.header.invoiceDate;
  ws.getCell("J5").numFmt = "yyyy-mm-dd";

  if (input.header.madeBy) {
    ws.getCell("I6").value = "Made by:";
    ws.getCell("I6").font = { bold: true };
    ws.getCell("J6").value = input.header.madeBy;
  }

  ws.getCell("A7").value = "To:";
  ws.getCell("A7").font = { bold: true };
  ws.getCell("I7").value = "Incoterms:";
  ws.getCell("I7").font = { bold: true };
  ws.getCell("J7").value = input.header.incoterms;

  ws.getCell("A8").value = input.header.toName;
  ws.getCell("A8").font = { bold: true };
  input.header.toAddressLines.slice(0, 3).forEach((line, idx) => {
    ws.getCell(`A${9 + idx}`).value = line;
  });

  // ─── Not final Packing List (wiersz 12) ────────────────────────────
  ws.getCell("N12").value = "Not final Packing List";
  ws.getCell("N12").font = { bold: true, italic: true };

  // ─── Nagłówki tabeli (wiersze 13-14, merged dla całych 2 wierszy) ──
  const headerRowsStart = 13;
  const headerRowsEnd = 14;
  const headers: Array<[string, string]> = [
    ["A", "No."],
    ["B", "Product photo for reference only"],
    ["C", "Specification"],
    ["F", "Quantity"],
    ["G", "Unit"],
    ["H", "Unit price\n(EXW USD)"],
    ["I", "Total Amount\n(EXW USD)"],
    ["K", "Remark"],
    ["L", "Certificate"],
  ];
  for (const [col, label] of headers) {
    ws.mergeCells(`${col}${headerRowsStart}:${col}${headerRowsEnd}`);
    const c = ws.getCell(`${col}${headerRowsStart}`);
    c.value = label;
    c.font = { bold: true };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: HEADER_FILL };
    c.border = {
      top: BORDER_THIN,
      bottom: BORDER_THIN,
      left: BORDER_THIN,
      right: BORDER_THIN,
    };
  }

  // Podkolumny w wierszu 14: D=Model name, E=EAN + wymiary/CBM/waga
  const subHeaders: Array<[string, string]> = [
    ["D", "Model name"],
    ["E", "EAN"],
    ["N", "Length\nCm"],
    ["O", "Width\nCm"],
    ["P", "Height\nCm"],
    ["Q", "Packing\nqty"],
    ["R", "Carton"],
    ["S", "CBM/ctn"],
    ["T", "Total CBM"],
    ["U", "Net Weight\n(kg)"],
    ["V", "Total\nNet Weight\n(kg)"],
    ["W", "Gross Weight"],
    ["X", "Total\nGross Weight\n(kg)"],
  ];
  for (const [col, label] of subHeaders) {
    const c = ws.getCell(`${col}${headerRowsEnd}`);
    c.value = label;
    c.font = { bold: true, size: 9 };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: HEADER_FILL };
    c.border = {
      top: BORDER_THIN,
      bottom: BORDER_THIN,
      left: BORDER_THIN,
      right: BORDER_THIN,
    };
  }
  ws.getRow(13).height = 18;
  ws.getRow(14).height = 36;

  // ─── Pozycje (wiersze 15..15+N-1) ──────────────────────────────────
  const firstItemRow = 15;
  const rowHeight = options.includeImages ? 70 : 24;

  // Preload fotek równolegle, zebrane w mapie productCode -> imageId
  const imageIdByCode = new Map<string, number>();
  if (options.includeImages) {
    const results = await Promise.all(
      input.items.map(async (it) => {
        if (!it.primaryImageUrl) return null;
        const img = await fetchImageAsBase64(it.primaryImageUrl);
        if (!img) return null;
        const id = wb.addImage({
          base64: `data:image/${img.ext};base64,${img.data}`,
          extension: img.ext,
        });
        return [it.productCode, id] as const;
      }),
    );
    for (const r of results) {
      if (r) imageIdByCode.set(r[0], r[1]);
    }
  }

  input.items.forEach((it, idx) => {
    const r = firstItemRow + idx;
    const row = ws.getRow(r);
    row.height = rowHeight;

    row.getCell("A").value = idx + 1;
    row.getCell("C").value = it.specification ?? it.productName;
    row.getCell("D").value = it.productCode;
    row.getCell("E").value = it.eanCode ?? "";
    row.getCell("F").value = it.quantity;
    row.getCell("G").value = "set";
    row.getCell("H").value = it.unitPriceUsd ?? "";
    row.getCell("I").value = { formula: `F${r}*H${r}` };
    row.getCell("N").value = it.boxDepthCm ?? "";
    row.getCell("O").value = it.boxWidthCm ?? "";
    row.getCell("P").value = it.boxHeightCm ?? "";
    row.getCell("Q").value = it.unitsPerBox ?? "";
    // Carton = ceil(F / Q)
    row.getCell("R").value = {
      formula: `IF(Q${r}>0,ROUNDUP(F${r}/Q${r},0),"")`,
    };
    // CBM/ctn = N*O*P/1000000
    row.getCell("S").value = {
      formula: `IF(AND(N${r}>0,O${r}>0,P${r}>0),ROUND(N${r}*O${r}*P${r}/1000000,4),"")`,
    };
    // Total CBM = R * S
    row.getCell("T").value = {
      formula: `IF(AND(ISNUMBER(R${r}),ISNUMBER(S${r})),ROUND(R${r}*S${r},3),"")`,
    };
    row.getCell("U").value = it.weightKg ?? "";
    row.getCell("V").value = {
      formula: `IF(ISNUMBER(U${r}),ROUND(F${r}*U${r},2),"")`,
    };
    row.getCell("W").value = it.boxWeightKg ?? "";
    row.getCell("X").value = {
      formula: `IF(AND(ISNUMBER(R${r}),ISNUMBER(W${r})),ROUND(R${r}*W${r},2),"")`,
    };

    // Styling: cienkie ramki, wrażliwość na cyfry
    const cols = [
      "A",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "K",
      "L",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
    ];
    for (const col of cols) {
      const c = row.getCell(col);
      c.border = {
        top: BORDER_THIN,
        bottom: BORDER_THIN,
        left: BORDER_THIN,
        right: BORDER_THIN,
      };
      c.alignment = {
        vertical: "middle",
        horizontal: col === "C" ? "left" : "center",
        wrapText: true,
      };
    }
    row.getCell("H").numFmt = "#,##0.00";
    row.getCell("I").numFmt = "#,##0.00";
    row.getCell("S").numFmt = "0.0000";
    row.getCell("T").numFmt = "0.000";
    row.getCell("U").numFmt = "0.00";
    row.getCell("V").numFmt = "0.00";
    row.getCell("W").numFmt = "0.00";
    row.getCell("X").numFmt = "0.00";

    // Embed fotki w kolumnie B
    if (options.includeImages) {
      const imageId = imageIdByCode.get(it.productCode);
      if (imageId !== undefined) {
        // tl = top-left (0-indexed), ext in pixels. Kolumna B szerokości ~18
        // chr ≈ 126px, wiersz 70pt ≈ 93px. Trzymajmy obrazek 80×80.
        ws.addImage(imageId, {
          tl: { col: 1, row: r - 1 },
          ext: { width: 80, height: 80 },
          editAs: "oneCell",
        });
      }
    }
  });

  // ─── TOTAL + deposit I/II/balance ──────────────────────────────────
  const lastItemRow = firstItemRow + input.items.length - 1;
  const totalRow = lastItemRow + 1;
  ws.getCell(`A${totalRow}`).value = "TOTAL:";
  ws.getCell(`A${totalRow}`).font = { bold: true };
  ws.getCell(`F${totalRow}`).value = {
    formula: `SUM(F${firstItemRow}:F${lastItemRow})`,
  };
  ws.getCell(`I${totalRow}`).value = {
    formula: `SUM(I${firstItemRow}:I${lastItemRow})`,
  };
  ws.getCell(`T${totalRow}`).value = {
    formula: `SUM(T${firstItemRow}:T${lastItemRow})`,
  };
  ws.getCell(`V${totalRow}`).value = {
    formula: `SUM(V${firstItemRow}:V${lastItemRow})`,
  };
  ws.getCell(`X${totalRow}`).value = {
    formula: `SUM(X${firstItemRow}:X${lastItemRow})`,
  };
  for (const col of ["A", "F", "I", "T", "V", "X"]) {
    const c = ws.getCell(`${col}${totalRow}`);
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: HEADER_FILL };
    c.border = { top: BORDER_THIN, bottom: BORDER_THIN };
  }
  ws.getCell(`I${totalRow}`).numFmt = "#,##0.00";

  // deposit I/II/balance (50 / 0 / 50 jako default)
  const depositIRow = totalRow + 1;
  const depositIIRow = totalRow + 2;
  const balanceRow = totalRow + 3;
  ws.getCell(`A${depositIRow}`).value = "deposit I";
  ws.getCell(`H${depositIRow}`).value = 0.5;
  ws.getCell(`H${depositIRow}`).numFmt = "0%";
  ws.getCell(`I${depositIRow}`).value = {
    formula: `H${depositIRow}*I${totalRow}`,
  };
  ws.getCell(`I${depositIRow}`).numFmt = "#,##0.00";

  ws.getCell(`A${depositIIRow}`).value = "deposit II";
  ws.getCell(`H${depositIIRow}`).value = 0;
  ws.getCell(`H${depositIIRow}`).numFmt = "0%";
  ws.getCell(`I${depositIIRow}`).value = {
    formula: `H${depositIIRow}*I${totalRow}`,
  };
  ws.getCell(`I${depositIIRow}`).numFmt = "#,##0.00";

  ws.getCell(`A${balanceRow}`).value = "balance";
  ws.getCell(`I${balanceRow}`).value = {
    formula: `I${totalRow}-I${depositIRow}-I${depositIIRow}`,
  };
  ws.getCell(`I${balanceRow}`).numFmt = "#,##0.00";
  ws.getCell(`A${balanceRow}`).font = { bold: true };
  ws.getCell(`I${balanceRow}`).font = { bold: true };

  // Remark section
  const remarkStart = balanceRow + 2;
  ws.getCell(`A${remarkStart}`).value = "REMARK:";
  ws.getCell(`A${remarkStart}`).font = { bold: true };
  const remarks = [
    "The price may change according to the ordered quantity.",
    "Price term: EXW USD without tax term.",
    "Payment: T/T; 50% deposit, the balance should be finished before delivery.",
    "Production time: about 35-40 working days after received deposit and after confirm products.",
  ];
  remarks.forEach((line, idx) => {
    ws.getCell(`A${remarkStart + 1 + idx}`).value = line;
  });

  // Freeze top (nagłówek + 11 wierszy top info)
  ws.views = [{ state: "frozen", ySplit: 14 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
