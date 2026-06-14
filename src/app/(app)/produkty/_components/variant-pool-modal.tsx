"use client";

/**
 * Modal konfiguracji puli wariantów slotu bundla — multi-select kategorii + produktów.
 *
 * Controlled component — caller przekazuje initial values + onSave callback.
 * Używany w dwóch miejscach:
 *  - ComponentsManager (zakładka Podstawowe na karcie produktu) — zapis do DB przez setComponentSlotPoolAction
 *  - Wizard Step 4 (Komponenty) — zapis do form state wizarda (bundle jeszcze nie istnieje w DB)
 */

import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

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

export interface VariantPoolValue {
  allowVariants: boolean;
  poolCategoryIds: string[];
  poolProductIds: string[];
}

export interface VariantPoolLibraryEntry {
  id: string;
  name: string;
  productCode: string;
  code128: string | null;
  categoryId: string | null;
}

/** Liczy listę ID kategorii (rootIds + descendants) po drzewku flat. */
export function collectDescendantsClient(
  rootIds: string[],
  categories: CategoryTreeNode[],
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

/**
 * Liczy zbiór ID produktów w puli wariantów (client-side).
 * - allowVariants=false → tylko default componentId
 * - explicit poolCategories/poolProducts → łączy oba
 * - puste → fallback do kategorii komponentu + descendants
 */
export function resolvePoolClient(args: {
  allowVariants: boolean;
  poolCategoryIds: string[];
  poolProductIds: string[];
  componentId: string;
  defaultCategoryId: string | null;
  library: VariantPoolLibraryEntry[];
  categoryTree: CategoryTreeNode[];
}): Set<string> {
  if (!args.allowVariants) return new Set([args.componentId]);
  const pool = new Set<string>();
  const categoryRoots = args.poolCategoryIds.slice();
  if (categoryRoots.length === 0 && args.poolProductIds.length === 0) {
    if (args.defaultCategoryId) categoryRoots.push(args.defaultCategoryId);
  }
  const descendantCats = collectDescendantsClient(
    categoryRoots,
    args.categoryTree,
  );
  for (const p of args.library) {
    if (p.categoryId != null && descendantCats.includes(p.categoryId)) {
      pool.add(p.id);
    }
  }
  for (const pid of args.poolProductIds) pool.add(pid);
  pool.add(args.componentId);
  return pool;
}

export function VariantPoolModal({
  open,
  onOpenChange,
  slotName,
  componentId,
  defaultCategoryId,
  initialValue,
  categoryTree,
  library,
  pending = false,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slotName: string;
  componentId: string;
  defaultCategoryId: string | null;
  initialValue: VariantPoolValue;
  categoryTree: CategoryTreeNode[];
  library: VariantPoolLibraryEntry[];
  pending?: boolean;
  onSave: (value: VariantPoolValue) => void | Promise<void>;
}) {
  const [allowVariants, setAllowVariants] = useState(
    initialValue.allowVariants,
  );
  const [pickedCategories, setPickedCategories] = useState<Set<string>>(
    new Set(initialValue.poolCategoryIds),
  );
  const [pickedProducts, setPickedProducts] = useState<Set<string>>(
    new Set(initialValue.poolProductIds),
  );
  const [productSearch, setProductSearch] = useState("");
  // Aktywna ścieżka nawigacyjna w 3-kolumnowym pickerze kategorii
  const [activeL1, setActiveL1] = useState<string | null>(null);
  const [activeL2, setActiveL2] = useState<string | null>(null);
  const [activeL3, setActiveL3] = useState<string | null>(null);

  // Resync przy otwarciu
  useEffect(() => {
    if (open) {
      setAllowVariants(initialValue.allowVariants);
      setPickedCategories(new Set(initialValue.poolCategoryIds));
      setPickedProducts(new Set(initialValue.poolProductIds));
      setProductSearch("");
      setActiveL1(null);
      setActiveL2(null);
      setActiveL3(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pool = resolvePoolClient({
    allowVariants,
    poolCategoryIds: Array.from(pickedCategories),
    poolProductIds: Array.from(pickedProducts),
    componentId,
    defaultCategoryId,
    library,
    categoryTree,
  });
  const variantCount = pool.size;

  function toggleCategory(id: string) {
    setPickedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleProduct(id: string) {
    setPickedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 3-poziomowy podział kategorii: główne / podkategorie wybranej głównej /
  // typy produktów wybranej podkategorii
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

  // Najdeepsza aktywna kategoria (L3 > L2 > L1) — używana do filtrowania
  // produktów w kolumnie 4. Gdy nic nie aktywne, pokazujemy wszystkie.
  const deepestActiveId = activeL3 ?? activeL2 ?? activeL1;

  // Set ID kategorii wewnątrz aktywnej gałęzi (rekurencyjnie)
  const activeBranchIds = deepestActiveId
    ? new Set(collectDescendantsClient([deepestActiveId], categoryTree))
    : null;

  // Helper: ile produktów w subtree danej kategorii
  function countProductsInSubtree(catId: string): number {
    const ids = new Set(collectDescendantsClient([catId], categoryTree));
    return library.filter((p) => p.categoryId != null && ids.has(p.categoryId))
      .length;
  }

  // Pokazujemy listę produktów DOPIERO gdy user wszedł w jakąś kategorię.
  // Bez aktywnej kategorii → pusta lista + placeholder w UI (nie zalewamy
  // wszystkimi produktami katalogu).
  const filteredProducts = !activeBranchIds
    ? []
    : library.filter((p) => {
        if (p.categoryId == null || !activeBranchIds.has(p.categoryId))
          return false;
        if (!productSearch.trim()) return true;
        const q = productSearch.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.productCode.toLowerCase().includes(q) ||
          (p.code128?.toLowerCase().includes(q) ?? false)
        );
      });

  async function handleSave() {
    await onSave({
      allowVariants,
      poolCategoryIds: Array.from(pickedCategories),
      poolProductIds: Array.from(pickedProducts),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,1080px)] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Layers className="size-4 text-violet-600" />
            Pula wariantów slotu
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Slot <strong>{slotName}</strong>: zaznacz <strong>kategorie</strong>{" "}
          (każda + podkategorie + typy) <strong>i/lub</strong> konkretne{" "}
          <strong>produkty</strong>. Klient/operator przy zamówieniu wybierze
          wariant z tej puli.
        </p>

        {/* Toggle Dopuszcza warianty */}
        <div className="flex items-center justify-between gap-3 rounded-md ring-1 ring-slate-200 px-3 py-2">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold">
              Czy slot dopuszcza warianty?
            </div>
            <div className="text-[11px] text-muted-foreground">
              Wyłącz gdy chcesz wymusić TYLKO domyślny komponent.
            </div>
          </div>
          <div className="inline-flex rounded-md ring-1 ring-slate-200 p-0.5 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => setAllowVariants(true)}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-semibold transition-all",
                allowVariants
                  ? "bg-white shadow-sm text-violet-700 ring-1 ring-slate-200"
                  : "text-slate-500",
              )}
            >
              Tak — z puli
            </button>
            <button
              type="button"
              onClick={() => setAllowVariants(false)}
              className={cn(
                "px-2.5 py-1 rounded text-[11px] font-semibold transition-all",
                !allowVariants
                  ? "bg-white shadow-sm text-slate-700 ring-1 ring-slate-200"
                  : "text-slate-500",
              )}
            >
              Nie
            </button>
          </div>
        </div>

        {allowVariants && (
          <div className="flex-1 min-h-0 overflow-hidden rounded-md ring-1 ring-slate-200 bg-white flex flex-col">
            {/* Strip wybranych — chipy z nazwami kategorii + produktów */}
            <SelectedSummaryStrip
              pickedCategories={pickedCategories}
              pickedProducts={pickedProducts}
              categoryTree={categoryTree}
              library={library}
              onUntickCategory={toggleCategory}
              onUntickProduct={toggleProduct}
              onClearCategories={() => setPickedCategories(new Set())}
              onClearProducts={() => setPickedProducts(new Set())}
            />

            {/* 4-kolumnowy picker: KAT → SUBKAT → TYP → PRODUKTY */}
            <div className="flex flex-1 min-h-0 divide-x divide-slate-200">
              <CategoryPickerColumn
                title="Kategoria główna"
                items={level1}
                staging={pickedCategories}
                onToggle={toggleCategory}
                activeId={activeL1}
                onActivate={(id) => {
                  setActiveL1(id);
                  setActiveL2(null);
                  setActiveL3(null);
                }}
                levelLabel="Główna"
                levelColor="bg-violet-100 text-violet-800 ring-violet-200"
                emptyLabel="Brak kategorii"
                countFn={countProductsInSubtree}
              />
              <CategoryPickerColumn
                title="Podkategoria"
                items={level2}
                staging={pickedCategories}
                onToggle={toggleCategory}
                activeId={activeL2}
                onActivate={(id) => {
                  setActiveL2(id);
                  setActiveL3(null);
                }}
                levelLabel="Podkategoria"
                levelColor="bg-indigo-100 text-indigo-800 ring-indigo-200"
                emptyLabel={
                  activeL1
                    ? "Brak podkategorii"
                    : "Wybierz kategorię główną →"
                }
                countFn={countProductsInSubtree}
              />
              <CategoryPickerColumn
                title="Typ produktu"
                items={level3}
                staging={pickedCategories}
                onToggle={toggleCategory}
                activeId={activeL3}
                onActivate={(id) => setActiveL3(id)}
                levelLabel="Typ"
                levelColor="bg-sky-100 text-sky-800 ring-sky-200"
                emptyLabel={activeL2 ? "Brak typów" : "Wybierz podkategorię →"}
                countFn={countProductsInSubtree}
              />
              <ProductsPickerColumn
                products={filteredProducts}
                picked={pickedProducts}
                onToggle={toggleProduct}
                search={productSearch}
                onSearch={setProductSearch}
                activeCategoryId={deepestActiveId}
                onAssignCategory={
                  deepestActiveId
                    ? () => toggleCategory(deepestActiveId)
                    : null
                }
                isCategoryInPool={
                  deepestActiveId
                    ? pickedCategories.has(deepestActiveId)
                    : false
                }
              />
            </div>
          </div>
        )}

        {/* Live counter */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md ring-1 px-2.5 py-1.5 text-xs self-start",
            variantCount > 1
              ? "bg-violet-50 text-violet-800 ring-violet-200"
              : variantCount === 1
                ? "bg-amber-50 text-amber-800 ring-amber-200"
                : "bg-rose-50 text-rose-800 ring-rose-200",
          )}
        >
          <Layers className="size-3" />
          <span className="font-semibold">{variantCount}</span>
          {variantCount === 0
            ? " wariantów (pusto)"
            : variantCount === 1
              ? " wariant"
              : " wariantów"}{" "}
          dostępnych
        </div>

        <DialogFooter className="pt-2">
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
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {pending ? "Zapisuję…" : "Zapisz pulę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Pojedyncza kolumna 3-poziomowego pickera kategorii.
 * Checkbox = włącz/wyłącz tę kategorię w puli wariantów.
 * Klik w nazwę = aktywuj (otwiera dzieci w następnej kolumnie).
 */
export function CategoryPickerColumn({
  title,
  items,
  staging,
  onToggle,
  activeId,
  onActivate,
  levelLabel,
  levelColor,
  emptyLabel,
  countFn,
  hideCheckbox = false,
}: {
  title: string;
  items: CategoryTreeNode[];
  staging: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  onActivate: (id: string) => void;
  levelLabel: string;
  levelColor: string;
  emptyLabel: string;
  countFn?: (categoryId: string) => number;
  hideCheckbox?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white">
      <div className="px-3 py-2 border-b bg-slate-50/80 text-[10px] uppercase tracking-wide font-semibold text-slate-600">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="flex-1 grid place-items-center p-4 text-xs text-muted-foreground italic text-center">
          {emptyLabel}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {items.map((c) => {
            const checked = staging.has(c.id);
            const isActive = activeId === c.id;
            return (
              <li key={c.id} className="px-2.5 py-1.5">
                <div
                  className={cn(
                    "flex items-center gap-2 px-1.5 py-1 rounded transition-colors",
                    isActive && "bg-violet-50 ring-1 ring-violet-200",
                    !isActive && "hover:bg-slate-50",
                  )}
                >
                  {!hideCheckbox && (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(c.id)}
                      className="size-3.5 accent-violet-600 shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onActivate(c.id)}
                    className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1",
                        levelColor,
                      )}
                    >
                      {levelLabel}
                    </span>
                    <span
                      className={cn(
                        "text-sm truncate flex-1",
                        !hideCheckbox && checked && "text-violet-900 font-semibold",
                      )}
                    >
                      {c.name}
                    </span>
                    {countFn && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-4 px-1 rounded-full bg-slate-100 text-slate-600 text-[9px] tabular-nums">
                        {countFn(c.id)}
                      </span>
                    )}
                    {isActive && (
                      <span className="shrink-0 text-violet-500 text-xs">
                        ›
                      </span>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Czwarta kolumna pickera — produkty filtrowane przez aktywną gałąź kategorii.
 * Każdy wiersz ma checkbox (dodaj do puli) + nazwę + SKU.
 * Header zawiera "Przypisz całą kategorię" gdy jakaś jest aktywna.
 */
function ProductsPickerColumn({
  products,
  picked,
  onToggle,
  search,
  onSearch,
  activeCategoryId,
  onAssignCategory,
  isCategoryInPool,
}: {
  products: VariantPoolLibraryEntry[];
  picked: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  onSearch: (q: string) => void;
  activeCategoryId: string | null;
  onAssignCategory: (() => void) | null;
  isCategoryInPool: boolean;
}) {
  const hasActive = activeCategoryId != null;
  return (
    <div className="flex-[1.5] min-w-0 flex flex-col bg-white">
      <div className="px-3 py-2 border-b bg-slate-50/80 text-[10px] uppercase tracking-wide font-semibold text-slate-600 flex items-center justify-between gap-2">
        <span>
          Produkty
          {hasActive && ` (${products.length})`}
        </span>
        {hasActive && onAssignCategory && (
          <button
            type="button"
            onClick={onAssignCategory}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] normal-case font-semibold ring-1 transition-colors",
              isCategoryInPool
                ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                : "bg-violet-600 text-white ring-violet-700 hover:bg-violet-700",
            )}
          >
            {isCategoryInPool
              ? "✓ Cała kategoria w puli"
              : "+ Przypisz całą kategorię"}
          </button>
        )}
      </div>
      {hasActive ? (
        <>
          <div className="p-2 border-b">
            <Input
              type="search"
              placeholder="Szukaj po nazwie, SKU…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {products.length === 0 ? (
              <li className="p-6 text-xs text-muted-foreground text-center italic">
                Brak produktów w aktywnej gałęzi
              </li>
            ) : (
              products.slice(0, 300).map((p) => {
                const checked = picked.has(p.id);
                return (
                  <li key={p.id}>
                    <label
                      className={cn(
                        "flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 cursor-pointer text-xs transition-colors",
                        checked && "bg-violet-50/40",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(p.id)}
                        className="size-3.5 accent-violet-600 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "truncate font-medium",
                            checked && "text-violet-900",
                          )}
                        >
                          {p.name}
                        </div>
                        <div className="text-[9px] font-mono text-slate-500 truncate">
                          {p.productCode}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </>
      ) : (
        <div className="flex-1 grid place-items-center p-6 text-xs text-muted-foreground italic text-center leading-relaxed">
          Otwórz kategorię z lewej żeby zobaczyć produkty.
          <br />
          Drążysz głębiej (podkategoria, typ) — lista zawęża się do tej
          gałęzi.
        </div>
      )}
    </div>
  );
}

/**
 * Strip widoczny na górze modala — pokazuje wszystkie wybrane kategorie + produkty
 * jako chipy z nazwą i przyciskiem × do usunięcia. Daje user'owi pełen wgląd
 * w to co jest w puli zanim klikne Zapisz.
 */
function SelectedSummaryStrip({
  pickedCategories,
  pickedProducts,
  categoryTree,
  library,
  onUntickCategory,
  onUntickProduct,
  onClearCategories,
  onClearProducts,
}: {
  pickedCategories: Set<string>;
  pickedProducts: Set<string>;
  categoryTree: CategoryTreeNode[];
  library: VariantPoolLibraryEntry[];
  onUntickCategory: (id: string) => void;
  onUntickProduct: (id: string) => void;
  onClearCategories: () => void;
  onClearProducts: () => void;
}) {
  const totalPicked = pickedCategories.size + pickedProducts.size;
  const catEntries = Array.from(pickedCategories)
    .map((id) => categoryTree.find((c) => c.id === id))
    .filter((c): c is CategoryTreeNode => c != null)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  const prodEntries = Array.from(pickedProducts)
    .map((id) => library.find((p) => p.id === id))
    .filter((p): p is VariantPoolLibraryEntry => p != null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="border-b bg-slate-50/60 px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-700">
          Wybrane do puli ({totalPicked})
        </span>
        <div className="flex gap-2">
          {pickedCategories.size > 0 && (
            <button
              type="button"
              onClick={onClearCategories}
              className="text-[10px] text-rose-700 hover:underline"
            >
              Wyczyść kategorie
            </button>
          )}
          {pickedProducts.size > 0 && (
            <button
              type="button"
              onClick={onClearProducts}
              className="text-[10px] text-rose-700 hover:underline"
            >
              Wyczyść produkty
            </button>
          )}
        </div>
      </div>
      {totalPicked === 0 ? (
        <div className="text-[11px] italic text-muted-foreground">
          Pula pusta — nic jeszcze nie zaznaczone. Klik checkboxa w kolumnach
          poniżej dodaje pozycje.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {catEntries.map((c) => {
            const levelClass =
              c.level === 1
                ? "bg-violet-100 text-violet-800 ring-violet-200"
                : c.level === 2
                  ? "bg-indigo-100 text-indigo-800 ring-indigo-200"
                  : "bg-sky-100 text-sky-800 ring-sky-200";
            const levelLabel =
              c.level === 1 ? "Główna" : c.level === 2 ? "Podkat." : "Typ";
            return (
              <span
                key={c.id}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 max-w-[280px]",
                  levelClass,
                )}
              >
                <span className="text-[9px] uppercase opacity-70 shrink-0">
                  {levelLabel}
                </span>
                <span className="truncate">{c.name}</span>
                <button
                  type="button"
                  onClick={() => onUntickCategory(c.id)}
                  className="size-3.5 inline-flex items-center justify-center rounded hover:bg-white/60 shrink-0 -mr-0.5"
                  title="Usuń z puli"
                >
                  ×
                </button>
              </span>
            );
          })}
          {prodEntries.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 bg-amber-100 text-amber-800 ring-amber-200 max-w-[280px]"
            >
              <span className="text-[9px] uppercase opacity-70 shrink-0">
                Prod
              </span>
              <span className="truncate">{p.name}</span>
              <span className="font-mono opacity-70 text-[9px] shrink-0">
                {p.productCode}
              </span>
              <button
                type="button"
                onClick={() => onUntickProduct(p.id)}
                className="size-3.5 inline-flex items-center justify-center rounded hover:bg-white/60 shrink-0 -mr-0.5"
                title="Usuń z puli"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
