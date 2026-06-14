"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, ChevronsUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  LEVEL_BADGE,
  LEVEL_LABEL_SHORT,
  type CategoryLevel,
} from "@/lib/categories";

export type CategoryTreeNode = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
};

/**
 * Single-select tree picker dla pola Kategoria w formularzu produktu.
 * Wygląda jak Select, po kliknięciu otwiera popover z drzewem (chevron +
 * level badge + nazwa), tak samo jak na stronie /produkty/kategorie.
 *
 * Selekcja na dowolnym poziomie (Główna / Podkategoria / Typ).
 *
 * Renderuje też ukryty `<input name>` żeby formularz przekazał wartość.
 */
export function CategoryTreeSelect({
  name,
  value,
  onChange,
  categories,
  placeholder = "— brak —",
  allowEmpty = true,
}: {
  /** Nazwa pola w form data (do hidden inputa). Jeśli undefined, formularz nie wyśle. */
  name?: string;
  /** Aktualnie wybrana kategoria (id) lub null. */
  value: string | null;
  onChange: (next: string | null) => void;
  categories: CategoryTreeNode[];
  placeholder?: string;
  /** Czy pokazać opcję „— brak —" na górze. */
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  const byParent = React.useMemo(() => {
    const map = new Map<string | null, CategoryTreeNode[]>();
    for (const c of categories) {
      const key = c.parentId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [categories]);

  const byId = React.useMemo(() => {
    const map = new Map<string, CategoryTreeNode>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  // Breadcrumb dla wybranej: "Główna > Podkategoria > Typ"
  const breadcrumb = React.useMemo(() => {
    if (!value) return null;
    const parts: string[] = [];
    let cur: CategoryTreeNode | undefined = byId.get(value);
    let depth = 0;
    while (cur && depth < 10) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      depth++;
    }
    return parts;
  }, [value, byId]);

  const roots = byParent.get(null) ?? [];

  function select(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  const selectedNode = value ? byId.get(value) : null;
  const selectedLevel = selectedNode?.level as CategoryLevel | undefined;

  return (
    <>
      {name && <input type="hidden" name={name} value={value ?? ""} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-hidden",
                "hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <div className="flex-1 flex items-center gap-1.5 min-w-0">
                {breadcrumb && breadcrumb.length > 0 ? (
                  <>
                    {selectedLevel && (
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ring-1 shrink-0",
                          LEVEL_BADGE[selectedLevel],
                        )}
                      >
                        {LEVEL_LABEL_SHORT[selectedLevel]}
                      </span>
                    )}
                    <span className="truncate text-left">
                      {breadcrumb.length > 1 && (
                        <span className="text-muted-foreground">
                          {breadcrumb.slice(0, -1).join(" › ")}
                          {" › "}
                        </span>
                      )}
                      <span>{breadcrumb[breadcrumb.length - 1]}</span>
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">{placeholder}</span>
                )}
              </div>
              <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
            </button>
          }
        />
        <PopoverContent
          align="start"
          className="w-[min(440px,calc(100vw-2rem))] p-0"
        >
          <div className="max-h-[320px] overflow-y-auto">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => select(null)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40 transition-colors border-b",
                  value === null && "bg-muted/30 font-medium",
                )}
              >
                <span className="size-3.5 shrink-0" />
                <span className="flex-1 text-left text-muted-foreground">
                  — brak —
                </span>
                {value === null && (
                  <Check className="size-3.5 text-primary shrink-0" />
                )}
              </button>
            )}
            {categories.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                Brak kategorii. Dodaj je w „Produkty → Kategorie".
              </p>
            ) : (
              <ul>
                {roots.map((r) => (
                  <TreeRow
                    key={r.id}
                    node={r}
                    byParent={byParent}
                    selectedId={value}
                    onSelect={select}
                  />
                ))}
              </ul>
            )}
          </div>
          {value !== null && (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => select(null)}
                className="w-full justify-start text-xs h-7 gap-1.5"
              >
                <X className="size-3" />
                Wyczyść wybór
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

function TreeRow({
  node,
  byParent,
  selectedId,
  onSelect,
}: {
  node: CategoryTreeNode;
  byParent: Map<string | null, CategoryTreeNode[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const children = byParent.get(node.id) ?? [];
  const hasChildren = children.length > 0;
  // Domyślnie rozwinięte żeby user widział całą strukturę przy otwarciu
  const [collapsed, setCollapsed] = React.useState(false);
  const indent = (node.level - 1) * 16;
  const level = node.level as CategoryLevel;
  const isSelected = selectedId === node.id;

  return (
    <>
      <li
        className={cn(
          "flex items-center gap-1.5 hover:bg-muted/40 transition-colors text-sm",
          isSelected && "bg-muted/40 font-medium",
        )}
        style={{ paddingLeft: 8 + indent }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((c) => !c);
            }}
            className="p-0.5 hover:bg-muted rounded shrink-0"
            aria-label={collapsed ? "Rozwiń" : "Zwiń"}
          >
            {collapsed ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex-1 flex items-center gap-1.5 py-1 pr-3 min-w-0 text-left"
        >
          <span
            className={cn(
              "inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ring-1 shrink-0",
              LEVEL_BADGE[level],
            )}
          >
            {LEVEL_LABEL_SHORT[level]}
          </span>
          <span className="flex-1 min-w-0 truncate">{node.name}</span>
          {isSelected && (
            <Check className="size-3.5 text-primary shrink-0" />
          )}
        </button>
      </li>
      {!collapsed &&
        children.map((c) => (
          <TreeRow
            key={c.id}
            node={c}
            byParent={byParent}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
