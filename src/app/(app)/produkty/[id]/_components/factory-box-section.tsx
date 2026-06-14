"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  Check,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  PackageOpen,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  removeFactoryBoxDesignAction,
  removeFactoryBoxImageAction,
  setFactoryBoxAction,
  uploadFactoryBoxDesignAction,
  uploadFactoryBoxImageAction,
} from "@/server/factory-box";

import { EditableTextarea } from "./editable-textarea";

export function FactoryBoxSection({
  productId,
  initial,
}: {
  productId: string;
  initial: {
    included: boolean;
    accepted: boolean;
    packagingType: "BOX" | "POLY_BAG";
    notes: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    designUrl: string | null;
    designName: string | null;
    widthCm: number | null;
    heightCm: number | null;
    depthCm: number | null;
    weightKg: number | null;
  };
}) {
  const [included, setIncluded] = useState(initial.included);
  const [pending, startTransition] = useTransition();

  function toggleIncluded(v: boolean) {
    setIncluded(v);
    startTransition(async () => {
      try {
        await setFactoryBoxAction(productId, { included: v });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
        setIncluded(!v);
      }
    });
  }

  function changeType(t: "BOX" | "POLY_BAG") {
    startTransition(async () => {
      try {
        await setFactoryBoxAction(productId, { packagingType: t });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function accept() {
    startTransition(async () => {
      try {
        await setFactoryBoxAction(productId, { accepted: true });
        toast.success("Zaakceptowano pudełko z chin");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function unlock() {
    startTransition(async () => {
      try {
        await setFactoryBoxAction(productId, { accepted: false });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card className="overflow-hidden border-l-4 border-l-rose-400">
      <div className="px-3 py-2 border-b bg-rose-50/40 flex items-center gap-2">
        <div className="size-7 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center">
          <PackageOpen className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Pudełko z fabryki</div>
          <div className="text-[11px] text-muted-foreground">
            Gotowe pudełko detaliczne z Chin — produkt nie wymaga dodatkowego
            pakowania przed sprzedażą.
          </div>
        </div>
        {initial.accepted && included && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200">
            <Lock className="size-2.5" />
            Zaakceptowane
          </span>
        )}
        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <Checkbox
            checked={included}
            onCheckedChange={(c) => toggleIncluded(!!c)}
            disabled={pending}
          />
          <span className="font-medium">Tak, pakowane w Chinach</span>
        </label>
      </div>

      {included && !initial.accepted && (
        <div className="p-4 space-y-5">
          {/* Typ opakowania */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
              Typ opakowania
            </div>
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
                  onClick={() => changeType(t.id)}
                  disabled={pending}
                  className={
                    initial.packagingType === t.id
                      ? "px-3 py-1 rounded-md text-xs font-medium bg-rose-600 text-white"
                      : "px-3 py-1 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              {initial.packagingType === "POLY_BAG"
                ? "Foliopak ma wymiary płaskie — szerokość × wysokość (bez głębokości)."
                : "Pudełko ma trzy wymiary — szerokość × wysokość × głębokość."}
            </p>
          </div>

          {/* Wymiary */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
              Wymiary {initial.packagingType === "POLY_BAG" ? "foliopaka" : "pudełka detalicznego"}{" "}
              (z produktem w środku)
            </div>
            <DimensionInputs
              productId={productId}
              packagingType={initial.packagingType}
              widthCm={initial.widthCm}
              heightCm={initial.heightCm}
              depthCm={initial.depthCm}
              weightKg={initial.weightKg}
            />
          </div>

          {/* Grafiki + design */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
            <FactoryBoxImageBlock
              productId={productId}
              url={initial.imageUrl}
              alt={initial.imageAlt}
            />
            <FactoryBoxDesignBlock
              productId={productId}
              url={initial.designUrl}
              name={initial.designName}
            />
          </div>

          {/* Notatki */}
          <div className="space-y-1 pt-2 border-t">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
              Notatki / instrukcja dla fabryki
            </div>
            <EditableTextarea
              productId={productId}
              field="factoryBoxNotes"
              initialValue={initial.notes}
              placeholder="Np. specyfikacja druku, materiał, wycięcia okienka…"
              rows={4}
            />
          </div>

          {/* Akceptuj */}
          <div className="pt-3 border-t flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground italic">
              Po akceptacji wymiary i typ opakowania zostaną zablokowane.
              Edycja możliwa po kliknięciu „Edytuj".
            </p>
            <Button
              type="button"
              onClick={accept}
              disabled={pending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              <Check className="size-4" />
              Akceptuj
            </Button>
          </div>
        </div>
      )}

      {included && initial.accepted && (
        <AcceptedView
          packagingType={initial.packagingType}
          widthCm={initial.widthCm}
          heightCm={initial.heightCm}
          depthCm={initial.depthCm}
          weightKg={initial.weightKg}
          notes={initial.notes}
          imageUrl={initial.imageUrl}
          imageAlt={initial.imageAlt}
          designUrl={initial.designUrl}
          designName={initial.designName}
          onUnlock={unlock}
          unlockPending={pending}
        />
      )}
    </Card>
  );
}

// ─── Read-only view po akceptacji ────────────────────────────────────

function AcceptedView({
  packagingType,
  widthCm,
  heightCm,
  depthCm,
  weightKg,
  notes,
  imageUrl,
  imageAlt,
  designUrl,
  designName,
  onUnlock,
  unlockPending,
}: {
  packagingType: "BOX" | "POLY_BAG";
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weightKg: number | null;
  notes: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  designUrl: string | null;
  designName: string | null;
  onUnlock: () => void;
  unlockPending: boolean;
}) {
  const fmtDim = (n: number | null, unit: string) =>
    n != null ? `${n} ${unit}` : "—";

  return (
    <div className="p-4 space-y-4 bg-emerald-50/30">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
        <Stat
          label="Typ"
          value={packagingType === "POLY_BAG" ? "Foliopak" : "Pudełko"}
        />
        <Stat label="Szerokość" value={fmtDim(widthCm, "cm")} />
        <Stat label="Wysokość" value={fmtDim(heightCm, "cm")} />
        {packagingType === "BOX" && (
          <Stat label="Głębokość" value={fmtDim(depthCm, "cm")} />
        )}
        <Stat label="Waga" value={fmtDim(weightKg, "kg")} />
      </div>

      {(imageUrl || designUrl) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-emerald-200/60">
          {imageUrl && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                <ImageIcon className="size-3" />
                Zdjęcie pudełka
              </div>
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block aspect-[4/3] rounded-md overflow-hidden bg-muted ring-1 ring-border max-w-xs"
              >
                <Image
                  src={imageUrl}
                  alt={imageAlt ?? ""}
                  fill
                  sizes="320px"
                  className="object-contain"
                  unoptimized
                />
              </a>
            </div>
          )}
          {designUrl && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1">
                <FileText className="size-3" />
                Design / print
              </div>
              <a
                href={designUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs border rounded-md px-3 py-2 hover:bg-muted"
              >
                <FileText className="size-3.5" />
                <span className="font-medium">{designName ?? "Plik designu"}</span>
                <Download className="size-3.5 text-muted-foreground" />
              </a>
            </div>
          )}
        </div>
      )}

      {notes && (
        <div className="space-y-1 pt-2 border-t border-emerald-200/60">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
            Notatki dla fabryki
          </div>
          <p className="text-xs whitespace-pre-wrap text-foreground">{notes}</p>
        </div>
      )}

      <div className="pt-3 border-t border-emerald-200/60 flex items-center justify-between gap-3">
        <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
          <Lock className="size-3" />
          Wymiary i typ zablokowane po akceptacji
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onUnlock}
          disabled={unlockPending}
          className="gap-1.5"
        >
          <Pencil className="size-3.5" />
          Edytuj
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-card ring-1 ring-border p-2">
      <div className="text-[9px] uppercase text-muted-foreground tracking-wide">
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

// ─── Image block ────────────────────────────────────────────────────────

function FactoryBoxImageBlock({
  productId,
  url,
  alt,
}: {
  productId: string;
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
        await uploadFactoryBoxImageAction(productId, fd);
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
        await removeFactoryBoxImageAction(productId);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
        <ImageIcon className="size-3" />
        Zdjęcie pudełka
      </div>
      {url ? (
        <div className="relative group">
          <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-muted ring-1 ring-border">
            <Image
              src={url}
              alt={alt ?? "Pudełko z fabryki"}
              fill
              sizes="400px"
              className="object-contain"
              unoptimized
            />
          </div>
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
          className="w-full aspect-[4/3] rounded-md bg-muted hover:bg-muted/70 ring-1 ring-dashed ring-border flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors"
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

// ─── Design file block ──────────────────────────────────────────────────

function FactoryBoxDesignBlock({
  productId,
  url,
  name,
}: {
  productId: string;
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
        await uploadFactoryBoxDesignAction(productId, fd);
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
        await removeFactoryBoxDesignAction(productId);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide flex items-center gap-1.5">
        <FileText className="size-3" />
        Design / print na pudełko
      </div>
      {url ? (
        <div className="rounded-md ring-1 ring-border p-3 space-y-2 bg-muted/30">
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
          className="w-full aspect-[4/3] rounded-md bg-muted hover:bg-muted/70 ring-1 ring-dashed ring-border flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors"
        >
          <Upload className="size-5" />
          {pending ? "Wgrywanie…" : "Dodaj plik designu"}
          <span className="text-[10px]">np. PDF, AI, PSD</span>
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

// ─── Wymiary pudełka z chin ──────────────────────────────────────────

function DimensionInputs({
  productId,
  packagingType,
  widthCm,
  heightCm,
  depthCm,
  weightKg,
}: {
  productId: string;
  packagingType: "BOX" | "POLY_BAG";
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weightKg: number | null;
}) {
  const cols = packagingType === "POLY_BAG" ? "md:grid-cols-3" : "md:grid-cols-4";
  return (
    <div className={`grid grid-cols-2 gap-2 ${cols}`}>
      <DimField
        productId={productId}
        field="widthCm"
        initial={widthCm}
        label="Szerokość"
        unit="cm"
      />
      <DimField
        productId={productId}
        field="heightCm"
        initial={heightCm}
        label="Wysokość"
        unit="cm"
      />
      {packagingType === "BOX" && (
        <DimField
          productId={productId}
          field="depthCm"
          initial={depthCm}
          label="Głębokość"
          unit="cm"
        />
      )}
      <DimField
        productId={productId}
        field="weightKg"
        initial={weightKg}
        label="Waga"
        unit="kg"
      />
    </div>
  );
}

function DimField({
  productId,
  field,
  initial,
  label,
  unit,
}: {
  productId: string;
  field: "widthCm" | "heightCm" | "depthCm" | "weightKg";
  initial: number | null;
  label: string;
  unit: string;
}) {
  const [value, setValue] = useState(initial != null ? String(initial) : "");
  const [pending, startTransition] = useTransition();

  function commit() {
    const trimmed = value.trim();
    const original = initial != null ? String(initial) : "";
    if (trimmed === original) return;
    const parsed = trimmed === "" ? null : Number(trimmed.replace(",", "."));
    if (parsed != null && !Number.isFinite(parsed)) {
      toast.error(`${label}: nieprawidłowa liczba`);
      return;
    }
    startTransition(async () => {
      try {
        await setFactoryBoxAction(productId, { [field]: parsed });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label} <span className="lowercase opacity-60">({unit})</span>
      </Label>
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        disabled={pending}
        className="h-8 text-sm text-right tabular-nums"
        placeholder="—"
        inputMode="decimal"
      />
    </div>
  );
}
