"use client";

import Link from "next/link";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Package,
  PackageOpen,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  assignBoxToProductAction,
  assignFactoryBoxInlineAction,
  removeBoxFromProductAction,
  removeProductBoxDesignAction,
  removeProductBoxImageAction,
  updateProductBoxAction,
  uploadProductBoxDesignAction,
  uploadProductBoxImageAction,
} from "@/server/shipping-boxes";

import { BoxVisual } from "./_components/box-visual";

export type ProductBoxRow = {
  id: string; // ProductShippingBox.id
  purpose: "SHIPPING" | "FACTORY";
  unitsPerBox: number;
  isPrimary: boolean;
  notes: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  designUrl: string | null;
  designName: string | null;
  box: {
    id: string;
    name: string;
    internalCode: string | null;
    packagingType: "BOX" | "POLY_BAG";
    widthCm: number;
    heightCm: number;
    depthCm: number;
    weightKg: number | null;
    cardboardLayers: number | null;
  };
};

export type BoxOption = {
  id: string;
  name: string;
  internalCode: string | null;
  packagingType: "BOX" | "POLY_BAG";
  widthCm: number;
  heightCm: number;
  depthCm: number;
  cardboardLayers: number | null;
  /** Skąd pochodzi (POLAND = PL, CHINA_STANDARD = Chiny) — kontekst kategoryzacji. */
  origin?: "POLAND" | "CHINA_STANDARD";
  /** True = pudełko zbiorcze (master), false = pojedyncze (wysyłkowe/importowe). */
  isCollective?: boolean;
  /** Cena zakupu PLN — używana do liczenia kosztu opakowania. Chińskie = 0. */
  purchasePricePln?: number | null;
  /** Wolny tekst opisujący przeznaczenie pudełka. */
  purposeText?: string | null;
  /**
   * Tylko dla kartonów zbiorczych: ile sztuk pudełka inner (CN wysyłkowego)
   * mieści się w tym zbiorczym kartonie. Auto-fill przy wyborze kartonu zbiorczego
   * w wizardzie / na karcie import produktu.
   */
  innerBoxesPerMaster?: number | null;
};

export function BoxesTab({
  productId,
  productBoxes,
  availableBoxes,
  productName,
  productWeightKg,
  /** Pokaż tylko jeden rodzaj pinów + jeden przycisk "Przypnij". */
  purposeFilter,
}: {
  productId: string;
  productBoxes: ProductBoxRow[];
  availableBoxes: BoxOption[];
  productName?: string;
  productWeightKg?: number | null;
  purposeFilter?: "SHIPPING" | "FACTORY";
}) {
  const [addOpen, setAddOpen] = useState<"SHIPPING" | "FACTORY" | null>(null);
  const filteredBoxes = purposeFilter
    ? productBoxes.filter((p) => p.purpose === purposeFilter)
    : productBoxes;
  const usedIds = new Set(filteredBoxes.map((p) => p.box.id));
  const candidates = availableBoxes.filter((b) => !usedIds.has(b.id));

  const shippingBoxes = filteredBoxes.filter((p) => p.purpose === "SHIPPING");
  const factoryBoxes = filteredBoxes.filter((p) => p.purpose === "FACTORY");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-2xl">
          {purposeFilter === "SHIPPING"
            ? "Pudełka wysyłkowe (PL) — używane do wysyłki do klienta. Klik "
            : purposeFilter === "FACTORY"
              ? "Pudełka importowe (z Chin) — produkt przychodzi już w nich."
              : "Wszystkie pudełka — wysyłkowe (do klienta) i z Chin (gotowe pudełko z fabryki) — pokazane w jednym miejscu. Klik "}
          {purposeFilter !== "FACTORY" && (
            <>
              <Star className="inline size-3 text-amber-500" /> ustawia domyślne
              wysyłkowe.
            </>
          )}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/produkty/pudelka"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            Katalog pudełek
          </Link>
          {purposeFilter !== "FACTORY" && (
            <Button
              onClick={() => setAddOpen("SHIPPING")}
              disabled={candidates.length === 0}
              size="sm"
              className="gap-2"
            >
              <Plus className="size-4" />
              Przypnij wysyłkowe
            </Button>
          )}
          {purposeFilter !== "SHIPPING" && (
            <Button
              onClick={() => setAddOpen("FACTORY")}
              size="sm"
              variant="secondary"
              className="gap-2"
            >
              <Plus className="size-4" />
              Przypnij z Chin
            </Button>
          )}
        </div>
      </div>

      {filteredBoxes.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {availableBoxes.length === 0 ? (
            <>
              W katalogu nie ma jeszcze żadnych pudełek. Najpierw dodaj je w{" "}
              <Link
                href="/produkty/pudelka"
                className="underline text-primary"
              >
                /produkty/pudelka
              </Link>
              .
            </>
          ) : purposeFilter === "SHIPPING" ? (
            "Brak przypiętego pudełka wysyłkowego. Przypnij pierwsze."
          ) : purposeFilter === "FACTORY" ? (
            "Brak przypiętego pudełka z Chin. Przypnij — pomożemy policzyć CBM."
          ) : (
            "Brak przypiętych pudełek. Przypnij pierwsze."
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {shippingBoxes.map((pb) => (
            <ProductBoxCard
              key={pb.id}
              productBox={pb}
              productName={productName}
              productWeightKg={productWeightKg}
            />
          ))}
          {factoryBoxes.map((pb) => (
            <ProductBoxCard
              key={pb.id}
              productBox={pb}
              productName={productName}
              productWeightKg={productWeightKg}
            />
          ))}
        </div>
      )}

      {addOpen === "SHIPPING" && (
        <AssignShippingBoxDialog
          onClose={() => setAddOpen(null)}
          productId={productId}
          candidates={candidates}
        />
      )}
      {addOpen === "FACTORY" && (
        <AssignFactoryBoxDialog
          onClose={() => setAddOpen(null)}
          productId={productId}
        />
      )}
    </div>
  );
}

// ─── Karta pojedynczego pudełka — "sztywny" widok ────────────────────

function ProductBoxCard({
  productBox,
  productName,
  productWeightKg,
}: {
  productBox: ProductBoxRow;
  productName?: string;
  productWeightKg?: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const isFactory = productBox.purpose === "FACTORY";
  const isPolyBag = productBox.box.packagingType === "POLY_BAG";

  const cbm =
    (productBox.box.widthCm *
      productBox.box.heightCm *
      productBox.box.depthCm) /
    1_000_000;

  function togglePrimary() {
    if (isFactory) return; // fabryczne nie mają primary
    startTransition(async () => {
      try {
        await updateProductBoxAction(productBox.id, {
          isPrimary: !productBox.isPrimary,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function remove() {
    if (!confirm(`Odepnij pudełko "${productBox.box.name}"?`)) return;
    startTransition(async () => {
      try {
        await removeBoxFromProductAction(productBox.id);
        toast.success("Odpięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  // Kolor akcentu zależnie od purpose
  const accent = isFactory
    ? {
        border: "border-l-rose-400",
        headerBg: "bg-rose-50/40",
        iconBg: "bg-rose-100 text-rose-700",
        icon: PackageOpen,
        contentBg: "bg-emerald-50/20",
      }
    : {
        border: "border-l-indigo-400",
        headerBg: "bg-indigo-50/40",
        iconBg: "bg-indigo-100 text-indigo-700",
        icon: Package,
        contentBg: "bg-emerald-50/20",
      };
  const Icon = accent.icon;

  const hasAttachments = !!(productBox.imageUrl || productBox.designUrl);
  const [attachmentsOpen, setAttachmentsOpen] = useState(hasAttachments);

  return (
    <Card className={`overflow-hidden border-l-4 ${accent.border}`}>
      {/* Header — jedna linia, kompakt */}
      <div className={`px-3 py-1.5 border-b ${accent.headerBg} flex items-center gap-2 flex-wrap`}>
        <div className={`size-6 rounded-md ${accent.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className="size-3" />
        </div>
        <div className="text-xs font-semibold truncate min-w-0">
          {productBox.box.name}
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center px-1.5 py-0 rounded text-[9px] uppercase tracking-wide font-medium",
            isFactory
              ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200"
              : "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200",
          )}
        >
          {isFactory ? "Z Chin" : "Wysyłkowe"}
        </span>
        {productBox.isPrimary && !isFactory && (
          <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0 rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-200">
            <Star className="size-2.5 fill-amber-500 text-amber-500" />
            Domyślne
          </span>
        )}
        <div className="flex-1" />
        {!isFactory && (
          <button
            type="button"
            onClick={togglePrimary}
            disabled={pending}
            title={productBox.isPrimary ? "Odznacz jako domyślne" : "Ustaw jako domyślne"}
            className="shrink-0 p-1 hover:bg-muted rounded"
            aria-label="Toggle primary"
          >
            <Star
              className={cn(
                "size-3.5",
                productBox.isPrimary
                  ? "fill-amber-400 text-amber-500"
                  : "text-muted-foreground",
              )}
            />
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          title="Odepnij"
          className="shrink-0 p-1 hover:bg-destructive/10 rounded"
          aria-label="Odepnij"
        >
          <Trash2 className="size-3.5 text-destructive" />
        </button>
      </div>

      {/* Pasek info o produkcie w paczce */}
      {productName && (
        <div className="px-3 py-1.5 bg-slate-50/60 border-b text-[11px] flex flex-wrap items-center gap-x-4 gap-y-0.5">
          <span className="text-slate-600">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 mr-1">Produkt:</span>
            <span className="font-medium text-slate-900">{productName}</span>
          </span>
          <span className="text-slate-600 tabular-nums">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 mr-1">Ilość:</span>
            <span className="font-bold text-slate-900">{productBox.unitsPerBox} szt</span>
          </span>
          <span className="text-slate-600 tabular-nums">
            <span className="text-[9px] uppercase tracking-wide text-slate-500 mr-1">Łączna waga:</span>
            <span className="font-bold text-slate-900">
              {(
                (productBox.box.weightKg ?? 0) +
                productBox.unitsPerBox * (productWeightKg ?? 0)
              ).toFixed(2)} kg
            </span>
            {(productBox.box.weightKg != null || productWeightKg != null) && (
              <span className="text-[9px] text-slate-500 ml-1">
                ({(productBox.box.weightKg ?? 0).toFixed(2)} kg box + {productBox.unitsPerBox}×{(productWeightKg ?? 0).toFixed(2)} kg produkt)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Content — wizualka + stats inline */}
      <div className="px-3 py-2.5 flex items-center gap-3">
        <div className="shrink-0 size-[120px] rounded-md ring-1 ring-border bg-card p-1">
          <BoxVisual
            widthCm={productBox.box.widthCm}
            heightCm={productBox.box.heightCm}
            depthCm={isPolyBag ? null : productBox.box.depthCm}
            packagingType={productBox.box.packagingType}
            className="w-full h-full"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Dim
              label="Typ"
              value={
                isPolyBag
                  ? "Foliopak"
                  : productBox.box.cardboardLayers
                    ? `Pudełko ${productBox.box.cardboardLayers}W`
                    : "Pudełko"
              }
            />
            <Dim
              label="Wymiary"
              value={`${productBox.box.widthCm}×${productBox.box.heightCm}×${productBox.box.depthCm} cm`}
            />
            {productBox.box.weightKg != null && (
              <Dim label="Waga" value={`${productBox.box.weightKg.toFixed(2)} kg`} />
            )}
            <Dim label="CBM" value={`${cbm.toFixed(4)} m³`} />
            <Dim label="Szt./box" value={String(productBox.unitsPerBox)} />
          </div>
          {productBox.notes && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 whitespace-pre-wrap">
              {productBox.notes}
            </p>
          )}
          <button
            type="button"
            onClick={() => setAttachmentsOpen((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            {attachmentsOpen ? "▾" : "▸"} Załączniki
            {hasAttachments && (
              <span className="text-emerald-600 font-medium">
                ({(productBox.imageUrl ? 1 : 0) + (productBox.designUrl ? 1 : 0)})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Załączniki — collapsible */}
      {attachmentsOpen && (
        <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3 border-t pt-2.5">
          <PinImageBlock
            linkId={productBox.id}
            url={productBox.imageUrl}
            alt={productBox.imageAlt}
          />
          <PinDesignBlock
            linkId={productBox.id}
            url={productBox.designUrl}
            name={productBox.designName}
          />
        </div>
      )}
    </Card>
  );
}

function Dim({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className="text-[9px] uppercase text-muted-foreground tracking-wide">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

// ─── Dialog "Przypnij wysyłkowe" (wybór z katalogu) ───────────────────

function AssignShippingBoxDialog({
  onClose,
  productId,
  candidates,
}: {
  onClose: () => void;
  productId: string;
  candidates: BoxOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [boxId, setBoxId] = useState("");
  const [unitsPerBox, setUnitsPerBox] = useState("1");
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState("");

  function submit() {
    if (!boxId) {
      toast.error("Wybierz pudełko");
      return;
    }
    const n = Number(unitsPerBox);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Podaj liczbę sztuk (min. 1)");
      return;
    }
    startTransition(async () => {
      try {
        await assignBoxToProductAction(productId, {
          boxId,
          purpose: "SHIPPING",
          unitsPerBox: n,
          isPrimary,
          notes,
        });
        toast.success("Przypięto pudełko");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Przypnij pudełko wysyłkowe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Pudełko z katalogu</Label>
            <Select value={boxId} onValueChange={(v) => setBoxId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz z katalogu…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.packagingType === "POLY_BAG" ? "[Foliopak] " : "[Pudełko] "}
                    {b.name}
                    {b.internalCode ? ` (${b.internalCode})` : ""} ·{" "}
                    {`${b.widthCm}×${b.heightCm}×${b.depthCm} cm`}
                    {b.cardboardLayers ? ` · ${b.cardboardLayers}W` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Nie ma odpowiedniego pudełka?{" "}
              <Link
                href="/produkty/pudelka"
                className="underline text-primary"
              >
                Dodaj nowe do katalogu
              </Link>
              .
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="upb">Ile sztuk produktu się zmieści</Label>
            <Input
              id="upb"
              type="number"
              min="1"
              step="1"
              value={unitsPerBox}
              onChange={(e) => setUnitsPerBox(e.target.value)}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={isPrimary}
              onCheckedChange={(c) => setIsPrimary(!!c)}
            />
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 text-amber-500" />
              Ustaw jako domyślne pudełko wysyłkowe dla tego produktu
            </span>
          </label>
          <div className="space-y-2">
            <Label htmlFor="notes">Notatki (opcjonalnie)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Np. uwagi do pakowania kurierskiego…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Zapisuję…" : "Przypnij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Dialog "Przypnij z Chin" (inline wymiary) ────────────────────────

// ─── Załączniki per-pin: zdjęcie ────────────────────────────────────

function PinImageBlock({
  linkId,
  url,
  alt,
}: {
  linkId: string;
  url: string | null;
  alt: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        await uploadProductBoxImageAction(linkId, fd);
        toast.success("Wgrano zdjęcie");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd uploadu");
      }
    });
  }
  function onRemove() {
    if (!confirm("Usunąć zdjęcie pudełka?")) return;
    startTransition(async () => {
      try {
        await removeProductBoxImageAction(linkId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <ImageIcon className="size-3" />
        Zdjęcie pudełka
      </div>
      {url ? (
        <div className="relative group">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block aspect-[4/3] rounded-md overflow-hidden bg-muted ring-1 ring-border max-w-xs"
          >
            <Image
              src={url}
              alt={alt ?? ""}
              fill
              sizes="280px"
              className="object-contain"
              unoptimized
            />
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRemove}
            disabled={pending}
            className="absolute top-1.5 right-1.5 size-7 p-0 bg-background/80 backdrop-blur"
            aria-label="Usuń zdjęcie"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="w-full h-24 max-w-xs rounded-md bg-muted hover:bg-muted/70 ring-1 ring-dashed ring-border flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors"
        >
          <Upload className="size-5" />
          {pending ? "Wgrywanie…" : "Dodaj zdjęcie pudełka"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
    </div>
  );
}

// ─── Załączniki per-pin: design / logo nadruku ──────────────────────

function PinDesignBlock({
  linkId,
  url,
  name,
}: {
  linkId: string;
  url: string | null;
  name: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        await uploadProductBoxDesignAction(linkId, fd);
        toast.success("Wgrano plik designu");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd uploadu");
      }
    });
  }
  function onRemove() {
    if (!confirm("Usunąć plik designu?")) return;
    startTransition(async () => {
      try {
        await removeProductBoxDesignAction(linkId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <FileText className="size-3" />
        Design / logo nadruku
      </div>
      {url ? (
        <div className="rounded-md ring-1 ring-border p-2.5 bg-card max-w-xs space-y-2">
          <div className="flex items-start gap-2">
            <FileText className="size-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">
                {name ?? "Plik designu"}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs border rounded-md px-2.5 py-1.5 hover:bg-muted"
            >
              <Download className="size-3.5" />
              Pobierz
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemove}
              disabled={pending}
              className="size-8 p-0"
              aria-label="Usuń plik"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="w-full h-24 max-w-xs rounded-md bg-muted hover:bg-muted/70 ring-1 ring-dashed ring-border flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors"
        >
          <Upload className="size-5" />
          {pending ? "Wgrywanie…" : "Dodaj plik designu"}
          <span className="text-[10px]">np. PDF, AI, PSD, PNG</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => onPick(e.target.files)}
      />
    </div>
  );
}

function AssignFactoryBoxDialog({
  onClose,
  productId,
}: {
  onClose: () => void;
  productId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [packagingType, setPackagingType] = useState<"BOX" | "POLY_BAG">("BOX");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [depthCm, setDepthCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [cardboardLayers, setCardboardLayers] = useState("");
  const [unitsPerBox, setUnitsPerBox] = useState("1");
  const [notes, setNotes] = useState("");

  function submit() {
    const w = Number(widthCm.replace(",", "."));
    const h = Number(heightCm.replace(",", "."));
    const d = Number(depthCm.replace(",", "."));
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      toast.error("Podaj szerokość i wysokość (> 0)");
      return;
    }
    if (!Number.isFinite(d) || d <= 0) {
      toast.error(
        packagingType === "POLY_BAG"
          ? "Podaj grubość (> 0) — kurier liczy gabaryt 3D"
          : "Podaj głębokość (> 0)",
      );
      return;
    }
    const upb = Number(unitsPerBox);
    if (!Number.isFinite(upb) || upb < 1) {
      toast.error("Podaj liczbę sztuk (min. 1)");
      return;
    }

    startTransition(async () => {
      try {
        await assignFactoryBoxInlineAction(productId, {
          packagingType,
          widthCm: widthCm.replace(",", "."),
          heightCm: heightCm.replace(",", "."),
          depthCm: depthCm.replace(",", "."),
          weightKg: weightKg ? weightKg.replace(",", ".") : null,
          cardboardLayers:
            packagingType === "POLY_BAG" || !cardboardLayers
              ? null
              : cardboardLayers,
          unitsPerBox: upb,
          notes,
        });
        toast.success("Przypięto pudełko z Chin");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Przypnij pudełko z Chin</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Wpisz wymiary pudełka detalicznego (z produktem w środku).
            Zostanie utworzony jednorazowy wpis w katalogu z prefiksem{" "}
            <code>[FAB]</code>.
          </p>

          <div className="space-y-2">
            <Label>Typ opakowania</Label>
            <div className="inline-flex rounded-lg ring-1 ring-border bg-card p-0.5 gap-0.5">
              {(
                [
                  { id: "BOX" as const, label: "Pudełko" },
                  { id: "POLY_BAG" as const, label: "Foliopak" },
                ]
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPackagingType(t.id)}
                  className={
                    packagingType === t.id
                      ? "px-3 py-1 rounded-md text-xs font-medium bg-rose-600 text-white"
                      : "px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              {packagingType === "POLY_BAG"
                ? "Foliopak — wymiary płaskie: szerokość × wysokość."
                : "Pudełko — trzy wymiary: szer × wys × głęb."}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="fb-w" className="text-xs">
                Szerokość (cm)
              </Label>
              <Input
                id="fb-w"
                type="number"
                step="0.1"
                min="0"
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
                autoFocus
                inputMode="decimal"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fb-h" className="text-xs">
                Wysokość (cm)
              </Label>
              <Input
                id="fb-h"
                type="number"
                step="0.1"
                min="0"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                inputMode="decimal"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fb-d" className="text-xs">
                {packagingType === "POLY_BAG" ? "Grubość (cm)" : "Głębokość (cm)"}
              </Label>
              <Input
                id="fb-d"
                type="number"
                step="0.1"
                min="0"
                value={depthCm}
                onChange={(e) => setDepthCm(e.target.value)}
                inputMode="decimal"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="fb-kg" className="text-xs">
                Waga (kg, opcjonalnie)
              </Label>
              <Input
                id="fb-kg"
                type="number"
                step="0.01"
                min="0"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fb-upb" className="text-xs">
                Sztuk w pudełku
              </Label>
              <Input
                id="fb-upb"
                type="number"
                min="1"
                step="1"
                value={unitsPerBox}
                onChange={(e) => setUnitsPerBox(e.target.value)}
              />
            </div>
          </div>

          {packagingType === "BOX" && (
            <div className="space-y-1">
              <Label className="text-xs">
                Liczba warstw kartonu (opcjonalnie)
              </Label>
              <Select
                value={cardboardLayers}
                onValueChange={(v) =>
                  setCardboardLayers(v === "none" ? "" : v ?? "")
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="— wybierz —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— brak / nieznane —</SelectItem>
                  <SelectItem value="3">
                    3-warstwowy (single wall)
                  </SelectItem>
                  <SelectItem value="5">
                    5-warstwowy (double wall) — standard
                  </SelectItem>
                  <SelectItem value="7">
                    7-warstwowy (triple wall) — heavy duty
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="fb-notes" className="text-xs">
              Notatki / instrukcja dla fabryki (opcjonalnie)
            </Label>
            <Textarea
              id="fb-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Np. specyfikacja druku, materiał, wycięcia okienka…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Zapisuję…" : "Przypnij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
