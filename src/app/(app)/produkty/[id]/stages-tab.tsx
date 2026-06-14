"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Check,
  Circle,
  Download,
  FileText,
  Image as ImageIcon,
  Package,
  PackageOpen,
  Pencil,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PRODUCT_STAGES,
  STAGE_HINT,
  STAGE_NUMBER,
  STAGE_TITLE,
  type ProductStageT,
} from "@/lib/product-stages";
import {
  setStageCompleteAction,
  updateStageNotesAction,
} from "@/server/product-stages";
import {
  addChecklistItemAction,
  toggleChecklistItemAction,
  updateChecklistItemAction,
  deleteChecklistItemAction,
} from "@/server/stage-checklist";
import {
  uploadProductImageAction,
  uploadProductFileAction,
  deleteProductImageAction,
  deleteProductFileAction,
} from "@/server/product-media";

type StageData = {
  stage: ProductStageT;
  completedAt: Date | null;
  notes: string | null;
};

type ChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  sortOrder: number;
};

type StageImage = {
  id: string;
  url: string;
  alt: string | null;
};

type StageFile = {
  id: string;
  url: string;
  filename: string;
  sizeBytes: number | null;
  contentType: string | null;
};

type ProductSnapshot = {
  productionGuidelines: string | null;
  importGuidelines: string | null;
  userManual: string | null;
  shopDescription: string | null;
  eanCode: string | null;
  color: string | null;
  shippingBoxWidthCm: number | null;
  shippingBoxHeightCm: number | null;
  shippingBoxDepthCm: number | null;
  imagesCount: number;
  filesCount: number;
};

const STAGE_ICON: Record<ProductStageT, React.ElementType> = {
  PRODUKCJA: Tag,
  IMPORT: PackageOpen,
  DOKUMENTACJA: FileText,
  WYSYLKA: ShoppingBag,
  OPIS: Package,
  GRAFIKI: ImageIcon,
};

export function StagesTab({
  productId,
  stages,
  product,
  checklist,
  stageImages,
  stageFiles,
}: {
  productId: string;
  stages: StageData[];
  product: ProductSnapshot;
  checklist: Record<ProductStageT, ChecklistItem[]>;
  stageImages: Record<ProductStageT, StageImage[]>;
  stageFiles: Record<ProductStageT, StageFile[]>;
}) {
  const byStage = new Map<ProductStageT, StageData>();
  for (const s of stages) byStage.set(s.stage, s);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Każdy etap zawiera checklistę punktów, grafiki referencyjne i pliki.
        Kliknij sekcję żeby rozwinąć detale.
      </p>

      <div className="space-y-3">
        {PRODUCT_STAGES.map((stage) => (
          <StageRow
            key={stage}
            stage={stage}
            productId={productId}
            data={byStage.get(stage) ?? null}
            product={product}
            checklist={checklist[stage] ?? []}
            images={stageImages[stage] ?? []}
            files={stageFiles[stage] ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function StageRow({
  stage,
  productId,
  data,
  product,
  checklist,
  images,
  files,
}: {
  stage: ProductStageT;
  productId: string;
  data: StageData | null;
  product: ProductSnapshot;
  checklist: ChecklistItem[];
  images: StageImage[];
  files: StageFile[];
}) {
  const done = data?.completedAt != null;
  const [open, setOpen] = useState(!done);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(data?.notes ?? "");
  const [pending, startTransition] = useTransition();
  const Icon = STAGE_ICON[stage];

  const doneCount = checklist.filter((c) => c.done).length;
  const totalCount = checklist.length;

  function toggleDone() {
    startTransition(async () => {
      try {
        await setStageCompleteAction(productId, stage, !done, notes);
        toast.success(
          !done ? `Zatwierdzono etap: ${STAGE_TITLE[stage]}` : "Cofnięto",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveNotes() {
    startTransition(async () => {
      try {
        await updateStageNotesAction(productId, stage, notes);
        setEditingNotes(false);
        toast.success("Zapisano notatkę");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card
      className={cn(
        "overflow-hidden p-0",
        done && "ring-1 ring-emerald-200 bg-emerald-50/30",
      )}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div
          className={cn(
            "size-10 rounded-full flex items-center justify-center text-sm font-semibold ring-2 shrink-0 transition-colors",
            done
              ? "bg-emerald-500 text-white ring-emerald-500"
              : "bg-muted text-foreground ring-border",
          )}
        >
          {done ? <Check className="size-5" /> : STAGE_NUMBER[stage]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="size-4 text-muted-foreground" />
            <span className="font-medium">{STAGE_TITLE[stage]}</span>
            {totalCount > 0 && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-md ring-1 ring-border",
                  doneCount === totalCount
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-background text-muted-foreground",
                )}
              >
                {doneCount}/{totalCount}
              </span>
            )}
            {(images.length > 0 || files.length > 0) && (
              <span className="text-xs text-muted-foreground">
                {images.length > 0 && `${images.length} 📷`}{" "}
                {files.length > 0 && `${files.length} 📄`}
              </span>
            )}
            {done && data?.completedAt && (
              <span className="text-xs text-emerald-700">
                ✓ {new Date(data.completedAt).toLocaleDateString("pl-PL")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
            {data?.notes?.trim() ||
              resolveStageHint(stage, product) ||
              STAGE_HINT[stage]}
          </p>
        </div>
        <div
          className={cn(
            "shrink-0 size-6 rounded-full ring-1 transition-colors",
            done
              ? "bg-emerald-500 ring-emerald-500"
              : "bg-background ring-border",
          )}
          aria-hidden
        >
          {done ? (
            <Check className="size-4 text-white m-1" />
          ) : (
            <Circle className="size-3 text-muted-foreground m-1.5" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t bg-background">
          <div className="pt-4">
            <StageContentHint
              stage={stage}
              productId={productId}
              product={product}
            />
          </div>

          <ChecklistSection
            productId={productId}
            stage={stage}
            items={checklist}
          />

          <StageImagesSection
            productId={productId}
            stage={stage}
            images={images}
          />

          <StageFilesSection
            productId={productId}
            stage={stage}
            files={files}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Notatka etapu
              </span>
              {!editingNotes && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingNotes(true)}
                  className="gap-1"
                >
                  <Pencil className="size-3" />
                  Edytuj
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNotes(data?.notes ?? "");
                      setEditingNotes(false);
                    }}
                  >
                    Anuluj
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveNotes}
                    disabled={pending}
                  >
                    Zapisz
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[1.5em]">
                {notes || "— brak notatki —"}
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t">
            <Button
              type="button"
              variant={done ? "outline" : "default"}
              onClick={toggleDone}
              disabled={pending}
              className="gap-2 mt-3"
            >
              {done ? (
                <>
                  <Circle className="size-4" />
                  Cofnij zatwierdzenie
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Zatwierdź etap
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Checklist ───────────────────────────────────────────────────────

function ChecklistSection({
  productId,
  stage,
  items,
}: {
  productId: string;
  stage: ProductStageT;
  items: ChecklistItem[];
}) {
  const [newItem, setNewItem] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    const title = newItem.trim();
    if (!title) return;
    startTransition(async () => {
      try {
        await addChecklistItemAction(productId, stage, title);
        setNewItem("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Checklista
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} />
        ))}
        {items.length === 0 && (
          <li className="text-xs text-muted-foreground italic">
            Brak punktów — dodaj poniżej.
          </li>
        )}
      </ul>
      <div className="flex gap-2">
        <Input
          placeholder="Nowy punkt (np. Metka z logo w prawym dolnym rogu)"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={pending || !newItem.trim()}
          className="gap-1 shrink-0"
        >
          <Plus className="size-3" />
          Dodaj
        </Button>
      </div>
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);

  function toggle() {
    startTransition(async () => {
      try {
        await toggleChecklistItemAction(item.id, !item.done);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveTitle() {
    if (!title.trim() || title === item.title) {
      setEditing(false);
      setTitle(item.title);
      return;
    }
    startTransition(async () => {
      try {
        await updateChecklistItemAction(item.id, title);
        setEditing(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function remove() {
    if (!confirm("Usunąć ten punkt?")) return;
    startTransition(async () => {
      try {
        await deleteChecklistItemAction(item.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <li className="flex items-start gap-2 group">
      <Checkbox
        checked={item.done}
        onCheckedChange={toggle}
        disabled={pending}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") {
                setEditing(false);
                setTitle(item.title);
              }
            }}
            autoFocus
            className="h-7 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "text-sm text-left w-full hover:text-foreground transition-colors",
              item.done && "line-through text-muted-foreground",
            )}
          >
            {item.title}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
        aria-label="Usuń"
      >
        <Trash2 className="size-3.5 text-destructive" />
      </button>
    </li>
  );
}

// ─── Grafiki etapowe ─────────────────────────────────────────────────

function StageImagesSection({
  productId,
  stage,
  images,
}: {
  productId: string;
  stage: ProductStageT;
  images: StageImage[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("stage", stage);
        try {
          await uploadProductImageAction(productId, fd);
        } catch (e) {
          toast.error(
            `${file.name}: ${e instanceof Error ? e.message : "błąd"}`,
          );
        }
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Grafiki referencyjne {images.length > 0 && `(${images.length})`}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="gap-1"
        >
          <Upload className="size-3" />
          {pending ? "Wgrywam…" : "Wgraj grafiki"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {images.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {images.map((img) => (
            <StageImageCard key={img.id} image={img} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Brak grafik — np. wzór metki, schemat składania.
        </p>
      )}
    </div>
  );
}

function StageImageCard({ image }: { image: StageImage }) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm("Usunąć tę grafikę?")) return;
    startTransition(async () => {
      try {
        await deleteProductImageAction(image.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-border bg-muted">
      <Image
        src={image.url}
        alt={image.alt ?? ""}
        fill
        sizes="(max-width:640px) 33vw, 16vw"
        className="object-cover"
        unoptimized
      />
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        aria-label="Usuń"
      >
        <Trash2 className="size-5 text-white" />
      </button>
    </div>
  );
}

// ─── Pliki etapowe ───────────────────────────────────────────────────

function StageFilesSection({
  productId,
  stage,
  files,
}: {
  productId: string;
  stage: ProductStageT;
  files: StageFile[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onPick(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    startTransition(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "GUIDELINES");
      fd.append("stage", stage);
      try {
        await uploadProductFileAction(productId, fd);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Pliki {files.length > 0 && `(${files.length})`}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="gap-1"
        >
          <Upload className="size-3" />
          {pending ? "Wgrywam…" : "Wgraj plik"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file) => (
            <StageFileRow key={file.id} file={file} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          Brak plików — np. PDF z wytycznymi, certyfikaty, instrukcje.
        </p>
      )}
    </div>
  );
}

function StageFileRow({ file }: { file: StageFile }) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`Usunąć ${file.filename}?`)) return;
    startTransition(async () => {
      try {
        await deleteProductFileAction(file.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <li className="flex items-center gap-2 p-2 rounded-md ring-1 ring-border bg-muted/20 group">
      <FileText className="size-4 text-muted-foreground shrink-0" />
      <a
        href={file.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm hover:underline truncate flex-1"
      >
        {file.filename}
      </a>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatSize(file.sizeBytes)}
      </span>
      <a
        href={file.url}
        download={file.filename}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        aria-label="Pobierz"
      >
        <Download className="size-3.5" />
      </a>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
        aria-label="Usuń"
      >
        <Trash2 className="size-3.5 text-destructive" />
      </button>
    </li>
  );
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Hint pól ────────────────────────────────────────────────────────

function FieldHint({
  filled,
  label,
}: {
  filled: boolean;
  label: string;
}) {
  return (
    <li
      className={cn(
        "text-xs",
        filled ? "text-emerald-700" : "text-amber-700",
      )}
    >
      {filled ? "✓" : "○"} {label}
    </li>
  );
}

function StageContentHint({
  stage,
  productId,
  product,
}: {
  stage: ProductStageT;
  productId: string;
  product: ProductSnapshot;
}) {
  switch (stage) {
    case "PRODUKCJA":
      return (
        <div className="space-y-2">
          <ul className="space-y-1">
            <FieldHint
              filled={!!product.productionGuidelines}
              label={`Wytyczne produkcyjne — opis (${product.productionGuidelines ? "uzupełnione" : "puste"})`}
            />
          </ul>
          <Link
            href={`/produkty/${productId}/edytuj`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-2")}
          >
            <Pencil className="size-3" />
            Edytuj opis wytycznych
          </Link>
        </div>
      );
    case "IMPORT":
      return (
        <div className="space-y-2">
          <ul className="space-y-1">
            <FieldHint
              filled={!!product.importGuidelines}
              label="Wytyczne importowe (tekst)"
            />
          </ul>
          <Link
            href={`/produkty/${productId}/edytuj`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-2")}
          >
            <Pencil className="size-3" />
            Edytuj wytyczne importowe
          </Link>
        </div>
      );
    case "DOKUMENTACJA":
      return (
        <div className="space-y-2">
          <ul className="space-y-1">
            <FieldHint
              filled={!!product.eanCode}
              label="GTIN / EAN (potrzebny do produktu głównego)"
            />
            <FieldHint
              filled={!!product.userManual}
              label={`Instrukcja obsługi (${product.userManual ? "uzupełniona" : "pusta"})`}
            />
            <FieldHint
              filled={product.filesCount > 0}
              label={`Pliki dokumentacji ogólnej (${product.filesCount})`}
            />
          </ul>
          <Link
            href={`/produkty/${productId}/edytuj`}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-2")}
          >
            <Pencil className="size-3" />
            Edytuj instrukcję obsługi
          </Link>
        </div>
      );
    case "WYSYLKA":
      return (
        <ul className="space-y-1">
          <FieldHint
            filled={
              !!(
                product.shippingBoxWidthCm &&
                product.shippingBoxHeightCm &&
                product.shippingBoxDepthCm
              )
            }
            label="Wymiary pudła wysyłkowego"
          />
        </ul>
      );
    case "OPIS":
      return (
        <ul className="space-y-1">
          <FieldHint
            filled={!!product.shopDescription}
            label="Opis do sklepu"
          />
          <FieldHint filled={!!product.color} label="Kolor" />
        </ul>
      );
    case "GRAFIKI":
      return (
        <ul className="space-y-1">
          <FieldHint
            filled={product.imagesCount > 0}
            label={`Grafiki produktowe (${product.imagesCount})`}
          />
        </ul>
      );
  }
}

/**
 * Zwraca skrót etapu z danych produktu (gdy uzupełnione), inaczej null —
 * wtedy fallback do statycznego STAGE_HINT.
 */
function resolveStageHint(
  stage: ProductStageT,
  product: ProductSnapshot,
): string | null {
  if (stage === "PRODUKCJA" && product.productionGuidelines) {
    return product.productionGuidelines;
  }
  if (stage === "IMPORT" && product.importGuidelines) {
    return product.importGuidelines;
  }
  if (stage === "DOKUMENTACJA" && product.userManual) {
    return product.userManual;
  }
  if (stage === "OPIS" && product.shopDescription) {
    return product.shopDescription;
  }
  return null;
}
