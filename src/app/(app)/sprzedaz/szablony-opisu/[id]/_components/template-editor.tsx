"use client";

/**
 * Edytor szablonu — nazwa + lista sekcji + dodawanie/edycja/usuwanie.
 *
 * Każda sekcja ma layout (4 opcje: TEXT_TEXT, IMAGE_TEXT, TEXT_IMAGE, IMAGE_IMAGE)
 * i 2 sloty (lewy/prawy). Wizualizacja layoutu w postaci 2-kolumnowego mock-up.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, ArrowUp, ArrowDown, FileText, ImageIcon, Save, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  renameDescriptionTemplateAction,
  upsertSectionAction,
  deleteSectionAction,
  reorderSectionsAction,
} from "@/server/description-templates";

type Layout = "TEXT_TEXT" | "IMAGE_TEXT" | "TEXT_IMAGE" | "IMAGE_IMAGE";

interface SectionVM {
  id: string;
  name: string;
  layout: Layout;
  sortOrder: number;
  leftHint: string | null;
  rightHint: string | null;
  leftImagePrompt: string | null;
  rightImagePrompt: string | null;
  leftTextPrompt: string | null;
  rightTextPrompt: string | null;
}

const LAYOUT_LABELS: Record<Layout, string> = {
  TEXT_TEXT: "Tekst + Tekst",
  IMAGE_TEXT: "Obraz + Tekst",
  TEXT_IMAGE: "Tekst + Obraz",
  IMAGE_IMAGE: "Obraz + Obraz",
};

function SlotPreview({ kind, hint }: { kind: "TEXT" | "IMAGE"; hint?: string | null }) {
  return (
    <div
      className={cn(
        "flex-1 rounded ring-1 ring-slate-200 p-3 text-[10px] flex flex-col items-center justify-center gap-1 min-h-[80px]",
        kind === "IMAGE" ? "bg-violet-50/60 text-violet-700" : "bg-slate-50 text-slate-600",
      )}
    >
      {kind === "IMAGE" ? (
        <ImageIcon className="size-5 opacity-60" />
      ) : (
        <FileText className="size-5 opacity-60" />
      )}
      <span className="font-semibold uppercase tracking-wider text-[9px]">{kind}</span>
      {hint ? (
        <span className="text-[9px] opacity-70 text-center line-clamp-2 px-1">{hint}</span>
      ) : null}
    </div>
  );
}

function SectionPreview({ section }: { section: SectionVM }) {
  const [leftKind, rightKind] =
    section.layout === "TEXT_TEXT"
      ? (["TEXT", "TEXT"] as const)
      : section.layout === "IMAGE_TEXT"
        ? (["IMAGE", "TEXT"] as const)
        : section.layout === "TEXT_IMAGE"
          ? (["TEXT", "IMAGE"] as const)
          : (["IMAGE", "IMAGE"] as const);
  return (
    <div className="flex gap-2 mt-2">
      <SlotPreview kind={leftKind} hint={section.leftHint} />
      <SlotPreview kind={rightKind} hint={section.rightHint} />
    </div>
  );
}

export function TemplateEditor({
  templateId,
  initialName,
  initialSections,
  usedByCount,
}: {
  templateId: string;
  initialName: string;
  initialSections: SectionVM[];
  usedByCount: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [sections, setSections] = useState<SectionVM[]>(initialSections);
  const [pending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<SectionVM | null>(null);
  const [dlgName, setDlgName] = useState("");
  const [dlgLayout, setDlgLayout] = useState<Layout>("IMAGE_TEXT");
  const [dlgLeftHint, setDlgLeftHint] = useState("");
  const [dlgRightHint, setDlgRightHint] = useState("");
  const [dlgLeftImagePrompt, setDlgLeftImagePrompt] = useState("");
  const [dlgRightImagePrompt, setDlgRightImagePrompt] = useState("");
  const [dlgLeftTextPrompt, setDlgLeftTextPrompt] = useState("");
  const [dlgRightTextPrompt, setDlgRightTextPrompt] = useState("");

  function openCreate() {
    setEditingSection(null);
    setDlgName("");
    setDlgLayout("IMAGE_TEXT");
    setDlgLeftHint("");
    setDlgRightHint("");
    setDlgLeftImagePrompt("");
    setDlgRightImagePrompt("");
    setDlgLeftTextPrompt("");
    setDlgRightTextPrompt("");
    setDialogOpen(true);
  }

  function openEdit(s: SectionVM) {
    setEditingSection(s);
    setDlgName(s.name);
    setDlgLayout(s.layout);
    setDlgLeftHint(s.leftHint ?? "");
    setDlgRightHint(s.rightHint ?? "");
    setDlgLeftImagePrompt(s.leftImagePrompt ?? "");
    setDlgRightImagePrompt(s.rightImagePrompt ?? "");
    setDlgLeftTextPrompt(s.leftTextPrompt ?? "");
    setDlgRightTextPrompt(s.rightTextPrompt ?? "");
    setDialogOpen(true);
  }

  function saveName() {
    if (!name.trim() || name.trim() === initialName) return;
    startTransition(async () => {
      try {
        await renameDescriptionTemplateAction({ id: templateId, name });
        toast.success("Nazwa zapisana");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveSection() {
    if (!dlgName.trim()) {
      toast.error("Podaj nazwę sekcji");
      return;
    }
    startTransition(async () => {
      try {
        await upsertSectionAction({
          templateId,
          sectionId: editingSection?.id,
          name: dlgName,
          layout: dlgLayout,
          leftHint: dlgLeftHint || null,
          rightHint: dlgRightHint || null,
          leftImagePrompt: dlgLeftImagePrompt || null,
          rightImagePrompt: dlgRightImagePrompt || null,
          leftTextPrompt: dlgLeftTextPrompt || null,
          rightTextPrompt: dlgRightTextPrompt || null,
        });
        toast.success(editingSection ? "Sekcja zaktualizowana" : "Sekcja dodana");
        setDialogOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function deleteSection(id: string) {
    if (!confirm("Usunąć sekcję?")) return;
    startTransition(async () => {
      try {
        await deleteSectionAction(id);
        toast.success("Sekcja usunięta");
        setSections((s) => s.filter((x) => x.id !== id));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function move(idx: number, dir: "up" | "down") {
    const target = dir === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= sections.length) return;
    const newSections = [...sections];
    [newSections[idx], newSections[target]] = [newSections[target], newSections[idx]];
    setSections(newSections);
    startTransition(async () => {
      try {
        await reorderSectionsAction({
          templateId,
          orderedSectionIds: newSections.map((s) => s.id),
        });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1 flex-1 min-w-[280px]">
          <div className="text-[11px] uppercase tracking-wide font-bold text-emerald-700">
            Sprzedaż → Szablon opisu
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="text-2xl font-bold tracking-tight h-12 max-w-2xl"
              disabled={pending}
            />
          </div>
          <p className="text-xs text-slate-500">
            {sections.length} {sections.length === 1 ? "sekcja" : "sekcji"} ·{" "}
            {usedByCount} {usedByCount === 1 ? "produkt używa tego szablonu" : "produktów używa tego szablonu"}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="size-4" /> Dodaj sekcję
        </Button>
      </div>

      {sections.length === 0 ? (
        <Card className="p-10 text-center space-y-3">
          <FileText className="size-12 text-slate-300 mx-auto" />
          <h3 className="font-semibold text-sm">Brak sekcji</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Dodaj pierwszą sekcję — np. „Hero front" (IMAGE_TEXT). Każda sekcja
            ma 2 sloty (lewy + prawy), każdy slot to tekst albo obraz.
          </p>
          <div className="pt-2">
            <Button onClick={openCreate} variant="outline" className="gap-1.5">
              <Plus className="size-3.5" /> Pierwsza sekcja
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {sections.map((s, idx) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                      Sekcja {idx + 1}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                      {LAYOUT_LABELS[s.layout]}
                    </span>
                  </div>
                  <h3 className="font-semibold text-base mt-1">{s.name}</h3>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => move(idx, "up")}
                    disabled={pending || idx === 0}
                    title="W górę"
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => move(idx, "down")}
                    disabled={pending || idx === sections.length - 1}
                    title="W dół"
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openEdit(s)}
                    title="Edytuj"
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteSection(s.id)}
                    title="Usuń"
                    className="text-rose-600 hover:text-rose-700"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <SectionPreview section={s} />
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editingSection ? "Edytuj sekcję" : "Nowa sekcja"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sec-name" className="text-sm">
                Nazwa sekcji <span className="text-red-500">*</span>
              </Label>
              <Input
                id="sec-name"
                placeholder="np. Hero front, Parametry, Galeria użycia"
                value={dlgName}
                onChange={(e) => setDlgName(e.target.value)}
              />
              <p className="text-[10px] text-slate-500">
                Wewnętrzna nazwa — pomaga zrozumieć co tutaj wstawiać przy
                produkcie. Nie pojawia się w finalnym opisie.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Layout (lewa + prawa kolumna)</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["IMAGE_TEXT", "TEXT_IMAGE", "IMAGE_IMAGE", "TEXT_TEXT"] as const).map(
                  (l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setDlgLayout(l)}
                      className={cn(
                        "p-2 rounded ring-1 transition-all text-left",
                        dlgLayout === l
                          ? "ring-emerald-500 bg-emerald-50/40 ring-2"
                          : "ring-slate-200 hover:ring-slate-400",
                      )}
                    >
                      <div className="text-[11px] font-semibold mb-1">
                        {LAYOUT_LABELS[l]}
                      </div>
                      <SectionPreview
                        section={{
                          id: "preview",
                          name: "",
                          layout: l,
                          sortOrder: 0,
                          leftHint: null,
                          rightHint: null,
                          leftImagePrompt: null,
                          rightImagePrompt: null,
                          leftTextPrompt: null,
                          rightTextPrompt: null,
                        }}
                      />
                    </button>
                  ),
                )}
              </div>
            </div>

            {(() => {
              const [leftKind, rightKind] =
                dlgLayout === "TEXT_TEXT"
                  ? (["TEXT", "TEXT"] as const)
                  : dlgLayout === "IMAGE_TEXT"
                    ? (["IMAGE", "TEXT"] as const)
                    : dlgLayout === "TEXT_IMAGE"
                      ? (["TEXT", "IMAGE"] as const)
                      : (["IMAGE", "IMAGE"] as const);
              return (
                <div className="grid grid-cols-2 gap-4">
                  <SlotConfigBlock
                    side="Lewy"
                    kind={leftKind}
                    hint={dlgLeftHint}
                    setHint={setDlgLeftHint}
                    imagePrompt={dlgLeftImagePrompt}
                    setImagePrompt={setDlgLeftImagePrompt}
                    textPrompt={dlgLeftTextPrompt}
                    setTextPrompt={setDlgLeftTextPrompt}
                  />
                  <SlotConfigBlock
                    side="Prawy"
                    kind={rightKind}
                    hint={dlgRightHint}
                    setHint={setDlgRightHint}
                    imagePrompt={dlgRightImagePrompt}
                    setImagePrompt={setDlgRightImagePrompt}
                    textPrompt={dlgRightTextPrompt}
                    setTextPrompt={setDlgRightTextPrompt}
                  />
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button onClick={saveSection} disabled={pending} className="gap-1.5">
              <Save className="size-3.5" />
              {editingSection ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SlotConfigBlock({
  side,
  kind,
  hint,
  setHint,
  imagePrompt,
  setImagePrompt,
  textPrompt,
  setTextPrompt,
}: {
  side: "Lewy" | "Prawy";
  kind: "TEXT" | "IMAGE";
  hint: string;
  setHint: (v: string) => void;
  imagePrompt: string;
  setImagePrompt: (v: string) => void;
  textPrompt: string;
  setTextPrompt: (v: string) => void;
}) {
  return (
    <div className="space-y-2 rounded ring-1 ring-slate-200 p-2.5 bg-slate-50/40">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded",
            kind === "IMAGE"
              ? "bg-violet-100 text-violet-700"
              : "bg-slate-200 text-slate-700",
          )}
        >
          {side} {kind}
        </span>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-slate-500">
          Hint dla operatora
        </Label>
        <Textarea
          rows={2}
          placeholder="krótka instrukcja co tu wstawić (max 1 zdanie)"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          className="text-xs"
        />
      </div>

      {kind === "IMAGE" ? (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-violet-700 flex items-center gap-1">
            <Sparkles className="size-3" /> Prompt AI do zdjęcia (Nano Banana Pro)
          </Label>
          <Textarea
            rows={3}
            placeholder='np. "close-up of material texture, natural lighting, white background, no humans, square crop"'
            value={imagePrompt}
            onChange={(e) => setImagePrompt(e.target.value)}
            className="text-xs"
          />
          <p className="text-[9px] text-slate-500">
            Operator w karcie produktu kliknie „Generuj AI" — Nano Banana
            wygeneruje obraz na podstawie tego prompta + galerii produktu jako referencji.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-emerald-700 flex items-center gap-1">
            <Sparkles className="size-3" /> Prompt AI do tekstu (Claude)
          </Label>
          <Textarea
            rows={3}
            placeholder='np. "Napisz krótki akapit (2-3 zdania) o trwałości materiału. Skup się na korzyściach dla klienta."'
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            className="text-xs"
          />
          <p className="text-[9px] text-slate-500">
            Operator w karcie produktu kliknie „Generuj AI" — Claude wygeneruje
            polski tekst z uwzględnieniem nazwy / koloru / kategorii produktu.
          </p>
        </div>
      )}
    </div>
  );
}
