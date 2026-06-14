"use server";

/**
 * Auto-tłumaczenie sekcji językowej w instrukcji przez Claude API.
 *
 * Workflow:
 *  1. Z `manualJson.pages` wyciągamy strony źródłowego języka (default PL)
 *  2. Dla każdej strony walker `collectTexts` zbiera all text nodes
 *  3. Wysyłamy batch tekstów do Claude Sonnet 4.6 z promptem
 *     („technical product manual, preserve formatting, keep brand names")
 *  4. Parsujemy odpowiedź (JSON tablica tłumaczeń w tym samym order)
 *  5. `applyTranslations` wstawia teksty z powrotem do clone'a JSON-a
 *  6. Nowe strony z lang=targetLang + autoTranslated=true wstawiamy do
 *     `manualJson.pages` po wszystkich istniejących stronach
 *
 * Idempotencja: nadpisuje wcześniejsze auto-tłumaczenia jeśli już istnieją
 * (usuwa stare strony targetLang, dodaje świeże).
 *
 * Wymagana env: ANTHROPIC_API_KEY.
 */

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import {
  collectTexts,
  applyTranslations,
  TRANSLATE_LANG_NAMES,
} from "@/lib/manual-translate";
import {
  type HeaderRange,
  type ManualLanguage,
  MANUAL_LANGUAGES,
  isManualLanguage,
  normalizeManualDocument,
  parseHeaderRanges,
  sortLangsByCanonical,
} from "@/lib/manual-document";

type TipDoc = {
  type?: string;
  content?: Array<Record<string, unknown>>;
};

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Brak autoryzacji");
  return session.user;
}

/** Wywołuje Claude API z batch'em tekstów do tłumaczenia. Zwraca odpowiedź
 *  jako tablicę tłumaczeń w tym samym indeksie co input. */
async function callClaudeTranslate(
  texts: string[],
  fromLang: ManualLanguage,
  toLang: ManualLanguage,
): Promise<string[]> {
  if (texts.length === 0) return [];
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Brak klucza ANTHROPIC_API_KEY w .env — auto-tłumaczenie wyłączone. " +
        "Wygeneruj klucz na https://console.anthropic.com i dodaj do .env.",
    );
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Numerujemy teksty żeby Claude zachowała kolejność w odpowiedzi.
  const numbered = texts.map((t, i) => `[${i}] ${t}`).join("\n---\n");

  const fromName = TRANSLATE_LANG_NAMES[fromLang] ?? fromLang;
  const toName = TRANSLATE_LANG_NAMES[toLang] ?? toLang;

  const prompt =
    `You are a professional translator for product instruction manuals.

Translate the following text fragments from ${fromName} to ${toName}.

CRITICAL RULES:
1. Output ONLY a JSON array of translated strings, in the same order as input.
2. The array MUST have exactly ${texts.length} strings.
3. Preserve the original formatting (punctuation, capitalization, line breaks).
4. Keep brand names, product codes, and proper nouns UNCHANGED:
   - "ACRO4F", "INVERFIT", "Inversion Boots", "Aerial Silk", etc.
   - Any UPPERCASE_WORDS that look like SKUs/codes
5. Use proper technical terminology for sports/fitness products.
6. Maintain the same tone (instructional, clear, concise).
7. Each fragment is a separate text node — translate each independently.

INPUT (${texts.length} fragments, separated by "---"):
${numbered}

OUTPUT FORMAT (strict JSON, no markdown, no commentary):
["translation 1", "translation 2", ..., "translation N"]`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude nie zwrócił tekstu w odpowiedzi.");
  }

  // Parsuj JSON — Claude czasem wrappuje w ```json — strip te marker'y.
  let raw = textBlock.text.trim();
  if (raw.startsWith("```")) {
    raw = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Claude zwróciła niepoprawny JSON: ${raw.slice(0, 200)}…`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Claude zwróciła nie-array — oczekiwany JSON array stringów.");
  }
  if (parsed.length !== texts.length) {
    throw new Error(
      `Claude zwróciła ${parsed.length} tłumaczeń zamiast ${texts.length}. ` +
        `Spróbuj ponownie lub podziel sekcję na mniejsze.`,
    );
  }
  return parsed.map((s) => (typeof s === "string" ? s : String(s)));
}

/**
 * Tłumaczy wszystkie strony `fromLang` → `toLang` przez Claude API.
 * Strony toLang są ZASTĘPOWANE (stare auto-translated kasujemy, nowe wstawiamy).
 *
 * @param manualId — ProductManual.id
 * @param fromLang — język źródłowy (zwykle "PL")
 * @param toLang — język docelowy
 */
export async function translateManualSectionAction(
  manualId: string,
  fromLang: string,
  toLang: string,
) {
  await requireUser();
  const companyId = await getCurrentCompanyId();

  if (!isManualLanguage(fromLang) || !isManualLanguage(toLang)) {
    throw new Error("Nieobsługiwany język.");
  }
  if (fromLang === toLang) {
    throw new Error("Język źródłowy = docelowy.");
  }

  const manual = await db.productManual.findFirst({
    where: { id: manualId, companyId },
    select: { id: true, manualJson: true, headerRanges: true },
  });
  if (!manual) throw new Error("Instrukcja nie istnieje.");

  const normalized = normalizeManualDocument(manual.manualJson);
  if (!normalized) throw new Error("Manual JSON jest pusty.");

  const sourcePages = normalized.pages.filter(
    (p) => (p.lang ?? "PL") === fromLang,
  );
  if (sourcePages.length === 0) {
    throw new Error(
      `Brak stron ${fromLang} do przetłumaczenia. Najpierw uzupełnij treść w języku źródłowym.`,
    );
  }

  // Dla każdej strony — zbierz teksty, wyślij do Claude, podmień
  const translatedPages: Array<{
    id: string;
    lang: ManualLanguage;
    autoTranslated: true;
    sourceUpdatedAt: string;
    content: TipDoc;
  }> = [];

  for (let i = 0; i < sourcePages.length; i++) {
    const srcPage = sourcePages[i];
    const entries = collectTexts(srcPage.content as TipDoc);
    if (entries.length === 0) {
      // Strona bez tekstu (np. tylko obraz) — kopiujemy as-is
      translatedPages.push({
        id: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        lang: toLang,
        autoTranslated: true,
        sourceUpdatedAt: new Date().toISOString(),
        content: JSON.parse(JSON.stringify(srcPage.content)),
      });
      continue;
    }
    const translations = await callClaudeTranslate(
      entries.map((e) => e.text),
      fromLang,
      toLang,
    );
    const byPath = new Map<string, string>();
    entries.forEach((e, idx) => byPath.set(e.path, translations[idx]));
    const translatedContent = applyTranslations(
      srcPage.content as TipDoc,
      byPath,
    );
    translatedPages.push({
      id: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      lang: toLang,
      autoTranslated: true,
      sourceUpdatedAt: new Date().toISOString(),
      content: translatedContent as TipDoc,
    });
  }

  // Usuń stare strony toLang (re-translate scenario), zostaw inne języki nietknięte.
  const keptPages = normalized.pages.filter((p) => (p.lang ?? "PL") !== toLang);
  const mergedPages = [...keptPages, ...translatedPages];

  const existingActive = normalized.activeLanguages ?? ["PL"];
  const mergedActive = existingActive.includes(toLang)
    ? existingActive
    : [...existingActive, toLang];

  // Sortuj wg kanonicznego porządku (MANUAL_LANGUAGES) — fizyczna kolejność
  // stron MUSI być zgodna z activeLanguages, inaczej sectionOffset liczy
  // dubel/przesunięcie (bug: DE pages dostawały te same fizyczne strony co SK,
  // bo translate zostawiał kolejność pages w odwrotnej kolejności względem
  // activeLanguages po canonical sort).
  const activeLanguages = sortLangsByCanonical(mergedActive) as ManualLanguage[];
  const newPages = [...mergedPages].sort((a, b) => {
    const ai = (MANUAL_LANGUAGES as readonly string[]).indexOf(a.lang ?? "PL");
    const bi = (MANUAL_LANGUAGES as readonly string[]).indexOf(b.lang ?? "PL");
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  // ─── Tłumaczenie nagłówków (headerRanges) per sekcja ──────────────────
  // Każdy zakres z `lang === fromLang` jest dublowany dla toLang z
  // przetłumaczonym tytułem i przesuniętymi page numbers (offset sekcji).
  const allRanges = parseHeaderRanges(manual.headerRanges);
  const sourceRanges = allRanges.filter(
    (r) => (r.lang ?? "PL") === fromLang,
  );

  // Oblicz offset stron sekcji `fromLang` i `toLang` w nowym układzie newPages.
  // Każda sekcja zajmuje: 2 (cover+TOC) + bodyCount + extras (1 lub 2).
  function sectionOffset(targetLang: string): number {
    let offset = 0;
    for (const lang of activeLanguages) {
      if (lang === targetLang) return offset;
      const bodyCount = newPages.filter(
        (p) => (p.lang ?? "PL") === lang,
      ).length;
      const lastContentPage = 2 + bodyCount;
      const extras = lastContentPage % 2 === 0 ? 2 : 1;
      offset += 2 + bodyCount + extras;
    }
    return offset;
  }
  const fromOffset = sectionOffset(fromLang);
  const toOffset = sectionOffset(toLang);

  // Tłumaczenie tytułów zakresów batch'em (1 Claude call)
  let translatedTitles: string[] = [];
  if (sourceRanges.length > 0) {
    const titlesToTranslate = sourceRanges.map((r) => r.title ?? "");
    const nonEmpty = titlesToTranslate.filter((t) => t.trim().length > 0);
    if (nonEmpty.length > 0) {
      const translated = await callClaudeTranslate(nonEmpty, fromLang, toLang);
      // Re-mapowanie do oryginalnych indeksów (puste tytuły pomijaliśmy)
      let nonEmptyIdx = 0;
      translatedTitles = titlesToTranslate.map((t) =>
        t.trim().length > 0 ? translated[nonEmptyIdx++] : t,
      );
    } else {
      translatedTitles = titlesToTranslate;
    }
  }

  // Usuń stare zakresy `toLang` (re-translate)
  const keptRanges = allRanges.filter((r) => (r.lang ?? "PL") !== toLang);
  // Stwórz nowe zakresy `toLang` na podstawie sourceRanges z przesuniętymi
  // page numbers i przetłumaczonymi tytułami.
  const newToLangRanges: HeaderRange[] = sourceRanges.map((r, i) => ({
    id: `hr-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
    fromPage: r.fromPage - fromOffset + toOffset,
    toPage: r.toPage - fromOffset + toOffset,
    lang: toLang,
    title: translatedTitles[i] ?? r.title,
    rightText: r.rightText,
    rightImageUrl: r.rightImageUrl,
  }));
  const newRanges = [...keptRanges, ...newToLangRanges];

  // ─── alignmentContent: per-język ────────────────────────────────────
  // Schema: Record<lang, doc>. Backwards-compat: legacy single doc traktowany
  // jako PL. Tłumaczymy doc dla `fromLang` → `toLang` i dokładamy do mapy.
  const existingRaw: unknown =
    manual.manualJson &&
    typeof manual.manualJson === "object" &&
    !Array.isArray(manual.manualJson)
      ? (manual.manualJson as Record<string, unknown>).alignmentContent
      : undefined;

  const alignByLang: Record<string, TipDoc> = (() => {
    if (!existingRaw || typeof existingRaw !== "object") return {};
    const obj = existingRaw as Record<string, unknown>;
    if (obj.type === "doc") {
      return { PL: existingRaw as TipDoc };
    }
    const out: Record<string, TipDoc> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === "object" && (v as Record<string, unknown>).type === "doc") {
        out[k] = v as TipDoc;
      }
    }
    return out;
  })();

  const sourceAlignDoc = alignByLang[fromLang];
  if (sourceAlignDoc) {
    const alignEntries = collectTexts(sourceAlignDoc);
    if (alignEntries.length === 0) {
      // Tylko obrazki / pusta — kopiujemy as-is
      alignByLang[toLang] = JSON.parse(JSON.stringify(sourceAlignDoc));
    } else {
      const alignTranslations = await callClaudeTranslate(
        alignEntries.map((e) => e.text),
        fromLang,
        toLang,
      );
      const alignByPath = new Map<string, string>();
      alignEntries.forEach((e, idx) => alignByPath.set(e.path, alignTranslations[idx]));
      alignByLang[toLang] = applyTranslations(sourceAlignDoc, alignByPath) as TipDoc;
    }
  }

  await db.productManual.update({
    where: { id: manualId },
    data: {
      manualJson: JSON.parse(
        JSON.stringify({
          pages: newPages,
          activeLanguages,
          ...(Object.keys(alignByLang).length > 0
            ? { alignmentContent: alignByLang }
            : {}),
        }),
      ),
      headerRanges: JSON.parse(JSON.stringify(newRanges)) as object,
    },
  });

  revalidatePath(`/produkty/instrukcje/${manualId}`);

  return {
    ok: true as const,
    translatedCount: translatedPages.length,
    fromLang,
    toLang,
  };
}
