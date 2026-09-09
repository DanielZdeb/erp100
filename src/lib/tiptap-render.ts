/**
 * Server-side renderer TipTap JSON → HTML.
 * Odczytujemy strukturę doc (typ + attrs + content), generujemy HTML sanityzowany
 * do bezpiecznego wyświetlenia. Wspiera: paragraph, heading, bulletList/orderedList,
 * blockquote, codeBlock, hardBreak, horizontalRule, image, link (mark), bold/italic/
 * underline/strike (marks), text-align/color/font-family (attrs).
 */

type Attrs = Record<string, unknown>;
type Mark = { type: string; attrs?: Attrs };
type Node = {
  type: string;
  attrs?: Attrs;
  content?: Node[];
  text?: string;
  marks?: Mark[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function styleFromAttrs(attrs?: Attrs): string {
  if (!attrs) return "";
  const parts: string[] = [];
  const align = attrs.textAlign;
  if (align && typeof align === "string") parts.push(`text-align:${escapeAttr(align)}`);
  const color = attrs.color;
  if (color && typeof color === "string") parts.push(`color:${escapeAttr(color)}`);
  const bg = attrs.backgroundColor;
  if (bg && typeof bg === "string") parts.push(`background-color:${escapeAttr(bg)}`);
  const fontFamily = attrs.fontFamily;
  if (fontFamily && typeof fontFamily === "string")
    parts.push(`font-family:${escapeAttr(fontFamily)}`);
  if (parts.length === 0) return "";
  return ` style="${parts.join(";")}"`;
}

function renderText(text: string, marks?: Mark[]): string {
  let html = escapeHtml(text);
  if (!marks || marks.length === 0) return html;
  // Owijamy w kolejności — od zewnątrz do wewnątrz
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "underline":
        html = `<u>${html}</u>`;
        break;
      case "strike":
        html = `<s>${html}</s>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "link": {
        const href = (mark.attrs?.href as string) ?? "#";
        const target = mark.attrs?.target === "_blank" ? ' target="_blank" rel="noopener"' : "";
        html = `<a href="${escapeAttr(href)}"${target}>${html}</a>`;
        break;
      }
      case "textStyle": {
        const style = styleFromAttrs(mark.attrs);
        if (style) html = `<span${style}>${html}</span>`;
        break;
      }
    }
  }
  return html;
}

function renderNodes(nodes: Node[] | undefined): string {
  if (!nodes) return "";
  return nodes.map(renderNode).join("");
}

function renderNode(node: Node): string {
  switch (node.type) {
    case "doc":
      return renderNodes(node.content);
    case "text":
      return renderText(node.text ?? "", node.marks);
    case "paragraph": {
      const style = styleFromAttrs(node.attrs);
      return `<p${style}>${renderNodes(node.content)}</p>`;
    }
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6);
      const style = styleFromAttrs(node.attrs);
      return `<h${level}${style}>${renderNodes(node.content)}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${renderNodes(node.content)}</ul>`;
    case "orderedList": {
      const start = node.attrs?.start;
      const startAttr = start && Number(start) > 1 ? ` start="${Number(start)}"` : "";
      return `<ol${startAttr}>${renderNodes(node.content)}</ol>`;
    }
    case "listItem":
      return `<li>${renderNodes(node.content)}</li>`;
    case "blockquote":
      return `<blockquote>${renderNodes(node.content)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${renderNodes(node.content)}</code></pre>`;
    case "hardBreak":
      return "<br />";
    case "horizontalRule":
      return "<hr />";
    case "image": {
      const src = (node.attrs?.src as string) ?? "";
      const alt = (node.attrs?.alt as string) ?? "";
      const title = (node.attrs?.title as string) ?? "";
      const w = node.attrs?.width as number | undefined;
      const h = node.attrs?.height as number | undefined;
      const size = w && h ? ` width="${w}" height="${h}"` : "";
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ""}${size} loading="lazy" />`;
    }
    case "callout":
      return `<div class="manual-callout">${renderNodes(node.content)}</div>`;
    case "pageBreak":
      return `<div class="manual-page-break"></div>`;
    case "sectionLayout": {
      const layout = (node.attrs?.layout as string) ?? "imageRight";
      const imageSrc = (node.attrs?.imageSrc as string) ?? "";
      const imageWidthAttr = node.attrs?.imageWidth as number | null | undefined;
      const verticalCenter = Boolean(node.attrs?.verticalCenter);
      const defW = layout === "imageOnly" ? 70 : 40;
      const imgW = Math.max(20, Math.min(100, imageWidthAttr ?? defW));
      const inner = renderNodes(node.content);
      const vc = verticalCenter ? " manual-section--vc" : "";
      if (layout === "imageOnly") {
        const img = imageSrc
          ? `<div class="manual-section__img" style="width:${imgW}%"><img src="${escapeAttr(imageSrc)}" alt="" loading="lazy" /></div>`
          : "";
        return `<div class="manual-section manual-section--image-only${vc}">${img}<div class="manual-section__text manual-section__text--center">${inner}</div></div>`;
      }
      if (layout === "textText" || !imageSrc) {
        return `<div class="manual-section manual-section--text${vc}">${inner}</div>`;
      }
      const dirClass = layout === "imageLeft" ? "manual-section--image-left" : "manual-section--image-right";
      const img = `<div class="manual-section__img" style="width:${imgW}%"><img src="${escapeAttr(imageSrc)}" alt="" loading="lazy" /></div>`;
      return `<div class="manual-section ${dirClass}${vc}"><div class="manual-section__text">${inner}</div>${img}</div>`;
    }
    case "table":
      return `<table>${renderNodes(node.content)}</table>`;
    case "tableRow":
      return `<tr>${renderNodes(node.content)}</tr>`;
    case "tableHeader":
      return `<th>${renderNodes(node.content)}</th>`;
    case "tableCell":
      return `<td>${renderNodes(node.content)}</td>`;
    default:
      // Nieznany typ — po prostu renderuj dzieci
      return renderNodes(node.content);
  }
}

export function tiptapJsonToHtml(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  return renderNode(json as Node);
}
