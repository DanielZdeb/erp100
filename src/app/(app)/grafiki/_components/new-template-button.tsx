"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createPhotoTemplateAction } from "@/server/product-photos";

const DEFAULT_GLOBAL_PROMPT = `Studio product photography, clean white seamless background, soft diffused lighting from upper-left, subtle shadow beneath, sharp focus, high-end commercial style, neutral color temperature 5500K, no props unless specified, professional e-commerce look.`;

const QUALITIES = [
  {
    value: "STANDARD",
    label: "Standard",
    hint: "1024px · ~$0.03 / szt",
  },
  {
    value: "HIGH",
    label: "Wysoka",
    hint: "2K · ~$0.12 / szt",
  },
  {
    value: "ULTRA",
    label: "Ultra",
    hint: "Najwyższa jakość · ~$0.30 / szt",
  },
] as const;

const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 — kwadrat" },
  { value: "4:3", label: "4:3 — sklepowy" },
  { value: "3:4", label: "3:4 — portret" },
  { value: "16:9", label: "16:9 — banner" },
  { value: "9:16", label: "9:16 — story" },
];

export function NewTemplateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [globalPrompt, setGlobalPrompt] = useState(DEFAULT_GLOBAL_PROMPT);
  const [logoPlacement, setLogoPlacement] = useState("");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState<"STANDARD" | "HIGH" | "ULTRA" | "NANO_BANANA_PRO">(
    "STANDARD",
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim() || !globalPrompt.trim()) {
      toast.error("Nazwa i opis stylu są wymagane");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createPhotoTemplateAction({
          name,
          globalPrompt,
          logoPlacementRule: logoPlacement || null,
          referenceImages: [],
          aspectRatio,
          defaultQuality: quality,
        });
        toast.success("Template utworzony");
        setOpen(false);
        router.push(`/grafiki/template/${res.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2" size="sm">
        <Plus className="size-4" />
        Nowy template
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nowy template grafik</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nazwa</Label>
              <Input
                id="t-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Aerial sprzęt — białe tło studio"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-prompt">Opis stylu (master prompt)</Label>
              <Textarea
                id="t-prompt"
                value={globalPrompt}
                onChange={(e) => setGlobalPrompt(e.target.value)}
                rows={5}
                className="text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Ten opis trafia do KAŻDEGO zdjęcia jako baza. Po angielsku
                lepsze rezultaty.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-logo">
                Logo placement (opcjonalnie)
              </Label>
              <Input
                id="t-logo"
                value={logoPlacement}
                onChange={(e) => setLogoPlacement(e.target.value)}
                placeholder='np. „brand logo on the strap, centered, embroidered"'
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-aspect">Proporcje</Label>
                <select
                  id="t-aspect"
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full h-9 rounded-md ring-1 ring-slate-200 px-2 text-sm bg-white"
                >
                  {ASPECT_RATIOS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Domyślna jakość</Label>
                <div className="grid grid-cols-3 gap-1">
                  {QUALITIES.map((q) => (
                    <button
                      key={q.value}
                      type="button"
                      onClick={() => setQuality(q.value)}
                      className={`rounded-md ring-1 text-[10px] px-2 py-1.5 transition-all ${
                        quality === q.value
                          ? "ring-violet-400 bg-violet-50 text-violet-700 font-semibold"
                          : "ring-slate-200 hover:bg-slate-50 text-slate-600"
                      }`}
                      title={q.hint}
                    >
                      <div className="font-semibold">{q.label}</div>
                      <div className="text-[9px] opacity-70">{q.hint}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground italic">
              Po utworzeniu otworzymy edytor — dodasz/edytujesz rzuty,
              referencje, później kliknij „Nowa kampania" by wygenerować.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Anuluj
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Tworzę…" : "Utwórz i edytuj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
