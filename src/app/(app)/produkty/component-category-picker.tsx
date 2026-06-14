"use client";

import * as React from "react";
import Link from "next/link";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LEVEL_BADGE,
  LEVEL_LABEL_SHORT,
  type CategoryLevel,
} from "@/lib/categories";

export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  productCount: number;
};

export type ComponentCategoryPickerHandle = {
  selectedIds: string[];
  quantityPerProduct: number;
};

/**
 * Tree picker — pozwala wybrać kategorie, do których produktów ma być
 * automatycznie dopisany ten komponent. Zaznaczenie kategorii obejmuje
 * też jej potomków (server expanduje).
 */
export function ComponentCategoryPicker({
  categories,
  selected,
  onChange,
  quantityPerProduct,
  onQuantityChange,
}: {
  categories: CategoryNode[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  quantityPerProduct: number;
  onQuantityChange: (next: number) => void;
}) {
  const byParent = React.useMemo(() => {
    const map = new Map<string | null, CategoryNode[]>();
    for (const c of categories) {
      const key = c.parentId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [categories]);

  const roots = byParent.get(null) ?? [];

  // Helper: oblicz ile produktów dotknie wybór (z descendants)
  const allDescendantIds = React.useCallback(
    (rootIds: string[]): Set<string> => {
      const all = new Set(rootIds);
      let frontier = [...rootIds];
      while (frontier.length > 0) {
        const next: string[] = [];
        for (const id of frontier) {
          const children = byParent.get(id) ?? [];
          for (const c of children) {
            if (!all.has(c.id)) {
              all.add(c.id);
              next.push(c.id);
            }
          }
        }
        frontier = next;
      }
      return all;
    },
    [byParent],
  );

  const affectedProductsCount = React.useMemo(() => {
    const expanded = allDescendantIds(Array.from(selected));
    return categories
      .filter((c) => expanded.has(c.id))
      .reduce((sum, c) => sum + c.productCount, 0);
  }, [selected, categories, allDescendantIds]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card">
        {categories.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Brak kategorii. Najpierw utwórz kategorie w{" "}
            <Link href="/produkty/kategorie" className="underline text-primary">
              /produkty/kategorie
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y max-h-[260px] overflow-y-auto">
            {roots.map((r) => (
              <TreeRow
                key={r.id}
                node={r}
                byParent={byParent}
                selected={selected}
                onToggle={toggle}
              />
            ))}
          </ul>
        )}
      </div>

      {selected.size > 0 && (
        <div className="rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-xs text-emerald-900">
          Wybranych kategorii: <strong>{selected.size}</strong> · objętych
          produktów: <strong>{affectedProductsCount}</strong>. Komponent zostanie
          dopisany do każdego z tych produktów.
        </div>
      )}

      <div className="flex items-center gap-3">
        <Label htmlFor="qpp" className="text-xs whitespace-nowrap">
          Ilość komponentu na produkt
        </Label>
        <Input
          id="qpp"
          type="number"
          min="1"
          step="1"
          value={quantityPerProduct}
          onChange={(e) => onQuantityChange(Math.max(1, Number(e.target.value) || 1))}
          className="h-8 w-20"
        />
        <span className="text-xs text-muted-foreground">
          Domyślnie 1. Można później nadpisać na konkretnym produkcie.
        </span>
      </div>
    </div>
  );
}

function TreeRow({
  node,
  byParent,
  selected,
  onToggle,
}: {
  node: CategoryNode;
  byParent: Map<string | null, CategoryNode[]>;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const children = byParent.get(node.id) ?? [];
  const indent = (node.level - 1) * 20;
  const level = node.level as CategoryLevel;

  return (
    <>
      <li
        className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors cursor-pointer"
        style={{ paddingLeft: 12 + indent }}
        onClick={() => onToggle(node.id)}
      >
        <Checkbox
          checked={selected.has(node.id)}
          onCheckedChange={() => onToggle(node.id)}
          onClick={(e) => e.stopPropagation()}
          className="size-4 shrink-0"
        />
        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 shrink-0",
            LEVEL_BADGE[level],
          )}
        >
          {LEVEL_LABEL_SHORT[level]}
        </span>
        <span className="flex-1 min-w-0 truncate text-sm">{node.name}</span>
        {node.productCount > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {node.productCount} prod.
          </span>
        )}
      </li>
      {children.map((c) => (
        <TreeRow
          key={c.id}
          node={c}
          byParent={byParent}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}
