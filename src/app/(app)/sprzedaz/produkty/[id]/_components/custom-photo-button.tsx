"use client";

/**
 * „+ Dodaj własne zdjęcie" — modal multi-shot generation z opisem grupowym
 * i referencjami per ujęcie.
 *
 * UX:
 *  - Opis ogólny grupy (style/theme) — wspólny dla wszystkich shotów
 *  - Referencje grupy (z galerii produktu + upload) — wspólne dla wszystkich
 *  - Lista ujęć (1-12), każde z:
 *      • własnym promptem
 *      • opcjonalnie własną referencją kompozycyjną (wybór z galerii)
 *  - Submit → generowanie w tle (Nano Banana Pro), dialog się zamyka
 *  - Polling galerii pokazuje nowe zdjęcia jak się skończą
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  Plus,
  Trash2,
  Upload,
  Image as ImageIcon,
  X,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPln, formatUsd } from "@/lib/usd-to-pln";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { generateCustomProductPhotosAction } from "@/server/product-photos";
import { uploadPhotoReferenceAction } from "@/server/product-photos";

interface GalleryImage {
  url: string;
  thumbnailUrl: string;
}

interface ShotConfig {
  id: string;
  prompt: string;
  refUrls: string[];
}

export function AddCustomPhotoButton({
  productId,
  galleryImages,
}: {
  productId: string;
  galleryImages: GalleryImage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groupPrompt, setGroupPrompt] = useState("");
  const [groupRefUrls, setGroupRefUrls] = useState<string[]>([]);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "3:4" | "4:3" | "16:9" | "9:16">("1:1");
  const [shots, setShots] = useState<ShotConfig[]>([
    { id: "s1", prompt: "", refUrls: [] },
  ]);
  const [pickerOpen, setPickerOpen] = useState<{
    target: "group" | { shotId: string };
  } | null>(null);
  const groupUploadRef = useRef<HTMLInputElement | null>(null);
  const shotUploadRef = useRef<HTMLInputElement | null>(null);
  const [shotUploadTarget, setShotUploadTarget] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setGroupPrompt("");
    setGroupRefUrls([]);
    setShots([{ id: "s1", prompt: "", refUrls: [] }]);
  }

  function addShot() {
    if (shots.length >= 12) {
      toast.error("Maksymalnie 12 ujęć naraz");
      return;
    }
    setShots((s) => [
      ...s,
      { id: `s${Date.now()}`, prompt: "", refUrls: [] },
    ]);
  }
  function removeShot(id: string) {
    if (shots.length === 1) {
      toast.error("Musisz mieć przynajmniej 1 ujęcie");
      return;
    }
    setShots((s) => s.filter((x) => x.id !== id));
  }
  function updateShot(id: string, patch: Partial<ShotConfig>) {
    setShots((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function uploadGroupRef(file: File) {
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadPhotoReferenceAction(fd);
      setGroupRefUrls((r) => [...r, res.url]);
      toast.success("Referencja grupy dodana");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd uploadu");
    }
  }
  async function uploadShotRef(shotId: string, file: File) {
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadPhotoReferenceAction(fd);
      const shot = shots.find((s) => s.id === shotId);
      if (shot) {
        updateShot(shotId, { refUrls: [...shot.refUrls, res.url] });
      }
      toast.success("Referencja ujęcia dodana");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd uploadu");
    }
  }

  function addRefFromGallery(url: string) {
    if (!pickerOpen) return;
    if (pickerOpen.target === "group") {
      if (!groupRefUrls.includes(url)) {
        setGroupRefUrls((r) => [...r, url]);
      }
    } else {
      const shotId = pickerOpen.target.shotId;
      const shot = shots.find((s) => s.id === shotId);
      if (shot && !shot.refUrls.includes(url)) {
        updateShot(shotId, { refUrls: [...shot.refUrls, url] });
      }
    }
  }

  function submit() {
    if (!groupPrompt.trim()) {
      toast.error("Wpisz opis ogólny grupy");
      return;
    }
    const withPrompts = shots.filter((s) => s.prompt.trim().length > 0);
    if (withPrompts.length === 0) {
      toast.error("Wypełnij prompt co najmniej jednego ujęcia");
      return;
    }
    startTransition(async () => {
      try {
        const result = await generateCustomProductPhotosAction(productId, {
          groupPrompt,
          groupRefUrls,
          shots: shots.map((s) => ({
            prompt: s.prompt,
            refUrls: s.refUrls,
          })),
          aspectRatio,
        });
        if (result.ok) {
          toast.success(
            `Dodano ${result.queued} placeholder${result.queued === 1 ? "" : "y"} — pojawią się od razu w galerii, AI wypełni je w tle.`,
            { duration: 6000 },
          );
          setOpen(false);
          reset();
          // Placeholdery juz sa widoczne w galerii (status=PENDING). Galeria pollule sama.
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd generowania");
      }
    });
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
      >
        <Sparkles className="size-4" />
        Dodaj własne zdjęcie (AI)
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-violet-600" />
              Generuj własne zdjęcia (Nano Banana Pro)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Opis ogólny */}
            <div className="space-y-1.5">
              <Label htmlFor="group-prompt" className="text-sm font-semibold">
                Opis ogólny grupy <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="group-prompt"
                rows={3}
                placeholder='np. "Studio photo on white background, soft natural lighting, product centered, no humans, professional product photography"'
                value={groupPrompt}
                onChange={(e) => setGroupPrompt(e.target.value)}
              />
              <p className="text-[10px] text-slate-500">
                Wspólny dla wszystkich ujęć. Opisz styl, oświetlenie, tło, ogólny mood.
              </p>
            </div>

            {/* Referencje grupy */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                Referencje grupy (opcjonalnie)
              </Label>
              <RefBar
                urls={groupRefUrls}
                onRemove={(url) =>
                  setGroupRefUrls((r) => r.filter((u) => u !== url))
                }
                onPickGallery={() =>
                  setPickerOpen({ target: "group" })
                }
                onUpload={() => groupUploadRef.current?.click()}
                hasGallery={galleryImages.length > 0}
              />
              <input
                ref={groupUploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    uploadGroupRef(f);
                    e.target.value = "";
                  }
                }}
              />
              <p className="text-[10px] text-slate-500">
                Te obrazy są używane jako kontekst dla WSZYSTKICH ujęć. Daj tu
                np. „mood reference" albo „kolor materiału".
              </p>
            </div>

            {/* Format */}
            <div className="space-y-1.5">
              <Label htmlFor="aspect" className="text-sm font-semibold">
                Format
              </Label>
              <select
                id="aspect"
                value={aspectRatio}
                onChange={(e) =>
                  setAspectRatio(e.target.value as typeof aspectRatio)
                }
                className="w-32 px-3 py-1.5 text-sm rounded-md ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none"
              >
                <option value="1:1">1:1 (kwadrat)</option>
                <option value="3:4">3:4 (portret)</option>
                <option value="4:3">4:3 (poziomo)</option>
                <option value="16:9">16:9 (szeroki)</option>
                <option value="9:16">9:16 (reels/story)</option>
              </select>
            </div>

            {/* Ujęcia */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Ujęcia ({shots.length})
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addShot}
                  className="gap-1.5 h-7"
                >
                  <Plus className="size-3" />
                  Dodaj ujęcie
                </Button>
              </div>

              <div className="space-y-3">
                {shots.map((shot, idx) => (
                  <div
                    key={shot.id}
                    className="rounded-lg ring-1 ring-slate-200 p-3 space-y-2 bg-slate-50/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">
                        Ujęcie {idx + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeShot(shot.id)}
                        className="size-6 p-0 text-rose-600 hover:text-rose-700"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                    <Textarea
                      rows={2}
                      placeholder='np. "front view, full product visible, slight 15° angle to the right"'
                      value={shot.prompt}
                      onChange={(e) =>
                        updateShot(shot.id, { prompt: e.target.value })
                      }
                      className="text-xs"
                    />
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-500">
                        Referencje tego ujęcia (pierwsza = kompozycja)
                      </span>
                      <RefBar
                        urls={shot.refUrls}
                        onRemove={(url) =>
                          updateShot(shot.id, {
                            refUrls: shot.refUrls.filter((u) => u !== url),
                          })
                        }
                        onPickGallery={() =>
                          setPickerOpen({ target: { shotId: shot.id } })
                        }
                        onUpload={() => {
                          setShotUploadTarget(shot.id);
                          shotUploadRef.current?.click();
                        }}
                        hasGallery={galleryImages.length > 0}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <input
                ref={shotUploadRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && shotUploadTarget) {
                    uploadShotRef(shotUploadTarget, f);
                    e.target.value = "";
                    setShotUploadTarget(null);
                  }
                }}
              />
            </div>

            <div className="rounded p-2 text-[10px] bg-violet-50 text-violet-700">
              <strong>Koszt:</strong> {shots.length} × {formatUsd(0.134, 3)} ={" "}
              <strong>{formatUsd(shots.length * 0.134, 3)}</strong>{" "}
              (~{formatPln(shots.length * 0.134)}) (Nano Banana Pro 2K).
              Generowanie leci w tle — możesz zamknąć dialog, zdjęcia pojawią
              się w galerii za 30-90 s.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Anuluj
            </Button>
            <Button
              onClick={submit}
              disabled={pending || !groupPrompt.trim()}
              className="gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Wystartowuję...
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Generuj {shots.length} ujęć
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Picker z galerii produktu (otwierany z group LUB shot) */}
      {pickerOpen && (
        <Dialog
          open={!!pickerOpen}
          onOpenChange={(o) => !o && setPickerOpen(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base">
                Wybierz zdjęcia z galerii produktu
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-500">
              Można dodać wiele. Klikaj — picker zostanie otwarty.
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[60vh] overflow-y-auto">
              {galleryImages.map((img) => {
                const currentRefs =
                  pickerOpen.target === "group"
                    ? groupRefUrls
                    : shots.find(
                        (s) =>
                          typeof pickerOpen.target === "object" &&
                          s.id === pickerOpen.target.shotId,
                      )?.refUrls ?? [];
                const used = currentRefs.includes(img.url);
                return (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => addRefFromGallery(img.url)}
                    disabled={used}
                    className={cn(
                      "aspect-square rounded ring-1 overflow-hidden transition-all relative",
                      used
                        ? "ring-slate-300 opacity-50 cursor-default"
                        : "ring-slate-200 hover:ring-emerald-500 hover:scale-105 cursor-pointer",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    {used && (
                      <div className="absolute inset-0 bg-black/30 grid place-items-center">
                        <span className="text-[9px] uppercase tracking-wide font-bold text-white">
                          dodane
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button onClick={() => setPickerOpen(null)}>Gotowe</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function RefBar({
  urls,
  onRemove,
  onPickGallery,
  onUpload,
  hasGallery,
}: {
  urls: string[];
  onRemove: (url: string) => void;
  onPickGallery: () => void;
  onUpload: () => void;
  hasGallery: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((url) => (
        <div
          key={url}
          className="relative size-12 rounded overflow-hidden ring-1 ring-slate-200 group"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(url)}
            className="absolute top-0.5 right-0.5 size-4 rounded bg-rose-600/90 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition"
          >
            <X className="size-2.5" />
          </button>
        </div>
      ))}
      {hasGallery && (
        <button
          type="button"
          onClick={onPickGallery}
          className="size-12 rounded ring-1 ring-dashed ring-emerald-300 hover:ring-emerald-500 hover:bg-emerald-50 grid place-items-center text-emerald-600 transition"
          title="Z galerii produktu"
        >
          <ImageIcon className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onUpload}
        className="size-12 rounded ring-1 ring-dashed ring-slate-300 hover:ring-violet-400 hover:bg-violet-50 grid place-items-center text-slate-400 hover:text-violet-600 transition"
        title="Wgraj nowe"
      >
        <Upload className="size-4" />
      </button>
    </div>
  );
}
