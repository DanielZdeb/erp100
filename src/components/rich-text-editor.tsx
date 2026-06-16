"use client";

/**
 * Lekki rich-text editor (TipTap) — bold/italic/underline, listy
 * (punktowane/numerowane) i nagłówki (H1/H2/H3). Treść utrzymywana jako
 * HTML. Używany w sekcjach szablonów PDF — później renderowany w PDF
 * przez `parseRichTextToReactPdf`.
 *
 * Wzorowany na innych edytorach w projekcie (TipTap StarterKit + minimalny
 * pasek narzędzi). Bez tabel, obrazów, linków — to jest minimal toolset
 * pod sekcje zamówień.
 */

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Pilcrow,
  Strikethrough,
  Underline as UnderlineIcon,
} from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
    ],
    content: value || "",
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none min-h-[140px] flex-1 p-3 outline-none",
          // Style listy widoczne — domyślnie Tailwind preflight je gasi
          "[&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:list-decimal [&_ol]:pl-5",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1",
          "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1",
          "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1",
          "[&_p]:my-1",
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    onBlur: () => onBlur?.(),
  });

  // Sync zewnętrznych zmian wartości (np. reset przy otwarciu modal'a).
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-md ring-1 ring-slate-300 bg-white flex flex-col h-full min-h-[180px]",
        disabled && "opacity-60 pointer-events-none",
      )}
    >
      <Toolbar editor={editor} />
      <div className="flex-1 flex flex-col">
        <EditorContent editor={editor} placeholder={placeholder} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (
    on: boolean,
    onClick: () => void,
    Icon: React.ElementType,
    title: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "size-7 inline-flex items-center justify-center rounded text-slate-600 hover:bg-slate-100 transition-colors",
        on && "bg-slate-200 text-slate-900",
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-slate-200 bg-slate-50/60 rounded-t-md">
      {btn(
        editor.isActive("bold"),
        () => editor.chain().focus().toggleBold().run(),
        Bold,
        "Pogrubienie (Ctrl+B)",
      )}
      {btn(
        editor.isActive("italic"),
        () => editor.chain().focus().toggleItalic().run(),
        Italic,
        "Kursywa (Ctrl+I)",
      )}
      {btn(
        editor.isActive("strike"),
        () => editor.chain().focus().toggleStrike().run(),
        Strikethrough,
        "Przekreślenie",
      )}
      <span className="w-px h-4 bg-slate-300 mx-0.5" />
      {btn(
        editor.isActive("heading", { level: 1 }),
        () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        Heading1,
        "Nagłówek 1",
      )}
      {btn(
        editor.isActive("heading", { level: 2 }),
        () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        Heading2,
        "Nagłówek 2",
      )}
      {btn(
        editor.isActive("heading", { level: 3 }),
        () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        Heading3,
        "Nagłówek 3",
      )}
      {btn(
        editor.isActive("paragraph"),
        () => editor.chain().focus().setParagraph().run(),
        Pilcrow,
        "Akapit (zwykły tekst)",
      )}
      <span className="w-px h-4 bg-slate-300 mx-0.5" />
      {btn(
        editor.isActive("bulletList"),
        () => editor.chain().focus().toggleBulletList().run(),
        List,
        "Lista punktowana",
      )}
      {btn(
        editor.isActive("orderedList"),
        () => editor.chain().focus().toggleOrderedList().run(),
        ListOrdered,
        "Lista numerowana",
      )}
    </div>
  );
}

// Suppress unused-import lint for UnderlineIcon (z extension package zewn.).
void UnderlineIcon;
