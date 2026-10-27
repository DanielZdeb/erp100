/**
 * Lazy wizard triggers — ładowane pod <Suspense> z page.tsx.
 *
 * Fetchuje droga biblioteke (existingComponents + componentRules + categoryDuty)
 * + kursy NBP i renderuje 3 dialogowe triggery (Nowy produkt / Nowy komponent /
 * Nowy zestaw). Główna tabela produktów renderuje się w międzyczasie bez
 * czekania na te dane.
 */

import { unstable_cache } from "next/cache";

import { db } from "@/lib/db";
import { fetchNbpRate } from "@/lib/nbp-rates";
import { NewProductWizardDialog } from "../new-product-wizard";
import { NewBundleWizardDialog } from "../new-bundle-wizard";
import type { CategoryTreeNode } from "../category-tree-select";
import type { CategoryNode as ComponentCategoryNode } from "../component-category-picker";
import type { BoxOption } from "../[id]/boxes-tab";

const getWizardHeavyLibrary = unstable_cache(
  async (companyId: string) => {
    const [categoryDuty, existingComponents, componentRules] =
      await Promise.all([
        db.category.findMany({
          where: { companyId },
          select: { id: true, customsDutyPct: true },
        }),
        db.product.findMany({
          where: { companyId, archived: false },
          orderBy: [{ isComponent: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            productCode: true,
            code128: true,
            categoryId: true,
            isComponent: true,
            weightKg: true,
            shippingBoxWidthCm: true,
            shippingBoxHeightCm: true,
            shippingBoxDepthCm: true,
            shippingBoxWeightKg: true,
            unitsPerShippingBox: true,
            defaultUnitPriceUsd: true,
            defaultUnitPriceCny: true,
            defaultUnitPricePln: true,
            images: {
              where: { archived: false, status: "READY" },
              orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
              take: 1,
              select: { url: true, thumbnailWebpUrl: true },
            },
          },
        }),
        db.componentCategoryRule.findMany({
          where: { component: { companyId } },
          select: {
            componentId: true,
            categoryId: true,
            quantity: true,
          },
        }),
      ]);
    return { categoryDuty, existingComponents, componentRules };
  },
  ["produkty-wizard-heavy-v2"],
  { revalidate: 300, tags: ["products", "categories"] },
);

export async function WizardTriggers({
  companyId,
  categories,
  componentCategoryOptions,
  availableBoxes,
  defaultContainerM3,
  showComponentsButton,
}: {
  companyId: string;
  categories: CategoryTreeNode[];
  componentCategoryOptions: ComponentCategoryNode[];
  availableBoxes: BoxOption[];
  defaultContainerM3: number;
  showComponentsButton: boolean;
}) {
  const [heavy, usdRate, cnyRate] = await Promise.all([
    getWizardHeavyLibrary(companyId),
    fetchNbpRate("USD"),
    fetchNbpRate("CNY"),
  ]);

  const categoryDutyMap: Record<string, number | null> = Object.fromEntries(
    heavy.categoryDuty.map((c) => [c.id, c.customsDutyPct ?? null]),
  );

  const existingComponentsFlat = heavy.existingComponents.map((c) => ({
    id: c.id,
    name: c.name,
    productCode: c.productCode,
    code128: c.code128,
    categoryId: c.categoryId,
    isComponent: c.isComponent,
    primaryImageUrl: c.images[0]?.url ?? null,
  }));

  const bundleLibrary = heavy.existingComponents.map((c) => ({
    id: c.id,
    name: c.name,
    productCode: c.productCode,
    code128: c.code128,
    categoryId: c.categoryId,
    isComponent: c.isComponent,
    weightKg: c.weightKg,
    shippingBoxWidthCm: c.shippingBoxWidthCm,
    shippingBoxHeightCm: c.shippingBoxHeightCm,
    shippingBoxDepthCm: c.shippingBoxDepthCm,
    shippingBoxWeightKg: c.shippingBoxWeightKg,
    unitsPerShippingBox: c.unitsPerShippingBox,
    defaultUnitPriceUsd: c.defaultUnitPriceUsd,
    defaultUnitPriceCny: c.defaultUnitPriceCny,
  }));

  const rates = {
    usd: usdRate?.mid ?? null,
    cny: cnyRate?.mid ?? null,
    rateDate: usdRate?.effectiveDate ?? cnyRate?.effectiveDate ?? null,
  };

  return (
    <>
      {showComponentsButton && (
        <NewProductWizardDialog
          categories={categories}
          componentCategoryOptions={componentCategoryOptions}
          existingComponents={existingComponentsFlat}
          componentRules={heavy.componentRules}
          categoryDutyMap={categoryDutyMap}
          availableBoxes={availableBoxes}
          rates={rates}
          defaultContainerM3={defaultContainerM3}
          defaultIsComponent
        />
      )}
      <NewProductWizardDialog
        categories={categories}
        componentCategoryOptions={componentCategoryOptions}
        existingComponents={existingComponentsFlat}
        componentRules={heavy.componentRules}
        categoryDutyMap={categoryDutyMap}
        availableBoxes={availableBoxes}
        rates={rates}
        defaultContainerM3={defaultContainerM3}
      />
      <NewBundleWizardDialog
        categories={categories}
        bundleLibrary={bundleLibrary}
        availableBoxes={availableBoxes}
        rates={rates}
      />
    </>
  );
}

export function WizardTriggersFallback() {
  return (
    <>
      <div className="inline-flex h-11 rounded-lg bg-indigo-500/40 ring-1 ring-indigo-700 shadow-sm px-4 items-center gap-2.5 text-sm font-semibold text-white/80 animate-pulse">
        Wczytywanie…
      </div>
      <div className="inline-flex h-11 rounded-lg bg-slate-200 ring-1 ring-slate-300 px-4 items-center text-sm font-semibold text-slate-500 animate-pulse">
        Zestaw…
      </div>
    </>
  );
}
