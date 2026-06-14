"use client";

/**
 * Panel rozbicia wariantów dla linii bundla (compositionMode=KOMPONENTOWY).
 *
 * Pokazuje per slot:
 *  - tytuł slotu (nazwa komponentu × slot.quantity per bundle)
 *  - lista wariantów ze splitami (units edytowalne, X usuwa)
 *  - przycisk "+ wariant" dodaje kolejny wariant z puli (kategoria komponentu)
 *  - walidator sumy (musi == bundleQuantity)
 *  - Zapisz/Reset
 *
 * Pula wariantów = produkty z tej samej kategorii co domyślny komponent slotu.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Layers, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  clearOrderItemVariantSplitsAction,
  setOrderItemVariantSplitsAction,
} from "@/server/order-items";

export interface BundleSlot {
  id: string;
  componentId: string;
  quantity: number;
  /** Multi-pool: explicit kategorie + explicit produkty. Puste = fallback. */
  poolCategoryIds: string[];
  poolCategoryNames: string[];
  poolProductIds: string[];
  /** Czy slot dopuszcza warianty. */
  allowVariants: boolean;
  component: {
    id: string;
    name: string;
    productCode: string;
    categoryId: string | null;
    categoryName: string | null;
    cbmPerUnit: number | null;
  };
}

/** Liczy listę ID kategorii (rootIds + descendants) po drzewku flat. */
export function collectDescendantIds(
  rootIds: string[],
  categories: { id: string; parentId: string | null }[],
): string[] {
  if (rootIds.length === 0) return [];
  const all: string[] = [];
  let frontier = rootIds.slice();
  const safety = 5;
  let depth = 0;
  while (frontier.length > 0 && depth < safety) {
    all.push(...frontier);
    const children = categories.filter(
      (c) => c.parentId != null && frontier.includes(c.parentId),
    );
    frontier = children.map((c) => c.id);
    depth++;
  }
  return all;
}

export interface ExistingSplit {
  id: string;
  productComponentId: string;
  variantProductId: string;
  units: number;
  variantProduct: {
    id: string;
    name: string;
    productCode: string;
    categoryId: string | null;
    cbmPerUnit: number | null;
  };
}

export interface VariantPoolEntry {
  id: string;
  name: string;
  productCode: string;
  categoryId: string | null;
}

interface DraftRow {
  variantProductId: string;
  units: number;
}

export function BundleVariantPanel({
  orderItemId,
  bundleQuantity,
  slots,
  splits,
  variantPool,
  categoryTree,
}: {
  orderItemId: string;
  bundleQuantity: number;
  slots: BundleSlot[];
  splits: ExistingSplit[];
  /** Wszystkie produkty (z categoryId) — filtrujemy per slot do puli. */
  variantPool: VariantPoolEntry[];
  /** Drzewo kategorii do resolwowania puli (z descendants). */
  categoryTree: { id: string; parentId: string | null }[];
}) {
  return (
    <div className="rounded-lg ring-1 ring-violet-200 bg-violet-50/30 p-3 space-y-3">
      <div className="text-[11px] font-semibold text-violet-900 uppercase tracking-wide">
        W zestawie ({slots.length} {slots.length === 1 ? "slot" : "sloty"}) ·
        bundle × {bundleQuantity} szt
      </div>
      <div className="space-y-2">
        {slots.map((slot) => {
          const slotSplits = splits.filter(
            (s) => s.productComponentId === slot.id,
          );
          // Pool resolved: jeśli explicitne kategorie/produkty są ustawione,
          // łączymy. Inaczej fallback do kategorii domyślnego komponentu.
          let categoryRoots = slot.poolCategoryIds.slice();
          if (
            categoryRoots.length === 0 &&
            slot.poolProductIds.length === 0 &&
            slot.component.categoryId
          ) {
            categoryRoots.push(slot.component.categoryId);
          }
          const descendantCats = collectDescendantIds(
            categoryRoots,
            categoryTree,
          );
          const pool = slot.allowVariants
            ? variantPool.filter(
                (p) =>
                  (p.categoryId != null &&
                    descendantCats.includes(p.categoryId)) ||
                  slot.poolProductIds.includes(p.id),
              )
            : [];
          return (
            <SlotEditor
              key={slot.id}
              orderItemId={orderItemId}
              bundleQuantity={bundleQuantity}
              slot={slot}
              existingSplits={slotSplits}
              pool={pool}
            />
          );
        })}
      </div>
    </div>
  );
}

function SlotEditor({
  orderItemId,
  bundleQuantity,
  slot,
  existingSplits,
  pool,
}: {
  orderItemId: string;
  bundleQuantity: number;
  slot: BundleSlot;
  existingSplits: ExistingSplit[];
  pool: VariantPoolEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(existingSplits.length > 0);

  // Konwersja existingSplits → DraftRow[]; gdy puste, domyślny wariant ze
  // wszystkimi sztukami (full bundle qty).
  const initialDraft: DraftRow[] = existingSplits.length > 0
    ? existingSplits.map((s) => ({
        variantProductId: s.variantProductId,
        units: s.units,
      }))
    : [{ variantProductId: slot.componentId, units: bundleQuantity }];

  const [draft, setDraft] = useState<DraftRow[]>(initialDraft);

  // Re-syncuj draft gdy zmienia się qty bundla lub serwer przeładuje splity
  useEffect(() => {
    setDraft(initialDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSplits.map((s) => s.id).join(","), bundleQuantity]);

  const draftTotal = draft.reduce((s, r) => s + (r.units || 0), 0);
  const isValid = draftTotal === bundleQuantity && draft.length > 0;
  const isDirty =
    draft.length !== existingSplits.length ||
    draft.some((d, i) => {
      const ex = existingSplits[i];
      return (
        !ex ||
        ex.variantProductId !== d.variantProductId ||
        ex.units !== d.units
      );
    });

  const usedVariantIds = new Set(draft.map((d) => d.variantProductId));
  const candidates = pool.filter((p) => !usedVariantIds.has(p.id));

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setDraft((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  }
  function removeRow(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }
  function addRow() {
    const next = candidates[0];
    if (!next) {
      toast.info("Brak więcej wariantów w tej kategorii");
      return;
    }
    // Domyślnie: weź pozostałe sztuki do max'a (bundleQty - sum innych)
    const otherUnits = draft.reduce((s, r) => s + (r.units || 0), 0);
    const remaining = Math.max(1, bundleQuantity - otherUnits);
    setDraft((prev) => [
      ...prev,
      { variantProductId: next.id, units: remaining },
    ]);
  }

  function save() {
    if (!isValid) {
      toast.error(
        `Suma musi być = ${bundleQuantity} szt (jest ${draftTotal}).`,
      );
      return;
    }
    startTransition(async () => {
      try {
        await setOrderItemVariantSplitsAction(orderItemId, {
          productComponentId: slot.id,
          splits: draft,
        });
        toast.success("Zapisano warianty");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  function resetToDefault() {
    startTransition(async () => {
      try {
        await clearOrderItemVariantSplitsAction(orderItemId, slot.id);
        toast.success("Reset do domyślu");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  // Header kompaktowy z chevronem
  const summaryLabel = (() => {
    if (existingSplits.length === 0) {
      return `${bundleQuantity} × ${slot.component.name} (domyślny)`;
    }
    return existingSplits
      .map((s) => `${s.units} × ${s.variantProduct.name}`)
      .join(" · ");
  })();

  // Pool chip — co user widzi jako pulę dla tego slotu
  const sourcesLabel = (() => {
    if (!slot.allowVariants) return "Tylko ten produkt";
    const parts: string[] = [];
    if (slot.poolCategoryNames.length > 0) {
      parts.push(
        `${slot.poolCategoryNames.length} ${slot.poolCategoryNames.length === 1 ? "kat." : "kat."}`,
      );
    }
    if (slot.poolProductIds.length > 0) {
      parts.push(`${slot.poolProductIds.length} prod.`);
    }
    if (parts.length === 0 && slot.component.categoryName) {
      parts.push(`Auto: ${slot.component.categoryName}`);
    }
    return `${parts.join(" + ")} · ${pool.length} ${pool.length === 1 ? "wariant" : "wariantów"}`;
  })();
  const poolChip = !slot.allowVariants
    ? { label: "Tylko ten produkt", tone: "bg-slate-100 text-slate-700 ring-slate-200" }
    : {
        label: sourcesLabel,
        tone:
          pool.length > 1
            ? "bg-violet-100 text-violet-800 ring-violet-200"
            : pool.length === 1
              ? "bg-amber-100 text-amber-800 ring-amber-200"
              : "bg-rose-100 text-rose-800 ring-rose-200",
      };

  return (
    <div className="rounded-md ring-1 ring-white bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50/60 rounded-md"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ChevronRight
            className={cn(
              "size-3.5 text-slate-400 transition-transform shrink-0",
              open && "rotate-90",
            )}
          />
          <span className="text-[11px] font-semibold text-slate-700 truncate">
            Slot: <span className="text-violet-700">{slot.component.name}</span>{" "}
            <span className="text-slate-400 font-normal">
              × {slot.quantity} / bundle
            </span>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ring-1 shrink-0",
              poolChip.tone,
            )}
          >
            <Layers className="size-2.5" />
            {poolChip.label}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground truncate min-w-0 max-w-[30%]">
          {summaryLabel}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-slate-100">
          {!slot.allowVariants ? (
            <div className="text-[11px] italic text-muted-foreground py-2">
              Slot oznaczony jako „Tylko ten produkt" — warianty wyłączone.
              Wszystkie sztuki bundla używają domyślnego komponentu.
            </div>
          ) : pool.length === 0 ? (
            <div className="text-[11px] italic text-muted-foreground py-2">
              Brak wariantów w puli — domyślny komponent jest jedyną opcją.
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                {draft.map((row, idx) => {
                  const isDefault = row.variantProductId === slot.componentId;
                  // candidates do tego rządu = pool minus użyte przez INNE rządy
                  const otherUsed = new Set(
                    draft
                      .filter((_, i) => i !== idx)
                      .map((r) => r.variantProductId),
                  );
                  const rowCandidates = pool.filter(
                    (p) => !otherUsed.has(p.id),
                  );
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded ring-1 ring-slate-200 bg-white px-2 py-1.5"
                    >
                      <Select
                        value={row.variantProductId}
                        onValueChange={(v) =>
                          updateRow(idx, { variantProductId: v ?? "" })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Wybierz wariant…" />
                        </SelectTrigger>
                        <SelectContent>
                          {rowCandidates.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                              {p.id === slot.componentId && " (domyślny)"}
                              <span className="text-muted-foreground text-[10px] ml-1">
                                {p.productCode}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="relative w-24">
                        <Input
                          type="number"
                          min={1}
                          value={row.units}
                          onChange={(e) =>
                            updateRow(idx, {
                              units: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="h-7 text-xs font-mono pr-8 text-right"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground pointer-events-none">
                          szt
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        disabled={draft.length === 1}
                        className={cn(
                          "size-6 grid place-items-center rounded text-rose-600 hover:bg-rose-100",
                          draft.length === 1 && "opacity-30 cursor-not-allowed",
                        )}
                        title="Usuń wariant"
                      >
                        <Trash2 className="size-3" />
                      </button>
                      {isDefault && (
                        <span className="text-[9px] uppercase tracking-wide text-violet-600 font-semibold">
                          dom.
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {candidates.length > 0 && (
                <button
                  type="button"
                  onClick={addRow}
                  className="text-[11px] text-violet-700 hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="size-3" /> Dodaj wariant
                </button>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <div className="text-[11px]">
                  Suma:{" "}
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      isValid ? "text-emerald-700" : "text-rose-700",
                    )}
                  >
                    {draftTotal}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}/ {bundleQuantity} szt bundla
                  </span>
                  {!isValid && (
                    <span className="ml-2 text-[10px] text-rose-700 italic">
                      ⚠ musi być równe
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {existingSplits.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetToDefault}
                      disabled={pending}
                      className="h-7 text-[11px] gap-1"
                    >
                      <RotateCcw className="size-3" />
                      Reset
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={save}
                    disabled={pending || !isValid || !isDirty}
                    className="h-7 text-[11px] gap-1 bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    <Save className="size-3" />
                    {pending ? "Zapisuję…" : "Zapisz"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
