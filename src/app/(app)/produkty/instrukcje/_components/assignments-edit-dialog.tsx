"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Layers, Package, Save, Search } from "lucide-react";
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

import { setManualAssignmentsAction } from "@/server/product-manuals";

export type ProductOpt = { id: string; name: string; productCode: string };
export type CategoryOpt = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
};
export type CategoryAssign = {
  categoryId: string;
  includeDescendants: boolean;
};

export function AssignmentsEditDialog({
  open,
  onClose,
  manualId,
  manualName,
  initialProductIds,
  initialCategoryAssigns,
  allProducts,
  allCategories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  manualId: string;
  /** Opcjonalna nazwa instrukcji — pokazywana w tytule dialogu. */
  manualName?: string;
  initialProductIds: string[];
  initialCategoryAssigns: CategoryAssign[];
  allProducts: ProductOpt[];
  allCategories: CategoryOpt[];
  onSaved: (productIds: string[], catAssigns: CategoryAssign[]) => void;
}) {
  const [productIds, setProductIds] = useState<string[]>(initialProductIds);
  const [catAssigns, setCatAssigns] =
    useState<CategoryAssign[]>(initialCategoryAssigns);
  const [productSearch, setProductSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [saving, startSave] = useTransition();

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return allProducts;
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.productCode.toLowerCase().includes(q),
    );
  }, [allProducts, productSearch]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.toLowerCase().trim();
    if (!q) return allCategories;
    return allCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [allCategories, categorySearch]);

  function toggleProduct(id: string) {
    setProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function toggleCategory(id: string) {
    setCatAssigns((prev) => {
      const exists = prev.find((c) => c.categoryId === id);
      if (exists) return prev.filter((c) => c.categoryId !== id);
      return [...prev, { categoryId: id, includeDescendants: true }];
    });
  }

  function setIncludeDescendants(id: string, value: boolean) {
    setCatAssigns((prev) =>
      prev.map((c) =>
        c.categoryId === id ? { ...c, includeDescendants: value } : c,
      ),
    );
  }

  function save() {
    startSave(async () => {
      try {
        await setManualAssignmentsAction(manualId, {
          productIds,
          categories: catAssigns,
        });
        toast.success("Zapisano przypisania");
        onSaved(productIds, catAssigns);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  function cancelClose() {
    setProductIds(initialProductIds);
    setCatAssigns(initialCategoryAssigns);
    setProductSearch("");
    setCategorySearch("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cancelClose()}>
      <DialogContent className="!max-w-[min(96vw,900px)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="size-4 text-amber-600" />
            Przypisania instrukcji
            {manualName && (
              <span className="text-sm font-normal text-muted-foreground truncate">
                — {manualName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          {/* LEWA — produkty */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-amber-600" />
              <span className="text-xs font-semibold text-slate-800">
                Konkretne produkty
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({productIds.length} wybranych)
              </span>
              {productIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setProductIds([])}
                  className="ml-auto text-[10px] text-amber-700 hover:underline"
                >
                  wyczyść
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="size-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Wyszukaj produkt po nazwie lub SKU…"
                className="h-7 text-xs pl-7"
              />
            </div>
            {productSearch.trim() && filteredProducts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const ids = new Set(productIds);
                  filteredProducts.forEach((p) => ids.add(p.id));
                  setProductIds(Array.from(ids));
                }}
                className="text-[10px] text-amber-700 hover:underline"
              >
                + zaznacz wszystkie pasujące ({filteredProducts.length})
              </button>
            )}
            <div className="border rounded-md max-h-[340px] overflow-y-auto bg-white">
              {filteredProducts.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic p-3 text-center">
                  Brak pasujących produktów.
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const checked = productIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProduct(p.id)}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-xs hover:bg-amber-50/60 transition-colors",
                        checked && "bg-amber-50",
                      )}
                    >
                      <span
                        className={cn(
                          "size-4 rounded ring-1 grid place-items-center shrink-0",
                          checked
                            ? "bg-amber-600 ring-amber-600 text-white"
                            : "ring-slate-300 bg-white",
                        )}
                      >
                        {checked && <Check className="size-3" />}
                      </span>
                      <span className="font-medium truncate flex-1">
                        {p.name}
                      </span>
                      <code className="text-[10px] text-muted-foreground shrink-0">
                        {p.productCode}
                      </code>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* PRAWA — kategorie */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-violet-600" />
              <span className="text-xs font-semibold text-slate-800">
                Kategorie i podkategorie
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({catAssigns.length} wybranych)
              </span>
              {catAssigns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCatAssigns([])}
                  className="ml-auto text-[10px] text-violet-700 hover:underline"
                >
                  wyczyść
                </button>
              )}
            </div>
            <div className="relative">
              <Search className="size-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Wyszukaj kategorię…"
                className="h-7 text-xs pl-7"
              />
            </div>
            <div className="border rounded-md max-h-[340px] overflow-y-auto bg-white">
              {filteredCategories.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic p-3 text-center">
                  Brak pasujących kategorii.
                </div>
              ) : (
                filteredCategories.map((c) => {
                  const assign = catAssigns.find((a) => a.categoryId === c.id);
                  const checked = !!assign;
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "px-2.5 py-1.5 flex items-center gap-2 text-xs",
                        checked && "bg-violet-50",
                      )}
                      style={{ paddingLeft: 10 + (c.level - 1) * 14 }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(c.id)}
                        className="flex items-center gap-2 flex-1 min-w-0"
                      >
                        <span
                          className={cn(
                            "size-4 rounded ring-1 grid place-items-center shrink-0",
                            checked
                              ? "bg-violet-600 ring-violet-600 text-white"
                              : "ring-slate-300 bg-white",
                          )}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span className="font-medium truncate text-left">
                          {c.name}
                        </span>
                      </button>
                      {checked && assign && (
                        <label
                          className="flex items-center gap-1 text-[10px] text-violet-800 cursor-pointer shrink-0"
                          title="Obejmuje wszystkie podkategorie tej kategorii (rekurencyjnie)"
                        >
                          <input
                            type="checkbox"
                            checked={assign.includeDescendants}
                            onChange={(e) =>
                              setIncludeDescendants(c.id, e.target.checked)
                            }
                            className="size-3 accent-violet-600"
                          />
                          +podkat.
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancelClose}>
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            className="gap-1.5"
          >
            <Save className="size-3.5" />
            {saving ? "Zapisuję…" : "Zapisz przypisania"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
