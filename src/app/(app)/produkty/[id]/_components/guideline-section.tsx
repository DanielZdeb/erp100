"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  GripVertical,
  ImagePlus,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  addGuidelinePointAction,
  deleteGuidelineImageAction,
  deleteGuidelinePointAction,
  reorderGuidelinePointsAction,
  updateGuidelinePointAction,
  uploadGuidelineImageAction,
} from "@/server/guidelines";

export type GuidelineKindT = "PRODUCTION" | "IMPORT" | "USER_MANUAL";

export type GuidelineImage = {
  id: string;
  url: string;
  alt: string | null;
};

export type GuidelinePoint = {
  id: string;
  text: string;
  sortOrder: number;
  images: GuidelineImage[];
};

export function GuidelinePoints({
  productId,
  kind,
  initialPoints,
  sectionImages,
}: {
  productId: string;
  kind: GuidelineKindT;
  initialPoints: GuidelinePoint[];
  sectionImages: GuidelineImage[];
}) {
  const [points, setPoints] = useState(initialPoints);
  const [newText, setNewText] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setPoints(initialPoints);
  }, [initialPoints]);

  function add() {
    const trimmed = newText.trim();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        await addGuidelinePointAction(productId, kind, trimmed);
        setNewText("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  // ── Drag & drop reorder ───────────────────────────────────────────
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function handleDragOver(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setPoints((prev) => {
      const from = prev.findIndex((p) => p.id === draggedId);
      const to = prev.findIndex((p) => p.id === targetId);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function handleDragEnd() {
    if (!draggedId) return;
    const ids = points.map((p) => p.id);
    setDraggedId(null);
    startTransition(async () => {
      try {
        await reorderGuidelinePointsAction(productId, kind, ids);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Lista punktów */}
      <ol className="space-y-2">
        {points.map((p, idx) => (
          <PointRow
            key={p.id}
            productId={productId}
            kind={kind}
            point={p}
            index={idx + 1}
            isDragging={draggedId === p.id}
            onDragStart={() => setDraggedId(p.id)}
            onDragOver={() => handleDragOver(p.id)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </ol>

      {/* Nowy punkt */}
      <div className="rounded-md ring-1 ring-dashed ring-border p-3 space-y-2">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
          Dodaj punkt
        </div>
        <Textarea
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Treść kolejnego punktu…"
          rows={2}
          className="text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              add();
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            Ctrl/⌘ + Enter aby dodać
          </span>
          <Button
            type="button"
            size="sm"
            onClick={add}
            disabled={pending || !newText.trim()}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Dodaj punkt
          </Button>
        </div>
      </div>

      {/* Grafiki sekcji (nieprzypisane do żadnego punktu) */}
      <div className="space-y-2 pt-2 border-t">
        <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
          <ImagePlus className="size-3" />
          Grafiki ogólne dla całej sekcji ({sectionImages.length})
        </div>
        <ImageGallery
          productId={productId}
          kind={kind}
          pointId={null}
          images={sectionImages}
        />
      </div>
    </div>
  );
}

// ─── Wiersz pojedynczego punktu ──────────────────────────────────────

function PointRow({
  productId,
  kind,
  point,
  index,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  productId: string;
  kind: GuidelineKindT;
  point: GuidelinePoint;
  index: number;
  isDragging: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
}) {
  const [text, setText] = useState(point.text);
  const [pending, startTransition] = useTransition();
  const [dragHandleEnabled, setDragHandleEnabled] = useState(false);

  useEffect(() => {
    setText(point.text);
  }, [point.text]);

  function commit() {
    const trimmed = text.trim();
    if (!trimmed || trimmed === point.text.trim()) return;
    startTransition(async () => {
      try {
        await updateGuidelinePointAction(point.id, trimmed);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function remove() {
    if (!confirm("Usunąć ten punkt? Wszystkie grafiki też zostaną usunięte."))
      return;
    startTransition(async () => {
      try {
        await deleteGuidelinePointAction(point.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <li
      draggable={dragHandleEnabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", point.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!isDragging) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOver();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragHandleEnabled(false);
      }}
      onDragEnd={() => {
        onDragEnd();
        setDragHandleEnabled(false);
      }}
      className={cn(
        "rounded-md ring-1 ring-border p-2.5 bg-card transition-colors",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          onMouseDown={() => setDragHandleEnabled(true)}
          onMouseUp={() => {
            setTimeout(() => setDragHandleEnabled(false), 0);
          }}
          className="shrink-0 mt-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground"
          title="Przeciągnij, aby zmienić kolejność"
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground mt-1.5 min-w-[18px]">
          {index}.
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            rows={2}
            className="text-xs resize-y"
            disabled={pending}
          />
          <ImageGallery
            productId={productId}
            kind={kind}
            pointId={point.id}
            images={point.images}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={remove}
          disabled={pending}
          className="size-7 p-0 shrink-0"
          aria-label="Usuń punkt"
        >
          <X className="size-3.5 text-destructive" />
        </Button>
      </div>
    </li>
  );
}

// ─── Galeria grafik (per-point lub per-section) ──────────────────────

function ImageGallery({
  productId,
  kind,
  pointId,
  images,
}: {
  productId: string;
  kind: GuidelineKindT;
  pointId: string | null;
  images: GuidelineImage[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    startTransition(async () => {
      for (const file of fileArray) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("kind", kind);
          if (pointId) fd.append("pointId", pointId);
          await uploadGuidelineImageAction(productId, fd);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Błąd uploadu");
        }
      }
    });
  }

  function removeImg(imageId: string) {
    if (!confirm("Usunąć grafikę?")) return;
    startTransition(async () => {
      try {
        await deleteGuidelineImageAction(imageId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map((img) => (
        <div
          key={img.id}
          className="relative group size-16 rounded ring-1 ring-border overflow-hidden bg-muted"
        >
          <Image
            src={img.url}
            alt={img.alt ?? ""}
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
          <button
            type="button"
            onClick={() => removeImg(img.id)}
            disabled={pending}
            className="absolute top-0.5 right-0.5 size-4 rounded-full bg-background/80 backdrop-blur ring-1 ring-border opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            aria-label="Usuń grafikę"
          >
            <Trash2 className="size-2.5 text-destructive" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="size-16 rounded ring-1 ring-dashed ring-border hover:bg-muted/50 flex flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors"
        title="Dodaj grafikę"
      >
        <Upload className="size-4" />
        <span className="text-[9px]">
          {pending ? "…" : "Dodaj"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
    </div>
  );
}
