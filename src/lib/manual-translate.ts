/**
 * Walker dla TipTap JSON — wyciąga teksty do tłumaczenia (z zachowaniem
 * pozycji w drzewie) i wstawia je z powrotem po przetłumaczeniu.
 *
 * Strategia: każdy `text` node dostaje stabilny ID (path-based), tekst trafia
 * do tablicy {id, text, marks?}. Po tłumaczeniu walker drugi raz odwiedza
 * drzewo i podmienia teksty wg ID.
 *
 * NIE tłumaczymy: atrybutów (URL obrazków, kolory, fontFamily itp.) — tylko
 * `text` children w drzewie node'ów. Header/footer manuala (oddzielne pola
 * w DB) tłumaczymy osobno przez `translateText`.
 */

type TipNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TipNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

export type TextEntry = {
  /** Path do node'a — np. "0.content.2.content.1" — unikalny w drzewie. */
  path: string;
  text: string;
};

/** Zbierz wszystkie text node'y z drzewa TipTap (rekurencyjnie). */
export function collectTexts(root: TipNode): TextEntry[] {
  const out: TextEntry[] = [];
  function walk(node: TipNode, path: string) {
    if (node.type === "text" && typeof node.text === "string") {
      const trimmed = node.text.trim();
      if (trimmed.length > 0) {
        out.push({ path, text: node.text });
      }
      return;
    }
    if (Array.isArray(node.content)) {
      node.content.forEach((child, idx) => {
        walk(child, `${path}.content.${idx}`);
      });
    }
  }
  walk(root, "0");
  return out;
}

/** Podmień teksty w drzewie wg mapy path → tłumaczenie. Mutuje kopię. */
export function applyTranslations(
  root: TipNode,
  byPath: Map<string, string>,
): TipNode {
  // Deep clone żeby nie zepsuć oryginału (Prisma JSON jest mutowalny).
  const clone = JSON.parse(JSON.stringify(root)) as TipNode;
  function walk(node: TipNode, path: string) {
    if (node.type === "text" && typeof node.text === "string") {
      const translated = byPath.get(path);
      if (translated != null) {
        node.text = translated;
      }
      return;
    }
    if (Array.isArray(node.content)) {
      node.content.forEach((child, idx) => {
        walk(child, `${path}.content.${idx}`);
      });
    }
  }
  walk(clone, "0");
  return clone;
}

/** Nazwy języków pełne do prompt'a Claude'a — lepsze tłumaczenia gdy
 *  podajemy „translate to Slovak" niż „translate to SK". */
export const TRANSLATE_LANG_NAMES: Record<string, string> = {
  PL: "Polish",
  EN: "English",
  DE: "German",
  UA: "Ukrainian",
  SK: "Slovak",
  RO: "Romanian",
  CS: "Czech",
  HU: "Hungarian",
  BG: "Bulgarian",
};
