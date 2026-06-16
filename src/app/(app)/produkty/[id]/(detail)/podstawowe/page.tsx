import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  CircleDollarSign,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Puzzle,
} from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { getProductFull } from "../../_lib/fetchers";
import { PriceHistoryTab } from "../../price-history-tab";
import { BasicInfoFormDisplay } from "../../_components/basic-info-form";
import { productToBasicValues } from "../../_components/basic-info-utils";
import { ComponentsManager } from "../../_components/components-manager";
import { BasePriceEditor } from "../../_components/base-price-editor";

export const dynamic = "force-dynamic";

export default async function PodstawowePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductFull(id);
  if (!product) notFound();
  const companyId = await getCurrentCompanyId();

  const isKomponentowy = product.compositionMode === "KOMPONENTOWY";
  const isZestaw = product.compositionMode === "ZESTAW";
  // Zarówno KOMPONENTOWY jak i ZESTAW mają sloty (ProductComponent) — pokazujemy
  // listę w prawej kolumnie. Różnica: ZESTAW nie wymaga `requiredComponentsTotal`
  // (każdy slot = 1 składnik zestawu), KOMPONENTOWY ma wskazaną liczbę komponentów.
  const showComponents = isKomponentowy || isZestaw;

  // Lista wszystkich kategorii do pickera w modalu edycji
  const allCategories = await db.category.findMany({
    where: { companyId },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      parentId: true,
      level: true,
      customsDutyPct: true,
    },
  });

  // Auto-stawka cła z kategorii (lub przodków)
  const categoryDutyAuto = (() => {
    let cat = allCategories.find((c) => c.id === product.categoryId);
    while (cat) {
      if (cat.customsDutyPct != null) return cat.customsDutyPct;
      cat = allCategories.find((c) => c.id === cat?.parentId) ?? undefined;
    }
    return null;
  })();

  // Dane dla ComponentsManager (gdy KOMPONENTOWY lub ZESTAW)
  const [libraryRaw, componentRules] = showComponents
    ? await Promise.all([
        db.product.findMany({
          where: {
            companyId,
            archived: false,
            id: { not: id },
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            productCode: true,
            code128: true,
            categoryId: true,
            isComponent: true,
            images: {
              where: { isPrimary: true },
              take: 1,
              select: { url: true },
            },
          },
        }),
        db.componentCategoryRule.findMany({
          where: { component: { companyId } },
          select: { componentId: true, categoryId: true, quantity: true },
        }),
      ])
    : [[], []];

  // Wszyscy przodkowie kategorii produktu (do dziedziczenia reguł komponentów)
  const categoryAncestors: string[] = [];
  if (showComponents && product.categoryId) {
    let cur: string | null = product.categoryId;
    const safety = 20;
    let depth = 0;
    while (cur && depth < safety) {
      categoryAncestors.push(cur);
      const node = allCategories.find((c) => c.id === cur);
      cur = node?.parentId ?? null;
      depth++;
    }
  }

  const initialValues = productToBasicValues({
    name: product.name,
    productCode: product.productCode,
    code128: product.code128,
    eanCode: product.eanCode,
    categoryId: product.categoryId,
    compositionMode: product.compositionMode,
    requiredComponentsTotal: product.requiredComponentsTotal,
    weightKg: product.weightKg,
    customsDutyPct: product.customsDutyPct,
    color: product.color,
    colorCode: product.colorCode,
  });

  const primaryImage =
    product.images.find((i) => i.isPrimary) ?? product.images[0] ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-heading font-semibold">
          Podstawowe informacje
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Krok 1 z wizarda — dane bazowe produktu. Klik „Edytuj" otwiera modal
          z dokładnie tym samym widokiem co przy tworzeniu.
        </p>
      </div>

      {/* 2 kolumny w proporcji 5/3: lewa szersza (formularz + ceny), prawa węższa (zdjęcie + komponenty) */}
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_3fr] gap-4">
        {/* LEWA: formularz Krok 1 + Ceny */}
        <div className="space-y-4 min-w-0">
          <Card className="overflow-hidden border-l-4 border-l-emerald-400">
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="size-7 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Info className="size-3.5" />
                </div>
                Krok 1 — Podstawowe
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <BasicInfoFormDisplay
                productId={product.id}
                initialValues={initialValues}
                categories={allCategories.map((c) => ({
                  id: c.id,
                  name: c.name,
                  parentId: c.parentId,
                  level: c.level,
                }))}
                categoryDutyAuto={categoryDutyAuto}
              />
            </CardContent>
          </Card>

          {/* Ceny — pełna szerokość lewej kolumny */}
          <Card className="overflow-hidden border-l-4 border-l-amber-400">
            <CardHeader className="py-3 border-b">
              <CardTitle className="text-sm flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <div className="size-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                    <CircleDollarSign className="size-3.5" />
                  </div>
                  Ceny
                  <span className="text-xs text-muted-foreground tabular-nums font-normal">
                    ({product.priceHistory.length} wpisów)
                  </span>
                </span>
                <Link
                  href={`/produkty/${product.id}/jedna-karta#ceny`}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="size-3" />
                  Pełny widok trading
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <BasePriceEditor
                productId={product.id}
                defaultUnitPricePln={product.defaultUnitPricePln}
                defaultPricePerMeterPln={product.defaultPricePerMeterPln}
                lengthM={product.lengthM}
              />
              <div className="rounded-md bg-amber-50/40 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-900 leading-snug">
                <strong>Trading row</strong> (zakup / logistyka / Allegro /
                Sklep) z edytowalnymi cenami kanałów, marżą i kosztami produkcji
                dostępna jest w widoku „Wyświetl na jednej karcie" → sekcja
                Ceny.
              </div>
              <PriceHistoryTab
                productId={product.id}
                entries={product.priceHistory.map((e) => ({
                  id: e.id,
                  recordedAt: e.recordedAt,
                  factoryPriceUsd: e.factoryPriceUsd,
                  factoryPriceCny: e.factoryPriceCny,
                  factoryPricePln: e.factoryPricePln,
                  landedCostPln: e.landedCostPln,
                  cbmPerUnit: e.cbmPerUnit,
                  notes: e.notes,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* PRAWA: zdjęcie główne + komponenty */}
        <div className="space-y-4 min-w-0">
          <Card className="overflow-hidden">
            <CardHeader className="py-2 border-b">
              <CardTitle className="text-[11px] flex items-center gap-2 text-muted-foreground uppercase tracking-wide">
                <ImageIcon className="size-3.5" />
                Zdjęcie główne
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {primaryImage ? (
                <Link
                  href={`/produkty/${product.id}/grafiki`}
                  className="block relative aspect-square bg-muted group"
                >
                  <Image
                    src={primaryImage.url}
                    alt={primaryImage.alt ?? product.name}
                    fill
                    sizes="320px"
                    className="object-cover transition-opacity group-hover:opacity-80"
                    unoptimized
                  />
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded bg-white/90 backdrop-blur text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity ring-1 ring-slate-200 shadow">
                    <ImageIcon className="size-3" />
                    Zarządzaj zdjęciami
                  </span>
                </Link>
              ) : (
                <Link
                  href={`/produkty/${product.id}/grafiki`}
                  className="aspect-square bg-muted flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground hover:bg-slate-100"
                >
                  <ImageIcon className="size-8 opacity-50" />
                  <span>Dodaj zdjęcie</span>
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Komponenty (dla KOMPONENTOWY) lub Składniki (dla ZESTAW) */}
          {showComponents && (
            <Card
              className={`overflow-hidden border-l-4 ${
                isZestaw ? "border-l-amber-400" : "border-l-violet-400"
              }`}
            >
              <CardHeader className="py-3 border-b">
                <CardTitle className="text-sm flex items-center gap-2">
                  <div
                    className={`size-7 rounded-md flex items-center justify-center ${
                      isZestaw
                        ? "bg-amber-100 text-amber-700"
                        : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    <Puzzle className="size-3.5" />
                  </div>
                  {isZestaw ? "Składniki zestawu" : "Komponenty"}
                  <span className="text-xs text-muted-foreground tabular-nums font-normal">
                    ({product.components.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ComponentsManager
                  productId={product.id}
                  productCategoryId={product.categoryId}
                  requiredComponentsTotal={product.requiredComponentsTotal}
                  pinnedComponents={product.components.map((c) => ({
                    linkId: c.id,
                    componentId: c.component.id,
                    name: c.component.name,
                    productCode: c.component.productCode,
                    isComponent: true,
                    primaryImageUrl: c.component.images[0]?.url ?? null,
                    quantity: c.quantity,
                    poolCategoryIds: c.poolCategories.map((pc) => pc.id),
                    poolCategoryNames: c.poolCategories.map((pc) => pc.name),
                    poolProductIds: c.poolProducts.map((pp) => pp.id),
                    defaultComponentCategoryId: c.component.categoryId,
                    defaultComponentCategoryName:
                      c.component.category?.name ?? null,
                    allowVariants: c.allowVariants,
                  }))}
                  library={libraryRaw.map((p) => ({
                    id: p.id,
                    name: p.name,
                    productCode: p.productCode,
                    code128: p.code128,
                    categoryId: p.categoryId,
                    isComponent: p.isComponent,
                    primaryImageUrl: p.images[0]?.url ?? null,
                  }))}
                  componentRules={componentRules}
                  categoryAncestors={categoryAncestors}
                  categoryTree={allCategories.map((c) => ({
                    id: c.id,
                    name: c.name,
                    parentId: c.parentId,
                    level: c.level,
                  }))}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
