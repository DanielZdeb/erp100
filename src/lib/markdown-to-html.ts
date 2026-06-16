/**
 * Lekki konwerter Markdown -> HTML do AI-generowanego contentu opisow.
 *
 * NIE jest pelnym parserem markdown — obsluguje tylko to czego Claude / Gemini
 * uzywa w polskich opisach produktow:
 *   - h1/h2/h3 (#, ##, ###)
 *   - **bold**, *italic*, __bold__, _italic_
 *   - listy: `- item` lub `* item` -> <ul><li>
 *   - listy numerowane: `1. item` -> <ol><li>
 *   - akapity (puste linie rozdzielaja)
 *   - inline kod `code` -> <code>
 *
 * Idempotentny: jesli input juz wyglada jak HTML (zawiera <p>, <h2>, <strong>
 * itd. w ilosci wskazujacej na faktyczny HTML), zwracamy bez zmian.
 */

/**
 * Heurystyka: input wyglada na HTML jesli zawiera blokowe tagi otwierajace.
 * Detekcja jest celowo rygorystyczna — wolimy false-negative (skonwertowac
 * cos co juz bylo HTML) niz false-positive (zostawic surowy markdown).
 */
function looksLikeHtml(input: string): boolean {
  if (!input) return false;
  const html = /<(p|h[1-6]|ul|ol|li|strong|em|u|br)\s*[>/]/i.test(input);
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Inline formatting: bold (`**x**` / `__x__`), italic (`*x*` / `_x_`),
 * inline code (`code`).
 */
function inline(s: string): string {
  let out = escapeHtml(s);
  // **bold** lub __bold__ (greedy match by ` ` boundaries)
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_\n]+?)__/g, "<strong>$1</strong>");
  // *italic* lub _italic_ (po bold zeby nie wchodzic do srodka **)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g, "$1<em>$2</em>$3");
  out = out.replace(/(^|[^_])_([^_\n]+?)_([^_]|$)/g, "$1<em>$2</em>$3");
  // `code`
  out = out.replace(/`([^`\n]+?)`/g, "<code>$1</code>");
  return out;
}

export function markdownToHtml(input: string | null | undefined): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) return trimmed;

  const lines = trimmed.split(/\r?\n/);
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Pusta linia — pomijamy (rozdzial akapitow)
    if (!line.trim()) {
      i++;
      continue;
    }

    // Heading: # / ## / ###
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list: `- item` lub `* item` lub `• item` (kolejne linie zlewamy)
    if (/^[\-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-*•]\s+/.test(lines[i].trimEnd())) {
        const itemText = lines[i].trimEnd().replace(/^[\-*•]\s+/, "");
        items.push(`<li>${inline(itemText)}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list: `1. item` (kolejne linie zlewamy)
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trimEnd())) {
        const itemText = lines[i].trimEnd().replace(/^\d+[.)]\s+/, "");
        items.push(`<li>${inline(itemText)}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Zwykly akapit — laczymy kolejne nie-puste linie do nastepnej pustej / heading / lista
    const paragraphLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i].trimEnd();
      if (!next.trim()) break;
      if (/^(#{1,3}\s|[\-*•]\s|\d+[.)]\s)/.test(next)) break;
      paragraphLines.push(next);
      i++;
    }
    out.push(`<p>${inline(paragraphLines.join(" "))}</p>`);
  }

  return out.join("\n");
}
