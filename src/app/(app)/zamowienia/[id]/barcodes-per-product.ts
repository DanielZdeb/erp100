/**
 * Generator kodów kreskowych jako OSOBNE PDFy — alternatywa dla `labels-pdf.ts`,
 * który robi siatkę Avery 3475. Tutaj dwa warianty wyjścia:
 *
 *  - `generateBarcodesZip(items)` → ZIP, w środku N osobnych PDFów (jeden per SKU),
 *    nazwa pliku = `{SKU}.pdf`. Dobre gdy chcesz wysłać konkretny PDF na produkcję
 *    do konkretnego produktu (np. mailem albo do folderu z assetami SKU).
 *
 *  - `generateBarcodesMultipagePdf(items)` → pojedynczy PDF, jedna strona per SKU.
 *    Dobre gdy chcesz wydrukować ciągiem.
 *
 * Format jednej strony (A6 portrait, 105×148mm):
 *   ┌─────────────────────────────┐
 *   │   SKU (bold, duży)          │
 *   │   Nazwa produktu            │
 *   │   Kolor                     │
 *   │                             │
 *   │   [ EAN-13 barcode ]        │
 *   │   [ CODE-128 barcode ]      │
 *   └─────────────────────────────┘
 *
 * A6 mieści się 4× na A4 — można drukować na zwykłej drukarce i ciąć / kupić
 * gotowe etykiety A6.
 */

import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JsBarcode from "jsbarcode";
import JSZip from "jszip";

import { loadRobotoFonts } from "./pdf-font";
import { colorMeta, parseMaterialSku } from "@/lib/material-bolts";

export type BarcodeItem = {
  productCode: string;
  productName: string;
  color?: string | null;
  eanCode: string | null;
  code128: string | null;
};

const MM = 2.83465;
const mm = (v: number) => v * MM;

// A6 portrait
const PAGE_W = mm(105);
const PAGE_H = mm(148);

const COLORS = {
  black: rgb(0, 0, 0),
  slate700: rgb(0.2, 0.255, 0.345),
  slate500: rgb(0.392, 0.455, 0.545),
  slate300: rgb(0.804, 0.835, 0.882),
};

/**
 * Sanityzuje wartość pod kątem formatu barcode'a — używane do walidacji przed
 * próbą renderu. EAN-13 musi być 13 cyframi, CODE-128 dowolny ASCII printable.
 * Exported — używany też w `interactive-pdf.ts` dla awizacji.
 */
export function isValidBarcodeValue(
  value: string,
  format: "EAN13" | "CODE128",
): boolean {
  return format === "EAN13"
    ? /^\d{13}$/.test(value)
    : /^[\x20-\x7E]+$/.test(value);
}

/** Parsuje `translate(x, y)` z atrybutu transform. JsBarcode SVG renderer
 *  używa wyłącznie translacji (margines), więc nie obsługujemy scale/rotate. */
function parseTranslate(transformStr: string): { tx: number; ty: number } {
  const m = transformStr.match(
    /translate\(\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)\s*\)/,
  );
  return m ? { tx: Number(m[1]), ty: Number(m[2]) } : { tx: 0, ty: 0 };
}

/** Dla EAN-13 cyfry pod kodem są rozdzielone: `D1 D2..D7 D8..D13`. Pomaga
 *  to rozpoznać konwencjonalny layout. CODE-128: zwracamy raw value. */
function formatBarcodeText(
  value: string,
  format: "EAN13" | "CODE128",
): string {
  if (format !== "EAN13" || value.length !== 13) return value;
  return `${value[0]} ${value.slice(1, 7)} ${value.slice(7, 13)}`;
}

/**
 * Renderuje barcode bezpośrednio jako wektor w PDF:
 *  - paski → `page.drawRectangle` (geometria z SVG wygenerowanego przez JsBarcode)
 *  - cyfry/litery → `page.drawText` z embedowanym fontem
 *
 * Wynik jest skalowalny bez utraty jakości i ma tekst selectable/searchable.
 * Zwraca rzeczywistą wysokość zajętego pionu (paski + tekst), żeby caller
 * mógł poprawnie zsumować odstępy między elementami.
 *
 * Exported — używane też w `interactive-pdf.ts` (awizacja PDF), żeby
 * wszystkie kody kreskowe w aplikacji renderowały się jednolicie wektorowo.
 */
export function drawBarcodeVector(
  page: PDFPage,
  value: string,
  format: "EAN13" | "CODE128",
  opts: {
    x: number;
    y: number;
    maxWidth: number;
    maxHeight: number;
    font: PDFFont;
    textSize?: number;
    /** Margines w jednostkach SVG (=quiet zone) wokół kodu. GS1 EAN-13 wymaga
     *  ≥11×X-dim po lewej i ≥7×X-dim po prawej. Default 10 = bezpieczna strefa
     *  ciszy. Ustaw 0 tylko jeśli QZ dodajesz osobno na kontenerze. */
    margin?: number;
  },
): number | null {
  if (!isValidBarcodeValue(value, format)) return null;

  // 1) Render SVG offscreen — JsBarcode wymaga prawdziwego elementu SVG
  //    (sprawdza namespaceURI). displayValue:false bo cyfry rysujemy ręcznie
  //    jako wektorowy tekst PDF.
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg") as SVGSVGElement;
  try {
    JsBarcode(svg, value, {
      format,
      width: 2,
      height: 50,
      displayValue: false,
      margin: opts.margin ?? 10,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch {
    return null;
  }

  // JsBarcode dopisuje jednostkę „px" do width/height (np. „200px"),
  // więc `Number()` zwraca NaN. parseFloat ignoruje suffix.
  // ViewBox to bezpieczny fallback — zawsze ma postać „0 0 W H" bez jednostek.
  let svgW = parseFloat(svg.getAttribute("width") ?? "");
  let svgH = parseFloat(svg.getAttribute("height") ?? "");
  if (!Number.isFinite(svgW) || !Number.isFinite(svgH)) {
    const vb = svg.getAttribute("viewBox")?.split(/\s+/) ?? [];
    if (vb.length === 4) {
      svgW = parseFloat(vb[2]);
      svgH = parseFloat(vb[3]);
    }
  }
  if (!Number.isFinite(svgW) || !Number.isFinite(svgH) || svgW <= 0 || svgH <= 0) {
    return null;
  }

  // 2) Zostaw miejsce na cyfry pod kodem
  const textSize = opts.textSize ?? 10;
  const textGap = textSize * 0.25;
  const textTotalH = textSize + textGap;
  const barsAreaH = opts.maxHeight - textTotalH;
  if (barsAreaH <= 0) return null;

  // Skalowanie zachowujące proporcje — barcode trzyma docelowy aspect SVG
  const scaleX = opts.maxWidth / svgW;
  const scaleY = barsAreaH / svgH;
  const scale = Math.min(scaleX, scaleY);
  const drawnW = svgW * scale;
  const drawnH = svgH * scale;
  // Wycentruj poziomo w obszarze opt.x..opt.x+maxWidth
  const offsetX = opts.x + (opts.maxWidth - drawnW) / 2;
  const barsTopPdf = opts.y; // top-left w PDF coords — y rośnie do góry
  const barsBottomPdf = barsTopPdf - drawnH;

  // 3) Iteracja po wszystkich <rect> — JsBarcode wraps bars w <g> z translate
  //    dla marginesu, więc akumulujemy translate z ancestorów.
  const rects = Array.from(svg.querySelectorAll("rect"));
  for (const rect of rects) {
    // JsBarcode v3.x: paski są wewnątrz <g style="fill:lineColor">, dziedziczą
    // fill z grupy (rect nie ma własnego fill/style). Background rect jest
    // bezpośrednim dzieckiem <svg> z explicit `style="fill:background"`.
    // Selekcja po strukturze: tylko rect wewnątrz <g> to pasek.
    const insideG = rect.parentElement?.tagName.toLowerCase() === "g";
    if (!insideG) {
      // Fallback dla SVG bez wrappera <g> — rect z explicit non-white fill
      // też uznajemy za pasek. „white" obejmuje #ffffff/#fff/white.
      const ownFill = (
        rect.getAttribute("fill") ??
        rect.getAttribute("style") ??
        ""
      ).toLowerCase();
      const isExplicitWhite =
        /#fff(?:fff)?\b/.test(ownFill) || /\bwhite\b/.test(ownFill);
      const hasOwnFill = ownFill.trim() !== "";
      if (!hasOwnFill || isExplicitWhite) continue;
    }

    // Akumuluj translate z parent <g> aż do <svg>
    let tx = 0;
    let ty = 0;
    let el: Element | null = rect.parentElement;
    while (el && el !== svg) {
      if (el.tagName.toLowerCase() === "g") {
        const t = parseTranslate(el.getAttribute("transform") ?? "");
        tx += t.tx;
        ty += t.ty;
      }
      el = el.parentElement;
    }

    // parseFloat (nie Number) — toleruje przypadkowe jednostki na atrybutach.
    const rx = (parseFloat(rect.getAttribute("x") ?? "0") || 0) + tx;
    const ry = (parseFloat(rect.getAttribute("y") ?? "0") || 0) + ty;
    const rw = parseFloat(rect.getAttribute("width") ?? "0") || 0;
    const rh = parseFloat(rect.getAttribute("height") ?? "0") || 0;
    if (rw <= 0 || rh <= 0) continue;

    // Mapowanie SVG (top-down) → PDF (bottom-up).
    const pdfX = offsetX + rx * scale;
    const pdfY = barsBottomPdf + (svgH - ry - rh) * scale;
    page.drawRectangle({
      x: pdfX,
      y: pdfY,
      width: rw * scale,
      height: rh * scale,
      color: rgb(0, 0, 0),
    });
  }

  // 4) Tekst pod kodem — wektorowy, z embedowanego fontu
  const text = formatBarcodeText(value, format);
  const textWidth = opts.font.widthOfTextAtSize(text, textSize);
  page.drawText(text, {
    x: opts.x + (opts.maxWidth - textWidth) / 2,
    y: barsBottomPdf - textGap - textSize,
    font: opts.font,
    size: textSize,
    color: rgb(0, 0, 0),
  });

  return drawnH + textTotalH;
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
  if (lines.length === maxLines) {
    lines[maxLines - 1] = clipText(lines[maxLines - 1], font, size, maxWidth);
  }
  return lines;
}

/**
 * Sanityzuje SKU do bezpiecznej nazwy pliku — usuwa znaki niedozwolone w FS,
 * zachowuje litery, cyfry, kreski/podkreślniki/kropki.
 */
function safeFileName(sku: string): string {
  return sku.replace(/[^A-Za-z0-9._-]/g, "_") || "barcode";
}

/**
 * Renderuje jeden produkt na podany Page i zwraca void. Współdzielona logika
 * dla obu wariantów wyjścia (ZIP per-SKU i multipage).
 */
async function drawProductPage(
  pdfDoc: PDFDocument,
  page: ReturnType<PDFDocument["addPage"]>,
  item: BarcodeItem,
  fontRegular: PDFFont,
  fontBold: PDFFont,
) {
  const PAD = mm(6);
  const innerX = PAD;
  const innerW = PAGE_W - 2 * PAD;

  // SKU — bold 18pt, wycentrowany
  const skuY = PAGE_H - PAD - mm(8);
  const skuText = clipText(item.productCode, fontBold, 18, innerW);
  const skuWidth = fontBold.widthOfTextAtSize(skuText, 18);
  page.drawText(skuText, {
    x: (PAGE_W - skuWidth) / 2,
    y: skuY,
    font: fontBold,
    size: 18,
    color: COLORS.black,
  });

  // Nazwa produktu — max 2 linijki, 11pt, wycentrowane
  const nameLines = wrapText(item.productName, fontRegular, 11, innerW, 2);
  let nameY = skuY - mm(7);
  for (const line of nameLines) {
    const w = fontRegular.widthOfTextAtSize(line, 11);
    page.drawText(line, {
      x: (PAGE_W - w) / 2,
      y: nameY,
      font: fontRegular,
      size: 11,
      color: COLORS.slate700,
    });
    nameY -= mm(5);
  }

  // Kolor (jeśli jest), małym fontem, wycentrowany
  if (item.color && item.color.trim() !== "") {
    const w = fontRegular.widthOfTextAtSize(item.color, 9);
    page.drawText(item.color, {
      x: (PAGE_W - w) / 2,
      y: nameY,
      font: fontRegular,
      size: 9,
      color: COLORS.slate500,
    });
    nameY -= mm(5);
  }

  // Kody kreskowe — rysowane WEKTOROWO (rectangles + text), żeby PDF zachował
  // ostrość przy dowolnym zoomie i żeby cyfry były selectable/searchable.
  const eanValid =
    item.eanCode != null && isValidBarcodeValue(item.eanCode.trim(), "EAN13");
  const code128Valid =
    item.code128 != null &&
    isValidBarcodeValue(item.code128.trim(), "CODE128");

  let barY = nameY - mm(4);
  if (eanValid) {
    const usedH = drawBarcodeVector(page, item.eanCode!.trim(), "EAN13", {
      x: innerX,
      y: barY,
      maxWidth: innerW,
      maxHeight: mm(32),
      font: fontBold,
      textSize: 16,
    });
    if (usedH != null) barY -= usedH + mm(4);
  }
  if (code128Valid) {
    drawBarcodeVector(page, item.code128!.trim(), "CODE128", {
      x: innerX,
      y: barY,
      maxWidth: innerW,
      maxHeight: mm(28),
      font: fontBold,
      textSize: 14,
    });
  }

  // Brak żadnego kodu — info inline
  if (!eanValid && !code128Valid) {
    const msg = "Brak EAN-13 i CODE-128";
    const w = fontRegular.widthOfTextAtSize(msg, 10);
    page.drawText(msg, {
      x: (PAGE_W - w) / 2,
      y: barY - mm(10),
      font: fontRegular,
      size: 10,
      color: COLORS.slate500,
    });
  }
}

/**
 * Zwraca ZIP z N osobnymi PDFami — jeden per SKU. Nazwa pliku w archiwum:
 * `{SKU}.pdf`. Produkty bez żadnego kodu kreskowego są pomijane.
 */
/**
 * Sortuje pozycje wg hierarchii:
 *   1. Materiały (M-*) pogrupowane KOLOREM (alfabetycznie po polskiej nazwie
 *      z COLOR_PRESETS), w obrębie koloru po długości rosnąco (4M, 6M, 7M, 8M).
 *   2. Pozostałe SKU alfabetycznie na końcu.
 * Dzięki temu w wydruku ZIP/PDF najpierw widać komplet kolorów w jednej
 * kolejności, identyczna jak w arkuszu materialy.xlsx.
 */
function sortByColorHierarchy<T extends BarcodeItem>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const pa = parseMaterialSku(a.productCode);
    const pb = parseMaterialSku(b.productCode);
    // Materiały zawsze przed nie-materiałami
    if (pa && !pb) return -1;
    if (!pa && pb) return 1;
    if (pa && pb) {
      const labelA = colorMeta(pa.color).label;
      const labelB = colorMeta(pb.color).label;
      const colorCmp = labelA.localeCompare(labelB, "pl");
      if (colorCmp !== 0) return colorCmp;
      return pa.lengthM - pb.lengthM;
    }
    return a.productCode.localeCompare(b.productCode);
  });
}

export async function generateBarcodesZip(
  items: BarcodeItem[],
): Promise<{ blob: Blob; fileCount: number }> {
  const labels = sortByColorHierarchy(
    items.filter((it) => it.eanCode || it.code128),
  );
  if (labels.length === 0) {
    throw new Error(
      "Żaden produkt nie ma EAN-13 ani CODE-128 — nie ma czego drukować",
    );
  }
  const { regular, bold } = await loadRobotoFonts();
  const zip = new JSZip();

  // Deduplikacja po SKU — gdy ten sam SKU pojawia się N razy w zamówieniu,
  // chcemy jeden plik per SKU, nie N tych samych.
  const seenSku = new Set<string>();
  for (const item of labels) {
    if (seenSku.has(item.productCode)) continue;
    seenSku.add(item.productCode);

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const fontRegular = await pdfDoc.embedFont(regular, { subset: true });
    const fontBold = await pdfDoc.embedFont(bold, { subset: true });
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    await drawProductPage(pdfDoc, page, item, fontRegular, fontBold);
    const bytes = await pdfDoc.save();
    zip.file(`${safeFileName(item.productCode)}.pdf`, bytes);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, fileCount: seenSku.size };
}

/**
 * Zwraca jeden wielostronicowy PDF — każda strona to jeden SKU.
 */
export async function generateBarcodesMultipagePdf(
  items: BarcodeItem[],
): Promise<{ blob: Blob; pageCount: number }> {
  const labels = sortByColorHierarchy(
    items.filter((it) => it.eanCode || it.code128),
  );
  if (labels.length === 0) {
    throw new Error(
      "Żaden produkt nie ma EAN-13 ani CODE-128 — nie ma czego drukować",
    );
  }
  const { regular, bold } = await loadRobotoFonts();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontRegular = await pdfDoc.embedFont(regular, { subset: true });
  const fontBold = await pdfDoc.embedFont(bold, { subset: true });

  // Deduplikacja po SKU — jak wyżej
  const seenSku = new Set<string>();
  for (const item of labels) {
    if (seenSku.has(item.productCode)) continue;
    seenSku.add(item.productCode);
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    await drawProductPage(pdfDoc, page, item, fontRegular, fontBold);
  }

  const bytes = await pdfDoc.save();
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    pageCount: seenSku.size,
  };
}
