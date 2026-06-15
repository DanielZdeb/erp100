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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";

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
}

export function ProductGalleryClickable({ images }: { images: ImageItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ImageItem | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pending, startTransition] = useTransition();

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
          toast.success("Wygenerowano nową grafikę");
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
        {images.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => {
              setEditing(img);
              setPrompt("");
            }}
            className="group relative aspect-square rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50 hover:ring-2 hover:ring-violet-400 transition-all"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.thumbnailWebpUrl ?? img.url}
              alt={img.alt ?? ""}
              className="size-full object-cover"
            />
            <div className="absolute inset-0 bg-violet-900/0 group-hover:bg-violet-900/50 transition-colors grid place-items-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center gap-1 text-white">
                <Sparkles className="size-5" />
                <span className="text-[9px] uppercase tracking-wide font-bold">
                  Edit AI
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

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
