"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LEVEL_BADGE,
  LEVEL_LABEL,
  LEVEL_LABEL_SHORT,
  LEVEL_NEXT,
  type CategoryLevel,
} from "@/lib/categories";

import {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "@/server/categories";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  parentId: string | null;
  level: number;
  customsDutyPct: number | null;
  commissionPctAllegro: number | null;
  commissionPctSklep: number | null;
  kpkPlnAllegro: number | null;
  kpkPlnSklep: number | null;
  customerShippingPlnAllegro: number | null;
  customerShippingPlnSklep: number | null;
  parent: { id: string; name: string } | null;
  _count: { products: number; children: number };
};

type DialogState =
  | { open: false }
  | {
      open: true;
      mode: "create";
      level: CategoryLevel;
      parentId: string | null;
    }
  | { open: true; mode: "edit"; category: CategoryRow };

export function CategoriesManager({
  categories,
}: {
  categories: CategoryRow[];
}) {
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const byParent = useMemo(() => {
    const map = new Map<string | null, CategoryRow[]>();
    for (const c of categories) {
      const key = c.parentId ?? null;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [categories]);

  const roots = byParent.get(null) ?? [];

  return (
    <>
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setDialog({
              open: true,
              mode: "create",
              level: 1,
              parentId: null,
            })
          }
          className="gap-2"
        >
          <Plus className="size-4" />
          Nowa kategoria główna
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Nie masz jeszcze żadnych kategorii. Dodaj pierwszą — kategorię
            główną.
          </div>
        ) : (
          <ul className="divide-y">
            {roots.map((r) => (
              <CategoryNode
                key={r.id}
                category={r}
                byParent={byParent}
                onEdit={(c) =>
                  setDialog({ open: true, mode: "edit", category: c })
                }
                onAddChild={(parent) =>
                  setDialog({
                    open: true,
                    mode: "create",
                    level: ((parent.level + 1) as CategoryLevel),
                    parentId: parent.id,
                  })
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <CategoryDialog
        dialog={dialog}
        onClose={() => setDialog({ open: false })}
        allCategories={categories}
      />
    </>
  );
}

function CategoryNode({
  category,
  byParent,
  onEdit,
  onAddChild,
}: {
  category: CategoryRow;
  byParent: Map<string | null, CategoryRow[]>;
  onEdit: (c: CategoryRow) => void;
  onAddChild: (parent: CategoryRow) => void;
}) {
  const children = byParent.get(category.id) ?? [];
  const [collapsed, setCollapsed] = useState(false);
  const [pending, startTransition] = useTransition();
  const level = category.level as CategoryLevel;
  const canHaveChildren = level < 3;

  function onDelete() {
    if (!confirm(`Usunąć kategorię "${category.name}"?`)) return;
    startTransition(async () => {
      try {
        await deleteCategoryAction(category.id);
        toast.success("Usunięto kategorię");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  // wcięcie w pikselach per poziom
  const indent = (level - 1) * 24;

  return (
    <>
      <li
        className={cn(
          "flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors",
          level === 1 && "bg-violet-50/30",
        )}
        style={{ paddingLeft: 12 + indent }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="p-0.5 hover:bg-muted rounded shrink-0"
            aria-label={collapsed ? "Rozwiń" : "Zwiń"}
          >
            {collapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        <span
          className={cn(
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 shrink-0",
            LEVEL_BADGE[level],
          )}
        >
          {LEVEL_LABEL_SHORT[level]}
        </span>

        <span className="flex-1 min-w-0 truncate font-medium text-sm">
          {category.name}
        </span>

        <code className="text-[10px] text-muted-foreground hidden sm:inline">
          {category.slug}
        </code>

        {category._count.products > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {category._count.products} prod.
          </span>
        )}

        {category.customsDutyPct != null && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 tabular-nums"
            title="Cło importowe dla produktów w tej kategorii"
          >
            🛃 {(category.customsDutyPct * 100).toFixed(1)}%
          </span>
        )}

        <div className="flex gap-0.5 ml-auto">
          {canHaveChildren && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onAddChild(category)}
              className="h-7 px-2 text-xs gap-1"
              title={`Dodaj ${LEVEL_NEXT[level]}`}
            >
              <Plus className="size-3" />
              {LEVEL_NEXT[level]}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(category)}
            aria-label="Edytuj"
            className="size-7 p-0"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={pending}
            aria-label="Usuń"
            className="size-7 p-0"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </li>

      {!collapsed &&
        children.map((c) => (
          <CategoryNode
            key={c.id}
            category={c}
            byParent={byParent}
            onEdit={onEdit}
            onAddChild={onAddChild}
          />
        ))}
    </>
  );
}

function CategoryDialog({
  dialog,
  onClose,
  allCategories,
}: {
  dialog: DialogState;
  onClose: () => void;
  allCategories: CategoryRow[];
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = dialog.open && dialog.mode === "edit";
  const editing = isEdit ? dialog.category : null;
  const createCtx = dialog.open && dialog.mode === "create" ? dialog : null;

  const level: CategoryLevel = editing
    ? (editing.level as CategoryLevel)
    : createCtx?.level ?? 1;
  const parentId = editing ? editing.parentId : createCtx?.parentId ?? null;
  const parent =
    parentId != null ? allCategories.find((c) => c.id === parentId) : null;

  function onSubmit(formData: FormData) {
    const dutyRaw = formData.get("customsDutyPct") as string | null;
    const dutyTrimmed = dutyRaw?.trim();
    const parseNullableNum = (key: string) => {
      const raw = formData.get(key) as string | null;
      const t = raw?.trim();
      return t && t.length > 0 ? Number(t) : null;
    };
    const payload = {
      name: formData.get("name") as string,
      parentId: parentId,
      level,
      sortOrder: Number(formData.get("sortOrder") || 0),
      customsDutyPct:
        dutyTrimmed && dutyTrimmed.length > 0 ? Number(dutyTrimmed) : null,
      commissionPctAllegro: parseNullableNum("commissionPctAllegro"),
      commissionPctSklep: parseNullableNum("commissionPctSklep"),
      kpkPlnAllegro: parseNullableNum("kpkPlnAllegro"),
      kpkPlnSklep: parseNullableNum("kpkPlnSklep"),
      customerShippingPlnAllegro: parseNullableNum(
        "customerShippingPlnAllegro",
      ),
      customerShippingPlnSklep: parseNullableNum("customerShippingPlnSklep"),
    };

    startTransition(async () => {
      try {
        if (isEdit && editing) {
          await updateCategoryAction(editing.id, payload);
          toast.success("Zapisano zmiany");
        } else {
          await createCategoryAction(payload);
          toast.success("Utworzono kategorię");
        }
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <Dialog open={dialog.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? `Edytuj: ${LEVEL_LABEL[level]}`
              : `Nowa: ${LEVEL_LABEL[level]}`}
          </DialogTitle>
          <DialogDescription>
            {parent
              ? `Pod: ${parent.name}`
              : "Bez rodzica (poziom 1 — kategoria główna)"}
            . Slug zostanie wygenerowany automatycznie z nazwy.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nazwa</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              autoFocus
              placeholder={
                level === 1
                  ? "np. Krzesła welurowe"
                  : level === 2
                    ? "np. Typ E"
                    : "np. Typ E — kolor czarny, złote nogi"
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Kolejność sortowania</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={editing?.sortOrder ?? 0}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="customsDutyPct"
                className="flex items-center gap-2"
              >
                Cło importowe (%)
                <span className="text-[10px] font-normal text-muted-foreground">
                  opcjonalne
                </span>
              </Label>
              <Input
                id="customsDutyPct"
                name="customsDutyPct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="np. 8.5"
                defaultValue={
                  editing?.customsDutyPct != null
                    ? (editing.customsDutyPct * 100).toFixed(1)
                    : ""
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Dziedziczone w dół hierarchii. Produkt może nadpisać własną
                stawką. Auto-doliczane do kosztów zamówienia.
              </p>
            </div>
          </div>

          {/* Domyślne wartości dla kanałów sprzedaży — kaskadują na
              wszystkie pozycje w kategorii (i podkategorii). */}
          <div className="border rounded-lg p-3 space-y-3 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] font-semibold uppercase tracking-wide text-slate-700">
                Domyślne wartości sprzedaży
              </Label>
              <span className="text-[10px] text-muted-foreground italic">
                opcjonalne — kaskadują na wszystkie produkty w tej kategorii
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Allegro */}
              <div className="space-y-2 border-l-2 border-amber-300 pl-3">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-amber-700">
                  Allegro
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="commissionPctAllegro"
                    className="text-[11px] font-normal"
                  >
                    Prowizja (%)
                  </Label>
                  <Input
                    id="commissionPctAllegro"
                    name="commissionPctAllegro"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="np. 12"
                    defaultValue={
                      editing?.commissionPctAllegro != null
                        ? (editing.commissionPctAllegro * 100).toString()
                        : ""
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="kpkPlnAllegro"
                    className="text-[11px] font-normal"
                  >
                    KPK (zł/szt netto)
                  </Label>
                  <Input
                    id="kpkPlnAllegro"
                    name="kpkPlnAllegro"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="np. 5.00"
                    defaultValue={editing?.kpkPlnAllegro?.toString() ?? ""}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="customerShippingPlnAllegro"
                    className="text-[11px] font-normal"
                  >
                    Wysyłka klient (zł/szt netto)
                  </Label>
                  <Input
                    id="customerShippingPlnAllegro"
                    name="customerShippingPlnAllegro"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="np. 12.00"
                    defaultValue={
                      editing?.customerShippingPlnAllegro?.toString() ?? ""
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              {/* Sklep */}
              <div className="space-y-2 border-l-2 border-emerald-300 pl-3">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700">
                  Sklep
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="commissionPctSklep"
                    className="text-[11px] font-normal"
                  >
                    Prowizja (%)
                  </Label>
                  <Input
                    id="commissionPctSklep"
                    name="commissionPctSklep"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="np. 2"
                    defaultValue={
                      editing?.commissionPctSklep != null
                        ? (editing.commissionPctSklep * 100).toString()
                        : ""
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="kpkPlnSklep"
                    className="text-[11px] font-normal"
                  >
                    KPK (zł/szt netto)
                  </Label>
                  <Input
                    id="kpkPlnSklep"
                    name="kpkPlnSklep"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="np. 8.00"
                    defaultValue={editing?.kpkPlnSklep?.toString() ?? ""}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="customerShippingPlnSklep"
                    className="text-[11px] font-normal"
                  >
                    Wysyłka klient (zł/szt netto)
                  </Label>
                  <Input
                    id="customerShippingPlnSklep"
                    name="customerShippingPlnSklep"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="np. 15.00"
                    defaultValue={
                      editing?.customerShippingPlnSklep?.toString() ?? ""
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Te wartości są dziedziczone w dół hierarchii — podkategorie
              odziedziczą jeśli nie ustawisz własnych. Quick-edit z poziomu
              zamówienia (klik na liczbę PROW% / KPK) zaktualizuje tę kategorię
              dla wszystkich produktów.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisuję…" : isEdit ? "Zapisz" : "Utwórz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
