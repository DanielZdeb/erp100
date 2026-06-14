/**
 * Generator interaktywnego PDF awizacji z polami formularza.
 *
 * Magazyn otwiera plik w Acrobat / Chrome / na tablecie i wpisuje "Przyjętą
 * ilość" do każdego wiersza. PDF używa standardu AcroForm — pola tekstowe
 * są zapisywane razem z plikiem przy "Save As".
 *
 * Czcionka: NotoSans-Regular z Google Fonts (CDN) — wspiera polskie znaki,
 * cache w pamięci modułu po pierwszym pobraniu.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

import { loadRobotoFonts } from "./pdf-font";
import {
  drawBarcodeVector,
  isValidBarcodeValue,
} from "./barcodes-per-product";

export type PdfGoodsItem = {
  productCode: string;
  productName: string;
  color: string | null;
  eanCode: string | null;
  code128: string | null;
  quantity: number;
  cbmPerUnit: number | null;
  totalCbm: number;
  weightKg: number | null;
  importMode: "KARTON" | "LUZEM";
  unitsPerBox: number | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
};

export type PdfAwizacjaInput = {
  orderNumber: string;
  orderName: string | null;
  items: PdfGoodsItem[];
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  vehicleType: string;
  deliveryDate: string; // ISO-ish "2026-06-10T14:00"
  awizacjaNotes: string;
  companyName: string;
  warehouseAddress: string;
  palletCount: number;
  palletLabel: string;
};

// A4 portrait w punktach PDF (1pt = 1/72 cala, 1mm ≈ 2.834pt)
const PAGE_W = 595.28; // 210mm
const PAGE_H = 841.89; // 297mm
const MM = 2.83465;

const COLORS = {
  black: rgb(0, 0, 0),
  slate900: rgb(0.117, 0.16, 0.235),
  slate700: rgb(0.278, 0.333, 0.412),
  slate500: rgb(0.392, 0.455, 0.545),
  slate200: rgb(0.886, 0.91, 0.94),
  slate100: rgb(0.945, 0.957, 0.973),
  amber50: rgb(1, 0.953, 0.78),
  amber600: rgb(0.851, 0.467, 0.024),
  amber800: rgb(0.572, 0.314, 0.043),
  orange700: rgb(0.768, 0.343, 0.043),
};

function mm(v: number): number {
  return v * MM;
}

// buildBarcodeSvgPng usunięta — kody kreskowe rysujemy teraz wektorowo
// przez `drawBarcodeVector` (z `barcodes-per-product.ts`). PNG raster był
// rozmyty na zoomie i nieselektowalny w czytnikach.

/**
 * Generuje interaktywny PDF awizacji.
 * Zwraca Blob, gotowy do `URL.createObjectURL` + download.
 */
export async function generateInteractiveAwizacjaPdf(
  input: PdfAwizacjaInput,
): Promise<Blob> {
  // Pobierz czcionki (cache w pdf-font.ts) — Roboto Regular + Bold z pełnym Latin Ext
  const { regular, bold } = await loadRobotoFonts();

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontRegular = await pdfDoc.embedFont(regular, { subset: true });
  const fontBold = await pdfDoc.embedFont(bold, { subset: true });

  const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  const form = pdfDoc.getForm();

  let y = PAGE_H - mm(10); // pozycja kursora od góry

  // ── Nagłówek ─────────────────────────────────────────────────────
  drawText(page, "AWIZACJA DOSTAWY", {
    x: PAGE_W / 2,
    y,
    font: fontBold,
    size: 16,
    color: COLORS.slate900,
    align: "center",
  });
  y -= 18;
  drawText(
    page,
    `Zamówienie #${input.orderNumber}${input.orderName ? " · " + input.orderName : ""}`,
    {
      x: PAGE_W / 2,
      y,
      font: fontRegular,
      size: 8,
      color: COLORS.slate500,
      align: "center",
    },
  );
  y -= 14;

  // ── Sekcje danych ────────────────────────────────────────────────
  drawSectionHeader(page, "ODBIORCA", mm(8), y, fontBold);
  y -= 11;
  drawText(page, input.companyName, {
    x: mm(8),
    y,
    font: fontBold,
    size: 9,
    color: COLORS.black,
  });
  y -= 10;
  drawText(page, input.warehouseAddress, {
    x: mm(8),
    y,
    font: fontRegular,
    size: 8,
    color: COLORS.slate700,
  });
  y -= 14;

  // KIEROWCA + POJAZD w 2 kolumnach
  const col1X = mm(8);
  const col2X = PAGE_W / 2 + mm(2);
  const sectionTopY = y;

  drawSectionHeader(page, "KIEROWCA", col1X, y, fontBold);
  let leftY = y - 11;
  drawKv(page, "Imię i nazwisko:", input.driverName || "—", col1X, leftY, fontRegular, fontBold);
  leftY -= 10;
  drawKv(page, "Telefon:", input.driverPhone || "—", col1X, leftY, fontRegular, fontBold);
  leftY -= 12;

  drawSectionHeader(page, "POJAZD", col2X, sectionTopY, fontBold);
  let rightY = sectionTopY - 11;
  drawKv(
    page,
    "Numer rejestracyjny:",
    input.vehiclePlate || "—",
    col2X,
    rightY,
    fontRegular,
    fontBold,
  );
  rightY -= 10;
  drawKv(page, "Typ pojazdu:", input.vehicleType || "—", col2X, rightY, fontRegular, fontBold);
  rightY -= 12;

  y = Math.min(leftY, rightY) - 2;

  // Termin dostawy + palety
  drawSectionHeader(page, "TERMIN DOSTAWY", mm(8), y, fontBold);
  y -= 11;
  const deliveryText = input.deliveryDate
    ? new Date(input.deliveryDate).toLocaleString("pl-PL", {
        dateStyle: "full",
        timeStyle: "short",
      })
    : "Termin nieuzupełniony";
  drawText(page, deliveryText, {
    x: mm(8),
    y,
    font: fontBold,
    size: 9,
    color: COLORS.black,
  });

  // Palety w prawej kolumnie
  drawSectionHeader(page, "PRZEWIDYWANE PALETY", col2X, y + 11, fontBold);
  drawText(page, `${input.palletCount}`, {
    x: col2X,
    y,
    font: fontBold,
    size: 12,
    color: COLORS.slate900,
  });
  drawText(page, input.palletLabel.replace(`${input.palletCount} palet `, ""), {
    x: col2X + 20,
    y: y + 2,
    font: fontRegular,
    size: 7,
    color: COLORS.slate500,
  });

  y -= 14;

  // ── Tabela towaru ────────────────────────────────────────────────
  drawSectionHeader(
    page,
    `TOWAR DO PRZYJĘCIA (${input.items.length} SKU)`,
    mm(8),
    y,
    fontBold,
  );
  y -= 8;

  // Szerokości kolumn w pt (po konwersji z mm)
  // Tabela 187mm szer. w A4 portrait (210mm − 2×8mm marginesy = 194mm dostępne).
  // EAN i CODE-128 muszą być na tyle szerokie, żeby X-dim ≥ 0.264mm (GS1 80%
  // skali EAN-13 minimum) + quiet zones 11×X po lewej, 7×X po prawej.
  // 35mm box → X-dim ≈ 0.33mm (100% skali) ✓
  const tableX = mm(8);
  const colWidths = {
    lp: mm(5),
    sku: mm(26), // mieści typowe SKU 13-17 znaków w font 6.5pt
    name: mm(50),
    ean: mm(35),
    code128: mm(31),
    dekl: mm(9),
    przyj: mm(12),
    kart: mm(8),
    cbm: mm(11),
  };
  const tableW = Object.values(colWidths).reduce((a, b) => a + b, 0);
  const rowH = mm(14); // 14mm: bars area ~10mm + cyfry ~3mm; X-dim 0.33mm dzięki 35mm szer. kolumny

  // Nagłówek tabeli
  const headerY = y;
  page.drawRectangle({
    x: tableX,
    y: headerY - rowH,
    width: tableW,
    height: rowH,
    color: COLORS.slate100,
  });
  const headers: { label: string; w: number; align: "left" | "center" }[] = [
    { label: "Lp.", w: colWidths.lp, align: "center" },
    { label: "SKU", w: colWidths.sku, align: "left" },
    { label: "Nazwa / Karton", w: colWidths.name, align: "left" },
    { label: "EAN-13", w: colWidths.ean, align: "center" },
    { label: "CODE-128", w: colWidths.code128, align: "center" },
    { label: "Dekl.", w: colWidths.dekl, align: "center" },
    { label: "Przyjęta", w: colWidths.przyj, align: "center" },
    { label: "Kart.", w: colWidths.kart, align: "center" },
    { label: "CBM", w: colWidths.cbm, align: "center" },
  ];
  let cursorX = tableX;
  for (const h of headers) {
    // Background highlight dla kolumny Przyjęta
    if (h.label === "Przyjęta") {
      page.drawRectangle({
        x: cursorX,
        y: headerY - rowH,
        width: h.w,
        height: rowH,
        color: COLORS.amber50,
      });
    }
    drawText(page, h.label, {
      x: h.align === "center" ? cursorX + h.w / 2 : cursorX + 3,
      y: headerY - rowH / 2 - 3,
      font: fontBold,
      size: 7,
      color: COLORS.slate700,
      align: h.align,
    });
    cursorX += h.w;
  }
  // Linie pionowe w nagłówku
  drawTableBorders(page, tableX, headerY - rowH, headerY, colWidths);
  y = headerY - rowH;

  // Wiersze produktów
  let totalQty = 0;
  let totalCartons = 0;
  let totalCbm = 0;

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    const carton = describeCarton(it);
    totalQty += it.quantity;
    totalCbm += it.totalCbm;
    if (carton.cartonCount) totalCartons += carton.cartonCount;

    const rowTop = y;
    const rowBottom = rowTop - rowH;

    // Tło kolumny Przyjęta
    const przyjX = tableX + colWidths.lp + colWidths.sku + colWidths.name + colWidths.ean + colWidths.code128 + colWidths.dekl;
    page.drawRectangle({
      x: przyjX,
      y: rowBottom,
      width: colWidths.przyj,
      height: rowH,
      color: COLORS.amber50,
    });

    cursorX = tableX;
    // Lp
    drawText(page, String(i + 1), {
      x: cursorX + colWidths.lp / 2,
      y: rowTop - rowH / 2 - 3,
      font: fontRegular,
      size: 7,
      color: COLORS.slate500,
      align: "center",
    });
    cursorX += colWidths.lp;

    // SKU — kompaktowy mono font 6.5pt, kolumna 34mm = ~28 znaków bez clipu.
    // clipText jako fallback gdyby user miał ekstremalnie długi kod.
    drawText(
      page,
      clipText(it.productCode, fontRegular, 6.5, colWidths.sku - 4),
      {
        x: cursorX + 2,
        y: rowTop - rowH / 2 - 3,
        font: fontRegular,
        size: 6.5,
        color: COLORS.black,
      },
    );
    cursorX += colWidths.sku;

    // Nazwa + karton (2 linijki)
    const nameLine = clipText(it.productName, fontBold, 7, colWidths.name - 6);
    drawText(page, nameLine, {
      x: cursorX + 3,
      y: rowTop - 4 - 6,
      font: fontBold,
      size: 7,
      color: COLORS.black,
    });
    drawText(
      page,
      clipText(carton.label, fontRegular, 6, colWidths.name - 6),
      {
        x: cursorX + 3,
        y: rowTop - 4 - 6 - 7,
        font: fontRegular,
        size: 6,
        color: carton.isLuzem ? COLORS.orange700 : COLORS.slate500,
      },
    );
    cursorX += colWidths.name;

    // EAN — wektorowo (paski jako rect, cyfry natywne).
    // Quiet zones (margin:10) wbudowane w SVG — kluczowe dla skanera.
    const eanVal = it.eanCode?.trim() ?? "";
    if (eanVal && isValidBarcodeValue(eanVal, "EAN13")) {
      const barcodeBoxW = colWidths.ean - mm(1);
      const barcodeBoxH = rowH - mm(1.5);
      const innerX = cursorX + (colWidths.ean - barcodeBoxW) / 2;
      const innerY = rowTop - (rowH - barcodeBoxH) / 2;
      drawBarcodeVector(page, eanVal, "EAN13", {
        x: innerX,
        y: innerY,
        maxWidth: barcodeBoxW,
        maxHeight: barcodeBoxH,
        font: fontBold,
        textSize: 8,
        margin: 10,
      });
    } else {
      drawText(page, "—", {
        x: cursorX + colWidths.ean / 2,
        y: rowTop - rowH / 2 - 3,
        font: fontRegular,
        size: 7,
        color: COLORS.slate500,
        align: "center",
      });
    }
    cursorX += colWidths.ean;

    // CODE-128 — wektorowo, z quiet zones
    const codeVal = it.code128?.trim() ?? "";
    if (codeVal && isValidBarcodeValue(codeVal, "CODE128")) {
      const barcodeBoxW = colWidths.code128 - mm(1);
      const barcodeBoxH = rowH - mm(1.5);
      const innerX = cursorX + (colWidths.code128 - barcodeBoxW) / 2;
      const innerY = rowTop - (rowH - barcodeBoxH) / 2;
      drawBarcodeVector(page, codeVal, "CODE128", {
        x: innerX,
        y: innerY,
        maxWidth: barcodeBoxW,
        maxHeight: barcodeBoxH,
        font: fontBold,
        textSize: 7,
        margin: 10,
      });
    } else {
      drawText(page, "—", {
        x: cursorX + colWidths.code128 / 2,
        y: rowTop - rowH / 2 - 3,
        font: fontRegular,
        size: 7,
        color: COLORS.slate500,
        align: "center",
      });
    }
    cursorX += colWidths.code128;

    // Dekl.
    drawText(page, String(it.quantity), {
      x: cursorX + colWidths.dekl / 2,
      y: rowTop - rowH / 2 - 3,
      font: fontBold,
      size: 8,
      color: COLORS.black,
      align: "center",
    });
    cursorX += colWidths.dekl;

    // Przyjęta — INTERAKTYWNE pole tekstowe (AcroForm)
    const fieldName = `przyjeta_${i}_${it.productCode}`;
    const field = form.createTextField(fieldName);
    field.setText("");
    field.addToPage(page, {
      x: cursorX + 1,
      y: rowBottom + 1,
      width: colWidths.przyj - 2,
      height: rowH - 2,
      backgroundColor: COLORS.amber50,
      borderColor: COLORS.amber600,
      borderWidth: 0.3,
      font: fontBold,
    });
    // Centruj i skaluj font automatycznie (auto)
    field.setFontSize(8);
    cursorX += colWidths.przyj;

    // Kart.
    const kartText = carton.isLuzem
      ? "luzem"
      : carton.cartonCount !== null
        ? String(carton.cartonCount)
        : "—";
    drawText(page, kartText, {
      x: cursorX + colWidths.kart / 2,
      y: rowTop - rowH / 2 - 3,
      font: fontRegular,
      size: carton.isLuzem ? 6 : 7,
      color: carton.isLuzem ? COLORS.orange700 : COLORS.black,
      align: "center",
    });
    cursorX += colWidths.kart;

    // CBM
    drawText(page, it.totalCbm.toFixed(2), {
      x: cursorX + colWidths.cbm / 2,
      y: rowTop - rowH / 2 - 3,
      font: fontRegular,
      size: 7,
      color: COLORS.black,
      align: "center",
    });

    drawTableBorders(page, tableX, rowBottom, rowTop, colWidths);
    y = rowBottom;
  }

  // Footer tabeli — Σ Razem
  const footerTop = y;
  const footerBottom = footerTop - rowH;
  page.drawRectangle({
    x: tableX,
    y: footerBottom,
    width: tableW,
    height: rowH,
    color: COLORS.slate100,
  });
  // Σ Razem (colSpan 5 — Lp+SKU+Nazwa+EAN+CODE128)
  drawText(page, "Σ Razem", {
    x: tableX + 3,
    y: footerTop - rowH / 2 - 3,
    font: fontBold,
    size: 8,
    color: COLORS.slate900,
  });
  // Pozycje sum
  const sumX0 = tableX + colWidths.lp + colWidths.sku + colWidths.name + colWidths.ean + colWidths.code128;
  drawText(page, totalQty.toLocaleString("pl-PL"), {
    x: sumX0 + colWidths.dekl / 2,
    y: footerTop - rowH / 2 - 3,
    font: fontBold,
    size: 8,
    color: COLORS.black,
    align: "center",
  });
  drawText(page, `${totalCartons}`, {
    x: sumX0 + colWidths.dekl + colWidths.przyj + colWidths.kart / 2,
    y: footerTop - rowH / 2 - 3,
    font: fontBold,
    size: 8,
    color: COLORS.black,
    align: "center",
  });
  drawText(page, totalCbm.toFixed(2), {
    x: sumX0 + colWidths.dekl + colWidths.przyj + colWidths.kart + colWidths.cbm / 2,
    y: footerTop - rowH / 2 - 3,
    font: fontBold,
    size: 8,
    color: COLORS.black,
    align: "center",
  });
  drawTableBorders(page, tableX, footerBottom, footerTop, colWidths);
  y = footerBottom - 8;

  // ── Notatki (callout żółty) ──────────────────────────────────────
  if (input.awizacjaNotes.trim()) {
    const noteX = mm(8);
    const noteW = PAGE_W - mm(16);
    const noteLines = wrapText(
      input.awizacjaNotes,
      fontRegular,
      9,
      noteW - mm(8),
    );
    const noteH = mm(6) + noteLines.length * 11;
    page.drawRectangle({
      x: noteX,
      y: y - noteH,
      width: noteW,
      height: noteH,
      color: COLORS.amber50,
    });
    // Lewa krawędź akcent
    page.drawRectangle({
      x: noteX,
      y: y - noteH,
      width: mm(1.5),
      height: noteH,
      color: COLORS.amber600,
    });
    drawText(page, "⚠ NOTATKI DO DOKUMENTU", {
      x: noteX + mm(4),
      y: y - 10,
      font: fontBold,
      size: 8,
      color: COLORS.amber800,
    });
    let noteY = y - 22;
    for (const line of noteLines) {
      drawText(page, line, {
        x: noteX + mm(4),
        y: noteY,
        font: fontRegular,
        size: 9,
        color: COLORS.amber800,
      });
      noteY -= 11;
    }
    y -= noteH + 8;
  }

  // ── Podpisy ──────────────────────────────────────────────────────
  const sigY = Math.max(y - 18, mm(20));
  const sigW = (PAGE_W - mm(24)) / 2;
  page.drawLine({
    start: { x: mm(8), y: sigY },
    end: { x: mm(8) + sigW, y: sigY },
    color: COLORS.slate700,
    thickness: 0.5,
  });
  page.drawLine({
    start: { x: mm(16) + sigW, y: sigY },
    end: { x: mm(16) + sigW * 2, y: sigY },
    color: COLORS.slate700,
    thickness: 0.5,
  });
  drawText(page, "Podpis kierowcy", {
    x: mm(8) + sigW / 2,
    y: sigY - 9,
    font: fontRegular,
    size: 7,
    color: COLORS.slate700,
    align: "center",
  });
  drawText(page, "Podpis przyjmującego (magazyn)", {
    x: mm(16) + sigW + sigW / 2,
    y: sigY - 9,
    font: fontRegular,
    size: 7,
    color: COLORS.slate700,
    align: "center",
  });

  // ── Footer ───────────────────────────────────────────────────────
  drawText(
    page,
    `Awizacja wygenerowana z systemu ERP firmy „${input.companyName}" · ${new Date().toLocaleString("pl-PL")}`,
    {
      x: PAGE_W / 2,
      y: mm(7),
      font: fontRegular,
      size: 6.5,
      color: COLORS.slate500,
      align: "center",
    },
  );

  const bytes = await pdfDoc.save();
  // pdf-lib zwraca Uint8Array<ArrayBufferLike>; przepakuj do nowego
  // Uint8Array<ArrayBuffer> żeby Blob() w TS 5.7+ był zadowolony.
  const bufferCopy = new Uint8Array(bytes);
  return new Blob([bufferCopy], { type: "application/pdf" });
}

// ── Helpery rysowania ────────────────────────────────────────────

function drawText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  opts: {
    x: number;
    y: number;
    font: PDFFont;
    size: number;
    color: ReturnType<typeof rgb>;
    align?: "left" | "center" | "right";
  },
) {
  const width = opts.font.widthOfTextAtSize(text, opts.size);
  let x = opts.x;
  if (opts.align === "center") x -= width / 2;
  else if (opts.align === "right") x -= width;
  page.drawText(text, {
    x,
    y: opts.y,
    font: opts.font,
    size: opts.size,
    color: opts.color,
  });
}

function drawSectionHeader(
  page: ReturnType<PDFDocument["addPage"]>,
  label: string,
  x: number,
  y: number,
  font: PDFFont,
) {
  drawText(page, label, {
    x,
    y,
    font,
    size: 6.5,
    color: COLORS.slate500,
  });
}

function drawKv(
  page: ReturnType<PDFDocument["addPage"]>,
  label: string,
  value: string,
  x: number,
  y: number,
  fontRegular: PDFFont,
  fontBold: PDFFont,
) {
  drawText(page, label, {
    x,
    y,
    font: fontRegular,
    size: 8,
    color: COLORS.slate500,
  });
  drawText(page, value, {
    x: x + 70,
    y,
    font: fontBold,
    size: 8,
    color: COLORS.black,
  });
}

function drawTableBorders(
  page: ReturnType<PDFDocument["addPage"]>,
  x: number,
  yBottom: number,
  yTop: number,
  colWidths: Record<string, number>,
) {
  const widths = Object.values(colWidths);
  let cx = x;
  // Linia górna i dolna
  page.drawLine({
    start: { x, y: yTop },
    end: { x: x + widths.reduce((a, b) => a + b, 0), y: yTop },
    color: COLORS.slate200,
    thickness: 0.3,
  });
  page.drawLine({
    start: { x, y: yBottom },
    end: { x: x + widths.reduce((a, b) => a + b, 0), y: yBottom },
    color: COLORS.slate200,
    thickness: 0.3,
  });
  // Linie pionowe (między kolumnami)
  for (let i = 0; i <= widths.length; i++) {
    page.drawLine({
      start: { x: cx, y: yBottom },
      end: { x: cx, y: yTop },
      color: COLORS.slate200,
      thickness: 0.3,
    });
    if (i < widths.length) cx += widths[i];
  }
}

function clipText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.slice(0, mid) + "…";
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(0, lo - 1)) + "…";
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = trial;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function describeCarton(it: PdfGoodsItem): {
  isLuzem: boolean;
  cartonCount: number | null;
  label: string;
} {
  if (it.importMode === "LUZEM") {
    return {
      isLuzem: true,
      cartonCount: null,
      label: "luzem (bez kartonu)",
    };
  }
  const w = it.boxWidthCm;
  const h = it.boxHeightCm;
  const d = it.boxDepthCm;
  const dims = w && h && d ? `${fmt(w)}×${fmt(h)}×${fmt(d)} cm` : null;
  const cartonCount =
    it.unitsPerBox && it.unitsPerBox > 0
      ? Math.ceil(it.quantity / it.unitsPerBox)
      : null;
  const parts: string[] = [];
  if (dims) parts.push(`Karton ${dims}`);
  if (it.unitsPerBox && it.unitsPerBox > 0) parts.push(`${it.unitsPerBox} szt/kart`);
  return {
    isLuzem: false,
    cartonCount,
    label: parts.join(" · ") || "— brak danych kartonu —",
  };
}

function fmt(v: number): string {
  return Number.isInteger(v) ? v.toString() : v.toFixed(1);
}
// `StandardFonts` importowane na wypadek przyszłego fallback do Helvetica
void StandardFonts;
