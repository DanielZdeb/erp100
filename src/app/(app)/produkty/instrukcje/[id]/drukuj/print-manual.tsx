"use client";

/**
 * Print manual — renderuje całą instrukcję jako sekwencję A4/A5/A6 stron
 * w HTML. Po załadowaniu auto-triggeruje `window.print()`. User wybiera
 * "Zapisz jako PDF" w dialogu przeglądarki → pixel-perfect PDF.
 *
 * TipTap JSON → HTML: prosty rekurencyjny renderer dla typów node'ów które
 * używamy (heading, paragraph, ul/ol, sectionLayout, image, callout etc.).
 *
 * Kluczowe: CSS jest wstrzykiwany jako globalny `<style>` z dynamicznymi
 * wartościami (pageSize, fontFamily, fontSizes). React 19 wspiera `<style>`
 * children — Next.js hoistuje do <head>. window.print() triggered manualnie
 * przez user żeby uniknąć race z hydratacją.
 */

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

const PAGE_SIZE_MM: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};

type TipNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TipNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

interface PrintManualProps {
  manualName: string;
  pageSize: "A4" | "A5" | "A6";
  fontFamily: string;
  bodyFontSize: number;
  h1FontSize: number;
  h2FontSize: number;
  h3FontSize: number;
  logoImageUrl: string | null;
  logoHeightPt: number;
  coverSubtitle: string;
  footerCustom: string;
  companyName: string;
  tocEntries: { text: string; pages: string }[];
  bodyPages: {
    id: string;
    content: { type?: string; content?: TipNode[] };
    header: { lang: string | null; title: string | null };
  }[];
}

// ─── TipTap JSON → React elements ──────────────────────────────────────

let keyCounter = 0;
const nextKey = () => `n-${keyCounter++}`;

function renderNode(node: TipNode): React.ReactNode {
  if (!node) return null;
  const key = nextKey();

  if (node.type === "text") {
    return renderTextNode(node, key);
  }

  switch (node.type) {
    case "heading": {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2)));
      const align = node.attrs?.textAlign as string | undefined;
      const Tag = `h${level}` as "h1" | "h2" | "h3";
      return (
        <Tag
          key={key}
          style={align ? { textAlign: align as "left" } : undefined}
        >
          {(node.content ?? []).map(renderNode)}
        </Tag>
      );
    }
    case "paragraph": {
      const align = node.attrs?.textAlign as string | undefined;
      const children = node.content ?? [];
      return (
        <p
          key={key}
          style={align ? { textAlign: align as "left" } : undefined}
        >
          {children.length === 0 ? " " : children.map(renderNode)}
        </p>
      );
    }
    case "bulletList":
      return <ul key={key}>{(node.content ?? []).map(renderNode)}</ul>;
    case "orderedList":
      return <ol key={key}>{(node.content ?? []).map(renderNode)}</ol>;
    case "listItem":
      return <li key={key}>{(node.content ?? []).map(renderNode)}</li>;
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "image": {
      const src = node.attrs?.src as string | undefined;
      if (!src) return null;
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img
          key={key}
          src={src}
          alt=""
          style={{
            maxWidth: "100%",
            height: "auto",
            display: "block",
            margin: "8px auto",
          }}
        />
      );
    }
    case "callout":
      return (
        <div
          key={key}
          style={{
            background: "#fef3c7",
            borderLeft: "3px solid #f59e0b",
            padding: "10px 12px",
            margin: "8px 0",
            borderRadius: 3,
          }}
        >
          {(node.content ?? []).map(renderNode)}
        </div>
      );
    case "pageBreak":
      return <div key={key} style={{ pageBreakAfter: "always" }} />;
    case "sectionLayout": {
      const layout = (node.attrs?.layout as string) ?? "imageRight";
      const imageSrc = node.attrs?.imageSrc as string | undefined;
      const imageWidthAttr = node.attrs?.imageWidth as number | null | undefined;
      const verticalCenter = Boolean(node.attrs?.verticalCenter);
      const defW = layout === "imageOnly" ? 70 : 40;
      const imgW = Math.max(20, Math.min(100, imageWidthAttr ?? defW));
      const innerContent = (node.content ?? []).map(renderNode);

      const wrapStyle: React.CSSProperties = verticalCenter
        ? { marginTop: "auto", marginBottom: "auto" }
        : {};

      if (layout === "imageOnly") {
        return (
          <div
            key={key}
            style={{
              margin: "8px 0",
              ...wrapStyle,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {imageSrc && (
              <div style={{ width: `${imgW}%` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt=""
                  style={{ width: "100%", display: "block" }}
                />
              </div>
            )}
            <div style={{ width: "100%", textAlign: "center" }}>
              {innerContent}
            </div>
          </div>
        );
      }
      return (
        <div
          key={key}
          style={{
            display: "flex",
            flexDirection: layout === "imageLeft" ? "row-reverse" : "row",
            gap: 12,
            margin: "8px 0",
            alignItems: "flex-start",
            ...wrapStyle,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>{innerContent}</div>
          {imageSrc && (
            <div style={{ width: `${imgW}%`, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt=""
                style={{ width: "100%", display: "block" }}
              />
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

function renderTextNode(node: TipNode, key: string): React.ReactNode {
  if (!node.text) return null;
  const marks = node.marks ?? [];
  const isBold = marks.some((m) => m.type === "bold");
  const isItalic = marks.some((m) => m.type === "italic");
  const linkMark = marks.find((m) => m.type === "link");
  const textStyleMark = marks.find((m) => m.type === "textStyle");
  const color = textStyleMark?.attrs?.color as string | undefined;
  const fontSize = textStyleMark?.attrs?.fontSize as string | undefined;
  const fontFamilyMark = textStyleMark?.attrs?.fontFamily as string | undefined;

  const style: React.CSSProperties = {
    ...(isBold ? { fontWeight: 700 } : {}),
    ...(isItalic ? { fontStyle: "italic" as const } : {}),
    ...(color ? { color } : {}),
    ...(fontSize ? { fontSize } : {}),
    ...(fontFamilyMark ? { fontFamily: fontFamilyMark } : {}),
    ...(linkMark ? { color: "#2563eb", textDecoration: "underline" } : {}),
  };

  if (linkMark?.attrs?.href) {
    return (
      <a key={key} href={String(linkMark.attrs.href)} style={style}>
        {node.text}
      </a>
    );
  }
  return (
    <span key={key} style={style}>
      {node.text}
    </span>
  );
}

// ─── Main ────────────────────────────────────────────────────────────

export function PrintManual({
  manualName,
  pageSize,
  fontFamily,
  bodyFontSize,
  h1FontSize,
  h2FontSize,
  h3FontSize,
  logoImageUrl,
  logoHeightPt,
  coverSubtitle,
  footerCustom,
  companyName,
  tocEntries,
  bodyPages,
}: PrintManualProps) {
  const dims = PAGE_SIZE_MM[pageSize];
  const [ready, setReady] = useState(false);

  // Inject CSS i mark ready po mount
  useEffect(() => {
    setReady(true);
  }, []);

  const pageStyle: React.CSSProperties = {
    width: `${dims.w}mm`,
    height: `${dims.h}mm`,
    background: "white",
    boxSizing: "border-box",
    overflow: "hidden",
    position: "relative",
    pageBreakAfter: "always",
    breakAfter: "page",
    display: "flex",
    flexDirection: "column",
    fontFamily: `${fontFamily}, system-ui, sans-serif`,
    fontSize: `${bodyFontSize}pt`,
    lineHeight: 1.5,
    color: "#1f2937",
  };

  const screenPageStyle: React.CSSProperties = {
    margin: "8mm auto",
    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
  };

  return (
    <>
      {/* Print CSS — inline <style> bez precedence (precedence wymaga client
          hydration, podczas SSR style się nie aplikuje od razu). Inline style
          w body działa globalnie w przeglądarce. */}
      <style>{`
        @page {
          size: ${dims.w}mm ${dims.h}mm;
          margin: 0;
        }
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          .no-print { display: none !important; }
          .print-page {
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always;
          }
          .print-page:last-child {
            page-break-after: auto;
          }
        }
        @media screen {
          body { background: #e2e8f0; margin: 0; padding: 0; }
        }
        .print-page h1 {
          font-size: ${h1FontSize}pt; font-weight: 700; color: #0f172a;
          margin: 0.2em 0 0.08em; line-height: 1.2;
        }
        .print-page h2 {
          font-size: ${h2FontSize}pt; font-weight: 700; color: #1e293b;
          margin: 0.15em 0 0.06em; line-height: 1.25;
        }
        .print-page h3 {
          font-size: ${h3FontSize}pt; font-weight: 700; color: #334155;
          margin: 0.1em 0 0.04em; line-height: 1.3;
        }
        .print-page p { margin: 0.05em 0; font-size: ${bodyFontSize}pt; }
        .print-page ul, .print-page ol {
          padding-left: 1.5em; margin: 0.08em 0;
          font-size: ${bodyFontSize}pt;
        }
        .print-page ul { list-style-type: disc; list-style-position: outside; }
        .print-page ol { list-style-type: decimal; list-style-position: outside; }
        .print-page li { margin: 0.02em 0; display: list-item; }
        .print-page li > p { margin: 0; display: inline; }
      `}</style>

      {/* Banner instrukcji — ukryty podczas drukowania. WAŻNE: user musi sam
          ustawić w dialogu drukowania format = pageSize, marginesy = brak,
          odznaczyć nagłówki/stopki. Chrome nie zawsze respektuje @page CSS. */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 12,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          background: "#1e293b",
          color: "white",
          padding: "16px 24px",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          maxWidth: "90vw",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 6,
              color: "#fde68a",
            }}
          >
            ⚠ W dialogu drukowania ustaw:
          </div>
          <ol
            style={{
              fontSize: 12,
              margin: 0,
              paddingLeft: 18,
              lineHeight: 1.6,
            }}
          >
            <li>
              Drukarka: <b>„Zapisz jako PDF"</b>
            </li>
            <li>
              Rozmiar papieru: <b style={{ color: "#fde68a" }}>{pageSize}</b>{" "}
              <span style={{ color: "#94a3b8" }}>
                ({dims.w}×{dims.h} mm) — koniecznie zmień jeśli widzisz A4
              </span>
            </li>
            <li>
              Marginesy: <b>Brak</b> (rozwiń „Więcej ustawień")
            </li>
            <li>
              Odznacz <b>„Nagłówki i stopki"</b>
            </li>
            <li>
              Skala: <b>100%</b> / Domyślna
            </li>
          </ol>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!ready}
          style={{
            background: "#4f46e5",
            color: "white",
            border: "none",
            padding: "12px 20px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: ready ? "pointer" : "wait",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
          }}
        >
          <Printer size={16} />
          Drukuj
        </button>
      </div>

      {/* STRONA 1: Okładka */}
      <div
        className="print-page"
        style={{
          ...pageStyle,
          ...screenPageStyle,
          padding: "12mm",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {logoImageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoImageUrl}
            alt=""
            style={{
              height: `${logoHeightPt}pt`,
              maxWidth: "75%",
              objectFit: "contain",
              display: "block",
            }}
          />
        )}
        {coverSubtitle && (
          <p
            style={{
              marginTop: 16,
              fontSize: `${bodyFontSize}pt`,
              color: "#475569",
              textAlign: "center",
              maxWidth: "85%",
            }}
          >
            {coverSubtitle}
          </p>
        )}
      </div>

      {/* STRONA 2: Spis treści */}
      <div
        className="print-page"
        style={{
          ...pageStyle,
          ...screenPageStyle,
          padding: "12mm",
        }}
      >
        <h1>Spis treści</h1>
        {tocEntries.length === 0 ? (
          <p style={{ fontStyle: "italic", color: "#94a3b8" }}>(Brak wpisów)</p>
        ) : (
          <div style={{ marginTop: "0.5em" }}>
            {tocEntries.map((e, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginBottom: 4,
                  fontSize: `${bodyFontSize}pt`,
                }}
              >
                <span>{e.text}</span>
                <span
                  style={{
                    flex: 1,
                    borderBottom: "0.3pt dotted #cbd5e1",
                  }}
                />
                <span style={{ color: "#475569" }}>{e.pages}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* STRONY 3+: Body pages */}
      {bodyPages.map((bp, idx) => {
        const physicalPage = idx + 3;
        return (
          <div
            key={bp.id}
            className="print-page"
            style={{
              ...pageStyle,
              ...screenPageStyle,
              padding: 0,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4mm 8mm",
                background: "#fce7f3",
                color: "#9d174d",
                fontSize: `${bodyFontSize}pt`,
                flexShrink: 0,
              }}
            >
              {bp.header.lang && (
                <span
                  style={{
                    fontWeight: 700,
                    letterSpacing: 1,
                    fontSize: `${bodyFontSize * 0.85}pt`,
                  }}
                >
                  {bp.header.lang.toUpperCase()}
                </span>
              )}
              <span style={{ flex: 1, color: "#0f172a" }}>
                {bp.header.title || manualName}
              </span>
              {logoImageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoImageUrl}
                  alt=""
                  style={{
                    height: "8mm",
                    objectFit: "contain",
                  }}
                />
              )}
            </div>
            {/* Content */}
            <div
              style={{
                flex: 1,
                padding: "6mm 12mm",
                overflow: "hidden",
              }}
            >
              {(bp.content?.content ?? []).map(renderNode)}
            </div>
            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3mm 8mm",
                fontSize: `${bodyFontSize * 0.8}pt`,
                color: "#6b7280",
                borderTop: "0.3pt solid #e5e7eb",
                flexShrink: 0,
              }}
            >
              <span>{footerCustom || `${manualName} · ${companyName}`}</span>
              <span>Strona {physicalPage}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
