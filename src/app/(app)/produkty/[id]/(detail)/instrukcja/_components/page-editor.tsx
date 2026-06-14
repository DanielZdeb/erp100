"use client";

/**
 * Pojedyncza body strona instrukcji (strona 3+ w PDF) — własny TipTap editor.
 * Strony 1 (okładka) i 2 (spis treści) są wirtualne i renderowane przez
 * CoverPagePreview / TocPagePreview w ManualEditor — NIE przez ten komponent.
 *
 * Komunikacja z parentem:
 *  - `onContentChange(json)` przy każdej edycji (debounce na poziomie parenta)
 *  - `onFocus` — żeby toolbar wiedział który edytor jest aktywny (commands routed
 *    do ostatnio sfokusowanego edytora)
 *  - `onMount(editor)` — daje parentowi referencję na editor instance (do toolbar)
 */

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { TextAlign } from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Image as ImageIcon, Pilcrow, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  SectionLayout,
  type SectionLayoutOptions,
} from "./section-layout-node";
import { PageBreak, Callout } from "./manual-nodes";
import { FontSize } from "./font-size-extension";

/** Profile geometrii strony — synchronizowane 1:1 z PAGE_PROFILES w
 *  `src/lib/manual-pdf.tsx`. Wartości w % page width/height = pt/pageDim_pt.
 *  Dzięki temu edytor preview renderuje content i header/footer w dokładnie
 *  tym samym miejscu co PDF (bez względu na fizyczną wielkość preview w px). */
const EDITOR_PROFILES: Record<
  "A4" | "A5" | "A6",
  {
    paddingTopPct: number;
    paddingBottomPct: number;
    paddingHorizontalPct: number;
    headerTopPct: number;
    footerBottomPct: number;
    /** Realna szerokość strony w px (przy 96 DPI) — używana do obliczenia
     *  scale-factor dla fontów. */
    realWidthPx: number;
  }
> = {
  A4: {
    // A4 = 595×842 pt; PDF profile: paddingTop=80, paddingHorizontal=50
    paddingTopPct: 80 / 842,
    paddingBottomPct: 60 / 842,
    paddingHorizontalPct: 50 / 595,
    headerTopPct: 22 / 842,
    footerBottomPct: 25 / 842,
    realWidthPx: 794, // 210mm × 96/25.4
  },
  A5: {
    // A5 = 420×595 pt; PDF profile: paddingTop=54, paddingHorizontal=32
    paddingTopPct: 54 / 595,
    paddingBottomPct: 38 / 595,
    paddingHorizontalPct: 32 / 420,
    headerTopPct: 16 / 595,
    footerBottomPct: 16 / 595,
    realWidthPx: 559, // 148mm × 96/25.4
  },
  A6: {
    // A6 = 297×420 pt; PDF profile: paddingTop=38, paddingHorizontal=22
    paddingTopPct: 38 / 420,
    paddingBottomPct: 26 / 420,
    paddingHorizontalPct: 22 / 297,
    headerTopPct: 12 / 420,
    footerBottomPct: 12 / 420,
    realWidthPx: 397, // 105mm × 96/25.4
  },
};

export interface PageEditorProps {
  pageId: string;
  /** Fizyczny numer strony w PDF (3+, bo strony 1-2 są wirtualne). */
  pageNumber: number;
  initialContent: object | null;
  isFocused: boolean;
  width: number;
  height: number;
  /** Format strony — używany do profile padding/header/footer position
   *  matching PDF (manual-pdf.tsx PAGE_PROFILES). */
  pageSize: "A4" | "A5" | "A6";
  /** Łączna liczba fizycznych stron — do renderingu „N z TOTAL" w stopce. */
  totalPhysicalPages: number;
  headerLang: string;
  headerTitle: string;
  /** Prawy slot nagłówka — obraz nadpisuje tekst (preview wizualny). */
  headerRightText: string | null;
  headerRightImageUrl: string | null;
  footerCustom: string;
  /** Globalna typografia instrukcji — propagowana z user-set settings. Stosowana
   *  do treści edytora przez inline CSS vars, żeby preview wyglądał jak PDF. */
  fontFamily: string | null;
  bodyFontSize: number | null;
  h1FontSize: number | null;
  h2FontSize: number | null;
  h3FontSize: number | null;
  sectionLayoutOptions: SectionLayoutOptions;
  /** Otwiera image picker. Wywoła callback z URLem gdy user wybierze obraz.
   *  Używane przez floating "+ Dodaj" menu na pustej stronie. */
  onPickImage: (callback: (url: string) => void) => void;
  onContentChange: (json: object) => void;
  onFocus: () => void;
  onMount: (editor: Editor) => void;
}

export function PageEditor({
  pageId,
  pageNumber,
  initialContent,
  isFocused,
  width,
  height,
  pageSize,
  totalPhysicalPages,
  headerLang,
  headerTitle,
  headerRightText,
  headerRightImageUrl,
  footerCustom,
  fontFamily,
  bodyFontSize,
  h1FontSize,
  h2FontSize,
  h3FontSize,
  sectionLayoutOptions,
  onPickImage,
  onContentChange,
  onFocus,
  onMount,
}: PageEditorProps) {
  const profile = EDITOR_PROFILES[pageSize];
  // Scale factor — edytor preview ma fizyczną szerokość `width` px ale
  // reprezentuje stronę o realnej szerokości `profile.realWidthPx`. Fonty
  // (które są w absolutnych pt) trzeba przeskalować, żeby w edytorze tekst
  // zajmował proporcjonalnie tyle samo miejsca co w PDF (1pt → 1pt × scale).
  const scale = width / profile.realWidthPx;
  const scaledBody = bodyFontSize != null ? bodyFontSize * scale : null;
  const scaledH1 = h1FontSize != null ? h1FontSize * scale : null;
  const scaledH2 = h2FontSize != null ? h2FontSize * scale : null;
  const scaledH3 = h3FontSize != null ? h3FontSize * scale : null;
  // Empty state — pokazujemy floating „+ Dodaj" overlay gdy editor jest pusty.
  // Synchronizowane przez onUpdate (TipTap przewiduje editor.isEmpty).
  const [isEmpty, setIsEmpty] = useState(true);

  const editor = useEditor({
    extensions: [
      // StarterKit już zawiera Link — wyłączamy żeby nie było duplikatu
      StarterKit.configure({ link: false }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-md ring-1 ring-slate-200 my-2",
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-indigo-600 underline cursor-pointer" },
      }),
      TextStyle,
      Color,
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
      TextAlign.configure({
        // Heading: zostawiamy left (tytuły i tak są krótkie, justify wygląda
        // dziwnie). Paragraph: domyślnie justify — bardziej profesjonalny
        // look dla instrukcji, układ jak w książce.
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: "justify",
      }),
      PageBreak,
      Callout,
      SectionLayout.configure(sectionLayoutOptions),
      // Tabela — z możliwością przesuwania szerokości kolumn (resizable).
      // HTMLAttributes klasa „manual-table" — styling w globals.css.
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: "manual-table" },
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialContent ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[200px] focus:outline-none px-3 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      setIsEmpty(editor.isEmpty);
      onContentChange(editor.getJSON());
    },
    onFocus: () => onFocus(),
  });

  // Initial sync isEmpty po mount editora
  useEffect(() => {
    if (editor) setIsEmpty(editor.isEmpty);
  }, [editor]);

  // Daj parentowi handle do edytora (do toolbara). Aktualizuj przy każdym remount.
  useEffect(() => {
    if (editor) onMount(editor);
  }, [editor, onMount]);

  // Overflow detection — gdy treść przekracza wysokość strony (format A4/A5/A6),
  // pokazujemy banner sugerujący dodanie nowej strony. ResizeObserver łapie
  // zmiany rozmiaru contentu (typing, wklejanie obrazów).
  const contentBoxRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = contentBoxRef.current;
    if (!el) return;
    const checkOverflow = () => {
      setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    // Również obserwuj wnętrze (ProseMirror) — content grows
    const inner = el.querySelector(".ProseMirror");
    if (inner) observer.observe(inner);
    return () => observer.disconnect();
  }, [editor]);

  if (!editor) {
    return (
      <div
        className="bg-white shadow-md ring-1 ring-slate-300 rounded-sm flex items-center justify-center text-xs text-muted-foreground"
        style={{ width, minHeight: height }}
      >
        Ładuję…
      </div>
    );
  }

  return (
    <div
      data-page-id={pageId}
      className={cn(
        "bg-white shadow-md ring-1 ring-slate-300 rounded-sm relative overflow-hidden transition-all",
        isFocused && "ring-2 ring-indigo-500 shadow-xl",
        overflows && "ring-2 ring-amber-400",
      )}
      style={{ width, height, maxHeight: height }}
    >
      {/* Header — POZYCJONOWANY ABSOLUTNIE 1:1 jak PDF (top: profile.headerTopPct,
          left/right: profile.paddingHorizontalPct). FontSize 9pt × scale żeby
          header w edytorze proporcjonalnie pasował do PDF. */}
      <div
        className="absolute flex items-center gap-2 z-10"
        style={{
          top: `${profile.headerTopPct * 100}%`,
          left: `${profile.paddingHorizontalPct * 100}%`,
          right: `${profile.paddingHorizontalPct * 100}%`,
          paddingBottom: 3 * scale,
          borderBottom: "0.5px solid #e5e7eb",
          color: "#6b7280",
          fontSize: `${(9 * scale).toFixed(2)}pt`,
        }}
      >
        {headerLang && (
          <span
            className="font-bold uppercase tracking-widest text-rose-800 bg-rose-100 rounded"
            style={{
              fontSize: `${(8 * scale).toFixed(2)}pt`,
              padding: `${1 * scale}px ${4 * scale}px`,
            }}
          >
            {headerLang}
          </span>
        )}
        <span className="truncate flex-1" style={{ color: "#0f172a" }}>
          {headerTitle || (
            <span className="italic text-slate-400">(brak tytułu)</span>
          )}
        </span>
        {headerRightImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={headerRightImageUrl}
            alt=""
            className="w-auto object-contain"
            style={{ maxHeight: 18 * scale, maxWidth: 80 * scale }}
          />
        ) : headerRightText ? (
          <span
            className="truncate"
            style={{
              fontSize: `${(9 * scale).toFixed(2)}pt`,
              maxWidth: 80 * scale,
            }}
          >
            {headerRightText}
          </span>
        ) : null}
      </div>

      {/* Treść strony — paddings 1:1 z PDF profile (% obliczone z pt/pageDim_pt).
          Wartości w pt — przeglądarka renderuje 1pt ≈ 1.33px. Tym samym
          mapowaniem PDF rasteryzuje, więc preview wygląda jak PDF. */}
      <div
        ref={contentBoxRef}
        className="manual-prose absolute inset-0 overflow-hidden"
        style={
          {
            paddingTop: `${profile.paddingTopPct * 100}%`,
            paddingBottom: `${profile.paddingBottomPct * 100}%`,
            paddingLeft: `${profile.paddingHorizontalPct * 100}%`,
            paddingRight: `${profile.paddingHorizontalPct * 100}%`,
            fontFamily: fontFamily ?? undefined,
            "--manual-body": scaledBody ? `${scaledBody.toFixed(2)}pt` : undefined,
            "--manual-h1": scaledH1 ? `${scaledH1.toFixed(2)}pt` : undefined,
            "--manual-h2": scaledH2 ? `${scaledH2.toFixed(2)}pt` : undefined,
            "--manual-h3": scaledH3 ? `${scaledH3.toFixed(2)}pt` : undefined,
          } as React.CSSProperties
        }
      >
        <EditorContent editor={editor} />
        {/* Floating "+ Dodaj" — pokazany TYLKO gdy strona pusta. Otwiera menu
            z 4 typami contentu (tekst / obraz / 2 sekcje obraz+tekst). */}
        {editor && isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-md transition-colors"
                      title="Dodaj treść"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <Plus className="size-4" />
                      Dodaj
                    </button>
                  }
                />
                <DropdownMenuContent align="center" className="w-60">
                  <DropdownMenuItem
                    onClick={() => {
                      editor.chain().focus().run();
                    }}
                    className="gap-2"
                  >
                    <span className="size-7 rounded ring-1 ring-slate-300 bg-white grid place-items-center">
                      <Pilcrow className="size-3.5 text-slate-500" />
                    </span>
                    <div>
                      <div className="text-xs font-medium">Tekst</div>
                      <div className="text-[10px] text-muted-foreground">
                        Zacznij pisać
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      // Wstaw obraz jako sekcję „imageOnly" — daje user'owi te
                      // same kontrolki (toolbar, resize wysokością) co inne
                      // section-layouts. Plain `setImage` był bez UI edycji.
                      onPickImage((url) => {
                        editor
                          .chain()
                          .focus()
                          .insertSectionLayout("imageOnly", { imageSrc: url })
                          .run();
                      });
                    }}
                    className="gap-2"
                  >
                    <span className="size-7 rounded ring-1 ring-slate-300 bg-slate-100 grid place-items-center">
                      <ImageIcon className="size-3.5 text-slate-500" />
                    </span>
                    <div>
                      <div className="text-xs font-medium">Obraz</div>
                      <div className="text-[10px] text-muted-foreground">
                        Wstaw zdjęcie / grafikę
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.commands.insertSectionLayout("imageRight")
                    }
                    className="gap-2"
                  >
                    <span className="size-7 rounded ring-1 ring-slate-300 bg-white grid grid-cols-[1fr_1fr] gap-0.5 p-0.5">
                      <span className="flex flex-col gap-0.5 justify-center">
                        <span className="h-0.5 bg-slate-400 rounded-full" />
                        <span className="h-0.5 bg-slate-400 rounded-full" />
                        <span className="h-0.5 bg-slate-400 rounded-full" />
                      </span>
                      <span className="bg-slate-300 rounded-sm" />
                    </span>
                    <div>
                      <div className="text-xs font-medium">
                        Tekst lewa · Obraz prawa
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.commands.insertSectionLayout("imageLeft")
                    }
                    className="gap-2"
                  >
                    <span className="size-7 rounded ring-1 ring-slate-300 bg-white grid grid-cols-[1fr_1fr] gap-0.5 p-0.5">
                      <span className="bg-slate-300 rounded-sm" />
                      <span className="flex flex-col gap-0.5 justify-center">
                        <span className="h-0.5 bg-slate-400 rounded-full" />
                        <span className="h-0.5 bg-slate-400 rounded-full" />
                        <span className="h-0.5 bg-slate-400 rounded-full" />
                      </span>
                    </span>
                    <div>
                      <div className="text-xs font-medium">
                        Obraz lewa · Tekst prawa
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.commands.insertSectionLayout("imageOnly")
                    }
                    className="gap-2"
                  >
                    <span className="size-7 rounded ring-1 ring-slate-300 bg-slate-100 grid place-items-center">
                      <ImageIcon className="size-3.5 text-slate-500" />
                    </span>
                    <div>
                      <div className="text-xs font-medium">
                        Sam obraz + opis
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Wycentrowany obraz + opcjonalny tekst
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      editor.commands.insertSectionLayout("textText")
                    }
                    className="gap-2"
                  >
                    <span className="size-7 rounded ring-1 ring-slate-300 bg-white grid place-items-center">
                      <span className="flex gap-0.5">
                        <span className="block w-1 h-2.5 bg-slate-400 rounded-sm" />
                        <span className="block w-1 h-2.5 bg-slate-400 rounded-sm" />
                      </span>
                    </span>
                    <div>
                      <div className="text-xs font-medium">
                        Tekst lewa · Tekst prawa
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Dwie kolumny tekstu obok siebie (50/50)
                      </div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        {/* Fade-out gradient na dole jako wskazówka że treść wystaje poza format */}
        {overflows && (
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-amber-100/95 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Footer — POZYCJONOWANY ABSOLUTNIE 1:1 jak PDF (bottom: profile.footerBottomPct,
          left/right: profile.paddingHorizontalPct). 3 kolumny: footerCustom |
          „Strona N z TOTAL" | data. FontSize × scale dla proporcjonalności. */}
      <div
        className="absolute flex items-center justify-between gap-2 z-10"
        style={{
          bottom: `${profile.footerBottomPct * 100}%`,
          left: `${profile.paddingHorizontalPct * 100}%`,
          right: `${profile.paddingHorizontalPct * 100}%`,
          paddingTop: 3 * scale,
          borderTop: "0.5px solid #e5e7eb",
          color: "#6b7280",
          fontSize: `${(9 * scale).toFixed(2)}pt`,
        }}
      >
        <span className="truncate flex-1">
          {footerCustom || (
            <span className="italic text-slate-400">(brak stopki)</span>
          )}
        </span>
        <span className="tabular-nums shrink-0">
          {pageNumber} / {totalPhysicalPages}
        </span>
      </div>

      {/* Warning bar — overlay absolute na samym dole (pod stopką), z. */}
      {overflows && (
        <div className="absolute bottom-0 inset-x-0 z-20 border-t border-amber-300 bg-amber-50 px-2 py-1 text-[9px] text-amber-800 font-medium text-center">
          ⚠ Treść przekracza format strony — dodaj nową stronę
        </div>
      )}
    </div>
  );
}
