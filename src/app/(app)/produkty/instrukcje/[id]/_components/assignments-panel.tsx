"use client";

/**
 * Compact assignments panel — pokazuje JEDNĄ linię podsumowania (komu jest
 * przypisana ta instrukcja) + przycisk „Edytuj" otwierający modal z pełnym
 * pickerem produktów / kategorii.
 *
 * Lista assignments to chipy z nazwami: produkty (bursztynowe) i kategorie
 * (fioletowe, z badge „+podkat." gdy includeDescendants).
 */

import { useMemo, useState } from "react";
import { Edit3, Layers, Package } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  AssignmentsEditDialog,
  type CategoryAssign,
  type CategoryOpt,
  type ProductOpt,
} from "../../_components/assignments-edit-dialog";

export function AssignmentsPanel({
  manualId,
  initialProductIds,
  initialCategoryAssigns,
  allProducts,
  allCategories,
}: {
  manualId: string;
  initialProductIds: string[];
  initialCategoryAssigns: CategoryAssign[];
  allProducts: ProductOpt[];
  allCategories: CategoryOpt[];
}) {
  const [productIds, setProductIds] = useState<string[]>(initialProductIds);
  const [catAssigns, setCatAssigns] =
    useState<CategoryAssign[]>(initialCategoryAssigns);
  const [editing, setEditing] = useState(false);

  // Mapa id → name dla szybkiego renderowania chipsów w summary
  const productById = useMemo(
    () => new Map(allProducts.map((p) => [p.id, p])),
    [allProducts],
  );
  const categoryById = useMemo(
    () => new Map(allCategories.map((c) => [c.id, c])),
    [allCategories],
  );

  function onModalSaved(
    nextProductIds: string[],
    nextCatAssigns: CategoryAssign[],
  ) {
    setProductIds(nextProductIds);
    setCatAssigns(nextCatAssigns);
    setEditing(false);
  }

  return (
    <>
      <div className="rounded-md border border-amber-200 bg-amber-50/40 px-3 py-2 flex items-center gap-3">
        <div className="size-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
          <Layers className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-amber-700 font-bold mb-0.5">
            Przypisania · produkty {productIds.length} · kategorie{" "}
            {catAssigns.length}
          </div>
          {productIds.length === 0 && catAssigns.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              Nie przypisano — instrukcja nie będzie się pojawiać przy żadnym
              produkcie.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1 items-center">
              {/* Produkty */}
              {productIds.map((id) => {
                const p = productById.get(id);
                if (!p) return null;
                return (
                  <span
                    key={`p-${id}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                    title={`${p.name} (${p.productCode})`}
                  >
                    <Package className="size-2.5" />
                    <span className="truncate max-w-[180px]">{p.name}</span>
                  </span>
                );
              })}
              {/* Kategorie */}
              {catAssigns.map((c) => {
                const cat = categoryById.get(c.categoryId);
                if (!cat) return null;
                return (
                  <span
                    key={`c-${c.categoryId}`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-violet-100 text-violet-900 ring-1 ring-violet-200"
                    title={
                      c.includeDescendants
                        ? `${cat.name} + wszystkie podkategorie`
                        : cat.name
                    }
                  >
                    <Layers className="size-2.5" />
                    <span className="truncate max-w-[180px]">{cat.name}</span>
                    {c.includeDescendants && (
                      <span className="text-[8px] font-bold opacity-70">
                        +pod.
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(true)}
          className="gap-1.5 shrink-0"
        >
          <Edit3 className="size-3.5" />
          Edytuj
        </Button>
      </div>

      <AssignmentsEditDialog
        open={editing}
        onClose={() => setEditing(false)}
        manualId={manualId}
        initialProductIds={productIds}
        initialCategoryAssigns={catAssigns}
        allProducts={allProducts}
        allCategories={allCategories}
        onSaved={onModalSaved}
      />
    </>
  );
}
