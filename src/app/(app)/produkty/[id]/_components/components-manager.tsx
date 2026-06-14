"use client";

/**
 * ComponentsManager — zarządzanie komponentami produktu z UI 1:1 z krokiem 4
 * wizarda nowego produktu (KOMPONENTOWY).
 *
 * Różnica vs Step4ProductComponents w wizardzie: tu stan komponentów żyje w DB
 * (każdy add/remove/qty leci natychmiast do server action), nie w formie wizarda.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Component,
  Layers,
  Package,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { CategoryTreeNode } from "../../category-tree-select";
import {
  collectDescendantsClient,
  resolvePoolClient,
  VariantPoolModal,
} from "../../_components/variant-pool-modal";
import { LibraryDrillPicker } from "../../_components/library-drill-picker";
import {
  addProductComponentAction,
  removeProductComponentAction,
  setComponentSlotPoolAction,
  updateProductComponentAction,
} from "@/server/product-components";

type PinnedComponent = {
  /** Id wpisu ProductComponent (link). */
  linkId: string;
  componentId: string;
  name: string;
  productCode: string;
  isComponent: boolean;
  primaryImageUrl: string | null;
  quantity: number;
  /** Multi-pool wariantów: zestaw kategorii + zestaw konkretnych produktów. */
  poolCategoryIds: string[];
  poolCategoryNames: string[];
  poolProductIds: string[];
  /** Kategoria default komponentu (fallback gdy pool puste). */
  defaultComponentCategoryId: string | null;
  defaultComponentCategoryName: string | null;
  /** Czy slot dopuszcza warianty. */
  allowVariants: boolean;
};

type LibraryEntry = {
  id: string;
  name: string;
  productCode: string;
  code128: string | null;
  categoryId: string | null;
  isComponent: boolean;
  primaryImageUrl: string | null;
};

type ComponentRule = {
  componentId: string;
  categoryId: string;
  quantity: number;
};

export function ComponentsManager({
  productId,
  productCategoryId,
  requiredComponentsTotal,
  pinnedComponents,
  library,
  componentRules,
  /** Ancestor categories of product's category — do dziedziczenia reguł kategorii. */
  categoryAncestors,
  /** Drzewo kategorii (flat) — do pickera puli wariantów. */
  categoryTree,
}: {
  productId: string;
  productCategoryId: string | null;
  requiredComponentsTotal: number | null;
  pinnedComponents: PinnedComponent[];
  library: LibraryEntry[];
  componentRules: ComponentRule[];
  categoryAncestors: string[];
  categoryTree: CategoryTreeNode[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const pinnedIds = new Set(pinnedComponents.map((c) => c.componentId));
  const ancestorSet = new Set(categoryAncestors);

  // Sugerowane komponenty — reguły kategorii pasujące do produktu
  const suggested: { component: LibraryEntry; quantity: number }[] = [];
  if (productCategoryId) {
    const seen = new Set<string>();
    for (const rule of componentRules) {
      if (!ancestorSet.has(rule.categoryId)) continue;
      if (seen.has(rule.componentId)) continue;
      const cmp = library.find((c) => c.id === rule.componentId);
      if (!cmp) continue;
      seen.add(rule.componentId);
      suggested.push({ component: cmp, quantity: rule.quantity });
    }
  }

  const totalQty = pinnedComponents.reduce((s, c) => s + c.quantity, 0);
  const required = requiredComponentsTotal ?? 0;
  const isComplete = required > 0 && totalQty === required;

  function handleAdd(componentId: string, quantity: number) {
    if (pinnedIds.has(componentId)) {
      toast.info("Komponent już dodany — zmień ilość w liście poniżej");
      return;
    }
    startTransition(async () => {
      try {
        await addProductComponentAction(productId, {
          componentId,
          quantity: Math.max(1, quantity),
        });
        toast.success("Dodano komponent");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się dodać");
      }
    });
  }

  function handleRemove(linkId: string) {
    if (!confirm("Usunąć ten komponent z produktu?")) return;
    startTransition(async () => {
      try {
        await removeProductComponentAction(linkId);
        toast.success("Usunięto");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function handleUpdateQty(linkId: string, qty: number) {
    if (qty < 1) return;
    startTransition(async () => {
      try {
        await updateProductComponentAction(linkId, { quantity: qty });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Pasek postępu */}
      <div
        className={cn(
          "rounded-lg ring-1 p-3 transition-colors",
          isComplete
            ? "ring-emerald-300 bg-emerald-50/60"
            : "ring-violet-200 bg-violet-50/40",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <strong>
              Dodaj komponenty żeby skompletować {required || "?"} szt
            </strong>{" "}
            wymaganych dla 1 egzemplarza produktu.
          </div>
          <div
            className={cn(
              "text-lg font-bold tabular-nums shrink-0",
              isComplete ? "text-emerald-700" : "text-violet-700",
            )}
          >
            {totalQty}/{required || "?"}
            {isComplete && <Check className="size-5 inline-block ml-1" />}
          </div>
        </div>
        {required > 0 && (
          <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden ring-1 ring-slate-200">
            <div
              className={cn(
                "h-full transition-all",
                isComplete
                  ? "bg-emerald-500"
                  : totalQty > required
                    ? "bg-orange-500"
                    : "bg-violet-500",
              )}
              style={{
                width: `${Math.min(100, (totalQty / required) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Sugerowane komponenty (z reguł kategorii) */}
      {suggested.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide font-bold text-slate-600">
            <Sparkles className="size-3.5 text-amber-500" />
            Sugerowane (z reguł kategorii)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggested.map(({ component, quantity }) => {
              const isAdded = pinnedIds.has(component.id);
              return (
                <button
                  key={component.id}
                  type="button"
                  onClick={() =>
                    !isAdded && handleAdd(component.id, quantity)
                  }
                  disabled={isAdded || pending}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs ring-1 transition-colors",
                    isAdded
                      ? "bg-emerald-100 text-emerald-700 ring-emerald-200 cursor-default"
                      : "bg-white text-slate-700 ring-slate-300 hover:bg-amber-50 hover:ring-amber-300 cursor-pointer",
                  )}
                >
                  {isAdded ? (
                    <Check className="size-3" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  <span className="font-medium">{component.name}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    ×{quantity}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista dodanych komponentów */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs uppercase tracking-wide font-bold text-slate-600">
            Dodane komponenty ({pinnedComponents.length})
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              <span className="text-xs">
                Z biblioteki (komponenty + produkty)
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
            >
              <Sparkles className="size-3.5" />
              <span className="text-xs">Utwórz nowy komponent</span>
            </Button>
          </div>
        </div>

        {pinnedComponents.length === 0 ? (
          <div className="text-center text-xs text-slate-500 italic p-6 ring-1 ring-dashed ring-slate-200 rounded-md">
            Brak komponentów. Dodaj z sugerowanych ↑ lub kliknij „Z biblioteki"
            / „Utwórz nowy".
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {pinnedComponents.map((pc) => (
              <div
                key={pc.linkId}
                className={cn(
                  "relative rounded-lg ring-1 transition-shadow hover:shadow-md bg-white overflow-hidden",
                  pc.isComponent ? "ring-violet-200" : "ring-indigo-200",
                )}
              >
                {/* Górny pasek z typem */}
                <div
                  className={cn(
                    "absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] uppercase font-bold tracking-wide ring-1",
                    pc.isComponent
                      ? "bg-violet-100 text-violet-800 ring-violet-200"
                      : "bg-indigo-100 text-indigo-800 ring-indigo-200",
                  )}
                >
                  {pc.isComponent ? (
                    <Component className="size-2.5" />
                  ) : (
                    <Package className="size-2.5" />
                  )}
                  {pc.isComponent ? "Komp." : "Prod."}
                </div>

                {/* Przycisk usuń */}
                <button
                  type="button"
                  onClick={() => handleRemove(pc.linkId)}
                  disabled={pending}
                  className="absolute top-1 right-1 z-10 size-6 grid place-items-center rounded bg-white/80 hover:bg-red-100 text-red-600 ring-1 ring-slate-200 disabled:opacity-50"
                  title="Usuń"
                >
                  <Trash2 className="size-3" />
                </button>

                {/* Grafika lub placeholder */}
                <div
                  className={cn(
                    "aspect-square w-full grid place-items-center overflow-hidden",
                    pc.isComponent
                      ? "bg-gradient-to-br from-violet-50 to-violet-100/60"
                      : "bg-gradient-to-br from-indigo-50 to-indigo-100/60",
                  )}
                >
                  {pc.primaryImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pc.primaryImageUrl}
                      alt={pc.name}
                      className="w-full h-full object-cover"
                    />
                  ) : pc.isComponent ? (
                    <Component className="size-12 text-violet-300" />
                  ) : (
                    <Package className="size-12 text-indigo-300" />
                  )}
                </div>

                {/* Info */}
                <div className="p-2 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2 min-h-[2.2em]">
                    {pc.name}
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 truncate">
                    {pc.productCode}
                  </div>
                  {/* Pool wariantów — chip + edit */}
                  <SlotPoolChip
                    slot={pc}
                    library={library}
                    categoryTree={categoryTree}
                  />
                  <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                      Sztuk:
                    </span>
                    <Input
                      type="number"
                      min={1}
                      defaultValue={pc.quantity}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== pc.quantity) {
                          handleUpdateQty(pc.linkId, Math.max(1, v));
                        }
                      }}
                      className="h-7 flex-1 text-center font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modale */}
      <LibraryDrillPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Wybierz z biblioteki (komponent lub produkt)"
        items={library}
        excludedIds={pinnedIds}
        categoryTree={categoryTree}
        onPick={(c) => {
          handleAdd(c.id, 1);
          setPickerOpen(false);
        }}
      />

      <CreateComponentInfoModal
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}

// ─── "Utwórz nowy komponent" → kierujemy do strony produktów z trybem komponent

function CreateComponentInfoModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,480px)]">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-violet-600" />
            Utwórz nowy komponent
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Komponent to osobny produkt w katalogu (z własnym SKU / CODE 128). Po
          utworzeniu wróć tutaj i wybierz go z „Z biblioteki".
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <a
            href="/produkty?nowy=komponent"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
          >
            Otwórz wizard komponentu →
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pool wariantów: chip + edit modal (multi-select) ─────────────────

function SlotPoolChip({
  slot,
  library,
  categoryTree,
}: {
  slot: PinnedComponent;
  library: LibraryEntry[];
  categoryTree: CategoryTreeNode[];
}) {
  const [open, setOpen] = useState(false);

  const pool = resolvePoolClient({
    allowVariants: slot.allowVariants,
    poolCategoryIds: slot.poolCategoryIds,
    poolProductIds: slot.poolProductIds,
    componentId: slot.componentId,
    defaultCategoryId: slot.defaultComponentCategoryId,
    library,
    categoryTree,
  });
  const variantCount = pool.size;

  const sourcesLabel = (() => {
    if (!slot.allowVariants) return "Tylko ten produkt";
    const parts: string[] = [];
    if (slot.poolCategoryIds.length > 0) {
      parts.push(
        `${slot.poolCategoryIds.length} ${slot.poolCategoryIds.length === 1 ? "kat." : "kat."}`,
      );
    }
    if (slot.poolProductIds.length > 0) {
      parts.push(
        `${slot.poolProductIds.length} prod.`,
      );
    }
    if (parts.length === 0 && slot.defaultComponentCategoryName) {
      parts.push(`Auto: ${slot.defaultComponentCategoryName}`);
    }
    return `${parts.join(" + ")} · ${variantCount} ${variantCount === 1 ? "wariant" : "wariantów"}`;
  })();

  const tone = !slot.allowVariants
    ? "bg-slate-100 text-slate-700 ring-slate-200"
    : variantCount > 1
      ? "bg-violet-100 text-violet-800 ring-violet-200"
      : "bg-amber-100 text-amber-800 ring-amber-200";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ring-1 max-w-full w-full hover:brightness-95 transition-all",
          tone,
        )}
        title="Konfiguruj pulę wariantów"
      >
        <Layers className="size-2.5 shrink-0" />
        <span className="truncate flex-1 text-left">{sourcesLabel}</span>
        <Settings2 className="size-2.5 shrink-0 opacity-70" />
      </button>

      <SlotPoolModalServerWrapper
        open={open}
        onOpenChange={setOpen}
        slot={slot}
        categoryTree={categoryTree}
        library={library}
      />
    </>
  );
}

function SlotPoolModalServerWrapper({
  open,
  onOpenChange,
  slot,
  categoryTree,
  library,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: PinnedComponent;
  categoryTree: CategoryTreeNode[];
  library: LibraryEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <VariantPoolModal
      open={open}
      onOpenChange={onOpenChange}
      slotName={slot.name}
      componentId={slot.componentId}
      defaultCategoryId={slot.defaultComponentCategoryId}
      initialValue={{
        allowVariants: slot.allowVariants,
        poolCategoryIds: slot.poolCategoryIds,
        poolProductIds: slot.poolProductIds,
      }}
      categoryTree={categoryTree}
      library={library.map((p) => ({
        id: p.id,
        name: p.name,
        productCode: p.productCode,
        code128: p.code128,
        categoryId: p.categoryId,
      }))}
      pending={pending}
      onSave={(value) => {
        startTransition(async () => {
          try {
            await setComponentSlotPoolAction(slot.linkId, value);
            toast.success("Zapisano pulę wariantów");
            onOpenChange(false);
            router.refresh();
          } catch (e) {
            toast.error(
              e instanceof Error ? e.message : "Nie udało się zapisać",
            );
          }
        });
      }}
    />
  );
}

