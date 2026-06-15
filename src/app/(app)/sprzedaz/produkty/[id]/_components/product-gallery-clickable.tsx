"use client";

/**
 * Klikalna galeria zdjęć produktu z opcją AI-edit przez Nano Banana Pro.
 *
 * UX:
 *  - Hover na zdjęciu pokazuje overlay z ikoną „Edit AI"
 *  - Klik → otwiera Dialog z preview oryginału + polem prompt
 *  - Submit → server action wywołuje Nano Banana Pro z oryginałem jako referencją
 *  - Nowy obraz pojawia się na końcu galerii jako dodatkowy ProductImage
 *
 * Nie zastępujemy oryginału — każda edycja to nowy wpis. Stare zdjęcia
 * usuwa się ręcznie przez kartę produktu (zakładka Grafiki).
 */

import { useState, useTransition, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2, ZoomIn, X, ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { editProductImageWithAiAction } from "@/server/product-photos";

interface ImageItem {
  id: string;
  url: string;
  alt: string | null;
  thumbnailWebpUrl: string | null;
  status: "PENDING" | "READY" | "FAILED";
  errorMessage: string | null;
  prompt: string | null;
}

export function ProductGalleryClickable({ images }: { images: ImageItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ImageItem | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();
  // Lightbox — index na liscie READY (filtrowanej); null = zamkniety
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  const readyImages = useMemo(
    () => images.filter((i) => i.status === "READY"),
    [images],
  );

  const nextZoom = useCallback(
    () =>
      setZoomIndex((i) =>
        i === null ? null : (i + 1) % readyImages.length,
      ),
    [readyImages.length],
  );
  const prevZoom = useCallback(
    () =>
      setZoomIndex((i) =>
        i === null
          ? null
          : (i - 1 + readyImages.length) % readyImages.length,
      ),
    [readyImages.length],
  );

  // Klawiatura w lightboxie: ← / → / Esc
  useEffect(() => {
    if (zoomIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomIndex(null);
      else if (e.key === "ArrowRight") nextZoom();
      else if (e.key === "ArrowLeft") prevZoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomIndex, nextZoom, prevZoom]);

  // Polling: gdy mamy PENDING zdjecia, odswiezamy RSC co 3s zeby zobaczyc updaty
  // (backgroundowy worker dopelnia url + status=READY na serwerze).
  const hasPending = useMemo(
    () => images.some((i) => i.status === "PENDING"),
    [images],
  );
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [hasPending, router]);

  function submitEdit() {
    if (!editing) return;
    if (!prompt.trim()) {
      toast.error("Wpisz prompt opisujący zmianę.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await editProductImageWithAiAction(
          editing.id,
          prompt.trim(),
        );
        if (result.ok) {
          toast.success("Generuję — pojawi się w galerii za chwilę");
          setEditing(null);
          setPrompt("");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd");
      }
    });
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
        {images.map((img) => {
          if (img.status === "PENDING") {
            return (
              <div
                key={img.id}
                className="relative aspect-square rounded ring-1 ring-violet-200 overflow-hidden bg-gradient-to-br from-violet-50 via-fuchsia-50 to-violet-50 animate-pulse"
                title={img.prompt ? `Generuję: ${img.prompt}` : "Generuję..."}
              >
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex flex-col items-center gap-1.5 text-violet-700">
                    <Loader2 className="size-5 animate-spin" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                      AI generuje
                    </span>
                  </div>
                </div>
                {img.prompt ? (
                  <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-white/70 backdrop-blur-sm text-[9px] text-slate-700 line-clamp-2">
                    {img.prompt}
                  </div>
                ) : null}
              </div>
            );
          }
          if (img.status === "FAILED") {
            return (
              <div
                key={img.id}
                className="relative aspect-square rounded ring-1 ring-rose-200 overflow-hidden bg-rose-50/60"
                title={img.errorMessage ?? "Generowanie nie powiodło się"}
              >
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex flex-col items-center gap-1 text-rose-600 px-2 text-center">
                    <AlertTriangle className="size-5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                      Błąd AI
                    </span>
                  </div>
                </div>
                {img.errorMessage ? (
                  <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-white/80 backdrop-blur-sm text-[9px] text-rose-700 line-clamp-2">
                    {img.errorMessage}
                  </div>
                ) : null}
              </div>
            );
          }
          // READY
          const readyIdx = readyImages.findIndex((r) => r.id === img.id);
          return (
            <div
              key={img.id}
              className="group relative aspect-square rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50 hover:ring-2 hover:ring-violet-400 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnailWebpUrl ?? img.url}
                alt={img.alt ?? ""}
                className="size-full object-cover"
              />
              {/* Overlay z 2 akcjami pojawia sie na hover */}
              <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/60 transition-colors grid place-items-center gap-1">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-stretch gap-1.5 w-[80%]">
                  <button
                    type="button"
                    onClick={() => readyIdx >= 0 && setZoomIndex(readyIdx)}
                    className="flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-white/90 hover:bg-white text-slate-800 text-[10px] font-semibold uppercase tracking-wide"
                  >
                    <ZoomIn className="size-3" />
                    Powiększ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(img);
                      setPrompt("");
                    }}
                    className="flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold uppercase tracking-wide"
                  >
                    <Sparkles className="size-3" />
                    Edit AI
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox — pełen rozmiar, nawigacja klawiaturą / przyciskami */}
      {zoomIndex !== null && readyImages[zoomIndex] && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomIndex(null)}
        >
          {/* Zamknij */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomIndex(null);
            }}
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors"
            aria-label="Zamknij"
            title="Esc"
          >
            <X className="size-5" />
          </button>
          {/* Poprzednie */}
          {readyImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prevZoom();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors"
              aria-label="Poprzednie"
              title="←"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          {/* Następne */}
          {readyImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextZoom();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors"
              aria-label="Następne"
              title="→"
            >
              <ArrowRight className="size-5" />
            </button>
          )}
          {/* Obraz */}
          <div
            className="relative max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={readyImages[zoomIndex].url}
              alt={readyImages[zoomIndex].alt ?? ""}
              className="max-w-full max-h-[80vh] object-contain rounded ring-1 ring-white/10"
            />
            <div className="text-[11px] text-white/70 tabular-nums">
              {zoomIndex + 1} / {readyImages.length}
              {readyImages[zoomIndex].alt ? (
                <span className="ml-2 text-white/50">
                  · {readyImages[zoomIndex].alt}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-violet-600" />
              Edycja AI (Nano Banana Pro)
            </DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_2fr] gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Oryginał</Label>
                  <div className="aspect-square rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editing.thumbnailWebpUrl ?? editing.url}
                      alt={editing.alt ?? ""}
                      className="size-full object-cover"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ai-prompt" className="text-sm">
                    Co zmienić?
                  </Label>
                  <Textarea
                    id="ai-prompt"
                    placeholder="np. wymień tło na białe studio · zmień kolor na granatowy · dodaj cień pod produktem · usuń logo z rogu · dodaj refleksję na materiale"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={6}
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500">
                    Nano Banana Pro zachowa kompozycję, kąt kamery i pozycję
                    produktu oryginału — zmieni tylko to, o co poprosisz.
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 bg-slate-50 rounded p-2">
                <strong>Tip:</strong> wpisz konkretną zmianę w 1 zdaniu. Im
                bardziej precyzyjnie, tym lepszy efekt. Możesz łączyć: „wymień
                tło na białe studio i dodaj miękkie oświetlenie z lewej strony".
                <br />
                Koszt: ~$0.134 / edycja (2K).
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button
              onClick={submitEdit}
              disabled={pending || !prompt.trim()}
              className={cn(
                "gap-1.5",
                "bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700",
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
                  Generuj edycję
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
