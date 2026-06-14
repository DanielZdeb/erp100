"use client";

/**
 * Formularz "Podstawowe" — identyczny układ jak Krok 1 wizarda nowego produktu.
 *
 * Komponent ma dwa tryby:
 *  - `mode="display"` — inputy disabled, użyty bezpośrednio w zakładce
 *  - `mode="edit"`    — inputy aktywne, użyty wewnątrz modala edycji
 *
 * Logika walidacji + zapis żyje na poziomie modala, nie tutaj.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Component, Layers, Pencil, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  CategoryTreeSelect,
  type CategoryTreeNode,
} from "../../category-tree-select";
import {
  generateCode128ForCategoryAction,
  updateProductBasicAction,
} from "@/server/products";

import type { BasicInfoFormValues } from "./basic-info-utils";

export type { BasicInfoFormValues } from "./basic-info-utils";

/**
 * Styl dla inputów w trybie display (readOnly).
 * Wartość wpisana wyróżnia się grubszą czcionką + ciemnym kolorem,
 * tło zostaje białe (zamiast szarego "disabled"). Placeholder w trybie
 * read-only — czerwony pogrubiony (sygnał „nie uzupełniono").
 */
const READONLY_VALUE_CLASS = cn(
  "read-only:bg-white read-only:cursor-default read-only:focus-visible:ring-0",
  "read-only:font-semibold read-only:text-slate-900",
  "read-only:placeholder:text-rose-600 read-only:placeholder:font-bold read-only:placeholder:not-italic",
);

/** Placeholder w trybie display = „Nie uzupełniono"; w edit = original hint. */
function ph(hint: string, disabled: boolean): string {
  return disabled ? "Nie uzupełniono" : hint;
}

// ─── Pola — wspólny komponent dla display i edit ─────────────────────

function BasicInfoFields({
  values,
  update,
  disabled,
  categories,
  /** Stawka cła z kategorii w 0..1 — auto-podpowiedź gdy customsDutyPct puste. */
  categoryDutyAuto,
  /** Loading stanu "Nadaj CODE128". */
  codePending,
  onGenerateCode128,
}: {
  values: BasicInfoFormValues;
  update: <K extends keyof BasicInfoFormValues>(
    k: K,
    v: BasicInfoFormValues[K],
  ) => void;
  disabled: boolean;
  categories: CategoryTreeNode[];
  categoryDutyAuto: number | null;
  codePending: boolean;
  onGenerateCode128: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bi-name" className="text-sm">
            Nazwa produktu <span className="text-red-500">*</span>
          </Label>
          <Input
            id="bi-name"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder={ph("np. Stolik kawowy okrągły", disabled)}
            readOnly={disabled}
            autoFocus={!disabled}
            className={cn(READONLY_VALUE_CLASS)}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">
            Kategoria <span className="text-red-500">*</span>
          </Label>
          {disabled ? (
            <Input
              value={
                categories.find((c) => c.id === values.categoryId)?.name ?? ""
              }
              placeholder="Nie uzupełniono"
              readOnly
              className={cn(READONLY_VALUE_CLASS)}
            />
          ) : (
            <CategoryTreeSelect
              value={values.categoryId}
              onChange={(id) => update("categoryId", id)}
              categories={categories}
              placeholder="Wybierz kategorię…"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bi-sku" className="text-sm">
            Kod produktu (SKU) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="bi-sku"
            value={values.productCode}
            onChange={(e) => update("productCode", e.target.value)}
            placeholder={ph("np. STO-001-OAK", disabled)}
            className={cn("font-mono", READONLY_VALUE_CLASS)}
            readOnly={disabled}
          />
        </div>

        {/* CODE 128 — dla ZESTAW chowamy: kod kreskowy mają poszczególne
            składniki, zestaw jako wirtualny produkt sam go nie potrzebuje. */}
        {values.compositionMode !== "ZESTAW" && (
          <div className="space-y-1.5">
            <Label htmlFor="bi-code128" className="text-sm">
              CODE 128
            </Label>
            <div className="flex gap-1.5">
              <Input
                id="bi-code128"
                value={values.code128}
                onChange={(e) => update("code128", e.target.value)}
                placeholder={ph("np. STO-0001", disabled)}
                className={cn("font-mono", READONLY_VALUE_CLASS)}
                readOnly={disabled}
              />
              {!disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onGenerateCode128}
                  disabled={codePending || !values.categoryId}
                  title={
                    values.categoryId
                      ? "Wygeneruj kolejny wolny numer dla tej kategorii"
                      : "Wybierz najpierw kategorię"
                  }
                  className="shrink-0 gap-1.5"
                >
                  <RefreshCw
                    className={cn("size-3.5", codePending && "animate-spin")}
                  />
                  <span className="text-xs">Nadaj</span>
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Format: 3 litery kategorii + 4-cyfrowy numer (np. STO-0001)
            </p>
          </div>
        )}
      </div>

      {/* EAN — pełna szerokość w osobnym rzędzie (oddzielne pole identyfikacji) */}
      <div className="space-y-1.5">
        <Label htmlFor="bi-ean" className="text-sm">
          EAN
        </Label>
        <Input
          id="bi-ean"
          value={values.eanCode}
          onChange={(e) => update("eanCode", e.target.value)}
          placeholder={ph("np. 5905817271405", disabled)}
          inputMode="numeric"
          className={cn("font-mono max-w-xs", READONLY_VALUE_CLASS)}
          readOnly={disabled}
        />
        <p className="text-[10px] text-muted-foreground">
          Międzynarodowy kod kreskowy produktu (zwykle 13 cyfr).
        </p>
      </div>

      {/* Waga + cło */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="bi-weight" className="text-sm">
            Waga produktu <span className="text-red-500">*</span>{" "}
            <span className="text-[10px] text-muted-foreground font-normal">
              (kg/szt)
            </span>
          </Label>
          <div className="relative">
            <Input
              id="bi-weight"
              type="number"
              step="0.001"
              min={0}
              value={values.weightKg}
              onChange={(e) => update("weightKg", e.target.value)}
              placeholder={ph("np. 2.5", disabled)}
              className={cn("font-mono pr-10", READONLY_VALUE_CLASS)}
              readOnly={disabled}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
              kg
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Używana w kalkulacji kosztów wysyłki kurierem.
          </p>
        </div>

        {/* Stawka cła — dla ZESTAW chowamy: cło naliczane jest na poziomie
            składników (każdy z własną stawką z kategorii), zestaw jako wirtualny
            produkt nie ma własnego cła. */}
        {values.compositionMode !== "ZESTAW" && (
          <div className="space-y-1.5">
            <Label htmlFor="bi-duty" className="text-sm">
              Stawka cła (%)
            </Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="bi-duty"
                  type={disabled ? "text" : "number"}
                  step="0.1"
                  min={0}
                  max={100}
                  value={
                    // W trybie display: jeśli pole puste, ale kategoria ma stawkę
                    // automatyczną — pokaż tę stawkę jako effective value (bez
                    // prefiksu „auto:"). W edycji pokazujemy oryginalną wartość.
                    disabled &&
                    values.customsDutyPct === "" &&
                    categoryDutyAuto != null
                      ? String((categoryDutyAuto * 100).toFixed(1)).replace(
                          /\.0+$/,
                          "",
                        )
                      : values.customsDutyPct
                  }
                  onChange={(e) => update("customsDutyPct", e.target.value)}
                  placeholder={ph("np. 8.5", disabled)}
                  className={cn("font-mono pr-8", READONLY_VALUE_CLASS)}
                  readOnly={disabled}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                  %
                </span>
              </div>
              {!disabled && categoryDutyAuto != null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update(
                      "customsDutyPct",
                      (categoryDutyAuto * 100).toString(),
                    )
                  }
                  className="gap-1 text-xs whitespace-nowrap"
                >
                  <Settings2 className="size-3" />
                  Z kat. ({(categoryDutyAuto * 100).toFixed(1)}%)
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Auto-uzupełniane z kategorii. Możesz nadpisać.
            </p>
          </div>
        )}
      </div>

      {/* Typ produktu — ukryty dla ZESTAW (zestaw to swój własny typ, użytkownik
          go nie zmienia; pokazujemy tylko statyczny badge informacyjny). */}
      {values.compositionMode === "ZESTAW" ? (
        <div className="space-y-2">
          <Label className="text-sm">Typ produktu</Label>
          <div className="inline-flex items-center gap-2 rounded-lg ring-2 ring-amber-300 bg-gradient-to-br from-amber-50 to-white px-3 py-2.5">
            <div className="size-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
              <Layers className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-amber-900">Zestaw</div>
              <div className="text-[10px] text-amber-700/80">
                Wirtualny produkt z istniejących produktów. Składniki w prawej
                kolumnie.
              </div>
            </div>
          </div>
        </div>
      ) : (
      <div className="space-y-2">
        <Label className="text-sm">Typ produktu</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {/* Lewa kolumna: Całościowy */}
          <TypeCard
            active={values.compositionMode === "CALOSCIOWY"}
            disabled={disabled}
            onClick={() => update("compositionMode", "CALOSCIOWY")}
            icon={Layers}
            title="Całościowy"
            description="Sprowadzany i sprzedawany w całości jako jeden gotowy produkt"
            theme="emerald"
          />
          {/* Prawa kolumna: Komponentowy + (gdy aktywny) panel z liczbą komponentów */}
          <div className="space-y-2">
            <TypeCard
              active={values.compositionMode === "KOMPONENTOWY"}
              disabled={disabled}
              onClick={() => update("compositionMode", "KOMPONENTOWY")}
              icon={Component}
              title="Komponentowy"
              description="Składa się z komponentów, które mogą być sprowadzane osobno"
              theme="violet"
            />
            {values.compositionMode === "KOMPONENTOWY" && (
              <div className="rounded-lg ring-2 ring-violet-300 bg-gradient-to-br from-violet-50 to-white p-3 space-y-2 shadow-sm">
                <Label
                  htmlFor="bi-req-comp"
                  className="text-sm font-semibold text-violet-900 flex items-center gap-1.5"
                >
                  <Component className="size-4 text-violet-700" />
                  Ile komponentów składa się na 1 produkt?{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="bi-req-comp"
                    type="number"
                    min={1}
                    step="1"
                    value={values.requiredComponentsTotal}
                    onChange={(e) =>
                      update("requiredComponentsTotal", e.target.value)
                    }
                    placeholder="np. 4"
                    className={cn(
                      "font-mono text-base font-bold tabular-nums pr-12 h-11 bg-white ring-violet-200 focus-visible:ring-violet-500 text-violet-900",
                      "read-only:cursor-default read-only:focus-visible:ring-0",
                    )}
                    readOnly={disabled}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-violet-600 font-medium pointer-events-none">
                    szt
                  </span>
                </div>
                <p className="text-[10px] text-violet-800/80 leading-snug">
                  Łączna liczba sztuk komponentów potrzebnych do skompletowania
                  jednego gotowego egzemplarza. Używana do śledzenia postępu
                  kompletacji w karcie produktu.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// ─── Wrapper: Display (do zakładki) + Edit Modal ─────────────────────

export function BasicInfoFormDisplay({
  productId,
  initialValues,
  categories,
  categoryDutyAuto,
}: {
  productId: string;
  initialValues: BasicInfoFormValues;
  categories: CategoryTreeNode[];
  categoryDutyAuto: number | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <div className="space-y-3">
      <BasicInfoFields
        values={initialValues}
        update={() => undefined}
        disabled={true}
        categories={categories}
        categoryDutyAuto={categoryDutyAuto}
        codePending={false}
        onGenerateCode128={() => undefined}
      />
      <div className="flex justify-end pt-2">
        <Button onClick={() => setEditOpen(true)} className="gap-1.5">
          <Pencil className="size-3.5" />
          Edytuj
        </Button>
      </div>

      <BasicInfoEditModal
        open={editOpen}
        onOpenChange={setEditOpen}
        productId={productId}
        initialValues={initialValues}
        categories={categories}
        categoryDutyAuto={categoryDutyAuto}
      />
    </div>
  );
}

function BasicInfoEditModal({
  open,
  onOpenChange,
  productId,
  initialValues,
  categories,
  categoryDutyAuto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  initialValues: BasicInfoFormValues;
  categories: CategoryTreeNode[];
  categoryDutyAuto: number | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BasicInfoFormValues>(initialValues);
  const [pending, startTransition] = useTransition();
  const [codePending, startCodeTransition] = useTransition();

  // Reset stanu gdy modal się otwiera (żeby user widział aktualne dane,
  // a nie poprzednie edytowane wartości)
  useEffect(() => {
    if (open) setValues(initialValues);
  }, [open, initialValues]);

  function update<K extends keyof BasicInfoFormValues>(
    k: K,
    v: BasicInfoFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [k]: v }));
  }

  function handleGenerateCode128() {
    if (!values.categoryId) {
      toast.error("Wybierz najpierw kategorię");
      return;
    }
    startCodeTransition(async () => {
      try {
        const result = await generateCode128ForCategoryAction({
          categoryId: values.categoryId,
        });
        update("code128", result.code);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Nie udało się nadać kodu",
        );
      }
    });
  }

  function handleSave() {
    // Walidacja: nazwa + SKU + waga wymagane
    if (!values.name.trim()) {
      toast.error("Podaj nazwę produktu");
      return;
    }
    if (!values.productCode.trim()) {
      toast.error("Podaj kod produktu (SKU)");
      return;
    }
    if (!values.categoryId) {
      toast.error("Wybierz kategorię");
      return;
    }
    const weight = Number(values.weightKg);
    if (!Number.isFinite(weight) || weight <= 0) {
      toast.error("Podaj wagę produktu (>0)");
      return;
    }
    if (values.compositionMode === "KOMPONENTOWY") {
      const reqN = Number(values.requiredComponentsTotal);
      if (!Number.isFinite(reqN) || reqN < 1) {
        toast.error(
          "Podaj liczbę komponentów wymaganą do skompletowania produktu",
        );
        return;
      }
    }

    startTransition(async () => {
      try {
        await updateProductBasicAction(productId, {
          name: values.name.trim(),
          productCode: values.productCode.trim(),
          code128: values.code128.trim() || null,
          eanCode: values.eanCode.trim() || null,
          categoryId: values.categoryId,
          compositionMode: values.compositionMode,
          requiredComponentsTotal:
            values.compositionMode === "KOMPONENTOWY"
              ? Number(values.requiredComponentsTotal)
              : null,
          weightKg: weight,
          customsDutyPct:
            values.customsDutyPct.trim() === ""
              ? null
              : Number(values.customsDutyPct),
        });
        toast.success("Zapisano podstawowe informacje");
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,900px)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Edytuj podstawowe informacje
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Krok 1 z wizarda — nazwa, kod produktu, kategoria, waga i cło. Zmiana
          kategorii dopina automatycznie reguły komponentów i pudełek.
        </p>

        <div className="pt-2">
          <BasicInfoFields
            values={values}
            update={update}
            disabled={false}
            categories={categories}
            categoryDutyAuto={categoryDutyAuto}
            codePending={codePending}
            onGenerateCode128={handleGenerateCode128}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t mt-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="gap-1.5"
          >
            {pending ? "Zapisuję…" : "Zapisz zmiany"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── TypeCard — kafelek typu produktu, działa też w stanie disabled ──

function TypeCard({
  active,
  onClick,
  disabled,
  icon: Icon,
  title,
  description,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  icon: typeof Layers;
  title: string;
  description: string;
  theme: "emerald" | "violet";
}) {
  const themeClasses = {
    emerald: {
      activeRing: "ring-emerald-400 bg-emerald-50",
      activeIcon: "text-emerald-600 bg-emerald-100",
      activeTitle: "text-emerald-900",
    },
    violet: {
      activeRing: "ring-violet-400 bg-violet-50",
      activeIcon: "text-violet-600 bg-violet-100",
      activeTitle: "text-violet-900",
    },
  }[theme];

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg ring-1 text-left transition-all",
        active
          ? cn(themeClasses.activeRing, "ring-2 shadow-md")
          : "ring-slate-200 hover:ring-slate-300 hover:bg-slate-50",
        disabled && "cursor-default opacity-90 hover:bg-transparent",
      )}
    >
      <div
        className={cn(
          "size-10 rounded-md grid place-items-center shrink-0 transition-colors",
          active ? themeClasses.activeIcon : "bg-slate-100 text-slate-500",
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "font-semibold text-sm",
            active && themeClasses.activeTitle,
          )}
        >
          {title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {description}
        </div>
      </div>
      {active && <Check className="size-4 text-emerald-600 shrink-0" />}
    </button>
  );
}
