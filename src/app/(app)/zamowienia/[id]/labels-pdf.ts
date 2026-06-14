/**
 * Generator PDF z etykietami w formacie Avery 3475 (70×42.3mm, 3×7=21 etykiet/A4).
 *
 * Wejście: lista produktów z zamówienia. Wyjście: PDF z etykietami ułożonymi
 * w siatce, do druku i wysłania na magazyn (np. do nalepiania na kartony).
 * 1 etykieta per SKU (jeśli potrzeba więcej, drukuj wiele kopii).
 *
 * Layout etykiety (70×42.3mm):
 *  ┌─────────────────────────────────┐ 2mm padding
 *  │ SKU-CODE (bold 11pt)            │
 *  │ Product Name (8pt, 2 linijki)   │
 *  │                                 │
 *  │       [ EAN-13 barcode ]        │ 14mm wysokie
 *  │                                 │
 *  │       [ CODE-128 barcode ]      │ 12mm wysokie (opcjonalne)
 *  └─────────────────────────────────┘
 */

import { PDFDocument, PDFFont, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JsBarcode from "jsbarcode";

import { loadRobotoFonts } from "./pdf-font";

export type LabelItem = {
  productCode: string;
  productName: string;
  eanCode: string | null;
  code128: string | null;
};

// A4 portrait w punktach (1mm ≈ 2.835pt)
const MM = 2.83465;
const mm = (v: number) => v * MM;

const PAGE_W = mm(210);
const PAGE_H = mm(297);

// Avery 3475: 21 etykiet/A4, 70×42.3mm, bez marginesów, bez gap'ów
const LABEL_W = mm(70);
const LABEL_H = mm(42.3);
const COLS = 3;
const ROWS = 7;
const PER_PAGE = COLS * ROWS;

const COLORS = {
  black: rgb(0, 0, 0),
  slate500: rgb(0.392, 0.455, 0.545),
  slate300: rgb(0.804, 0.835, 0.882),
};

/**
 * Pozycja lewy-górny róg etykiety w obrębie strony (pdf-lib: y rośnie do góry).
 */
function labelTopLeft(localIdx: number): { x: number; y: number } {
  const col = localIdx % COLS;
  const row = Math.floor(localIdx / COLS);
  return {
    x: col * LABEL_W,
    y: PAGE_H - row * LABEL_H, // top-left, y-down jest odjęte
  };
}

function makeBarcodePng(
  value: string | null,
  format: "EAN13" | "CODE128",
): string | null {
  if (!value) return null;
  const v = value.trim();
  const ok =
    format === "EAN13" ? /^\d{13}$/.test(v) : /^[\x20-\x7E]+$/.test(v);
  if (!ok) return null;
  const canvas = document.createElement("canvas");
  try {
    JsBarcode(canvas, v, {
      format,
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 14,
      margin: 4,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch {
    return null;
  }
  return canvas.toDataURL("image/png");
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
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/);
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = trial;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  // Ostatnia linia: przytnij ellipsą jeśli się nie zmieścił reszta tekstu
  if (lines.length === maxLines) {
    lines[maxLines - 1] = clipText(lines[maxLines - 1], font, size, maxWidth);
  }
  return lines;
}

/**
 * Generuje PDF z etykietami w siatce Avery 3475.
 * Zwraca Blob gotowy do `URL.createObjectURL`.
 */
export async function generateLabelsPdf(
  items: LabelItem[],
): Promise<{ blob: Blob; pageCount: number; labelCount: number }> {
  const { regular, bold } = await loadRobotoFonts();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontRegular = await pdfDoc.embedFont(regular, { subset: true });
  const fontBold = await pdfDoc.embedFont(bold, { subset: true });

  const labels = items.filter((it) => it.eanCode || it.code128);
  if (labels.length === 0) {
    throw new Error(
      "Żaden produkt nie ma EAN-13 ani CODE-128 — nie ma czego drukować",
    );
  }

  const pageCount = Math.ceil(labels.length / PER_PAGE);

  // Pre-render wszystkich barcode → PNG, żeby uniknąć powtarzania pracy gdy
  // ten sam produkt pojawia się wielokrotnie
  const barcodeCache = new Map<
    string,
    { ean: string | null; code128: string | null }
  >();

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);

  for (let i = 0; i < labels.length; i++) {
    const item = labels[i];
    const pageIdx = Math.floor(i / PER_PAGE);
    const localIdx = i % PER_PAGE;

    if (localIdx === 0 && i > 0) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    }

    const { x: lx, y: lyTop } = labelTopLeft(localIdx);
    const lyBottom = lyTop - LABEL_H;

    // Cienka ramka — pomocna przy ręcznym cięciu jeśli ktoś drukuje na zwykłym papierze
    page.drawRectangle({
      x: lx,
      y: lyBottom,
      width: LABEL_W,
      height: LABEL_H,
      borderColor: COLORS.slate300,
      borderWidth: 0.2,
    });

    const PAD = mm(2);
    const innerX = lx + PAD;
    const innerW = LABEL_W - 2 * PAD;

    // SKU (bold)
    const skuY = lyTop - PAD - mm(3);
    page.drawText(clipText(item.productCode, fontBold, 11, innerW), {
      x: innerX,
      y: skuY,
      font: fontBold,
      size: 11,
      color: COLORS.black,
    });

    // Nazwa produktu (max 2 linijki, 8pt)
    const nameLines = wrapText(item.productName, fontRegular, 8, innerW, 2);
    let nameY = skuY - mm(4);
    for (const line of nameLines) {
      page.drawText(line, {
        x: innerX,
        y: nameY,
        font: fontRegular,
        size: 8,
        color: COLORS.slate500,
      });
      nameY -= mm(3.5);
    }

    // Cache barcode
    let cached = barcodeCache.get(item.productCode);
    if (!cached) {
      cached = {
        ean: makeBarcodePng(item.eanCode, "EAN13"),
        code128: makeBarcodePng(item.code128, "CODE128"),
      };
      barcodeCache.set(item.productCode, cached);
    }

    // EAN-13 barcode (jeśli istnieje)
    let barY = nameY - mm(2);
    if (cached.ean) {
      const png = await pdfDoc.embedPng(cached.ean);
      // Wypełnij szerokość etykiety, zachowaj proporcje, max 14mm wysokie
      const maxH = mm(14);
      const maxW = innerW;
      const aspect = png.width / png.height;
      let imgW = maxW;
      let imgH = maxW / aspect;
      if (imgH > maxH) {
        imgH = maxH;
        imgW = maxH * aspect;
      }
      page.drawImage(png, {
        x: lx + (LABEL_W - imgW) / 2,
        y: barY - imgH,
        width: imgW,
        height: imgH,
      });
      barY -= imgH + mm(1);
    }

    // CODE-128 barcode (jeśli istnieje i jeszcze jest miejsce)
    if (cached.code128 && barY - lyBottom > mm(8)) {
      const png = await pdfDoc.embedPng(cached.code128);
      const availH = Math.min(mm(12), barY - lyBottom - mm(1));
      const maxW = innerW;
      const aspect = png.width / png.height;
      let imgW = maxW;
      let imgH = maxW / aspect;
      if (imgH > availH) {
        imgH = availH;
        imgW = availH * aspect;
      }
      page.drawImage(png, {
        x: lx + (LABEL_W - imgW) / 2,
        y: barY - imgH,
        width: imgW,
        height: imgH,
      });
    }

    void pageIdx;
  }

  const bytes = await pdfDoc.save();
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    pageCount,
    labelCount: labels.length,
  };
}
