/**
 * Wspólny loader czcionek dla generatorów PDF (awizacja interaktywna + etykiety).
 *
 * Strategy: spróbuj kilku CDN/ścieżek w kolejności. Pierwszy działający URL
 * cachowany w module — fetch raz na sesję.
 *
 * Czcionka: Roboto TTF z pełnym Latin Extended-A (ąęłóćńśźż w jednym pliku).
 * @pdf-lib/fontkit obsługuje TTF natywnie.
 *
 * Dlaczego multi-URL: ścieżki w `roboto-fontface@0.10.0` różnią się między
 * wersjami pakietu (capital vs lowercase folder). Multi-URL = odporność na
 * 404/CORS/networking na pojedynczym CDN.
 */

// Multi-URL fallback. Pierwszy działający URL wygrywa.
// Zweryfikowane (HTTP 200): jsdelivr → googlefonts/roboto github mirror.
const REGULAR_URLS = [
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Regular.ttf",
  // Fallback: jsdelivr gh raw bezpośrednio (czasem szybsze)
  "https://raw.githack.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf",
];

const BOLD_URLS = [
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf",
  "https://raw.githack.com/googlefonts/roboto/main/src/hinted/Roboto-Bold.ttf",
];

const ITALIC_URLS = [
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Italic.ttf",
  "https://raw.githack.com/googlefonts/roboto/main/src/hinted/Roboto-Italic.ttf",
];

const BOLD_ITALIC_URLS = [
  "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-BoldItalic.ttf",
  "https://raw.githack.com/googlefonts/roboto/main/src/hinted/Roboto-BoldItalic.ttf",
];

let cachedRegular: ArrayBuffer | null = null;
let cachedBold: ArrayBuffer | null = null;
let cachedItalic: ArrayBuffer | null = null;
let cachedBoldItalic: ArrayBuffer | null = null;

async function fetchWithFallback(
  urls: string[],
  label: string,
): Promise<ArrayBuffer> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.arrayBuffer();
      errors.push(`HTTP ${res.status} ← ${url}`);
    } catch (e) {
      errors.push(`${e instanceof Error ? e.message : "fetch error"} ← ${url}`);
    }
  }
  throw new Error(
    `Nie udało się pobrać czcionki "${label}" z żadnego CDN:\n${errors.join("\n")}\n\nMożliwe przyczyny: brak internetu, blokada firmowego firewalla, czasowa awaria jsdelivr/unpkg.`,
  );
}

export async function loadRobotoFonts(): Promise<{
  regular: ArrayBuffer;
  bold: ArrayBuffer;
}> {
  const [regular, bold] = await Promise.all([
    cachedRegular
      ? Promise.resolve(cachedRegular)
      : fetchWithFallback(REGULAR_URLS, "Roboto Regular"),
    cachedBold
      ? Promise.resolve(cachedBold)
      : fetchWithFallback(BOLD_URLS, "Roboto Bold"),
  ]);
  cachedRegular = regular;
  cachedBold = bold;
  return { regular, bold };
}

/** Extended loader z italic + bold-italic — używany w instrukcjach gdzie
 *  TipTap często emit bold+italic combo (welcome message, akcenty). */
export async function loadRobotoFontsAll(): Promise<{
  regular: ArrayBuffer;
  bold: ArrayBuffer;
  italic: ArrayBuffer;
  boldItalic: ArrayBuffer;
}> {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    cachedRegular
      ? Promise.resolve(cachedRegular)
      : fetchWithFallback(REGULAR_URLS, "Roboto Regular"),
    cachedBold
      ? Promise.resolve(cachedBold)
      : fetchWithFallback(BOLD_URLS, "Roboto Bold"),
    cachedItalic
      ? Promise.resolve(cachedItalic)
      : fetchWithFallback(ITALIC_URLS, "Roboto Italic"),
    cachedBoldItalic
      ? Promise.resolve(cachedBoldItalic)
      : fetchWithFallback(BOLD_ITALIC_URLS, "Roboto BoldItalic"),
  ]);
  cachedRegular = regular;
  cachedBold = bold;
  cachedItalic = italic;
  cachedBoldItalic = boldItalic;
  return { regular, bold, italic, boldItalic };
}
