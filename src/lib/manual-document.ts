/**
 * Helpery do pracy z dokumentem instrukcji (TipTap JSON).
 *
 * Nowy format (od czerwca 2026): `{ pages: [{ id, content }] }`.
 * Stary format: pojedynczy TipTap `{ type: "doc", content: [...] }`.
 *
 * Plik bez "use server" — pure utility, używane zarówno przez server actions
 * jak i route handlery.
 */

/** Obsługiwane języki instrukcji. Wartości pasują do `ProductManual.activeLanguages`
 *  i atrybutu `page.lang`. Bułgarski (BG) wymaga fontu z cyrylicą — Roboto OK. */
/**
 * Sztywny kanoniczny porządek języków — używany do sortowania zarówno
 * activeLanguages jak i pages[]. Tabsy w UI zawsze wyświetlają się w tej
 * kolejności (bez drag-to-reorder), a sectionOffset w PDF/translate liczy
 * wg tego porządku.
 */
export const MANUAL_LANGUAGES = [
  "PL",
  "EN",
  "DE",
  "UA",
  "HU",
  "SK",
  "CS",
  "RO",
  "BG",
] as const;
export type ManualLanguage = (typeof MANUAL_LANGUAGES)[number];

/** Wyświetlana nazwa języka — używana w UI tabsów + nagłówku PDF (header pill). */
export const MANUAL_LANGUAGE_LABELS: Record<ManualLanguage, string> = {
  PL: "Polski",
  EN: "English",
  DE: "Deutsch",
  UA: "Українська",
  SK: "Slovenský",
  RO: "Română",
  CS: "Čeština",
  HU: "Magyar",
  BG: "Български",
};

/** Etykieta „Spis treści" w każdym wspieranym języku — używana na stronie TOC
 *  per-sekcja w PDF i preview edytora, żeby każda sekcja językowa miała
 *  tłumaczony nagłówek. */
export const MANUAL_TOC_LABEL: Record<ManualLanguage, string> = {
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

/** Komunikat „Brak wpisów" w każdym wspieranym języku — pokazany w pustym TOC. */
export const MANUAL_TOC_EMPTY: Record<ManualLanguage, string> = {
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

/** Słowo „Strona/Page/Seite/Сторінка/Strana/Pagina/Strana/Oldal/Страница" —
 *  fallback w TOC i innych miejscach gdzie pokazujemy „Strona X" gdy nie ma H1. */
export const MANUAL_PAGE_LABEL: Record<ManualLanguage, string> = {
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

/** Stróż typu — sprawdza czy string to poprawny ManualLanguage. */
export function isManualLanguage(s: unknown): s is ManualLanguage {
  return typeof s === "string" && (MANUAL_LANGUAGES as readonly string[]).includes(s);
}

/**
 * Posortuj listę języków wg kanonicznego porządku MANUAL_LANGUAGES.
 * Język niezdefiniowany (legacy) ląduje na końcu.
 */
export function sortLangsByCanonical<T extends string>(langs: T[]): T[] {
  return [...langs].sort((a, b) => {
    const ai = (MANUAL_LANGUAGES as readonly string[]).indexOf(a);
    const bi = (MANUAL_LANGUAGES as readonly string[]).indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/**
 * Przelicza fromPage/toPage w headerRanges po przeporządkowaniu sekcji
 * językowych. Każdy zakres jest „shiftowany" o różnicę między obecnym
 * oczekiwanym offsetem sekcji a starym (wywnioskowanym ze smallest
 * fromPage w zakresach danego języka).
 *
 * Założenie: dla każdego języka pierwszy range zaczyna się na body[0]
 * (czyli na fizycznej stronie oldSectionOffset + 3). Działa dla auto-
 * generowanych zakresów (z tłumaczeń) oraz dla ręcznie tworzonych jeśli
 * user zaczynał od pierwszej body strony.
 */
export function renumberHeaderRanges<
  R extends { lang?: string | null; fromPage: number; toPage: number },
>(
  pages: { lang?: string | null }[],
  activeLanguages: string[],
  ranges: R[],
  kind: "STANDARD" | "LEAFLET" = "STANDARD",
): R[] {
  const isLeaflet = kind === "LEAFLET";
  // Oblicz oczekiwany offset sekcji per język wg porządku activeLanguages
  const expectedOffsetByLang = new Map<string, number>();
  let cursor = 0;
  for (let i = 0; i < activeLanguages.length; i++) {
    const lang = activeLanguages[i];
    expectedOffsetByLang.set(lang, cursor);
    const bodyCount = pages.filter((p) => (p.lang ?? "PL") === lang).length;
    if (isLeaflet) {
      // LEAFLET: tylko cover (sec 0) + body, bez TOC/Wyrównanie/Ostatnia
      cursor += (i === 0 ? 1 : 0) + bodyCount;
    } else {
      // STANDARD: 2 (cover+TOC) + body + 1 lub 2 extras
      const lastContentPage = 2 + bodyCount;
      const extras = lastContentPage % 2 === 0 ? 2 : 1;
      cursor += 2 + bodyCount + extras;
    }
  }

  // Pogrupuj zakresy po języku — żeby wywnioskować old offset z minimum
  const byLang = new Map<string, R[]>();
  for (const r of ranges) {
    const lang = (r.lang ?? "PL") as string;
    if (!byLang.has(lang)) byLang.set(lang, []);
    byLang.get(lang)!.push(r);
  }

  const out: R[] = [];
  for (const [lang, langRanges] of byLang) {
    const expectedOffset = expectedOffsetByLang.get(lang) ?? 0;
    const minFromPage = Math.min(...langRanges.map((r) => r.fromPage));
    // Inferowany old offset różny dla STANDARD vs LEAFLET:
    //   STANDARD: body[0] = oldOffset + 3 (po cover+TOC) → oldOffset = min - 3
    //   LEAFLET sec 0: body[0] = oldOffset + 2 (po cover) → oldOffset = min - 2
    //   LEAFLET sec i>0: body[0] = oldOffset + 1 → oldOffset = min - 1
    //   Heurystyka: gdy LEAFLET, sprawdzamy czy lang to activeLanguages[0]
    //   (sec 0 = ma cover) czy późniejszy.
    const langIdx = activeLanguages.indexOf(lang);
    const bodyStartOffset = isLeaflet
      ? langIdx === 0
        ? 2
        : 1
      : 3;
    const inferredOldOffset = minFromPage - bodyStartOffset;
    const shift = expectedOffset - inferredOldOffset;
    for (const r of langRanges) {
      out.push({
        ...r,
        fromPage: r.fromPage + shift,
        toPage: r.toPage + shift,
      });
    }
  }
  return out;
}

export type ManualPage = {
  id: string;
  /** Język tej strony. Brak / null = "PL" (kompatybilność wstecz dla starych instrukcji
   *  utworzonych przed multi-language). PDF renderuje sekwencyjnie wg `pages[]` order. */
  lang?: ManualLanguage;
  /** Czy zawartość strony była wygenerowana automatycznie przez Claude API.
   *  Flag użyteczna w UI — pokazujemy badge „🤖 auto" do code-review. */
  autoTranslated?: boolean;
  /** Timestamp ostatniej edycji odpowiadającej strony PL (źródło). Gdy strona
   *  PL została zmieniona PO tym timestamp'ie, tłumaczenie jest „stale" —
   *  pokazujemy ⚠ w UI i sugerujemy re-translate. */
  sourceUpdatedAt?: string;
  content: { type: "doc"; content?: Array<Record<string, unknown>> };
};

export type ManualDocument = {
  pages: ManualPage[];
  /** Lista aktywnych języków — wpływa na to które tabsy widoczne w edytorze
   *  i które sekcje generują się w PDF. Default ["PL"] dla wstecznej kompatybilności. */
  activeLanguages?: ManualLanguage[];
};

/**
 * Zakres nagłówka — definiuje który nagłówek pokazać na danych stronach.
 * Strony są 1-indexed. Jeśli zakresy się nakładają, wygrywa pierwszy w tablicy.
 *
 * `rightText` i `rightImageUrl` to opcjonalny slot po prawej stronie nagłówka
 * (np. logo firmy, kod kreskowy, dodatkowy podpis). Jeśli oba są podane,
 * preferowany jest `rightImageUrl`.
 */
export type HeaderRange = {
  id: string;
  fromPage: number;
  toPage: number;
  lang: string | null;
  title: string | null;
  rightText: string | null;
  rightImageUrl: string | null;
};

/**
 * Parsuj surowy JSON z DB (Prisma `Json` field) do tablicy zakresów.
 * Defensywne: ignoruje malformed wpisy.
 */
export function parseHeaderRanges(raw: unknown): HeaderRange[] {
  if (!Array.isArray(raw)) return [];
  const out: HeaderRange[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (!r || typeof r !== "object") continue;
    const rr = r as Record<string, unknown>;
    const fromPage = Number(rr.fromPage);
    const toPage = Number(rr.toPage);
    if (
      !Number.isFinite(fromPage) ||
      !Number.isFinite(toPage) ||
      fromPage < 1 ||
      toPage < fromPage
    ) {
      continue;
    }
    out.push({
      id: typeof rr.id === "string" ? rr.id : `hr-${i}`,
      fromPage: Math.trunc(fromPage),
      toPage: Math.trunc(toPage),
      lang: typeof rr.lang === "string" ? rr.lang : null,
      title: typeof rr.title === "string" ? rr.title : null,
      rightText: typeof rr.rightText === "string" ? rr.rightText : null,
      rightImageUrl:
        typeof rr.rightImageUrl === "string" ? rr.rightImageUrl : null,
    });
  }
  return out;
}

/**
 * Znajdź nagłówek dla strony N (1-indexed). Zwraca pierwszy pasujący zakres
 * albo null gdy żaden nie pasuje (fallback w UI/PDF do legacy lang/title).
 */
export function resolveHeaderForPage(
  pageNumber: number,
  ranges: HeaderRange[],
): HeaderRange | null {
  for (const r of ranges) {
    if (pageNumber >= r.fromPage && pageNumber <= r.toPage) return r;
  }
  return null;
}

/**
 * Wpis w spisie treści — tytuł sekcji + zakres stron który ona obejmuje.
 * Format `pages` to "N" gdy 1 strona, "N-M" gdy więcej.
 */
export type TocEntry = { text: string; pages: string };

/**
 * Wygeneruj spis treści z header rangów. Iteruje przez zakresy w kolejności
 * dodania i emituje wpis dla każdego z nazwą + page range obciętym do
 * faktycznej liczby stron dokumentu.
 *
 * Zakresy bez tytułu są pomijane (nie pojawiają się w TOC).
 * Zakres wykraczający poza totalPages jest skracany do `min(toPage, totalPages)`.
 */
/**
 * Liczy ile FIZYCZNYCH stron generuje PDF dla danej instrukcji.
 *
 * Logika 1:1 z renderem w `manual-pdf.tsx`:
 *   - LEAFLET: 1 cover (tylko 1. sekcja) + body per sekcja językowa
 *   - STANDARD: per sekcja językowa: 2 (cover+TOC) + body + extras (1 lub 2)
 *     gdzie extras = 1 (strona ostatnia) gdy (2+body) jest nieparzyste,
 *                  = 2 (wyrównanie + ostatnia) gdy parzyste.
 *
 * Dlaczego ważne: `generateToc` skipuje zakresy z `fromPage > totalPages`.
 * Bez liczenia extras strona wyrównania (która JEST renderowana w PDF i ma
 * swój header range) wypadała ze spisu treści.
 */
export function computeTotalPhysicalPages(
  pages: ManualPage[],
  activeLanguages: ManualLanguage[] | undefined,
  kind: "STANDARD" | "LEAFLET",
): number {
  const isLeaflet = kind === "LEAFLET";
  const langs =
    activeLanguages && activeLanguages.length > 0 ? activeLanguages : ["PL"];
  let total = 0;
  for (let i = 0; i < langs.length; i++) {
    const lang = langs[i];
    const bodyCount = pages.filter((p) => (p.lang ?? "PL") === lang).length;
    if (isLeaflet) {
      const coverInThisSection = i === 0 ? 1 : 0;
      total += coverInThisSection + bodyCount;
    } else {
      const lastContentPage = 2 + bodyCount;
      const extras = lastContentPage % 2 === 0 ? 2 : 1;
      total += 2 + bodyCount + extras;
    }
  }
  return total;
}

export function generateToc(
  ranges: HeaderRange[],
  totalPages: number,
): TocEntry[] {
  const out: TocEntry[] = [];
  for (const r of ranges) {
    if (!r.title) continue;
    if (r.fromPage > totalPages) continue;
    const from = Math.max(1, r.fromPage);
    const to = Math.min(totalPages, r.toPage);
    if (to < from) continue;
    out.push({
      text: r.title,
      pages: from === to ? String(from) : `${from}-${to}`,
    });
  }
  return out;
}

/** Wykryj stary lub nowy format i znormalizuj do `ManualDocument`. */
export function normalizeManualDocument(
  raw: unknown,
): ManualDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  // Nowy format: { pages: [...] }
  if (Array.isArray(obj.pages)) {
    const pages: ManualPage[] = [];
    (obj.pages as unknown[]).forEach((p, idx) => {
      if (!p || typeof p !== "object") return;
      const pp = p as Record<string, unknown>;
      const content =
        pp.content && typeof pp.content === "object"
          ? (pp.content as ManualPage["content"])
          : { type: "doc" as const, content: [] };
      const page: ManualPage = {
        id: typeof pp.id === "string" ? pp.id : `page-${idx}`,
        content,
      };
      if (isManualLanguage(pp.lang)) page.lang = pp.lang;
      if (typeof pp.autoTranslated === "boolean")
        page.autoTranslated = pp.autoTranslated;
      if (typeof pp.sourceUpdatedAt === "string")
        page.sourceUpdatedAt = pp.sourceUpdatedAt;
      pages.push(page);
    });
    // Lista aktywnych języków — z `manualJson.activeLanguages` lub fallback:
    // jeśli pages mają explicit `lang`, zbieramy unique wartości; inaczej ["PL"].
    let activeLanguages: ManualLanguage[] | undefined;
    if (Array.isArray(obj.activeLanguages)) {
      activeLanguages = (obj.activeLanguages as unknown[]).filter(
        isManualLanguage,
      );
      if (activeLanguages.length === 0) activeLanguages = ["PL"];
    } else {
      const fromPages = Array.from(
        new Set(pages.map((p) => p.lang).filter(isManualLanguage)),
      );
      activeLanguages = fromPages.length > 0 ? fromPages : ["PL"];
    }
    return { pages, activeLanguages };
  }
  // Stary format — pojedynczy `doc`
  if (obj.type === "doc") {
    return {
      pages: [
        {
          id: "page-0",
          content: obj as ManualPage["content"],
        },
      ],
    };
  }
  return null;
}

/** Pogrupuj strony według języka — zwraca tablicę { lang, pages[] } w kolejności
 *  pierwszego pojawienia się języka w pages[]. Strony bez `lang` traktujemy jako "PL".
 *  Używane w edytorze do wyświetlenia sekcji per-język. */
export function groupPagesByLanguage(
  pages: ManualPage[],
): Array<{ lang: ManualLanguage; pages: Array<ManualPage & { _idx: number }> }> {
  const buckets = new Map<
    ManualLanguage,
    Array<ManualPage & { _idx: number }>
  >();
  const order: ManualLanguage[] = [];
  pages.forEach((p, idx) => {
    const lang: ManualLanguage = p.lang ?? "PL";
    if (!buckets.has(lang)) {
      buckets.set(lang, []);
      order.push(lang);
    }
    buckets.get(lang)!.push({ ...p, _idx: idx });
  });
  return order.map((lang) => ({ lang, pages: buckets.get(lang)! }));
}
