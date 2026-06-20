"use client";

/**
 * "Skopiuj zdjecia z innego produktu" — siostrzany przycisk do AddCustomPhotoButton.
 *
 * UX:
 *  1. Klik -> dialog z szukajka produktow + miniaturami galerii
 *  2. Zaznacz N zdjec z dowolnych produktow (mozna mieszac)
 *  3. Wybierz tryb:
 *     - "Kopia 1:1" (instant, bez kosztu AI)
 *     - "Modyfikacja przez AI" (Nano Banana edit per zdjecie, wymaga promptu)
 *  4. Submit
 *
 * Po stronie serwera: copyImagesFromProductAction(destProductId, sourceIds, mode, opts).
 */

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Copy,
  Search,
  Loader2,
  Sparkles,
  Wand2,
  ImagePlus,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listProductsForRefPickerAction,
  copyImagesFromProductAction,
} from "@/server/product-photos";

type Mode = "copy" | "ai";
type Source = "others" | "current";

export function CopyFromProductButton({
  productId,
  source = "others",
}: {
  productId: string;
  source?: Source;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [products, setProducts] = useState<
    Array<{
      id: string;
      name: string;
      productCode: string | null;
      color: string | null;
      isComponent: boolean;
      images: Array<{
        id: string;
        url: string;
        thumbnailWebpUrl: string | null;
      }>;
    }>
  >([]);

  // Map imageId -> { url, productName } selected
  const [selected, setSelected] = useState<
    Map<string, { url: string; productName: string }>
  >(new Map());

  const [mode, setMode] = useState<Mode>("copy");
  const [aiPrompt, setAiPrompt] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingList(true);
    const t = setTimeout(async () => {
      try {
        const res = await listProductsForRefPickerAction(
          query,
          source === "current" ? { onlyProductId: productId } : {},
        );
        if (cancelled) return;
        // W trybie "current" zostawiamy aktualny produkt; w trybie "others"
        // filtrujemy go zeby nie kopiowac z siebie.
        setProducts(
          source === "current"
            ? res.products
            : res.products.filter((p) => p.id !== productId),
        );
      } catch (e) {
        if (cancelled) return;
        toast.error(
          e instanceof Error
            ? `Nie udalo sie pobrac produktow: ${e.message}`
            : "Nie udalo sie pobrac produktow (odswiez strone Ctrl+Shift+R)",
        );
        setProducts([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, productId, source]);

  function toggle(
    imageId: string,
    url: string,
    productName: string,
  ) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.set(imageId, { url, productName });
      return next;
    });
  }

  function reset() {
    setSelected(new Map());
    setAiPrompt("");
    setMode("copy");
    setQuery("");
  }

  function submit() {
    if (selected.size === 0) {
      toast.error("Wybierz co najmniej 1 zdjecie.");
      return;
    }
    if (selected.size > 20) {
      toast.error("Maksymalnie 20 zdjec naraz.");
      return;
    }
    if (mode === "ai" && !aiPrompt.trim()) {
      toast.error('Wpisz prompt opisujacy zmiane (np. "zmien kolor na granatowy").');
      return;
    }
    const sourceImageIds = Array.from(selected.keys());
    startTransition(async () => {
      try {
        const r = await copyImagesFromProductAction(
          productId,
          sourceImageIds,
          mode,
          mode === "ai" ? { prompt: aiPrompt.trim() } : {},
        );
        if (r.ok) {
          if (mode === "copy") {
            toast.success(`Skopiowano ${r.createdCount} zdjec do galerii.`);
          } else {
            toast.success(
              `Wystartowano ${r.createdCount} edycji AI — placeholdery juz w galerii.`,
              { duration: 6000 },
            );
          }
          setOpen(false);
          reset();
          router.refresh();
        } else {
          toast.error(r.error);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Blad.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5 ring-1 ring-violet-200 text-violet-700 hover:bg-violet-50"
      >
        <Copy className="size-3.5" />
        {source === "current" ? "Z obecnego produktu" : "Z innego produktu"}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="sm:max-w-4xl w-[calc(100%-2rem)] max-h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle className="text-base flex items-center gap-2">
              <ImagePlus className="size-4 text-violet-600" />
              {source === "current"
                ? "Skopiuj zdjecie z obecnego produktu"
                : "Skopiuj zdjecia z innego produktu"}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-3 border-b space-y-3">
            {source === "others" && (
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Szukaj po nazwie, SKU, EAN..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            )}
            {selected.size > 0 && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="font-semibold text-violet-700">
                  Zaznaczone: {selected.size} / 20
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Map())}
                  className="h-6 text-[10px]"
                >
                  Wyczysc
                </Button>
              </div>
            )}
          </div>

          {/* Lista produktow z galeriami */}
          <div className="overflow-y-auto px-5 py-3 flex-1 min-h-0 space-y-4">
            {loadingList && (
              <div className="grid place-items-center py-8 text-slate-400 text-sm">
                <Loader2 className="size-4 animate-spin mb-2" />
                Laduje produkty...
              </div>
            )}
            {!loadingList && products.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-500">
                {source === "current"
                  ? "Ten produkt nie ma jeszcze zadnych zdjec."
                  : "Brak produktow do wyboru."}
              </div>
            )}
            {!loadingList &&
              products.length > 0 &&
              products.every((p) => p.images.length === 0) && (
                <div className="text-center py-8 text-sm text-slate-500">
                  {source === "current"
                    ? "Ten produkt nie ma jeszcze zadnych zdjec."
                    : "Zadne z pasujacych produktow nie ma zdjec."}
                </div>
              )}
            {!loadingList &&
              products
                .filter((p) => p.images.length > 0)
                .map((p) => (
                  <div key={p.id} className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      {p.isComponent && (
                        <span className="inline-flex items-center rounded px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide ring-1 bg-amber-50 text-amber-800 ring-amber-200">
                          Komponent
                        </span>
                      )}
                      <span className="font-semibold">{p.name}</span>
                      {p.productCode && (
                        <span className="font-mono text-[10px] text-slate-500">
                          {p.productCode}
                        </span>
                      )}
                      {p.color && (
                        <span className="text-[10px] text-slate-500">
                          · {p.color}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {p.images.length} grafik
                      </span>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {p.images.map((img) => {
                        const isSelected = selected.has(img.id);
                        const isDisabled = !isSelected && selected.size >= 20;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => toggle(img.id, img.url, p.name)}
                            className={cn(
                              "relative size-16 shrink-0 rounded ring-1 overflow-hidden transition-all",
                              isSelected
                                ? "ring-2 ring-violet-500"
                                : "ring-slate-200 hover:ring-violet-400",
                              isDisabled && "opacity-40 cursor-not-allowed",
                            )}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.thumbnailWebpUrl ?? img.url}
                              alt=""
                              className="size-full object-cover"
                            />
                            {isSelected && (
                              <span className="absolute inset-0 grid place-items-center bg-violet-600/40 text-white text-xs font-bold">
                                ✓
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
          </div>

          {/* Mode selector */}
          {selected.size > 0 && (
            <div className="px-5 py-3 border-t space-y-3 bg-slate-50/60">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Co zrobic z {selected.size} zaznaczonymi?
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
                    Te same zdjecia trafia do galerii tego produktu. Bez kosztu,
                    natychmiast.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("ai")}
                  className={cn(
                    "p-3 rounded ring-1 text-left transition-all",
                    mode === "ai"
                      ? "ring-2 ring-violet-500 bg-violet-50/60"
                      : "ring-slate-200 hover:ring-slate-400 bg-white",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wand2 className="size-3.5 text-violet-600" />
                    <span className="text-xs font-semibold">
                      Modyfikacja przez AI
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Nano Banana Pro edytuje kazde wedlug Twojego promptu (np.
                    zmiana koloru / tla). Koszt: {selected.size} ×{" "}
                    {formatUsd(0.134, 3)} ={" "}
                    <strong>
                      {formatUsd(selected.size * 0.134, 2)} (
                      {formatPln(selected.size * 0.134)})
                    </strong>
                  </p>
                </button>
              </div>
              {mode === "ai" && (
                <div className="space-y-1.5">
                  <Label htmlFor="copy-ai-prompt" className="text-xs">
                    Co zmienic w kazdym zdjeciu?
                  </Label>
                  <Textarea
                    id="copy-ai-prompt"
                    rows={3}
                    placeholder='np. "zmien kolor produktu na granatowy" · "wymien tlo na biale studio" · "dodaj cien pod produktem"'
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    className="text-xs"
                  />
                  <p className="text-[10px] text-slate-500">
                    Kazde zaznaczone zdjecie zostanie potraktowane jak oryginal
                    do edycji — kompozycja, kat kamery i pozycja zostana
                    zachowane.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="px-5 py-3 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button
              onClick={submit}
              disabled={pending || selected.size === 0}
              className={cn(
                "gap-1.5",
                mode === "copy"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-violet-600 hover:bg-violet-700",
              )}
            >
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {mode === "copy" ? "Kopiuje..." : "Startuje AI..."}
                </>
              ) : mode === "copy" ? (
                <>
                  <Copy className="size-3.5" />
                  Skopiuj {selected.size} zdjec
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  Generuj {selected.size} edycji
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
