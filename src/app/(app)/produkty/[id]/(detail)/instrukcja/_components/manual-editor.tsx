"use client";

/**
 * Edytor instrukcji obsługi z wieloprzejazdową strukturą "książki":
 *  - Strona 1 sama (jak okładka)
 *  - Potem pary 2-3, 4-5, 6-7… (jak otwarta książka)
 *  - Nawigacja strzałkami między spreadami
 *  - Dodawanie / wstawianie / usuwanie stron z auto-numeracją
 *
 * Każda strona to osobny TipTap editor (PageEditor). Toolbar dispatchuje
 * komendy do ostatnio sfokusowanego edytora (activeEditorRef).
 *
 * Stan zapisu: `productManualJson` to `{ pages: [{ id, content }] }`.
 * Header (lang + title) i footer (custom text) są wspólne dla całej instrukcji.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  BookOpen,
  Bold,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FilePlus2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Layout,
  List,
  ListOrdered,
  Lightbulb,
  Minus,
  Palette,
  Pilcrow,
  Plus,
  Printer,
  Scissors,
  CheckCircle2,
  Columns3,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  Rows3,
  Table as TableIcon,
  Trash2,
  Type,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type {
  ManualPageSizeT,
  ManualTemplateT,
} from "@/server/product-manual";
import {
  type HeaderRange,
  generateToc,
  renumberHeaderRanges,
  resolveHeaderForPage,
} from "@/lib/manual-document";
import {
  FONT_SIZES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  MANUAL_FONTS,
} from "@/lib/manual-fonts";

import { PageEditor } from "./page-editor";

/**
 * Save payload — wspólny dla obu use case (per-product manual + samodzielny
 * ProductManual). Konkretna server action route'owana w `saveAction` prop.
 *
 * UWAGA `manualJson.pages`: zawiera TYLKO body pages (edytowalne, czyli fizyczna
 * strona 3+ w PDF). Strona 1 (okładka „Instrukcja obsługi") i 2 (spis treści)
 * są wirtualne — zawsze renderowane, bez wpisu w `pages`.
 */
export type ManualSavePayload = {
  manualJson: {
    pages: {
      id: string;
      content: object;
      lang?: string;
      autoTranslated?: boolean;
      sourceUpdatedAt?: string;
      /** Timestamp ostatniej edycji TEJ strony — ustawiany przy każdej zmianie
       *  treści. Używany do wykrycia stale translations: tłumaczenia są fresh
       *  gdy `sourceUpdatedAt >= sourcePlPage.contentUpdatedAt`. */
      contentUpdatedAt?: string;
    }[];
    /** Lista aktywnych języków — kontroluje tabsy w edytorze i generację PDF. */
    activeLanguages?: string[];
    /** Treść strony „Wyrównanie" (przedostatnia, gdy liczba body kończy
     *  treść na parzystej stronie). Edytowalna jak zwykła strona, ale sztywna —
     *  nie można jej usunąć, system zarządza jej istnieniem. */
    /** Treść stron Wyrównania per język. Klucz to kod języka (PL/EN/SK/...),
     *  wartość to TipTap doc. Legacy: pojedynczy doc był global PL. */
    alignmentContent?: Record<string, object> | object | null;
  };
  template: ManualTemplateT;
  pageSize: ManualPageSizeT;
  headerLang: string | null;
  headerTitle: string | null;
  headerRanges: HeaderRange[] | null;
  footerCustom: string | null;
  fontFamily: string | null;
  bodyFontSize: number | null;
  h1FontSize: number | null;
  h2FontSize: number | null;
  h3FontSize: number | null;
  logoImageUrl: string | null;
  logoHeightPt: number | null;
  coverSubtitle: string | null;
};

export type ManualStyleSettings = {
  fontFamily: string | null;
  bodyFontSize: number | null;
  h1FontSize: number | null;
  h2FontSize: number | null;
  h3FontSize: number | null;
  logoImageUrl: string | null;
  logoHeightPt: number | null;
  coverSubtitle: string | null;
};

// ─── Page size & color palette ──────────────────────────────────────────

const PAGE_SIZE_MM: Record<ManualPageSizeT, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  A6: { w: 105, h: 148 },
};
const PAGE_SIZE_LABEL: Record<ManualPageSizeT, string> = {
  A4: "A4 (210×297)",
  A5: "A5 (148×210)",
  A6: "A6 (105×148)",
};

const COLOR_SWATCHES: { label: string; value: string }[] = [
  { label: "Domyślny", value: "" },
  { label: "Czarny", value: "#0f172a" },
  { label: "Szary", value: "#64748b" },
  { label: "Czerwony", value: "#dc2626" },
  { label: "Pomarańczowy", value: "#ea580c" },
  { label: "Żółty", value: "#ca8a04" },
  { label: "Zielony", value: "#16a34a" },
  { label: "Niebieski", value: "#2563eb" },
  { label: "Fioletowy", value: "#9333ea" },
  { label: "Różowy", value: "#db2777" },
];

// LocalStorage key dla zapisanych własnych kolorów (per browser, niezależnie
// od konkretnej instrukcji — paleta osobista użytkownika).
const CUSTOM_COLORS_LS_KEY = "manual-custom-colors";
const MAX_CUSTOM_COLORS = 12;

/** Normalizuj HEX — zwróć "#RRGGBB" (lowercase) lub null gdy invalid. */
function normalizeHex(raw: string): string | null {
  let s = raw.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) {
    // Skróć #abc → #aabbcc
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return `#${s}`;
}

function loadCustomColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_COLORS_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => normalizeHex(v))
      .filter((v): v is string => v !== null)
      .slice(0, MAX_CUSTOM_COLORS);
  } catch {
    return [];
  }
}

function saveCustomColors(colors: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CUSTOM_COLORS_LS_KEY,
      JSON.stringify(colors.slice(0, MAX_CUSTOM_COLORS)),
    );
  } catch {
    // Quota exceeded etc. — silent
  }
}

// ─── Page state types ──────────────────────────────────────────────────

type PageState = {
  id: string;
  content: object;
  /** Język tej strony. PDF generuje sekwencyjnie wg pages[] order — pages tego
   *  samego języka są grupowane (PL→EN→SK→...). Default "PL". */
  lang?: ManualLanguageT;
  /** Czy treść była wygenerowana auto przez Claude API — badge w UI. */
  autoTranslated?: boolean;
  /** Timestamp utworzenia tłumaczenia — fresh gdy `sourceUpdatedAt >=
   *  sourcePl.contentUpdatedAt`. Pusty dla PL pages. */
  sourceUpdatedAt?: string;
  /** Timestamp ostatniej edycji TEJ strony — bump przy każdym onContentChange.
   *  Dla PL pages służy jako „baseline" dla tłumaczeń. */
  contentUpdatedAt?: string;
};

/** Typ języka manualnego — importowany z lib żeby uniknąć duplikacji. */
type ManualLanguageT =
  | "PL"
  | "EN"
  | "DE"
  | "UA"
  | "HU"
  | "SK"
  | "CS"
  | "RO"
  | "BG";
// Sztywny kanoniczny porządek — używany do sortowania tabsów i pages[].
// User nie może go zmienić (drag-and-drop reorderowania jest wyłączone).
const MANUAL_LANGUAGES_LOCAL: ManualLanguageT[] = [
  "PL",
  "EN",
  "DE",
  "UA",
  "HU",
  "SK",
  "CS",
  "RO",
  "BG",
];
const MANUAL_LANGUAGE_LABELS_LOCAL: Record<ManualLanguageT, string> = {
  PL: "Polski",
  EN: "English",
  DE: "Deutsch",
  UA: "Українська",
  HU: "Magyar",
  SK: "Slovenský",
  CS: "Čeština",
  RO: "Română",
  BG: "Български",
};
/** Sortuje listę języków wg kanonicznego porządku. */
function sortLangsCanonical(langs: ManualLanguageT[]): ManualLanguageT[] {
  return [...langs].sort(
    (a, b) =>
      MANUAL_LANGUAGES_LOCAL.indexOf(a) - MANUAL_LANGUAGES_LOCAL.indexOf(b),
  );
}
function isManualLanguageLocal(s: unknown): s is ManualLanguageT {
  return typeof s === "string" && (MANUAL_LANGUAGES_LOCAL as string[]).includes(s);
}

/** Wyciągnij nagłówki H1/H2 z dokumentu strony (TipTap JSON). Używane do TOC. */
function extractPageHeadings(content: object): { level: 1 | 2; text: string }[] {
  const out: { level: 1 | 2; text: string }[] = [];
  const walk = (nodes: unknown[]) => {
    for (const n of nodes) {
      if (!n || typeof n !== "object") continue;
      const node = n as Record<string, unknown>;
      if (node.type === "heading") {
        const lvl = Number((node.attrs as Record<string, unknown>)?.level ?? 0);
        if (lvl === 1 || lvl === 2) {
          const text = ((node.content as unknown[]) ?? [])
            .filter(
              (c) =>
                c &&
                typeof c === "object" &&
                (c as Record<string, unknown>).type === "text",
            )
            .map((c) => String((c as Record<string, unknown>).text ?? ""))
            .join("");
          if (text.trim()) out.push({ level: lvl as 1 | 2, text });
        }
      }
      if (Array.isArray(node.content)) walk(node.content);
    }
  };
  if (Array.isArray((content as Record<string, unknown>).content)) {
    walk((content as Record<string, unknown>).content as unknown[]);
  }
  return out;
}

function makeEmptyPage(lang: ManualLanguageT = "PL"): PageState {
  // Naprawdę pusta strona — pusty paragraf żeby ProseMirror miał gdzie postawić
  // caret. Editor.isEmpty zwraca true → PageEditor pokazuje overlay „+ Dodaj"
  // z menu (Tekst / Obraz / Obraz lewa+Tekst prawa / Tekst lewa+Obraz prawa /
  // Sam obraz). Brak placeholderowego tekstu — żeby nie trzeba było go kasować.
  return {
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lang,
    content: {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
  };
}

/** Inicjalizuj z istniejącego JSON-a (nowy lub stary format). */
function initPages(initialDoc: object | null): PageState[] {
  if (!initialDoc || typeof initialDoc !== "object")
    return [makeEmptyPage()];
  const obj = initialDoc as Record<string, unknown>;
  if (Array.isArray(obj.pages)) {
    const out: PageState[] = [];
    for (let i = 0; i < (obj.pages as unknown[]).length; i++) {
      const p = (obj.pages as unknown[])[i];
      if (p && typeof p === "object") {
        const pp = p as Record<string, unknown>;
        const page: PageState = {
          id: typeof pp.id === "string" ? pp.id : `p-${i}`,
          content:
            pp.content && typeof pp.content === "object"
              ? (pp.content as object)
              : { type: "doc", content: [] },
        };
        if (isManualLanguageLocal(pp.lang)) page.lang = pp.lang;
        if (typeof pp.autoTranslated === "boolean")
          page.autoTranslated = pp.autoTranslated;
        if (typeof pp.sourceUpdatedAt === "string")
          page.sourceUpdatedAt = pp.sourceUpdatedAt;
        if (typeof pp.contentUpdatedAt === "string")
          page.contentUpdatedAt = pp.contentUpdatedAt;
        out.push(page);
      }
    }
    return out.length > 0
      ? sortPagesByCanonical(out)
      : [makeEmptyPage()];
  }
  if (obj.type === "doc") {
    return [{ id: "p-legacy-0", lang: "PL", content: obj }];
  }
  return [makeEmptyPage()];
}

/** Sortuje strony wg lang w kanonicznym porządku MANUAL_LANGUAGES_LOCAL.
 *  Strony tego samego języka zachowują względną kolejność (stable sort).
 *  Krytyczne dla sectionOffset w PDF — fizyczna kolejność stron musi
 *  pokrywać się z activeLanguages żeby headerRanges trafiały w odpowiednie
 *  strony fizyczne. */
function sortPagesByCanonical(pages: PageState[]): PageState[] {
  return [...pages].sort((a, b) => {
    const ai = MANUAL_LANGUAGES_LOCAL.indexOf((a.lang ?? "PL") as ManualLanguageT);
    const bi = MANUAL_LANGUAGES_LOCAL.indexOf((b.lang ?? "PL") as ManualLanguageT);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/** Inicjalizuj listę aktywnych języków z JSON-a — fallback do unique
 *  zbioru `page.lang` lub ["PL"]. Lista zawsze sortowana wg kanonicznego porządku. */
function initActiveLanguages(
  initialDoc: object | null,
  pages: PageState[],
): ManualLanguageT[] {
  if (initialDoc && typeof initialDoc === "object") {
    const obj = initialDoc as Record<string, unknown>;
    if (Array.isArray(obj.activeLanguages)) {
      const langs = (obj.activeLanguages as unknown[]).filter(
        isManualLanguageLocal,
      );
      if (langs.length > 0) return sortLangsCanonical(langs);
    }
  }
  const fromPages = Array.from(
    new Set(pages.map((p) => p.lang).filter(isManualLanguageLocal)),
  );
  return sortLangsCanonical(fromPages.length > 0 ? fromPages : ["PL"]);
}

// ─── Spread logic ──────────────────────────────────────────────────────
//
// Model: strona 1 = okładka (virtual), strona 2 = spis treści (virtual),
//        strony 3+ = body (edytowalne, pages[i] => fizyczna strona i+3).
//
// Układ spreadów jak w książce:
//   spread 0 = [cover]                  (sama okładka)
//   spread 1 = [toc, body[0]]           (TOC z pierwszym body)
//   spread 2 = [body[1], body[2]]       (kolejne pary body)
//   spread n+1 = [body[2n-1], body[2n]] (dla n>=1)

/** Każdy slot wie do którego języka (sekcji) należy — bo każdy język teraz
 *  ma swoją okładkę, TOC, body pages i Ostatnią (jak osobna mini-instrukcja). */
export type SpreadSlot =
  | { kind: "cover"; lang: ManualLanguageT }
  | { kind: "toc"; lang: ManualLanguageT }
  | { kind: "body"; bodyIdx: number; lang: ManualLanguageT }
  | { kind: "blankPad"; lang: ManualLanguageT }
  | { kind: "blankFinal"; lang: ManualLanguageT };

/** Ile dodatkowych stron na końcu sekcji — 1 lub 2 — żeby Ostatnia była
 *  parzysta WZGLĘDEM SEKCJI (lokalnie). Treść lokalna kończy na (2 + bodyCount)
 *  bo cover=1, TOC=2, body od 3. */
function extraBlankCount(bodyCount: number): 1 | 2 {
  const lastContentPage = 2 + bodyCount;
  return lastContentPage % 2 === 0 ? 2 : 1;
}

/** Sekcja językowa = osobna mini-instrukcja w ramach PDF.
 *  - `bodyIndices`: indeksy w globalnym `pages[]` należące do tego języka
 *  - `startSpread`/`endSpread`: zakres spread'ów dla tej sekcji (kolejność jak
 *    w `activeLanguages`) */
export type LangSection = {
  lang: ManualLanguageT;
  bodyIndices: number[];
  startSpread: number;
  endSpread: number;
};

export type ManualKindT = "STANDARD" | "LEAFLET";

function computeLangSections(
  pages: PageState[],
  activeLanguages: ManualLanguageT[],
  kind: ManualKindT = "STANDARD",
): LangSection[] {
  const sections: LangSection[] = [];
  let cursor = 0;
  for (const lang of activeLanguages) {
    const bodyIndices: number[] = [];
    for (let i = 0; i < pages.length; i++) {
      if ((pages[i].lang ?? "PL") === lang) bodyIndices.push(i);
    }
    const bodyCount = bodyIndices.length;
    let spreadsCount: number;
    if (kind === "LEAFLET") {
      // LEAFLET: pierwsza sekcja ma cover + 1 body, kolejne tylko body.
      // bodyCount > 1 nie istnieje w LEAFLET, ale obsługujemy degradację.
      const isFirst = sections.length === 0;
      const headSpread = isFirst ? 1 : 0; // cover tylko w 1. sekcji
      spreadsCount = headSpread + bodyCount; // bez TOC, bez Wyrównania, bez Ostatniej
    } else {
      // STANDARD: 1 cover + 1 (TOC + body[0]) + parePairs + 1 final
      const bodyPairsCount =
        bodyCount <= 1 ? 0 : Math.ceil((bodyCount - 1) / 2);
      spreadsCount = 2 + bodyPairsCount + 1;
    }
    sections.push({
      lang,
      bodyIndices,
      startSpread: cursor,
      endSpread: cursor + spreadsCount,
    });
    cursor += spreadsCount;
  }
  return sections;
}

/** Główny lookup spread'a → sloty, biorąc pod uwagę sekcje językowe.
 *  Każdy spread należy do jednej sekcji języka i ma lokalne sloty
 *  (cover/TOC/body/blankFinal) w obrębie tej sekcji. */
function spreadToSlots(
  spreadIdx: number,
  sections: LangSection[],
  kind: ManualKindT = "STANDARD",
): SpreadSlot[] {
  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    if (spreadIdx < sec.startSpread || spreadIdx >= sec.endSpread) continue;
    const localIdx = spreadIdx - sec.startSpread;
    const bodyCount = sec.bodyIndices.length;

    if (kind === "LEAFLET") {
      // LEAFLET: cover tylko w 1. sekcji na localIdx=0; reszta to czyste body.
      // Bez TOC, bez blankPad, bez blankFinal.
      const isFirst = s === 0;
      if (isFirst && localIdx === 0) {
        return [{ kind: "cover", lang: sec.lang }];
      }
      const bodyOffset = isFirst ? 1 : 0;
      const bIdx = localIdx - bodyOffset;
      if (bIdx >= 0 && bIdx < bodyCount) {
        return [
          { kind: "body", bodyIdx: sec.bodyIndices[bIdx], lang: sec.lang },
        ];
      }
      return [];
    }

    // STANDARD — istniejąca logika
    const lastContentEven = (2 + bodyCount) % 2 === 0;
    const localFinalIdx = sec.endSpread - sec.startSpread - 1;

    if (localIdx === 0) return [{ kind: "cover", lang: sec.lang }];
    if (localIdx === localFinalIdx) {
      return [{ kind: "blankFinal", lang: sec.lang }];
    }
    if (localIdx === 1) {
      const slots: SpreadSlot[] = [{ kind: "toc", lang: sec.lang }];
      if (bodyCount >= 1) {
        slots.push({
          kind: "body",
          bodyIdx: sec.bodyIndices[0],
          lang: sec.lang,
        });
      } else if (lastContentEven) {
        slots.push({ kind: "blankPad", lang: sec.lang });
      }
      return slots;
    }
    const left = 2 * (localIdx - 1) - 1;
    const right = 2 * (localIdx - 1);
    const out: SpreadSlot[] = [];
    if (left < bodyCount) {
      out.push({
        kind: "body",
        bodyIdx: sec.bodyIndices[left],
        lang: sec.lang,
      });
    }
    if (right < bodyCount) {
      out.push({
        kind: "body",
        bodyIdx: sec.bodyIndices[right],
        lang: sec.lang,
      });
    } else if (left === bodyCount - 1 && lastContentEven) {
      out.push({ kind: "blankPad", lang: sec.lang });
    }
    return out;
  }
  return [];
}

/** Suma wszystkich spread'ów we wszystkich sekcjach językowych. */
function totalSpreads(sections: LangSection[]): number {
  return sections.length === 0 ? 0 : sections[sections.length - 1].endSpread;
}

/** Fizyczny numer strony w PDF (1-indexed) dla danego slotu — kontynuowane
 *  przez wszystkie sekcje (PL: 1..N, EN: N+1..M, SK: M+1..). */
function slotPhysicalPageNumber(
  slot: SpreadSlot,
  sections: LangSection[],
  kind: ManualKindT = "STANDARD",
): number {
  if (kind === "LEAFLET") {
    // LEAFLET: 1 cover (sec 0) + body[0] sec 0 = strona 2, body sec 1 = strona 3, ...
    if (slot.kind === "cover") return 1;
    if (slot.kind === "body") {
      // Globalna pozycja body w całym dokumencie + 1 (cover) + 1 (1-indexed).
      let countBefore = 0;
      for (const sec of sections) {
        const localIdx = sec.bodyIndices.indexOf(slot.bodyIdx);
        if (localIdx >= 0) return 1 + countBefore + localIdx + 1;
        countBefore += sec.bodyIndices.length;
      }
    }
    return 1;
  }
  // STANDARD — istniejąca logika
  let offset = 0;
  for (const sec of sections) {
    if (sec.lang === slot.lang) {
      const bodyCount = sec.bodyIndices.length;
      if (slot.kind === "cover") return offset + 1;
      if (slot.kind === "toc") return offset + 2;
      if (slot.kind === "body") {
        const localBodyIdx = sec.bodyIndices.indexOf(slot.bodyIdx);
        return offset + 3 + localBodyIdx;
      }
      if (slot.kind === "blankPad") return offset + bodyCount + 3;
      return offset + 2 + bodyCount + extraBlankCount(bodyCount);
    }
    const bodyCount = sec.bodyIndices.length;
    offset += 2 + bodyCount + extraBlankCount(bodyCount);
  }
  return offset + 1;
}

// ─── Image picker ──────────────────────────────────────────────────────

function ImagePickerDialog({
  uploadImageAction,
  productImages,
  open,
  onClose,
  onInsert,
}: {
  uploadImageAction: (formData: FormData) => Promise<string>;
  productImages: { id: string; url: string; alt: string | null }[];
  open: boolean;
  onClose: () => void;
  onInsert: (url: string) => void;
}) {
  const [tab, setTab] = useState<"library" | "upload">(
    productImages.length > 0 ? "library" : "upload",
  );
  const [uploading, startUpload] = useTransition();

  function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast.error("Wybierz plik graficzny (JPG/PNG/WEBP)");
      return;
    }
    startUpload(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const url = await uploadImageAction(fd);
        if (!url || typeof url !== "string") {
          console.error("uploadImageAction returned unexpected:", url);
          toast.error("Upload się powiódł, ale nie ma URL — sprawdź konsolę");
          return;
        }
        onInsert(url);
        onClose();
        toast.success("Wgrano i wstawiono");
      } catch (e) {
        console.error("Image upload error:", e);
        toast.error(
          e instanceof Error
            ? `Upload nie udał się: ${e.message}`
            : "Upload nie udał się — sprawdź konsolę przeglądarki",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wstaw obrazek</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 border-b mb-3">
          <button
            type="button"
            onClick={() => setTab("library")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px",
              tab === "library"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <FileImage className="size-3.5 inline mr-1.5" />
            Z grafik produktu ({productImages.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={cn(
              "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px",
              tab === "upload"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <ImageIcon className="size-3.5 inline mr-1.5" />
            Wgraj nowy
          </button>
        </div>

        {tab === "library" && (
          <>
            {productImages.length === 0 ? (
              <div className="text-sm text-muted-foreground italic p-6 text-center">
                Brak zdjęć produktu. Wgraj nowy w zakładce „Wgraj nowy".
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {productImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => {
                      onInsert(img.url);
                      onClose();
                    }}
                    className="relative aspect-square rounded-md overflow-hidden ring-1 ring-slate-200 hover:ring-2 hover:ring-indigo-500 group"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt ?? ""}
                      className="size-full object-cover"
                    />
                    <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/20 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "upload" && (
          <div className="space-y-3">
            <Label className="text-sm">Plik graficzny</Label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files)}
              disabled={uploading}
              className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
            />
            {uploading && <p className="text-xs text-indigo-600">Wgrywam…</p>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Anuluj
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Toolbar button ────────────────────────────────────────────────────

function ToolbarButton({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "size-8 rounded grid place-items-center transition-colors text-sm",
        active
          ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300"
          : "text-slate-600 hover:bg-slate-100",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}

// ─── Main editor ────────────────────────────────────────────────────────

export function ManualEditor({
  saveAction,
  uploadImageAction,
  translateAction,
  pdfUrl,
  printUrl,
  initialDoc,
  initialTemplate,
  initialPageSize,
  initialHeaderLang,
  initialHeaderTitle,
  initialHeaderRanges,
  initialFooterCustom,
  initialStyle,
  initialKind = "STANDARD",
  companyWebsiteUrl,
  productImages,
}: {
  saveAction: (payload: ManualSavePayload) => Promise<void>;
  uploadImageAction: (formData: FormData) => Promise<string>;
  /** Auto-tłumaczenie sekcji językowej. Optional — gdy null, przyciski
   *  „Przetłumacz z PL" nie pokazują się (np. wersja bez Claude API). */
  translateAction?: (
    fromLang: string,
    toLang: string,
  ) => Promise<{ ok: true; translatedCount: number }>;
  pdfUrl: string;
  /** URL print view (przeglądarka renderuje HTML → PDF). Pixel-perfect zgodny
   *  z edytorem bo używa tego samego silnika renderowania (Chrome). */
  printUrl: string;
  initialDoc: object | null;
  initialTemplate: ManualTemplateT;
  initialPageSize: ManualPageSizeT;
  initialHeaderLang: string | null;
  initialHeaderTitle: string | null;
  initialHeaderRanges: HeaderRange[];
  initialFooterCustom: string | null;
  initialStyle: ManualStyleSettings;
  /** Typ instrukcji — STANDARD lub LEAFLET (1-stronna ulotka). Zmienia układ
   *  spreadów (LEAFLET = cover + 1 body per język, bez TOC/Wyrów./Ostatniej). */
  initialKind?: ManualKindT;
  /** Adres www firmy — wycentrowany na ostatniej stronie (i w PDF, i w podglądzie). */
  companyWebsiteUrl?: string | null;
  productImages: { id: string; url: string; alt: string | null }[];
}) {
  // `pages` — body pages (edytowalne, strony 3+ w PDF). Cover i TOC są
  // wirtualne, nie są w tej tablicy.
  const [pages, setPages] = useState<PageState[]>(() => initPages(initialDoc));
  // Lista aktywnych języków — kontroluje tabsy + generację PDF.
  // Default ["PL"] dla wstecznej kompatybilności.
  const [activeLanguages, setActiveLanguages] = useState<ManualLanguageT[]>(
    () => initActiveLanguages(initialDoc, initPages(initialDoc)),
  );
  // Treść strony „Wyrównanie" (sztywna, edytowalna, między ostatnią body
  // a Ostatnią). Renderowana tylko gdy extraBlankCount(pages.length) === 2.
  // Treść stron „Wyrównanie" per język — osobny doc dla PL, EN, SK, ... .
  // Backwards-compat: legacy schema miało jedno `alignmentContent` (globalne),
  // które traktujemy jako PL.
  const [alignmentContent, setAlignmentContent] = useState<
    Record<string, object>
  >(() => {
    const emptyDoc = (): object => ({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
    if (initialDoc && typeof initialDoc === "object") {
      const obj = initialDoc as Record<string, unknown>;
      const raw = obj.alignmentContent;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const rawObj = raw as Record<string, unknown>;
        // Nowy format: { PL: doc, EN: doc, ... } — wykrywany po obecności
        // klucza `type === "doc"` LUB po obecności znanych langów na top level.
        const isLegacyDoc = rawObj.type === "doc";
        if (isLegacyDoc) {
          return { PL: raw as object };
        }
        const out: Record<string, object> = {};
        for (const [k, v] of Object.entries(rawObj)) {
          if (v && typeof v === "object" && !Array.isArray(v)) {
            out[k] = v as object;
          }
        }
        return out;
      }
    }
    return { PL: emptyDoc() };
  });
  const [spreadIdx, setSpreadIdx] = useState(0);
  // focusedSlotKey identyfikuje aktywny slot przez stable key: "cover"|"toc"|"body:<bodyIdx>".
  // Toolbar dispatchuje tylko gdy fokus na body slocie.
  const [focusedPageIdx, setFocusedPageIdx] = useState<number | null>(null);
  // Focus na stronie „Wyrównanie" — osobny stan bo to nie jest część pages[],
  // tylko sztywny slot generowany dynamicznie. Gdy true, activeEditor zwraca
  // edytor zarejestrowany pod kluczem „alignment" → toolbar styli działa.
  // Lang strony Wyrównanie obecnie sfokusowanej (np. "PL", "EN") albo null
  // gdy żadna nie jest sfokusowana. Per-lang bo alignmentContent to teraz
  // Record<lang, content> i każdy język ma osobny editor zarejestrowany pod
  // kluczem `alignment-${lang}`.
  const [alignmentFocused, setAlignmentFocused] = useState<string | null>(
    null,
  );
  const [template, setTemplate] = useState<ManualTemplateT>(initialTemplate);
  const [pageSize, setPageSize] = useState<ManualPageSizeT>(initialPageSize);
  // Legacy lang/title trzymane tylko jako readback z DB — UI zawsze pracuje
  // na zakresach. Zachowujemy state żeby przy zapisie wysłać null (kasuje legacy
  // w DB) gdy user zaczyna pracować z zakresami.
  const [headerLang] = useState(initialHeaderLang ?? "");
  const [headerTitle] = useState(initialHeaderTitle ?? "");
  // Tablica zakresów nagłówków. Inicjalizujemy z DB; jeśli były tylko legacy
  // lang/title, konwertujemy na pojedynczy zakres 1-999 (= cała instrukcja).
  const [headerRanges, setHeaderRanges] = useState<HeaderRange[]>(() => {
    if (initialHeaderRanges.length > 0) return initialHeaderRanges;
    if (initialHeaderLang || initialHeaderTitle) {
      return [
        {
          id: `hr-init-${Date.now()}`,
          fromPage: 1,
          toPage: 999,
          lang: initialHeaderLang,
          title: initialHeaderTitle,
          rightText: null,
          rightImageUrl: null,
        },
      ];
    }
    return [];
  });
  const [footerCustom, setFooterCustom] = useState(initialFooterCustom ?? "");

  // ── Auto-fix legacy headerRanges po przeporządkowaniu języków ────────
  // Po wprowadzeniu kanonicznego porządku (PL,EN,DE,UA,HU,SK,CS,RO,BG)
  // stare instrukcje mogą mieć headerRanges z fromPage/toPage liczonymi
  // wg starego porządku. Przeliczamy raz po mount i markDirty żeby zapis
  // utrwalił poprawne offsety.
  useEffect(() => {
    if (headerRanges.length === 0) return;
    const fixed = renumberHeaderRanges(
      pages,
      activeLanguages,
      headerRanges,
      initialKind,
    );
    const changed = fixed.some(
      (r, i) =>
        r.fromPage !== headerRanges[i].fromPage ||
        r.toPage !== headerRanges[i].toPage,
    );
    if (changed) {
      setHeaderRanges(fixed);
      markDirty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sztywne ustawienia typograficzne — propagowane do editor preview + PDF
  const [style, setStyle] = useState<ManualStyleSettings>(initialStyle);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [saving, startSave] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Tryb pełnoekranowy edytora — wrapper position:fixed top:0 left:0, pełen
  // viewport, z-index nad sidebarem. ESC wychodzi z trybu (listener globalny).
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    function onEsc(ev: KeyboardEvent) {
      if (ev.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [fullscreen]);

  // Skróty klawiaturowe ← / → do nawigacji między spreadami.
  // Pomijamy gdy user pisze w polu (input/textarea/contenteditable),
  // żeby nie kradnąć focusa edytora TipTap.
  useEffect(() => {
    function onArrow(ev: KeyboardEvent) {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (ev.key === "ArrowLeft") {
        setSpreadIdx((s) => Math.max(0, s - 1));
      } else {
        setSpreadIdx((s) => s + 1); // clamp robi się w renderze poniżej
      }
    }
    window.addEventListener("keydown", onArrow);
    return () => window.removeEventListener("keydown", onArrow);
  }, []);
  const [previewKey, setPreviewKey] = useState(0);
  // Autosave timestamp — pokazywany jako "Zapisano X sek temu"
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  // Własne zapisane kolory (paleta osobista w localStorage, niezależnie od
  // tej konkretnej instrukcji — dostępne we wszystkich instrukcjach).
  const [customColors, setCustomColors] = useState<string[]>([]);
  // Hydrate z localStorage po mount (SSR safe).
  useEffect(() => {
    setCustomColors(loadCustomColors());
  }, []);
  // Dodaj kolor do palety osobistej — dedupe, max 12, najnowsze pierwsze.
  const rememberColor = useCallback((hex: string) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    setCustomColors((prev) => {
      const filtered = prev.filter((c) => c !== normalized);
      const next = [normalized, ...filtered].slice(0, MAX_CUSTOM_COLORS);
      saveCustomColors(next);
      return next;
    });
  }, []);
  const removeCustomColor = useCallback((hex: string) => {
    setCustomColors((prev) => {
      const next = prev.filter((c) => c !== hex);
      saveCustomColors(next);
      return next;
    });
  }, []);

  // Mapa id → editor instance (do dispatchu komend toolbar). Aktualizowana
  // przez PageEditor.onMount. Klucze są stabilne — pages[].id się nie zmienia
  // po remount.
  const editorsRef = useRef<Map<string, Editor>>(new Map());
  const imagePickerCallbackRef = useRef<((url: string) => void) | null>(null);
  // Counter bumpowany przy KAŻDYM markDirty(). Save zapisuje wartość w
  // momencie startu, po success czyści dirty TYLKO jeśli counter nie zmienił
  // się w międzyczasie. Naprawia race condition: user uploaduje logo gdy
  // autosave z poprzedniej edycji jest w locie — bez tego counter save by
  // ustawił dirty=false i logo by nie zostało zapisane do następnej edycji.
  const dirtyCounterRef = useRef(0);
  const markDirty = useCallback(() => {
    dirtyCounterRef.current += 1;
    setDirty(true);
  }, []);

  // Aktywny editor — ostatnio sfokusowany. Alignment ma własny stan focus
  // i jest zarejestrowany pod stałym kluczem „alignment".
  const activeEditor = alignmentFocused
    ? editorsRef.current.get(`alignment-${alignmentFocused}`) ?? null
    : focusedPageIdx != null && pages[focusedPageIdx]
      ? editorsRef.current.get(pages[focusedPageIdx].id) ?? null
      : null;

  // Sekcje językowe — każdy język ma osobny zestaw spread'ów (cover, TOC,
  // body pages, Ostatnia). Spread'y są kontynuowane przez wszystkie sekcje
  // wg kolejności activeLanguages.
  const langSections = useMemo(
    () => computeLangSections(pages, activeLanguages, initialKind),
    [pages, activeLanguages, initialKind],
  );
  const visibleSlots = useMemo(
    () => spreadToSlots(spreadIdx, langSections, initialKind),
    [spreadIdx, langSections, initialKind],
  );
  const total = totalSpreads(langSections);

  // Fizyczne strony total — suma po wszystkich sekcjach
  const totalPhysicalPages = useMemo(() => {
    if (initialKind === "LEAFLET") {
      // LEAFLET: 1 cover + N body (po 1 per język)
      let sum = 1;
      for (const sec of langSections) sum += sec.bodyIndices.length;
      return sum;
    }
    let sum = 0;
    for (const sec of langSections) {
      const bodyCount = sec.bodyIndices.length;
      sum += 2 + bodyCount + extraBlankCount(bodyCount);
    }
    return sum;
  }, [langSections, initialKind]);

  // TOC dla strony 2 — generowany z header rangów. Range numery są fizyczne
  // (strona 3+ to body), więc TOC pokaże poprawnie body pages.
  const tocEntries = useMemo(
    () => generateToc(headerRanges, totalPhysicalPages),
    [headerRanges, totalPhysicalPages],
  );

  // ─── Helpery językowe ─────────────────────────────────────────────
  // Licznik stron per język — używany w tabsach (badge z liczbą stron).
  const pageCountByLang = useMemo(() => {
    const m = new Map<ManualLanguageT, number>();
    for (const p of pages) {
      const lang = p.lang ?? "PL";
      m.set(lang, (m.get(lang) ?? 0) + 1);
    }
    return m;
  }, [pages]);

  /**
   * Dla każdego języka != PL: `true` jeśli sekcja jest „fresh" — czyli
   *   (a) ma tyle samo stron co PL (count match), oraz
   *   (b) dla KAŻDEJ pary (plPage[i], foreignPage[i]):
   *       `foreignPage.sourceUpdatedAt >= plPage.contentUpdatedAt`
   *       (lub plPage.contentUpdatedAt brak — stara strona przed wprowadzeniem
   *       trackingu, traktowana jako fresh).
   * PL ma zawsze true (sam siebie nie sprawdza).
   * Używane do zielonego podświetlenia tabsa.
   */
  const langFreshness = useMemo(() => {
    const m = new Map<ManualLanguageT, boolean>();
    const plPages = pages.filter((p) => (p.lang ?? "PL") === "PL");
    m.set("PL", true);
    for (const lang of MANUAL_LANGUAGES_LOCAL) {
      if (lang === "PL") continue;
      const foreignPages = pages.filter((p) => p.lang === lang);
      if (foreignPages.length === 0) {
        m.set(lang, false);
        continue;
      }
      if (foreignPages.length !== plPages.length) {
        m.set(lang, false);
        continue;
      }
      let fresh = true;
      for (let i = 0; i < plPages.length; i++) {
        const pl = plPages[i];
        const fp = foreignPages[i];
        const plTs = pl.contentUpdatedAt;
        const fpTs = fp.sourceUpdatedAt;
        // PL bez timestampu (legacy data) → zakładamy że nie była edytowana
        // po tłumaczeniu — tłumaczenie OK.
        if (!plTs) continue;
        // PL ma timestamp ale tłumaczenie nie — stale.
        if (!fpTs) {
          fresh = false;
          break;
        }
        if (fpTs < plTs) {
          fresh = false;
          break;
        }
      }
      m.set(lang, fresh);
    }
    return m;
  }, [pages]);

  // Aktualnie wyświetlany język — priorytet:
  //   1. Strona z fokusem (focusedPageIdx) — gdy user kliknął na tab/stronę
  //   2. Pierwsza widoczna body page w spread'zie
  //   3. Pierwszy aktywny język (gdy tylko cover/TOC widoczne)
  // Bez priorytetu na focus, klik EN tab gdy spread pokazuje PL+EN zostawia
  // currentLang = "PL" (z pierwszej body) i EN tab pozostaje nie-aktywny mimo
  // że user explicit kliknął EN.
  const currentLang: ManualLanguageT = useMemo(() => {
    if (focusedPageIdx != null && pages[focusedPageIdx]) {
      return pages[focusedPageIdx].lang ?? "PL";
    }
    const firstBody = visibleSlots.find((s) => s.kind === "body");
    if (firstBody && firstBody.kind === "body") {
      return pages[firstBody.bodyIdx]?.lang ?? "PL";
    }
    return activeLanguages[0] ?? "PL";
  }, [focusedPageIdx, visibleSlots, pages, activeLanguages]);

  // Index pierwszej strony danego języka (do skoku spread'em).
  function firstPageIndexOfLang(lang: ManualLanguageT): number {
    for (let i = 0; i < pages.length; i++) {
      const pLang = pages[i].lang ?? "PL";
      if (pLang === lang) return i;
    }
    return -1;
  }

  // Klik na tab języka — skok do TOC+body[0] sekcji tego języka (drugi
  // spread sekcji, bo pierwszy = okładka która jest auto-generowana, na
  // razie nie kierujemy tam użytkownika).
  function jumpToLang(lang: ManualLanguageT) {
    const sec = langSections.find((s) => s.lang === lang);
    if (!sec) return;
    // Spread 1 sekcji = TOC + body[0]. Spread 0 = okładka.
    // Wolimy TOC+body[0] dla edycji — okładka rzadziej edytowana.
    const targetSpread = sec.startSpread + 1;
    setSpreadIdx(targetSpread);
    if (sec.bodyIndices.length > 0) {
      setFocusedPageIdx(sec.bodyIndices[0]);
    }
  }

  // Dodaj nowy język — append 1 pustą stronę z lang=newLang.
  // Lista activeLanguages I pages są zawsze sortowane wg kanonicznego porządku
  // (MANUAL_LANGUAGES_LOCAL). User nie ma kontroli nad kolejnością — przez to
  // sectionOffset w PDF i translate liczy spójnie.
  function addLanguage(lang: ManualLanguageT) {
    if (activeLanguages.includes(lang)) return;
    setActiveLanguages((prev) => sortLangsCanonical([...prev, lang]));
    setPages((prev) => {
      const next = [...prev, makeEmptyPage(lang)];
      return sortPagesByCanonical(next);
    });
    markDirty();
    // Skocz do nowo dodanej strony
    setTimeout(() => jumpToLang(lang), 0);
  }

  // ─── Auto-tłumaczenie ─────────────────────────────────────────────
  // Tylko 1 język może być tłumaczony naraz. `translateState` trzyma cały
  // status pokazywanego overlay'a (loading + nazwa języka + liczba stron,
  // potem „Przetłumaczono" przed reloadem).
  const [translatingLang, setTranslatingLang] = useState<ManualLanguageT | null>(
    null,
  );
  type TranslateState =
    | null
    | { phase: "loading"; toLang: ManualLanguageT; pageCount: number }
    | { phase: "done"; toLang: ManualLanguageT; translatedCount: number };
  const [translateState, setTranslateState] = useState<TranslateState>(null);

  async function translateFromPl(toLang: ManualLanguageT) {
    if (!translateAction) {
      toast.error("Auto-tłumaczenie niedostępne — brak akcji w panelu.");
      return;
    }
    if (toLang === "PL") return;
    const sourcePages = pages.filter((p) => (p.lang ?? "PL") === "PL");
    if (sourcePages.length === 0) {
      toast.error("Brak stron PL do przetłumaczenia.");
      return;
    }
    const existingTarget = pages.filter((p) => p.lang === toLang).length;
    const confirmMsg =
      existingTarget > 0
        ? `Zastąpić ${existingTarget} istniejących stron ${toLang} nowym tłumaczeniem z ${sourcePages.length} stron PL?`
        : `Wygenerować ${sourcePages.length} stron ${toLang} z tłumaczeniem PL?`;
    if (!confirm(confirmMsg)) return;
    if (dirty) {
      await save(true);
    }
    setTranslatingLang(toLang);
    setTranslateState({
      phase: "loading",
      toLang,
      pageCount: sourcePages.length,
    });
    try {
      const result = await translateAction("PL", toLang);
      // Pokaż „Przetłumaczono" przez 1.2s przed reloadem — żeby user
      // zobaczył sukces zanim strona się przeładuje.
      setTranslateState({
        phase: "done",
        toLang,
        translatedCount: result.translatedCount,
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      window.location.reload();
    } catch (e) {
      setTranslateState(null);
      toast.error(
        e instanceof Error ? e.message : "Nie udało się przetłumaczyć",
      );
    } finally {
      setTranslatingLang(null);
    }
  }

  // ─── Reorder tabsów języków (drag-and-drop) ────────────────────
  // Trzymamy index tabu który aktualnie jest „chwycony" — null gdy nic.
  // Po drop'ie reorderujemy activeLanguages I pages (żeby PDF generował
  // sekwencyjnie w nowej kolejności).
  // Reorder języków usunięty — kolejność jest sztywna (MANUAL_LANGUAGES_LOCAL).

  // Usuń język — kasuje wszystkie strony tego języka (z confirm).
  function removeLanguage(lang: ManualLanguageT) {
    if (lang === "PL") {
      toast.error("Język PL jest źródłem — nie można usunąć.");
      return;
    }
    const count = pageCountByLang.get(lang) ?? 0;
    const rangeCount = headerRanges.filter(
      (r) => (r.lang ?? "PL") === lang,
    ).length;
    const extra = rangeCount > 0 ? ` i ${rangeCount} nagłówków` : "";
    const msg =
      count > 0
        ? `Usunąć język ${lang}? Spowoduje to skasowanie ${count} stron${extra}.`
        : `Usunąć język ${lang}${extra}?`;
    if (!confirm(msg)) return;
    setActiveLanguages((prev) => prev.filter((l) => l !== lang));
    setPages((prev) => prev.filter((p) => (p.lang ?? "PL") !== lang));
    // Usuń też wszystkie headerRanges przypisane do tego języka —
    // inaczej zostają jako „orphan" zakresy wskazujące na nieistniejące
    // strony (bo strony zostały skasowane) i blokują sectionOffset.
    setHeaderRanges((prev) => prev.filter((r) => (r.lang ?? "PL") !== lang));
    // Usuń też alignmentContent dla tego języka (jeśli istnieje).
    setAlignmentContent((prev) => {
      if (!(lang in prev)) return prev;
      const next = { ...prev };
      delete next[lang];
      return next;
    });
    markDirty();
    setSpreadIdx(0);
  }

  // Callback otwierający picker dla logo (clickable slot na 1. stronie)
  const pickLogo = useCallback(() => {
    imagePickerCallbackRef.current = (url) => {
      setStyle((s) => ({ ...s, logoImageUrl: url }));
      markDirty();
    };
    setImagePickerOpen(true);
  }, []);

  const removeLogo = useCallback(() => {
    setStyle((s) => ({ ...s, logoImageUrl: null }));
    markDirty();
  }, []);

  // ─── Page operations ───────────────────────────────────────────────

  const updatePageContent = useCallback((idx: number, content: object) => {
    setPages((prev) => {
      const next = [...prev];
      if (next[idx]) {
        // Bump `contentUpdatedAt` przy każdej zmianie — używane do detekcji
        // stale translations w tabsach języków (zielony badge).
        next[idx] = {
          ...next[idx],
          content,
          contentUpdatedAt: new Date().toISOString(),
        };
      }
      return next;
    });
    markDirty();
  }, []);

  const onPageFocus = useCallback((idx: number) => {
    setFocusedPageIdx(idx);
    setAlignmentFocused(null);
  }, []);

  const onPageMount = useCallback((idx: number, editor: Editor) => {
    const page = pages[idx];
    if (!page) return;
    editorsRef.current.set(page.id, editor);
  }, [pages]);

  function addPageAtEnd() {
    // Doklej do końca SEKCJI aktualnego języka — żeby strony tego samego
    // języka były ciągłe w pages[]. Bez tego dodanie strony w sekcji PL gdy
    // istnieje sekcja EN wstawiłoby pustą PL stronę po wszystkich EN.
    const lang = currentLang;
    setPages((prev) => {
      let lastIdxOfLang = -1;
      for (let i = 0; i < prev.length; i++) {
        if ((prev[i].lang ?? "PL") === lang) lastIdxOfLang = i;
      }
      const insertAt =
        lastIdxOfLang >= 0 ? lastIdxOfLang + 1 : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, makeEmptyPage(lang));
      return next;
    });
    markDirty();
    // Skocz do nowo dodanej strony — po micro-tasku, gdy setPages zaaplikowane
    setTimeout(() => jumpToLang(lang), 0);
  }

  function insertPageAt(idx: number) {
    // Język nowo wstawionej strony = język strony POPRZEDNIEJ (poprzedzającej
    // insertAt), inaczej currentLang. Dzięki temu wstawienie wewnątrz sekcji
    // zachowuje grupę językową.
    setPages((prev) => {
      const lang =
        (prev[idx - 1]?.lang ?? prev[idx]?.lang ?? currentLang) as ManualLanguageT;
      const next = [...prev];
      next.splice(idx, 0, makeEmptyPage(lang));
      return next;
    });
    markDirty();
  }

  /** Usuwa stronę body bez confirma — confirm jest po stronie wywołującego
   *  (np. inline w buttonie usuń) żeby uniknąć podwójnego pytania. */
  function deletePageNoConfirm(idx: number) {
    if (pages.length <= 1) {
      toast.error("Nie można usunąć ostatniej strony.");
      return;
    }
    setPages((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next;
    });
    markDirty();
    // Skoryguj spread index gdyby wykraczał poza nowy zakres — używamy
    // aktualnego langSections w setTimeout
    setTimeout(() => {
      setSpreadIdx((s) => {
        // langSections z najnowszego state — wycenia się ponownie po setPages
        const nextSections = computeLangSections(
          pages.filter((_, i) => i !== idx),
          activeLanguages,
          initialKind,
        );
        const max = Math.max(0, totalSpreads(nextSections) - 1);
        return Math.min(s, max);
      });
    }, 0);
  }

  // ─── Save ──────────────────────────────────────────────────────────

  // Save — używane przez autosave (debounced) i manualne triggery (Pobierz PDF,
  // Pokaż podgląd). Zwraca Promise — caller może `await save()` żeby mieć
  // pewność że DB jest aktualne przed kolejnym krokiem (np. otwarciem PDF).
  const save = useCallback(
    (silent: boolean): Promise<void> => {
      const counterAtStart = dirtyCounterRef.current;
      let resolveDone: () => void = () => {};
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });
      // JSON roundtrip — gwarantuje plain object. Bez tego Prisma 7 + Next.js 16
      // RSC może dostać Proxy/non-stringifiable references (TipTap, React state)
      // i wywala błąd "Cannot access toStringTag on the server / temporary
      // client reference". Wadą jest dodatkowy cykl alloc, ale rozmiar payloada
      // jest niewielki (KB), więc OK.
      const rawPayload: ManualSavePayload = {
        manualJson: { pages, activeLanguages, alignmentContent },
        template,
        pageSize,
        headerLang: headerLang || null,
        headerTitle: headerTitle || null,
        headerRanges: headerRanges.length > 0 ? headerRanges : null,
        footerCustom: footerCustom || null,
        fontFamily: style.fontFamily,
        bodyFontSize: style.bodyFontSize,
        h1FontSize: style.h1FontSize,
        h2FontSize: style.h2FontSize,
        h3FontSize: style.h3FontSize,
        logoImageUrl: style.logoImageUrl,
        logoHeightPt: style.logoHeightPt,
        coverSubtitle: style.coverSubtitle,
      };
      const cleanPayload: ManualSavePayload = JSON.parse(
        JSON.stringify(rawPayload),
      );
      startSave(async () => {
        try {
          await saveAction(cleanPayload);
          if (!silent) toast.success("Zapisano");
          // Czyścimy dirty TYLKO jeśli w międzyczasie nikt nie zrobił
          // markDirty(). Inaczej autosave straciłby najnowsze zmiany.
          if (dirtyCounterRef.current === counterAtStart) {
            setDirty(false);
          }
          setLastSaved(new Date());
          // Odśwież PDF preview gdy panel jest otwarty
          if (showPreview) setPreviewKey((k) => k + 1);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
        } finally {
          resolveDone();
        }
      });
      return done;
    },
    [
      pages,
      activeLanguages,
      alignmentContent,
      template,
      pageSize,
      headerLang,
      headerTitle,
      headerRanges,
      footerCustom,
      style,
      saveAction,
      showPreview,
    ],
  );

  // Autosave — debounce 1500ms od ostatniej zmiany.
  useEffect(() => {
    if (!dirty) return;
    const handle = setTimeout(() => save(true), 1500);
    return () => clearTimeout(handle);
  }, [dirty, save]);

  async function downloadPdf() {
    // Jeśli są niezapisane zmiany, czekamy na zapis ZANIM otworzymy PDF.
    // Bez tego user dostałby PDF starej wersji (DB nie miałby najnowszych edycji).
    // Cache-bust query — bez tego Chrome cache'uje poprzedni PDF.
    if (dirty) await save(false);
    window.open(`${pdfUrl}?v=${Date.now()}`, "_blank");
  }

  // Po remount stron (np. po dodaniu/usunięciu) — wyczyść stare editor refs.
  useEffect(() => {
    const currentIds = new Set(pages.map((p) => p.id));
    const refs = editorsRef.current;
    for (const id of Array.from(refs.keys())) {
      if (!currentIds.has(id)) refs.delete(id);
    }
  }, [pages]);

  // ─── Toolbar helpers (dispatch do activeEditor) ────────────────────

  const e = activeEditor;
  const currentColor = e?.getAttributes("textStyle").color as string | undefined;
  const currentAlign =
    e &&
    (["left", "center", "right", "justify"] as const).find((a) =>
      e.isActive({ textAlign: a }),
    );

  function withEditor(fn: (ed: Editor) => void) {
    return () => {
      if (!e) {
        toast.info("Kliknij najpierw w stronę żeby aktywować edytor");
        return;
      }
      fn(e);
    };
  }

  // ─── Page dimensions ───────────────────────────────────────────────

  const sizeMm = PAGE_SIZE_MM[pageSize];
  // Szerokość strony — w trybie pełnoekranowym ~2× większa żeby łatwiej
  // edytować. Wartości dobrane tak, żeby spread 2 stron mieścił się obok
  // siebie na typowym laptop'ie (1440px) z paddingiem i sidebarem.
  //   - Tryb normalny: A4=380, A5=300, A6=230 (oryginał — kompaktowy)
  //   - Pełen ekran:   A4=720, A5=560, A6=420 (powiększone do edycji)
  const editorWidthPx = fullscreen
    ? pageSize === "A4"
      ? 720
      : pageSize === "A5"
        ? 560
        : 420
    : pageSize === "A4"
      ? 380
      : pageSize === "A5"
        ? 300
        : 230;
  const editorHeightPx = editorWidthPx * (sizeMm.h / sizeMm.w);

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div
      className={cn(
        "space-y-3",
        fullscreen &&
          "fixed inset-0 z-50 bg-white overflow-y-auto p-6 shadow-2xl",
      )}
    >
      {/* ── Translate overlay — fixed, na całym ekranie, blokuje interakcję
           podczas tłumaczenia. Pokazuje nazwę języka + liczbę stron + loader,
           po sukcesie zmienia się w „Przetłumaczono!" przed page reloadem. */}
      {translateState && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-slate-200 px-10 py-8 flex flex-col items-center gap-4 min-w-[340px] max-w-md mx-4">
            {translateState.phase === "loading" ? (
              <>
                <div className="size-16 rounded-full bg-violet-100 grid place-items-center">
                  <Loader2 className="size-8 text-violet-700 animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <div className="text-lg font-bold text-slate-900">
                    Tłumaczenie języka{" "}
                    <span className="text-violet-700">
                      {translateState.toLang}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {translateState.pageCount}{" "}
                    {translateState.pageCount === 1
                      ? "strona"
                      : translateState.pageCount < 5
                        ? "strony"
                        : "stron"}{" "}
                    · Claude Sonnet 4.6
                  </div>
                  <div className="text-[11px] text-slate-400 italic mt-2">
                    Może potrwać 10-60 sekund w zależności od liczby stron.
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="size-16 rounded-full bg-emerald-100 grid place-items-center">
                  <CheckCircle2 className="size-9 text-emerald-700" />
                </div>
                <div className="text-center space-y-1">
                  <div className="text-lg font-bold text-emerald-700">
                    Przetłumaczono!
                  </div>
                  <div className="text-sm text-slate-600">
                    {translateState.translatedCount} stron PL →{" "}
                    <span className="font-semibold">
                      {translateState.toLang}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 italic mt-2">
                    Odświeżam edytor…
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top bar usunięty — przycisk „Pełny ekran" przeniesiony do prawego
          górnego rogu obszaru edytora (absolute over canvas), przycisk
          „Pokaż podgląd PDF" usunięty (preview iframe nie był używany). */}

      {/* Ustawienia ogólne — format strony + krój + rozmiary fontów */}
      <StyleSettingsPanel
        style={style}
        pageSize={pageSize}
        onPageSizeChange={(next) => {
          setPageSize(next);
          markDirty();
        }}
        onChange={(next) => {
          setStyle(next);
          markDirty();
        }}
      />

      {/* Nagłówki + dodawanie stron + nawigacja — wszystko w sidebarze
          „SPIS TREŚCI" po lewej stronie edytora. */}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border rounded-md p-1.5 bg-slate-50 sticky top-0 z-10">
        <ToolbarButton
          title="Pogrubienie (Ctrl+B)"
          onClick={withEditor((ed) => ed.chain().focus().toggleBold().run())}
          active={e?.isActive("bold")}
          disabled={!e}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Kursywa (Ctrl+I)"
          onClick={withEditor((ed) => ed.chain().focus().toggleItalic().run())}
          active={e?.isActive("italic")}
          disabled={!e}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="Kolor tekstu"
                disabled={!e}
                className={cn(
                  "size-8 rounded grid place-items-center hover:bg-slate-100 inline-flex items-center gap-0.5 relative",
                  !e && "opacity-40 cursor-not-allowed",
                )}
              >
                <Palette className="size-3.5 text-slate-600" />
                <span
                  className="absolute bottom-1 left-1.5 right-1.5 h-1 rounded-sm"
                  style={{ backgroundColor: currentColor || "#0f172a" }}
                />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-56 p-2">
            <ColorPickerContent
              editor={e}
              customColors={customColors}
              onRememberColor={rememberColor}
              onRemoveCustomColor={removeCustomColor}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <ToolbarButton
          title="Nagłówek 1"
          onClick={withEditor((ed) =>
            ed.chain().focus().toggleHeading({ level: 1 }).run(),
          )}
          active={e?.isActive("heading", { level: 1 })}
          disabled={!e}
        >
          <Heading1 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Nagłówek 2"
          onClick={withEditor((ed) =>
            ed.chain().focus().toggleHeading({ level: 2 }).run(),
          )}
          active={e?.isActive("heading", { level: 2 })}
          disabled={!e}
        >
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Nagłówek 3"
          onClick={withEditor((ed) =>
            ed.chain().focus().toggleHeading({ level: 3 }).run(),
          )}
          active={e?.isActive("heading", { level: 3 })}
          disabled={!e}
        >
          <Heading3 className="size-3.5" />
        </ToolbarButton>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        {/* Font family dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="Krój czcionki"
                disabled={!e}
                className={cn(
                  "h-8 px-2 rounded inline-flex items-center gap-1 hover:bg-slate-100 text-[11px] text-slate-700 max-w-[140px]",
                  !e && "opacity-40 cursor-not-allowed",
                )}
              >
                <Type className="size-3.5 shrink-0" />
                <span className="truncate">
                  {(e?.getAttributes("textStyle").fontFamily as string) ||
                    "Krój"}
                </span>
                <ChevronDown className="size-2.5 opacity-60 shrink-0" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-64">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1">
              Krój czcionki
            </div>
            <DropdownMenuItem
              onClick={() => e?.chain().focus().unsetFontFamily().run()}
            >
              <span className="text-xs italic text-muted-foreground">
                Domyślny
              </span>
            </DropdownMenuItem>
            {MANUAL_FONTS.map((f) => (
              <DropdownMenuItem
                key={f.family}
                onClick={() =>
                  e?.chain().focus().setFontFamily(f.family).run()
                }
                className="flex flex-col items-start gap-0"
              >
                <span
                  className="text-sm font-medium"
                  style={{ fontFamily: f.family }}
                >
                  {f.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {f.description}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Font size dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="Rozmiar czcionki"
                disabled={!e}
                className={cn(
                  "h-8 px-2 rounded inline-flex items-center gap-1 hover:bg-slate-100 text-[11px] text-slate-700",
                  !e && "opacity-40 cursor-not-allowed",
                )}
              >
                <span className="tabular-nums font-semibold">
                  {(e?.getAttributes("textStyle").fontSize as string)?.replace(
                    "pt",
                    "",
                  ) || "—"}
                </span>
                <span className="text-[9px] text-slate-400">pt</span>
                <ChevronDown className="size-2.5 opacity-60" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-36 p-0">
            <FontSizePickerContent
              onPick={(size) =>
                e?.chain().focus().setFontSize(`${size}pt`).run()
              }
              onReset={() => e?.chain().focus().unsetFontSize().run()}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <ToolbarButton
          title="Wyrównaj do lewej"
          onClick={withEditor((ed) => ed.chain().focus().setTextAlign("left").run())}
          active={currentAlign === "left"}
          disabled={!e}
        >
          <AlignLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Wyrównaj do środka"
          onClick={withEditor((ed) =>
            ed.chain().focus().setTextAlign("center").run(),
          )}
          active={currentAlign === "center"}
          disabled={!e}
        >
          <AlignCenter className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Wyrównaj do prawej"
          onClick={withEditor((ed) =>
            ed.chain().focus().setTextAlign("right").run(),
          )}
          active={currentAlign === "right"}
          disabled={!e}
        >
          <AlignRight className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Wyjustuj"
          onClick={withEditor((ed) =>
            ed.chain().focus().setTextAlign("justify").run(),
          )}
          active={currentAlign === "justify"}
          disabled={!e}
        >
          <AlignJustify className="size-3.5" />
        </ToolbarButton>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <ToolbarButton
          title="Lista punktowana"
          onClick={withEditor((ed) => ed.chain().focus().toggleBulletList().run())}
          active={e?.isActive("bulletList")}
          disabled={!e}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Lista numerowana"
          onClick={withEditor((ed) => ed.chain().focus().toggleOrderedList().run())}
          active={e?.isActive("orderedList")}
          disabled={!e}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <ToolbarButton
          title="Wstaw obrazek"
          onClick={() => {
            if (!e) {
              toast.info("Kliknij najpierw w stronę");
              return;
            }
            imagePickerCallbackRef.current = (url) => {
              e.chain().focus().setImage({ src: url }).run();
            };
            setImagePickerOpen(true);
          }}
          disabled={!e}
        >
          <ImageIcon className="size-3.5" />
        </ToolbarButton>
        {/* Tabela — dropdown z komendami insert/add row/col/delete.
         *  Szerokość kolumn można zmieniać myszką dzięki resizable=true. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="Tabela"
                disabled={!e}
                className={cn(
                  "h-8 px-2 rounded grid place-items-center transition-colors text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1",
                  !e && "opacity-40 cursor-not-allowed",
                )}
              >
                <TableIcon className="size-3.5" />
                <ChevronDown className="size-2.5 opacity-60" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              onClick={() =>
                e
                  ?.chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run()
              }
              className="gap-2"
            >
              <span className="size-7 rounded ring-1 ring-slate-300 bg-white grid place-items-center">
                <TableIcon className="size-3.5 text-slate-500" />
              </span>
              <div>
                <div className="text-xs font-medium">Wstaw tabelę 3×3</div>
                <div className="text-[10px] text-muted-foreground">
                  Z nagłówkiem; szerokość kolumn przesuwasz myszką
                </div>
              </div>
            </DropdownMenuItem>
            <div className="my-1 h-px bg-slate-200" />
            {/* Komendy tabelowe — nie sprawdzamy `.can()` bo TipTap rzuca
             *  gdy editor.view jeszcze nie zainicjowany (immediatelyRender=false).
             *  Klik poza tabelą = no-op, więc disable nie jest potrzebny. */}
            <DropdownMenuItem
              onClick={() => e?.chain().focus().addRowAfter().run()}
              disabled={!e}
              className="gap-2 text-xs"
            >
              <Rows3 className="size-3.5" /> Dodaj wiersz pod
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.chain().focus().addRowBefore().run()}
              disabled={!e}
              className="gap-2 text-xs"
            >
              <Rows3 className="size-3.5" /> Dodaj wiersz nad
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.chain().focus().addColumnAfter().run()}
              disabled={!e}
              className="gap-2 text-xs"
            >
              <Columns3 className="size-3.5" /> Dodaj kolumnę po prawej
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.chain().focus().addColumnBefore().run()}
              disabled={!e}
              className="gap-2 text-xs"
            >
              <Columns3 className="size-3.5" /> Dodaj kolumnę po lewej
            </DropdownMenuItem>
            <div className="my-1 h-px bg-slate-200" />
            <DropdownMenuItem
              onClick={() => e?.chain().focus().deleteRow().run()}
              disabled={!e}
              className="gap-2 text-xs text-rose-700"
            >
              <Trash2 className="size-3.5" /> Usuń wiersz
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.chain().focus().deleteColumn().run()}
              disabled={!e}
              className="gap-2 text-xs text-rose-700"
            >
              <Trash2 className="size-3.5" /> Usuń kolumnę
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.chain().focus().deleteTable().run()}
              disabled={!e}
              className="gap-2 text-xs text-rose-700"
            >
              <Trash2 className="size-3.5" /> Usuń całą tabelę
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                title="Wstaw sekcję z layoutem"
                disabled={!e}
                className={cn(
                  "h-8 px-2 rounded grid place-items-center transition-colors text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1",
                  !e && "opacity-40 cursor-not-allowed",
                )}
              >
                <Layout className="size-3.5" />
                <ChevronDown className="size-2.5 opacity-60" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              onClick={() =>
                e
                  ?.chain()
                  .focus()
                  .insertContent({
                    type: "paragraph",
                    content: [{ type: "text", text: "Wpisz tekst…" }],
                  })
                  .run()
              }
              className="gap-2"
            >
              <span className="size-7 rounded ring-1 ring-slate-300 bg-white grid place-items-center">
                <Pilcrow className="size-3.5 text-slate-500" />
              </span>
              <div>
                <div className="text-xs font-medium">Tekst</div>
                <div className="text-[10px] text-muted-foreground">
                  Zwykły akapit (wpisz lub wklej tekst)
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.commands.insertSectionLayout("imageOnly")}
              className="gap-2"
            >
              <span className="size-7 rounded ring-1 ring-slate-300 bg-slate-100 grid place-items-center">
                <ImageIcon className="size-3.5 text-slate-500" />
              </span>
              <div>
                <div className="text-xs font-medium">Sam obraz</div>
                <div className="text-[10px] text-muted-foreground">
                  Wycentrowany obraz + opcjonalny opis
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.commands.insertSectionLayout("imageLeft")}
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
                <div className="text-xs font-medium">Obraz lewa, tekst prawa</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.commands.insertSectionLayout("imageRight")}
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
                <div className="text-xs font-medium">Tekst lewa, obraz prawa</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => e?.commands.insertSectionLayout("textText")}
              className="gap-2"
            >
              <span className="size-7 rounded ring-1 ring-slate-300 bg-white grid grid-cols-[1fr_1fr] gap-0.5 p-0.5">
                <span className="flex flex-col gap-0.5 justify-center">
                  <span className="h-0.5 bg-slate-400 rounded-full" />
                  <span className="h-0.5 bg-slate-400 rounded-full" />
                  <span className="h-0.5 bg-slate-400 rounded-full" />
                </span>
                <span className="flex flex-col gap-0.5 justify-center">
                  <span className="h-0.5 bg-slate-400 rounded-full" />
                  <span className="h-0.5 bg-slate-400 rounded-full" />
                  <span className="h-0.5 bg-slate-400 rounded-full" />
                </span>
              </span>
              <div>
                <div className="text-xs font-medium">Tekst lewa, tekst prawa</div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="w-px h-6 bg-slate-300 mx-1" />
        <ToolbarButton
          title="Blok uwagi (callout)"
          onClick={withEditor((ed) =>
            ed
              .chain()
              .focus()
              .insertContent({
                type: "callout",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "💡 Ważna informacja…" }],
                  },
                ],
              })
              .run(),
          )}
          disabled={!e}
        >
          <Lightbulb className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Pozioma kreska"
          onClick={withEditor((ed) =>
            ed.chain().focus().setHorizontalRule().run(),
          )}
          disabled={!e}
        >
          <Minus className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Wymuś nową stronę w PDF"
          onClick={withEditor((ed) =>
            ed.chain().focus().insertContent({ type: "pageBreak" }).run(),
          )}
          disabled={!e}
        >
          <Scissors className="size-3.5" />
        </ToolbarButton>
        {!e && (
          <span className="text-[10px] text-amber-700 italic ml-2">
            (Kliknij w stronę aby aktywować formatowanie)
          </span>
        )}
      </div>

      {/* Pasek tabsów języków — aktywne języki + przycisk dodania kolejnego.
          Klik na tab skacze do pierwszej strony tego języka w spread'zie. */}
      <div className="flex items-center gap-1 px-1">
        {activeLanguages.map((lang) => {
          const count = pageCountByLang.get(lang) ?? 0;
          const isCurrent = currentLang === lang;
          // PL nigdy nie pokazujemy jako „fresh" (jest źródłem). Inne języki
          // dostają zielone podkreślenie+badge gdy są kompletnie i aktualnie
          // przetłumaczone wg `langFreshness`.
          const isFresh = lang !== "PL" && (langFreshness.get(lang) ?? false);
          return (
            <button
              key={lang}
              type="button"
              onClick={() => jumpToLang(lang)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-semibold transition-colors border-b-2 group",
                isCurrent
                  ? isFresh
                    ? "bg-emerald-50 text-emerald-800 border-emerald-600 shadow-sm"
                    : "bg-white text-indigo-700 border-indigo-600 shadow-sm"
                  : isFresh
                    ? "bg-emerald-50/60 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                    : "bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200 hover:text-slate-900",
              )}
              title={
                isFresh
                  ? `${MANUAL_LANGUAGE_LABELS_LOCAL[lang]} — ${count} stron · ZGODNE z PL`
                  : `${MANUAL_LANGUAGE_LABELS_LOCAL[lang]} — ${count} stron`
              }
            >
              <span className="font-bold tabular-nums">{lang}</span>
              <span className="text-[10px] opacity-70 tabular-nums">
                ({count})
              </span>
              {lang !== "PL" && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    removeLanguage(lang);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.stopPropagation();
                      removeLanguage(lang);
                    }
                  }}
                  className={cn(
                    "ml-1 size-4 grid place-items-center rounded text-slate-400 transition-colors",
                    "hover:text-rose-700 hover:bg-rose-100",
                    // pointer-events-none gdy invisible — inaczej opacity-0
                    // łapie kliki i user przypadkiem usuwa język klikając na
                    // pustą strefę po prawej.
                    "opacity-0 pointer-events-none",
                    "group-hover:opacity-100 group-hover:pointer-events-auto",
                    "focus:opacity-100 focus:pointer-events-auto",
                  )}
                  aria-label={`Usuń język ${lang}`}
                  title="Usuń ten język"
                >
                  <X className="size-3" />
                </span>
              )}
            </button>
          );
        })}
        {/* + Dodaj język — dropdown menu z nieaktywnymi językami */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-t-md text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors border-b-2 border-transparent"
                title="Dodaj nowy język do instrukcji"
              >
                <Plus className="size-3.5" />
                <span>Dodaj język</span>
              </button>
            }
          />
          <DropdownMenuContent align="start">
            {MANUAL_LANGUAGES_LOCAL.filter(
              (l) => !activeLanguages.includes(l),
            ).map((l) => (
              <DropdownMenuItem
                key={l}
                onClick={() => addLanguage(l)}
                className="gap-2"
              >
                <span className="font-bold w-7 tabular-nums">{l}</span>
                <span className="text-xs">
                  {MANUAL_LANGUAGE_LABELS_LOCAL[l]}
                </span>
              </DropdownMenuItem>
            ))}
            {activeLanguages.length === MANUAL_LANGUAGES_LOCAL.length && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground italic">
                Wszystkie języki już dodane
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* „Przetłumacz z PL → currentLang" — pokazany TYLKO gdy currentLang != PL
            i translateAction dostępne. Klik wywołuje Claude API z confirm. */}
        {translateAction && currentLang !== "PL" && (
          <button
            type="button"
            onClick={() => translateFromPl(currentLang)}
            disabled={translatingLang != null}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
              translatingLang === currentLang
                ? "bg-violet-100 text-violet-700 cursor-wait"
                : "bg-violet-600 text-white hover:bg-violet-700",
              translatingLang != null &&
                translatingLang !== currentLang &&
                "opacity-40 cursor-not-allowed",
            )}
            title={`Wygeneruj ${currentLang} z PL przez Claude AI (zastąpi obecne strony ${currentLang})`}
          >
            {translatingLang === currentLang ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Tłumaczenie…
              </>
            ) : (
              <>
                <Languages className="size-3.5" />
                Przetłumacz z PL → {currentLang}
              </>
            )}
          </button>
        )}
      </div>

      {/* Spread navigator: ← Strona X-Y / Z → + dodaj + menu */}
      <div className="flex items-center justify-between gap-3 bg-slate-100/60 rounded-md border border-slate-200 px-3 py-2">
        <button
          type="button"
          onClick={() => setSpreadIdx((s) => Math.max(0, s - 1))}
          disabled={spreadIdx === 0}
          className={cn(
            "size-9 rounded-full grid place-items-center transition-colors",
            spreadIdx === 0
              ? "opacity-30 cursor-not-allowed"
              : "bg-white shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 text-slate-700",
          )}
          title="Poprzednia strona"
        >
          <ChevronLeft className="size-4" />
        </button>

        <div className="text-center">
          <div className="text-sm font-semibold text-slate-800 tabular-nums">
            {(() => {
              if (visibleSlots.length === 0) return "Brak stron";
              const labels = visibleSlots.map((s) => {
                if (s.kind === "cover") return "1 (okładka)";
                if (s.kind === "toc") return "2 (spis treści)";
                if (s.kind === "blankPad")
                  return `${2 + pages.length + 1} (wyrównanie)`;
                if (s.kind === "blankFinal")
                  return `${totalPhysicalPages} (ostatnia)`;
                return `${s.bodyIdx + 3}`;
              });
              return labels.length === 1
                ? `Strona ${labels[0]}`
                : `Strony ${labels[0]} · ${labels[1]}`;
            })()}
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            spread {spreadIdx + 1} z {total} · łącznie {totalPhysicalPages}{" "}
            {totalPhysicalPages === 1 ? "strona" : "stron"} (okładka + spis treści +{" "}
            {pages.length} {pages.length === 1 ? "edytowalna" : "edytowalnych"})
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addPageAtEnd}
            className="gap-1.5"
            title="Dodaj nową stronę na końcu"
          >
            <FilePlus2 className="size-3.5" />
            Dodaj stronę
          </Button>
          <button
            type="button"
            onClick={() => setSpreadIdx((s) => Math.min(total - 1, s + 1))}
            disabled={spreadIdx >= total - 1}
            className={cn(
              "size-9 rounded-full grid place-items-center transition-colors",
              spreadIdx >= total - 1
                ? "opacity-30 cursor-not-allowed"
                : "bg-white shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 text-slate-700",
            )}
            title="Następna strona"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Split view: TOC sidebar + edytor (spread) + iframe PDF.
          Sidebar szerszy (260px) bo zawiera nawigację + edycję zakresów +
          dodawanie stron — wszystkie operacje strukturalne w 1 miejscu. */}
      <div
        className={cn(
          "grid gap-4",
          showPreview
            ? "grid-cols-1 xl:grid-cols-[260px_1fr_1fr]"
            : "grid-cols-1 xl:grid-cols-[260px_1fr]",
        )}
      >
        {/* LEWA — sidebar SPIS TREŚCI: nawigacja + edycja zakresów + dodawanie
            stron. Wszystkie operacje strukturalne w jednym miejscu. */}
        <TocSidebar
          pages={pages}
          langSections={langSections}
          headerRanges={headerRanges}
          totalPhysicalPages={totalPhysicalPages}
          currentSpreadIdx={spreadIdx}
          currentLang={currentLang}
          onJumpToSpread={(targetSpread, bodyIdx) => {
            setSpreadIdx(targetSpread);
            if (bodyIdx != null) {
              setFocusedPageIdx(bodyIdx);
            } else {
              // Bez bodyIdx (np. klik na collapsed pasek języka, cover, TOC,
              // Ostatnia) — czyścimy focus, żeby currentLang spadał z fokusa
              // na lang widocznego slotu (np. cover sec PL → currentLang=PL).
              setFocusedPageIdx(null);
              setAlignmentFocused(null);
            }
          }}
          onChangeRanges={(next) => {
            setHeaderRanges(next);
            markDirty();
          }}
          onAddPage={addPageAtEnd}
          kind={initialKind}
          onPickImage={(setSrc) => {
            imagePickerCallbackRef.current = setSrc;
            setImagePickerOpen(true);
          }}
        />

        {/* ŚRODEK: spread z 1-2 slotów (cover/TOC/body) */}
        <div className="relative flex flex-col items-center gap-2 py-2 bg-slate-100/40 rounded-md min-h-[300px]">
          {/* Pełny ekran — floating w prawym górnym rogu, na poziomie strzałki
              nawigacyjnej ale nieco wyżej. */}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className={cn(
              "absolute right-2 top-3 z-10",
              "px-3 py-1.5 rounded-md text-xs font-medium ring-1 transition-colors inline-flex items-center gap-1.5 shadow-sm",
              fullscreen
                ? "bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50",
            )}
            title={
              fullscreen
                ? "Wyjdź z pełnego ekranu (ESC)"
                : "Edytuj na pełnym ekranie"
            }
          >
            {fullscreen ? (
              <>
                <Minimize2 className="size-3.5" />
                Wyjdź
              </>
            ) : (
              <>
                <Maximize2 className="size-3.5" />
                Pełny ekran
              </>
            )}
          </button>
          {/* Duże strzałki nawigacyjne — przyklejone do bocznych krawędzi
              całej przestrzeni edytora, na środku pionowo. Klik = ten sam
              efekt co małe strzałki w pasku górnym (prev/next spread). */}
          <button
            type="button"
            onClick={() => setSpreadIdx((s) => Math.max(0, s - 1))}
            disabled={spreadIdx === 0}
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 z-10",
              "size-14 rounded-full grid place-items-center transition-all",
              spreadIdx === 0
                ? "opacity-20 cursor-not-allowed bg-white/40 text-slate-400"
                : "bg-white shadow-lg ring-1 ring-slate-200 hover:bg-indigo-50 hover:ring-indigo-300 hover:scale-105 text-slate-700 hover:text-indigo-700 active:scale-95",
            )}
            title="Poprzedni spread (← strzałka klawiatury)"
            aria-label="Poprzedni spread"
          >
            <ChevronLeft className="size-8" />
          </button>
          <button
            type="button"
            onClick={() =>
              setSpreadIdx((s) => Math.min(total - 1, s + 1))
            }
            disabled={spreadIdx >= total - 1}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 z-10",
              "size-14 rounded-full grid place-items-center transition-all",
              spreadIdx >= total - 1
                ? "opacity-20 cursor-not-allowed bg-white/40 text-slate-400"
                : "bg-white shadow-lg ring-1 ring-slate-200 hover:bg-indigo-50 hover:ring-indigo-300 hover:scale-105 text-slate-700 hover:text-indigo-700 active:scale-95",
            )}
            title="Następny spread (→ strzałka klawiatury)"
            aria-label="Następny spread"
          >
            <ChevronRight className="size-8" />
          </button>
          <div className="flex justify-center items-start gap-3">
            {visibleSlots.map((slot) => {
              const physicalPage = slotPhysicalPageNumber(
                slot,
                langSections,
                initialKind,
              );
              // ─ Wirtualne sloty (cover / TOC) — bez TipTap edytora ─
              if (slot.kind === "cover") {
                return (
                  <div
                    key={`cover-${slot.lang}`}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="flex items-center justify-between w-full px-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold tabular-nums">
                      <span>
                        Strona {physicalPage} · Okładka{" "}
                        <span className="text-rose-700 bg-rose-100 px-1 rounded ml-1">
                          {slot.lang}
                        </span>
                      </span>
                      <span className="text-slate-400 italic font-normal normal-case">
                        (stała)
                      </span>
                    </div>
                    <CoverPagePreview
                      width={editorWidthPx}
                      height={editorHeightPx}
                      logoImageUrl={style.logoImageUrl}
                      logoHeightPt={style.logoHeightPt}
                      coverSubtitle={style.coverSubtitle ?? ""}
                      fontFamily={style.fontFamily}
                      bodyFontSize={style.bodyFontSize}
                      h1FontSize={style.h1FontSize}
                      activeLanguages={
                        slot.lang === activeLanguages[0]
                          ? activeLanguages
                          : [slot.lang]
                      }
                      currentLang={slot.lang}
                      onPickLogo={pickLogo}
                      onRemoveLogo={removeLogo}
                      onChangeSubtitle={(v) => {
                        setStyle((s) => ({ ...s, coverSubtitle: v }));
                        markDirty();
                      }}
                      onChangeLogoSize={(pt) => {
                        setStyle((s) => ({ ...s, logoHeightPt: pt }));
                        markDirty();
                      }}
                    />
                    <div className="text-[9px] text-slate-400 tabular-nums">
                      {pageSize} · {sizeMm.w}×{sizeMm.h} mm
                    </div>
                  </div>
                );
              }
              if (slot.kind === "toc") {
                // TOC dla TEJ sekcji językowej — filtrujemy header ranges
                // żeby pokazać tylko body z tego języka.
                const sec = langSections.find((s) => s.lang === slot.lang);
                const sectionPagesPhysical = sec
                  ? sec.bodyIndices.map((idx, localI) => {
                      // Fizyczna strona body w sekcji = sectionOffset + 3 + localI
                      const offset = langSections
                        .slice(0, langSections.indexOf(sec))
                        .reduce(
                          (sum, s) =>
                            sum +
                            2 +
                            s.bodyIndices.length +
                            extraBlankCount(s.bodyIndices.length),
                          0,
                        );
                      return { pageIdx: idx, physicalPage: offset + 3 + localI };
                    })
                  : [];
                // Fallback „Strona X" tłumaczony per-język sekcji
                const PAGE_LABELS_LOCAL: Record<ManualLanguageT, string> = {
                  PL: "Strona",
                  EN: "Page",
                  DE: "Seite",
                  UA: "Сторінка",
                  SK: "Strana",
                  RO: "Pagina",
                  CS: "Strana",
                  HU: "Oldal",
                  BG: "Страница",
                };
                const pageLabel = PAGE_LABELS_LOCAL[slot.lang];
                // Mirror logiki PDF: preferuj headerRange.title, dalej H1,
                // dalej fallback „Strona X". Strony z tym samym matched range
                // grupujemy w jeden wpis i pokazujemy PEŁNY zakres rangu
                // (fromPage-toPage) — uwzględnia także strony wyrównania
                // jeśli range je obejmuje (np. „Zasady 8-9").
                const localTocEntries: { text: string; pages: string }[] = [];
                const seenRangeIds = new Set<string>();
                for (const p of sectionPagesPhysical) {
                  const matched =
                    headerRanges && headerRanges.length > 0
                      ? resolveHeaderForPage(p.physicalPage, headerRanges)
                      : null;
                  if (matched) {
                    if (seenRangeIds.has(matched.id)) continue;
                    seenRangeIds.add(matched.id);
                    localTocEntries.push({
                      text: matched.title || `${pageLabel} ${matched.fromPage}`,
                      pages:
                        matched.fromPage === matched.toPage
                          ? String(matched.fromPage)
                          : `${matched.fromPage}-${matched.toPage}`,
                    });
                  } else {
                    const h1 = extractPageHeadings(
                      pages[p.pageIdx]?.content ?? {},
                    ).find((h) => h.level === 1)?.text;
                    localTocEntries.push({
                      text: h1 || `${pageLabel} ${p.physicalPage}`,
                      pages: String(p.physicalPage),
                    });
                  }
                }
                // Dopisz ranges które obejmują strony wyrównania / ostatnią
                // (poza body iter). Bounds sekcji w fizycznych numerach stron.
                if (sec) {
                  const __secIdx = langSections.indexOf(sec);
                  const __secOffset = langSections
                    .slice(0, __secIdx)
                    .reduce(
                      (s, s2) =>
                        s +
                        2 +
                        s2.bodyIndices.length +
                        extraBlankCount(s2.bodyIndices.length),
                      0,
                    );
                  const bodyCount = sec.bodyIndices.length;
                  const secStart = __secOffset + 1;
                  const secEnd =
                    __secOffset + 2 + bodyCount + extraBlankCount(bodyCount);
                  if (headerRanges) {
                    for (const r of headerRanges) {
                      if (seenRangeIds.has(r.id)) continue;
                      if (!r.title) continue;
                      if (r.lang && r.lang !== slot.lang) continue;
                      if (r.toPage < secStart || r.fromPage > secEnd) continue;
                      const from = Math.max(secStart, r.fromPage);
                      const to = Math.min(secEnd, r.toPage);
                      if (to < from) continue;
                      seenRangeIds.add(r.id);
                      localTocEntries.push({
                        text: r.title,
                        pages: from === to ? String(from) : `${from}-${to}`,
                      });
                    }
                  }
                }
                return (
                  <div
                    key={`toc-${slot.lang}`}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="flex items-center justify-between w-full px-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold tabular-nums">
                      <span>
                        Strona {physicalPage} · Spis treści{" "}
                        <span className="text-rose-700 bg-rose-100 px-1 rounded ml-1">
                          {slot.lang}
                        </span>
                      </span>
                      <span className="text-slate-400 italic font-normal normal-case">
                        (auto)
                      </span>
                    </div>
                    <TocPagePreview
                      width={editorWidthPx}
                      height={editorHeightPx}
                      tocEntries={localTocEntries}
                      fontFamily={style.fontFamily}
                      bodyFontSize={style.bodyFontSize}
                      h1FontSize={style.h1FontSize}
                      lang={slot.lang}
                    />
                    <div className="text-[9px] text-slate-400 tabular-nums">
                      {pageSize} · {sizeMm.w}×{sizeMm.h} mm
                    </div>
                  </div>
                );
              }
              // ─ Slot „Ostatnia" — zawsze pusta biała, sztywna, nieedytowalna ─
              if (slot.kind === "blankFinal") {
                return (
                  <div
                    key={`blankFinal-${slot.lang}`}
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="flex items-center justify-between w-full px-1 text-[10px] uppercase tracking-wider font-semibold tabular-nums">
                      <span className="text-rose-700">
                        Strona {physicalPage} · Ostatnia{" "}
                        <span className="bg-rose-100 px-1 rounded ml-1">
                          {slot.lang}
                        </span>
                      </span>
                      <span className="text-slate-400 italic font-normal normal-case">
                        (sztywna)
                      </span>
                    </div>
                    <div
                      className="bg-white shadow-md ring-1 ring-rose-300 rounded-sm relative overflow-hidden flex flex-col items-center justify-center"
                      style={{
                        width: editorWidthPx,
                        height: editorHeightPx,
                      }}
                    >
                      {companyWebsiteUrl ? (
                        <div className="text-center px-4 text-slate-700 font-semibold tracking-wide text-base">
                          {companyWebsiteUrl}
                        </div>
                      ) : (
                        <div className="text-center px-4 text-rose-700">
                          <div className="text-xs font-semibold uppercase tracking-widest">
                            Ostatnia
                          </div>
                          <div className="text-[10px] mt-1 italic">
                            Pojedyncza, biała, sztywna
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-[9px] text-slate-400 tabular-nums">
                      {pageSize} · {sizeMm.w}×{sizeMm.h} mm
                    </div>
                  </div>
                );
              }
              // ─ Slot „Wyrównanie" — edytowalna jak body, ale sztywna (nie da
              //   się usunąć). Treść w `alignmentContent` state. ─
              if (slot.kind === "blankPad") {
                // Header z header range — alignment page logicznie należy do
                // tego samego rangu co ostatnia body strona sekcji. Najpierw
                // próbujemy bezpośredniego match'u (np. range 8-9 obejmuje
                // alignment 9), jeśli nie ma — fallback do strony poprzedniej
                // (8). Dzięki temu user nie musi pamiętać o rozszerzeniu
                // `toPage` rangu, żeby alignment dziedziczył nagłówek.
                const matchedAlign =
                  headerRanges.length > 0
                    ? resolveHeaderForPage(physicalPage, headerRanges) ??
                      resolveHeaderForPage(physicalPage - 1, headerRanges)
                    : null;
                const alignHeaderLang =
                  matchedAlign?.lang ??
                  (headerRanges.length === 0 ? headerLang : "");
                const alignHeaderTitle =
                  matchedAlign?.title ??
                  (headerRanges.length === 0 ? headerTitle : "");
                const alignHeaderRightText = matchedAlign?.rightText ?? null;
                const alignHeaderRightImageUrl =
                  style.logoImageUrl ?? matchedAlign?.rightImageUrl ?? null;
                return (
                  <div
                    key="blankPad"
                    className="flex flex-col items-center gap-1"
                  >
                    <div className="flex items-center justify-between w-full px-1 text-[10px] uppercase tracking-wider font-semibold tabular-nums">
                      <span className="text-slate-600">
                        Strona {physicalPage} · Wyrównanie
                      </span>
                      <span className="text-slate-400 italic font-normal normal-case">
                        (sztywna, edytowalna)
                      </span>
                    </div>
                    <div
                      onClick={() => {
                        setFocusedPageIdx(null);
                        setAlignmentFocused(slot.lang);
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") {
                          setFocusedPageIdx(null);
                          setAlignmentFocused(slot.lang);
                        }
                      }}
                      role="button"
                      tabIndex={-1}
                    >
                      <PageEditor
                        pageId={`alignment-${slot.lang}`}
                        pageNumber={physicalPage}
                        initialContent={
                          alignmentContent[slot.lang] ?? {
                            type: "doc",
                            content: [{ type: "paragraph" }],
                          }
                        }
                        isFocused={alignmentFocused === slot.lang}
                        width={editorWidthPx}
                        height={editorHeightPx}
                        pageSize={pageSize}
                        totalPhysicalPages={totalPhysicalPages}
                        headerLang={alignHeaderLang ?? ""}
                        headerTitle={alignHeaderTitle ?? ""}
                        headerRightText={alignHeaderRightText}
                        headerRightImageUrl={alignHeaderRightImageUrl}
                        footerCustom={footerCustom}
                        fontFamily={style.fontFamily}
                        bodyFontSize={style.bodyFontSize}
                        h1FontSize={style.h1FontSize}
                        h2FontSize={style.h2FontSize}
                        h3FontSize={style.h3FontSize}
                        sectionLayoutOptions={{
                          onPickImage: (_currentSrc, setSrc) => {
                            imagePickerCallbackRef.current = setSrc;
                            setImagePickerOpen(true);
                          },
                        }}
                        onPickImage={(cb) => {
                          imagePickerCallbackRef.current = cb;
                          setImagePickerOpen(true);
                        }}
                        onContentChange={(json) => {
                          setAlignmentContent((prev) => ({
                            ...prev,
                            [slot.lang]: json,
                          }));
                          markDirty();
                        }}
                        onFocus={() => {
                          setFocusedPageIdx(null);
                          setAlignmentFocused(slot.lang);
                        }}
                        onMount={(editor) => {
                          editorsRef.current.set(
                            `alignment-${slot.lang}`,
                            editor,
                          );
                        }}
                      />
                    </div>
                    <div className="text-[9px] text-slate-400 tabular-nums">
                      {pageSize} · {sizeMm.w}×{sizeMm.h} mm
                    </div>
                  </div>
                );
              }
              // ─ Body slot — edytowalna strona ─
              const bodyIdx = slot.bodyIdx;
              const page = pages[bodyIdx];
              if (!page) return null;
              // Header lookup po fizycznym numerze strony.
              const matched =
                headerRanges.length > 0
                  ? resolveHeaderForPage(physicalPage, headerRanges)
                  : null;
              const effHeaderLang =
                matched?.lang ?? (headerRanges.length === 0 ? headerLang : "");
              const effHeaderTitle =
                matched?.title ?? (headerRanges.length === 0 ? headerTitle : "");
              const effHeaderRightText = matched?.rightText ?? null;
              const effHeaderRightImageUrl =
                style.logoImageUrl ?? matched?.rightImageUrl ?? null;
              return (
                <div key={page.id} className="flex flex-col items-center gap-1">
                  <div className="flex items-center justify-between w-full px-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold tabular-nums">
                    <span>Strona {physicalPage}</span>
                    {/* Akcje strony — 3 osobne ikonki zamiast menu */}
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => insertPageAt(bodyIdx)}
                        className="size-5 rounded grid place-items-center hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 transition-colors"
                        title="Wstaw stronę przed tą"
                      >
                        <ArrowUpToLine className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertPageAt(bodyIdx + 1)}
                        className="size-5 rounded grid place-items-center hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 transition-colors"
                        title="Wstaw stronę po tej"
                      >
                        <ArrowDownToLine className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              `Usunąć stronę ${physicalPage}? Operacji nie można cofnąć.`,
                            )
                          ) {
                            deletePageNoConfirm(bodyIdx);
                          }
                        }}
                        className="size-5 rounded grid place-items-center hover:bg-rose-100 text-slate-500 hover:text-rose-700 transition-colors"
                        title="Usuń tę stronę"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                  <div
                    onClick={() => {
                      setFocusedPageIdx(bodyIdx);
                      setAlignmentFocused(null);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") {
                        setFocusedPageIdx(bodyIdx);
                        setAlignmentFocused(null);
                      }
                    }}
                    role="button"
                    tabIndex={-1}
                  >
                    <PageEditor
                      pageId={page.id}
                      pageNumber={physicalPage}
                      initialContent={page.content}
                      isFocused={focusedPageIdx === bodyIdx}
                      width={editorWidthPx}
                      height={editorHeightPx}
                      pageSize={pageSize}
                      totalPhysicalPages={totalPhysicalPages}
                      headerLang={effHeaderLang}
                      headerTitle={effHeaderTitle}
                      headerRightText={effHeaderRightText}
                      headerRightImageUrl={effHeaderRightImageUrl}
                      footerCustom={footerCustom}
                      fontFamily={style.fontFamily}
                      bodyFontSize={style.bodyFontSize}
                      h1FontSize={style.h1FontSize}
                      h2FontSize={style.h2FontSize}
                      h3FontSize={style.h3FontSize}
                      sectionLayoutOptions={{
                        onPickImage: (_currentSrc, setSrc) => {
                          imagePickerCallbackRef.current = setSrc;
                          setImagePickerOpen(true);
                        },
                      }}
                      onPickImage={(cb) => {
                        imagePickerCallbackRef.current = cb;
                        setImagePickerOpen(true);
                      }}
                      onContentChange={(json) =>
                        updatePageContent(bodyIdx, json)
                      }
                      onFocus={() => onPageFocus(bodyIdx)}
                      onMount={(editor) => onPageMount(bodyIdx, editor)}
                    />
                  </div>
                  <div className="text-[9px] text-slate-400 tabular-nums">
                    {pageSize} · {sizeMm.w}×{sizeMm.h} mm
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PRAWA: live PDF preview */}
        {showPreview && (
          <div className="flex flex-col">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 flex items-center gap-2">
              Podgląd PDF
              {dirty && (
                <span className="text-amber-600 normal-case font-normal italic">
                  (zapisz aby odświeżyć)
                </span>
              )}
            </div>
            <iframe
              key={`pdf-${previewKey}-${pageSize}-${template}`}
              src={`${pdfUrl}?v=${previewKey}#toolbar=1&navpanes=1&view=FitH`}
              className="w-full bg-slate-100 ring-1 ring-slate-300 rounded-sm"
              style={{ height: "75vh", minHeight: editorHeightPx + 80 }}
              title="Podgląd PDF instrukcji"
            />
          </div>
        )}
      </div>

      {/* Footer (wspólna stopka dla wszystkich stron) */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 items-center bg-slate-50 rounded-md border border-slate-200 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-slate-700 font-bold">
          STOPKA (na każdej stronie):
        </span>
        <Input
          placeholder="Twój tekst stopki (np. ACRO4F.COM) · numer strony auto"
          value={footerCustom}
          onChange={(e) => {
            setFooterCustom(e.target.value);
            markDirty();
          }}
          className="h-7 text-xs bg-white"
        />
      </div>

      {/* Save bar — autosave, więc tylko status + Pobierz PDF */}
      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-white py-2 border-t">
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
          {saving ? (
            <span className="text-indigo-600 font-medium">⟳ Zapisuję…</span>
          ) : dirty ? (
            <span className="text-amber-600 font-medium">
              ⚠ Niezapisane zmiany (zapis automatyczny za chwilę)
            </span>
          ) : lastSaved ? (
            <span className="text-emerald-600">
              ✓ Zapisano automatycznie ·{" "}
              {lastSaved.toLocaleTimeString("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          ) : (
            <span>Autozapis aktywny</span>
          )}
        </span>
        <div className="inline-flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              // Otwiera PDF w nowej karcie (react-pdf endpoint — ten sam
              // co preview iframe). Cache-bust query param (?v=Date.now())
              // wymusza pobranie świeżego PDF — bez tego Chrome cache'uje
              // poprzednią wersję po edycjach treści.
              if (dirty) await save(false);
              window.open(`${pdfUrl}?v=${Date.now()}`, "_blank");
            }}
            disabled={saving}
            className="gap-1.5"
            title="Otwiera PDF w nowej karcie — gotowy do druku/zapisu/udostępnienia"
          >
            <Printer className="size-3.5" />
            Otwórz PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={downloadPdf}
            disabled={saving}
            className="gap-1.5"
            title="Pobierz PDF na dysk"
          >
            <Download className="size-3.5" />
            Pobierz PDF
          </Button>
        </div>
      </div>

      <ImagePickerDialog
        uploadImageAction={uploadImageAction}
        productImages={productImages}
        open={imagePickerOpen}
        onClose={() => {
          setImagePickerOpen(false);
          imagePickerCallbackRef.current = null;
        }}
        onInsert={(url) => {
          const cb = imagePickerCallbackRef.current;
          if (cb) cb(url);
          imagePickerCallbackRef.current = null;
        }}
      />
    </div>
  );
}

// ─── HeaderRangesEditor — zakresy nagłówków per zakres stron ────────────
// Acceptance flow: nowy zakres przez formularz "Add" → po wciśnięciu Dodaj
// trafia do listy. Istniejące mają przyciski Edit / Save / Cancel — w trybie
// czytania pokazują podsumowanie, w trybie edycji aktywne inputy.

type HeaderDraft = {
  fromPage: number;
  toPage: number;
  lang: string;
  title: string;
  rightText: string;
  rightImageUrl: string | null;
};

function HeaderRangesEditor({
  ranges,
  totalPages,
  onChange,
  onPickImage,
  compact = false,
  filterLang,
  kind = "STANDARD",
}: {
  ranges: HeaderRange[];
  totalPages: number;
  onChange: (next: HeaderRange[]) => void;
  /** Callback do otwarcia ImagePickerDialog. Wywołany przez form do wyboru
   *  obrazka dla prawego slotu nagłówka. */
  onPickImage: (setSrc: (url: string) => void) => void;
  /** Tryb wąski — używany w sidebarze SPIS TREŚCI. Wyłącza prawą kolumnę
   *  z hint-em i kompaktuje layout. */
  compact?: boolean;
  /** Filtr po języku — gdy ustawiony, lista wyświetla tylko zakresy tego
   *  języka. Nowy range tworzony też dostaje ten lang. Klikanie istniejących
   *  rangów innych języków sortowane wyżej w UI. */
  filterLang?: string | null;
  /** STANDARD: body[0] = strona 3. LEAFLET: body[0] = strona 2 (sec 0). */
  kind?: ManualKindT;
}) {
  const isLeaflet = kind === "LEAFLET";
  /** Minimalna fizyczna strona dla zakresu — w LEAFLET cover=1 więc body=2,
   *  w STANDARD cover=1 + TOC=2 więc body=3. */
  const minBodyPage = isLeaflet ? 2 : 3;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HeaderDraft | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  function startAdd() {
    // Body pages zaczynają się od fizycznej strony 3 (STANDARD: po cover+TOC)
    // lub 2 (LEAFLET: po samym cover). Nigdy nie sugerujemy zakresu dla okładki.
    const lastEnd = ranges.reduce((max, r) => Math.max(max, r.toPage), 0);
    const start = Math.max(
      minBodyPage,
      Math.min(lastEnd + 1, Math.max(totalPages, minBodyPage)),
    );
    setAddingNew(true);
    setEditingId(null);
    setDraft({
      fromPage: start,
      toPage: Math.max(start, totalPages),
      // Domyślny lang = filterLang (bieżący język) gdy filtr ustawiony,
      // inaczej PL jak wcześniej.
      lang: filterLang ?? "PL",
      title: "",
      rightText: "",
      rightImageUrl: null,
    });
  }

  function startEdit(r: HeaderRange) {
    setEditingId(r.id);
    setAddingNew(false);
    setDraft({
      fromPage: r.fromPage,
      toPage: r.toPage,
      lang: r.lang ?? "",
      title: r.title ?? "",
      rightText: r.rightText ?? "",
      rightImageUrl: r.rightImageUrl,
    });
  }

  function cancel() {
    setEditingId(null);
    setAddingNew(false);
    setDraft(null);
  }

  function commit() {
    if (!draft) return;
    if (draft.fromPage < 1 || draft.toPage < draft.fromPage) {
      toast.error("Sprawdź zakres stron — od ≤ do, oba > 0");
      return;
    }
    if (addingNew) {
      onChange([
        ...ranges,
        {
          id: `hr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fromPage: draft.fromPage,
          toPage: draft.toPage,
          lang: draft.lang || null,
          title: draft.title || null,
          rightText: draft.rightText || null,
          rightImageUrl: draft.rightImageUrl,
        },
      ]);
    } else if (editingId) {
      onChange(
        ranges.map((r) =>
          r.id === editingId
            ? {
                ...r,
                fromPage: draft.fromPage,
                toPage: draft.toPage,
                lang: draft.lang || null,
                title: draft.title || null,
                rightText: draft.rightText || null,
                rightImageUrl: draft.rightImageUrl,
              }
            : r,
        ),
      );
    }
    cancel();
  }

  function removeRange(id: string) {
    if (!confirm("Usunąć ten zakres?")) return;
    onChange(ranges.filter((r) => r.id !== id));
    if (editingId === id) cancel();
  }

  return (
    <div
      className={cn(
        "rounded-md space-y-1.5",
        compact
          ? "px-1 py-1"
          : "bg-rose-50/40 border border-rose-100 px-3 py-2 space-y-2",
      )}
    >
      {/* Tytuł sekcji — pokazywany tylko w non-compact (gdy ramka rose-50).
          W compact (sidebar TOC) jest już nadrzędny nagłówek „Spis treści",
          więc nie dublujemy etykiety. */}
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-rose-700 font-bold">
            NAGŁÓWKI · str. 1-2 auto + {ranges.length}{" "}
            {ranges.length === 1 ? "własny" : "własnych"}
          </span>
        </div>
      )}

      {/* Lista istniejących zakresów */}
      <div className="space-y-1.5">
        {/* Sztywne wpisy dla stron 1-2 (cover + TOC). W compact mode (sidebar)
            sidebar już je pokazuje jako "Okładka" / "Spis treści", więc tu
            pomijamy żeby nie duplikować. */}
        {!compact && (
          <>
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center bg-slate-100/70 ring-1 ring-slate-200 rounded px-2.5 py-1.5">
              <span className="text-[10px] text-slate-500 font-semibold tabular-nums">
                1
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white px-1.5 py-0.5 rounded ring-1 ring-slate-200">
                AUTO
              </span>
              <span className="text-xs text-slate-700 italic">
                Instrukcja obsługi (okładka)
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                zablokowane
              </span>
            </div>
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center bg-slate-100/70 ring-1 ring-slate-200 rounded px-2.5 py-1.5">
              <span className="text-[10px] text-slate-500 font-semibold tabular-nums">
                2
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-white px-1.5 py-0.5 rounded ring-1 ring-slate-200">
                AUTO
              </span>
              <span className="text-xs text-slate-700 italic">Spis treści</span>
              <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">
                zablokowane
              </span>
            </div>
          </>
        )}
        {/* Lista zakresów — gdy `filterLang` ustawione, pokazujemy tylko
            zakresy tego języka. Index jest WEWNĄTRZ filtra (#1, #2, ...) —
            user nie widzi pełnej numeracji ale za to czyściej. */}
        {(() => {
          const displayRanges = filterLang
            ? ranges.filter((r) => (r.lang ?? "PL") === filterLang)
            : ranges;
          // Empty state — pokazujemy tylko w non-compact gdzie nie ma
          // innego kontekstu.
          if (displayRanges.length === 0 && !addingNew && !compact) {
            return (
              <div className="text-[10px] italic text-slate-500 px-1.5 py-1 text-center bg-white/60 rounded ring-1 ring-slate-100">
                Strony 3+: dodaj zakres żeby pokazać język + tytuł w nagłówku PDF.
              </div>
            );
          }
          if (displayRanges.length === 0 && filterLang) {
            return (
              <div className="text-[10px] italic text-slate-400 px-1.5 py-1 text-center">
                Brak zakresów dla {filterLang} — dodaj poniżej.
              </div>
            );
          }
          return displayRanges.map((r, i) => {
          const isEditing = editingId === r.id;
          if (isEditing && draft) {
            return (
              <RangeEditForm
                key={r.id}
                index={i + 1}
                draft={draft}
                setDraft={setDraft}
                onCommit={commit}
                onCancel={cancel}
                onPickImage={onPickImage}
                compact={compact}
              />
            );
          }
          // Compact (sidebar): wąsko, bez kolumny rightText
          if (compact) {
            return (
              <div
                key={r.id}
                className="grid grid-cols-[auto_auto_auto_1fr_auto_auto] gap-1 items-center bg-white ring-1 ring-rose-100 rounded px-1.5 py-1"
              >
                <span className="text-[10px] text-rose-700 font-semibold tabular-nums">
                  #{i + 1}
                </span>
                <span className="text-[10px] font-semibold tabular-nums text-slate-700">
                  {r.fromPage}–{r.toPage}
                </span>
                {r.lang ? (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-1 rounded">
                    {r.lang}
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-400">—</span>
                )}
                <span className="text-[11px] text-slate-700 truncate">
                  {r.title || (
                    <span className="italic text-slate-400">(brak tytułu)</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  className="size-5 grid place-items-center text-indigo-700 hover:bg-indigo-50 rounded"
                  title="Edytuj"
                >
                  <span className="text-[10px]">✎</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRange(r.id)}
                  className="size-5 grid place-items-center text-rose-600 hover:bg-rose-100 rounded"
                  title="Usuń"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            );
          }
          return (
            <div
              key={r.id}
              className="grid grid-cols-[auto_auto_auto_1fr_auto_auto_auto] gap-2 items-center bg-white ring-1 ring-rose-100 rounded px-2.5 py-1.5"
            >
              <span className="text-[10px] text-rose-700 font-semibold tabular-nums">
                #{i + 1}
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-700">
                {r.fromPage}–{r.toPage}
              </span>
              {r.lang ? (
                <span className="text-[10px] font-bold uppercase tracking-widest text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
                  {r.lang}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 italic">—</span>
              )}
              <span className="text-xs text-slate-700 truncate">
                {r.title || (
                  <span className="italic text-slate-400">(brak tytułu)</span>
                )}
              </span>
              {/* Dodatkowy tekst po prawej (np. wersja, numer instrukcji) */}
              {r.rightText ? (
                <span
                  className="text-[10px] text-slate-600 truncate max-w-[120px] italic"
                  title="Tekst w prawej części nagłówka"
                >
                  „{r.rightText}"
                </span>
              ) : (
                <span className="text-[10px] text-slate-300">—</span>
              )}
              <button
                type="button"
                onClick={() => startEdit(r)}
                className="text-[10px] text-indigo-700 hover:text-indigo-900 hover:underline font-medium px-1"
                title="Edytuj zakres"
              >
                Edytuj
              </button>
              <button
                type="button"
                onClick={() => removeRange(r.id)}
                className="size-6 rounded grid place-items-center text-rose-600 hover:bg-rose-100"
                title="Usuń zakres"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          );
          });
        })()}

        {/* Form dodawania nowego */}
        {addingNew && draft && (
          <RangeEditForm
            index={ranges.length + 1}
            draft={draft}
            setDraft={setDraft}
            onCommit={commit}
            onCancel={cancel}
            onPickImage={onPickImage}
            isNew
            compact={compact}
          />
        )}
      </div>

      {/* Add button — tylko gdy nie ma aktywnej edycji */}
      {!addingNew && editingId == null && (
        <button
          type="button"
          onClick={startAdd}
          className="text-[11px] text-indigo-700 hover:text-indigo-900 hover:underline inline-flex items-center gap-1 font-medium"
        >
          <Plus className="size-3" />
          {ranges.length === 0 ? "Dodaj pierwszy zakres" : "Dodaj kolejny zakres"}
        </button>
      )}
    </div>
  );
}

function RangeEditForm({
  index,
  draft,
  setDraft,
  onCommit,
  onCancel,
  onPickImage,
  isNew,
  compact = false,
}: {
  index: number;
  draft: HeaderDraft;
  setDraft: React.Dispatch<React.SetStateAction<HeaderDraft | null>>;
  onCommit: () => void;
  onCancel: () => void;
  onPickImage: (setSrc: (url: string) => void) => void;
  isNew?: boolean;
  compact?: boolean;
}) {
  void onPickImage;

  // Compact (sidebar): stack vertically — 2 rzędy + przyciski na 3
  if (compact) {
    return (
      <div
        className={cn(
          "rounded ring-2 px-2 py-1.5 space-y-1.5",
          isNew ? "ring-emerald-400 bg-emerald-50/40" : "ring-indigo-400 bg-white",
        )}
      >
        {/* Rząd 1: # + od–do strony */}
        <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-1 items-center">
          <span className="text-[10px] text-indigo-700 font-semibold tabular-nums px-0.5">
            #{index}
          </span>
          <Input
            type="number"
            min={1}
            value={draft.fromPage}
            onChange={(e) =>
              setDraft((d) =>
                d ? { ...d, fromPage: Number(e.target.value) || 1 } : d,
              )
            }
            className="h-7 text-[11px] text-center tabular-nums"
            title="Od strony"
          />
          <span className="text-[10px] text-slate-500">→</span>
          <Input
            type="number"
            min={draft.fromPage}
            value={draft.toPage}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? { ...d, toPage: Number(e.target.value) || draft.fromPage }
                  : d,
              )
            }
            className="h-7 text-[11px] text-center tabular-nums"
            title="Do strony"
          />
        </div>
        {/* Rząd 2: język + tytuł */}
        <div className="grid grid-cols-[70px_1fr] gap-1 items-center">
          <Input
            placeholder="PL"
            value={draft.lang}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, lang: e.target.value } : d))
            }
            maxLength={6}
            className="h-7 text-[11px] font-bold uppercase text-center"
            title="Język"
          />
          <Input
            placeholder="Tytuł (np. Mocowanie)"
            value={draft.title}
            onChange={(e) =>
              setDraft((d) => (d ? { ...d, title: e.target.value } : d))
            }
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(ev) => {
              if (ev.key === "Enter") onCommit();
              if (ev.key === "Escape") onCancel();
            }}
          />
        </div>
        {/* Rząd 3: przyciski */}
        <div className="flex items-center gap-1.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-7 px-2 rounded bg-white ring-1 ring-slate-200 text-slate-700 text-[10px] hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={onCommit}
            className="h-7 px-3 rounded bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700"
          >
            {isNew ? "Dodaj" : "Zapisz"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded ring-2 px-2.5 py-2 space-y-1.5",
        isNew ? "ring-emerald-400 bg-emerald-50/40" : "ring-indigo-400 bg-white",
      )}
    >
      {/* Wiersz 1: zakres + język + tytuł */}
      <div className="grid grid-cols-[auto_60px_auto_60px_70px_1fr_auto_auto] gap-1.5 items-center">
        <span className="text-[10px] text-indigo-700 font-semibold tabular-nums">
          #{index}
        </span>
        <Input
          type="number"
          min={1}
          value={draft.fromPage}
          onChange={(e) =>
            setDraft((d) =>
              d ? { ...d, fromPage: Number(e.target.value) || 1 } : d,
            )
          }
          className="h-7 text-[11px] text-center tabular-nums"
          title="Od strony"
        />
        <span className="text-[10px] text-slate-500">do</span>
        <Input
          type="number"
          min={draft.fromPage}
          value={draft.toPage}
          onChange={(e) =>
            setDraft((d) =>
              d
                ? { ...d, toPage: Number(e.target.value) || draft.fromPage }
                : d,
            )
          }
          className="h-7 text-[11px] text-center tabular-nums"
          title="Do strony"
        />
        <Input
          placeholder="PL"
          value={draft.lang}
          onChange={(e) =>
            setDraft((d) => (d ? { ...d, lang: e.target.value } : d))
          }
          maxLength={6}
          className="h-7 text-[11px] font-bold uppercase text-center"
          title="Język"
        />
        <Input
          placeholder="Tytuł sekcji (np. Mocowanie)"
          value={draft.title}
          onChange={(e) =>
            setDraft((d) => (d ? { ...d, title: e.target.value } : d))
          }
          className="h-7 text-xs"
          title="Tytuł nagłówka"
          autoFocus
          onKeyDown={(ev) => {
            if (ev.key === "Enter") onCommit();
            if (ev.key === "Escape") onCancel();
          }}
        />
        <button
          type="button"
          onClick={onCommit}
          className="h-7 px-2 rounded bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700"
        >
          {isNew ? "Dodaj" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-7 px-2 rounded bg-white ring-1 ring-slate-200 text-slate-700 text-[10px] hover:bg-slate-50"
        >
          Anuluj
        </button>
      </div>

      {/* Wiersz 2: dodatkowy tekst po prawej (np. numer instrukcji, wersja).
          Logo jest globalne — ustawiane w panelu Styl, nie per-zakres. */}
      <div className="grid grid-cols-[auto_1fr] gap-2 items-center pl-7">
        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
          DODATKOWY TEKST:
        </span>
        <Input
          placeholder="np. wersja 1.2, nr instrukcji, kod — pokaże się gdy brak loga globalnego"
          value={draft.rightText}
          onChange={(e) =>
            setDraft((d) => (d ? { ...d, rightText: e.target.value } : d))
          }
          className="h-7 text-xs"
          title="Tekst w prawej części nagłówka — pomijany gdy ustawione logo globalne"
        />
      </div>
    </div>
  );
}

// ─── TOC sidebar (spis treści po lewej, z outline H1/H2) ────────────────

function TocSidebar({
  pages,
  langSections,
  headerRanges,
  totalPhysicalPages,
  currentSpreadIdx,
  currentLang,
  onJumpToSpread,
  onChangeRanges,
  onAddPage,
  onPickImage,
  kind = "STANDARD",
}: {
  pages: PageState[];
  langSections: LangSection[];
  headerRanges: HeaderRange[];
  totalPhysicalPages: number;
  currentSpreadIdx: number;
  /** Język aktualnie wyświetlany — tylko sekcja tego języka jest rozwinięta,
   *  pozostałe pokazują tylko zwijany nagłówek z liczbą stron. */
  currentLang: ManualLanguageT;
  /** Skok do spreadu. Drugi argument: opcjonalny bodyIdx do focusowania. */
  onJumpToSpread: (spreadIdx: number, bodyIdx: number | null) => void;
  onChangeRanges: (next: HeaderRange[]) => void;
  onAddPage: () => void;
  onPickImage: (setSrc: (url: string) => void) => void;
  /** STANDARD lub LEAFLET — wpływa na obecność TOC/Wyrównanie/Ostatnia */
  kind?: ManualKindT;
}) {
  const isLeaflet = kind === "LEAFLET";
  // Spread dla body[k] w sekcji (lokalnie):
  //   body[0] → spread 1 (TOC + body[0])
  //   body[k>=1] → spread = 1 + ceil(k / 2)
  const bodySpreadLocal = (bodyLocalIdx: number): number =>
    bodyLocalIdx === 0 ? 1 : 1 + Math.ceil(bodyLocalIdx / 2);

  return (
    <div className="rounded-md ring-1 ring-slate-200 bg-white p-2 space-y-2 h-fit sticky top-2">
      <div className="flex items-center justify-between gap-1.5 px-1">
        <div className="inline-flex items-center gap-1.5">
          <BookOpen className="size-3.5 text-indigo-600" />
          <span className="text-[10px] uppercase tracking-widest text-slate-700 font-bold">
            Spis treści
          </span>
        </div>
        <button
          type="button"
          onClick={onAddPage}
          className="text-[10px] font-medium text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5"
          title="Dodaj nową stronę body na końcu"
        >
          <Plus className="size-3" /> Strona
        </button>
      </div>
      <div className="space-y-0.5 max-h-[40vh] overflow-y-auto">
        {langSections.map((sec, secIdx) => {
          const bodyCount = sec.bodyIndices.length;
          const lastContentEven = (2 + bodyCount) % 2 === 0;
          const hasWyrównanie = !isLeaflet && lastContentEven;
          // Offset stron tej sekcji (suma stron poprzednich sekcji)
          const offset = isLeaflet
            ? langSections
                .slice(0, secIdx)
                .reduce(
                  (sum, s, i) =>
                    sum + (i === 0 ? 1 : 0) + s.bodyIndices.length,
                  0,
                )
            : langSections
                .slice(0, secIdx)
                .reduce(
                  (sum, s) =>
                    sum + 2 + s.bodyIndices.length + extraBlankCount(s.bodyIndices.length),
                  0,
                );
          const coverSpread = sec.startSpread;
          // W LEAFLET nie ma TOC slot — tocSpread niezdefiniowane efektywnie.
          const tocSpread = sec.startSpread + 1;
          // Wyrównanie siedzi na ostatnim spread'ie body (z body[last] na lewej)
          // lub na spread 1 sekcji jeśli bodyCount=0
          const wyrSpread =
            bodyCount === 0
              ? sec.startSpread + 1
              : sec.startSpread + bodySpreadLocal(bodyCount - 1);
          const lastSpread = sec.endSpread - 1;
          // Sekcja rozwinięta tylko jeśli to bieżący język — pozostałe
          // pokazują tylko collapsed header, klik = skok do okładki danego języka.
          const isExpanded = sec.lang === currentLang;
          if (!isExpanded) {
            // Collapsed: klikalny pasek z badge'm języka + liczba stron + chevron
            // LEAFLET: sec 0 = cover(1) + body[N]; sec i>0 = body[N] (bez cover).
            // STANDARD: cover + TOC + body + extras (Wyrównanie + Ostatnia).
            const totalSectionPages = isLeaflet
              ? (secIdx === 0 ? 1 : 0) + bodyCount
              : 2 + bodyCount + extraBlankCount(bodyCount);
            return (
              <button
                key={sec.lang}
                type="button"
                onClick={() => onJumpToSpread(coverSpread, null)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded flex items-center gap-2 transition-colors hover:bg-slate-50",
                  secIdx > 0 && "border-t border-slate-100 mt-0.5 pt-1.5",
                )}
                title={`Przejdź do sekcji ${sec.lang}`}
              >
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 bg-rose-100 text-rose-700 px-1 py-0.5 rounded">
                  {sec.lang}
                </span>
                <span className="text-[10px] text-slate-500 tabular-nums">
                  {totalSectionPages} stron
                </span>
                <span className="text-[10px] text-slate-300 italic ml-auto">
                  klik aby rozwinąć
                </span>
              </button>
            );
          }
          return (
            <div
              key={sec.lang}
              className={cn(
                secIdx > 0 && "border-t border-slate-200 pt-1 mt-1",
              )}
            >
              {/* Sekcja header — pokazuje język + info że jest aktywny */}
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 px-2 pb-0.5 flex items-center gap-1.5">
                <span className="bg-indigo-100 text-indigo-700 px-1 py-0.5 rounded">
                  {sec.lang}
                </span>
                <span className="text-slate-400 normal-case font-normal italic">
                  bieżąca sekcja
                </span>
              </div>
              {/* Okładka — STANDARD: per-lang. LEAFLET: tylko dla sec 0. */}
              {(!isLeaflet || secIdx === 0) && (
                <button
                  type="button"
                  onClick={() => onJumpToSpread(coverSpread, null)}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors",
                    currentSpreadIdx === coverSpread
                      ? "bg-indigo-100 text-indigo-800 font-semibold"
                      : "hover:bg-slate-50 text-slate-600",
                  )}
                >
                  <span className="tabular-nums text-[9px] font-bold text-slate-400 min-w-[16px]">
                    {offset + 1}
                  </span>
                  <span className="italic">Okładka</span>
                </button>
              )}
              {/* Spis treści — pomijany w LEAFLET */}
              {!isLeaflet && (
                <button
                  type="button"
                  onClick={() => onJumpToSpread(tocSpread, null)}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors",
                    currentSpreadIdx === tocSpread
                      ? "bg-indigo-100 text-indigo-800 font-semibold"
                      : "hover:bg-slate-50 text-slate-600",
                  )}
                >
                  <span className="tabular-nums text-[9px] font-bold text-slate-400 min-w-[16px]">
                    {offset + 2}
                  </span>
                  <span className="italic">Spis treści</span>
                </button>
              )}
              {/* Body pages tej sekcji */}
              {sec.bodyIndices.map((pageIdx, localI) => {
                // STANDARD: cover(1) + TOC(2) + body[localI] = offset+3+localI
                // LEAFLET: w sec 0: cover(1) + body[localI] = offset+2+localI
                //          w sec i>0: body[localI] = offset+1+localI
                const physicalPage = isLeaflet
                  ? offset + (secIdx === 0 ? 2 : 1) + localI
                  : offset + 3 + localI;
                const matched = resolveHeaderForPage(physicalPage, headerRanges);
                const headings = extractPageHeadings(pages[pageIdx]?.content ?? {});
                const fallbackH1 = headings.find((h) => h.level === 1)?.text ?? null;
                const title = matched?.title ?? fallbackH1;
                const targetSpread = isLeaflet
                  ? sec.startSpread + (secIdx === 0 ? 1 : 0) + localI
                  : sec.startSpread + bodySpreadLocal(localI);
                const isCurrent = targetSpread === currentSpreadIdx;
                return (
                  <button
                    key={pageIdx}
                    type="button"
                    onClick={() => onJumpToSpread(targetSpread, pageIdx)}
                    className={cn(
                      "w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors",
                      isCurrent
                        ? "bg-indigo-100 text-indigo-800 font-semibold"
                        : "hover:bg-slate-50 text-slate-600",
                    )}
                  >
                    <span className="tabular-nums text-[9px] font-bold text-slate-400 min-w-[16px]">
                      {physicalPage}
                    </span>
                    <span className="truncate">
                      {title ?? (
                        <span className="italic text-slate-400">
                          (brak nagłówka)
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              {/* Wyrównanie (opcjonalnie) — tytuł z header range jeśli pasuje,
                  fallback do strony poprzedniej (alignment dziedziczy nagłówek
                  ostatniej body strony) */}
              {hasWyrównanie &&
                (() => {
                  const wyrPhysical = offset + bodyCount + 3;
                  const matchedWyr =
                    resolveHeaderForPage(wyrPhysical, headerRanges) ??
                    resolveHeaderForPage(wyrPhysical - 1, headerRanges);
                  return (
                    <button
                      type="button"
                      onClick={() => onJumpToSpread(wyrSpread, null)}
                      className={cn(
                        "w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors",
                        currentSpreadIdx === wyrSpread
                          ? "bg-slate-200 text-slate-800 font-semibold"
                          : "hover:bg-slate-50 text-slate-500",
                      )}
                    >
                      <span className="tabular-nums text-[9px] font-bold text-slate-400 min-w-[16px]">
                        {wyrPhysical}
                      </span>
                      <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-1 rounded">
                        AUTO
                      </span>
                      {matchedWyr?.title ? (
                        <span className="flex-1 truncate">
                          {matchedWyr.title}
                        </span>
                      ) : (
                        <span className="italic flex-1">Wyrównanie</span>
                      )}
                    </button>
                  );
                })()}
              {/* Ostatnia — pomijana w LEAFLET */}
              {!isLeaflet && (
                <button
                  type="button"
                  onClick={() => onJumpToSpread(lastSpread, null)}
                  className={cn(
                    "w-full text-left px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition-colors",
                    currentSpreadIdx === lastSpread
                      ? "bg-rose-100 text-rose-800 font-semibold"
                      : "hover:bg-rose-50 text-rose-700",
                  )}
                >
                  <span className="tabular-nums text-[9px] font-bold text-rose-400 min-w-[16px]">
                    {offset + 2 + bodyCount + (hasWyrównanie ? 2 : 1)}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-1 rounded">
                    AUTO
                  </span>
                  <span className="italic flex-1 font-semibold">Ostatnia</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Embed: edycja nagłówków zakresami stron */}
      <div className="border-t border-slate-200 pt-2">
        <HeaderRangesEditor
          ranges={headerRanges}
          totalPages={totalPhysicalPages}
          onChange={onChangeRanges}
          onPickImage={onPickImage}
          compact
          filterLang={currentLang}
          kind={kind}
        />
      </div>
    </div>
  );
}

// ─── CoverPagePreview — wirtualna strona 1 (okładka) ────────────────────
//
// "Instrukcja obsługi" na górze (stały tytuł), wycentrowane logo (poziomo +
// pionowo), edytowalny podtytuł pod logiem. Resize loga przez przyciski.
// Skalowanie do edytora: zakładamy szerokość strony A4 = 595pt jako baseline.
function CoverPagePreview({
  width,
  height,
  logoImageUrl,
  logoHeightPt,
  coverSubtitle,
  fontFamily,
  bodyFontSize,
  h1FontSize,
  activeLanguages,
  currentLang,
  onPickLogo,
  onRemoveLogo,
  onChangeSubtitle,
  onChangeLogoSize,
}: {
  width: number;
  height: number;
  logoImageUrl: string | null;
  logoHeightPt: number | null;
  coverSubtitle: string;
  fontFamily: string | null;
  bodyFontSize: number | null;
  h1FontSize: number | null;
  /** Lista aktywnych języków — renderowana jako pasek pod podtytułem.
   *  Na 1. okładce wszystkie języki, na kolejnych tylko język danej sekcji. */
  activeLanguages: ManualLanguageT[];
  /** Język tej okładki — używany do podświetlenia w liście wielu badge'ów. */
  currentLang?: ManualLanguageT;
  onPickLogo: () => void;
  onRemoveLogo: () => void;
  onChangeSubtitle: (v: string) => void;
  onChangeLogoSize: (pt: number) => void;
}) {
  const effLogoPt = logoHeightPt ?? 60;
  // 595pt = szerokość A4. width to px-rozmiar w edytorze. Skalujemy logo do px.
  const logoHeightPx = Math.max(24, effLogoPt * (width / 595));
  const logoMaxWidthPx = width * 0.78;

  // Reset error state gdy URL się zmienia (np. po re-uploadzie).
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [logoImageUrl]);

  const showImage = logoImageUrl && !imageFailed;

  // Subtitle size = bodyFontSize (user-set, default 11pt). Konwersja pt na
  // px: 1pt ≈ 1.33px. Skalujemy do edytora (width/595 A4 baseline).
  const editorScale = width / 595;
  void h1FontSize; // tytuł "Instrukcja obsługi" usunięty z okładki
  const subtitlePx = (bodyFontSize ?? 11) * 1.33 * editorScale;

  return (
    <div
      className="bg-white shadow-md ring-1 ring-slate-300 rounded-sm relative overflow-hidden flex flex-col"
      style={{
        width,
        minHeight: height,
        fontFamily: fontFamily ?? undefined,
        color: "#1f2937",
      }}
    >
      {/* Wycentrowane logo + podtytuł pod nim. text-center + items-center +
          justify-center → wymusza centrowanie poziome i pionowe wszystkich
          dzieci. mx-auto na wrapperach upewnia że obraz nie ucieka w lewo.
          Brak sztywnego tytułu „Instrukcja obsługi" — strona okładki jest
          minimalistyczna, tylko logo + opcjonalny podtytuł. */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 py-3 text-center">
        {showImage ? (
          <div className="relative group/logo mx-auto inline-block">
            <button
              type="button"
              onClick={onPickLogo}
              className="block rounded ring-1 ring-transparent hover:ring-indigo-300 transition-colors mx-auto"
              title="Kliknij aby zmienić logo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoImageUrl}
                alt=""
                onError={() => setImageFailed(true)}
                style={{
                  display: "block",
                  height: logoHeightPx,
                  maxWidth: logoMaxWidthPx,
                  width: "auto",
                  objectFit: "contain",
                  margin: "0 auto",
                }}
              />
            </button>
            <span
              role="button"
              onClick={onRemoveLogo}
              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-rose-600 text-white text-[10px] grid place-items-center opacity-0 group-hover/logo:opacity-100 transition-opacity cursor-pointer"
              title="Usuń logo"
            >
              ×
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPickLogo}
            className={cn(
              "mx-auto px-4 py-3 rounded-md ring-1 ring-dashed transition-colors text-xs inline-flex flex-col items-center gap-1",
              imageFailed
                ? "ring-rose-300 bg-rose-50/50 hover:ring-rose-400 hover:bg-rose-50 text-rose-700"
                : "ring-slate-300 bg-slate-50 hover:ring-indigo-400 hover:bg-indigo-50/50 text-slate-500",
            )}
            title={
              imageFailed
                ? `Plik nie ładuje się (${logoImageUrl}) — kliknij aby wgrać nowy`
                : "Wgraj logo na okładkę"
            }
          >
            <FileImage className="size-5" />
            <span>
              {imageFailed
                ? "Logo nie ładuje się — kliknij aby wgrać ponownie"
                : "Kliknij aby dodać logo"}
            </span>
          </button>
        )}

        {/* Resize controls — pokazują się tylko gdy logo realnie się ładuje */}
        {showImage && (
          <div className="flex items-center gap-1.5 bg-slate-50 rounded-full ring-1 ring-slate-200 px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => onChangeLogoSize(Math.max(40, effLogoPt - 20))}
              disabled={effLogoPt <= 40}
              className="size-5 rounded-full hover:bg-white grid place-items-center text-slate-600 disabled:opacity-30"
              title="Pomniejsz logo"
            >
              <Minus className="size-2.5" />
            </button>
            <span className="text-[9px] font-semibold tabular-nums text-slate-600 min-w-[24px] text-center">
              {effLogoPt}pt
            </span>
            <button
              type="button"
              onClick={() => onChangeLogoSize(Math.min(280, effLogoPt + 20))}
              disabled={effLogoPt >= 280}
              className="size-5 rounded-full hover:bg-white grid place-items-center text-slate-600 disabled:opacity-30"
              title="Powiększ logo"
            >
              <Plus className="size-2.5" />
            </button>
          </div>
        )}

        {/* Edytowalny podtytuł — używa user-set bodyFontSize żeby zgrać się z PDF */}
        <textarea
          value={coverSubtitle}
          onChange={(e) => onChangeSubtitle(e.target.value)}
          placeholder="Wpisz podtytuł (np. nazwa produktu, wersja)…"
          rows={2}
          style={{
            fontSize: subtitlePx,
            fontFamily: "inherit",
            lineHeight: 1.4,
            color: "#475569",
          }}
          className="w-full max-w-[90%] text-center bg-transparent border-0 border-b border-dashed border-slate-200 focus:border-indigo-400 focus:outline-none px-1 py-1 resize-none placeholder:text-slate-300 placeholder:italic"
        />

        {/* Aktywne języki — gdy lista zawiera >1 lang, podświetlamy aktualny
            (currentLang) na ciemno, pozostałe na szaro. Single lang renderuje
            się jako standardowy badge. */}
        {activeLanguages.length > 0 && (
          <div
            className="tracking-wider font-semibold mt-2 flex flex-wrap justify-center"
            style={{ fontSize: subtitlePx * 0.85, letterSpacing: "0.08em" }}
          >
            {activeLanguages.map((lang, i) => (
              <span
                key={lang}
                className={cn(
                  lang === currentLang ? "text-slate-900" : "text-slate-400",
                )}
              >
                {lang}
                {i < activeLanguages.length - 1 && (
                  <span className="text-slate-300 mx-1">·</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TocPagePreview — wirtualna strona 2 (spis treści) ──────────────────
function TocPagePreview({
  width,
  height,
  tocEntries,
  fontFamily,
  bodyFontSize,
  h1FontSize,
  lang,
}: {
  width: number;
  height: number;
  tocEntries: { text: string; pages: string }[];
  fontFamily: string | null;
  bodyFontSize: number | null;
  h1FontSize: number | null;
  /** Język sekcji — etykieta TOC i pusty stan są tłumaczone wg `lang`. */
  lang?: ManualLanguageT;
}) {
  const TOC_LABELS_LOCAL: Record<ManualLanguageT, string> = {
    PL: "Spis treści",
    EN: "Table of Contents",
    DE: "Inhaltsverzeichnis",
    UA: "Зміст",
    SK: "Obsah",
    RO: "Cuprins",
    CS: "Obsah",
    HU: "Tartalomjegyzék",
    BG: "Съдържание",
  };
  const TOC_EMPTY_LOCAL: Record<ManualLanguageT, string> = {
    PL: "(Brak wpisów. Dodaj nagłówki H1 na stronach.)",
    EN: "(No entries. Add H1 headings on pages.)",
    DE: "(Keine Einträge. Fügen Sie H1-Überschriften auf den Seiten hinzu.)",
    UA: "(Немає записів. Додайте заголовки H1 на сторінках.)",
    SK: "(Žiadne položky. Pridajte nadpisy H1 na stránky.)",
    RO: "(Fără intrări. Adăugați titluri H1 pe pagini.)",
    CS: "(Žádné položky. Přidejte nadpisy H1 na stránky.)",
    HU: "(Nincsenek bejegyzések. Adjon hozzá H1 címeket az oldalakhoz.)",
    BG: "(Няма записи. Добавете H1 заглавия на страниците.)",
  };
  const effLang = lang ?? "PL";
  const tocLabel = TOC_LABELS_LOCAL[effLang];
  const emptyMsg = TOC_EMPTY_LOCAL[effLang];
  const editorScale = width / 595;
  const titlePx = (h1FontSize ?? 22) * 1.33 * editorScale;
  const entryPx = (bodyFontSize ?? 11) * 1.33 * editorScale;

  return (
    <div
      className="bg-white shadow-md ring-1 ring-slate-300 rounded-sm relative overflow-hidden flex flex-col"
      style={{
        width,
        minHeight: height,
        fontFamily: fontFamily ?? undefined,
        color: "#1f2937",
      }}
    >
      <div className="px-5 pt-6 pb-4 flex-1">
        <div
          className="font-bold tracking-tight mb-2 pb-1 border-b border-slate-300"
          style={{ fontSize: titlePx, color: "#0f172a", lineHeight: 1.2 }}
        >
          {tocLabel}
        </div>
        {tocEntries.length === 0 ? (
          <div
            className="italic leading-relaxed"
            style={{ fontSize: entryPx * 0.85, color: "#94a3b8" }}
          >
            {emptyMsg}
          </div>
        ) : (
          <div className="space-y-1">
            {tocEntries.map((e, i) => (
              <div
                key={i}
                className="flex items-baseline gap-2"
                style={{ fontSize: entryPx, color: "#0f172a" }}
              >
                <span className="truncate">{e.text}</span>
                <span className="flex-1 border-b border-dotted border-slate-300 mb-0.5" />
                <span className="tabular-nums" style={{ color: "#475569" }}>
                  {e.pages}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StyleSettingsPanel — sztywne ustawienia typograficzne ──────────────

function StyleSettingsPanel({
  style,
  pageSize,
  onPageSizeChange,
  onChange,
}: {
  style: ManualStyleSettings;
  pageSize: ManualPageSizeT;
  onPageSizeChange: (next: ManualPageSizeT) => void;
  onChange: (next: ManualStyleSettings) => void;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/40 px-3 py-2 flex flex-wrap items-center gap-3">
      <div className="size-7 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
        <Type className="size-3.5" />
      </div>
      <div className="text-[10px] uppercase tracking-widest text-slate-700 font-bold">
        Ustawienia ogólne instrukcji
      </div>

      {/* Format strony — A4 / A5 / A6 */}
      <div className="flex items-center gap-1">
        <Label className="text-[10px] text-slate-500">Format:</Label>
        {(["A4", "A5", "A6"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPageSizeChange(s)}
            className={cn(
              "px-2 py-0.5 rounded ring-1 text-[11px] font-semibold tabular-nums transition-colors",
              pageSize === s
                ? "bg-emerald-100 text-emerald-800 ring-emerald-300"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
            )}
            title={PAGE_SIZE_LABEL[s]}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Font family — dropdown */}
      <div className="flex items-center gap-1.5">
        <Label className="text-[10px] text-slate-500">Krój:</Label>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="h-7 px-2 rounded ring-1 ring-slate-200 bg-white inline-flex items-center gap-1 text-xs text-slate-700 hover:bg-slate-50 min-w-[110px]"
              >
                <span
                  className="truncate"
                  style={{ fontFamily: style.fontFamily ?? "inherit" }}
                >
                  {style.fontFamily ?? "Domyślny"}
                </span>
                <ChevronDown className="size-3 opacity-60 ml-auto" />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              onClick={() => onChange({ ...style, fontFamily: null })}
            >
              <span className="text-xs italic text-muted-foreground">
                Domyślny (Roboto)
              </span>
            </DropdownMenuItem>
            {MANUAL_FONTS.map((f) => (
              <DropdownMenuItem
                key={f.family}
                onClick={() => onChange({ ...style, fontFamily: f.family })}
                className="flex flex-col items-start"
              >
                <span
                  className="text-sm font-medium"
                  style={{ fontFamily: f.family }}
                >
                  {f.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {f.description}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Rozmiary fontu */}
      {(
        [
          { label: "Tekst", key: "bodyFontSize" },
          { label: "H1", key: "h1FontSize" },
          { label: "H2", key: "h2FontSize" },
          { label: "H3", key: "h3FontSize" },
        ] as const
      ).map(({ label, key }) => (
        <div key={key} className="flex items-center gap-1">
          <Label className="text-[10px] text-slate-500">{label}:</Label>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="h-7 px-1.5 rounded ring-1 ring-slate-200 bg-white inline-flex items-center gap-0.5 text-[11px] text-slate-700 hover:bg-slate-50 tabular-nums"
                >
                  <span className="font-semibold">
                    {style[key] ?? "—"}
                  </span>
                  <span className="text-[9px] text-slate-400">pt</span>
                  <ChevronDown className="size-2.5 opacity-60" />
                </button>
              }
            />
            <DropdownMenuContent align="start" className="w-36 p-0">
              <FontSizePickerContent
                resetLabel="Auto"
                onPick={(size) => onChange({ ...style, [key]: size })}
                onReset={() => onChange({ ...style, [key]: null })}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
    </div>
  );
}

// ─── FontSizePickerContent — quick-pick + custom input ─────────────────
//
// Pokazuje pole input (4-200pt) + listę quick-picków. User może wpisać dowolny
// rozmiar — np. 4.5, 35, 200 — i Enter zatwierdza. Quick-picki to FONT_SIZES.
function FontSizePickerContent({
  onPick,
  onReset,
  resetLabel = "Domyślny",
}: {
  onPick: (size: number) => void;
  onReset: () => void;
  resetLabel?: string;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);

  const apply = () => {
    const n = Number(input);
    if (
      !Number.isFinite(n) ||
      n < FONT_SIZE_MIN ||
      n > FONT_SIZE_MAX ||
      !Number.isInteger(n)
    ) {
      setError(true);
      return;
    }
    setError(false);
    setInput("");
    onPick(n);
  };

  return (
    <div className="flex flex-col">
      {/* Custom input — wpisz dowolny rozmiar i Enter zatwierdza */}
      <div className="px-2 py-1.5 border-b border-slate-100 space-y-1">
        <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold px-0.5">
          Wpisz rozmiar ({FONT_SIZE_MIN}–{FONT_SIZE_MAX})
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            step={1}
            value={input}
            onChange={(ev) => {
              setInput(ev.target.value);
              if (error) setError(false);
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                apply();
              }
              ev.stopPropagation();
            }}
            placeholder="np. 11"
            className={cn(
              "flex-1 h-7 px-2 rounded ring-1 bg-white text-xs tabular-nums focus:outline-none focus:ring-2",
              error
                ? "ring-rose-400 focus:ring-rose-500"
                : "ring-slate-200 focus:ring-indigo-400",
            )}
          />
          <span className="text-[9px] text-slate-500">pt</span>
          <button
            type="button"
            onClick={apply}
            className="h-7 px-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-semibold"
            title="Zastosuj"
          >
            OK
          </button>
        </div>
      </div>
      {/* Quick-picki */}
      <DropdownMenuItem onClick={onReset}>
        <span className="text-xs italic text-muted-foreground">
          {resetLabel}
        </span>
      </DropdownMenuItem>
      <div className="max-h-60 overflow-y-auto">
        {FONT_SIZES.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => onPick(s)}
            className="tabular-nums"
          >
            {s} pt
          </DropdownMenuItem>
        ))}
      </div>
    </div>
  );
}

// ─── ColorPickerContent — popup z paletą + HEX inputem ──────────────────
//
// Zawiera 3 sekcje:
//   1) Predefiniowane kolory (COLOR_SWATCHES) — zawsze widoczne
//   2) Zapisane własne kolory (customColors) — z localStorage, dedupe, max 12
//   3) HEX input — wpisz kolor, Enter lub przycisk dodaje + zastosowuje
//
// Brak własnego editora prop nie jest tu wspierany — komponenty wyłączone
// gdy editor=null (przy braku focusu w toolbar).
function ColorPickerContent({
  editor,
  customColors,
  onRememberColor,
  onRemoveCustomColor,
}: {
  editor: Editor | null;
  customColors: string[];
  onRememberColor: (hex: string) => void;
  onRemoveCustomColor: (hex: string) => void;
}) {
  const [hexInput, setHexInput] = useState("");
  const [hexError, setHexError] = useState(false);

  const applyColor = (hex: string) => {
    if (!editor) return;
    editor.chain().focus().setColor(hex).run();
  };

  const submitHex = () => {
    const normalized = normalizeHex(hexInput);
    if (!normalized) {
      setHexError(true);
      return;
    }
    setHexError(false);
    applyColor(normalized);
    onRememberColor(normalized);
    setHexInput("");
  };

  return (
    <div className="space-y-2">
      {/* 1) Predefiniowane swatche */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-1">
          Kolor tekstu
        </div>
        <div className="grid grid-cols-5 gap-1">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c.value || "reset"}
              type="button"
              onClick={() => {
                if (!editor) return;
                if (c.value) applyColor(c.value);
                else editor.chain().focus().unsetColor().run();
              }}
              title={c.label}
              className={cn(
                "size-7 rounded ring-1 ring-slate-200 hover:ring-2 hover:ring-indigo-400 relative",
                !c.value &&
                  "bg-white text-[9px] text-slate-500 grid place-items-center",
              )}
              style={c.value ? { backgroundColor: c.value } : undefined}
            >
              {!c.value && "✕"}
            </button>
          ))}
        </div>
      </div>

      {/* 2) Zapisane własne kolory */}
      {customColors.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 px-1 flex items-center justify-between">
            <span>Zapisane</span>
            <span className="text-[9px] text-slate-400 italic normal-case">
              klik = użyj · prawy klik = usuń
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {customColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => applyColor(c)}
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  onRemoveCustomColor(c);
                }}
                title={`${c} (prawy klik aby usunąć)`}
                className="size-6 rounded ring-1 ring-slate-200 hover:ring-2 hover:ring-indigo-400 relative group/sw"
                style={{ backgroundColor: c }}
              >
                <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-rose-600 text-white text-[7px] grid place-items-center opacity-0 group-hover/sw:opacity-100 transition-opacity pointer-events-none">
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3) HEX input */}
      <div className="pt-1 border-t border-slate-100">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 px-1">
          Własny kolor (HEX)
        </div>
        <div className="flex items-center gap-1">
          <span
            className="size-7 rounded ring-1 ring-slate-200 shrink-0"
            style={{
              backgroundColor: normalizeHex(hexInput) ?? "transparent",
              backgroundImage: !normalizeHex(hexInput)
                ? "linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%), linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%)"
                : undefined,
              backgroundSize: !normalizeHex(hexInput) ? "8px 8px" : undefined,
              backgroundPosition: !normalizeHex(hexInput)
                ? "0 0, 4px 4px"
                : undefined,
            }}
          />
          <input
            type="text"
            value={hexInput}
            onChange={(ev) => {
              setHexInput(ev.target.value);
              if (hexError) setHexError(false);
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") {
                ev.preventDefault();
                submitHex();
              }
            }}
            placeholder="#1e293b"
            className={cn(
              "flex-1 h-7 px-2 rounded ring-1 bg-white text-xs font-mono uppercase tabular-nums focus:outline-none focus:ring-2",
              hexError
                ? "ring-rose-400 focus:ring-rose-500"
                : "ring-slate-200 focus:ring-indigo-400",
            )}
          />
          <button
            type="button"
            onClick={submitHex}
            disabled={!editor}
            className="h-7 px-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            title="Zastosuj kolor i zapisz w palecie"
          >
            Dodaj
          </button>
        </div>
        {hexError && (
          <div className="text-[9px] text-rose-600 mt-1 px-1">
            Nieprawidłowy HEX — użyj formatu #RGB lub #RRGGBB
          </div>
        )}
      </div>
    </div>
  );
}
