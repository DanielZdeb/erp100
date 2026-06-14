"use client";

/**
 * Custom TipTap Node — `sectionLayout`.
 *
 * Blokowe sekcje instrukcji z 4 wariantami układu:
 *   - imageOnly  — sam obraz (wycentrowany)
 *   - imageRight — tekst po lewej, obraz po prawej
 *   - imageLeft  — obraz po lewej, tekst po prawej
 *   - textText   — dwie kolumny tekstu (50/50), bez obrazu (CSS columns w
 *                  edytorze, split contentu na pół po paragrafach w PDF)
 *
 * Treść tekstowa to standardowe bloki TipTap (paragrafy, listy, nagłówki),
 * obraz to atrybut node'a (imageSrc). NodeView (React) renderuje toolbar
 * sekcji + obrazek + edytowalny region (NodeViewContent).
 *
 * PDF: w manual-pdf.tsx — View flexDirection: row dla layoutów z obrazem
 * po stronie, View centered dla imageOnly, 2 Views z połową contentu dla textText.
 */

import { useEffect, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  AlignCenter,
  AlignVerticalSpaceAround,
  ArrowLeftRight,
  ImagePlus,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type SectionLayoutKind =
  | "imageOnly"
  | "imageRight"
  | "imageLeft"
  | "textText";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sectionLayout: {
      insertSectionLayout: (
        layout: SectionLayoutKind,
        opts?: { imageSrc?: string | null },
      ) => ReturnType;
    };
  }
}

/**
 * Opcje extension — przekazywane przez wizard manual-editor.tsx.
 * `onPickImage` otwiera ImagePickerDialog z parent state.
 */
export interface SectionLayoutOptions {
  onPickImage: (currentSrc: string | null, setSrc: (url: string) => void) => void;
}

export const SectionLayout = Node.create<SectionLayoutOptions>({
  name: "sectionLayout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  draggable: true,

  addOptions() {
    return {
      onPickImage: () => {},
    };
  },

  addAttributes() {
    return {
      layout: {
        default: "imageRight" as SectionLayoutKind,
        parseHTML: (el) =>
          (el.getAttribute("data-layout") as SectionLayoutKind) ?? "imageRight",
        renderHTML: (attrs) => ({ "data-layout": attrs.layout }),
      },
      imageSrc: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute("data-image-src"),
        renderHTML: (attrs) =>
          attrs.imageSrc ? { "data-image-src": attrs.imageSrc } : {},
      },
      // Pionowe centrowanie sekcji — sekcja zajmuje pełną wysokość pozostałą
      // na stronie i jest pionowo wycentrowana. PDF używa marginTop:auto +
      // marginBottom:auto, edytor min-h + flex justify-center.
      verticalCenter: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-vcenter") === "true",
        renderHTML: (attrs) =>
          attrs.verticalCenter ? { "data-vcenter": "true" } : {},
      },
      // Szerokość kolumny obrazka jako % strony (lub slotu). Default zależy
      // od layoutu: imageOnly=70, imageLeft/Right=40. Zakres 20-100.
      imageWidth: {
        default: null as number | null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-image-width");
          if (!v) return null;
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attrs) =>
          attrs.imageWidth
            ? { "data-image-width": String(attrs.imageWidth) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section-layout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "section-layout" }),
      0,
    ];
  },

  addCommands() {
    return {
      insertSectionLayout:
        (layout, opts) =>
        ({ chain }) => {
          // textText: 2 paragrafy z markerem rozdzielającym kolumny — w editor
          // CSS columns dzieli automatycznie, w PDF splittujemy listę
          // contentu na pół (po paragrafach).
          const defaultContent =
            layout === "textText"
              ? [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Tekst w lewej kolumnie…" },
                    ],
                  },
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "Tekst w prawej kolumnie…" },
                    ],
                  },
                ]
              : [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text:
                          layout === "imageOnly"
                            ? "Opis pod obrazem (opcjonalny)…"
                            : "Wpisz tekst sekcji…",
                      },
                    ],
                  },
                ];
          return chain()
            .focus()
            .insertContent({
              type: "sectionLayout",
              attrs: { layout, imageSrc: opts?.imageSrc ?? null },
              content: defaultContent,
            })
            .run();
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionLayoutNodeView);
  },
});

// ─── React NodeView ─────────────────────────────────────────────────────

function SectionLayoutNodeView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode, extension } = props;
  const layout = (node.attrs.layout as SectionLayoutKind) ?? "imageRight";
  const imageSrc = (node.attrs.imageSrc as string | null) ?? null;
  const verticalCenter = Boolean(node.attrs.verticalCenter);
  const imageWidthAttr = node.attrs.imageWidth as number | null;
  const defaultWidth =
    layout === "imageOnly" ? 70 : layout === "textText" ? 0 : 40;
  const imageWidth = imageWidthAttr ?? defaultWidth;
  const options = extension.options as SectionLayoutOptions;

  // Toolbar renderowany przez Portal do body — żeby uniknąć stacking context
  // issues (header strony, sidebar, fullscreen wrapper itd.). Pozycja śledzona
  // przez bounding rect wrappera + scroll events. Toolbar widoczny tylko gdy
  // hovered/focused.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [toolbarPos, setToolbarPos] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isHovered || !wrapperRef.current) {
      setToolbarPos(null);
      return;
    }
    function updatePos() {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setToolbarPos({
        top: rect.top + window.scrollY - 14, // 14px above section
        left: rect.left + window.scrollX + 8,
      });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [isHovered]);

  function changeLayout(next: SectionLayoutKind) {
    updateAttributes({ layout: next });
  }

  function pickImage() {
    options.onPickImage(imageSrc, (url: string) => {
      updateAttributes({ imageSrc: url });
    });
  }

  function removeImage() {
    updateAttributes({ imageSrc: null });
  }

  return (
    <NodeViewWrapper
      className={cn(
        "section-layout my-3",
        verticalCenter && "min-h-[260px] flex flex-col justify-center",
      )}
      data-layout={layout}
      data-vcenter={verticalCenter ? "true" : undefined}
    >
      {/* Toolbar sekcji — `position: fixed` na całym viewportie z dynamicznie
          obliczaną pozycją (relative do wrappera). Fixed pomija wszystkie
          stacking-context issues (header strony, sidebar itd.) bo jest
          relative-to-viewport, nie do parenta. Z-index globalnie 9999. */}
      <div
        ref={wrapperRef}
        className="group relative ring-1 ring-slate-200 rounded-md bg-white"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {mounted && isHovered && toolbarPos && (
          <div
            style={{
              position: "fixed",
              top: toolbarPos.top - window.scrollY,
              left: toolbarPos.left - window.scrollX,
              zIndex: 9999,
            }}
            className="flex items-center gap-1 bg-white border rounded-md shadow-sm px-1.5 py-0.5"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-1">
            Sekcja:
          </span>
          <button
            type="button"
            onClick={() => changeLayout("imageOnly")}
            className={cn(
              "size-6 rounded grid place-items-center hover:bg-indigo-100",
              layout === "imageOnly" && "bg-indigo-100 text-indigo-700",
            )}
            title="Sam obraz"
          >
            <AlignCenter className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => changeLayout("imageLeft")}
            className={cn(
              "size-6 rounded grid place-items-center hover:bg-indigo-100",
              layout === "imageLeft" && "bg-indigo-100 text-indigo-700",
            )}
            title="Obraz lewa, tekst prawa"
          >
            {/* mała ikona: img|tekst */}
            <span className="flex items-center gap-0.5">
              <span className="block size-2 bg-slate-400 rounded-sm" />
              <span className="block w-2 h-0.5 bg-slate-600 rounded-full" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => changeLayout("imageRight")}
            className={cn(
              "size-6 rounded grid place-items-center hover:bg-indigo-100",
              layout === "imageRight" && "bg-indigo-100 text-indigo-700",
            )}
            title="Tekst lewa, obraz prawa"
          >
            <span className="flex items-center gap-0.5">
              <span className="block w-2 h-0.5 bg-slate-600 rounded-full" />
              <span className="block size-2 bg-slate-400 rounded-sm" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => changeLayout("textText")}
            className={cn(
              "size-6 rounded grid place-items-center hover:bg-indigo-100",
              layout === "textText" && "bg-indigo-100 text-indigo-700",
            )}
            title="Tekst lewa, tekst prawa (dwie kolumny)"
          >
            {/* ikona: |||  ||| (dwie kolumny tekstu) */}
            <span className="flex items-center gap-0.5">
              <span className="block w-1.5 h-0.5 bg-slate-600 rounded-full" />
              <span className="block w-1.5 h-0.5 bg-slate-600 rounded-full" />
            </span>
          </button>
          <div className="w-px h-4 bg-slate-300 mx-0.5" />
          <button
            type="button"
            onClick={pickImage}
            className="px-1.5 py-0.5 text-[10px] rounded hover:bg-indigo-50 text-indigo-700 inline-flex items-center gap-1"
            title="Wybierz / zmień obraz"
          >
            <ImagePlus className="size-3" />
            {imageSrc ? "Zmień" : "Dodaj obraz"}
          </button>
          <div className="w-px h-4 bg-slate-300 mx-0.5" />
          {/* Resize obrazka — kontrolka tylko gdy obrazek jest ustawiony */}
          {imageSrc && (
            <>
              <button
                type="button"
                onClick={() =>
                  updateAttributes({
                    imageWidth: Math.max(20, imageWidth - 10),
                  })
                }
                disabled={imageWidth <= 20}
                className="size-6 rounded grid place-items-center hover:bg-indigo-50 text-slate-600 disabled:opacity-30"
                title="Pomniejsz obraz"
              >
                <Minimize2 className="size-3" />
              </button>
              <span className="text-[10px] text-slate-600 font-semibold tabular-nums w-7 text-center">
                {imageWidth}%
              </span>
              <button
                type="button"
                onClick={() =>
                  updateAttributes({
                    imageWidth: Math.min(100, imageWidth + 10),
                  })
                }
                disabled={imageWidth >= 100}
                className="size-6 rounded grid place-items-center hover:bg-indigo-50 text-slate-600 disabled:opacity-30"
                title="Powiększ obraz"
              >
                <Maximize2 className="size-3" />
              </button>
              <div className="w-px h-4 bg-slate-300 mx-0.5" />
            </>
          )}
          <button
            type="button"
            onClick={() =>
              updateAttributes({ verticalCenter: !verticalCenter })
            }
            className={cn(
              "size-6 rounded grid place-items-center hover:bg-emerald-50",
              verticalCenter ? "bg-emerald-100 text-emerald-700" : "text-slate-600",
            )}
            title="Wyśrodkuj sekcję pionowo na stronie"
          >
            <AlignVerticalSpaceAround className="size-3" />
          </button>
          <div className="w-px h-4 bg-slate-300 mx-0.5" />
          <button
            type="button"
            onClick={() => deleteNode()}
            className="size-6 rounded grid place-items-center hover:bg-rose-100 text-rose-600"
            title="Usuń całą sekcję"
          >
            <Trash2 className="size-3" />
          </button>
          </div>
        )}

        <div
          className={cn(
            "p-3",
            layout === "imageOnly" && "flex flex-col items-center gap-2",
            layout === "imageRight" && "flex gap-3 items-start",
            layout === "imageLeft" && "flex gap-3 items-start flex-row-reverse",
            // textText nie używa flex — tylko grid 2 kolumny przez CSS columns
            // na NodeViewContent (poniżej)
          )}
        >
          {/* Slot obrazka — ukryty dla textText (nie ma obrazu w tym layoucie) */}
          <div
            className={cn(
              "shrink-0",
              layout === "imageOnly" && "mx-auto",
              layout === "textText" && "hidden",
            )}
            style={{ width: `${imageWidth}%` }}
            contentEditable={false}
          >
            {imageSrc ? (
              <button
                type="button"
                onClick={pickImage}
                className="block w-full rounded-md overflow-hidden ring-1 ring-slate-200 hover:ring-indigo-400 group/img relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageSrc}
                  alt=""
                  className="w-full h-auto block max-h-[280px] object-contain bg-slate-50"
                />
                <span className="absolute inset-0 bg-indigo-600/0 group-hover/img:bg-indigo-600/10 transition-colors" />
                {/* Mały przycisk usuwania obrazka */}
                <span
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    removeImage();
                  }}
                  className="absolute top-1 right-1 size-5 rounded-full bg-white/90 grid place-items-center text-rose-600 ring-1 ring-slate-200 opacity-0 group-hover/img:opacity-100 transition-opacity"
                  title="Usuń obraz z sekcji"
                >
                  <ArrowLeftRight className="size-2.5" />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={pickImage}
                className="block w-full aspect-[4/3] rounded-md ring-1 ring-dashed ring-slate-300 bg-slate-50 hover:bg-slate-100 hover:ring-indigo-400 transition-colors flex flex-col items-center justify-center gap-1 text-slate-500"
              >
                <ImagePlus className="size-5" />
                <span className="text-[10px]">Kliknij aby dodać obraz</span>
              </button>
            )}
          </div>

          {/* Slot tekstu — edytowalny przez NodeViewContent.
              Dla `textText` — CSS `column-count: 2` dzieli paragrafy automatycznie
              50/50, separator między kolumnami. Bez drag-resize. */}
          <div
            className={cn(
              "flex-1 min-w-0",
              layout === "imageOnly" && "text-center w-full",
              layout === "textText" && "w-full",
            )}
          >
            <NodeViewContent
              className={cn(
                "prose prose-sm max-w-none focus:outline-none",
                layout === "textText" &&
                  "[column-count:2] [column-gap:1.5rem] [column-rule:1px_solid_#e2e8f0]",
              )}
            />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}
