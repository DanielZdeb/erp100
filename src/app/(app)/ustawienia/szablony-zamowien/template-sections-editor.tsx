"use client";

/**
 * Edytor szablonów wytycznych — per-firma, per-kind. Każda sekcja stanie
 * się stroną w PDF kolejnych zamówień (kopiuje się przy tworzeniu nowego
 * zamówienia tego rodzaju).
 *
 * Struktura UI prawie identyczna jak w `guidelines-tab.tsx`, ale operuje
 * na akcjach `*TemplateSection*` zamiast `*PdfSection*`. Nie ma przycisku
 * generowania PDF — szablon to tylko źródło danych.
 */

import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  addTemplateSectionImageAction,
  createTemplateSectionAction,
  deleteTemplateSectionAction,
  removeTemplateSectionImageAction,
  reorderTemplateSectionsAction,
  updateTemplateSectionAction,
} from "@/server/order-template-sections";

type PolandOrderKindT = "MATERIAL_SZARFY";
type PdfTargetT = "FABRYKA" | "KRAJALNIA";

export type TemplateSectionImage = {
  id: string;
  url: string;
  alt: string | null;
  sortOrder: number;
};

export type TemplateSection = {
  id: string;
  title: string;
  content: string | null;
  sortOrder: number;
  images: TemplateSectionImage[];
};

export function TemplateSectionsEditor({
  kind,
  target = "KRAJALNIA",
  initialSections,
}: {
  kind: PolandOrderKindT;
  /** Docelowy PDF tej grupy szablonów. Default: KRAJALNIA. */
  target?: PdfTargetT;
  initialSections: TemplateSection[];
}) {
  const [sections, setSections] = useState(initialSections);
  const [newTitle, setNewTitle] = useState("");
  const [pending, startTransition] = useTransition();

  function addSection() {
    const title = newTitle.trim();
    if (!title) {
      toast.error("Podaj nazwę sekcji");
      return;
    }
    startTransition(async () => {
      try {
        const { id } = await createTemplateSectionAction(kind, target, {
          title,
        });
        setSections((prev) => [
          ...prev,
          {
            id,
            title,
            content: null,
            sortOrder: prev.length,
            images: [],
          },
        ]);
        setNewTitle("");
        toast.success("Sekcja dodana");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const next = sections.slice();
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    setSections(next);
    startTransition(async () => {
      try {
        await reorderTemplateSectionsAction(
          kind,
          target,
          next.map((s) => s.id),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
        setSections(sections);
      }
    });
  }

  function removeSection(id: string) {
    if (!confirm("Usunąć szablon sekcji? Wraz z grafikami.")) return;
    startTransition(async () => {
      try {
        await deleteTemplateSectionAction(id);
        setSections((prev) => prev.filter((s) => s.id !== id));
        toast.success("Sekcja usunięta");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function patchSection(id: string, patch: Partial<TemplateSection>) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-cyan-700" />
            <h3 className="text-sm font-semibold text-cyan-900">
              Sekcje szablonu PDF
            </h3>
          </div>
          <span className="text-[11px] text-cyan-700/80">
            {sections.length}{" "}
            {sections.length === 1 ? "sekcja" : "sekcji"}
          </span>
        </div>
        <p className="text-xs text-cyan-800/80">
          Każda sekcja = osobna strona w PDF każdego kolejnego zamówienia tego
          typu. Możesz dodać tytuł, tekst i grafiki — np. wytyczne produkcyjne,
          schematy, próbki kolorów.
        </p>

        {sections.length === 0 ? (
          <div className="text-center text-xs text-cyan-700/80 italic py-6 bg-white/60 rounded-md ring-1 ring-cyan-100">
            Brak sekcji w szablonie — dodaj pierwszą poniżej.
          </div>
        ) : (
          <div className="space-y-3">
            {sections.map((sec, idx) => (
              <TemplateSectionCard
                key={sec.id}
                section={sec}
                index={idx}
                total={sections.length}
                onMove={(dir) => moveSection(idx, dir)}
                onRemove={() => removeSection(sec.id)}
                onPatch={(p) => patchSection(sec.id, p)}
              />
            ))}
          </div>
        )}

        {/* Formularz „Dodaj sekcję" — na dole, pod listą sekcji */}
        <div className="flex items-center gap-2 bg-white rounded-md ring-1 ring-cyan-200 p-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Tytuł nowej sekcji — np. Wytyczne produkcyjne..."
            className="h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSection();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            onClick={addSection}
            disabled={pending || !newTitle.trim()}
            className="gap-1 shrink-0"
          >
            <Plus className="size-3.5" />
            Dodaj sekcję
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline-edytowalna karta sekcji szablonu. Pola tytuł i treść są w lokalnym
 * stanie (z poziomu karty); użytkownik zapisuje wszystko jednym przyciskiem
 * „Zapisz" w stopce karty. Grafiki uploadują się od razu (operacje na
 * plikach), żeby były od razu widoczne i nie ginęły przy „Anuluj".
 */
function TemplateSectionCard({
  section,
  index,
  total,
  onMove,
  onRemove,
  onPatch,
}: {
  section: TemplateSection;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onPatch: (p: Partial<TemplateSection>) => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content ?? "");
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const titleDirty = title !== section.title;
  const contentDirty = (content || null) !== section.content;
  const dirty = titleDirty || contentDirty;

  function save() {
    if (!title.trim()) {
      toast.error("Tytuł nie może być pusty");
      return;
    }
    if (!dirty) return;
    startTransition(async () => {
      try {
        await updateTemplateSectionAction(section.id, {
          ...(titleDirty ? { title: title.trim() } : {}),
          ...(contentDirty ? { content: content || null } : {}),
        });
        onPatch({
          ...(titleDirty ? { title: title.trim() } : {}),
          ...(contentDirty ? { content: content || null } : {}),
        });
        toast.success("Zapisano sekcję");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const tooBig = files.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) {
      toast.error(`Plik ${tooBig.name} > 5 MB — pomijam wszystkie.`);
      return;
    }
    void uploadBatch(files);
  }

  async function uploadBatch(files: File[]) {
    setUploading(true);
    let added = 0;
    // BUG fix: section.images z closure'a nie aktualizuje sie miedzy iteracjami
    // po onPatch (dopiero po re-renderze rodzica). Akumulujemy lokalnie i robimy
    // jeden onPatch po kazdym sukcesie z pelnym 'accumulated'.
    const accumulated = [...section.images];
    try {
      for (const file of files) {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        try {
          const res = await addTemplateSectionImageAction(section.id, {
            dataUri,
            alt: file.name,
          });
          accumulated.push({
            id: res.id,
            url: res.url,
            alt: file.name,
            sortOrder: section.images.length + added,
          });
          onPatch({ images: [...accumulated] });
          added++;
        } catch (err) {
          toast.error(
            `${file.name}: ${err instanceof Error ? err.message : "Nie udało się"}`,
          );
        }
      }
      if (added > 0) {
        toast.success(
          `Dodano ${added} ${added === 1 ? "grafikę" : "grafik"}`,
        );
      }
    } finally {
      setUploading(false);
    }
  }

  function removeImage(imageId: string) {
    if (!confirm("Usunąć grafikę?")) return;
    startTransition(async () => {
      try {
        await removeTemplateSectionImageAction(imageId);
        onPatch({
          images: section.images.filter((i) => i.id !== imageId),
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="rounded-lg bg-white ring-1 ring-cyan-200 shadow-sm p-3 space-y-3">
      {/* Pasek górny: numer + tytuł + akcje porządku/usunięcia */}
      <div className="flex items-start gap-2">
        <span className="inline-flex shrink-0 items-center justify-center size-8 rounded-md bg-cyan-600 text-white text-xs font-bold mt-1">
          {index}
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tytuł sekcji"
            className="text-sm font-semibold"
            disabled={pending}
          />
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => onMove(-1)}
            disabled={index === 0 || pending}
            title="Wyżej"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => onMove(1)}
            disabled={index === total - 1 || pending}
            title="Niżej"
          >
            <ChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            onClick={onRemove}
            disabled={pending}
            title="Usuń sekcję"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Treść — rich text (bold/italic/listy/nagłówki). Zapisana jako HTML
          w polu `content`. PDF parser tłumaczy na react-pdf elementy. */}
      <RichTextEditor
        value={content}
        onChange={setContent}
        placeholder="Treść sekcji — pojawi się na stronie PDF pod tytułem."
        disabled={pending}
      />

      {/* Grafiki */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700">
            Grafiki ({section.images.length})
          </span>
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={onFilePick}
              disabled={uploading}
            />
            <span
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-cyan-100 text-cyan-800 text-[11px] font-medium hover:bg-cyan-200 transition-colors"
              aria-disabled={uploading}
            >
              <ImagePlus className="size-3.5" />
              {uploading ? "Wysyłam…" : "Dodaj grafikę"}
            </span>
          </label>
        </div>
        {section.images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {section.images.map((img) => (
              <div
                key={img.id}
                className="relative group aspect-video rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50"
              >
                <Image
                  src={img.url}
                  alt={img.alt ?? ""}
                  fill
                  sizes="180px"
                  className="object-cover"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute top-1 right-1 inline-flex items-center justify-center size-6 rounded-full bg-white/90 text-rose-600 hover:bg-white hover:text-rose-700 shadow ring-1 ring-rose-200 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Usuń"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground italic">
            Brak grafik — kliknij „Dodaj grafikę" by wstawić obraz.
          </div>
        )}
      </div>

      {/* Stopka karty: Zapisz */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        {dirty && (
          <span className="text-[10px] text-amber-700 mr-auto">
            Zmiany niezapisane
          </span>
        )}
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!dirty || pending || !title.trim()}
          variant={dirty ? "default" : "secondary"}
          className="gap-1"
        >
          <Save className="size-3.5" />
          {pending ? "Zapisuję…" : dirty ? "Zapisz" : "Zapisano"}
        </Button>
      </div>
    </div>
  );
}

