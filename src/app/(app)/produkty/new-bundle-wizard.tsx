"use client";

/**
 * Wizard tworzenia ZESTAWU — wirtualnego produktu złożonego z istniejących
 * produktów (nie komponentów). 4 kroki:
 *  1. Podstawowe — nazwa + kategoria (+ SKU + CODE 128)
 *  2. Składniki zestawu — multi-select z biblioteki produktów (drill-down)
 *  3. Pakowanie:
 *     a) Każdy osobno (INDIVIDUAL_PACKAGING) — sumuje kartony ze składowych
 *     b) Wszystkie razem w 1 (SINGLE_CARTON) — wybór z biblioteki ShippingBox
 *  4. Ceny — domyślne ceny zakupu/sprzedaży
 *
 * Render różny od `NewProductWizardDialog` — nie ma trybu importu, brak wymiarów
 * importowych, brak komponentów (tylko produkty).
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Check,
  ChevronDown,
  Component,
  Layers,
  Package,
  Plus,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { createBundleAction } from "@/server/bundles";
import type { CategoryTreeNode } from "./category-tree-select";
import type { BoxOption } from "./[id]/boxes-tab";
import { LibraryDrillPicker } from "./_components/library-drill-picker";
import { VariantPoolModal } from "./_components/variant-pool-modal";
import {
  InlineBoxPicker,
  ProductCategoryPicker,
} from "./new-product-wizard";

const STEPS = [
  { id: 1, label: "Podstawowe", icon: Sparkles },
  { id: 2, label: "Składniki zestawu", icon: Package },
  { id: 3, label: "Pakowanie", icon: Box },
  { id: 4, label: "Ceny", icon: ShoppingBag },
] as const;

export type BundleLibraryProduct = {
  id: string;
  name: string;
  productCode: string;
  code128: string | null;
  categoryId: string | null;
  isComponent: boolean;
  /** Waga sztuki (kg) — dla komponentów jedyny sygnał wagowy w kalkulacji. */
  weightKg: number | null;
  /** Wymiary pakowania wysyłkowego (do kalkulacji w trybie INDIVIDUAL_PACKAGING). */
  shippingBoxWidthCm: number | null;
  shippingBoxHeightCm: number | null;
  shippingBoxDepthCm: number | null;
  shippingBoxWeightKg: number | null;
  unitsPerShippingBox: number | null;
  /** Ceny zakupu sztuki — do podsumowania kosztów składników w Step 4. */
  defaultUnitPriceUsd: number | null;
  defaultUnitPriceCny: number | null;
};

type BundleSlot = {
  productId: string;
  name: string;
  productCode: string;
  categoryId: string | null;
  isComponent: boolean;
  quantity: number;
  allowVariants: boolean;
  poolCategoryIds: string[];
  poolProductIds: string[];
};

type ShippingMode = "INDIVIDUAL_PACKAGING" | "SINGLE_CARTON";

type FormState = {
  name: string;
  productCode: string;
  code128: string;
  categoryId: string;
  slots: BundleSlot[];
  shippingMode: ShippingMode;
  shippingBoxId: string;
  defaultUnitPriceUsd: string;
  defaultUnitPriceCny: string;
  defaultSalePriceAllegroPln: string;
  defaultSalePriceSklepPln: string;
};

const INITIAL: FormState = {
  name: "",
  productCode: "",
  code128: "",
  categoryId: "",
  slots: [],
  shippingMode: "INDIVIDUAL_PACKAGING",
  shippingBoxId: "",
  defaultUnitPriceUsd: "",
  defaultUnitPriceCny: "",
  defaultSalePriceAllegroPln: "",
  defaultSalePriceSklepPln: "",
};

export type BundleWizardRates = {
  usd: number | null;
  cny: number | null;
  rateDate: string | null;
};

export function NewBundleWizardDialog({
  categories,
  bundleLibrary,
  availableBoxes,
  rates,
  triggerClassName,
}: {
  categories: CategoryTreeNode[];
  /** Produkty (isComponent=false) dostępne jako składniki zestawu + pula wariantów. */
  bundleLibrary: BundleLibraryProduct[];
  availableBoxes: BoxOption[];
  /** Kursy NBP do przeliczeń USD/CNY → PLN w Step 4 (Ceny). */
  rates: BundleWizardRates;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2.5 h-11 px-4 rounded-lg font-semibold text-sm transition-all bg-white ring-1 ring-amber-300 text-amber-700 hover:bg-amber-50 hover:ring-amber-400 shadow-sm hover:shadow-md",
          triggerClassName,
        )}
      >
        <Layers className="size-5" />
        Nowy zestaw
        <ChevronDown className="size-3.5 opacity-70" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[min(96vw,840px)] sm:!max-w-[min(96vw,840px)] max-h-[92vh] overflow-y-auto p-0">
          <BundleWizardBody
            categories={categories}
            bundleLibrary={bundleLibrary}
            availableBoxes={availableBoxes}
            rates={rates}
            onClose={() => setOpen(false)}
            onCreated={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function BundleWizardBody({
  categories,
  bundleLibrary,
  availableBoxes,
  rates,
  onClose,
  onCreated,
}: {
  categories: CategoryTreeNode[];
  bundleLibrary: BundleLibraryProduct[];
  availableBoxes: BoxOption[];
  rates: BundleWizardRates;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [pending, startTransition] = useTransition();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!form.name.trim()) return "Podaj nazwę zestawu";
      if (!form.categoryId) return "Wybierz kategorię";
      if (!form.productCode.trim()) return "Podaj SKU zestawu";
    }
    if (s === 2) {
      if (form.slots.length === 0)
        return "Dodaj przynajmniej jeden składnik zestawu";
    }
    if (s === 3) {
      if (form.shippingMode === "SINGLE_CARTON" && !form.shippingBoxId) {
        return "Wybierz karton z biblioteki";
      }
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    if (step < STEPS.length) setStep(step + 1);
  }
  function goPrev() {
    if (step > 1) setStep(step - 1);
  }

  function handleSubmit() {
    for (let s = 1; s <= STEPS.length; s++) {
      const err = validateStep(s);
      if (err) {
        setStep(s);
        toast.error(err);
        return;
      }
    }
    startTransition(async () => {
      try {
        const payload = {
          name: form.name.trim(),
          productCode: form.productCode.trim(),
          code128: form.code128.trim() || null,
          categoryId: form.categoryId,
          slots: form.slots.map((s) => ({
            productId: s.productId,
            quantity: s.quantity,
            allowVariants: s.allowVariants,
            poolCategoryIds: s.poolCategoryIds,
            poolProductIds: s.poolProductIds,
          })),
          shippingMode: form.shippingMode,
          shippingBoxId:
            form.shippingMode === "SINGLE_CARTON"
              ? form.shippingBoxId
              : null,
          defaultUnitPriceUsd: form.defaultUnitPriceUsd
            ? Number(form.defaultUnitPriceUsd)
            : null,
          defaultUnitPriceCny: form.defaultUnitPriceCny
            ? Number(form.defaultUnitPriceCny)
            : null,
          defaultSalePriceAllegroPln: form.defaultSalePriceAllegroPln
            ? Number(form.defaultSalePriceAllegroPln)
            : null,
          defaultSalePriceSklepPln: form.defaultSalePriceSklepPln
            ? Number(form.defaultSalePriceSklepPln)
            : null,
        };
        const res = await createBundleAction(payload);
        if (res.ok) {
          toast.success("Zestaw utworzony");
          onCreated();
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b bg-gradient-to-br from-amber-50/40 to-white">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="size-5 text-amber-600" />
          <h2 className="text-lg font-heading font-semibold tracking-tight">
            Nowy zestaw
          </h2>
        </div>
        <BundleStepIndicator currentStep={step} onJump={setStep} />
      </div>

      {/* Treść */}
      <div className="px-6 py-5 min-h-[360px]">
        {step === 1 && (
          <Step1Basic
            form={form}
            update={update}
            categories={categories}
          />
        )}
        {step === 2 && (
          <Step2Slots
            form={form}
            update={update}
            bundleLibrary={bundleLibrary}
            categories={categories}
          />
        )}
        {step === 3 && (
          <Step3Packaging
            form={form}
            update={update}
            bundleLibrary={bundleLibrary}
            availableBoxes={availableBoxes}
          />
        )}
        {step === 4 && (
          <Step4Prices
            form={form}
            update={update}
            bundleLibrary={bundleLibrary}
            rates={rates}
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={step === 1 ? onClose : goPrev}
          disabled={pending}
        >
          {step === 1 ? "Anuluj" : "Wstecz"}
        </Button>
        <div className="text-xs text-muted-foreground">
          Krok {step}/{STEPS.length}
        </div>
        {step < STEPS.length ? (
          <Button type="button" onClick={goNext} disabled={pending}>
            Dalej
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {pending ? "Zapisuję…" : "Utwórz zestaw"}
          </Button>
        )}
      </div>
    </div>
  );
}

function BundleStepIndicator({
  currentStep,
  onJump,
}: {
  currentStep: number;
  onJump: (s: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const isDone = currentStep > s.id;
        const isCurrent = currentStep === s.id;
        const Icon = s.icon;
        return (
          <div key={s.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => isDone && onJump(s.id)}
              disabled={!isDone}
              className={cn(
                "flex flex-col items-center gap-1 flex-1 py-1 rounded-lg transition-colors",
                isCurrent && "text-amber-700",
                isDone && "text-emerald-700 hover:bg-emerald-50 cursor-pointer",
                !isCurrent && !isDone && "text-slate-400",
              )}
            >
              <div
                className={cn(
                  "size-7 rounded-full grid place-items-center ring-2 transition-all",
                  isCurrent && "bg-amber-100 ring-amber-400 scale-110",
                  isDone && "bg-emerald-100 ring-emerald-400",
                  !isCurrent && !isDone && "bg-slate-100 ring-slate-300",
                )}
              >
                {isDone ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : (
                  <Icon className="size-3.5" />
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wide font-semibold text-center leading-tight">
                {s.label}
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 transition-colors",
                  isDone ? "bg-emerald-400" : "bg-slate-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1 ─────────────────────────────────────────────────────────

function Step1Basic({
  form,
  update,
  categories,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  categories: CategoryTreeNode[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg ring-1 ring-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
        <strong>Zestaw:</strong> wirtualny produkt złożony z istniejących
        produktów i komponentów (np. komplet stołowy = blat + 4 krzesła + nogi).
        Zestaw nie jest importowany — jego składniki przychodzą niezależnie. W
        pakowaniu komponenty doliczają tylko swoją wagę, bez osobnych kartonów.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bw-name" className="text-sm">
            Nazwa zestawu <span className="text-red-500">*</span>
          </Label>
          <Input
            id="bw-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="np. Komplet stołowy Oslo"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">
            Kategoria <span className="text-red-500">*</span>
          </Label>
          <ProductCategoryPicker
            categories={categories}
            value={form.categoryId || null}
            onChange={(id) => update("categoryId", id ?? "")}
            modalTitle="Wybierz kategorię zestawu"
            emptyLabel="Wybierz kategorię zestawu…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bw-sku" className="text-sm">
            SKU zestawu <span className="text-red-500">*</span>
          </Label>
          <Input
            id="bw-sku"
            value={form.productCode}
            onChange={(e) => update("productCode", e.target.value)}
            placeholder="np. SET-OSLO-1"
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bw-code128" className="text-sm">
            CODE 128
          </Label>
          <Input
            id="bw-code128"
            value={form.code128}
            onChange={(e) => update("code128", e.target.value)}
            placeholder="opcjonalnie"
            className="font-mono"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Składniki zestawu ──────────────────────────────────────

function Step2Slots({
  form,
  update,
  bundleLibrary,
  categories,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  bundleLibrary: BundleLibraryProduct[];
  categories: CategoryTreeNode[];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const usedIds = new Set(form.slots.map((s) => s.productId));

  function addSlots(picks: BundleLibraryProduct[]) {
    if (picks.length === 0) return;
    const fresh: BundleSlot[] = picks
      .filter((p) => !usedIds.has(p.id))
      .map((p) => ({
        productId: p.id,
        name: p.name,
        productCode: p.productCode,
        categoryId: p.categoryId,
        isComponent: p.isComponent,
        quantity: 1,
        allowVariants: true,
        poolCategoryIds: [],
        poolProductIds: [],
      }));
    if (fresh.length === 0) {
      toast.info("Wszystkie zaznaczone już są na liście");
      return;
    }
    update("slots", [...form.slots, ...fresh]);
    setPickerOpen(false);
    toast.success(
      `Dodano ${fresh.length} ${fresh.length === 1 ? "składnik" : "składników"}`,
    );
  }

  function updateSlotQty(productId: string, qty: number) {
    update(
      "slots",
      form.slots.map((s) =>
        s.productId === productId
          ? { ...s, quantity: Math.max(1, qty) }
          : s,
      ),
    );
  }

  function removeSlot(productId: string) {
    update("slots", form.slots.filter((s) => s.productId !== productId));
  }

  function updateSlotPool(
    productId: string,
    value: {
      allowVariants: boolean;
      poolCategoryIds: string[];
      poolProductIds: string[];
    },
  ) {
    update(
      "slots",
      form.slots.map((s) =>
        s.productId === productId ? { ...s, ...value } : s,
      ),
    );
  }

  const totalItems = form.slots.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <strong className="tabular-nums">{form.slots.length}</strong>{" "}
          {form.slots.length === 1 ? "składnik" : "składników"} ·{" "}
          <strong className="tabular-nums">{totalItems}</strong> szt. łącznie
        </div>
        <Button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
        >
          <Plus className="size-4" />
          Dodaj produkty
        </Button>
      </div>

      {form.slots.length === 0 ? (
        <div className="rounded-lg ring-1 ring-dashed ring-slate-300 bg-slate-50 p-8 text-center text-sm text-muted-foreground">
          Brak składników. Kliknij <strong>„Dodaj produkty"</strong> żeby
          wybrać z biblioteki.
        </div>
      ) : (
        <ul className="rounded-md ring-1 ring-slate-200 divide-y divide-slate-100 bg-white">
          {form.slots.map((slot) => (
            <li
              key={slot.productId}
              className="px-3 py-2 flex items-center gap-2"
            >
              <div
                className={cn(
                  "size-7 rounded grid place-items-center shrink-0",
                  slot.isComponent
                    ? "bg-violet-100 text-violet-700"
                    : "bg-indigo-100 text-indigo-700",
                )}
                title={slot.isComponent ? "Komponent" : "Produkt"}
              >
                {slot.isComponent ? (
                  <Component className="size-3.5" />
                ) : (
                  <Package className="size-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                  {slot.name}
                  {slot.isComponent && (
                    <span className="text-[9px] uppercase font-semibold tracking-wide px-1 py-0 rounded bg-violet-100 text-violet-800 ring-1 ring-violet-200">
                      kompon.
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-slate-500 truncate">
                  {slot.productCode}
                </div>
              </div>
              <BundleSlotPoolChip
                slot={slot}
                bundleLibrary={bundleLibrary}
                categories={categories}
                onUpdate={(val) => updateSlotPool(slot.productId, val)}
              />
              <div className="flex items-center gap-1 shrink-0">
                <Label className="text-[10px] text-slate-500">Szt</Label>
                <Input
                  type="number"
                  min={1}
                  value={slot.quantity}
                  onChange={(e) =>
                    updateSlotQty(slot.productId, Number(e.target.value))
                  }
                  className="w-16 h-7 text-center font-mono text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => removeSlot(slot.productId)}
                className="size-7 rounded grid place-items-center text-rose-600 hover:bg-rose-50 shrink-0"
                title="Usuń składnik"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <LibraryDrillPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Wybierz składniki zestawu (produkty lub komponenty)"
        items={bundleLibrary}
        excludedIds={usedIds}
        categoryTree={categories}
        multiSelect
        onPickMultiple={addSlots}
      />
    </div>
  );
}

function BundleSlotPoolChip({
  slot,
  bundleLibrary,
  categories,
  onUpdate,
}: {
  slot: BundleSlot;
  bundleLibrary: BundleLibraryProduct[];
  categories: CategoryTreeNode[];
  onUpdate: (value: {
    allowVariants: boolean;
    poolCategoryIds: string[];
    poolProductIds: string[];
  }) => void;
}) {
  const [open, setOpen] = useState(false);

  const sourcesLabel = (() => {
    if (!slot.allowVariants) return "Tylko ten";
    const parts: string[] = [];
    if (slot.poolCategoryIds.length > 0)
      parts.push(`${slot.poolCategoryIds.length} kat.`);
    if (slot.poolProductIds.length > 0)
      parts.push(`${slot.poolProductIds.length} prod.`);
    if (parts.length === 0) return "Auto z kategorii";
    return parts.join(" + ");
  })();

  const tone = !slot.allowVariants
    ? "bg-slate-100 text-slate-700 ring-slate-200"
    : slot.poolCategoryIds.length + slot.poolProductIds.length > 0
      ? "bg-violet-100 text-violet-800 ring-violet-200"
      : "bg-amber-100 text-amber-800 ring-amber-200";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 hover:brightness-95 transition-all max-w-[180px]",
          tone,
        )}
        title="Konfiguruj pulę wariantów slotu"
      >
        <Layers className="size-2.5 shrink-0" />
        <span className="truncate">{sourcesLabel}</span>
        <Settings2 className="size-2.5 shrink-0 opacity-70" />
      </button>

      <VariantPoolModal
        open={open}
        onOpenChange={setOpen}
        slotName={slot.name}
        componentId={slot.productId}
        defaultCategoryId={slot.categoryId}
        initialValue={{
          allowVariants: slot.allowVariants,
          poolCategoryIds: slot.poolCategoryIds,
          poolProductIds: slot.poolProductIds,
        }}
        categoryTree={categories}
        library={bundleLibrary.map((p) => ({
          id: p.id,
          name: p.name,
          productCode: p.productCode,
          code128: p.code128,
          categoryId: p.categoryId,
        }))}
        onSave={(value) => {
          onUpdate(value);
          setOpen(false);
        }}
      />
    </>
  );
}

// ─── Step 3: Pakowanie ──────────────────────────────────────────────

function Step3Packaging({
  form,
  update,
  bundleLibrary,
  availableBoxes,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  bundleLibrary: BundleLibraryProduct[];
  availableBoxes: BoxOption[];
}) {
  const individualBreakdown = useMemo(
    () => calculateIndividualPackaging(form.slots, bundleLibrary),
    [form.slots, bundleLibrary],
  );

  return (
    <div className="space-y-4">
      {/* Wybór trybu */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ModeCard
          active={form.shippingMode === "INDIVIDUAL_PACKAGING"}
          onClick={() => update("shippingMode", "INDIVIDUAL_PACKAGING")}
          title="Każdy osobno"
          description="Każdy produkt wysyłany we własnym kartonie."
          icon={<Package className="size-5" />}
          tone="violet"
        />
        <ModeCard
          active={form.shippingMode === "SINGLE_CARTON"}
          onClick={() => update("shippingMode", "SINGLE_CARTON")}
          title="Wszystkie razem w 1"
          description="Wszystkie produkty wysyłamy w 1 kartonie."
          icon={<Box className="size-5" />}
          tone="amber"
        />
      </div>

      {/* Tryb a) — podgląd kalkulacji */}
      {form.shippingMode === "INDIVIDUAL_PACKAGING" && (
        <div className="rounded-md ring-1 ring-violet-200 bg-violet-50/40 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide font-semibold text-violet-800">
            Kalkulacja kartonów (suma składowych)
          </div>
          {form.slots.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Dodaj składniki w kroku 2 żeby zobaczyć kalkulację.
            </p>
          ) : individualBreakdown.rows.length === 0 ? (
            <p className="text-xs text-rose-700">
              Żaden ze składników nie ma ustawionego pakowania wysyłkowego —
              uzupełnij wymiary kartonu na kartach produktów.
            </p>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="text-left font-semibold py-1">Składnik</th>
                    <th className="text-right font-semibold py-1 w-16">
                      Szt
                    </th>
                    <th className="text-right font-semibold py-1 w-20">
                      / karton
                    </th>
                    <th className="text-right font-semibold py-1 w-20">
                      Karton.
                    </th>
                    <th className="text-right font-semibold py-1 w-20">
                      Waga
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-200/60">
                  {individualBreakdown.rows.map((r) => (
                    <tr key={r.productId}>
                      <td className="py-1 max-w-[220px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{r.name}</span>
                          {r.isComponent && (
                            <span className="shrink-0 text-[9px] uppercase font-semibold tracking-wide px-1 py-0 rounded bg-violet-100 text-violet-800 ring-1 ring-violet-200">
                              kompon.
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {r.quantity}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums text-slate-400">
                        {r.isComponent ? "—" : (r.unitsPerBox ?? "—")}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums text-slate-400">
                        {r.isComponent ? "—" : (r.boxes ?? "—")}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums">
                        {r.totalWeightKg != null
                          ? `${r.totalWeightKg.toFixed(2)} kg`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-violet-300 font-semibold">
                    <td className="py-1.5">RAZEM</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {individualBreakdown.totals.units}
                    </td>
                    <td />
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {individualBreakdown.totals.boxes}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {individualBreakdown.totals.weightKg.toFixed(2)} kg
                    </td>
                  </tr>
                </tfoot>
              </table>
              {individualBreakdown.missingShipping.length > 0 && (
                <p className="text-[10px] text-amber-700">
                  Brak pakowania wysyłkowego dla:{" "}
                  {individualBreakdown.missingShipping.join(", ")}
                </p>
              )}
              {individualBreakdown.missingComponentWeight.length > 0 && (
                <p className="text-[10px] text-amber-700">
                  Brak wagi komponentów (waga sumaryczna zaniżona):{" "}
                  {individualBreakdown.missingComponentWeight.join(", ")}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Tryb b) — picker karton z biblioteki + quick-add */}
      {form.shippingMode === "SINGLE_CARTON" && (
        <div className="rounded-md ring-1 ring-amber-200 bg-amber-50/40 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide font-semibold text-amber-800">
            Karton wysyłkowy zestawu
          </div>
          <InlineBoxPicker
            boxes={availableBoxes}
            selectedId={form.shippingBoxId || null}
            onSelect={(id) => update("shippingBoxId", id)}
            theme="amber"
            packagingFilter="BOX"
            originFilter="POLAND"
            collectiveFilter={false}
            quickAddType="BOX"
            quickAddLabel="Dodaj nowy karton polski wysyłkowy"
            quickAddDefaultOrigin="POLAND"
          />
        </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  description,
  icon,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: "violet" | "amber";
}) {
  const activeRing =
    tone === "violet"
      ? "ring-violet-400 bg-violet-50"
      : "ring-amber-400 bg-amber-50";
  const iconBg =
    tone === "violet"
      ? "bg-violet-100 text-violet-700"
      : "bg-amber-100 text-amber-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg ring-1 p-3 transition-all hover:shadow-sm",
        active
          ? `ring-2 ${activeRing}`
          : "ring-slate-200 bg-white hover:ring-slate-300",
      )}
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <div className={cn("size-9 rounded-md grid place-items-center", iconBg)}>
          {icon}
        </div>
        <div className="text-sm font-semibold flex-1">{title}</div>
        {active && (
          <div className="size-5 rounded-full bg-emerald-100 grid place-items-center">
            <Check className="size-3 text-emerald-700" strokeWidth={3} />
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        {description}
      </p>
    </button>
  );
}

// ─── Step 4: Ceny ───────────────────────────────────────────────────

function Step4Prices({
  form,
  update,
  bundleLibrary,
  rates,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  bundleLibrary: BundleLibraryProduct[];
  rates: BundleWizardRates;
}) {
  // Suma kosztów składników w PLN — z USD/CNY × kurs NBP. Pomija składniki bez
  // ceny zakupu. Pokazuje też breakdown linia-na-składnik z ich kosztem jednostkowym
  // i całkowitym (cena × ilość w zestawie).
  const componentRows = form.slots.map((slot) => {
    const lib = bundleLibrary.find((p) => p.id === slot.productId);
    const usd = lib?.defaultUnitPriceUsd ?? null;
    const cny = lib?.defaultUnitPriceCny ?? null;
    let unitPln: number | null = null;
    let source: "USD" | "CNY" | null = null;
    if (usd != null && rates.usd != null) {
      unitPln = usd * rates.usd;
      source = "USD";
    } else if (cny != null && rates.cny != null) {
      unitPln = cny * rates.cny;
      source = "CNY";
    }
    return {
      slot,
      lib,
      usd,
      cny,
      unitPln,
      source,
      totalPln: unitPln != null ? unitPln * slot.quantity : null,
    };
  });
  const sumPln = componentRows.reduce(
    (acc, r) => acc + (r.totalPln ?? 0),
    0,
  );
  const hasAnyPrice = componentRows.some((r) => r.totalPln != null);
  const missingCount = componentRows.filter((r) => r.totalPln == null).length;

  return (
    <div className="space-y-4">
      {/* Sekcja: koszt składników — automatyczny rollup z ich cen zakupu */}
      <div className="rounded-lg ring-1 ring-emerald-200 bg-emerald-50/40 overflow-hidden">
        <div className="px-3 py-2 border-b border-emerald-200/60 bg-emerald-100/40 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-emerald-900">
            Koszt składników zestawu (PLN)
          </div>
          {rates.rateDate && (
            <div className="text-[10px] text-emerald-700/70">
              Kurs NBP {rates.rateDate}
            </div>
          )}
        </div>
        {form.slots.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground italic">
            Brak składników (wróć do kroku „Składniki zestawu").
          </div>
        ) : (
          <div className="divide-y divide-emerald-100/80">
            {componentRows.map((r, idx) => (
              <div
                key={`${r.slot.productId}-${idx}`}
                className="px-3 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    {r.lib?.name ?? r.slot.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {r.slot.productCode}
                  </div>
                </div>
                <div className="text-right tabular-nums text-[11px] text-slate-600 min-w-[80px]">
                  {r.source === "USD" && r.usd != null && (
                    <span>{r.usd.toFixed(2)} USD</span>
                  )}
                  {r.source === "CNY" && r.cny != null && (
                    <span>{r.cny.toFixed(2)} CNY</span>
                  )}
                  {r.source == null && (
                    <span className="text-amber-700 italic">brak ceny</span>
                  )}
                </div>
                <div className="text-right tabular-nums text-[11px] text-slate-500 min-w-[40px]">
                  ×{r.slot.quantity}
                </div>
                <div className="text-right tabular-nums font-semibold text-slate-800 min-w-[90px]">
                  {r.totalPln != null
                    ? `${r.totalPln.toFixed(2)} zł`
                    : "—"}
                </div>
              </div>
            ))}
            <div className="px-3 py-2 bg-emerald-100/50 grid grid-cols-[1fr_auto] gap-3 items-baseline">
              <div className="text-xs font-semibold text-emerald-900">
                Razem koszt zakupu zestawu
                {missingCount > 0 && (
                  <span className="text-[10px] font-normal text-amber-700 ml-1.5">
                    (pomija {missingCount} składnik
                    {missingCount > 1 ? "ów" : ""} bez ceny)
                  </span>
                )}
              </div>
              <div className="text-base font-bold tabular-nums text-emerald-900">
                {hasAnyPrice ? `${sumPln.toFixed(2)} zł` : "—"}
              </div>
            </div>
          </div>
        )}
        {hasAnyPrice && (
          <div className="px-3 py-2 border-t border-emerald-200/60 bg-white">
            <button
              type="button"
              onClick={() => {
                // Podpowiedź: domyślna cena USD = sum PLN / kurs USD
                if (rates.usd != null && rates.usd > 0) {
                  const usdSum = sumPln / rates.usd;
                  update("defaultUnitPriceUsd", usdSum.toFixed(2));
                }
              }}
              className="text-[11px] text-emerald-700 hover:text-emerald-900 hover:underline"
              disabled={rates.usd == null}
            >
              ↓ Wpisz {sumPln.toFixed(2)} zł jako sugerowaną cenę zakupu USD
            </button>
          </div>
        )}
      </div>

      <div className="rounded-md ring-1 ring-slate-200 bg-slate-50/40 p-3 text-xs text-muted-foreground">
        Poniżej ustawiasz <strong>własne</strong> ceny zestawu (sumę od fabryki +
        cenę sprzedaży). Składniki powyżej to tylko podpowiedź — nie nadpisują
        się automatycznie. Pomijaj jeśli ceny zestawu zależą od konfiguracji.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PriceField
          label="Cena zakupu USD/szt"
          value={form.defaultUnitPriceUsd}
          onChange={(v) => update("defaultUnitPriceUsd", v)}
          suffix="USD"
        />
        <PriceField
          label="Cena zakupu CNY/szt"
          value={form.defaultUnitPriceCny}
          onChange={(v) => update("defaultUnitPriceCny", v)}
          suffix="CNY"
        />
        <PriceField
          label="Cena sprzedaży Allegro (netto)"
          value={form.defaultSalePriceAllegroPln}
          onChange={(v) => update("defaultSalePriceAllegroPln", v)}
          suffix="PLN"
        />
        <PriceField
          label="Cena sprzedaży Sklep (netto)"
          value={form.defaultSalePriceSklepPln}
          onChange={(v) => update("defaultSalePriceSklepPln", v)}
          suffix="PLN"
        />
      </div>
    </div>
  );
}

function PriceField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step="0.01"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono pr-12"
          placeholder="0.00"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
          {suffix}
        </span>
      </div>
    </div>
  );
}

// ─── Helper: kalkulacja indywidualnego pakowania ────────────────────

type IndividualRow = {
  productId: string;
  name: string;
  isComponent: boolean;
  quantity: number;
  unitsPerBox: number | null;
  boxes: number | null;
  totalWeightKg: number | null;
};

type IndividualBreakdown = {
  rows: IndividualRow[];
  totals: { units: number; boxes: number; weightKg: number };
  /** Produkty (nie komponenty) bez ustawionego pakowania wysyłkowego. */
  missingShipping: string[];
  /** Komponenty bez wagi — kalkulacja sumarycznej wagi będzie zaniżona. */
  missingComponentWeight: string[];
};

export function calculateIndividualPackaging(
  slots: BundleSlot[],
  library: BundleLibraryProduct[],
): IndividualBreakdown {
  const rows: IndividualRow[] = [];
  const missingShipping: string[] = [];
  const missingComponentWeight: string[] = [];
  let totalUnits = 0;
  let totalBoxes = 0;
  let totalWeightKg = 0;

  for (const slot of slots) {
    const prod = library.find((p) => p.id === slot.productId);
    if (!prod) continue;
    totalUnits += slot.quantity;

    if (prod.isComponent) {
      // Komponent: brak osobnego kartonu, doliczamy tylko wagę jednostkową × ilość.
      const unitWeight = prod.weightKg;
      const weight = unitWeight != null ? unitWeight * slot.quantity : null;
      if (weight != null) totalWeightKg += weight;
      else missingComponentWeight.push(prod.name);
      rows.push({
        productId: prod.id,
        name: prod.name,
        isComponent: true,
        quantity: slot.quantity,
        unitsPerBox: null,
        boxes: null,
        totalWeightKg: weight,
      });
      continue;
    }

    // Produkt: pełna kalkulacja kartonów wysyłkowych.
    const unitsPerBox = prod.unitsPerShippingBox;
    const boxWeight = prod.shippingBoxWeightKg;
    let boxes: number | null = null;
    let weight: number | null = null;
    if (unitsPerBox != null && unitsPerBox > 0) {
      boxes = Math.ceil(slot.quantity / unitsPerBox);
      if (boxWeight != null) weight = boxes * boxWeight;
      totalBoxes += boxes;
      if (weight != null) totalWeightKg += weight;
    } else {
      missingShipping.push(prod.name);
    }
    rows.push({
      productId: prod.id,
      name: prod.name,
      isComponent: false,
      quantity: slot.quantity,
      unitsPerBox,
      boxes,
      totalWeightKg: weight,
    });
  }

  return {
    rows,
    totals: { units: totalUnits, boxes: totalBoxes, weightKg: totalWeightKg },
    missingShipping,
    missingComponentWeight,
  };
}
