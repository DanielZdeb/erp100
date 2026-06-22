"use client";

/**
 * ProductsPreviewGrid — pokazuje 1 zdjęcie reprezentanta zamówienia
 * (cover override jeśli ustawiony, inaczej produkt z największej kategorii).
 * Klik na ikonkę ołówka (hover) otwiera picker do wyboru cover'a z pozycji
 * lub uploadu z dysku.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Package, Pencil, Upload, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setOrderCoverImageAction } from "@/server/orders";
import { uploadPhotoReferenceAction } from "@/server/product-photos";

type PreviewItem = {
  name: string;
  qty: number;
  sku: number;
  sampleImageUrl: string | null;
  sampleProductName: string;
  sampleProductCode: string;
};

type AvailableImage = { url: string; alt: string };

export function ProductsPreviewGrid({
  orderId,
  coverImageUrl,
  availableImages,
  items,
  fillRate,
  containerCount,
  containerSize,
  usedCbm,
  hideContainerStats = false,
}: {
  orderId: string;
  coverImageUrl: string | null;
  availableImages: AvailableImage[];
  items: PreviewItem[];
  fillRate: number;
  containerCount: number;
  containerSize: number;
  usedCbm: number;
  /** Zamowienia z PL nie maja "kontenera" — chowamy pasek pod miniatura. */
  hideContainerStats?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cover: override > pierwsze zdjecie z dominujacej kategorii > brak
  const autoHero = items.find((i) => i.sampleImageUrl) ?? items[0] ?? null;
  const heroUrl = coverImageUrl ?? autoHero?.sampleImageUrl ?? null;
  const heroAlt =
    coverImageUrl != null
      ? "Cover zamówienia"
      : (autoHero?.sampleProductName ?? "Zamówienie");
  const fillPct = Math.round(fillRate * 100);

  function setCover(url: string | null) {
    startTransition(async () => {
      try {
        await setOrderCoverImageAction(orderId, url);
        toast.success(url ? "Zmieniono miniaturę" : "Przywrócono auto");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("To nie jest obraz");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Plik za duży (max 20 MB)");
      return;
    }
    startTransition(async () => {
      const toastId = toast.loading("Wgrywam zdjęcie...");
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await uploadPhotoReferenceAction(fd);
        await setOrderCoverImageAction(orderId, res.url);
        toast.success("Zmieniono miniaturę", { id: toastId });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Błąd uploadu", {
          id: toastId,
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1 shrink-0 group/cover">
      <div
        className="relative size-14 rounded overflow-hidden ring-1 ring-slate-200 bg-slate-50 grid place-items-center"
        title={items
          .map(
            (i) =>
              `${i.name}: ${i.sampleProductName} (${i.sku} SKU × ${i.qty} szt)`,
          )
          .join("\n")}
      >
        {heroUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={heroUrl}
            alt={heroAlt}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="size-full grid place-items-center bg-slate-100 text-slate-300">
            <Package className="size-5" />
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          className={cn(
            "absolute inset-0 grid place-items-center bg-slate-900/60 text-white",
            "opacity-0 group-hover/cover:opacity-100 transition-opacity",
          )}
          title="Zmień miniaturę"
        >
          <Pencil className="size-4" />
        </button>
      </div>
      {/* Pod miniaturą: skrót danych kontenera (tylko dla zamówień importowych z Chin) */}
      {!hideContainerStats && (
        <div
          className={cn(
            "text-[8px] tabular-nums font-semibold",
            fillPct >= 90
              ? "text-emerald-700"
              : fillPct >= 50
                ? "text-amber-700"
                : "text-slate-500",
          )}
          title={`Wypełnienie: ${usedCbm.toFixed(1)} / ${(containerSize * containerCount).toFixed(1)} m³`}
        >
          {containerCount}×{containerSize.toFixed(0)}m³ · {fillPct}%
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Miniatura zamówienia</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Z pozycji zamówienia
              </div>
              {availableImages.length === 0 ? (
                <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 px-3 py-4 text-xs text-slate-500 text-center">
                  Brak zdjęć w pozycjach — dodaj zdjęcie produktowi
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2">
                  {availableImages.map((img) => {
                    const active = coverImageUrl === img.url;
                    return (
                      <button
                        key={img.url}
                        type="button"
                        onClick={() => setCover(img.url)}
                        disabled={pending}
                        className={cn(
                          "relative aspect-square rounded ring-1 overflow-hidden transition-all",
                          active
                            ? "ring-2 ring-emerald-500"
                            : "ring-slate-200 hover:ring-violet-400",
                        )}
                        title={img.alt}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.alt}
                          className="w-full h-full object-cover"
                        />
                        {active && (
                          <span className="absolute inset-0 grid place-items-center bg-emerald-600/40 text-white text-xs font-bold">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Inne opcje
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending}
                  className="gap-1.5"
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  Z komputera
                </Button>
                {coverImageUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCover(null)}
                    disabled={pending}
                    className="gap-1.5 text-amber-700"
                  >
                    <X className="size-3.5" />
                    Przywróć auto
                  </Button>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Zamknij
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
