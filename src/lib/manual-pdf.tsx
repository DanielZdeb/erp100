/* eslint-disable jsx-a11y/alt-text */
/**
 * Generator PDF instrukcji obsługi produktu z 3 szablonów:
 *   CLEAN     — minimal: H1/H2/lista/obraz, footer z numerem strony
 *   TECHNICAL — TOC + page numbers X/Y + header z SKU
 *   BRANDED   — cover page z obrazkiem produktu + header brandowy
 *
 * Wejście: ProseMirror/TipTap JSON (productManualJson) → renderowany przez
 * mapper na komponenty react-pdf. Render PDF jest wykonywany przez
 * `renderToBuffer` w endpoincie /api/produkty/[id]/instrukcja/pdf.
 *
 * Czcionki: Roboto z CDN (Latin Extended pełen, polskie znaki). Cache w module.
 */

import {
  Document,
  Font,
  Image as PdfImage,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import React, { type ReactElement } from "react";

import { promises as fs } from "node:fs";
import path from "node:path";

import { loadRobotoFontsAll } from "@/app/(app)/zamowienia/[id]/pdf-font";
import {
  type HeaderRange,
  MANUAL_PAGE_LABEL,
  MANUAL_TOC_EMPTY,
  MANUAL_TOC_LABEL,
  generateToc,
  isManualLanguage,
  resolveHeaderForPage,
} from "@/lib/manual-document";
import { MANUAL_FONTS } from "@/lib/manual-fonts";

// ─── Font registration — raz na proces ──────────────────────────────────

let fontsRegistered = false;
function toDataUri(buf: ArrayBuffer): string {
  const b64 = Buffer.from(buf).toString("base64");
  return `data:font/ttf;base64,${b64}`;
}

// ─── Image URL resolver ────────────────────────────────────────────────
// Pliki wgrane lokalnie (storage bez BLOB_READ_WRITE_TOKEN) mają URL typu
// `/uploads/...`. react-pdf widzi to jako absolute path na FS, nie URL.
// Czytamy z `public/uploads/...` przez fs i konwertujemy na data URI.
const imageDataUriCache = new Map<string, string>();

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function resolveImageSrc(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  // Data URIs i absolute http(s) URLs przepuszczamy bez zmian
  if (src.startsWith("data:") || /^https?:\/\//i.test(src)) return src;
  // Relatywne /uploads — czytamy z FS
  if (src.startsWith("/")) {
    const cached = imageDataUriCache.get(src);
    if (cached) return cached;
    try {
      const filePath = path.join(
        process.cwd(),
        "public",
        src.replace(/^\//, ""),
      );
      const buf = await fs.readFile(filePath);
      const mime = guessMime(filePath);
      const uri = `data:${mime};base64,${buf.toString("base64")}`;
      imageDataUriCache.set(src, uri);
      return uri;
    } catch {
      // Pliku nie ma — zwracamy null, render pominie obraz zamiast crashować PDF.
      return null;
    }
  }
  return src;
}

/**
 * Rekursywnie przejdź przez TipTap JSON i zamień każdy image src + sectionLayout
 * imageSrc na rozwiązany URL (data URI dla lokalnych, bez zmian dla absolutnych).
 */
async function resolveImagesInContent(content: unknown[] | undefined): Promise<void> {
  if (!content) return;
  for (const node of content) {
    if (!node || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;
    if (n.type === "image") {
      const attrs = (n.attrs as Record<string, unknown> | undefined) ?? {};
      const resolved = await resolveImageSrc(attrs.src as string | null);
      n.attrs = { ...attrs, src: resolved };
    }
    if (n.type === "sectionLayout") {
      const attrs = (n.attrs as Record<string, unknown> | undefined) ?? {};
      const resolved = await resolveImageSrc(attrs.imageSrc as string | null);
      n.attrs = { ...attrs, imageSrc: resolved };
    }
    if (Array.isArray(n.content)) {
      await resolveImagesInContent(n.content);
    }
  }
}
async function fetchFontTtf(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

async function ensureFonts() {
  if (fontsRegistered) return;
  // Roboto — pełny zestaw (regular + bold + italic + bold-italic).
  // Bold+italic jest wymagany przez seed instrukcji (welcome message), bez
  // niego react-pdf wyrzuca "Could not resolve font for Roboto fontWeight 700
  // fontStyle italic".
  const { regular, bold, italic, boldItalic } = await loadRobotoFontsAll();
  Font.register({
    family: "Roboto",
    fonts: [
      { src: toDataUri(regular) },
      { src: toDataUri(bold), fontWeight: 700 },
      { src: toDataUri(italic), fontStyle: "italic" },
      {
        src: toDataUri(boldItalic),
        fontWeight: 700,
        fontStyle: "italic",
      },
    ],
  });

  // Pozostałe modern fonts (Manrope/DM Sans/Plus Jakarta/Outfit). Każdy fetch
  // do CDN; jeśli się nie powiedzie, pomijamy bez crashowania PDF (react-pdf
  // zrobi fallback do default family). Te fonty NIE mają italic w manual-fonts,
  // więc dla nich italic w PDF jest zignorowany (fallback do regular weight).
  for (const f of MANUAL_FONTS) {
    if (f.family === "Roboto") continue;
    const [reg, bld] = await Promise.all([
      fetchFontTtf(f.regularUrl),
      fetchFontTtf(f.boldUrl),
    ]);
    if (!reg || !bld) continue;
    Font.register({
      family: f.family,
      fonts: [
        { src: toDataUri(reg) },
        { src: toDataUri(bld), fontWeight: 700 },
      ],
    });
  }

  // Bezpieczne łamanie polskich znaków — wszystkie mają full Latin Ext-A.
  Font.registerHyphenationCallback((w) => [w]);
  fontsRegistered = true;
}

// ─── Style — wspólne i per template ────────────────────────────────────

const base = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 11,
    lineHeight: 1.5,
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 50,
    color: "#1f2937",
  },
  h1: { fontSize: 22, fontWeight: 700, marginTop: 8, marginBottom: 3, color: "#0f172a" },
  h2: { fontSize: 16, fontWeight: 700, marginTop: 6, marginBottom: 2, color: "#1e293b" },
  h3: { fontSize: 13, fontWeight: 700, marginTop: 4, marginBottom: 1, color: "#334155" },
  paragraph: { marginBottom: 1 },
  bullet: { flexDirection: "row", marginBottom: 1 },
  bulletDot: { width: 12, fontSize: 11 },
  ordered: { flexDirection: "row", marginBottom: 1 },
  orderedNumber: { width: 18, fontSize: 11, fontWeight: 700 },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    marginVertical: 12,
  },
  image: { marginVertical: 8, alignSelf: "center", maxWidth: 420 },
  callout: {
    backgroundColor: "#fef3c7",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    padding: 10,
    marginVertical: 8,
    borderRadius: 3,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 50,
    right: 50,
    fontSize: 9,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
  },
  header: {
    position: "absolute",
    top: 22,
    left: 50,
    right: 50,
    fontSize: 9,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
});

// BRANDED cover styles
const cover = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    paddingTop: 70,
    paddingBottom: 60,
    paddingHorizontal: 50,
    color: "#1f2937",
  },
  brand: {
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#6366f1",
    fontWeight: 700,
  },
  productImage: {
    marginTop: 60,
    marginBottom: 50,
    maxHeight: 380,
    objectFit: "contain",
    alignSelf: "center",
  },
  imagePlaceholder: {
    marginTop: 60,
    marginBottom: 50,
    height: 320,
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: { fontSize: 11, color: "#94a3b8" },
  productName: {
    fontSize: 30,
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 14,
  },
  metaRow: { flexDirection: "row", gap: 24, marginBottom: 8 },
  metaLabel: { fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2 },
  metaValue: { fontSize: 13, color: "#0f172a", fontWeight: 700, marginTop: 2 },
  metaItem: { flexDirection: "column" },
  coverFooter: {
    position: "absolute",
    bottom: 40,
    left: 50,
    right: 50,
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "center",
  },
});

// ─── TipTap node renderery ─────────────────────────────────────────────

type TipNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TipNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

function parseSize(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*pt?$/i);
  if (!m) return null;
  return Number(m[1]);
}

function renderText(
  node: TipNode,
  keyPrefix: string,
  effectiveFontFamily: string = "Roboto",
): ReactElement[] {
  if (!node.text) return [];
  const marks = node.marks ?? [];
  const isBold = marks.some((m) => m.type === "bold");
  const isItalic = marks.some((m) => m.type === "italic");
  const linkMark = marks.find((m) => m.type === "link");
  // TextStyle z attr.color/fontSize/fontFamily — TipTap text-style mark.
  // Color/FontFamily extensions piszą attrs na ten sam mark.
  const textStyleMark = marks.find((m) => m.type === "textStyle");
  const customColor =
    !linkMark && textStyleMark?.attrs?.color
      ? String(textStyleMark.attrs.color)
      : null;
  const customSize = parseSize(textStyleMark?.attrs?.fontSize);
  const customFamily =
    textStyleMark?.attrs?.fontFamily &&
    typeof textStyleMark.attrs.fontFamily === "string"
      ? String(textStyleMark.attrs.fontFamily)
      : null;
  // Italic — tylko Roboto ma zarejestrowane wszystkie 4 warianty (regular/bold/
  // italic/bold-italic). Pozostałe modern-fonts mają tylko regular+bold —
  // żądanie italic dla nich crashuje react-pdf. Sprawdzamy zarówno node-level
  // (customFamily z textStyle) jak page-level (effectiveFontFamily). Jeśli
  // którykolwiek to nie-Roboto i nie ma override do Roboto, drop italic.
  const effFamily = customFamily ?? effectiveFontFamily;
  const fontHasItalic = effFamily === "Roboto";
  const useItalic = isItalic && fontHasItalic;
  const style = {
    ...(isBold ? { fontWeight: 700 as const } : {}),
    ...(useItalic ? { fontStyle: "italic" as const } : {}),
    ...(linkMark ? { color: "#2563eb" } : {}),
    ...(customColor ? { color: customColor } : {}),
    ...(customSize != null ? { fontSize: customSize } : {}),
    ...(customFamily ? { fontFamily: customFamily } : {}),
  };
  if (linkMark?.attrs?.href) {
    return [
      <Link key={keyPrefix} src={String(linkMark.attrs.href)}>
        <Text style={style}>{node.text}</Text>
      </Link>,
    ];
  }
  return [
    <Text key={keyPrefix} style={style}>
      {node.text}
    </Text>,
  ];
}

function renderInline(
  content: TipNode[] | undefined,
  keyPrefix: string,
  effectiveFontFamily: string = "Roboto",
) {
  if (!content) return null;
  const items: ReactElement[] = [];
  content.forEach((n, i) => {
    if (n.type === "text") {
      items.push(
        ...renderText(n, `${keyPrefix}-${i}`, effectiveFontFamily),
      );
    } else if (n.type === "hardBreak") {
      items.push(<Text key={`${keyPrefix}-${i}`}>{"\n"}</Text>);
    }
  });
  return items;
}

type BlockStyles = {
  h1: { fontSize: number };
  h2: { fontSize: number };
  h3: { fontSize: number };
  imageMaxWidth: number;
  /** Effective fontFamily — propagowane do renderText żeby wiedział czy może
   *  użyć fontStyle:italic. Tylko Roboto ma zarejestrowane italic+bolditalic;
   *  dla innych italic crashuje react-pdf. */
  effectiveFontFamily: string;
};

function renderBlocks(
  content: TipNode[] | undefined,
  keyPrefix = "b",
  styles?: BlockStyles,
): ReactElement[] {
  if (!content) return [];
  const out: ReactElement[] = [];
  content.forEach((node, i) => {
    const k = `${keyPrefix}-${i}`;
    switch (node.type) {
      case "heading": {
        const lvl = Number(node.attrs?.level ?? 2);
        const baseStyle = lvl === 1 ? base.h1 : lvl === 2 ? base.h2 : base.h3;
        // Override fontSize z page profile (mniejsze formaty mają mniejsze nagłówki)
        const sizeOverride =
          styles &&
          (lvl === 1
            ? styles.h1.fontSize
            : lvl === 2
              ? styles.h2.fontSize
              : styles.h3.fontSize);
        // TextAlign atrybut z TipTap @tiptap/extension-text-align
        const textAlign = node.attrs?.textAlign as
          | "left"
          | "center"
          | "right"
          | "justify"
          | undefined;
        const style = {
          ...baseStyle,
          ...(sizeOverride ? { fontSize: sizeOverride } : {}),
          ...(textAlign ? { textAlign } : {}),
        };
        out.push(
          <Text key={k} style={style}>
            {renderInline(node.content, `${k}-i`, styles?.effectiveFontFamily)}
          </Text>,
        );
        break;
      }
      case "paragraph": {
        // Default dla paragrafów to „justify" — bardziej profesjonalny look,
        // jak w książce. User może override przez toolbar (left/center/right).
        // Tylko paragrafy z explicit textAlign przesłaniają default.
        const textAlign =
          (node.attrs?.textAlign as
            | "left"
            | "center"
            | "right"
            | "justify"
            | undefined) ?? "justify";
        const style = {
          ...base.paragraph,
          textAlign,
        };
        out.push(
          <Text key={k} style={style}>
            {renderInline(node.content, `${k}-i`, styles?.effectiveFontFamily)}
          </Text>,
        );
        break;
      }
      case "bulletList": {
        (node.content ?? []).forEach((li, j) => {
          out.push(
            <View key={`${k}-li-${j}`} style={base.bullet}>
              <Text style={base.bulletDot}>•</Text>
              <View style={{ flex: 1 }}>{renderBlocks(li.content, `${k}-li-${j}`, styles)}</View>
            </View>,
          );
        });
        break;
      }
      case "orderedList": {
        (node.content ?? []).forEach((li, j) => {
          out.push(
            <View key={`${k}-oli-${j}`} style={base.ordered}>
              <Text style={base.orderedNumber}>{j + 1}.</Text>
              <View style={{ flex: 1 }}>{renderBlocks(li.content, `${k}-oli-${j}`, styles)}</View>
            </View>,
          );
        });
        break;
      }
      case "listItem": {
        out.push(<View key={k}>{renderBlocks(node.content, k, styles)}</View>);
        break;
      }
      case "horizontalRule": {
        out.push(<View key={k} style={base.divider} />);
        break;
      }
      case "image": {
        const src = node.attrs?.src as string | undefined | null;
        // Po resolveImagesInContent src jest data URI / http URL albo null
        // (gdy lokalnego pliku nie ma). Null = pomiń bez crasha.
        if (src && typeof src === "string") {
          out.push(<PdfImage key={k} style={base.image} src={src} />);
        }
        break;
      }
      case "callout": {
        out.push(
          <View key={k} style={base.callout}>
            {renderBlocks(node.content, k, styles)}
          </View>,
        );
        break;
      }
      case "pageBreak": {
        // Wymuszony break — page-break w react-pdf to atrybut `break` na Text/View.
        // Tu używamy markera View z atrybutem `break`.
        out.push(<View key={k} break />);
        break;
      }
      case "table": {
        // Tabela TipTap (ProseMirror) — content = [tableRow, tableRow, …]
        // Każdy tableRow = [tableHeader | tableCell, …]. ProseMirror dla
        // resizable tabel zapisuje szerokości kolumn w `colwidth` attr na każdej
        // komórce pierwszego wiersza — odczytujemy stamtąd proporcje.
        const rows = node.content ?? [];
        if (rows.length === 0) break;
        // Wyznacz szerokości kolumn z pierwszego wiersza (colwidth w px → frac).
        const firstRow = rows[0];
        const firstRowCells = firstRow?.content ?? [];
        const colWidthsPx: (number | null)[] = firstRowCells.map((c) => {
          const cw = c.attrs?.colwidth as number[] | undefined | null;
          // colwidth jest tablicą bo komórka może spanować kilka kolumn.
          // Bierzemy pierwszą wartość (single-column case dla większości).
          return Array.isArray(cw) && cw[0] ? Number(cw[0]) : null;
        });
        const totalPx: number = colWidthsPx.reduce<number>(
          (s, w) => (w != null ? s + w : s),
          0,
        );
        const colFracs: number[] = colWidthsPx.map((w) =>
          w != null && totalPx > 0
            ? w / totalPx
            : 1 / Math.max(1, firstRowCells.length),
        );
        out.push(
          <View
            key={k}
            style={{
              marginVertical: 6,
              borderTopWidth: 1,
              borderLeftWidth: 1,
              borderColor: "#cbd5e1",
            }}
            wrap={false}
          >
            {rows.map((row, ri) => (
              <View
                key={`${k}-r${ri}`}
                style={{ flexDirection: "row" }}
              >
                {(row.content ?? []).map((cell, ci) => {
                  const isHeader = cell.type === "tableHeader";
                  const cellBlocks = renderBlocks(
                    cell.content,
                    `${k}-r${ri}-c${ci}`,
                    styles,
                  );
                  return (
                    <View
                      key={`${k}-r${ri}-c${ci}`}
                      style={{
                        flex: colFracs[ci] ?? 1,
                        padding: 4,
                        borderRightWidth: 1,
                        borderBottomWidth: 1,
                        borderColor: "#cbd5e1",
                        backgroundColor: isHeader ? "#f1f5f9" : undefined,
                      }}
                    >
                      {cellBlocks}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>,
        );
        break;
      }
      case "sectionLayout": {
        // Sekcja z layoutem (imageOnly / imageRight / imageLeft / textText).
        const layout =
          (node.attrs?.layout as
            | "imageOnly"
            | "imageRight"
            | "imageLeft"
            | "textText"
            | undefined) ?? "imageRight";
        const imageSrc = (node.attrs?.imageSrc as string | undefined) ?? null;
        const verticalCenter = Boolean(node.attrs?.verticalCenter);
        const imageWidthAttr = node.attrs?.imageWidth as number | null | undefined;
        const defaultImgWidth = layout === "imageOnly" ? 70 : 40;
        const imgWidthPct = Math.max(
          20,
          Math.min(100, Number(imageWidthAttr ?? defaultImgWidth)),
        );
        const vWrapStyle = verticalCenter
          ? { marginTop: "auto" as const, marginBottom: "auto" as const }
          : {};

        // textText — split contentu po paragrafach na pół 50/50.
        if (layout === "textText") {
          const allNodes = node.content ?? [];
          const half = Math.ceil(allNodes.length / 2);
          const leftNodes = allNodes.slice(0, half);
          const rightNodes = allNodes.slice(half);
          const leftBlocks = renderBlocks(leftNodes, `${k}-left`, styles);
          const rightBlocks = renderBlocks(rightNodes, `${k}-right`, styles);
          out.push(
            <View
              key={k}
              style={{
                flexDirection: "row",
                gap: 14,
                marginVertical: 8,
                alignItems: "flex-start",
                ...vWrapStyle,
              }}
              wrap={false}
            >
              <View style={{ flex: 1 }}>{leftBlocks}</View>
              <View style={{ flex: 1 }}>{rightBlocks}</View>
            </View>,
          );
          break;
        }

        const innerBlocks = renderBlocks(node.content, `${k}-inner`, styles);
        if (layout === "imageOnly") {
          out.push(
            <View
              key={k}
              style={{
                marginVertical: 8,
                alignItems: "center",
                gap: 4,
                ...vWrapStyle,
              }}
              wrap={false}
            >
              {imageSrc && (
                <View style={{ width: `${imgWidthPct}%` }}>
                  <PdfImage
                    src={imageSrc}
                    style={{ width: "100%", maxHeight: 380 }}
                  />
                </View>
              )}
              <View style={{ width: "100%" }}>{innerBlocks}</View>
            </View>,
          );
        } else {
          out.push(
            <View
              key={k}
              style={{
                flexDirection: layout === "imageLeft" ? "row-reverse" : "row",
                gap: 12,
                marginVertical: 8,
                alignItems: "flex-start",
                ...vWrapStyle,
              }}
              wrap={false}
            >
              <View style={{ flex: 1 }}>{innerBlocks}</View>
              {imageSrc && (
                <View style={{ width: `${imgWidthPct}%` }}>
                  <PdfImage
                    src={imageSrc}
                    style={{ width: "100%", maxHeight: 300 }}
                  />
                </View>
              )}
            </View>,
          );
        }
        break;
      }
      default: {
        // nieznany typ — pomijamy
        break;
      }
    }
  });
  return out;
}

// ─── Helper: wyciągnij H1/H2 do TOC ────────────────────────────────────

type TocEntry = { text: string; level: 1 | 2 };

function extractToc(doc: ManualDocLike): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (nodes?: TipNode[]) => {
    if (!nodes) return;
    for (const n of nodes) {
      if (n.type === "heading") {
        const lvl = Number(n.attrs?.level ?? 2);
        if (lvl === 1 || lvl === 2) {
          const text = (n.content ?? [])
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("");
          if (text) out.push({ text, level: lvl as 1 | 2 });
        }
      }
      if (n.content) walk(n.content);
    }
  };
  walk(doc.content);
  return out;
}

// ─── Main: generuj PDF ─────────────────────────────────────────────────

type ManualDocLike = { type?: string; content?: TipNode[] };

/**
 * Nowa struktura wieloprzejazdowa: lista stron, każda to osobny TipTap
 * dokument. Stara struktura `{ doc }` mapowana do `pages: [{ content: doc }]`.
 */
export type ManualPagePdf = {
  id?: string;
  /** Język tej strony — gdy ustawiony, nadpisuje header pill z `headerRanges`.
   *  Działa per page, więc multi-language manuals (sekwencja PL→EN→SK→...)
   *  pokazują poprawne pill na każdej stronie bez konieczności konfiguracji
   *  zakresów. Wartości: "PL"|"EN"|"DE"|"UA"|"SK"|"RO"|"CS"|"HU"|"BG". */
  lang?: string | null;
  content: ManualDocLike;
};

export interface ManualPdfInput {
  template: "CLEAN" | "TECHNICAL" | "BRANDED";
  pageSize: "A4" | "A5" | "A6";
  /** Style overrides — gdy null, używamy domyślnych z PAGE_PROFILES + Roboto. */
  fontFamily?: string | null;
  bodyFontSize?: number | null;
  h1FontSize?: number | null;
  h2FontSize?: number | null;
  h3FontSize?: number | null;
  /** Globalne logo instrukcji — prawy górny róg każdej strony + wycentrowane
   *  na 1. stronie. URL lokalny `/uploads/...` jest auto-resolwowany do data URI. */
  logoImageUrl?: string | null;
  /** Wysokość loga na okładce w punktach PDF. Default 60pt. */
  logoHeightPt?: number | null;
  /** Edytowalny podtytuł pod logiem na okładce. */
  coverSubtitle?: string | null;
  /** Adres strony www firmy — renderowany wycentrowany na „Ostatniej" stronie.
   *  Null = strona ostatnia pozostaje pusta. */
  companyWebsiteUrl?: string | null;
  /** Typ instrukcji — STANDARD (multipage) lub LEAFLET (cover + 1 body/lang). */
  kind?: "STANDARD" | "LEAFLET";
  /** Lista BODY stron (fizyczne strony 3+). Cover (str 1) i TOC (str 2)
   *  są zawsze generowane, niezależnie od tej listy. */
  pages: ManualPagePdf[];
  /** Lista aktywnych języków instrukcji — renderowana jako mała lista pills
   *  pod podtytułem na okładce. Daje sygnał „w tej instrukcji są wersje PL/EN/SK...". */
  activeLanguages?: string[] | null;
  /** Treści stron „Wyrównanie" per język — klucz to kod języka (PL/EN/...).
   *  Renderowane TYLKO gdy extras=2 (treść danej sekcji kończy się parzyście). */
  alignmentContent?:
    | Record<string, { type?: string; content?: TipNode[] }>
    | { type?: string; content?: TipNode[] }
    | null;
  /** Custom header / footer ustawione przez usera w edytorze. Header zawiera
   *  small language pill + tytuł strony. Footer to dowolny tekst + auto page#. */
  headerLang: string | null;
  headerTitle: string | null;
  /** Zakresy nagłówków per zakres stron — jeśli ustawione, nadpisują legacy
   *  `headerLang`/`headerTitle` per-page. Format: parseHeaderRanges(json). */
  headerRanges: HeaderRange[];
  footerCustom: string | null;
  product: {
    name: string;
    productCode: string;
    eanCode: string | null;
    code128: string | null;
    primaryImageUrl: string | null;
    companyName: string | null;
  };
}

// Skalowanie typografii i marginesów w zależności od formatu strony.
// A4 to baseline, A5 ~70%, A6 ~50% (ale czytelność musi pozostać — nie schodzimy
// poniżej fontSize 8). Mniejsze formaty mają też proporcjonalnie mniejsze marginesy
// i ukryte spis treści (A6 nie ma sensu — to ulotka).
type PageProfile = {
  size: "A4" | "A5" | "A6";
  fontSize: number;
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
  headerTop: number;
  footerBottom: number;
  h1: number;
  h2: number;
  h3: number;
  imageMaxWidth: number;
};
const PAGE_PROFILES: Record<"A4" | "A5" | "A6", PageProfile> = {
  A4: {
    size: "A4",
    fontSize: 11,
    paddingTop: 80,
    paddingBottom: 60,
    paddingHorizontal: 50,
    headerTop: 22,
    footerBottom: 30,
    h1: 22,
    h2: 16,
    h3: 13,
    imageMaxWidth: 420,
  },
  A5: {
    size: "A5",
    fontSize: 10,
    paddingTop: 54,
    paddingBottom: 38,
    paddingHorizontal: 32,
    headerTop: 16,
    footerBottom: 22,
    h1: 17,
    h2: 13,
    h3: 11,
    imageMaxWidth: 300,
  },
  A6: {
    size: "A6",
    fontSize: 9,
    paddingTop: 38,
    paddingBottom: 26,
    paddingHorizontal: 22,
    headerTop: 12,
    footerBottom: 16,
    h1: 14,
    h2: 11,
    h3: 10,
    imageMaxWidth: 220,
  },
};

export async function buildManualPdfDocument(
  input: ManualPdfInput,
): Promise<ReactElement> {
  await ensureFonts();
  const {
    template,
    pages,
    product,
    pageSize,
    headerLang,
    headerTitle,
    headerRanges,
    footerCustom,
    fontFamily,
    bodyFontSize,
    h1FontSize,
    h2FontSize,
    h3FontSize,
    logoImageUrl,
    logoHeightPt,
    coverSubtitle,
    companyWebsiteUrl,
    activeLanguages,
    alignmentContent,
    kind = "STANDARD",
  } = input;
  const isLeaflet = kind === "LEAFLET";

  // Rozwiąż wszystkie image src — relatywne /uploads → data URI, absolute bez zmian.
  // Mutujemy `pages` w miejscu (bezpieczne, bo to nie deep-frozen input).
  for (const p of pages) {
    await resolveImagesInContent(p.content.content);
  }
  // Per-language alignmentContent: Record<lang, doc> — rozwiąż obrazki we
  // wszystkich docach. Backwards-compat: legacy alignmentContent jako
  // pojedynczy doc (z `type === "doc"`) → traktujemy jako PL only.
  const alignByLang: Record<string, { content?: TipNode[] }> = (() => {
    if (!alignmentContent || typeof alignmentContent !== "object") return {};
    const ac = alignmentContent as Record<string, unknown>;
    if (ac.type === "doc") {
      return { PL: alignmentContent as { content?: TipNode[] } };
    }
    const out: Record<string, { content?: TipNode[] }> = {};
    for (const [k, v] of Object.entries(ac)) {
      if (v && typeof v === "object") {
        out[k] = v as { content?: TipNode[] };
      }
    }
    return out;
  })();
  for (const doc of Object.values(alignByLang)) {
    if (doc?.content) await resolveImagesInContent(doc.content);
  }
  // Resolved header right images — per zakres, oddzielna mapa po id zakresu.
  const resolvedHeaderImages = new Map<string, string | null>();
  for (const r of headerRanges) {
    if (r.rightImageUrl) {
      resolvedHeaderImages.set(r.id, await resolveImageSrc(r.rightImageUrl));
    }
  }
  // Globalne logo — resolve raz, użyte we wszystkich nagłówkach + na 1. stronie
  const resolvedLogo = logoImageUrl
    ? await resolveImageSrc(logoImageUrl)
    : null;
  const profile = PAGE_PROFILES[pageSize];
  // Style overrides z user settings; gdy null, fallback do profile (zależnego
  // od formatu strony) i bazowego Roboto.
  const effFontFamily = fontFamily ?? "Roboto";

  // Cyrylica wymaga fontu z wbudowanym Cyrillic / Cyrillic Extended subsetem.
  // Roboto ma — Manrope/DM Sans/Outfit/Plus Jakarta NIE MAJĄ. Gdy user wybrał
  // inny font niż Roboto, dla sekcji UA/BG i tak forsujemy Roboto żeby się
  // nie renderowało jako kwadratowe „tofu" lub źle podstawione glify.
  const CYRILLIC_LANGS = new Set(["BG", "UA"]);
  const fontForLang = (lang: string): string =>
    CYRILLIC_LANGS.has(lang) ? "Roboto" : effFontFamily;
  const pageStyle = {
    fontFamily: effFontFamily,
    fontSize: bodyFontSize ?? profile.fontSize,
    lineHeight: 1.5,
    paddingTop: profile.paddingTop,
    paddingBottom: profile.paddingBottom,
    paddingHorizontal: profile.paddingHorizontal,
    color: "#1f2937",
  } as const;
  const blockStyles = {
    h1: { fontSize: h1FontSize ?? profile.h1 },
    h2: { fontSize: h2FontSize ?? profile.h2 },
    h3: { fontSize: h3FontSize ?? profile.h3 },
    imageMaxWidth: profile.imageMaxWidth,
    effectiveFontFamily: effFontFamily,
  };

  // Per-pageSize footer/header styles — base.footer ma sztywne pozycje
  // które dla A5/A6 ścinają stopkę poza obszar drukowania. Definicja
  // bez spread'a base.footer/base.header, bo `StyleSheet.create` w
  // react-pdf zwraca obiekty z internal ID który może rozjechać style
  // przy spreadzie.
  // Wysokość strony w pt — używana do obliczenia `top` stopki (zamiast
  // `bottom`, bo react-pdf/Yoga z `position: absolute` + `bottom` bez `top`
  // potrafi rozciągnąć View na całą wysokość strony zamiast auto-fit do
  // wysokości treści). Obliczamy `top = pageHeight - footerBottom - height`.
  const pageHeightPt =
    profile.size === "A4" ? 842 : profile.size === "A5" ? 595 : 420;
  // Estymowana wysokość stopki — paddingTop 8 + fontSize 9 × line-height 1.5
  // (≈13.5) + buffer = ~28pt żeby tekst się nie ścinał.
  const footerHeightPt = 28;
  const dynFooterStyle = {
    position: "absolute" as const,
    top: pageHeightPt - profile.footerBottom - footerHeightPt,
    left: profile.paddingHorizontal,
    right: profile.paddingHorizontal,
    height: footerHeightPt,
    fontSize: 9,
    color: "#6b7280",
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#e5e7eb",
  };
  const dynHeaderStyle = {
    position: "absolute" as const,
    top: profile.headerTop,
    left: profile.paddingHorizontal,
    right: profile.paddingHorizontal,
    fontSize: 9,
    color: "#6b7280",
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  };
  // Sekcje językowe — każdy język to osobna mini-instrukcja w PDF:
  // cover + TOC + body pages + Ostatnia. Sekcje są sekwencyjnie wg activeLanguages.
  const sectionLangs: string[] =
    activeLanguages && activeLanguages.length > 0
      ? activeLanguages
      : ["PL"];
  type Sec = { lang: string; pages: typeof pages; offset: number };
  const sectionsList: Sec[] = [];
  {
    let offset = 0;
    for (let i = 0; i < sectionLangs.length; i++) {
      const lang = sectionLangs[i];
      const secPages = pages.filter((p) => (p.lang ?? "PL") === lang);
      sectionsList.push({ lang, pages: secPages, offset });
      const bodyCount = secPages.length;
      if (isLeaflet) {
        // LEAFLET: 1 cover globalna (tylko sec 0) + bodyCount stron body per sekcja.
        // Cover jest renderowana tylko raz dla 1. sekcji, kolejne sekcje
        // dodają tylko swoje body do offsetu.
        const coverInThisSection = i === 0 ? 1 : 0;
        offset += coverInThisSection + bodyCount;
      } else {
        // 2 (cover+TOC) + bodyCount + extras (1 lub 2)
        const lastContentPage = 2 + bodyCount;
        const extras = lastContentPage % 2 === 0 ? 2 : 1;
        offset += 2 + bodyCount + extras;
      }
    }
  }
  // Suma wszystkich stron we wszystkich sekcjach
  const totalPhysicalPages = sectionsList.reduce((sum, s, i) => {
    const bodyCount = s.pages.length;
    if (isLeaflet) {
      const coverInThisSection = i === 0 ? 1 : 0;
      return sum + coverInThisSection + bodyCount;
    }
    const lastContentPage = 2 + bodyCount;
    const extras = lastContentPage % 2 === 0 ? 2 : 1;
    return sum + 2 + bodyCount + extras;
  }, 0);
  // TOC generowany z header rangów. Pomijamy A6 — za mało.
  const tocEntries =
    pageSize === "A6" ? [] : generateToc(headerRanges, totalPhysicalPages);
  // `template` zachowane jako pass-through (wpływa na BRANDED cover hint).
  // Standard cover ZAWSZE jest renderowany — nie zależy od templateu.
  void template;
  // Cover sizing — logo wycentrowane pionowo + poziomo na 1. stronie.
  // logoHeightPt — surowy rozmiar w punktach PDF (1pt ≈ 0.353mm).
  const coverLogoPt = Math.max(40, Math.min(280, logoHeightPt ?? 60));

  return (
    <Document
      title={`Instrukcja: ${product.name}`}
      author={product.companyName ?? "ERP"}
    >
      {sectionsList.map((__section, __secIdx) => (
      <React.Fragment key={`sec-${__section.lang}`}>
      {/* ── Okładka — STANDARD: per-język. LEAFLET: globalna, tylko dla sec 0. */}
      {(!isLeaflet || __secIdx === 0) && (
      <Page
        size={profile.size}
        style={{ ...cover.page, fontFamily: fontForLang(__section.lang) }}
      >
        {/* Wrapper flex:1 + justifyContent:center wymusza środek strony */}
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          {resolvedLogo ? (
            <PdfImage
              src={resolvedLogo}
              style={{
                height: coverLogoPt,
                maxWidth: "75%",
                objectFit: "contain",
              }}
            />
          ) : null}
          {coverSubtitle ? (
            <Text
              style={{
                fontSize: bodyFontSize ?? profile.fontSize,
                color: "#475569",
                textAlign: "center",
                maxWidth: "85%",
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              {coverSubtitle}
            </Text>
          ) : null}
          {/* Języki — na pierwszej okładce (sec 0) lista WSZYSTKICH języków
              instrukcji (jako rząd badge'ów, z aktualnym podświetlonym),
              na kolejnych okładkach tylko język danej sekcji. */}
          {__secIdx === 0 && sectionLangs.length > 1 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 6,
                marginTop: 12,
                maxWidth: "85%",
              }}
            >
              {sectionLangs.map((lang) => (
                <Text
                  key={`coverlang-${lang}`}
                  style={{
                    fontSize: (bodyFontSize ?? profile.fontSize) * 1.1,
                    color: lang === __section.lang ? "#0f172a" : "#64748b",
                    letterSpacing: 3,
                    fontWeight: 700,
                    backgroundColor:
                      lang === __section.lang ? "#e2e8f0" : "#f1f5f9",
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 4,
                  }}
                >
                  {lang}
                </Text>
              ))}
            </View>
          ) : (
            <Text
              style={{
                fontSize: (bodyFontSize ?? profile.fontSize) * 1.1,
                color: "#0f172a",
                letterSpacing: 3,
                textAlign: "center",
                fontWeight: 700,
                marginTop: 12,
                backgroundColor: "#f1f5f9",
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 4,
              }}
            >
              {__section.lang}
            </Text>
          )}
        </View>
        {/* Stopka okładki usunięta — nazwa firmy nie pokazywana na okładce. */}
      </Page>
      )}

      {/* ── TOC sekcji — drugi spread sekcji. Pomijany w LEAFLET. */}
      {!isLeaflet && (
      <Page
        size={profile.size}
        style={{ ...pageStyle, fontFamily: fontForLang(__section.lang) }}
        wrap
      >
        {(() => {
          const secLang = isManualLanguage(__section.lang) ? __section.lang : "PL";
          const tocLabel = MANUAL_TOC_LABEL[secLang];
          const emptyMsg = MANUAL_TOC_EMPTY[secLang];
          // Per-sekcja TOC entries — preferuj headerRange.title, fallback H1,
          // dalej „Page X". Strony z tym samym matched range emitują jeden
          // wpis pokazujący PEŁNY zakres rangu (fromPage-toPage) — uwzględnia
          // też strony wyrównania jeśli range je obejmuje.
          const pageLabel = MANUAL_PAGE_LABEL[secLang];
          const sectionTocEntries: { text: string; pages: string }[] = [];
          const seenRangeIds = new Set<string>();
          __section.pages.forEach((page, localIdx) => {
            const physicalPage = __section.offset + 3 + localIdx;
            const matched =
              headerRanges.length > 0
                ? resolveHeaderForPage(physicalPage, headerRanges)
                : null;
            if (matched) {
              if (seenRangeIds.has(matched.id)) return;
              seenRangeIds.add(matched.id);
              sectionTocEntries.push({
                text: matched.title || `${pageLabel} ${matched.fromPage}`,
                pages:
                  matched.fromPage === matched.toPage
                    ? String(matched.fromPage)
                    : `${matched.fromPage}-${matched.toPage}`,
              });
              return;
            }
            let h1Text: string | null = null;
            const content = page.content?.content;
            if (Array.isArray(content)) {
              for (const node of content) {
                if (
                  node &&
                  typeof node === "object" &&
                  (node as Record<string, unknown>).type === "heading"
                ) {
                  const lvl = Number(
                    (
                      (node as Record<string, unknown>).attrs as
                        | Record<string, unknown>
                        | undefined
                    )?.level ?? 0,
                  );
                  if (lvl === 1) {
                    const children = (node as Record<string, unknown>)
                      .content as unknown[] | undefined;
                    if (Array.isArray(children)) {
                      h1Text = children
                        .filter(
                          (c) =>
                            c &&
                            typeof c === "object" &&
                            (c as Record<string, unknown>).type === "text",
                        )
                        .map((c) =>
                          String((c as Record<string, unknown>).text ?? ""),
                        )
                        .join("");
                    }
                    break;
                  }
                }
              }
            }
            sectionTocEntries.push({
              text: h1Text ?? `${pageLabel} ${physicalPage}`,
              pages: String(physicalPage),
            });
          });
          // Header ranges które obejmują strony wyrównania / ostatnią (poza body)
          // — body forEach ich nie złapie, więc dopisujemy osobno. Filtrujemy
          // po lang (matching tej sekcji) i po przecięciu z section bounds.
          const lastContentPageOfSection = 2 + __section.pages.length;
          const sectionExtras = lastContentPageOfSection % 2 === 0 ? 2 : 1;
          const sectionStart = __section.offset + 1;
          const sectionEnd =
            __section.offset + 2 + __section.pages.length + sectionExtras;
          for (const r of headerRanges) {
            if (seenRangeIds.has(r.id)) continue;
            if (!r.title) continue;
            // Filtruj po lang: gdy range ma lang, musi pasować do sekcji
            if (r.lang && r.lang !== __section.lang) continue;
            if (r.toPage < sectionStart || r.fromPage > sectionEnd) continue;
            const from = Math.max(sectionStart, r.fromPage);
            const to = Math.min(sectionEnd, r.toPage);
            if (to < from) continue;
            seenRangeIds.add(r.id);
            sectionTocEntries.push({
              text: r.title,
              pages: from === to ? String(from) : `${from}-${to}`,
            });
          }
          return (
            <>
              <Text
                style={{
                  fontSize: h1FontSize ?? profile.h1,
                  fontWeight: 700,
                  color: "#0f172a",
                  marginBottom: 10,
                  borderBottomWidth: 0.5,
                  borderBottomColor: "#cbd5e1",
                  paddingBottom: 4,
                }}
              >
                {tocLabel}
              </Text>
              {sectionTocEntries.length === 0 ? (
                <Text
                  style={{
                    fontStyle: "italic",
                    color: "#94a3b8",
                    fontSize: (bodyFontSize ?? profile.fontSize) * 0.9,
                  }}
                >
                  {emptyMsg}
                </Text>
              ) : (
                sectionTocEntries.map((entry, i) => (
            <View
              key={`toc-${i}`}
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <Text
                style={{
                  fontSize: bodyFontSize ?? profile.fontSize,
                  color: "#0f172a",
                  fontWeight: 400,
                }}
              >
                {entry.text}
              </Text>
              <View
                style={{
                  flex: 1,
                  borderBottomWidth: 0.5,
                  borderBottomColor: "#cbd5e1",
                  marginBottom: 2,
                }}
              />
              <Text
                style={{
                  fontSize: bodyFontSize ?? profile.fontSize,
                  color: "#475569",
                }}
              >
                {entry.pages}
              </Text>
            </View>
          ))
              )}
            </>
          );
        })()}
        <View style={dynFooterStyle} fixed>
          <Text style={{ flex: 1 }}>
            {footerCustom || `${product.name} · ${product.productCode}`}
          </Text>
        </View>
        <Text
          fixed
          style={{
            position: "absolute",
            top: pageHeightPt - profile.footerBottom - footerHeightPt,
            right: profile.paddingHorizontal,
            fontSize: 9,
            color: "#6b7280",
            paddingTop: 8,
          }}
          render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          }
        />
      </Page>
      )}

      {/* ── Body pages tej sekcji — edytowalna treść. Header + footer + numer.
          W LEAFLET 1. body sec 0 to fizycznie strona 2 (po cover); kolejne
          body są ciągłe wg __section.offset. */}
      {__section.pages.map((page, localIdx) => {
        const physicalPage = isLeaflet
          ? __section.offset + (__secIdx === 0 ? 1 : 0) + localIdx + 1
          : __section.offset + 3 + localIdx;
        const idx = localIdx;
        const pageLang = page.lang ?? __section.lang;
        const pageBlockStyles = CYRILLIC_LANGS.has(pageLang)
          ? { ...blockStyles, effectiveFontFamily: "Roboto" }
          : blockStyles;
        const pageBlocks = renderBlocks(
          page.content.content,
          `p${__section.lang}-${idx}`,
          pageBlockStyles,
        );
        // Header lookup po fizycznym numerze strony (1=cover, 2=TOC, 3+=body).
        const matchedRange =
          headerRanges.length > 0
            ? resolveHeaderForPage(physicalPage, headerRanges)
            : null;
        // Priorytet language pill: page.lang (z multi-language module) >
        // matchedRange.lang > globalny headerLang.
        const effLang =
          page.lang ??
          matchedRange?.lang ??
          (headerRanges.length === 0 ? headerLang : null);
        const effTitle =
          matchedRange?.title ??
          (headerRanges.length === 0 ? headerTitle : null);
        return (
          <Page
            key={page.id ?? `body-${idx}`}
            size={profile.size}
            style={{
              ...pageStyle,
              fontFamily: fontForLang(page.lang ?? __section.lang),
            }}
            wrap
          >
            <View style={dynHeaderStyle} fixed>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {effLang && (
                  <Text
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      backgroundColor: "#fce7f3",
                      color: "#9d174d",
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 2,
                      letterSpacing: 1,
                    }}
                  >
                    {effLang.toUpperCase()}
                  </Text>
                )}
                <Text style={{ flex: 1 }}>
                  {effTitle || product.name}
                </Text>
              </View>
              {(() => {
                // Priorytet: globalne logo > per-range image (deprecated) > rightText > productCode
                if (resolvedLogo) {
                  return (
                    <PdfImage
                      src={resolvedLogo}
                      style={{
                        maxHeight: 18,
                        maxWidth: 80,
                        objectFit: "contain",
                      }}
                    />
                  );
                }
                const resolvedImg = matchedRange
                  ? resolvedHeaderImages.get(matchedRange.id)
                  : null;
                if (resolvedImg) {
                  return (
                    <PdfImage
                      src={resolvedImg}
                      style={{
                        maxHeight: 18,
                        maxWidth: 80,
                        objectFit: "contain",
                      }}
                    />
                  );
                }
                if (matchedRange?.rightText) {
                  return <Text>{matchedRange.rightText}</Text>;
                }
                return <Text>{product.productCode}</Text>;
              })()}
            </View>

            {/* Treść body strony */}
            {pageBlocks.length === 0 ? (
              <Text style={{ fontStyle: "italic", color: "#94a3b8" }}>
                (Pusta strona — uzupełnij treść w edytorze.)
              </Text>
            ) : (
              pageBlocks
            )}

            {/* Footer body — Text z `render` jest BEZPOŚREDNIO w Page (nie w
                nested View) — react-pdf czasem nie wywołuje callbacku `render`
                gdy Text jest głęboko zagnieżdżony, mimo `fixed`. */}
            <View style={dynFooterStyle} fixed>
              <Text style={{ flex: 1 }}>
                {footerCustom ||
                  `${product.name} · ${product.productCode}`}
              </Text>
            </View>
            <Text
              fixed
              style={{
                position: "absolute",
                top:
                  pageHeightPt - profile.footerBottom - footerHeightPt,
                right: profile.paddingHorizontal,
                fontSize: 9,
                color: "#6b7280",
                paddingTop: 8,
              }}
              render={({ pageNumber, totalPages }) =>
                `${pageNumber} / ${totalPages}`
              }
            />
          </Page>
        );
      })}

      {/* ── Ostatnie strony — STANDARD only. LEAFLET pomija Wyrównanie i Ostatnią. */}
      {!isLeaflet && (() => {
        const lastContentPage = 2 + __section.pages.length;
        const needsAlignment = lastContentPage % 2 === 0;
        const out: React.ReactElement[] = [];
        if (needsAlignment) {
          // Strona „Wyrównanie" — fizycznie pierwsza po ostatnim body sekcji.
          // Edytowalna w UI (state `alignmentContent`), więc PDF musi renderować
          // jej treść — wcześniej dawała tylko biały spacer, przez co user
          // tracił wpisane treści po wygenerowaniu PDFa.
          const physicalPage = __section.offset + 3 + __section.pages.length;
          // Najpierw direct match, fallback: range pokrywający stronę poprzednią
          // — alignment dziedziczy nagłówek ostatniej body strony.
          const matchedRange =
            headerRanges.length > 0
              ? resolveHeaderForPage(physicalPage, headerRanges) ??
                resolveHeaderForPage(physicalPage - 1, headerRanges)
              : null;
          const effLang =
            __section.lang ??
            matchedRange?.lang ??
            (headerRanges.length === 0 ? headerLang : null);
          const effTitle =
            matchedRange?.title ??
            (headerRanges.length === 0 ? headerTitle : null);
          // Per-section alignmentContent — bierzemy doc dla języka tej sekcji.
          const alignDoc = alignByLang[__section.lang] ?? null;
          const alignBlockStyles = CYRILLIC_LANGS.has(__section.lang)
            ? { ...blockStyles, effectiveFontFamily: "Roboto" }
            : blockStyles;
          const alignBlocks = alignDoc?.content
            ? renderBlocks(
                alignDoc.content,
                `align-${__section.lang}`,
                alignBlockStyles,
              )
            : [];
          out.push(
            <Page
              key={`alignment-${__section.lang}`}
              size={profile.size}
              style={{
                ...pageStyle,
                fontFamily: fontForLang(__section.lang),
              }}
              wrap
            >
              <View style={dynHeaderStyle} fixed>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {effLang && (
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        backgroundColor: "#fce7f3",
                        color: "#9d174d",
                        paddingHorizontal: 4,
                        paddingVertical: 1,
                        borderRadius: 2,
                        letterSpacing: 1,
                      }}
                    >
                      {effLang.toUpperCase()}
                    </Text>
                  )}
                  <Text style={{ flex: 1 }}>
                    {effTitle || product.name}
                  </Text>
                </View>
                {(() => {
                  if (resolvedLogo) {
                    return (
                      <PdfImage
                        src={resolvedLogo}
                        style={{
                          maxHeight: 18,
                          maxWidth: 80,
                          objectFit: "contain",
                        }}
                      />
                    );
                  }
                  const resolvedImg = matchedRange
                    ? resolvedHeaderImages.get(matchedRange.id)
                    : null;
                  if (resolvedImg) {
                    return (
                      <PdfImage
                        src={resolvedImg}
                        style={{
                          maxHeight: 18,
                          maxWidth: 80,
                          objectFit: "contain",
                        }}
                      />
                    );
                  }
                  if (matchedRange?.rightText) {
                    return <Text>{matchedRange.rightText}</Text>;
                  }
                  return <Text>{product.productCode}</Text>;
                })()}
              </View>
              {alignBlocks.length > 0 ? (
                alignBlocks
              ) : (
                <Text> </Text>
              )}
              <View style={dynFooterStyle} fixed>
                <Text style={{ flex: 1 }}>
                  {footerCustom ||
                    `${product.name} · ${product.productCode}`}
                </Text>
              </View>
              <Text
                fixed
                style={{
                  position: "absolute",
                  top:
                    pageHeightPt - profile.footerBottom - footerHeightPt,
                  right: profile.paddingHorizontal,
                  fontSize: 9,
                  color: "#6b7280",
                  paddingTop: 8,
                }}
                render={({ pageNumber, totalPages }) =>
                  `${pageNumber} / ${totalPages}`
                }
              />
            </Page>,
          );
        }
        // „Ostatnia" sekcji — wycentrowany adres strony www firmy.
        // Bez adresu strona pozostaje pusta (jak wcześniej).
        out.push(
          <Page
            key={`last-${__section.lang}`}
            size={profile.size}
            style={{
              ...pageStyle,
              fontFamily: fontForLang(__section.lang),
            }}
            wrap={false}
          >
            {companyWebsiteUrl ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: (bodyFontSize ?? profile.fontSize) * 1.3,
                    color: "#475569",
                    letterSpacing: 1,
                    textAlign: "center",
                  }}
                >
                  {companyWebsiteUrl}
                </Text>
              </View>
            ) : null}
          </Page>,
        );
        return out;
      })()}
      </React.Fragment>
      ))}
    </Document>
  );
}
