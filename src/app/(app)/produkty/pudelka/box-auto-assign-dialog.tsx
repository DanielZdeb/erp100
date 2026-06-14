"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Layers, Plus, Trash2, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import {
  createBoxCategoryRuleAction,
  createBoxProductRuleAction,
  deleteBoxCategoryRuleAction,
  deleteBoxProductRuleAction,
} from "@/server/shipping-boxes";

type PurposeT = "SHIPPING" | "FACTORY";

export type CategoryItem = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  _count: { products: number };
};

export type ProductItem = {
  id: string;
  name: string;
  productCode: string;
  categoryId: string | null;
  isComponent: boolean;
};

export type CategoryRule = {
  id: string;
  boxId: string;
  categoryId: string;
  categoryName: string;
  categoryLevel: number;
  purpose: PurposeT;
  unitsPerBox: number;
  isPrimary: boolean;
};

export type ProductRule = {
  id: string;
  boxId: string;
  productId: string;
  productName: string;
  productCode: string;
  purpose: PurposeT;
  unitsPerBox: number;
  isPrimary: boolean;
};

/**
 * Dialog z 3-kolumnowym pickerem kategorii + listą produktów.
 * Pozwala stworzyć regułę dla CAŁEJ kategorii (auto-pin do wszystkich
 * produktów teraz + dla nowo dodawanych) albo dla konkretnego produktu.
 */
export function BoxAutoAssignDialog({
  open,
  onOpenChange,
  box,
  categories,
  products,
  categoryRules,
  productRules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  box: { id: string; name: string; origin?: "POLAND" | "CHINA_STANDARD" } | null;
  categories: CategoryItem[];
  products: ProductItem[];
  categoryRules: CategoryRule[];
  productRules: ProductRule[];
}) {
  // 3-poziomowa nawigacja: Kategoria główna → Podkategoria → Typ produktu
  const [l1Id, setL1Id] = useState<string | null>(null);
  const [l2Id, setL2Id] = useState<string | null>(null);
  const [l3Id, setL3Id] = useState<string | null>(null);

  // Multi-select: zaznaczone do bulk-pinu (niezależne od drill-downu)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    new Set(),
  );

  // Default purpose zależy od pochodzenia pudełka:
  //  - CHINA_STANDARD = produkt przychodzi z Chin w tym pudle → FACTORY
  //  - POLAND (custom) = pudełko wysyłkowe robione lokalnie → SHIPPING
  const defaultPurpose: PurposeT =
    box?.origin === "CHINA_STANDARD" ? "FACTORY" : "SHIPPING";

  // Konfiguracja przypisania
  const [purpose, setPurpose] = useState<PurposeT>(defaultPurpose);
  const [unitsPerBox, setUnitsPerBox] = useState("1");
  const [isPrimary, setIsPrimary] = useState(false);

  // Sync purpose gdy zmienia się box (otwierane dla innego pudełka)
  useEffect(() => {
    setPurpose(defaultPurpose);
  }, [defaultPurpose]);

  const [pending, startTransition] = useTransition();

  // Cumulative product count per kategoria (kategoria + descendants).
  // Bez tego "Szarfy akrobatyczne CN" pokazałyby 0 mimo że subkategorie
  // 6m/7m/8m mają po 13 produktów.
  const cumulativeCount = useMemo(() => {
    // Mapa: parentId → child IDs
    const childrenByParent = new Map<string | null, string[]>();
    for (const c of categories) {
      const arr = childrenByParent.get(c.parentId) ?? [];
      arr.push(c.id);
      childrenByParent.set(c.parentId, arr);
    }
    // _count.products jest "własne" (bezpośrednio przypisane)
    const own = new Map<string, number>();
    for (const c of categories) own.set(c.id, c._count.products);
    // DFS: dla każdej kategorii sumuj własne + suma dzieci (rekurencyjnie)
    const memo = new Map<string, number>();
    function dfs(id: string): number {
      const cached = memo.get(id);
      if (cached != null) return cached;
      let total = own.get(id) ?? 0;
      for (const childId of childrenByParent.get(id) ?? []) {
        total += dfs(childId);
      }
      memo.set(id, total);
      return total;
    }
    for (const c of categories) dfs(c.id);
    return memo;
  }, [categories]);

  // Filtracja kategorii po poziomach
  const level1 = useMemo(
    () => categories.filter((c) => c.level === 1).sort(byName),
    [categories],
  );
  const level2 = useMemo(
    () => (l1Id ? categories.filter((c) => c.parentId === l1Id).sort(byName) : []),
    [categories, l1Id],
  );
  const level3 = useMemo(
    () => (l2Id ? categories.filter((c) => c.parentId === l2Id).sort(byName) : []),
    [categories, l2Id],
  );

  // Cel: ostatnia wybrana kategoria w hierarchii (na dowolnym poziomie)
  const targetCategoryId = l3Id ?? l2Id ?? l1Id;
  const targetCategoryName = useMemo(() => {
    if (!targetCategoryId) return null;
    return categories.find((c) => c.id === targetCategoryId)?.name ?? null;
  }, [categories, targetCategoryId]);

  // Lista produktów do wyświetlenia — z wybranej kategorii i jej potomków
  const filteredProducts = useMemo(() => {
    if (!targetCategoryId) {
      return products
        .filter((p) => !p.isComponent)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    const descendantIds = collectDescendants(categories, targetCategoryId);
    return products
      .filter((p) => p.categoryId && descendantIds.has(p.categoryId))
      .filter((p) => !p.isComponent)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categories, targetCategoryId]);

  // Reguły dla bieżącego pudełka
  const boxCategoryRules = useMemo(
    () => (box ? categoryRules.filter((r) => r.boxId === box.id) : []),
    [box, categoryRules],
  );
  const boxProductRules = useMemo(
    () => (box ? productRules.filter((r) => r.boxId === box.id) : []),
    [box, productRules],
  );

  function reset() {
    setL1Id(null);
    setL2Id(null);
    setL3Id(null);
    setSelectedCategoryIds(new Set());
    setSelectedProductIds(new Set());
    setPurpose(defaultPurpose);
    setUnitsPerBox("1");
    setIsPrimary(false);
  }

  function toggleCategorySelected(id: string) {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleProductSelected(id: string) {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkAssignCategories() {
    if (!box || selectedCategoryIds.size === 0) return;
    const ids = Array.from(selectedCategoryIds);
    startTransition(async () => {
      let ok = 0;
      let failed = 0;
      let totalPinned = 0;
      for (const categoryId of ids) {
        try {
          const res = await createBoxCategoryRuleAction({
            boxId: box.id,
            categoryId,
            purpose,
            unitsPerBox: Number(unitsPerBox) || 1,
            isPrimary,
          });
          ok++;
          totalPinned += res.pinned ?? 0;
        } catch {
          failed++;
        }
      }
      if (ok > 0) {
        toast.success(
          `Przypisano ${ok} ${ok === 1 ? "kategorię" : ok < 5 ? "kategorie" : "kategorii"} (${totalPinned} produktów). ${failed > 0 ? `${failed} pominięto (już istniała reguła).` : ""}`,
        );
      }
      if (ok === 0 && failed > 0) {
        toast.error("Żadnej kategorii nie udało się przypisać.");
      }
      setSelectedCategoryIds(new Set());
    });
  }

  function handleBulkAssignProducts() {
    if (!box || selectedProductIds.size === 0) return;
    const ids = Array.from(selectedProductIds);
    startTransition(async () => {
      let ok = 0;
      let failed = 0;
      for (const productId of ids) {
        try {
          await createBoxProductRuleAction({
            boxId: box.id,
            productId,
            purpose,
            unitsPerBox: Number(unitsPerBox) || 1,
            isPrimary,
          });
          ok++;
        } catch {
          failed++;
        }
      }
      if (ok > 0) {
        toast.success(
          `Przypisano do ${ok} ${ok === 1 ? "produktu" : ok < 5 ? "produktów" : "produktów"}. ${failed > 0 ? `${failed} pominięto.` : ""}`,
        );
      }
      if (ok === 0 && failed > 0) {
        toast.error("Żadnego produktu nie udało się przypisać.");
      }
      setSelectedProductIds(new Set());
    });
  }

  function handleAssignCategory() {
    if (!box || !targetCategoryId) return;
    startTransition(async () => {
      try {
        const res = await createBoxCategoryRuleAction({
          boxId: box.id,
          categoryId: targetCategoryId,
          purpose,
          unitsPerBox: Number(unitsPerBox) || 1,
          isPrimary,
        });
        toast.success(
          res.pinned > 0
            ? `Przypisano do ${res.pinned} produktów + reguła zapisana`
            : "Reguła zapisana (brak nowych produktów do pinowania)",
        );
        reset();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się przypisać");
      }
    });
  }

  function handleAssignProduct(productId: string) {
    if (!box) return;
    startTransition(async () => {
      try {
        await createBoxProductRuleAction({
          boxId: box.id,
          productId,
          purpose,
          unitsPerBox: Number(unitsPerBox) || 1,
          isPrimary,
        });
        toast.success("Pudełko przypisane do produktu");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się przypisać");
      }
    });
  }

  function handleDeleteCategoryRule(ruleId: string) {
    startTransition(async () => {
      try {
        await deleteBoxCategoryRuleAction(ruleId);
        toast.success("Reguła kategorii usunięta");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  function handleDeleteProductRule(ruleId: string) {
    startTransition(async () => {
      try {
        await deleteBoxProductRuleAction(ruleId);
        toast.success("Reguła produktu usunięta");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="!max-w-[1100px] max-h-[90vh] flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-5 text-amber-600" />
            Auto-przypisanie pudełka
            {box && (
              <span className="text-sm font-normal text-muted-foreground">
                · {box.name}
              </span>
            )}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Zamknij"
          >
            <X className="size-5" />
          </button>
        </DialogHeader>

        {/* Pasek konfiguracji pinu */}
        <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Cel pudełka
            </Label>
            <Select
              value={purpose}
              onValueChange={(v) => setPurpose(v as PurposeT)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SHIPPING">Wysyłkowe</SelectItem>
                <SelectItem value="FACTORY">Z Chin (fabryczne)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="unitsPerBox"
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              Sztuk / pudełko
            </Label>
            <Input
              id="unitsPerBox"
              type="number"
              min="1"
              step="1"
              value={unitsPerBox}
              onChange={(e) => setUnitsPerBox(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Primary (domyślne)
            </Label>
            <div className="h-8 flex items-center gap-2">
              <Checkbox
                id="boxRulePrimary"
                checked={isPrimary}
                onCheckedChange={(v) => setIsPrimary(v === true)}
              />
              <label
                htmlFor="boxRulePrimary"
                className="text-[11px] text-muted-foreground cursor-pointer"
              >
                {isPrimary
                  ? "TAK — używane do kalkulacji wysyłki"
                  : "Nie — pomocnicze"}
              </label>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Wybrana kategoria
            </Label>
            <div className="h-8 flex items-center text-[11px]">
              {targetCategoryName ? (
                <span className="font-medium">{targetCategoryName}</span>
              ) : (
                <span className="text-muted-foreground italic">
                  (brak — bulk-pin niedostępny)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Picker 3-kolumnowy + lista produktów */}
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div className="flex-1 min-h-0 flex border rounded-md overflow-hidden divide-x">
            <CategoryColumn
              title="Kategoria główna"
              cats={level1}
              selectedId={l1Id}
              onSelect={(id) => {
                setL1Id(id);
                setL2Id(null);
                setL3Id(null);
              }}
              showAll
              allLabel="Wszystkie produkty"
              onSelectAll={() => {
                setL1Id(null);
                setL2Id(null);
                setL3Id(null);
              }}
              isAllActive={l1Id === null}
              selectedIds={selectedCategoryIds}
              onToggleSelected={toggleCategorySelected}
              countFn={(id) => cumulativeCount.get(id) ?? 0}
            />
            <CategoryColumn
              title="Podkategoria"
              cats={level2}
              selectedId={l2Id}
              onSelect={(id) => {
                setL2Id(id);
                setL3Id(null);
              }}
              emptyLabel={l1Id ? "Brak podkategorii" : "Wybierz kategorię"}
              selectedIds={selectedCategoryIds}
              onToggleSelected={toggleCategorySelected}
              countFn={(id) => cumulativeCount.get(id) ?? 0}
            />
            <CategoryColumn
              title="Typ produktu"
              cats={level3}
              selectedId={l3Id}
              onSelect={setL3Id}
              emptyLabel={l2Id ? "Brak typów" : "Wybierz podkategorię"}
              selectedIds={selectedCategoryIds}
              onToggleSelected={toggleCategorySelected}
              countFn={(id) => cumulativeCount.get(id) ?? 0}
            />
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Produkty ({filteredProducts.length})
                </span>
                <div className="flex items-center gap-2">
                  {filteredProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const allInView = new Set(filteredProducts.map((p) => p.id));
                        const allSelected = filteredProducts.every((p) =>
                          selectedProductIds.has(p.id),
                        );
                        setSelectedProductIds((prev) => {
                          const next = new Set(prev);
                          if (allSelected) {
                            for (const id of allInView) next.delete(id);
                          } else {
                            for (const id of allInView) next.add(id);
                          }
                          return next;
                        });
                      }}
                      className="text-[10px] text-muted-foreground hover:underline"
                    >
                      {filteredProducts.every((p) =>
                        selectedProductIds.has(p.id),
                      )
                        ? "Odznacz wszystkie"
                        : "Zaznacz wszystkie"}
                    </button>
                  )}
                </div>
              </div>
              <ul className="flex-1 overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <li className="p-6 text-xs text-muted-foreground text-center italic">
                    Brak produktów w wybranej kategorii.
                  </li>
                ) : (
                  filteredProducts.map((p) => {
                    const pinned = boxProductRules.some(
                      (r) => r.productId === p.id,
                    );
                    const checked = selectedProductIds.has(p.id);
                    return (
                      <li
                        key={p.id}
                        className={cn(
                          "border-b last:border-b-0 px-3 py-2 flex items-center gap-2 transition-colors",
                          checked
                            ? "bg-amber-50/40 hover:bg-amber-50/60"
                            : "hover:bg-muted/30",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleProductSelected(p.id)}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {p.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            {p.productCode}
                          </div>
                        </div>
                        {pinned && (
                          <span
                            className="text-[9px] uppercase tracking-wide px-1.5 py-0 rounded bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 shrink-0"
                            title="Już przypisane"
                          >
                            ✓
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant={pinned ? "secondary" : "outline"}
                          onClick={() => handleAssignProduct(p.id)}
                          disabled={pending}
                          className="h-7 gap-1 shrink-0"
                        >
                          <Plus className="size-3" />
                          {pinned ? "Aktualizuj" : "Tylko ten"}
                        </Button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>

          {/* Bottom bar: bulk-pin selections */}
          {(selectedCategoryIds.size > 0 || selectedProductIds.size > 0) && (
            <div className="rounded-md border bg-amber-50/70 ring-1 ring-amber-200 p-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-xs text-amber-900">
                <strong className="tabular-nums">
                  {selectedCategoryIds.size}
                </strong>{" "}
                {selectedCategoryIds.size === 1 ? "kategoria" : "kategorii"} ·{" "}
                <strong className="tabular-nums">
                  {selectedProductIds.size}
                </strong>{" "}
                {selectedProductIds.size === 1 ? "produkt" : "produktów"}{" "}
                zaznaczonych do przypisania
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelectedCategoryIds(new Set());
                    setSelectedProductIds(new Set());
                  }}
                  disabled={pending}
                  className="h-7"
                >
                  Wyczyść
                </Button>
                {selectedCategoryIds.size > 0 && (
                  <Button
                    size="sm"
                    onClick={handleBulkAssignCategories}
                    disabled={pending}
                    className="h-7 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    <Plus className="size-3" />
                    Przypisz {selectedCategoryIds.size}{" "}
                    {selectedCategoryIds.size === 1 ? "kat." : "kat."}
                  </Button>
                )}
                {selectedProductIds.size > 0 && (
                  <Button
                    size="sm"
                    onClick={handleBulkAssignProducts}
                    disabled={pending}
                    className="h-7 gap-1.5 bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    <Plus className="size-3" />
                    Przypisz {selectedProductIds.size} prod.
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Istniejące reguły */}
          {(boxCategoryRules.length > 0 || boxProductRules.length > 0) && (
            <div className="rounded-md border bg-emerald-50/30 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                Aktywne reguły auto-przypisania
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {boxCategoryRules.map((r) => (
                  <RuleBadge
                    key={r.id}
                    kind="category"
                    name={r.categoryName}
                    level={r.categoryLevel}
                    purpose={r.purpose}
                    unitsPerBox={r.unitsPerBox}
                    isPrimary={r.isPrimary}
                    onDelete={() => handleDeleteCategoryRule(r.id)}
                    disabled={pending}
                  />
                ))}
                {boxProductRules.map((r) => (
                  <RuleBadge
                    key={r.id}
                    kind="product"
                    name={r.productName}
                    code={r.productCode}
                    purpose={r.purpose}
                    unitsPerBox={r.unitsPerBox}
                    isPrimary={r.isPrimary}
                    onDelete={() => handleDeleteProductRule(r.id)}
                    disabled={pending}
                  />
                ))}
              </div>
              <p className="text-[10px] text-emerald-900/70 italic">
                Usunięcie reguły nie cofa już istniejących pinów — zostają jako
                niezależne. Odepnij je manualnie na karcie produktu jeśli chcesz.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-komponenty ──────────────────────────────────────────────────

function CategoryColumn({
  title,
  cats,
  selectedId,
  onSelect,
  emptyLabel,
  showAll,
  allLabel,
  onSelectAll,
  isAllActive,
  selectedIds,
  onToggleSelected,
  countFn,
}: {
  title: string;
  cats: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyLabel?: string;
  showAll?: boolean;
  allLabel?: string;
  onSelectAll?: () => void;
  isAllActive?: boolean;
  /** Zbiór ID kategorii zaznaczonych do bulk-pinu (multi-select). */
  selectedIds?: Set<string>;
  /** Toggle zaznaczenia checkboxa (multi-select bez aktywacji navigacji). */
  onToggleSelected?: (id: string) => void;
  /** Funkcja zwracająca cumulative count dla kategorii (uwzględnia descendants). */
  countFn?: (id: string) => number;
}) {
  return (
    <div className="w-[220px] min-w-[220px] flex flex-col">
      <div className="px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {showAll && (
          <li>
            <button
              type="button"
              onClick={onSelectAll}
              className={cn(
                "w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors border-b",
                isAllActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted/40",
              )}
            >
              <span>{allLabel ?? "Wszystkie"}</span>
            </button>
          </li>
        )}
        {cats.length === 0 ? (
          <li className="px-3 py-6 text-xs text-muted-foreground text-center italic">
            {emptyLabel ?? "—"}
          </li>
        ) : (
          cats.map((c) => {
            const isActive = selectedId === c.id;
            const isChecked = selectedIds?.has(c.id) ?? false;
            const count = countFn ? countFn(c.id) : c._count.products;
            return (
              <li
                key={c.id}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 transition-colors",
                  isActive
                    ? "bg-primary/10"
                    : isChecked
                      ? "bg-amber-50/40"
                      : "hover:bg-muted/40",
                )}
              >
                {onToggleSelected && (
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => onToggleSelected(c.id)}
                    className="shrink-0"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex-1 text-left flex items-center justify-between gap-1 px-1 py-1 text-sm rounded transition-colors min-w-0",
                    isActive
                      ? "text-primary font-medium"
                      : isChecked
                        ? "text-amber-900 font-medium"
                        : "",
                  )}
                >
                  <span className="flex-1 min-w-0 truncate">{c.name}</span>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums rounded-full px-1.5 py-0 ring-1 shrink-0",
                      isActive
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : isChecked
                          ? "bg-amber-100 text-amber-800 ring-amber-200"
                          : "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    {count}
                  </span>
                  {isActive && (
                    <span className="text-primary text-xs">›</span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

function RuleBadge({
  kind,
  name,
  code,
  level,
  purpose,
  unitsPerBox,
  isPrimary,
  onDelete,
  disabled,
}: {
  kind: "category" | "product";
  name: string;
  code?: string;
  level?: number;
  purpose: PurposeT;
  unitsPerBox: number;
  isPrimary: boolean;
  onDelete: () => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 flex items-center gap-2">
      <span
        className={cn(
          "text-[9px] uppercase tracking-wide rounded-full px-1.5 py-0 ring-1 shrink-0",
          kind === "category"
            ? "bg-violet-50 text-violet-800 ring-violet-200"
            : "bg-sky-50 text-sky-800 ring-sky-200",
        )}
      >
        {kind === "category"
          ? level === 1
            ? "Główna"
            : level === 2
              ? "Podkat."
              : "Typ"
          : "Produkt"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{name}</div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {purpose === "SHIPPING" ? "Wysyłkowe" : "Z Chin"} · {unitsPerBox} szt./box
          {isPrimary ? " · primary" : ""}
          {code ? ` · ${code}` : ""}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        className="size-6 rounded grid place-items-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
        title="Usuń regułę"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}

/**
 * Zwraca Set z ID kategorii: rootId + wszystkie potomków rekurencyjnie.
 * Bazuje na pełnej liście kategorii — bez I/O.
 */
function collectDescendants(
  categories: CategoryItem[],
  rootId: string,
): Set<string> {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const c of categories) {
      if (c.parentId && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id);
        added = true;
      }
    }
  }
  return result;
}
