import Link from "next/link";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  type CategoryLevel,
  LEVEL_BADGE,
  LEVEL_LABEL_SHORT,
} from "@/lib/categories";

export type CategoryNavItem = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  directCount: number;
  cumulativeCount: number;
};

export function CategoryNav({
  categories,
  totalCount,
  selectedId,
  buildHref,
}: {
  categories: CategoryNavItem[];
  totalCount: number;
  selectedId: string | null;
  buildHref: (catId: string | null) => string;
}) {
  if (categories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Brak kategorii. Dodaj je w „Produkty → Kategorie".
      </p>
    );
  }

  const childrenOf = new Map<string | null, CategoryNavItem[]>();
  const byId = new Map<string, CategoryNavItem>();
  for (const c of categories) {
    byId.set(c.id, c);
    const k = c.parentId ?? null;
    childrenOf.set(k, [...(childrenOf.get(k) ?? []), c]);
  }

  const chain: string[] = [];
  let curId: string | null | undefined = selectedId;
  while (curId) {
    chain.unshift(curId);
    curId = byId.get(curId)?.parentId ?? null;
    if (chain.length > 10) break;
  }
  const [l1Id, l2Id, l3Id] = chain;

  const level1 = childrenOf.get(null) ?? [];
  const level2 = l1Id ? (childrenOf.get(l1Id) ?? []) : [];
  const level3 = l2Id ? (childrenOf.get(l2Id) ?? []) : [];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex divide-x max-h-[280px]">
        <CategoryNavColumn
          title="Kategoria główna"
          cats={level1}
          selectedId={l1Id ?? null}
          buildHref={buildHref}
          allOption={{
            label: "Wszystkie produkty",
            count: totalCount,
            active: selectedId === null,
            href: buildHref(null),
          }}
        />
        <CategoryNavColumn
          title="Podkategoria"
          cats={level2}
          selectedId={l2Id ?? null}
          buildHref={buildHref}
          emptyLabel={l1Id ? "Brak podkategorii" : "Wybierz kategorię główną"}
        />
        <CategoryNavColumn
          title="Typ produktu"
          cats={level3}
          selectedId={l3Id ?? null}
          buildHref={buildHref}
          emptyLabel={l2Id ? "Brak typów" : "Wybierz podkategorię"}
        />
      </div>
    </Card>
  );
}

function CategoryNavColumn({
  title,
  cats,
  selectedId,
  buildHref,
  allOption,
  emptyLabel,
}: {
  title: string;
  cats: CategoryNavItem[];
  selectedId: string | null;
  buildHref: (catId: string | null) => string;
  allOption?: {
    label: string;
    count: number;
    active: boolean;
    href: string;
  };
  emptyLabel?: string;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {allOption && (
          <li>
            <Link
              href={allOption.href}
              className={cn(
                "flex items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors border-b",
                allOption.active
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted/40",
              )}
            >
              <span className="truncate">{allOption.label}</span>
              <span
                className={cn(
                  "text-[10px] tabular-nums rounded-full px-1.5 py-0 ring-1 shrink-0",
                  allOption.active
                    ? "bg-primary/15 text-primary ring-primary/30"
                    : "bg-muted text-muted-foreground ring-border",
                )}
              >
                {allOption.count}
              </span>
            </Link>
          </li>
        )}
        {cats.length === 0 ? (
          <li className="px-3 py-6 text-xs text-muted-foreground text-center italic">
            {emptyLabel ?? "—"}
          </li>
        ) : (
          cats.map((c) => {
            const isActive = selectedId === c.id;
            const level = c.level as CategoryLevel;
            return (
              <li key={c.id}>
                <Link
                  href={buildHref(c.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ring-1 shrink-0",
                      isActive
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : LEVEL_BADGE[level],
                    )}
                  >
                    {LEVEL_LABEL_SHORT[level]}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{c.name}</span>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums rounded-full px-1.5 py-0 ring-1 shrink-0",
                      isActive
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : c.cumulativeCount > 0
                          ? "bg-muted text-muted-foreground ring-border"
                          : "text-muted-foreground/50 ring-border/40",
                    )}
                    title={
                      c.directCount === c.cumulativeCount
                        ? `${c.directCount} produktów`
                        : `${c.directCount} bezpośrednio · ${c.cumulativeCount} w poddrzewie`
                    }
                  >
                    {c.cumulativeCount}
                  </span>
                  {isActive && <span className="text-primary text-xs">›</span>}
                </Link>
              </li>
            );
          })
        )}
      </ul>
      {cats.length > 0 && (
        <div className="border-t bg-muted/20 px-3 py-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium uppercase tracking-wide text-[10px]">
            Razem
          </span>
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 px-2 py-0 tabular-nums text-[11px] font-semibold">
            {cats.reduce((acc, c) => acc + c.cumulativeCount, 0)}
          </span>
        </div>
      )}
    </div>
  );
}
