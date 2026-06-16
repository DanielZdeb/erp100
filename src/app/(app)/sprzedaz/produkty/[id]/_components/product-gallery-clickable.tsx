"use client";

/**
 * Klikalna galeria zdjec produktu z opcja AI-edit + archiwum + bulk-select.
 *
 * UX:
 *  - Tabsy "Aktywne" / "Archiwum" (zliczaja po archived flag)
 *  - Hover -> Powiekszenie / Edit AI / Archiwizuj (lub Przywroc) / Usun
 *  - Tryb zaznaczania -> checkboxy + toolbar "Edytuj zaznaczone AI"
 *  - Edit AI modal -> picker refow z galerii + upload z dysku + z innego produktu
 *  - Bulk modal -> ten sam picker, prompt aplikowany do wszystkich zaznaczonych
 *
 * Polling: gdy istnieja PENDING zdjecia, router.refresh() co 3s do empty.
 */

import {
  useState,
  useTransition,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  ZoomIn,
  X,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Trash2,
  CheckSquare,
  Square,
  Upload,
  ImageIcon,
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPln, formatUsd } from "@/lib/usd-to-pln";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  editProductImageWithAiAction,
  bulkEditProductImagesAiAction,
  bulkArchiveProductImagesAction,
  bulkDeleteProductImagesAction,
  reorderProductImagesAction,
  archiveProductImageAction,
  restoreProductImageAction,
  hardDeleteProductImageAction,
  uploadAiRefAction,
  listProductsForRefPickerAction,
} from "@/server/product-photos";

interface ImageItem {
  id: string;
  url: string;
  alt: string | null;
  thumbnailWebpUrl: string | null;
  status: "PENDING" | "READY" | "FAILED";
  errorMessage: string | null;
  prompt: string | null;
  archived: boolean;
}

type Tab = "active" | "archived";

export function ProductGalleryClickable({
  productId,
  images,
}: {
  productId: string;
  images: ImageItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("active");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ImageItem | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Drag and drop reorder
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  // Lokalna kolejnosc do optymistycznego UI (nadpisuje server order do refresh)
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  const activeImages = useMemo(
    () => images.filter((i) => !i.archived),
    [images],
  );
  const archivedImages = useMemo(
    () => images.filter((i) => i.archived),
    [images],
  );
  const visibleRaw = tab === "active" ? activeImages : archivedImages;
  // Jesli mamy lokalny re-order (po drag&drop, jeszcze przed odswiezeniem
  // z serwera), uporzadkuj wg niego — kazda inna pozycja ladauje na koncu
  // w oryginalnej kolejnosci.
  const visible = useMemo(() => {
    if (!localOrder) return visibleRaw;
    const indexMap = new Map(localOrder.map((id, i) => [id, i]));
    return [...visibleRaw].sort((a, b) => {
      const ai = indexMap.has(a.id) ? indexMap.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = indexMap.has(b.id) ? indexMap.get(b.id)! : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  }, [visibleRaw, localOrder]);
  const readyVisible = useMemo(
    () => visible.filter((i) => i.status === "READY"),
    [visible],
  );

  const nextZoom = useCallback(
    () =>
      setZoomIndex((i) =>
        i === null ? null : (i + 1) % readyVisible.length,
      ),
    [readyVisible.length],
  );
  const prevZoom = useCallback(
    () =>
      setZoomIndex((i) =>
        i === null
          ? null
          : (i - 1 + readyVisible.length) % readyVisible.length,
      ),
    [readyVisible.length],
  );

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

  const hasPending = useMemo(
    () => images.some((i) => i.status === "PENDING"),
    [images],
  );
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [hasPending, router]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelectedIds(
      new Set(readyVisible.map((i) => i.id)),
    );
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  function archive(id: string) {
    startTransition(async () => {
      const r = await archiveProductImageAction(id);
      if (r.ok) {
        toast.success("Przeniesiono do archiwum");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function restore(id: string) {
    startTransition(async () => {
      const r = await restoreProductImageAction(id);
      if (r.ok) {
        toast.success("Przywrocono z archiwum");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  // Reset lokalnej kolejnosci gdy server przysle nowe dane
  useEffect(() => {
    setLocalOrder(null);
  }, [images]);

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    // Aktualna kolejnosc visible
    const ids = visible.map((i) => i.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const reordered = [...ids];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setLocalOrder(reordered);
    setDraggedId(null);
    setDragOverId(null);
    // Persist na serwer
    startTransition(async () => {
      const r = await reorderProductImagesAction(productId, reordered);
      if (!r.ok) {
        toast.error(r.error || "Nie udalo sie zmienic kolejnosci");
        setLocalOrder(null);
      } else {
        router.refresh();
      }
    });
  }

  function bulkArchive(restoreInstead = false) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const verb = restoreInstead ? "Przywrocic" : "Przeniesc do archiwum";
    if (!confirm(`${verb} ${ids.length} zdjec?`)) return;
    startTransition(async () => {
      const r = await bulkArchiveProductImagesAction(ids, !restoreInstead);
      if (r.ok) {
        toast.success(
          restoreInstead
            ? `Przywrocono ${r.count} zdjec`
            : `Przeniesiono ${r.count} zdjec do archiwum`,
        );
        clearSelection();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function bulkHardDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Trwale usunac ${ids.length} zdjec? Tej operacji nie da sie cofnac.`,
      )
    )
      return;
    startTransition(async () => {
      const r = await bulkDeleteProductImagesAction(ids);
      if (r.ok) {
        toast.success(`Usunieto ${r.count} zdjec`);
        clearSelection();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function hardDelete(id: string) {
    if (!confirm("Trwale usunac zdjecie? Tej operacji nie da sie cofnac.")) return;
    startTransition(async () => {
      const r = await hardDeleteProductImageAction(id);
      if (r.ok) {
        toast.success("Usunieto");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      {/* Tabs + toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="inline-flex p-0.5 rounded-md bg-slate-100 ring-1 ring-slate-200">
          <button
            type="button"
            onClick={() => {
              setTab("active");
              clearSelection();
            }}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded transition-colors",
              tab === "active"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Aktywne ({activeImages.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("archived");
              clearSelection();
              setSelectMode(false);
            }}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded transition-colors",
              tab === "archived"
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Archiwum ({archivedImages.length})
          </button>
        </div>
        <Button
          type="button"
          size="sm"
          variant={selectMode ? "default" : "outline"}
          onClick={() => {
            setSelectMode((m) => !m);
            if (selectMode) clearSelection();
          }}
          className="h-7 gap-1 text-xs"
        >
          {selectMode ? (
            <CheckSquare className="size-3.5" />
          ) : (
            <Square className="size-3.5" />
          )}
          {selectMode ? "Zaznaczanie: ON" : "Tryb zaznaczania"}
        </Button>
        {selectMode && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={selectAllVisible}
              disabled={readyVisible.length === 0}
              className="h-7 text-xs"
            >
              Zaznacz wszystkie ({readyVisible.length})
            </Button>
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs text-slate-500">
                  Zaznaczone: {selectedIds.size}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setBulkOpen(true)}
                  disabled={pending}
                  className="h-7 gap-1 text-xs bg-violet-600 hover:bg-violet-700"
                >
                  <Sparkles className="size-3.5" />
                  Edytuj AI ({selectedIds.size})
                </Button>
                {tab === "active" ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => bulkArchive(false)}
                    disabled={pending}
                    className="h-7 gap-1 text-xs bg-amber-600 hover:bg-amber-700"
                  >
                    <Archive className="size-3.5" />
                    Archiwum ({selectedIds.size})
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => bulkArchive(true)}
                    disabled={pending}
                    className="h-7 gap-1 text-xs bg-emerald-600 hover:bg-emerald-700"
                  >
                    <ArchiveRestore className="size-3.5" />
                    Przywroc ({selectedIds.size})
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={bulkHardDelete}
                  disabled={pending}
                  className="h-7 gap-1 text-xs bg-rose-600 hover:bg-rose-700"
                >
                  <Trash2 className="size-3.5" />
                  Usun ({selectedIds.size})
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={clearSelection}
                  disabled={pending}
                  className="h-7 text-xs"
                >
                  Wyczysc
                </Button>
              </>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2">
        {visible.map((img) => {
          if (img.status === "PENDING") {
            return (
              <div
                key={img.id}
                className="relative aspect-square rounded ring-1 ring-violet-200 overflow-hidden bg-gradient-to-br from-violet-50 via-fuchsia-50 to-violet-50 animate-pulse"
                title={img.prompt ? `Generuje: ${img.prompt}` : "Generuje..."}
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
                className="group relative aspect-square rounded ring-1 ring-rose-200 overflow-hidden bg-rose-50/60"
                title={img.errorMessage ?? "Generowanie nie powiodlo sie"}
              >
                <div className="absolute inset-0 grid place-items-center">
                  <div className="flex flex-col items-center gap-1 text-rose-600 px-2 text-center">
                    <AlertTriangle className="size-5" />
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                      Blad AI
                    </span>
                  </div>
                </div>
                {img.errorMessage ? (
                  <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-white/80 backdrop-blur-sm text-[9px] text-rose-700 line-clamp-2">
                    {img.errorMessage}
                  </div>
                ) : null}
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/60 transition-colors grid place-items-center">
                  <button
                    type="button"
                    onClick={() => hardDelete(img.id)}
                    className="opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold uppercase tracking-wide"
                    title="Usun"
                  >
                    <Trash2 className="size-3" />
                    Usun
                  </button>
                </div>
              </div>
            );
          }
          // READY
          const readyIdx = readyVisible.findIndex((r) => r.id === img.id);
          const selected = selectedIds.has(img.id);
          const isDragging = draggedId === img.id;
          const isDragOver = dragOverId === img.id && draggedId !== img.id;
          return (
            <div
              key={img.id}
              draggable={!selectMode}
              onDragStart={(e) => {
                if (selectMode) return;
                setDraggedId(img.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", img.id);
              }}
              onDragOver={(e) => {
                if (selectMode || !draggedId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverId !== img.id) setDragOverId(img.id);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragOverId((curr) => (curr === img.id ? null : curr));
              }}
              onDrop={(e) => {
                if (selectMode) return;
                e.preventDefault();
                handleDrop(img.id);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              className={cn(
                "group relative aspect-square rounded ring-1 overflow-hidden bg-slate-50 transition-all",
                !selectMode && "cursor-grab active:cursor-grabbing",
                selected
                  ? "ring-2 ring-violet-500"
                  : isDragOver
                    ? "ring-2 ring-emerald-500 scale-105"
                    : "ring-slate-200 hover:ring-2 hover:ring-violet-400",
                isDragging && "opacity-40",
                img.archived && "opacity-60",
              )}
              title={!selectMode ? "Przeciagnij zeby zmienic kolejnosc" : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbnailWebpUrl ?? img.url}
                alt={img.alt ?? ""}
                className="size-full object-cover pointer-events-none"
              />
              {selectMode && (
                <button
                  type="button"
                  onClick={() => toggleSelect(img.id)}
                  className={cn(
                    "absolute top-1 left-1 size-5 rounded grid place-items-center text-white text-[10px] font-bold transition-colors",
                    selected
                      ? "bg-violet-600"
                      : "bg-white/80 text-slate-600 ring-1 ring-slate-300 hover:bg-white",
                  )}
                >
                  {selected ? "✓" : ""}
                </button>
              )}
              {!selectMode && (
                <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/60 transition-colors grid place-items-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity grid grid-cols-2 gap-1 w-[90%]">
                    <button
                      type="button"
                      onClick={() => readyIdx >= 0 && setZoomIndex(readyIdx)}
                      className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-white/90 hover:bg-white text-slate-800 text-[10px] font-semibold"
                    >
                      <ZoomIn className="size-3" />
                      Pow.
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(img)}
                      className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-semibold"
                    >
                      <Sparkles className="size-3" />
                      Edit
                    </button>
                    {img.archived ? (
                      <button
                        type="button"
                        onClick={() => restore(img.id)}
                        className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold"
                        title="Przywroc do galerii"
                      >
                        <ArchiveRestore className="size-3" />
                        Przyw.
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => archive(img.id)}
                        className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-semibold"
                        title="Przenies do archiwum"
                      >
                        <Archive className="size-3" />
                        Arch.
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => hardDelete(img.id)}
                      className="flex items-center justify-center gap-1 px-1.5 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold"
                      title="Trwale usun"
                    >
                      <Trash2 className="size-3" />
                      Del
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {zoomIndex !== null && readyVisible[zoomIndex] && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomIndex(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomIndex(null);
            }}
            className="absolute top-4 right-4 size-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-colors"
            aria-label="Zamknij"
          >
            <X className="size-5" />
          </button>
          {readyVisible.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prevZoom();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          {readyVisible.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                nextZoom();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 size-12 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center"
            >
              <ArrowRight className="size-5" />
            </button>
          )}
          <div
            className="relative max-w-[92vw] max-h-[88vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={readyVisible[zoomIndex].url}
              alt={readyVisible[zoomIndex].alt ?? ""}
              className="max-w-full max-h-[80vh] object-contain rounded ring-1 ring-white/10"
            />
            <div className="text-[11px] text-white/70 tabular-nums">
              {zoomIndex + 1} / {readyVisible.length}
              {readyVisible[zoomIndex].alt ? (
                <span className="ml-2 text-white/50">
                  · {readyVisible[zoomIndex].alt}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Single edit AI */}
      {editing && (
        <EditAiDialog
          productId={productId}
          targetImage={editing}
          galleryReady={activeImages.filter(
            (i) => i.status === "READY" && i.id !== editing.id,
          )}
          onClose={() => setEditing(null)}
          onSubmitted={() => {
            setEditing(null);
            router.refresh();
          }}
          pending={pending}
          startTransition={startTransition}
        />
      )}

      {/* Bulk edit AI */}
      {bulkOpen && (
        <BulkEditDialog
          productId={productId}
          selectedIds={Array.from(selectedIds)}
          galleryReady={activeImages.filter(
            (i) => i.status === "READY" && !selectedIds.has(i.id),
          )}
          onClose={() => setBulkOpen(false)}
          onSubmitted={() => {
            setBulkOpen(false);
            clearSelection();
            setSelectMode(false);
            router.refresh();
          }}
          pending={pending}
          startTransition={startTransition}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// Single Edit AI Dialog
// ───────────────────────────────────────────────────────────────────

function EditAiDialog({
  productId,
  targetImage,
  galleryReady,
  onClose,
  onSubmitted,
  pending,
  startTransition,
}: {
  productId: string;
  targetImage: ImageItem;
  galleryReady: ImageItem[];
  onClose: () => void;
  onSubmitted: () => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [prompt, setPrompt] = useState("");
  const [extraRefs, setExtraRefs] = useState<string[]>([]);

  function submit() {
    if (!prompt.trim()) {
      toast.error("Wpisz prompt opisujacy zmiane.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await editProductImageWithAiAction(
          targetImage.id,
          prompt.trim(),
          extraRefs,
        );
        if (r.ok) {
          toast.success("Generuje — pojawi sie w galerii za chwile");
          onSubmitted();
        } else {
          toast.error(r.error);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Blad");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-violet-600" />
            Edycja AI (Nano Banana Pro)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0">
          <div className="grid grid-cols-[1fr_2fr] gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Oryginal</Label>
              <div className="aspect-square rounded ring-1 ring-slate-200 overflow-hidden bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={targetImage.thumbnailWebpUrl ?? targetImage.url}
                  alt={targetImage.alt ?? ""}
                  className="size-full object-cover"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-prompt" className="text-sm">
                Co zmienic?
              </Label>
              <Textarea
                id="ai-prompt"
                placeholder="np. wymien tlo na biale studio · zmien kolor na granatowy · dodaj cien pod produktem"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                autoFocus
              />
              <p className="text-[10px] text-slate-500">
                Nano Banana Pro zachowa kompozycje, kat kamery i pozycje
                produktu oryginalu — zmieni tylko to o co poprosisz.
              </p>
            </div>
          </div>

          <RefsPicker
            label="Dodatkowe zdjecia referencyjne"
            galleryReady={galleryReady}
            extraRefs={extraRefs}
            setExtraRefs={setExtraRefs}
            disabled={pending}
          />

          <div className="rounded p-2 text-[10px] bg-violet-50 text-violet-700">
            <strong>Koszt:</strong> {formatUsd(0.134, 3)} (~{formatPln(0.134)}) /
            edycja (Nano Banana Pro 2K)
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !prompt.trim()}
            className="gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Generuje...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Generuj edycje
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────
// Bulk Edit AI Dialog
// ───────────────────────────────────────────────────────────────────

function BulkEditDialog({
  productId,
  selectedIds,
  galleryReady,
  onClose,
  onSubmitted,
  pending,
  startTransition,
}: {
  productId: string;
  selectedIds: string[];
  galleryReady: ImageItem[];
  onClose: () => void;
  onSubmitted: () => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [prompt, setPrompt] = useState("");
  const [extraRefs, setExtraRefs] = useState<string[]>([]);

  function submit() {
    if (!prompt.trim()) {
      toast.error("Wpisz prompt.");
      return;
    }
    startTransition(async () => {
      try {
        const r = await bulkEditProductImagesAiAction(
          productId,
          selectedIds,
          prompt.trim(),
          extraRefs,
        );
        if (r.ok) {
          toast.success(
            `Wystartowano ${r.queued} edycji — pojawia sie kolejno w galerii.`,
            { duration: 6000 },
          );
          onSubmitted();
        } else {
          toast.error(r.error);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Blad");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-violet-600" />
            Edycja AI ({selectedIds.length} zdjec) — Nano Banana Pro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0">
          <div className="rounded ring-1 ring-violet-200 bg-violet-50/50 p-3 text-xs text-violet-900">
            <strong>Bulk-edit:</strong> ten sam prompt + referencje zostana
            zastosowane do kazdego z {selectedIds.length} zaznaczonych zdjec.
            Kazde zachowa swoja kompozycje. Wynik = {selectedIds.length} nowych
            zdjec w galerii (oryginaly zostaja).
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-prompt" className="text-sm">
              Co zmienic w kazdym?
            </Label>
            <Textarea
              id="bulk-prompt"
              placeholder="np. zmien kolor produktu na granatowy · usun cien · ujednolic biale studio z miekkim swiatlem"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              autoFocus
            />
            <p className="text-[10px] text-slate-500">
              Koszt: ~{formatUsd(0.134, 3)} × {selectedIds.length} ={" "}
              <strong>
                ~{formatUsd(0.134 * selectedIds.length, 2)} (
                {formatPln(0.134 * selectedIds.length)})
              </strong>
            </p>
          </div>

          <RefsPicker
            label="Wspolne zdjecia referencyjne (dla wszystkich)"
            galleryReady={galleryReady}
            extraRefs={extraRefs}
            setExtraRefs={setExtraRefs}
            disabled={pending}
          />
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Anuluj
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !prompt.trim()}
            className="gap-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700"
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Startuje...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Generuj {selectedIds.length} edycji
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────────
// RefsPicker — wspolny komponent: galeria + upload + inny produkt
// ───────────────────────────────────────────────────────────────────

function RefsPicker({
  label,
  galleryReady,
  extraRefs,
  setExtraRefs,
  disabled,
}: {
  label: string;
  galleryReady: ImageItem[];
  extraRefs: string[];
  setExtraRefs: (
    updater: string[] | ((prev: string[]) => string[]),
  ) => void;
  disabled: boolean;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setRefs = (next: string[] | ((prev: string[]) => string[])) =>
    setExtraRefs(
      typeof next === "function"
        ? (prev: string[]) => next(prev).slice(0, 4)
        : next.slice(0, 4),
    );

  function toggle(url: string) {
    setRefs((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (extraRefs.length >= 4) {
      toast.error("Maksymalnie 4 referencje.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadAiRefAction(fd);
      if (r.ok) {
        setRefs((prev) => [...prev, r.url]);
        toast.success("Referencja wgrana");
      } else {
        toast.error(r.error);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-xs flex items-center gap-2">
          {label}
          <span className="text-[10px] font-normal text-slate-500">
            {extraRefs.length > 0
              ? `${extraRefs.length} / 4`
              : "opcjonalne — max 4"}
          </span>
        </Label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading || extraRefs.length >= 4}
            className="h-7 gap-1 text-[10px]"
          >
            {uploading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Upload className="size-3" />
            )}
            Z dysku
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setOtherOpen(true)}
            disabled={disabled || extraRefs.length >= 4}
            className="h-7 gap-1 text-[10px]"
          >
            <ImageIcon className="size-3" />
            Z innego produktu
          </Button>
        </div>
      </div>

      {/* Wybrane chips */}
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
                  setRefs((prev) => prev.filter((u) => u !== url))
                }
                className="absolute bottom-0 left-0 right-0 py-0.5 bg-slate-900/70 hover:bg-rose-600 text-white text-[9px] font-bold transition-colors"
              >
                Usun
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Galeria biezacego produktu */}
      {galleryReady.length > 0 && (
        <>
          <p className="text-[10px] text-slate-500 mt-1">
            Z galerii tego produktu:
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {galleryReady.map((img) => {
              const selected = extraRefs.includes(img.url);
              const isDisabled = !selected && extraRefs.length >= 4;
              return (
                <button
                  key={img.id}
                  type="button"
                  disabled={isDisabled || disabled}
                  onClick={() => toggle(img.url)}
                  className={cn(
                    "relative size-12 shrink-0 rounded ring-1 overflow-hidden transition-all",
                    selected
                      ? "ring-2 ring-violet-500"
                      : "ring-slate-200 hover:ring-violet-300",
                    isDisabled && "opacity-40 cursor-not-allowed",
                  )}
                  title={selected ? "Kliknij zeby usunac" : "Kliknij zeby dodac"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.thumbnailWebpUrl ?? img.url}
                    alt={img.alt ?? ""}
                    className="size-full object-cover"
                  />
                </button>
              );
            })}
          </div>
        </>
      )}

      <p className="text-[10px] text-slate-500">
        Pierwsza referencja zawsze = oryginal (kompozycja). Dodatkowe sluza jako
        wzorce koloru / materialu / detalu, do ktorych Nano Banana ma sie odniesc.
      </p>

      {otherOpen && (
        <OtherProductPicker
          extraRefs={extraRefs}
          onClose={() => setOtherOpen(false)}
          onPick={(url) => {
            if (!extraRefs.includes(url)) {
              setRefs((prev) => [...prev, url]);
            }
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// OtherProductPicker — dialog z lista produktow + ich galeriami
// ───────────────────────────────────────────────────────────────────

function OtherProductPicker({
  extraRefs,
  onClose,
  onPick,
}: {
  extraRefs: string[];
  onClose: () => void;
  onPick: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<
    Array<{
      id: string;
      name: string;
      productCode: string | null;
      color: string | null;
      images: Array<{
        id: string;
        url: string;
        thumbnailWebpUrl: string | null;
      }>;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await listProductsForRefPickerAction(query);
        if (!cancelled) setProducts(res.products);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base">
            Wybierz referencje z innego produktu
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              placeholder="Szukaj po nazwie, SKU, EAN..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-3 flex-1 min-h-0 space-y-4">
          {loading && (
            <div className="grid place-items-center py-8 text-slate-400 text-sm">
              <Loader2 className="size-4 animate-spin mb-2" />
              Laduje...
            </div>
          )}
          {!loading && products.length === 0 && (
            <div className="text-center py-8 text-sm text-slate-500">
              Brak produktow.
            </div>
          )}
          {!loading &&
            products
              .filter((p) => p.images.length > 0)
              .map((p) => (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
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
                      const selected = extraRefs.includes(img.url);
                      const isDisabled = !selected && extraRefs.length >= 4;
                      return (
                        <button
                          key={img.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            onPick(img.url);
                          }}
                          className={cn(
                            "relative size-16 shrink-0 rounded ring-1 overflow-hidden transition-all",
                            selected
                              ? "ring-2 ring-violet-500"
                              : "ring-slate-200 hover:ring-violet-400",
                            isDisabled && "opacity-40 cursor-not-allowed",
                          )}
                          title={selected ? "Juz dodane" : "Dodaj do referencji"}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.thumbnailWebpUrl ?? img.url}
                            alt=""
                            className="size-full object-cover"
                          />
                          {selected && (
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

        <DialogFooter className="px-5 py-3 border-t">
          <span className="text-xs text-slate-500 mr-auto">
            Zaznaczone: {extraRefs.length} / 4
          </span>
          <Button onClick={onClose}>Gotowe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
