"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import {
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  X,
  Rocket,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  regeneratePhotoImageAction,
  saveImageToProductAction,
  startPhotoBatchAction,
} from "@/server/product-photos";

type ImgRow = {
  id: string;
  productId: string;
  shotId: string;
  storageUrl: string | null;
  status: "PENDING" | "RUNNING" | "OK" | "FAILED" | "SKIPPED";
  errorMessage: string | null;
  customOverride: string | null;
  retryCount: number;
};

type Product = {
  id: string;
  name: string;
  productCode: string;
  color: string | null;
  primaryImageUrl: string | null;
};

type Shot = {
  id: string;
  name: string;
  iconName: string | null;
};

function LucideIcon({
  name,
  className,
}: {
  name: string | null;
  className?: string;
}) {
  if (!name) return <ImageIcon className={className} />;
  const Cmp = (Icons as unknown as Record<string, React.FC<{ className?: string }>>)[
    name
  ];
  if (!Cmp) return <ImageIcon className={className} />;
  return <Cmp className={className} />;
}

export function BatchResultsGrid({
  batchId,
  batchStatus,
  products,
  shots,
  images,
}: {
  batchId: string;
  batchStatus: string;
  products: Product[];
  shots: Shot[];
  images: ImgRow[];
}) {
  const router = useRouter();
  const [editingImage, setEditingImage] = useState<ImgRow | null>(null);
  const [editOverride, setEditOverride] = useState("");
  const [editRefUrl, setEditRefUrl] = useState("");
  const [pending, startTransition] = useTransition();
  const [pendingBatch, startBatch] = useTransition();
  // Lightbox — null = zamknięty; URL = aktualnie pokazany pełen rozmiar
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!zoomUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomUrl]);

  // Index dla szybkiego lookup'u
  const imgKey = (pid: string, sid: string) => `${pid}|${sid}`;
  const imageMap = new Map<string, ImgRow>();
  for (const img of images) {
    imageMap.set(imgKey(img.productId, img.shotId), img);
  }

  function startGeneration() {
    startBatch(async () => {
      try {
        const result = await startPhotoBatchAction(batchId);
        toast.success(
          result.message ?? `Wystartowano (${"queued" in result ? result.queued : 0} w kolejce)`,
          { duration: 8000 },
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd startowania");
      }
    });
  }

  // ─── Auto-polling gdy batch trwa ─────────────────────────────────────
  // Generowanie leci w tle na serwerze (fire-and-forget). UI sprawdza status
  // co 5 s przez `router.refresh()` — Next.js RSC pobiera świeże dane z DB,
  // wyświetla nowo wygenerowane obrazki i progress. Polling zatrzymujemy
  // gdy status batcha != RUNNING (COMPLETED / PARTIAL / FAILED).
  useEffect(() => {
    if (batchStatus !== "RUNNING") return;
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [batchStatus, router]);

  function openEdit(img: ImgRow) {
    setEditingImage(img);
    setEditOverride(img.customOverride ?? "");
    setEditRefUrl("");
  }

  function submitRegenerate() {
    if (!editingImage) return;
    startTransition(async () => {
      try {
        toast.loading("Generuję ponownie…", { id: "regen" });
        await regeneratePhotoImageAction(editingImage.id, {
          customOverride: editOverride || undefined,
          addReferenceUrl: editRefUrl || undefined,
        });
        toast.success("Wygenerowano", { id: "regen" });
        setEditingImage(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd regeneracji", {
          id: "regen",
        });
      }
    });
  }

  async function saveToProduct(img: ImgRow) {
    try {
      const result = await saveImageToProductAction(img.id);
      if (result.ok) {
        toast.success("Dodano do galerii produktu");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  }

  const hasPending = images.some((i) => i.status === "PENDING");
  const canStart =
    hasPending && batchStatus !== "RUNNING" && !pendingBatch;

  return (
    <div className="space-y-3">
      {hasPending && (
        <div className="bg-violet-50 ring-1 ring-violet-200 rounded p-3 flex items-center justify-between gap-3">
          <div className="text-sm">
            <strong className="text-violet-800">
              {images.filter((i) => i.status === "PENDING").length} obrazów
              czeka na generowanie.
            </strong>
            <p className="text-xs text-violet-700">
              Kliknij „Generuj" żeby uruchomić batch — przy braku klucza Gemini
              dostaniesz mock placeholdery.
            </p>
          </div>
          <Button
            onClick={startGeneration}
            disabled={!canStart}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
          >
            {pendingBatch ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Rocket className="size-4" />
            )}
            {pendingBatch ? "Generuję…" : "Generuj wszystkie"}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 sticky left-0 bg-white z-10 min-w-[180px] border-b border-r">
                Produkt
              </th>
              {shots.map((s) => (
                <th
                  key={s.id}
                  className="px-2 py-2 border-b text-center min-w-[120px]"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <LucideIcon
                      name={s.iconName}
                      className="size-3.5 text-violet-600"
                    />
                    {s.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/50">
                <td className="px-2 py-2 sticky left-0 bg-white z-10 border-b border-r align-top">
                  <div className="flex items-center gap-2">
                    {p.primaryImageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.primaryImageUrl}
                        alt=""
                        className="size-10 rounded object-cover bg-slate-100"
                      />
                    ) : (
                      <div className="size-10 rounded bg-slate-100 grid place-items-center text-slate-300">
                        <ImageIcon className="size-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-xs truncate max-w-[150px]">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.productCode}
                        {p.color && ` · ${p.color}`}
                      </div>
                    </div>
                  </div>
                </td>
                {shots.map((s) => {
                  const img = imageMap.get(imgKey(p.id, s.id));
                  if (!img) {
                    return (
                      <td
                        key={s.id}
                        className="px-2 py-2 border-b text-center text-slate-300"
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={s.id}
                      className="px-1 py-1 border-b align-middle text-center"
                    >
                      <ImageCell
                        img={img}
                        onEdit={() => openEdit(img)}
                        onSave={() => saveToProduct(img)}
                        onZoom={() => setZoomUrl(img.storageUrl)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DIALOG: REGENERACJA / EDYCJA */}
      <Dialog
        open={editingImage != null}
        onOpenChange={(o) => {
          if (!o) setEditingImage(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Wygeneruj ponownie</DialogTitle>
          </DialogHeader>
          {editingImage && (
            <div className="space-y-3">
              {editingImage.storageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={editingImage.storageUrl}
                  alt=""
                  className="max-h-48 mx-auto rounded ring-1 ring-slate-200"
                />
              )}
              <div className="space-y-1.5">
                <Label htmlFor="ov">Dodatkowa instrukcja (override)</Label>
                <Textarea
                  id="ov"
                  value={editOverride}
                  onChange={(e) => setEditOverride(e.target.value)}
                  rows={3}
                  placeholder='np. „ciemniejszy odcień", „bardziej kontrastowe oświetlenie", „bez postaci"'
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref">
                  Dodaj URL realnego zdjęcia (referencja koloru / kształtu)
                </Label>
                <Input
                  id="ref"
                  value={editRefUrl}
                  onChange={(e) => setEditRefUrl(e.target.value)}
                  placeholder="https://… lub /uploads/products/…"
                />
                <p className="text-[10px] text-muted-foreground">
                  Imagen dostanie ten obraz jako referencję — pomoże zachować
                  prawdziwy kolor produktu.
                </p>
              </div>
              {editingImage.errorMessage && (
                <div className="text-[11px] bg-rose-50 ring-1 ring-rose-200 rounded p-2 text-rose-700 inline-flex items-start gap-1.5">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                  {editingImage.errorMessage}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingImage(null)}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button
              onClick={submitRegenerate}
              disabled={pending}
              className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {pending ? "Generuję…" : "Wygeneruj ponownie"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox — klik na obraz w siatce wyników */}
      {zoomUrl && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomUrl(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomUrl(null);
            }}
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center"
            aria-label="Zamknij"
            title="Esc"
          >
            <X className="size-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[88vh] object-contain rounded ring-1 ring-white/10"
          />
        </div>
      )}
    </div>
  );
}

function ImageCell({
  img,
  onEdit,
  onSave,
  onZoom,
}: {
  img: ImgRow;
  onEdit: () => void;
  onSave: () => void;
  onZoom: () => void;
}) {
  if (img.status === "PENDING") {
    return (
      <div className="size-20 mx-auto rounded ring-1 ring-dashed ring-slate-300 grid place-items-center text-[10px] text-slate-400 italic">
        czeka
      </div>
    );
  }
  if (img.status === "RUNNING") {
    return (
      <div className="size-20 mx-auto rounded ring-1 ring-indigo-300 bg-indigo-50 grid place-items-center text-indigo-600">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (img.status === "FAILED") {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="size-20 mx-auto rounded ring-1 ring-rose-300 bg-rose-50 grid place-items-center text-rose-600 hover:bg-rose-100 transition"
        title={img.errorMessage ?? "Błąd"}
      >
        <X className="size-5" />
      </button>
    );
  }
  if (img.status === "OK" && img.storageUrl) {
    return (
      <div className="group relative size-20 mx-auto rounded overflow-hidden ring-1 ring-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.storageUrl}
          alt=""
          className="w-full h-full object-cover"
        />
        <div
          className={cn(
            "absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity",
            "flex items-center justify-center gap-1",
          )}
        >
          <button
            type="button"
            onClick={onZoom}
            className="size-7 rounded bg-white text-slate-700 grid place-items-center hover:bg-slate-100"
            title="Powiększ"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="size-7 rounded bg-white text-violet-700 grid place-items-center hover:bg-violet-50"
            title="Wygeneruj ponownie"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onSave}
            className="size-7 rounded bg-white text-emerald-700 grid place-items-center hover:bg-emerald-50"
            title="Zapisz do galerii produktu"
          >
            <Save className="size-3.5" />
          </button>
        </div>
        {img.retryCount > 0 && (
          <span className="absolute top-0.5 left-0.5 text-[8px] bg-slate-900/80 text-white px-1 rounded">
            r{img.retryCount}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="size-20 mx-auto rounded ring-1 ring-slate-200 bg-slate-50 grid place-items-center text-slate-400">
      <ImageIcon className="size-5" />
    </div>
  );
}
