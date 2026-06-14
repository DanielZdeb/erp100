"use client";

/**
 * Modal "Wybierz z biblioteki" — picker komponentów/produktów w stylu drill-down
 * (4 kolumny: Kategoria główna → Podkategoria → Typ → Produkty).
 *
 * Dwa tryby pracy:
 *  - **Single-select**: klik wiersza produktu → `onPick(item)` (caller zwykle zamyka).
 *    Używany w wizardzie Step 4 (Komponenty) i ComponentsManager.
 *  - **Multi-select**: checkbox per wiersz, przycisk "Dodaj zaznaczone" na dole →
 *    `onPickMultiple(items)`. Używany w wizardzie Zestawu (Step 2 Składniki).
 *
 * Opcjonalny filter `filterIsComponent`:
 *  - "products-only" → lista pokazuje tylko produkty (isComponent=false)
 *  - "components-only" → tylko komponenty (isComponent=true)
 *  - undefined → wszystkie elementy
 */

import { useEffect, useMemo, useState } from "react";
import { Check, Component, Image as ImageIcon, Package } from "lucide-react";

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

import type { CategoryTreeNode } from "../category-tree-select";
import {
  CategoryPickerColumn,
  collectDescendantsClient,
} from "./variant-pool-modal";

export interface LibraryDrillItem {
  id: string;
  name: string;
  productCode: string;
  code128: string | null;
  categoryId: string | null;
  isComponent: boolean;
  /** Opcjonalna miniaturka — wyświetlana w prawej kolumnie modal'a. */
  imageUrl?: string | null;
}

type FilterMode = "products-only" | "components-only" | undefined;

type SingleSelectProps<T extends LibraryDrillItem> = {
  multiSelect?: false;
  onPick: (item: T) => void;
  onPickMultiple?: never;
};

type MultiSelectProps<T extends LibraryDrillItem> = {
  multiSelect: true;
  onPickMultiple: (items: T[]) => void;
  onPick?: never;
};

type CommonProps<T extends LibraryDrillItem> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: T[];
  excludedIds: Set<string>;
  categoryTree: CategoryTreeNode[];
  filterIsComponent?: FilterMode;
};

export function LibraryDrillPicker<T extends LibraryDrillItem>(
  props: CommonProps<T> & (SingleSelectProps<T> | MultiSelectProps<T>),
) {
  const {
    open,
    onOpenChange,
    title,
    items,
    excludedIds,
    categoryTree,
    filterIsComponent,
  } = props;
  const multiSelect = props.multiSelect === true;

  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);
  const [activeL3, setActiveL3] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [staged, setStaged] = useState<Set<string>>(new Set());

  // Reset przy otwarciu
  useEffect(() => {
    if (open) {
      setActiveL1(null);
      setActiveL2(null);
      setActiveL3(null);
      setSearch("");
      setStaged(new Set());
    }
  }, [open]);

  // Po pre-filter po typie (komponent/produkt) — żeby też countFn liczył poprawnie
  const filteredByType = useMemo(() => {
    if (!filterIsComponent) return items;
    if (filterIsComponent === "products-only")
      return items.filter((p) => !p.isComponent);
    return items.filter((p) => p.isComponent);
  }, [items, filterIsComponent]);

  const level1 = categoryTree
    .filter((c) => c.level === 1)
    .sort((a, b) => a.name.localeCompare(b.name));
  const level2 = activeL1
    ? categoryTree
        .filter((c) => c.parentId === activeL1)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const level3 = activeL2
    ? categoryTree
        .filter((c) => c.parentId === activeL2)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const deepestActiveId = activeL3 ?? activeL2 ?? activeL1;
  const activeBranchIds = deepestActiveId
    ? new Set(collectDescendantsClient([deepestActiveId], categoryTree))
    : null;

  // Liczniki produktów per kategoria (z pre-filteringiem po typie)
  function countInSubtree(catId: string): number {
    const ids = new Set(collectDescendantsClient([catId], categoryTree));
    return filteredByType.filter(
      (p) => p.categoryId != null && ids.has(p.categoryId),
    ).length;
  }

  // Wynik dla kolumny produktów. Bez aktywnej gałęzi i bez search → puste
  // (pokazujemy placeholder, żeby nie zalewać całym katalogiem).
  const hasFilter = activeBranchIds != null || search.trim() !== "";
  const filteredItems = !hasFilter
    ? []
    : filteredByType.filter((p) => {
        if (activeBranchIds) {
          if (p.categoryId == null || !activeBranchIds.has(p.categoryId))
            return false;
        }
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.productCode.toLowerCase().includes(q) ||
          (p.code128?.toLowerCase().includes(q) ?? false)
        );
      });

  // Helper: zbierz ID-ki produktów w poddrzewie kategorii (excludeIds pomijamy
  // — nie chcemy próbować dodawać już dodanych).
  function productIdsInSubtree(catId: string): string[] {
    const ids = new Set(collectDescendantsClient([catId], categoryTree));
    return filteredByType
      .filter(
        (p) =>
          p.categoryId != null && ids.has(p.categoryId) && !excludedIds.has(p.id),
      )
      .map((p) => p.id);
  }

  // Multi-select dla kategorii: gdy WSZYSTKIE produkty w poddrzewie są w staged,
  // checkbox kategorii jest „checked". Klik → toggle wszystkich naraz.
  const stagedCategoryIds = useMemo(() => {
    if (!multiSelect) return new Set<string>();
    const result = new Set<string>();
    for (const c of categoryTree) {
      const subtreeIds = productIdsInSubtree(c.id);
      if (subtreeIds.length > 0 && subtreeIds.every((id) => staged.has(id))) {
        result.add(c.id);
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryTree, filteredByType, excludedIds, staged, multiSelect]);

  function toggleCategoryStaging(catId: string) {
    const productIds = productIdsInSubtree(catId);
    if (productIds.length === 0) return;
    setStaged((prev) => {
      const next = new Set(prev);
      const allStaged = productIds.every((id) => next.has(id));
      if (allStaged) {
        for (const id of productIds) next.delete(id);
      } else {
        for (const id of productIds) next.add(id);
      }
      return next;
    });
  }

  function toggleStaged(id: string) {
    setStaged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSinglePick(item: T) {
    if (props.multiSelect) return; // ts narrowing
    props.onPick(item);
  }

  function handleConfirmMulti() {
    if (!props.multiSelect) return;
    const picked = filteredByType.filter((p) => staged.has(p.id));
    props.onPickMultiple(picked);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,1080px)] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <Input
          type="search"
          placeholder="Szukaj po nazwie, SKU lub CODE 128…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="flex-1 min-h-0 overflow-hidden rounded-md ring-1 ring-slate-200 bg-white flex divide-x divide-slate-200">
          <CategoryPickerColumn
            title="Kategoria główna"
            items={level1}
            staging={stagedCategoryIds}
            onToggle={toggleCategoryStaging}
            activeId={activeL1}
            onActivate={(id) => {
              setActiveL1(id);
              setActiveL2(null);
              setActiveL3(null);
            }}
            levelLabel="Główna"
            levelColor="bg-violet-100 text-violet-800 ring-violet-200"
            emptyLabel="Brak kategorii"
            countFn={countInSubtree}
            hideCheckbox={!multiSelect}
          />
          <CategoryPickerColumn
            title="Podkategoria"
            items={level2}
            staging={stagedCategoryIds}
            onToggle={toggleCategoryStaging}
            activeId={activeL2}
            onActivate={(id) => {
              setActiveL2(id);
              setActiveL3(null);
            }}
            levelLabel="Podkategoria"
            levelColor="bg-indigo-100 text-indigo-800 ring-indigo-200"
            emptyLabel={
              activeL1 ? "Brak podkategorii" : "Wybierz kategorię główną →"
            }
            countFn={countInSubtree}
            hideCheckbox={!multiSelect}
          />
          <CategoryPickerColumn
            title="Typ produktu"
            items={level3}
            staging={stagedCategoryIds}
            onToggle={toggleCategoryStaging}
            activeId={activeL3}
            onActivate={(id) => setActiveL3(id)}
            levelLabel="Typ"
            levelColor="bg-sky-100 text-sky-800 ring-sky-200"
            emptyLabel={activeL2 ? "Brak typów" : "Wybierz podkategorię →"}
            countFn={countInSubtree}
            hideCheckbox={!multiSelect}
          />
          <ItemsColumn
            items={filteredItems}
            excludedIds={excludedIds}
            multiSelect={multiSelect}
            staged={staged}
            onToggleStaged={toggleStaged}
            onSinglePick={handleSinglePick}
            hasFilter={hasFilter}
            search={search}
          />
        </div>

        {multiSelect && (
          <DialogFooter className="pt-2 flex sm:flex-row items-center justify-between gap-2">
            <div className="text-xs text-slate-600">
              Zaznaczono:{" "}
              <strong className="text-violet-700 tabular-nums">
                {staged.size}
              </strong>{" "}
              {staged.size === 1 ? "produkt" : "produktów"}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                onClick={handleConfirmMulti}
                disabled={staged.size === 0}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                Dodaj zaznaczone ({staged.size})
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemsColumn<T extends LibraryDrillItem>({
  items,
  excludedIds,
  multiSelect,
  staged,
  onToggleStaged,
  onSinglePick,
  hasFilter,
  search,
}: {
  items: T[];
  excludedIds: Set<string>;
  multiSelect: boolean;
  staged: Set<string>;
  onToggleStaged: (id: string) => void;
  onSinglePick: (item: T) => void;
  hasFilter: boolean;
  search: string;
}) {
  return (
    <div className="flex-[1.7] min-w-0 flex flex-col bg-white">
      <div className="px-3 py-2 border-b bg-slate-50/80 text-[10px] uppercase tracking-wide font-semibold text-slate-600">
        {hasFilter ? `Produkty (${items.length})` : "Produkty"}
      </div>
      {!hasFilter ? (
        <div className="flex-1 grid place-items-center p-6 text-xs text-muted-foreground italic text-center leading-relaxed">
          Otwórz kategorię z lewej lub użyj wyszukiwarki,
          <br />
          żeby zobaczyć produkty/komponenty.
        </div>
      ) : items.length === 0 ? (
        <div className="flex-1 grid place-items-center p-6 text-xs text-muted-foreground italic text-center">
          {search.trim()
            ? `Brak elementów pasujących do "${search}"`
            : "Brak produktów w aktywnej gałęzi"}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {items.slice(0, 300).map((p) => {
            const excluded = excludedIds.has(p.id);
            const checked = staged.has(p.id);
            const handleClick = () => {
              if (excluded) return;
              if (multiSelect) onToggleStaged(p.id);
              else onSinglePick(p);
            };
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={handleClick}
                  disabled={excluded}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors",
                    excluded
                      ? "opacity-50 cursor-not-allowed bg-emerald-50/30"
                      : checked
                        ? "bg-violet-50/60 hover:bg-violet-50 cursor-pointer"
                        : "hover:bg-slate-50 cursor-pointer",
                  )}
                >
                  {multiSelect && (
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      disabled={excluded}
                      className="size-3.5 accent-violet-600 shrink-0 pointer-events-none"
                    />
                  )}
                  {/* Miniaturka produktu — wyświetlana gdy `imageUrl` jest podany. */}
                  {p.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="size-7 rounded object-cover bg-slate-100 shrink-0 ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="size-7 rounded bg-slate-100 grid place-items-center text-slate-300 shrink-0">
                      <ImageIcon className="size-3" />
                    </div>
                  )}
                  <span
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1",
                      p.isComponent
                        ? "bg-violet-100 text-violet-800 ring-violet-200"
                        : "bg-indigo-100 text-indigo-800 ring-indigo-200",
                    )}
                  >
                    {p.isComponent ? (
                      <Component className="size-2.5" />
                    ) : (
                      <Package className="size-2.5" />
                    )}
                    {p.isComponent ? "Komp." : "Prod."}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate font-medium text-slate-800",
                        checked && "text-violet-900",
                      )}
                    >
                      {p.name}
                    </div>
                    <div className="text-[9px] font-mono text-slate-500 truncate">
                      {p.productCode}
                      {p.code128 && p.code128 !== p.productCode && (
                        <span className="text-slate-400">
                          {" · "}
                          {p.code128}
                        </span>
                      )}
                    </div>
                  </div>
                  {excluded && (
                    <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700">
                      <Check className="size-3" />
                      Dodany
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
