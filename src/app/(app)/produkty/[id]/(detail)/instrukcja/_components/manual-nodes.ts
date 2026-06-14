"use client";

/**
 * Współdzielone TipTap extension nodes używane w wielu PageEditor instances.
 * Trzymane osobno żeby uniknąć duplikacji deklaracji nodów per editor.
 */

import { Node, mergeAttributes } from "@tiptap/react";

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  selectable: true,
  atom: true,
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "page-break",
        class:
          "my-4 border-t-2 border-dashed border-rose-400 relative h-6 flex items-center justify-center text-[10px] uppercase tracking-widest text-rose-500 font-semibold",
      }),
      "── Nowa strona ──",
    ];
  },
});

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        class:
          "my-3 p-3 rounded-md bg-amber-50 border-l-4 border-amber-400 text-amber-900",
      }),
      0,
    ];
  },
});
