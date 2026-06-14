"use client";

/**
 * Panel "Kontrola produktowa" — sidebar z tabami (Produkty/Komponenty/Wszystko)
 * i 3-kolumnową nawigacją kategorii + tabela z auto-save EditableCell.
 *
 * Layout: sticky lewa kolumna (grafika + nazwa) z scroll horyzontalnym przez
 * sekcje (Podstawowe, Pakowanie, Import, Parametry). Komórki bez wartości
 * pokazują badge "nie uzupełniono".
 */

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { AlertTriangle, ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CategoryTreeNode } from "../../category-tree-select";
import {
  setAuditShippingBoxAction,
  setAuditShippingUnitsAction,
  updateProductAuditFieldAction,
} from "@/server/product-audit";
import type { AuditField } from "@/server/product-audit";

export type AuditShippingBox = {
  id: string;
  name: string;
  internalCode: string | null;
  widthCm: number;
  heightCm: number;
  depthCm: number;
};

// ─── Typy ───────────────────────────────────────────────────────────

export type AuditProduct = {
  id: string;
  name: string;
  productCode: string;
  isComponent: boolean;
  categoryId: string | null;
  eanCode: string | null;
  code128: string | null;
  color: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weightKg: number | null;
  importMode: "KARTON" | "LUZEM";
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
  boxWeightKg: number | null;
  unitsPerBox: number | null;
  masterBoxWidthCm: number | null;
  masterBoxHeightCm: number | null;
  masterBoxDepthCm: number | null;
  masterBoxWeightKg: number | null;
  innerBoxesPerMaster: number | null;
  customsDutyPct: number | null;
  shortDescription: string | null;
  shopDescription: string | null;
  vatRatePct: number | null;
  warrantyMonths: number | null;
  warrantyType: string | null;
  producer: string | null;
  loadCapacityKg: number | null;
  primaryImageUrl: string | null;
  primaryImageAlt: string | null;
  // Przypisany primary karton wysyłkowy (z biblioteki ShippingBox)
  assignedShippingBoxId: string | null;
  assignedShippingBoxName: string | null;
  assignedShippingBoxCode: string | null;
  assignedShippingBoxDims: string | null;
  assignedShippingUnits: number | null;
};

type TypeFilter = "product" | "component" | "all";

// ─── Konfiguracja kolumn / sekcji ───────────────────────────────────

type SimpleFieldDef = {
  key: AuditField;
  label: string;
  kind: "text" | "number" | "int" | "percent" | "enum-import-mode";
  width: number;
};

type SpecialFieldDef = {
  key: "shippingBox" | "shippingBoxUnits";
  label: string;
  kind: "shipping-box-picker" | "shipping-box-units";
  width: number;
};

type FieldDef = SimpleFieldDef | SpecialFieldDef;

type SectionDef = {
  key: string;
  title: string;
  toneClass: string;
  fields: FieldDef[];
};

const SECTIONS: SectionDef[] = [
  {
    key: "basic",
    title: "Podstawowe",
    toneClass: "bg-emerald-50 text-emerald-800",
    fields: [
      { key: "eanCode", label: "EAN", kind: "text", width: 90 },
      { key: "code128", label: "CODE 128", kind: "text", width: 90 },
      { key: "color", label: "Kolor", kind: "text", width: 70 },
      { key: "weightKg", label: "Waga", kind: "number", width: 60 },
      { key: "widthCm", label: "Szer.", kind: "number", width: 55 },
      { key: "heightCm", label: "Wys.", kind: "number", width: 55 },
      { key: "depthCm", label: "Głęb.", kind: "number", width: 55 },
    ],
  },
  {
    key: "packaging",
    title: "Pakowanie",
    toneClass: "bg-indigo-50 text-indigo-800",
    fields: [
      {
        key: "shippingBox",
        label: "Karton",
        kind: "shipping-box-picker",
        width: 180,
      },
      {
        key: "shippingBoxUnits",
        label: "Szt./kart.",
        kind: "shipping-box-units",
        width: 70,
      },
    ],
  },
  {
    key: "import",
    title: "Import",
    toneClass: "bg-cyan-50 text-cyan-800",
    fields: [
      { key: "importMode", label: "Tryb", kind: "enum-import-mode", width: 75 },
      { key: "boxWidthCm", label: "Inner szer.", kind: "number", width: 65 },
      { key: "boxHeightCm", label: "Inner wys.", kind: "number", width: 65 },
      { key: "boxDepthCm", label: "Inner głęb.", kind: "number", width: 65 },
      { key: "boxWeightKg", label: "Inner waga", kind: "number", width: 65 },
      { key: "unitsPerBox", label: "Szt./inner", kind: "int", width: 65 },
      {
        key: "masterBoxWidthCm",
        label: "Mast. szer.",
        kind: "number",
        width: 65,
      },
      {
        key: "masterBoxHeightCm",
        label: "Mast. wys.",
        kind: "number",
        width: 65,
      },
      {
        key: "masterBoxDepthCm",
        label: "Mast. głęb.",
        kind: "number",
        width: 65,
      },
      {
        key: "masterBoxWeightKg",
        label: "Mast. waga",
        kind: "number",
        width: 65,
      },
      {
        key: "innerBoxesPerMaster",
        label: "Inn./mast.",
        kind: "int",
        width: 65,
      },
      { key: "customsDutyPct", label: "Cło %", kind: "percent", width: 60 },
    ],
  },
  {
    key: "params",
    title: "Parametry i opis",
    toneClass: "bg-amber-50 text-amber-800",
    fields: [
      { key: "producer", label: "Producent", kind: "text", width: 100 },
      { key: "vatRatePct", label: "VAT %", kind: "number", width: 55 },
      {
        key: "warrantyMonths",
        label: "Gwar. (m)",
        kind: "int",
        width: 65,
      },
      { key: "warrantyType", label: "Typ gwar.", kind: "text", width: 80 },
      {
        key: "loadCapacityKg",
        label: "Udźwig",
        kind: "int",
        width: 65,
      },
      {
        key: "shortDescription",
        label: "Opis krótki",
        kind: "text",
        width: 150,
      },
      {
        key: "shopDescription",
        label: "Opis sklep",
        kind: "text",
        width: 170,
      },
    ],
  },
];

// ─── Główny panel ───────────────────────────────────────────────────

export function KontrolaPanel({
  products: initialProducts,
  categories,
  shippingBoxes,
  initialCategoryId,
  initialType,
}: {
  products: AuditProduct[];
  categories: CategoryTreeNode[];
  shippingBoxes: AuditShippingBox[];
  initialCategoryId: string | null;
  initialType: TypeFilter;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [activeL1, setActiveL1] = useState<string | null>(initialCategoryId);
  const [activeL2, setActiveL2] = useState<string | null>(null);
  const [activeL3, setActiveL3] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);

  function patchLocalProduct(productId: string, patch: Partial<AuditProduct>) {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, ...patch } : p)),
    );
  }

  // Zbiór ID kategorii w aktywnej gałęzi (z podkategoriami)
  const deepestActiveId = activeL3 ?? activeL2 ?? activeL1;
  const activeBranchIds = useMemo(() => {
    if (!deepestActiveId) return null;
    return new Set(collectDescendants([deepestActiveId], categories));
  }, [deepestActiveId, categories]);

  // Filtrowanie produktów
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (typeFilter === "product" && p.isComponent) return false;
      if (typeFilter === "component" && !p.isComponent) return false;
      if (activeBranchIds) {
        if (p.categoryId == null || !activeBranchIds.has(p.categoryId))
          return false;
      }
      return true;
    });
  }, [products, typeFilter, activeBranchIds]);

  // Liczniki per typ (na bazie wszystkich, nie tylko filtrowanych)
  const counts = useMemo(() => {
    let prod = 0;
    let komp = 0;
    for (const p of products) {
      if (p.isComponent) komp++;
      else prod++;
    }
    return { product: prod, component: komp, all: prod + komp };
  }, [products]);

  // Pula produktów dla licznika kategorii — respektuje typeFilter
  const productsForCount = useMemo(() => {
    return products.filter((p) => {
      if (typeFilter === "product" && p.isComponent) return false;
      if (typeFilter === "component" && !p.isComponent) return false;
      return true;
    });
  }, [products, typeFilter]);

  function countInCategory(catId: string): number {
    const ids = new Set(collectDescendants([catId], categories));
    return productsForCount.filter(
      (p) => p.categoryId != null && ids.has(p.categoryId),
    ).length;
  }

  const level1 = categories
    .filter((c) => c.level === 1)
    .sort((a, b) => a.name.localeCompare(b.name));
  const level2 = activeL1
    ? categories
        .filter((c) => c.parentId === activeL1)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const level3 = activeL2
    ? categories
        .filter((c) => c.parentId === activeL2)
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-4 overflow-hidden">
      {/* Tabs + Kategorie */}
      <div className="space-y-2 shrink-0">
        <TypeTabs
          value={typeFilter}
          onChange={setTypeFilter}
          counts={counts}
        />
        <CategoryNav
          level1={level1}
          level2={level2}
          level3={level3}
          activeL1={activeL1}
          activeL2={activeL2}
          activeL3={activeL3}
          totalCount={productsForCount.length}
          countFn={countInCategory}
          onActivateL1={(id) => {
            setActiveL1(id);
            setActiveL2(null);
            setActiveL3(null);
          }}
          onActivateL2={(id) => {
            setActiveL2(id);
            setActiveL3(null);
          }}
          onActivateL3={(id) => setActiveL3(id)}
          onClearAll={() => {
            setActiveL1(null);
            setActiveL2(null);
            setActiveL3(null);
          }}
        />
      </div>

      {/* Tabela kontroli */}
      <div className="flex-1 min-h-0">
        <AuditTable
          products={filteredProducts}
          categories={categories}
          shippingBoxes={shippingBoxes}
          onPatch={patchLocalProduct}
        />
      </div>
    </div>
  );
}

// ─── TypeTabs ───────────────────────────────────────────────────────

function TypeTabs({
  value,
  onChange,
  counts,
}: {
  value: TypeFilter;
  onChange: (v: TypeFilter) => void;
  counts: { product: number; component: number; all: number };
}) {
  const tabs: { id: TypeFilter; label: string; count: number }[] = [
    { id: "product", label: "Produkty", count: counts.product },
    { id: "component", label: "Komponenty", count: counts.component },
    { id: "all", label: "Wszystko", count: counts.all },
  ];
  return (
    <div className="inline-flex rounded-lg ring-1 ring-slate-200 bg-slate-50 p-0.5 gap-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-all inline-flex items-center gap-2",
            value === t.id
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-white",
          )}
        >
          {t.label}
          <span
            className={cn(
              "tabular-nums text-[10px] px-1.5 py-0 rounded-full",
              value === t.id
                ? "bg-white/20 text-white"
                : "bg-slate-200 text-slate-600",
            )}
          >
            {t.count}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── CategoryNav (3-kol z licznikami) ───────────────────────────────

function CategoryNav({
  level1,
  level2,
  level3,
  activeL1,
  activeL2,
  activeL3,
  totalCount,
  countFn,
  onActivateL1,
  onActivateL2,
  onActivateL3,
  onClearAll,
}: {
  level1: CategoryTreeNode[];
  level2: CategoryTreeNode[];
  level3: CategoryTreeNode[];
  activeL1: string | null;
  activeL2: string | null;
  activeL3: string | null;
  totalCount: number;
  countFn: (id: string) => number;
  onActivateL1: (id: string | null) => void;
  onActivateL2: (id: string | null) => void;
  onActivateL3: (id: string | null) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="rounded-md ring-1 ring-slate-200 bg-white flex divide-x divide-slate-200 h-64">
      <CategoryColumn
        title="Kategoria główna"
        items={level1}
        activeId={activeL1}
        onActivate={(id) => onActivateL1(id === activeL1 ? null : id)}
        levelLabel="Główna"
        levelColor="bg-violet-100 text-violet-800 ring-violet-200"
        emptyLabel="Brak kategorii"
        showAllOption={{
          active: activeL1 === null,
          label: "Wszystkie produkty",
          count: totalCount,
          onClick: onClearAll,
        }}
        countFn={countFn}
      />
      <CategoryColumn
        title="Podkategoria"
        items={level2}
        activeId={activeL2}
        onActivate={(id) => onActivateL2(id === activeL2 ? null : id)}
        levelLabel="Podkategoria"
        levelColor="bg-indigo-100 text-indigo-800 ring-indigo-200"
        emptyLabel={activeL1 ? "Brak podkategorii" : "Wybierz kategorię główną"}
        countFn={countFn}
      />
      <CategoryColumn
        title="Typ produktu"
        items={level3}
        activeId={activeL3}
        onActivate={(id) => onActivateL3(id === activeL3 ? null : id)}
        levelLabel="Typ"
        levelColor="bg-sky-100 text-sky-800 ring-sky-200"
        emptyLabel={activeL2 ? "Brak typów" : "Wybierz podkategorię"}
        countFn={countFn}
      />
    </div>
  );
}

function CategoryColumn({
  title,
  items,
  activeId,
  onActivate,
  levelLabel,
  levelColor,
  emptyLabel,
  showAllOption,
  countFn,
}: {
  title: string;
  items: CategoryTreeNode[];
  activeId: string | null;
  onActivate: (id: string) => void;
  levelLabel: string;
  levelColor: string;
  emptyLabel: string;
  showAllOption?: {
    active: boolean;
    label: string;
    count: number;
    onClick: () => void;
  };
  countFn: (id: string) => number;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-3 py-2 border-b bg-slate-50/80 text-[10px] uppercase tracking-wide font-semibold text-slate-600 shrink-0">
        {title}
      </div>
      {items.length === 0 && !showAllOption ? (
        <div className="flex-1 grid place-items-center p-4 text-xs text-muted-foreground italic text-center">
          {emptyLabel}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {showAllOption && (
            <li className="px-2 py-1">
              <button
                type="button"
                onClick={showAllOption.onClick}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between transition-colors",
                  showAllOption.active
                    ? "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200 font-semibold"
                    : "hover:bg-slate-50 text-slate-700",
                )}
              >
                <span>{showAllOption.label}</span>
                <span className="tabular-nums text-[10px] px-1.5 py-0 rounded-full bg-slate-200 text-slate-600">
                  {showAllOption.count}
                </span>
              </button>
            </li>
          )}
          {items.map((c) => {
            const isActive = activeId === c.id;
            const count = countFn(c.id);
            return (
              <li key={c.id} className="px-2 py-1">
                <button
                  type="button"
                  onClick={() => onActivate(c.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors",
                    isActive
                      ? "bg-violet-50 text-violet-900 ring-1 ring-violet-200 font-medium"
                      : "hover:bg-slate-50 text-slate-700",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1",
                      levelColor,
                    )}
                  >
                    {levelLabel}
                  </span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-[10px] px-1.5 py-0 rounded-full bg-slate-100 text-slate-600">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── AuditTable ─────────────────────────────────────────────────────

function AuditTable({
  products,
  categories,
  shippingBoxes,
  onPatch,
}: {
  products: AuditProduct[];
  categories: CategoryTreeNode[];
  shippingBoxes: AuditShippingBox[];
  onPatch: (productId: string, patch: Partial<AuditProduct>) => void;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-md ring-1 ring-slate-200 bg-slate-50 p-8 text-center text-sm text-muted-foreground italic">
        Brak produktów pasujących do filtrów.
      </div>
    );
  }

  const NAME_COL_WIDTH = 240;

  return (
    <div className="rounded-md ring-1 ring-slate-200 bg-white overflow-auto h-full">
      <table className="border-separate border-spacing-0">
        <thead className="sticky top-0 z-30">
          {/* Wiersz sekcji (group headers) */}
          <tr>
            <th
              className="sticky left-0 z-40 bg-slate-100 border-b border-r border-slate-200 px-2 py-1 text-left text-[9px] uppercase tracking-wide font-semibold text-slate-700"
              style={{ width: NAME_COL_WIDTH, minWidth: NAME_COL_WIDTH }}
            >
              Produkt
            </th>
            {SECTIONS.map((s) => {
              const colSpan = s.fields.length;
              return (
                <th
                  key={s.key}
                  colSpan={colSpan}
                  className={cn(
                    "border-b border-r border-slate-200 px-1.5 py-1 text-center text-[10px] uppercase tracking-wide font-semibold",
                    s.toneClass,
                  )}
                >
                  {s.title}
                </th>
              );
            })}
          </tr>
          {/* Wiersz kolumn */}
          <tr>
            <th
              className="sticky left-0 z-40 bg-slate-50 border-b border-r border-slate-200 px-2 py-1 text-left text-[9px] uppercase tracking-wide font-medium text-slate-500"
              style={{ width: NAME_COL_WIDTH, minWidth: NAME_COL_WIDTH }}
            />
            {SECTIONS.flatMap((s, sIdx) =>
              s.fields.map((f, fIdx) => (
                <th
                  key={f.key}
                  className={cn(
                    "border-b border-slate-200 px-1 py-1 text-left text-[9px] font-medium text-slate-600 bg-slate-50 truncate",
                    fIdx === s.fields.length - 1 &&
                      sIdx < SECTIONS.length - 1 &&
                      "border-r-2 border-slate-300",
                  )}
                  style={{ width: f.width, minWidth: f.width }}
                  title={f.label}
                >
                  {f.label}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {products.map((p, rowIdx) => (
            <ProductRow
              key={p.id}
              product={p}
              categories={categories}
              shippingBoxes={shippingBoxes}
              nameColWidth={NAME_COL_WIDTH}
              evenRow={rowIdx % 2 === 0}
              onPatch={onPatch}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductRow({
  product,
  categories,
  shippingBoxes,
  nameColWidth,
  evenRow,
  onPatch,
}: {
  product: AuditProduct;
  categories: CategoryTreeNode[];
  shippingBoxes: AuditShippingBox[];
  nameColWidth: number;
  evenRow: boolean;
  onPatch: (productId: string, patch: Partial<AuditProduct>) => void;
}) {
  const category = product.categoryId
    ? categories.find((c) => c.id === product.categoryId)
    : null;
  const NAME_LIMIT = 52;
  const isNameTruncated = product.name.length > NAME_LIMIT;
  const displayName = isNameTruncated
    ? `${product.name.slice(0, NAME_LIMIT)}…`
    : product.name;
  return (
    <tr>
      <td
        className={cn(
          "sticky left-0 z-20 border-b border-r border-slate-200 px-1.5 py-1 align-middle",
          evenRow ? "bg-white" : "bg-slate-50/40",
        )}
        style={{ width: nameColWidth, minWidth: nameColWidth }}
      >
        <div className="flex items-center gap-1.5">
          {product.primaryImageUrl ? (
            <div className="relative size-6 rounded overflow-hidden bg-slate-100 shrink-0 ring-1 ring-slate-200">
              <Image
                src={product.primaryImageUrl}
                alt={product.primaryImageAlt ?? product.name}
                fill
                sizes="24px"
                className="object-cover"
                unoptimized
              />
            </div>
          ) : (
            <div className="size-6 rounded bg-slate-100 grid place-items-center text-slate-400 shrink-0 ring-1 ring-slate-200">
              <ImageOff className="size-2.5" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <a
                href={`/produkty/${product.id}`}
                title={isNameTruncated ? product.name : undefined}
                className="text-[11px] font-medium truncate hover:underline leading-tight"
              >
                {displayName}
              </a>
              {product.isComponent && (
                <span className="shrink-0 text-[8px] uppercase font-semibold tracking-wide px-0.5 py-0 rounded bg-violet-100 text-violet-800 ring-1 ring-violet-200 leading-tight">
                  K
                </span>
              )}
            </div>
            <div
              className="text-[9px] font-mono text-slate-500 truncate leading-tight"
              title={`${product.productCode} · ${category?.name ?? "brak kategorii"}`}
            >
              {product.productCode}
            </div>
          </div>
        </div>
      </td>
      {SECTIONS.flatMap((s, sIdx) =>
        s.fields.map((f, fIdx) => (
          <td
            key={f.key}
            className={cn(
              "border-b border-slate-100 p-0 align-middle",
              evenRow ? "bg-white" : "bg-slate-50/40",
              fIdx === s.fields.length - 1 &&
                sIdx < SECTIONS.length - 1 &&
                "border-r-2 border-slate-300",
            )}
            style={{ width: f.width, minWidth: f.width }}
          >
            <EditableCell
              field={f}
              product={product}
              shippingBoxes={shippingBoxes}
              onSaved={(patch) => onPatch(product.id, patch)}
            />
          </td>
        )),
      )}
    </tr>
  );
}

// ─── EditableCell — auto-save na blur ──────────────────────────────

function isSpecialField(f: FieldDef): f is SpecialFieldDef {
  return f.kind === "shipping-box-picker" || f.kind === "shipping-box-units";
}

function EditableCell({
  field,
  product,
  shippingBoxes,
  onSaved,
}: {
  field: FieldDef;
  product: AuditProduct;
  shippingBoxes: AuditShippingBox[];
  onSaved: (patch: Partial<AuditProduct>) => void;
}) {
  // Komórki specjalne (picker / units) mają swoje własne wnętrza
  if (isSpecialField(field)) {
    if (field.kind === "shipping-box-picker") {
      return (
        <ShippingBoxPickerCell
          product={product}
          shippingBoxes={shippingBoxes}
          onSaved={onSaved}
        />
      );
    }
    return <ShippingBoxUnitsCell product={product} onSaved={onSaved} />;
  }

  // Standardowe pole z AuditField
  return (
    <SimpleFieldCell field={field} product={product} onSaved={onSaved} />
  );
}

function SimpleFieldCell({
  field,
  product,
  onSaved,
}: {
  field: SimpleFieldDef;
  product: AuditProduct;
  onSaved: (patch: Partial<AuditProduct>) => void;
}) {
  const initialValue = product[field.key as keyof AuditProduct] as
    | string
    | number
    | null;
  const [draft, setDraft] = useState<string>(stringifyValue(initialValue, field));
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(false);

  // Resync gdy parent zaktualizuje produkt (np. po auto-save innej komórki)
  const initialDisplay = stringifyValue(initialValue, field);
  if (!focused && !pending && draft !== initialDisplay) {
    setDraft(initialDisplay);
  }

  const isEmpty = initialValue === null || initialValue === "";

  function commit() {
    const parsed = parseValue(draft, field);
    if (parsed === "INVALID") {
      toast.error(`„${field.label}" — niepoprawna wartość`);
      setDraft(stringifyValue(initialValue, field));
      return;
    }
    if (sameValue(parsed, initialValue)) return;

    startTransition(async () => {
      try {
        await updateProductAuditFieldAction(product.id, {
          [field.key]: parsed,
        });
        onSaved({ [field.key]: parsed } as Partial<AuditProduct>);
        toast.success(`Zapisano: ${field.label}`, { duration: 1500 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
        setDraft(stringifyValue(initialValue, field));
      }
    });
  }

  if (field.kind === "enum-import-mode") {
    return (
      <select
        value={draft || "KARTON"}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value as "KARTON" | "LUZEM";
          setDraft(v);
          if (v === initialValue) return;
          startTransition(async () => {
            try {
              await updateProductAuditFieldAction(product.id, {
                importMode: v,
              });
              onSaved({ importMode: v });
              toast.success("Zapisano: Tryb", { duration: 1500 });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Błąd zapisu");
              setDraft(stringifyValue(initialValue, field));
            }
          });
        }}
        className={cn(
          "w-full h-6 px-1 text-[10px] font-mono bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-indigo-300 hover:bg-slate-50",
          pending && "opacity-60",
        )}
      >
        <option value="KARTON">KARTON</option>
        <option value="LUZEM">LUZEM</option>
      </select>
    );
  }

  const placeholder = isEmpty ? "—" : "";
  return (
    <div className="relative" title={isEmpty ? "nie uzupełniono" : undefined}>
      <input
        type={field.kind === "text" ? "text" : "number"}
        step={field.kind === "int" ? "1" : "any"}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(stringifyValue(initialValue, field));
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className={cn(
          "w-full h-6 px-1 text-[10px] bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-indigo-300 hover:bg-slate-50",
          field.kind !== "text" && "font-mono text-right",
          isEmpty && "bg-rose-50/40 placeholder:text-rose-400",
          pending && "opacity-60",
        )}
      />
      {isEmpty && !focused && (
        <AlertTriangle className="absolute top-1 right-1 size-2.5 text-rose-400 pointer-events-none" />
      )}
    </div>
  );
}

// ─── ShippingBoxPickerCell — select karton z biblioteki ─────────────

function ShippingBoxPickerCell({
  product,
  shippingBoxes,
  onSaved,
}: {
  product: AuditProduct;
  shippingBoxes: AuditShippingBox[];
  onSaved: (patch: Partial<AuditProduct>) => void;
}) {
  const [pending, startTransition] = useTransition();
  const assignedId = product.assignedShippingBoxId;
  const isEmpty = assignedId == null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const newBoxId = value === "" ? null : value;
    if (newBoxId === assignedId) return;
    startTransition(async () => {
      try {
        await setAuditShippingBoxAction(product.id, { boxId: newBoxId });
        if (newBoxId == null) {
          onSaved({
            assignedShippingBoxId: null,
            assignedShippingBoxName: null,
            assignedShippingBoxCode: null,
            assignedShippingBoxDims: null,
            assignedShippingUnits: null,
          });
        } else {
          const box = shippingBoxes.find((b) => b.id === newBoxId);
          onSaved({
            assignedShippingBoxId: newBoxId,
            assignedShippingBoxName: box?.name ?? null,
            assignedShippingBoxCode: box?.internalCode ?? null,
            assignedShippingBoxDims: box
              ? `${box.widthCm}×${box.heightCm}×${box.depthCm} cm`
              : null,
            // Server zachowuje istniejące unitsPerBox (lub default 1 dla nowego)
            assignedShippingUnits: product.assignedShippingUnits ?? 1,
          });
        }
        toast.success("Zapisano: Karton", { duration: 1500 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  const tooltip = isEmpty
    ? "nie przypisano kartonu"
    : [
        product.assignedShippingBoxName,
        product.assignedShippingBoxCode,
        product.assignedShippingBoxDims,
      ]
        .filter(Boolean)
        .join(" · ");

  return (
    <div className="relative" title={tooltip}>
      <select
        value={assignedId ?? ""}
        disabled={pending}
        onChange={handleChange}
        className={cn(
          "w-full h-6 px-1 text-[10px] bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-indigo-300 hover:bg-slate-50 truncate",
          isEmpty &&
            "bg-rose-50/40 text-rose-500 italic",
          pending && "opacity-60",
        )}
      >
        <option value="">
          {isEmpty ? "— nie przypisano —" : "— odepnij —"}
        </option>
        {shippingBoxes.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.internalCode ? ` (${b.internalCode})` : ""}
          </option>
        ))}
      </select>
      {isEmpty && (
        <AlertTriangle className="absolute top-1 right-4 size-2.5 text-rose-400 pointer-events-none" />
      )}
    </div>
  );
}

// ─── ShippingBoxUnitsCell — sztuk w przypisanym kartonie ────────────

function ShippingBoxUnitsCell({
  product,
  onSaved,
}: {
  product: AuditProduct;
  onSaved: (patch: Partial<AuditProduct>) => void;
}) {
  const initial = product.assignedShippingUnits;
  const hasBox = product.assignedShippingBoxId != null;
  const [draft, setDraft] = useState<string>(initial != null ? String(initial) : "");
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState(false);

  // Resync gdy parent się zmienił
  const initialDisplay = initial != null ? String(initial) : "";
  if (!focused && !pending && draft !== initialDisplay) {
    setDraft(initialDisplay);
  }

  if (!hasBox) {
    return (
      <div
        className="w-full h-6 px-1 text-[10px] text-slate-300 italic flex items-center justify-end"
        title="Najpierw wybierz karton"
      >
        —
      </div>
    );
  }

  function commit() {
    const trimmed = draft.trim();
    if (trimmed === "") {
      // Pusta wartość → nie zapisuj (units jest required)
      setDraft(initialDisplay);
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Liczba sztuk musi być >= 1");
      setDraft(initialDisplay);
      return;
    }
    const parsed = Math.trunc(n);
    if (parsed === initial) return;
    startTransition(async () => {
      try {
        await setAuditShippingUnitsAction(product.id, { unitsPerBox: parsed });
        onSaved({ assignedShippingUnits: parsed });
        toast.success("Zapisano: Szt./kart.", { duration: 1500 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
        setDraft(initialDisplay);
      }
    });
  }

  const isEmpty = initial == null;
  return (
    <div className="relative" title={isEmpty ? "nie uzupełniono" : undefined}>
      <input
        type="number"
        step="1"
        min={1}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setDraft(initialDisplay);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={isEmpty ? "—" : ""}
        className={cn(
          "w-full h-6 px-1 text-[10px] font-mono text-right bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-indigo-300 hover:bg-slate-50",
          isEmpty && "bg-rose-50/40 placeholder:text-rose-400",
          pending && "opacity-60",
        )}
      />
      {isEmpty && !focused && (
        <AlertTriangle className="absolute top-1 right-1 size-2.5 text-rose-400 pointer-events-none" />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function collectDescendants(
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

function stringifyValue(value: unknown, field: SimpleFieldDef): string {
  if (value === null || value === undefined) return "";
  if (field.kind === "percent" && typeof value === "number") {
    // DB trzyma 0..1, UI 0..100
    return String((value * 100).toFixed(2)).replace(/\.?0+$/, "");
  }
  return String(value);
}

function parseValue(
  draft: string,
  field: SimpleFieldDef,
): string | number | null | "INVALID" {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (field.kind === "text") return trimmed;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return "INVALID";
  if (field.kind === "int") return Math.trunc(n);
  // number / percent — % w UI 0..100, zapisujemy "as is" (server konwertuje na 0..1)
  return n;
}

function sameValue(parsed: string | number | null, current: unknown): boolean {
  if (parsed === null && (current === null || current === undefined)) return true;
  if (typeof parsed === "number" && typeof current === "number") {
    return Math.abs(parsed - current) < 1e-9;
  }
  return parsed === current;
}
