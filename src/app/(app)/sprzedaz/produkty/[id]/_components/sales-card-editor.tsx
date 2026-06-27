"use client";

/**
 * Edytor karty sprzedażowej produktu.
 *
 *  - Wybór szablonu opisu (dropdown z listy)
 *  - Po wyborze: per sekcja edycja slotów (text / image picker)
 *  - Zapis treści przez setProductDescriptionContentAction
 */

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ImageIcon, Save, Layers, Sparkles, Loader2, Wand2, AlertCircle, ChevronDown, Copy, Eye, X } from "lucide-react";

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
  listProductsWithTemplateAction,
  copyDescriptionTemplateFromProductAction,
} from "@/server/description-templates";
import { formatPln, formatUsd } from "@/lib/usd-to-pln";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/rich-text-editor";
import { markdownToHtml } from "@/lib/markdown-to-html";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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
  sectionDividerLogoUrl,
}: {
  productId: string;
  initialTemplateId: string | null;
  initialContent: Record<string, SectionContent>;
  templates: TemplateView[];
  selectedTemplateSections: SectionView[] | null;
  availableImages: ImageAsset[];
  sectionDividerLogoUrl: string | null;
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
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
          `Wygenerowano szablon "${r.templateName}" za ${formatUsd(r.cost.usd, 4)} (~${formatPln(r.cost.usd)})`,
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

  // ─── Autosave ────────────────────────────────────────────────────────
  // Tekst zmieniany w textarea + URL-e wygenerowanych obrazów zapisują się
  // automatycznie z debounce 1500ms. Wcześniej content siedział tylko w
  // lokalnym state — jeśli user nie kliknął „Zapisz" przed odświeżeniem,
  // grafika z AI (kosztowna!) przepadała. Save button zostawiamy jako manual
  // override (force save bez czekania).
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Skip pierwsze odpalenie useEffect — initialContent z prop nie wymaga zapisu
  const initialMountRef = useRef(true);
  // contentRef żeby cleanup miał dostęp do najnowszego content
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (!templateId) return;
    setAutoSaveState("saving");
    const timer = setTimeout(async () => {
      try {
        await setProductDescriptionContentAction(productId, contentRef.current);
        setAutoSaveState("saved");
      } catch (e) {
        setAutoSaveState("error");
        toast.error(
          e instanceof Error
            ? `Autosave: ${e.message}`
            : "Autosave: nie udało się",
        );
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [content, templateId, productId]);

  function saveContent() {
    startTransition(async () => {
      try {
        await setProductDescriptionContentAction(productId, content);
        setAutoSaveState("saved");
        toast.success("Zapisano opis");
        router.refresh();
      } catch (e) {
        setAutoSaveState("error");
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending || draftLoading}
                  className="gap-1.5 ring-1 ring-violet-200 text-violet-700 hover:bg-violet-50"
                />
              }
            >
              {draftLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Generuję draft...
                </>
              ) : (
                <>
                  <Wand2 className="size-3.5" /> Wygeneruj szablon AI
                  <ChevronDown className="size-3.5 opacity-60" />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem
                onClick={generateAiDraft}
                className="flex-col items-start gap-0.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <Wand2 className="size-3.5 text-violet-600" />
                  <span className="text-sm font-medium">Wygeneruj nowy (web search)</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Claude przeszuka sieć i zaprojektuje dedykowany szablon + treść
                </p>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setCopyDialogOpen(true)}
                className="flex-col items-start gap-0.5 py-2"
              >
                <div className="flex items-center gap-1.5">
                  <Copy className="size-3.5 text-emerald-600" />
                  <span className="text-sm font-medium">Skopiuj z innego produktu</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Klon szablonu + treści, opcjonalnie z dostosowaniem AI do różnic
                </p>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            disabled={!templateId || sections.length === 0}
            className="gap-1.5"
            title="Podgląd opisu jak go zobaczy klient"
          >
            <Eye className="size-3.5" /> Podgląd opisu
          </Button>
          <div className="flex items-center gap-2">
            {autoSaveState === "saving" && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Loader2 className="size-3 animate-spin" /> Zapisuję...
              </span>
            )}
            {autoSaveState === "saved" && (
              <span className="text-[11px] text-emerald-700">✓ Zapisane</span>
            )}
            {autoSaveState === "error" && (
              <span className="text-[11px] text-rose-700">⚠ Błąd autosave</span>
            )}
            <Button
              onClick={saveContent}
              disabled={pending || !templateId}
              className="gap-1.5"
              title="Wymuś natychmiastowy zapis (autosave po 1.5s od zmiany)"
            >
              <Save className="size-3.5" /> Zapisz
            </Button>
          </div>
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
              Koszt: {formatUsd(draftResult.cost.usd, 4)}
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-semibold text-emerald-700">
              ~{formatPln(draftResult.cost.usd)}
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
              <div key={s.id}>
                {idx > 0 && (
                  <SectionDivider logoUrl={sectionDividerLogoUrl} />
                )}
                <div
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
                <div className="grid grid-cols-2 gap-3 items-stretch">
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
              </div>
            );
          })}
        </div>
      )}

      {copyDialogOpen && (
        <CopyTemplateDialog
          destProductId={productId}
          onClose={() => setCopyDialogOpen(false)}
          onSuccess={() => {
            setCopyDialogOpen(false);
            router.refresh();
          }}
        />
      )}

      {previewOpen && (
        <PreviewDialog
          sections={sections}
          content={content}
          dividerLogoUrl={sectionDividerLogoUrl}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </Card>
  );
}

function PreviewDialog({
  sections,
  content,
  dividerLogoUrl,
  onClose,
}: {
  sections: SectionView[];
  content: Record<string, SectionContent>;
  dividerLogoUrl: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Eye className="size-4 text-slate-600" />
            Podgląd opisu (jak zobaczy klient)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded grid place-items-center hover:bg-slate-100"
            aria-label="Zamknij"
            title="Esc"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6 flex-1 min-h-0 bg-white">
          <div className="max-w-4xl mx-auto space-y-6">
            {sections.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-12">
                Wybierz szablon i wypełnij sekcje żeby zobaczyć podgląd.
              </p>
            ) : (
              sections.map((s, idx) => {
                const cur = content[s.id] ?? {};
                const [leftKind, rightKind] = layoutToKinds(s.layout);
                return (
                  <div key={s.id}>
                    {idx > 0 && (
                      <SectionDivider logoUrl={dividerLogoUrl} />
                    )}
                    <div className="bg-white rounded-lg p-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-stretch">
                        <PreviewSlot
                          kind={leftKind}
                          text={cur.leftText}
                          imageUrl={cur.leftImageUrl}
                        />
                        <PreviewSlot
                          kind={rightKind}
                          text={cur.rightText}
                          imageUrl={cur.rightImageUrl}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t flex items-center justify-between bg-white">
          <span className="text-[10px] text-slate-500">
            {sections.length} sekcji · podgląd nie zapisuje zmian
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Zamknij
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewSlot({
  kind,
  text,
  imageUrl,
}: {
  kind: "TEXT" | "IMAGE";
  text?: string | null;
  imageUrl?: string | null;
}) {
  if (kind === "IMAGE") {
    if (!imageUrl) {
      return (
        <div className="min-h-[200px] rounded ring-1 ring-dashed ring-slate-300 grid place-items-center text-[10px] text-slate-400 uppercase tracking-wide">
          [pusty slot obraz]
        </div>
      );
    }
    return (
      <div className="rounded overflow-hidden bg-white flex items-center justify-center">
        {/* Obraz w calosci, naturalne proporcje (h-auto), sekcja rosnie z nim. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="block w-full h-auto" />
      </div>
    );
  }
  if (!text || !text.trim()) {
    return (
      <div className="rounded ring-1 ring-dashed ring-slate-300 p-4 text-[10px] text-slate-400 uppercase tracking-wide text-center">
        [pusty slot tekst]
      </div>
    );
  }
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-slate-800",
        "[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1.5",
        "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1",
        "[&_p]:my-1.5 [&_p]:leading-relaxed",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5",
        "[&_strong]:font-semibold [&_strong]:text-slate-900",
        "[&_u]:underline",
      )}
      dangerouslySetInnerHTML={{ __html: markdownToHtml(text) }}
    />
  );
}

/**
 * Separator między sekcjami opisu — 2 cienkie linie + logo firmy w środku.
 * Renderowany w PreviewDialog (i potem w eksporcie HTML do sklepu).
 * Fallback bez loga: same linie z subtelnym łącznikiem.
 */
function SectionDivider({ logoUrl }: { logoUrl: string | null }) {
  return (
    <div
      className="flex items-center justify-center gap-3 py-3 select-none"
      aria-hidden="true"
    >
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-slate-400 max-w-[42%]" />
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-5 w-auto shrink-0 object-contain opacity-60"
        />
      ) : (
        <span className="size-1.5 rounded-full bg-slate-400 shrink-0" />
      )}
      <div className="flex-1 h-px bg-gradient-to-l from-transparent via-slate-300 to-slate-400 max-w-[42%]" />
    </div>
  );
}

function CopyTemplateDialog({
  destProductId,
  onClose,
  onSuccess,
}: {
  destProductId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<
    Array<{
      id: string;
      name: string;
      productCode: string | null;
      color: string | null;
      templateName: string | null;
      sectionCount: number;
      thumbnailUrl: string | null;
    }>
  >([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [mode, setMode] = useState<"copy" | "ai-adjust">("copy");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await listProductsWithTemplateAction(query);
        if (!cancelled) {
          setProducts(res.products.filter((p) => p.id !== destProductId));
        }
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error
            ? `Blad: ${e.message}`
            : "Blad pobierania szablonow (Ctrl+Shift+R)",
        );
        setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, destProductId]);

  async function submit() {
    if (!selectedSource) {
      toast.error("Wybierz produkt zrodlowy.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await copyDescriptionTemplateFromProductAction(
        selectedSource,
        destProductId,
        mode,
      );
      if (r.ok) {
        if (r.adjusted && r.cost) {
          toast.success(
            `Skopiowano i dostosowano "${r.templateName}" za ${formatUsd(r.cost.usd, 4)} (~${formatPln(r.cost.usd)})`,
            { duration: 8000 },
          );
        } else {
          toast.success(`Skopiowano szablon "${r.templateName}"`, {
            duration: 6000,
          });
        }
        onSuccess();
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Blad");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl w-[calc(100%-2rem)] max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Copy className="size-4 text-emerald-600" />
            Skopiuj szablon z innego produktu
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 border-b">
          <Input
            autoFocus
            placeholder="Szukaj produktu po nazwie / SKU / EAN..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="text-sm h-8"
          />
        </div>

        <div className="overflow-y-auto px-2 py-2 flex-1 min-h-0">
          {loading && (
            <div className="grid place-items-center py-8 text-slate-400 text-sm">
              <Loader2 className="size-4 animate-spin mb-2" />
              Laduje produkty z szablonami...
            </div>
          )}
          {!loading && products.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-500">
              Brak produktow z szablonem opisu. Najpierw utworz szablon dla
              innego produktu.
            </div>
          )}
          {!loading &&
            products.map((p) => {
              const isSelected = selectedSource === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedSource(p.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded transition-colors text-left",
                    isSelected
                      ? "bg-emerald-50 ring-1 ring-emerald-400"
                      : "hover:bg-slate-50",
                  )}
                >
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumbnailUrl}
                      alt=""
                      className="size-10 rounded object-cover ring-1 ring-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="size-10 rounded bg-slate-100 ring-1 ring-slate-200 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2 flex-wrap">
                      {p.productCode && (
                        <span className="font-mono">{p.productCode}</span>
                      )}
                      {p.color && <span>· {p.color}</span>}
                      <span>· {p.sectionCount} sekcji</span>
                    </div>
                    {p.templateName && (
                      <div className="text-[10px] text-slate-400 truncate">
                        Szablon: {p.templateName}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <Sparkles className="size-4 text-emerald-600 shrink-0" />
                  )}
                </button>
              );
            })}
        </div>

        {selectedSource && (
          <div className="px-5 py-3 border-t bg-slate-50/60 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Tryb kopiowania
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("copy")}
                className={cn(
                  "p-3 rounded ring-1 text-left transition-all",
                  mode === "copy"
                    ? "ring-2 ring-emerald-500 bg-emerald-50/60"
                    : "ring-slate-200 hover:ring-slate-400 bg-white",
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Copy className="size-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold">Kopia 1:1</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Klon szablonu + treści, bez zmian. Bez kosztu AI.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("ai-adjust")}
                className={cn(
                  "p-3 rounded ring-1 text-left transition-all",
                  mode === "ai-adjust"
                    ? "ring-2 ring-violet-500 bg-violet-50/60"
                    : "ring-slate-200 hover:ring-slate-400 bg-white",
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Wand2 className="size-3.5 text-violet-600" />
                  <span className="text-xs font-semibold">Dostosuj przez AI</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Claude analizuje różnice (kolor, rozmiar, SKU) i podmienia
                  tylko te w tekstach.
                </p>
              </button>
            </div>
          </div>
        )}

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !selectedSource}
            className={cn(
              "gap-1.5",
              mode === "copy"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-violet-600 hover:bg-violet-700",
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {mode === "copy" ? "Kopiuje..." : "Dostosowuje..."}
              </>
            ) : mode === "copy" ? (
              <>
                <Copy className="size-3.5" />
                Skopiuj
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Skopiuj + dostosuj
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  // Dla obrazka: regenerateFromUrl=URL kiedy uzytkownik klika "Edit AI" na istniejacym
  const [regenerateUrl, setRegenerateUrl] = useState<string | null>(null);

  if (kind === "TEXT") {
    return (
      <>
        <div className="space-y-1.5 flex flex-col h-full">
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
                onClick={() => {
                  setRegenerateUrl(null);
                  setDialogOpen(true);
                }}
                title={`Prompt: ${aiTextPrompt}`}
              >
                <Sparkles className="size-3 text-emerald-600" />
                Generuj AI
              </Button>
            ) : null}
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <RichTextEditor
              value={markdownToHtml(value ?? "")}
              onChange={(html) => onChange(html || null)}
              placeholder={hint ?? "Wpisz tekst opisu..."}
            />
          </div>
          {hint ? (
            <p className="text-[10px] text-slate-400">Hint: {hint}</p>
          ) : null}
        </div>
        {dialogOpen && (
          <SlotGenerationDialog
            kind="TEXT"
            productId={productId}
            sectionId={sectionId}
            side={side}
            basePrompt={aiTextPrompt ?? ""}
            availableImages={availableImages}
            regenerateFromUrl={null}
            onClose={() => setDialogOpen(false)}
            onResult={(v) => {
              onChange(v);
              setDialogOpen(false);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
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
              onClick={() => {
                setRegenerateUrl(null);
                setDialogOpen(true);
              }}
              title={`Prompt: ${aiImagePrompt}`}
            >
              <Sparkles className="size-3 text-violet-600" />
              Generuj AI
            </Button>
          ) : null}
        </div>
        {value ? (
          <div className="group relative rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50">
            {/* Obraz dyktuje wysokosc (h-auto) i mieści sie caly bez przyciecia.
                Sasiad-textarea sam sie rozsiagnie do tej samej wysokosci dzieki
                grid items-stretch. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="block w-full h-auto"
            />
            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/50 transition-colors grid place-items-center">
              {aiImagePrompt && (
                <button
                  type="button"
                  onClick={() => {
                    setRegenerateUrl(value);
                    setDialogOpen(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold uppercase tracking-wide"
                  title="Edytuj AI"
                >
                  <Sparkles className="size-3" />
                  Edytuj AI
                </button>
              )}
            </div>
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
      {dialogOpen && (
        <SlotGenerationDialog
          kind="IMAGE"
          productId={productId}
          sectionId={sectionId}
          side={side}
          basePrompt={aiImagePrompt ?? ""}
          availableImages={availableImages}
          regenerateFromUrl={regenerateUrl}
          onClose={() => setDialogOpen(false)}
          onResult={(v) => {
            onChange(v);
            setDialogOpen(false);
            setRegenerateUrl(null);
            // Refresh żeby galeria produktu pokazała nowe zdjęcie
            // (server action dorzuca ProductImage do galerii).
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function SlotGenerationDialog({
  kind,
  productId,
  sectionId,
  side,
  basePrompt,
  availableImages,
  regenerateFromUrl,
  onClose,
  onResult,
}: {
  kind: "TEXT" | "IMAGE";
  productId: string;
  sectionId: string;
  side: "left" | "right";
  basePrompt: string;
  availableImages: ImageAsset[];
  regenerateFromUrl: string | null;
  onClose: () => void;
  onResult: (value: string) => void;
}) {
  const [extraPrompt, setExtraPrompt] = useState("");
  const [editedBasePrompt, setEditedBasePrompt] = useState(basePrompt);
  const [extraRefs, setExtraRefs] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const basePromptModified = editedBasePrompt.trim() !== basePrompt.trim();

  function toggleRef(url: string) {
    setExtraRefs((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url].slice(0, 4),
    );
  }

  async function uploadFromDisk(file: File) {
    if (!file) return;
    if (extraRefs.length >= 4) {
      toast.error("Maksymalnie 4 referencje.");
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { uploadAiRefAction } = await import("@/server/product-photos");
      const r = await uploadAiRefAction(fd);
      if (r.ok) {
        setExtraRefs((prev) => [...prev, r.url].slice(0, 4));
        toast.success("Referencja wgrana");
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Blad uploadu");
    }
  }

  async function submit() {
    setPending(true);
    try {
      const customOverride = basePromptModified ? editedBasePrompt.trim() : "";
      if (kind === "TEXT") {
        const r = await generateSectionTextAction(
          productId,
          sectionId,
          side,
          extraPrompt.trim(),
          customOverride,
        );
        if (r.ok) {
          onResult(r.text);
          toast.success("Tekst wygenerowany");
        } else {
          toast.error(r.error);
        }
      } else {
        const r = await generateSectionImageAction(
          productId,
          sectionId,
          side,
          extraPrompt.trim(),
          extraRefs,
          regenerateFromUrl,
          customOverride,
        );
        if (r.ok) {
          onResult(r.url);
          toast.success(regenerateFromUrl ? "Obraz zaktualizowany" : "Obraz wygenerowany");
        } else {
          toast.error(r.error);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Blad");
    } finally {
      setPending(false);
    }
  }

  const isImage = kind === "IMAGE";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className={cn("size-4", isImage ? "text-violet-600" : "text-emerald-600")} />
            {regenerateFromUrl
              ? "Edytuj AI (Nano Banana Pro)"
              : isImage
                ? "Generuj obraz AI (Nano Banana Pro)"
                : "Generuj tekst AI (Claude)"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0">
          {regenerateFromUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Aktualny obraz (zostanie zachowany jako kompozycja)</Label>
              <div className="aspect-video rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50 max-w-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={regenerateFromUrl} alt="" className="size-full object-cover" />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="slot-base" className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Bazowy prompt z szablonu (edytowalny)
              </Label>
              {basePromptModified && (
                <button
                  type="button"
                  onClick={() => setEditedBasePrompt(basePrompt)}
                  className="text-[10px] text-violet-600 hover:underline"
                  title="Przywróć oryginał z szablonu"
                >
                  ↺ Przywróć
                </button>
              )}
            </div>
            <Textarea
              id="slot-base"
              rows={4}
              value={editedBasePrompt}
              onChange={(e) => setEditedBasePrompt(e.target.value)}
              className="text-[11px] bg-slate-50/60"
              placeholder="np. Studio packshot na białym tle, miękkie światło, kadr top-down..."
            />
            <p className="text-[9px] text-slate-500">
              {basePromptModified
                ? "Edycja użyta TYLKO dla tej generacji. Nie zapisuje się do szablonu."
                : "Możesz edytować bazowy prompt — zmiana użyta jednorazowo dla tej generacji."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-extra" className="text-sm">
              {regenerateFromUrl
                ? "Co zmienić? (wymagane)"
                : "Dodatkowy kontekst (opcjonalne)"}
            </Label>
            <Textarea
              id="slot-extra"
              rows={4}
              placeholder={
                regenerateFromUrl
                  ? "np. zmień kolor produktu na granatowy · wymień tło na białe studio"
                  : "np. dodaj akcent na trwałość · krótszy ton · podkreśl ekologię"
              }
              value={extraPrompt}
              onChange={(e) => setExtraPrompt(e.target.value)}
              autoFocus
            />
            <p className="text-[10px] text-slate-500">
              {regenerateFromUrl
                ? "Kompozycja, kąt kamery i pozycja zostaną zachowane — AI zmieni tylko to o co poprosisz."
                : "Twój dopisek zostanie połączony z bazowym promptem z szablonu."}
            </p>
          </div>

          {isImage && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="text-sm">Dodatkowe zdjęcia referencyjne</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-[10px]"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.onchange = () => {
                        const f = input.files?.[0];
                        if (f) void uploadFromDisk(f);
                      };
                      input.click();
                    }}
                    disabled={pending || extraRefs.length >= 4}
                  >
                    Z dysku
                  </Button>
                </div>
              </div>
              {extraRefs.length > 0 && (
                <div className="flex gap-1.5 flex-wrap p-2 rounded bg-slate-50 ring-1 ring-slate-200">
                  {extraRefs.map((url, i) => (
                    <div
                      key={url}
                      className="relative size-14 rounded ring-2 ring-violet-500 overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="size-full object-cover" />
                      <span className="absolute top-0 right-0 size-4 grid place-items-center text-[9px] font-bold text-white bg-violet-600 rounded-bl">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExtraRefs((prev) => prev.filter((u) => u !== url))
                        }
                        className="absolute bottom-0 left-0 right-0 py-0.5 bg-slate-900/70 hover:bg-rose-600 text-white text-[9px] font-bold transition-colors"
                      >
                        Usuń
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {availableImages.length > 0 && (
                <>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Z galerii tego produktu (max 4 łącznie):
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {availableImages.map((img) => {
                      const selected = extraRefs.includes(img.url);
                      const disabled = !selected && extraRefs.length >= 4;
                      return (
                        <button
                          key={img.url}
                          type="button"
                          disabled={disabled}
                          onClick={() => toggleRef(img.url)}
                          className={cn(
                            "size-12 rounded ring-1 overflow-hidden shrink-0 transition-all",
                            selected
                              ? "ring-2 ring-violet-500"
                              : "ring-slate-200 hover:ring-violet-300",
                            disabled && "opacity-40 cursor-not-allowed",
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.thumbnailWebpUrl ?? img.url}
                            alt=""
                            className="size-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="rounded p-2 text-[10px] bg-violet-50 text-violet-700">
            Koszt: {isImage ? "$0.134 (~0.54 zł)" : "~$0.003 (~0.01 zł)"} ·{" "}
            {isImage ? "Nano Banana Pro 2K" : "Claude Sonnet 4.6"}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button
            onClick={submit}
            disabled={pending || (!!regenerateFromUrl && !extraPrompt.trim())}
            className={cn(
              "gap-1.5",
              isImage
                ? "bg-violet-600 hover:bg-violet-700"
                : "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Generuję...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                {regenerateFromUrl ? "Generuj edycję" : "Generuj"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
