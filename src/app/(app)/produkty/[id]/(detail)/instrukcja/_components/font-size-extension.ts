"use client";

/**
 * Custom TipTap extension dodający atrybut `fontSize` na mark `textStyle`.
 * Wymaga włączonego TextStyle z @tiptap/extension-text-style.
 *
 * Dispatch przez `editor.chain().focus().setMark('textStyle', { fontSize: '14pt' })`.
 * Lub przez dodaną komendę `setFontSize(value)` / `unsetFontSize()`.
 */

import { Extension } from "@tiptap/react";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types as string[],
        attributes: {
          fontSize: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) =>
              element.style.fontSize || null,
            renderHTML: (attrs: Record<string, unknown>) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
