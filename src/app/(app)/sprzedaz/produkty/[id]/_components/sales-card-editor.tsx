"use client";

/**
 * Edytor karty sprzedażowej produktu.
 *
 *  - Wybór szablonu opisu (dropdown z listy)
 *  - Po wyborze: per sekcja edycja slotów (text / image picker)
 *  - Zapis treści przez setProductDescriptionContentAction
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ImageIcon, Save, Layers, Sparkles, Loader2, Wand2, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  setProductDescriptionTemplateAction,
  setProductDescriptionContentAction,
  generateSectionTextAction,
  generateSectionImageAction,
  aiGenerateSalesDraftForProductAction,
} from "@/server/description-templates";

type Layout = "TEXT_TEXT" | "IMAGE_TEXT" | "TEXT_IMAGE" | "IMAGE_IMAGE";

interface SectionView {
  id: string;
  name: string;
  layout: Layout;
  leftHint: string | null;
  rightHint: string | null;
  leftImagePrompt?: string | null;
  rightImagePrompt?: string | null;
  leftTextPrompt?: string | null;
  rightTextPrompt?: string | null;
}

interface TemplateView {
  id: string;
  name: string;
  sections: SectionView[];
}

interface ImageAsset {
  url: string;
  thumbnailWebpUrl: string | null;
  alt: string | null;
}

type SectionContent = {
  leftText?: string | null;
  rightText?: string | null;
  leftImageUrl?: string | null;
  rightImageUrl?: string | null;
};

export function SalesCardEditor({
  productId,
  initialTemplateId,
  initialContent,
  templates,
  selectedTemplateSections,
  availableImages,
}: {
  productId: string;
  initialTemplateId: string | null;
  initialContent: Record<string, SectionContent>;
  templates: TemplateView[];
  selectedTemplateSections: SectionView[] | null;
  availableImages: ImageAsset[];
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [content, setContent] = useState<Record<string, SectionContent>>(
    initialContent,
  );
  const [pending, startTransition] = useTransition();
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftResult, setDraftResult] = useState<{
    templateName: string;
    missingInfo: string[];
    researchSummary: string;
    cost: {
      inputTokens: number;
      outputTokens: number;
      cacheCreateTokens: number;
      cacheReadTokens: number;
      webSearches: number;
      usd: number;
    };
  } | null>(null);

  async function generateAiDraft() {
    if (
      !confirm(
        "AI przeszuka sieć dla podobnych produktów i wygeneruje nowy, dopasowany szablon + treść opisu. Operacja zajmie ~30-60s. Kontynuować?",
      )
    )
      return;
    setDraftLoading(true);
    try {
      const r = await aiGenerateSalesDraftForProductAction(productId);
      if (r.ok) {
        setDraftResult({
          templateName: r.templateName,
          missingInfo: r.missingInfo,
          researchSummary: r.researchSummary,
          cost: r.cost,
        });
        toast.success(
          `Wygenerowano szablon "${r.templateName}" za $${r.cost.usd.toFixed(4)}`,
          { duration: 8000 },
        );
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się");
    } finally {
      setDraftLoading(false);
    }
  }

  const sections =
    selectedTemplateSections ??
    templates.find((t) => t.id === templateId)?.sections ??
    [];

  function selectTemplate(newId: string | null) {
    setTemplateId(newId);
    startTransition(async () => {
      try {
        await setProductDescriptionTemplateAction(productId, newId);
        toast.success(newId ? "Szablon wybrany" : "Szablon usunięty");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function setSlot(
    sectionId: string,
    side: "left" | "right",
    kind: "text" | "image",
    value: string | null,
  ) {
    setContent((c) => {
      const cur = c[sectionId] ?? {};
      const field =
        kind === "text"
          ? side === "left"
            ? "leftText"
            : "rightText"
          : side === "left"
            ? "leftImageUrl"
            : "rightImageUrl";
      return { ...c, [sectionId]: { ...cur, [field]: value } };
    });
  }

  function saveContent() {
    startTransition(async () => {
      try {
        await setProductDescriptionContentAction(productId, content);
        toast.success("Zapisano opis");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card className="p-5 space-y-5">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Opis sprzedażowy
          </h2>
          <p className="text-[11px] text-slate-500 max-w-md">
            Wybierz szablon, a potem wypełnij każdą sekcję tekstem albo obrazem
            z galerii produktu.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={generateAiDraft}
            disabled={pending || draftLoading}
            className="gap-1.5 ring-1 ring-violet-200 text-violet-700 hover:bg-violet-50"
            title="AI przeszuka sieć i wygeneruje dopasowany szablon + treść opisu dla tego produktu"
          >
            {draftLoading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Generuję draft...
              </>
            ) : (
              <>
                <Wand2 className="size-3.5" /> Wygeneruj szablon AI
              </>
            )}
          </Button>
          <Button
            onClick={saveContent}
            disabled={pending || !templateId}
            className="gap-1.5"
          >
            <Save className="size-3.5" /> Zapisz
          </Button>
        </div>
      </header>

      {draftResult && (
        <div className="rounded-lg ring-1 ring-violet-200 bg-violet-50/40 p-3 space-y-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-violet-900 flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              AI-draft: {draftResult.templateName}
            </div>
            <button
              type="button"
              onClick={() => setDraftResult(null)}
              className="text-[10px] text-slate-500 hover:text-slate-700 uppercase tracking-wide"
            >
              Schowaj
            </button>
          </div>
          {draftResult.researchSummary && (
            <p className="text-[11px] text-slate-700">
              <strong className="text-slate-900">Co AI wyczytało z sieci:</strong>{" "}
              {draftResult.researchSummary}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap text-[10px] text-slate-600 bg-white/60 rounded px-2 py-1 ring-1 ring-violet-100">
            <span className="font-semibold text-violet-900">
              Koszt: ${draftResult.cost.usd.toFixed(4)}
            </span>
            <span className="text-slate-400">·</span>
            <span>
              {draftResult.cost.inputTokens.toLocaleString("pl-PL")} in /{" "}
              {draftResult.cost.outputTokens.toLocaleString("pl-PL")} out tok.
            </span>
            {draftResult.cost.webSearches > 0 && (
              <>
                <span className="text-slate-400">·</span>
                <span>{draftResult.cost.webSearches} web search{draftResult.cost.webSearches > 1 ? "" : ""}</span>
              </>
            )}
            {draftResult.cost.cacheReadTokens > 0 && (
              <>
                <span className="text-slate-400">·</span>
                <span>cache: {draftResult.cost.cacheReadTokens.toLocaleString("pl-PL")} tok.</span>
              </>
            )}
          </div>
          {draftResult.missingInfo.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                <AlertCircle className="size-3" />
                Brakujące dane (uzupełnij ręcznie):
              </p>
              <ul className="list-disc list-inside text-[11px] text-amber-900 space-y-0.5 pl-1">
                {draftResult.missingInfo.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
              <p className="text-[10px] text-slate-500">
                Te informacje znajdziesz w sekcjach jako placeholdery{" "}
                <code className="bg-white px-1 rounded">[BRAK: ...]</code>.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tpl-select" className="text-sm">
          Szablon opisu
        </Label>
        <div className="flex gap-2 items-center">
          <select
            id="tpl-select"
            value={templateId ?? ""}
            onChange={(e) => selectTemplate(e.target.value || null)}
            className="flex-1 max-w-md px-3 py-1.5 text-sm rounded-md ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none"
            disabled={pending}
          >
            <option value="">— brak szablonu —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.sections.length} sekcji)
              </option>
            ))}
          </select>
          <a
            href="/sprzedaz/szablony-opisu"
            className="text-[11px] text-emerald-700 hover:underline"
          >
            Zarządzaj szablonami →
          </a>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg ring-1 ring-slate-200 p-8 text-center text-sm text-slate-500">
          {templateId
            ? "Ten szablon nie ma jeszcze sekcji. Dodaj je w edytorze szablonów."
            : "Wybierz szablon żeby zacząć wypełnianie opisu."}
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((s, idx) => {
            const cur = content[s.id] ?? {};
            const [leftKind, rightKind] = layoutToKinds(s.layout);
            return (
              <div
                key={s.id}
                className="rounded-lg ring-1 ring-slate-200 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                      Sekcja {idx + 1}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">
                      <Layers className="size-2.5 inline mr-0.5" />
                      {layoutLabel(s.layout)}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm">{s.name}</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <SlotEditor
                    productId={productId}
                    sectionId={s.id}
                    side="left"
                    kind={leftKind}
                    hint={s.leftHint}
                    aiTextPrompt={s.leftTextPrompt ?? null}
                    aiImagePrompt={s.leftImagePrompt ?? null}
                    value={
                      leftKind === "TEXT" ? cur.leftText ?? null : cur.leftImageUrl ?? null
                    }
                    onChange={(v) =>
                      setSlot(
                        s.id,
                        "left",
                        leftKind === "TEXT" ? "text" : "image",
                        v,
                      )
                    }
                    availableImages={availableImages}
                  />
                  <SlotEditor
                    productId={productId}
                    sectionId={s.id}
                    side="right"
                    kind={rightKind}
                    hint={s.rightHint}
                    aiTextPrompt={s.rightTextPrompt ?? null}
                    aiImagePrompt={s.rightImagePrompt ?? null}
                    value={
                      rightKind === "TEXT" ? cur.rightText ?? null : cur.rightImageUrl ?? null
                    }
                    onChange={(v) =>
                      setSlot(
                        s.id,
                        "right",
                        rightKind === "TEXT" ? "text" : "image",
                        v,
                      )
                    }
                    availableImages={availableImages}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SlotEditor({
  productId,
  sectionId,
  side,
  kind,
  hint,
  aiTextPrompt,
  aiImagePrompt,
  value,
  onChange,
  availableImages,
}: {
  productId: string;
  sectionId: string;
  side: "left" | "right";
  kind: "TEXT" | "IMAGE";
  hint: string | null;
  aiTextPrompt: string | null;
  aiImagePrompt: string | null;
  value: string | null;
  onChange: (v: string | null) => void;
  availableImages: ImageAsset[];
}) {
  const [generating, setGenerating] = useState(false);

  async function handleGenerateText() {
    setGenerating(true);
    try {
      const r = await generateSectionTextAction(productId, sectionId, side);
      if (!r.ok) {
        toast.error(r.error || "Nie udało się wygenerować tekstu");
        return;
      }
      onChange(r.text);
      toast.success("Tekst wygenerowany");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateImage() {
    setGenerating(true);
    try {
      const r = await generateSectionImageAction(productId, sectionId, side);
      if (!r.ok) {
        toast.error(r.error || "Nie udało się wygenerować obrazu");
        return;
      }
      onChange(r.url);
      toast.success("Obraz wygenerowany");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się");
    } finally {
      setGenerating(false);
    }
  }

  if (kind === "TEXT") {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
            <FileText className="size-3" /> Tekst
          </div>
          {aiTextPrompt ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 gap-1 text-[10px]"
              onClick={handleGenerateText}
              disabled={generating}
              title={`Prompt: ${aiTextPrompt}`}
            >
              {generating ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3 text-emerald-600" />
              )}
              Generuj AI
            </Button>
          ) : null}
        </div>
        <Textarea
          rows={4}
          placeholder={hint ?? "Wpisz tekst opisu..."}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="text-xs"
        />
        {hint ? (
          <p className="text-[10px] text-slate-400">Hint: {hint}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
          <ImageIcon className="size-3" /> Obraz
        </div>
        {aiImagePrompt ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 gap-1 text-[10px]"
            onClick={handleGenerateImage}
            disabled={generating}
            title={`Prompt: ${aiImagePrompt}`}
          >
            {generating ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3 text-violet-600" />
            )}
            Generuj AI
          </Button>
        ) : null}
      </div>
      {value ? (
        <div className="relative rounded ring-1 ring-slate-200 overflow-hidden aspect-video bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="size-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 size-5 rounded-full bg-rose-500 text-white text-[12px] grid place-items-center hover:bg-rose-600"
            title="Usuń wybór"
          >
            ×
          </button>
        </div>
      ) : (
        <div className="rounded ring-1 ring-dashed ring-slate-300 p-3 text-[11px] text-slate-500 text-center">
          {hint ?? "Wybierz obraz z galerii poniżej"}
        </div>
      )}
      {availableImages.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {availableImages.map((img) => {
            const src = img.thumbnailWebpUrl ?? img.url;
            const targetUrl = img.url;
            return (
              <button
                key={img.url}
                type="button"
                onClick={() => onChange(targetUrl)}
                className={cn(
                  "size-12 rounded ring-1 ring-slate-200 overflow-hidden shrink-0 hover:ring-emerald-400 transition-all",
                  value === targetUrl && "ring-emerald-500 ring-2",
                )}
                title={img.alt ?? ""}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="size-full object-cover" />
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">
          Brak grafik w galerii — dodaj je w zakładce „Grafiki produktowe" karty produktu.
        </p>
      )}
    </div>
  );
}

function layoutToKinds(l: Layout): readonly ["TEXT" | "IMAGE", "TEXT" | "IMAGE"] {
  if (l === "TEXT_TEXT") return ["TEXT", "TEXT"] as const;
  if (l === "IMAGE_TEXT") return ["IMAGE", "TEXT"] as const;
  if (l === "TEXT_IMAGE") return ["TEXT", "IMAGE"] as const;
  return ["IMAGE", "IMAGE"] as const;
}

function layoutLabel(l: Layout): string {
  if (l === "TEXT_TEXT") return "Tekst+Tekst";
  if (l === "IMAGE_TEXT") return "Obraz+Tekst";
  if (l === "TEXT_IMAGE") return "Tekst+Obraz";
  return "Obraz+Obraz";
}
