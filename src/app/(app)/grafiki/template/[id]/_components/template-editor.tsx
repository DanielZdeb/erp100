"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import { Plus, Save, Trash2, Sparkles, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  createPhotoShotAction,
  deletePhotoShotAction,
  deletePhotoTemplateAction,
  updatePhotoShotAction,
  updatePhotoTemplateAction,
} from "@/server/product-photos";
import { SHOT_PRESETS } from "@/lib/photo-shots-presets";

type Shot = {
  id: string;
  name: string;
  iconName: string | null;
  shotPrompt: string;
  sortOrder: number;
  isPreset: boolean;
};

type Template = {
  id: string;
  name: string;
  globalPrompt: string;
  logoPlacementRule: string | null;
  referenceImages: string[];
  aspectRatio: string;
  defaultQuality: "STANDARD" | "HIGH" | "ULTRA";
};

function LucideIcon({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  if (!name) return <ImageIcon className={className} />;
  const Cmp = (Icons as unknown as Record<string, React.FC<{ className?: string }>>)[
    name
  ];
  if (!Cmp) return <ImageIcon className={className} />;
  return <Cmp className={className} />;
}

export function TemplateEditor({
  template: initialTemplate,
  shots: initialShots,
}: {
  template: Template;
  shots: Shot[];
}) {
  const router = useRouter();
  const [template, setTemplate] = useState(initialTemplate);
  const [shots, setShots] = useState(initialShots);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [pendingSave, startSave] = useTransition();

  function saveTemplate() {
    startSave(async () => {
      try {
        await updatePhotoTemplateAction(template.id, {
          name: template.name,
          globalPrompt: template.globalPrompt,
          logoPlacementRule: template.logoPlacementRule,
          referenceImages: template.referenceImages,
          aspectRatio: template.aspectRatio,
          defaultQuality: template.defaultQuality,
        });
        toast.success("Zapisano template");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  async function addShotFromPreset(preset: (typeof SHOT_PRESETS)[number]) {
    try {
      const res = await createPhotoShotAction({
        templateId: template.id,
        name: preset.name,
        iconName: preset.iconName,
        shotPrompt: preset.shotPrompt,
        sortOrder: shots.length,
      });
      setShots((prev) => [
        ...prev,
        {
          id: res.shot.id,
          name: preset.name,
          iconName: preset.iconName,
          shotPrompt: preset.shotPrompt,
          sortOrder: shots.length,
          isPreset: false,
        },
      ]);
      setShowPresetPicker(false);
      toast.success("Dodano rzut");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  }

  async function addCustomShot() {
    try {
      const res = await createPhotoShotAction({
        templateId: template.id,
        name: "Nowy rzut",
        iconName: "Image",
        shotPrompt: "describe how this shot should look",
        sortOrder: shots.length,
      });
      setShots((prev) => [
        ...prev,
        {
          id: res.shot.id,
          name: "Nowy rzut",
          iconName: "Image",
          shotPrompt: "describe how this shot should look",
          sortOrder: shots.length,
          isPreset: false,
        },
      ]);
      toast.success("Dodano pusty rzut — edytuj poniżej");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  }

  async function updateShot(id: string, patch: Partial<Shot>) {
    setShots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
    try {
      await updatePhotoShotAction(id, patch);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu rzutu");
    }
  }

  async function removeShot(id: string) {
    if (!confirm("Usunąć ten rzut z template'u?")) return;
    try {
      await deletePhotoShotAction(id);
      setShots((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  }

  async function removeTemplate() {
    if (!confirm("Usunąć cały template? Kampanie zostaną zachowane.")) return;
    try {
      await deletePhotoTemplateAction(template.id);
      router.push("/grafiki");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  }

  const presetsNotYetAdded = SHOT_PRESETS.filter(
    (p) => !shots.some((s) => s.name === p.name),
  );

  return (
    <div className="space-y-4">
      {/* GŁÓWNE USTAWIENIA */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            Ustawienia template'u
          </h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={removeTemplate}
              className="text-rose-700 hover:bg-rose-50 hover:border-rose-300"
            >
              <Trash2 className="size-3.5" />
              Usuń
            </Button>
            <Button size="sm" onClick={saveTemplate} disabled={pendingSave}>
              <Save className="size-3.5" />
              {pendingSave ? "Zapisuję…" : "Zapisz"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Nazwa</Label>
            <Input
              id="t-name"
              value={template.name}
              onChange={(e) =>
                setTemplate((p) => ({ ...p, name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Proporcje</Label>
            <select
              value={template.aspectRatio}
              onChange={(e) =>
                setTemplate((p) => ({ ...p, aspectRatio: e.target.value }))
              }
              className="h-9 rounded-md ring-1 ring-slate-200 px-2 text-sm bg-white min-w-[120px]"
            >
              {["1:1", "4:3", "3:4", "16:9", "9:16"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-prompt">Master prompt (styl wszystkich zdjęć)</Label>
          <Textarea
            id="t-prompt"
            value={template.globalPrompt}
            onChange={(e) =>
              setTemplate((p) => ({ ...p, globalPrompt: e.target.value }))
            }
            rows={5}
            className="text-xs font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="t-logo">Logo placement (opcjonalnie)</Label>
          <Input
            id="t-logo"
            value={template.logoPlacementRule ?? ""}
            onChange={(e) =>
              setTemplate((p) => ({
                ...p,
                logoPlacementRule: e.target.value || null,
              }))
            }
            placeholder='np. „brand logo on the strap, centered, embroidered"'
          />
        </div>

        <div className="space-y-1.5">
          <Label>Jakość domyślna</Label>
          <div className="flex gap-2">
            {(["STANDARD", "HIGH", "ULTRA"] as const).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setTemplate((p) => ({ ...p, defaultQuality: q }))}
                className={cn(
                  "px-3 py-1.5 rounded text-xs font-semibold ring-1 transition",
                  template.defaultQuality === q
                    ? "bg-violet-100 text-violet-800 ring-violet-300"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                )}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* RZUTY */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Rzuty ({shots.length})
            </h2>
            <p className="text-[10px] text-muted-foreground">
              Każdy „rzut" = jeden kąt / kontekst. Wybierasz tikami w kampanii
              które chcesz wygenerować dla danych produktów.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowPresetPicker((v) => !v)}
              className="gap-1.5"
            >
              <Sparkles className="size-3.5" />
              Z presetów
            </Button>
            <Button size="sm" onClick={addCustomShot} className="gap-1.5">
              <Plus className="size-3.5" />
              Własny
            </Button>
          </div>
        </div>

        {showPresetPicker && (
          <div className="ring-1 ring-violet-200 bg-violet-50/40 rounded p-3 space-y-2">
            <p className="text-[10px] text-violet-700 font-semibold uppercase">
              Dodaj rzut z gotowego presetu:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {presetsNotYetAdded.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => addShotFromPreset(p)}
                  className="flex items-start gap-2 px-2.5 py-2 rounded ring-1 ring-slate-200 bg-white hover:ring-violet-400 hover:bg-violet-50 text-left transition"
                >
                  <LucideIcon
                    name={p.iconName}
                    className="size-4 text-violet-600 shrink-0 mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {p.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2">
                      {p.shotPrompt}
                    </div>
                  </div>
                </button>
              ))}
              {presetsNotYetAdded.length === 0 && (
                <div className="col-span-full text-[10px] italic text-muted-foreground py-2 text-center">
                  Wszystkie presety już dodane — możesz tworzyć własne.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {shots.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground italic">
              Brak rzutów. Dodaj z presetów lub własny.
            </div>
          ) : (
            shots.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[auto_180px_1fr_auto] gap-2 items-start bg-white ring-1 ring-slate-200 rounded p-2"
              >
                <LucideIcon
                  name={s.iconName}
                  className="size-5 text-violet-600 mt-1.5 ml-1"
                />
                <Input
                  value={s.name}
                  onChange={(e) => updateShot(s.id, { name: e.target.value })}
                  className="text-xs font-medium"
                />
                <Textarea
                  value={s.shotPrompt}
                  onChange={(e) =>
                    updateShot(s.id, { shotPrompt: e.target.value })
                  }
                  rows={2}
                  className="text-[11px] font-mono"
                />
                <button
                  type="button"
                  onClick={() => removeShot(s.id)}
                  className="size-7 rounded grid place-items-center hover:bg-rose-100 text-rose-600"
                  title="Usuń rzut"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
