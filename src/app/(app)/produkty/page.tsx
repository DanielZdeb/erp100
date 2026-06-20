import { Fragment } from "react";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import {
  ChartPie,
  Coins,
  Factory,
  Handshake,
  Megaphone,
  MoreHorizontal,
  Package,
  PackageX,
  Percent,
  Plus,
  Search,
  Ship,
  Stamp,
  Tag,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PRODUCT_STATUSES,
  type ProductStatusT,
} from "@/lib/product-status";
import { DuplicateProductButton, NewProductDialog } from "./product-form-dialog";
import { NewProductWizardDialog } from "./new-product-wizard";
import { QuickPackagingImportButton } from "./_components/quick-packaging-import-button";
import { NewBundleWizardDialog } from "./new-bundle-wizard";
import { ProductRowActions } from "./product-row-actions";
import { EditableSaleCell } from "./editable-sale-cell";
import { ChannelViewSwitcher } from "./channel-view-switcher";
import {
  PriceCellWithHistory,
  type PriceHistoryEntry,
} from "./price-history-popover";
import { ShippingQuotePopover } from "./_components/shipping-quote-popover";
import { FulfillmentBreakdownPopover } from "./_components/fulfillment-breakdown-popover";
import { quoteShippingForProduct } from "@/lib/courier-pricing/product-quote";
import { CategoryNav } from "@/components/category-nav";
import {
  getDefaultContainerM3,
  getFulfillmentSettings,
  getSaleChannelDefaults,
} from "@/server/system-settings";
import { getCompanyFeatureFlags } from "@/server/company-settings";
import { fetchNbpRate } from "@/lib/nbp-rates";
import { calculateShipping } from "@/lib/shipping-calc";

export const dynamic = "force-dynamic";

// ─── Cache'owane fragmenty danych ─────────────────────────────────
// Dane „prawie statyczne" (kategorie, biblioteka pudełek, lista wszystkich
// produktów do wizardu zestawu) cachujemy na 5 min — zmieniają się rzadko,
// ale każde wejście na /produkty je pobiera. Po edycji produktu/kategorii
// odpalamy `revalidateTag("products")` żeby cache się zresetował (server
// actions już to robią — patrz `src/server/products.ts`).
const getWizardLibrary = unstable_cache(
  async (companyId: string) => {
    const [boxes, categoryDuty, existingComponents, componentRules] =
      await Promise.all([
        db.shippingBox.findMany({
          where: { companyId, archived: false },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            internalCode: true,
            packagingType: true,
            widthCm: true,
            heightCm: true,
            depthCm: true,
            cardboardLayers: true,
            origin: true,
            isCollective: true,
            purchasePricePln: true,
            purposeText: true,
            innerBoxesPerMaster: true,
          },
        }),
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
    return { boxes, categoryDuty, existingComponents, componentRules };
  },
  ["produkty-wizard-library"],
  { revalidate: 300, tags: ["products", "categories", "boxes"] },
);

type SearchParams = Promise<{
  q?: string;
  category?: string;
  archived?: string;
  status?: string;
  type?: string;
  mode?: string;
}>;

type PriceMode = "brutto" | "netto";
const DEFAULT_VAT_RATE = 0.23;

function parsePriceMode(v: string | undefined): PriceMode {
  // Konwencja: BRUTTO domyślnie (zgodnie z preferencją usera — wszystko
  // pokazujemy brutto, edycja konwertuje). Netto = explicit ?mode=netto.
  return v === "netto" ? "netto" : "brutto";
}

const ALL_STATUSES = "all";

function parseStatus(v: string | undefined): ProductStatusT | typeof ALL_STATUSES {
  if (v && (PRODUCT_STATUSES as readonly string[]).includes(v)) {
    return v as ProductStatusT;
  }
  return ALL_STATUSES; // domyślnie wszystkie
}

type EntityType = "product" | "component" | "all";

function parseType(v: string | undefined): EntityType {
  if (v === "component" || v === "all") return v;
  return "product";
}

export default async function ProduktyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const companyId = await getCurrentCompanyId();
  const q = params.q?.trim() ?? "";
  const categoryId = params.category;
  const showArchived = params.archived === "1";
  const activeStatus = parseStatus(params.status);
  const activeType = parseType(params.type);
  const priceMode = parsePriceMode(params.mode);

  const buildHref = (overrides: Partial<{
    status: string;
    archived: string;
    q: string;
    category: string;
    type: string;
    mode: string;
  }> = {}) => {
    const sp = new URLSearchParams();
    const effectiveStatus = overrides.status ?? activeStatus;
    if (effectiveStatus && effectiveStatus !== "AKTYWNY") sp.set("status", effectiveStatus);
    const eArch = overrides.archived ?? (showArchived ? "1" : "");
    if (eArch) sp.set("archived", eArch);
    const eQ = overrides.q ?? q;
    if (eQ) sp.set("q", eQ);
    const eCat = overrides.category ?? categoryId ?? "";
    if (eCat) sp.set("category", eCat);
    const eType = overrides.type ?? activeType;
    if (eType && eType !== "product") sp.set("type", eType);
    const eMode = overrides.mode ?? priceMode;
    // Brutto jest defaultem — zapisujemy w URL tylko gdy wybrane netto.
    if (eMode && eMode !== "brutto") sp.set("mode", eMode);
    const qs = sp.toString();
    return qs ? `/produkty?${qs}` : "/produkty";
  };

  const typeFilter =
    activeType === "product"
      ? { isComponent: false }
      : activeType === "component"
        ? { isComponent: true }
        : {};

  // Liczniki w nawigatorze respektują aktywny typ + archiwizację (ale nie q/status —
  // to ma być stałe, niezależne od filtrów tekstowych).
  const navCountWhere = {
    companyId,
    archived: showArchived,
    ...(activeType === "product"
      ? { isComponent: false }
      : activeType === "component"
        ? { isComponent: true }
        : {}),
  };

  const [
    categoriesWithCounts,
    componentCategoryOptionsRaw,
    totalProductCount,
    defaultContainerM3,
    wizardLibrary,
  ] = await Promise.all([
    db.category.findMany({
      where: { companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        level: true,
        _count: { select: { products: { where: navCountWhere } } },
      },
    }),
    db.category.findMany({
      where: { companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        parentId: true,
        level: true,
        _count: {
          select: {
            products: {
              where: { companyId, isComponent: false, archived: false },
            },
          },
        },
      },
    }),
    db.product.count({ where: navCountWhere }),
    getDefaultContainerM3(),
    // Wizard library — cache 5 min, invalidate przez revalidateTag("products"/"boxes"/"categories")
    getWizardLibrary(companyId),
  ]);

  const wizardAvailableBoxes = wizardLibrary.boxes;
  const wizardCategoryDuty = wizardLibrary.categoryDuty;
  const wizardExistingComponents = wizardLibrary.existingComponents;
  const wizardComponentRules = wizardLibrary.componentRules;

  const wizardCategoryDutyMap: Record<string, number | null> =
    Object.fromEntries(
      wizardCategoryDuty.map((c) => [c.id, c.customsDutyPct ?? null]),
    );

  // Spłaszcz primary image — wizard używa pola `primaryImageUrl`
  const wizardExistingComponentsFlat = wizardExistingComponents.map((c) => ({
    id: c.id,
    name: c.name,
    productCode: c.productCode,
    code128: c.code128,
    categoryId: c.categoryId,
    isComponent: c.isComponent,
    primaryImageUrl: c.images[0]?.url ?? null,
  }));

  // Biblioteka dla wizardu zestawu — produkty i komponenty. Produkty mają
  // shippingBox* (pełna kalkulacja kartonów + wagi), komponenty mają tylko
  // weightKg (doliczane do sumy wagowej, bez osobnych kartonów).
  const bundleLibrary = wizardExistingComponents.map((c) => ({
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

  // Kursy NBP (cache 4h) — do przeliczeń USD→PLN i CNY→PLN w wizardzie
  const [wizardUsdRate, wizardCnyRate] = await Promise.all([
    fetchNbpRate("USD"),
    fetchNbpRate("CNY"),
  ]);
  const wizardRates = {
    usd: wizardUsdRate?.mid ?? null,
    cny: wizardCnyRate?.mid ?? null,
    rateDate: wizardUsdRate?.effectiveDate ?? wizardCnyRate?.effectiveDate ?? null,
  };

  // Derive flat categories (do form pickera) z `categoriesWithCounts`
  const categories = categoriesWithCounts.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    level: c.level,
  }));

  // Mapa children + cumulatywne liczniki produktów (subtree)
  const childrenOf = new Map<string | null, typeof categoriesWithCounts>();
  for (const c of categoriesWithCounts) {
    const k = c.parentId ?? null;
    childrenOf.set(k, [...(childrenOf.get(k) ?? []), c]);
  }
  const cumulativeCount = new Map<string, number>();
  function computeCum(catId: string): number {
    const cached = cumulativeCount.get(catId);
    if (cached !== undefined) return cached;
    const cat = categoriesWithCounts.find((c) => c.id === catId);
    if (!cat) return 0;
    let total = cat._count.products;
    for (const child of childrenOf.get(catId) ?? []) {
      total += computeCum(child.id);
    }
    cumulativeCount.set(catId, total);
    return total;
  }
  for (const c of categoriesWithCounts) computeCum(c.id);

  // Descendant set wybranej kategorii — filtr „kategoria + jej poddrzewo"
  function descendants(catId: string): string[] {
    const out: string[] = [catId];
    const stack = [catId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const c of childrenOf.get(id) ?? []) {
        out.push(c.id);
        stack.push(c.id);
      }
    }
    return out;
  }
  const categoryFilterIds = categoryId ? descendants(categoryId) : null;

  const baseWhere = {
    companyId,
    ...(showArchived
      ? { archived: true }
      : { archived: false }),
    ...typeFilter,
    ...(categoryFilterIds
      ? { categoryId: { in: categoryFilterIds } }
      : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { productCode: { contains: q, mode: "insensitive" as const } },
            { eanCode: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Lazy load: jesli user nie wybral kategorii ANI nie szuka ANI nie wlaczyl
  // archiwum, NIE wczytuj 350+ produktow z relacjami. Skipnij przez fake-where
  // ktore zwraca 0 wynikow w mikrosekundach (index lookup po nieistniejacym id).
  // Caly downstream (snapshoty, economy, calc kontenera) operuje na pustej liscie.
  // Router prefetch w Next.js Link sciaga sasiednie kategorie w tle.
  const shouldLoadProducts = !!(
    categoryId ||
    q ||
    showArchived ||
    activeStatus !== "AKTYWNY"
  );
  const skipFilter = shouldLoadProducts
    ? {}
    : { id: { equals: "__skip_no_filter__" } };

  const products = await db.product.findMany({
    where: {
      ...baseWhere,
      ...(activeStatus !== ALL_STATUSES ? { status: activeStatus } : {}),
      ...skipFilter,
    },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { id: true, name: true } },
      images: {
        where: { archived: false, status: "READY" },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { url: true, alt: true, thumbnailWebpUrl: true, thumbnailBlurDataUrl: true },
      },
      shippingBoxes: {
        include: {
          box: {
            select: {
              id: true,
              name: true,
              internalCode: true,
              widthCm: true,
              heightCm: true,
              depthCm: true,
              weightKg: true,
              purchasePricePln: true,
            },
          },
        },
      },
      // Dla ZESTAW: dedykowany karton wysyłkowy (tryb SINGLE_CARTON) z osobnego
      // FK na Product. INDIVIDUAL_PACKAGING = pakowanie ze składników (z m2m).
      bundleShippingBox: {
        select: {
          id: true,
          name: true,
          purchasePricePln: true,
        },
      },
      components: {
        orderBy: { sortOrder: "asc" },
        include: {
          component: {
            select: {
              id: true,
              name: true,
              productCode: true,
              eanCode: true,
              isComponent: true,
              color: true,
              code128: true,
              // Kategoria komponentu (do tooltipa pod nazwą w sub-row).
              category: { select: { id: true, name: true } },
              // Pudełka wysyłkowe komponentu — do tooltipa „Karton" w
              // wierszu zestawu (INDIVIDUAL_PACKAGING: sumujemy pudełka
              // poszczególnych składników).
              shippingBoxes: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                select: {
                  isPrimary: true,
                  purpose: true,
                  unitsPerBox: true,
                  box: {
                    select: {
                      name: true,
                      widthCm: true,
                      heightCm: true,
                      depthCm: true,
                      purchasePricePln: true,
                    },
                  },
                },
              },
              // Fallback dla ZESTAW gdy komponent nie ma jeszcze żadnego zamówienia
              defaultUnitPriceUsd: true,
              defaultUnitPriceCny: true,
              defaultUnitPricePln: true,
              images: {
                where: { archived: false, status: "READY" },
                orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                take: 1,
                select: { url: true, alt: true, thumbnailWebpUrl: true, thumbnailBlurDataUrl: true },
              },
            },
          },
        },
      },
    },
  });
  const componentCategoryOptions = componentCategoryOptionsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    level: c.level,
    productCount: c._count.products,
  }));

  // Pozycje z zamówień — tylko te po negocjacji (status ≥ DOGADYWANE), żeby
  // ceny w „Koszty produkcji" odzwierciedlały realnie wynegocjowane wartości,
  // a nie szkice z PLANOWANE.
  const productIds = products.map((p) => p.id);
  const NEGOTIATED_STATUSES = [
    "DOGADYWANE",
    "PRODUKOWANE",
    "WYPRODUKOWANE",
    "WYSLANE",
    "ODEBRANE",
    "W_MAGAZYNIE",
  ] as const;
  const [allItems, courierRates, fulfillment, saleDefaults, featureFlags] =
    await Promise.all([
      productIds.length > 0
        ? db.importOrderItem.findMany({
            where: {
              productId: { in: productIds },
              order: { companyId, status: { in: [...NEGOTIATED_STATUSES] } },
            },
            orderBy: { createdAt: "desc" },
            // Limit: maks. ~10 pozycji per produkt (popover historii i tak
            // capuje na 10). Dla 130 produktów = 1300 wierszy zamiast wszystkich
            // dotychczasowych zamówień. Zysk: 5-10× szybszy query i mniej danych
            // do dalszego processowania w kalkulacji.
            take: productIds.length * 10,
            select: {
              id: true,
              productId: true,
              quantity: true,
              unitPriceCny: true,
              unitPriceUsd: true,
              unitPricePln: true,
              cnyToPlnRate: true,
              usdToPlnRate: true,
              createdAt: true,
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  status: true,
                  cnyToPlnRate: true,
                  usdToPlnRate: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      db.courierRate.findMany({
        where: { courier: { active: true } },
        include: { courier: { select: { id: true, name: true } } },
        orderBy: { pricePln: "asc" },
      }),
      getFulfillmentSettings(),
      getSaleChannelDefaults(),
      getCompanyFeatureFlags(),
    ]);
  // Top-10 historii per produkt + lastItem (pierwszy z top-10).
  const historyByProduct = new Map<string, (typeof allItems)[number][]>();
  for (const it of allItems) {
    const arr = historyByProduct.get(it.productId) ?? [];
    if (arr.length < 10) {
      arr.push(it);
      historyByProduct.set(it.productId, arr);
    }
  }
  // lastItem = najnowsza pozycja z WYPEŁNIONĄ ceną zakupu (USD lub CNY) i
  // dostępnym kursem przeliczeniowym. Pomijamy szkice/sample bez kwot —
  // inaczej kalkulator ekonomiki produktu lądował na null nawet gdy realna
  // historyczna cena istnieje 1-2 wpisy wstecz.
  const lastItemByProduct = new Map<string, (typeof allItems)[number]>();
  for (const [pid, items] of historyByProduct) {
    const candidate =
      items.find((it) => {
        const hasUsd =
          it.unitPriceUsd != null &&
          (it.usdToPlnRate ?? it.order.usdToPlnRate ?? 0) > 0;
        const hasCny =
          it.unitPriceCny != null &&
          (it.cnyToPlnRate ?? it.order.cnyToPlnRate ?? 0) > 0;
        return hasUsd || hasCny;
      }) ?? items[0];
    if (candidate) lastItemByProduct.set(pid, candidate);
  }

  // ── Ceny komponentów dla ZESTAWÓW (sumujemy do "purchase" zestawu) ──
  // ZESTAW to wirtualny produkt — nie da się go dodać do zamówienia importowego.
  // Cena zakupu ZESTAWU = Σ (komponent.lastPurchasePrice × qty_w_zestawie).
  // Bierzemy z dowolnego statusu zamówienia (włącznie z PLANOWANE) — żeby
  // zestaw pokazywał szkic ceny od razu po planowaniu importu komponentów.
  const bundleComponentIds = new Set<string>();
  for (const p of products) {
    if (p.compositionMode === "ZESTAW") {
      for (const c of p.components) bundleComponentIds.add(c.componentId);
    }
  }
  const componentItemsAllStatus =
    bundleComponentIds.size > 0
      ? await db.importOrderItem.findMany({
          where: {
            productId: { in: [...bundleComponentIds] },
            order: { companyId },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPriceUsd: true,
            unitPriceCny: true,
            unitPricePln: true,
            usdToPlnRate: true,
            cnyToPlnRate: true,
            order: {
              select: { id: true, usdToPlnRate: true, cnyToPlnRate: true },
            },
          },
        })
      : [];
  const componentLastByProduct = new Map<
    string,
    (typeof componentItemsAllStatus)[number]
  >();
  for (const it of componentItemsAllStatus) {
    if (!componentLastByProduct.has(it.productId)) {
      componentLastByProduct.set(it.productId, it);
    }
  }

  // ── Ekonomika per pozycja — SNAPSHOT z ProductPriceHistory ──────────
  // Lista produktów NIE liczy `kalkulujKontener` live. Czyta gotowe wartości
  // ze snapshotów zapisywanych przy przejściu zamówienia w status
  // W_MAGAZYNIE (snapshotOrderPricesToHistory w server/orders.ts).
  // Konsekwencja: zmiana cen w aktywnym zamówieniu (DRAFT, DOGADYWANE...)
  // nie odzwierciedla się na liście produktów do momentu zamknięcia
  // zamówienia. Widok zamówienia natomiast dalej liczy wszystko live.
  //
  // Skutek wydajnościowy: zamiast 8× `kalkulujKontener` (każde z N pozycji
  // + bundle CBM + customs duty resolution) zostaje 1 prosty SELECT.
  // Strona ładuje się <500ms zamiast 5-30s.
  type EconRecord = {
    purchasePerUnitPln: number;
    prowizjaPerUnitPln: number;
    cloPerUnitPln: number;
    logisticsPerUnitPln: number;
    landedPerUnitPln: number;
    goodsValuePerUnitPln: number;
    totalGoodsValuePln: number;
    totalProwizjaPln: number;
    totalCloPln: number;
    totalLogisticsPln: number;
    quantity: number;
  };
  const econByItemId = new Map<string, EconRecord>();
  // Wszystkie snapshoty dla wyświetlanych produktów + komponentów ZESTAW
  // (do bundle aggregation z ostatniego zamknięcia komponentów).
  const allRelevantProductIds = new Set<string>(productIds);
  for (const it of componentItemsAllStatus) {
    allRelevantProductIds.add(it.productId);
  }
  const snapshots =
    allRelevantProductIds.size > 0
      ? await db.productPriceHistory.findMany({
          where: {
            productId: { in: Array.from(allRelevantProductIds) },
            product: { companyId },
            importOrderId: { not: null },
          },
          orderBy: { recordedAt: "desc" },
          select: {
            productId: true,
            importOrderId: true,
            factoryPricePln: true,
            landedCostPln: true,
            prowizjaPerUnitPln: true,
            cloPerUnitPln: true,
            logisticsPerUnitPln: true,
          },
        })
      : [];
  // Mapa: orderId → productId → snapshot. Używamy później do podpięcia
  // ekonomiki pod `lastItemByProduct` oraz historię w popoverze.
  // Helper który mapuje (orderId, productId) → econ używamy przez itemId
  // bo to klucz w historyForPopover.
  // Dla każdej pozycji z `allItems` (jest sortowane DESC) próbujemy
  // znaleźć snapshot dla (productId, orderId). Jeśli istnieje — uzupełniamy
  // econByItemId. Jeśli nie — pozycja po prostu nie będzie miała ekonomiki
  // (popover pokaże mniej szczegółów, ale strona się załaduje).
  const snapshotByOrderProduct = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    if (!s.importOrderId) continue;
    const key = `${s.importOrderId}:${s.productId}`;
    if (!snapshotByOrderProduct.has(key)) {
      snapshotByOrderProduct.set(key, s);
    }
  }
  for (const it of allItems) {
    const s = snapshotByOrderProduct.get(`${it.order.id}:${it.productId}`);
    if (!s) continue;
    const purchase = s.factoryPricePln ?? 0;
    const prowizja = s.prowizjaPerUnitPln ?? 0;
    const clo = s.cloPerUnitPln ?? 0;
    const log = s.logisticsPerUnitPln ?? 0;
    const landed = s.landedCostPln ?? purchase + prowizja + clo + log;
    const q = Math.max(1, it.quantity);
    econByItemId.set(it.id, {
      purchasePerUnitPln: purchase,
      prowizjaPerUnitPln: prowizja,
      cloPerUnitPln: clo,
      logisticsPerUnitPln: log,
      landedPerUnitPln: landed,
      goodsValuePerUnitPln: purchase,
      totalGoodsValuePln: purchase * q,
      totalProwizjaPln: prowizja * q,
      totalCloPln: clo * q,
      totalLogisticsPln: log * q,
      quantity: q,
    });
  }
  // Komponenty ZESTAW — to samo mapowanie.
  for (const it of componentItemsAllStatus) {
    const s = snapshotByOrderProduct.get(`${it.order.id}:${it.productId}`);
    if (!s) continue;
    if (econByItemId.has(it.id)) continue;
    const purchase = s.factoryPricePln ?? 0;
    const prowizja = s.prowizjaPerUnitPln ?? 0;
    const clo = s.cloPerUnitPln ?? 0;
    const log = s.logisticsPerUnitPln ?? 0;
    const landed = s.landedCostPln ?? purchase + prowizja + clo + log;
    const q = Math.max(1, it.quantity);
    econByItemId.set(it.id, {
      purchasePerUnitPln: purchase,
      prowizjaPerUnitPln: prowizja,
      cloPerUnitPln: clo,
      logisticsPerUnitPln: log,
      landedPerUnitPln: landed,
      goodsValuePerUnitPln: purchase,
      totalGoodsValuePln: purchase * q,
      totalProwizjaPln: prowizja * q,
      totalCloPln: clo * q,
      totalLogisticsPln: log * q,
      quantity: q,
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">
            Produkty i komponenty
          </h1>
          <p className="text-sm text-muted-foreground">
            Katalog produktów i komponentów importowanych z Chin.
          </p>
        </div>
        <div className="flex gap-2">
          {featureFlags.componentsEnabled && (
            <NewProductWizardDialog
              categories={categories}
              componentCategoryOptions={componentCategoryOptions}
              existingComponents={wizardExistingComponentsFlat}
              componentRules={wizardComponentRules}
              categoryDutyMap={wizardCategoryDutyMap}
              availableBoxes={wizardAvailableBoxes}
              rates={wizardRates}
              defaultContainerM3={defaultContainerM3}
              defaultIsComponent
            />
          )}
          <NewProductWizardDialog
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            existingComponents={wizardExistingComponentsFlat}
            componentRules={wizardComponentRules}
            categoryDutyMap={wizardCategoryDutyMap}
            availableBoxes={wizardAvailableBoxes}
            rates={wizardRates}
            defaultContainerM3={defaultContainerM3}
          />
          {/* Zestawy są zawsze dostępne — to nie funkcja opcjonalna firmy,
              tylko sposób grupowania istniejących produktów dla sprzedaży. */}
          <NewBundleWizardDialog
            categories={categories}
            bundleLibrary={bundleLibrary}
            availableBoxes={wizardAvailableBoxes}
            rates={wizardRates}
          />
        </div>
      </div>

      {/* Przełącznik typu + tryb cen (netto/brutto) */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="inline-flex rounded-lg ring-1 ring-border bg-card p-0.5 gap-0.5 w-fit">
          {(
            [
              { id: "product", label: "Produkty" },
              { id: "component", label: "Komponenty" },
              { id: "all", label: "Wszystko" },
            ] as { id: EntityType; label: string }[]
          ).map((tab) => (
            <Link
              key={tab.id}
              href={buildHref({ type: tab.id, status: "AKTYWNY" })}
              className={cn(
                "px-3 py-1 rounded-md text-sm font-medium transition-colors",
                activeType === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Nawigator kategorii — pełne drzewo z licznikami */}
      <CategoryNav
        categories={categoriesWithCounts.map((c) => ({
          id: c.id,
          name: c.name,
          parentId: c.parentId,
          level: c.level,
          directCount: c._count.products,
          cumulativeCount: cumulativeCount.get(c.id) ?? 0,
        }))}
        totalCount={totalProductCount}
        selectedId={categoryId ?? null}
        buildHref={(catId) => buildHref({ category: catId ?? "" })}
      />

      <form className="flex flex-wrap gap-3" method="GET">
        {activeStatus !== ALL_STATUSES && (
          <input type="hidden" name="status" value={activeStatus} />
        )}
        {showArchived && <input type="hidden" name="archived" value="1" />}
        {categoryId && (
          <input type="hidden" name="category" value={categoryId} />
        )}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            name="q"
            placeholder="Szukaj po nazwie, kodzie produktu lub EAN…"
            defaultValue={q}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">Szukaj</Button>
        {(q || categoryId || showArchived) && (
          <Link
            href={buildHref({ q: "", category: "", archived: "" })}
            className={buttonVariants({ variant: "ghost" })}
          >
            Wyczyść
          </Link>
        )}
        <div className="ml-auto">
          <Link
            href={buildHref({ archived: showArchived ? "" : "1" })}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            {showArchived ? "Pokaż aktywne" : "Pokaż zarchiwizowane"}
          </Link>
        </div>
      </form>

      {/* Brutto/Netto toggle usunięty — domyślnie pokazujemy brutto, edycja
       *  przez popover daje oba pola (netto + brutto) z autosynchronizacją.
       *  Hover na komórce cenowej pokazuje tooltip z obiema wartościami. */}

      <ChannelViewSwitcher>
      <Card className="p-0 overflow-hidden">
        {products.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground space-y-2">
            {!shouldLoadProducts ? (
              <>
                <p className="font-medium text-foreground">
                  Wybierz kategorię żeby zobaczyć produkty
                </p>
                <p className="text-xs">
                  Lista nie ładuje się od razu, bo masz {totalProductCount}{" "}
                  produktów. Klik na kategorię w panelu powyżej (kategorie się
                  prefetchują w tle — przełączanie powinno być natychmiastowe
                  po pierwszym wczytaniu).
                </p>
                <p className="text-xs">
                  Alternatywnie: użyj <strong>szukajki</strong> lub włącz{" "}
                  <strong>archiwum</strong> żeby wymusić załadowanie.
                </p>
              </>
            ) : q || categoryId ? (
              "Brak produktów dla podanych filtrów."
            ) : (
              "Brak produktów w tej kategorii statusu."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <TooltipProvider>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  {/* Marker (pionowy znacznik typu produktu — np. ZESTAW).
                      Wąska kolumna 16px po lewej stronie. */}
                  <th
                    colSpan={2}
                    className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    Produkt
                  </th>
                  {/* Koszty z Chin: cena + prow + cło + log + suma = 5 kolumn */}
                  <th
                    colSpan={5}
                    className="text-center px-2 py-1.5 border-l border-r text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    Koszty z chin
                  </th>
                  <th
                    colSpan={3}
                    className="text-center px-2 py-1.5 border-r bg-indigo-50/60 text-[10px] uppercase tracking-wide text-indigo-700"
                  >
                    Wysyłka
                  </th>
                  <th
                    colSpan={6}
                    className="cv-allegro text-center px-2 py-1.5 border-r bg-amber-50/60 text-[10px] uppercase tracking-wide text-amber-700"
                  >
                    Allegro ({priceMode})
                  </th>
                  <th
                    colSpan={6}
                    className="cv-sklep text-center px-2 py-1.5 border-r bg-emerald-50/60 text-[10px] uppercase tracking-wide text-emerald-700"
                  >
                    Sklep ({priceMode})
                  </th>
                  <th className="text-center px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Pliki / Akcje
                  </th>
                </tr>
                <tr className="bg-muted/20 border-b text-[10px] text-muted-foreground uppercase tracking-wide">
                  {/* Pusty marker — pod headerem „Produkt", przykryty przez
                      rowSpan w body (dla ZESTAW) lub pusty (dla pojedynczych). */}
                  <th className="w-4" aria-hidden />
                  <th className="text-left px-2 py-1 font-medium w-[260px]">
                    Nazwa
                  </th>
                  {/* Sub-headery "Koszty z Chin" — colSpan=5 z flex
                      justify-between żeby IKONY/NAZWY pokrywały się DOKŁADNIE
                      z wartościami w formule body (która używa tego samego
                      flex layoutu). 5 niezależnych <th> miało naturalne
                      szerokości i rozjeżdżały się z body. */}
                  <th colSpan={5} className="px-2 py-1 font-medium border-l border-r">
                    {/* Identyczny grid jak body td — 5 ikon w 1fr-kolumnach
                        + 4 placeholdery separatorów (opacity-0). Dzięki temu
                        każda ikona jest dokładnie nad swoją wartością. */}
                    <span className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-baseline gap-1 w-full [&>*]:flex [&>*]:justify-center">
                      <Tooltip>
                        <TooltipTrigger className="inline-flex">
                          <Factory className="size-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>CENA Z FABRYKI</TooltipContent>
                      </Tooltip>
                      <span aria-hidden className="opacity-0 select-none">+</span>
                      <Tooltip>
                        <TooltipTrigger className="inline-flex">
                          <Handshake className="size-3.5 text-amber-700" />
                        </TooltipTrigger>
                        <TooltipContent>PROWIZJA POŚREDNIKA</TooltipContent>
                      </Tooltip>
                      <span aria-hidden className="opacity-0 select-none">+</span>
                      <Tooltip>
                        <TooltipTrigger className="inline-flex">
                          <Stamp className="size-3.5 text-rose-700" />
                        </TooltipTrigger>
                        <TooltipContent>CŁO</TooltipContent>
                      </Tooltip>
                      <span aria-hidden className="opacity-0 select-none">+</span>
                      <Tooltip>
                        <TooltipTrigger className="inline-flex">
                          <Ship className="size-3.5 text-indigo-600" />
                        </TooltipTrigger>
                        <TooltipContent>DODATKOWE</TooltipContent>
                      </Tooltip>
                      <span aria-hidden className="opacity-0 select-none">=</span>
                      <Tooltip>
                        <TooltipTrigger className="inline-flex">
                          <Coins className="size-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>SUMA / SZT</TooltipContent>
                      </Tooltip>
                    </span>
                  </th>
                  {/* 5 sub-headerów połączonych w 1 colSpan=5 powyżej —
                      reszta usunięta. */}
                  <th className="text-center px-2 py-1 font-medium bg-indigo-50/40 min-w-[52px] align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Truck className="size-3.5 text-indigo-700" />
                      </TooltipTrigger>
                      <TooltipContent>WYSYŁKA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="text-center px-2 py-1 font-medium bg-indigo-50/40 min-w-[52px] align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Warehouse className="size-3.5 text-indigo-700" />
                      </TooltipTrigger>
                      <TooltipContent>FULFILLMENT</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="text-center px-2 py-1 font-medium bg-indigo-50/40 border-r min-w-[52px] align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Package className="size-3.5 text-indigo-700" />
                      </TooltipTrigger>
                      <TooltipContent>KARTON</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-allegro text-center px-2 py-1 font-medium bg-amber-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Tag className="size-3.5 text-amber-700" />
                      </TooltipTrigger>
                      <TooltipContent>CENA SPRZEDAŻY</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-allegro text-center px-2 py-1 font-medium bg-amber-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Percent className="size-3.5 text-amber-700" />
                      </TooltipTrigger>
                      <TooltipContent>PROWIZJA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-allegro text-center px-2 py-1 font-medium bg-amber-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Truck className="size-3.5 text-amber-700" />
                      </TooltipTrigger>
                      <TooltipContent>WYSYŁKA OD KLIENTA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-allegro text-center px-2 py-1 font-medium bg-amber-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <MoreHorizontal className="size-3.5 text-amber-700" />
                      </TooltipTrigger>
                      <TooltipContent>INNE KOSZTY</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-allegro text-center px-2 py-1 font-medium bg-amber-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <TrendingUp className="size-3.5 text-amber-700" />
                      </TooltipTrigger>
                      <TooltipContent>ZYSK</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-allegro text-center px-2 py-1 font-medium bg-amber-50/40 border-r align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <ChartPie className="size-3.5 text-amber-700" />
                      </TooltipTrigger>
                      <TooltipContent>MARŻA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-sklep text-center px-2 py-1 font-medium bg-emerald-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Tag className="size-3.5 text-emerald-700" />
                      </TooltipTrigger>
                      <TooltipContent>CENA SPRZEDAŻY</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-sklep text-center px-2 py-1 font-medium bg-emerald-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Percent className="size-3.5 text-emerald-700" />
                      </TooltipTrigger>
                      <TooltipContent>PROWIZJA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-sklep text-center px-2 py-1 font-medium bg-emerald-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Truck className="size-3.5 text-emerald-700" />
                      </TooltipTrigger>
                      <TooltipContent>WYSYŁKA OD KLIENTA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-sklep text-center px-2 py-1 font-medium bg-emerald-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <Megaphone className="size-3.5 text-emerald-700" />
                      </TooltipTrigger>
                      <TooltipContent>REKLAMA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-sklep text-center px-2 py-1 font-medium bg-emerald-50/40 align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <TrendingUp className="size-3.5 text-emerald-700" />
                      </TooltipTrigger>
                      <TooltipContent>ZYSK</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="cv-sklep text-center px-2 py-1 font-medium bg-emerald-50/40 border-r align-middle">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex w-full items-center justify-center">
                        <ChartPie className="size-3.5 text-emerald-700" />
                      </TooltipTrigger>
                      <TooltipContent>MARŻA</TooltipContent>
                    </Tooltip>
                  </th>
                  <th className="text-center px-2 py-1 font-medium">
                    Akcje
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const lastItem = lastItemByProduct.get(p.id) ?? null;
                  const logisticsPerUnit = lastItem
                    ? (econByItemId.get(lastItem.id)?.logisticsPerUnitPln ?? null)
                    : null;
                  // SKU dla fulfillmentu: ZESTAW liczymy sumę sztuk komponentów
                  // (zestaw stołowy: 1 blat + 1 nogi + 6 krzeseł = 8 SKU magazyn).
                  // KOMPONENTOWY: liczba slotów. CALOSCIOWY: 1.
                  const skuCount =
                    p.compositionMode === "ZESTAW"
                      ? Math.max(
                          1,
                          p.components.reduce(
                            (s, c) => s + Math.max(0, c.quantity),
                            0,
                          ),
                        )
                      : Math.max(1, p.components.length || 1);
                  // Wycena wysyłki z silnika InPost+DHL — preferuj primary
                  // SHIPPING, fallback do FACTORY (z Chin) gdy nie ma SHIPPING.
                  // Produkt z tylko FACTORY i tak jest wysyłany w tym pudle.
                  const primaryShippingPin =
                    p.shippingBoxes.find(
                      (sb) => sb.purpose === "SHIPPING" && sb.isPrimary,
                    ) ??
                    p.shippingBoxes.find((sb) => sb.purpose === "SHIPPING") ??
                    p.shippingBoxes.find(
                      (sb) => sb.purpose === "FACTORY" && sb.isPrimary,
                    ) ??
                    p.shippingBoxes.find((sb) => sb.purpose === "FACTORY") ??
                    null;
                  const shippingQuote = primaryShippingPin
                    ? quoteShippingForProduct({
                        productWeightKg: p.weightKg,
                        primaryBox: {
                          widthCm: primaryShippingPin.box.widthCm,
                          heightCm: primaryShippingPin.box.heightCm,
                          depthCm: primaryShippingPin.box.depthCm,
                          weightKg: primaryShippingPin.box.weightKg,
                        },
                        preferredServiceCodes: p.preferredShippingServices,
                        excludedServiceCodes: p.excludedShippingServices,
                        excludedBrands: p.excludedShippingBrands,
                      })
                    : null;
                  const shippingFromEngine = shippingQuote?.primary?.totalNetPln ?? null;
                  // Dla ZESTAW — zsumuj ceny zakupu + logistykę z komponentów
                  // (ostatnie z bazy, fallback do defaultUnitPriceUsd) i przekaż
                  // jako override do computeProductEconomics.
                  // ZESTAW — wszystkie składniki kosztów z Chin liczymy
                  // jako sumę z komponentów × quantity, na podstawie ich
                  // OSTATNIEGO zamówienia (econByItemId pochodzi z calc
                  // kontenera tego zamówienia → spójne z items-tab).
                  let bundlePurchasePln: number | null = null;
                  let bundleLogisticsPln: number | null = null;
                  let bundleProwizjaPln: number | null = null;
                  let bundleCloPln: number | null = null;
                  if (p.compositionMode === "ZESTAW" && p.components.length > 0) {
                    let purchaseSum = 0;
                    let logisticsSum = 0;
                    let prowizjaSum = 0;
                    let cloSum = 0;
                    let anyPurchaseMissing = false;
                    let anyLogisticsMissing = false;
                    let anyProwizjaMissing = false;
                    let anyCloMissing = false;
                    for (const c of p.components) {
                      const compLast = componentLastByProduct.get(c.componentId);
                      const cny =
                        compLast?.unitPriceCny ?? c.component.defaultUnitPriceCny ?? null;
                      const usd =
                        compLast?.unitPriceUsd ?? c.component.defaultUnitPriceUsd ?? null;
                      const cnyRate =
                        compLast?.cnyToPlnRate ??
                        compLast?.order.cnyToPlnRate ??
                        null;
                      const usdRate =
                        compLast?.usdToPlnRate ??
                        compLast?.order.usdToPlnRate ??
                        null;
                      let compPricePln: number | null = null;
                      if (cny != null && cnyRate) compPricePln = cny * cnyRate;
                      else if (usd != null && usdRate)
                        compPricePln = usd * usdRate;
                      // PL (materiał krajowy): cena bezpośrednio w PLN —
                      // fallback z ostatniej pozycji, potem z defaultu.
                      if (compPricePln == null) {
                        const pln =
                          compLast?.unitPricePln ??
                          c.component.defaultUnitPricePln ??
                          null;
                        if (pln != null && pln > 0) compPricePln = pln;
                      }
                      if (compPricePln == null) {
                        anyPurchaseMissing = true;
                      } else {
                        purchaseSum += compPricePln * c.quantity;
                      }
                      // Reszta kosztów (logistyka shared, prowizja, cło) —
                      // z calc kontenera ostatniego zamówienia komponentu.
                      const compEcon = compLast
                        ? econByItemId.get(compLast.id) ?? null
                        : null;
                      const compLog = compEcon?.logisticsPerUnitPln ?? null;
                      const compProw = compEcon?.prowizjaPerUnitPln ?? null;
                      const compClo = compEcon?.cloPerUnitPln ?? null;
                      if (compLog == null) anyLogisticsMissing = true;
                      else logisticsSum += compLog * c.quantity;
                      if (compProw == null) anyProwizjaMissing = true;
                      else prowizjaSum += compProw * c.quantity;
                      if (compClo == null) anyCloMissing = true;
                      else cloSum += compClo * c.quantity;
                    }
                    if (!anyPurchaseMissing) bundlePurchasePln = purchaseSum;
                    if (!anyLogisticsMissing) bundleLogisticsPln = logisticsSum;
                    if (!anyProwizjaMissing) bundleProwizjaPln = prowizjaSum;
                    if (!anyCloMissing) bundleCloPln = cloSum;
                  }
                  // Wyciągamy prowizję/cło z calc kontenera ostatniego
                  // zamówienia żeby marża i suma „koszty z Chin" były 1:1
                  // z kalkulatorem zamówienia. Dla ZESTAW — używamy sumy
                  // z komponentów (bundle*), bo sam ZESTAW jest produktem
                  // wirtualnym i nie ma własnego importu.
                  const lastEcon = lastItem
                    ? econByItemId.get(lastItem.id)
                    : null;
                  const importExtras = {
                    prowizjaPerUnit:
                      bundleProwizjaPln ?? lastEcon?.prowizjaPerUnitPln ?? 0,
                    cloPerUnit:
                      bundleCloPln ?? lastEcon?.cloPerUnitPln ?? 0,
                  };
                  const econ = computeProductEconomics(
                    { ...p, skuCount },
                    lastItem,
                    courierRates,
                    fulfillment,
                    saleDefaults,
                    bundleLogisticsPln ?? logisticsPerUnit,
                    shippingFromEngine,
                    bundlePurchasePln,
                    importExtras,
                  );
                  const history = historyByProduct.get(p.id) ?? [];
                  // Factor: netto domyślnie, brutto = × (1 + VAT)
                  const factor =
                    priceMode === "brutto" ? 1 + DEFAULT_VAT_RATE : 1;
                  const dpln = (n: number | null | undefined) =>
                    n == null ? n : n * factor;
                  // ZESTAW: rowSpan markera = 1 (main) + liczba komponentów.
                  const isZestaw = p.compositionMode === "ZESTAW";
                  const markerRowSpan = isZestaw
                    ? 1 + p.components.length
                    : 1;
                  return (
                    <Fragment key={p.id}>
                    <tr
                      className={cn(
                        "border-b hover:bg-muted/20",
                        // Grubsza pozioma linia oddziela kolejne ZESTAWy
                        // wizualnie od siebie (z sub-rows komponentow).
                        isZestaw && "border-t-4 border-t-slate-300",
                      )}
                    >
                      {/* MARKER: pionowy napis "ZESTAW" pokrywający main +
                          wszystkie sub-rows komponentów (rowSpan). */}
                      <td
                        rowSpan={markerRowSpan}
                        className={cn(
                          "w-4 p-0 align-middle text-center",
                          isZestaw
                            ? "bg-amber-100 border-r border-amber-200"
                            : "",
                        )}
                      >
                        {isZestaw && (
                          <span
                            className="inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-amber-800 whitespace-nowrap"
                            style={{
                              writingMode: "vertical-rl",
                              transform: "rotate(180deg)",
                            }}
                          >
                            Zestaw
                          </span>
                        )}
                      </td>
                      {/* PRODUKT: Nazwa (skrót + tooltip z pełnymi danymi —
                          taki sam wzorzec jak items-tab w zamówieniu) */}
                      <td className="px-2 py-2 align-top w-[260px] max-w-[260px]">
                        <div className="flex items-start gap-2">
                          {p.images[0] ? (
                            // 144×144 WebP miniaturka (~5 KB) — zwykła <img>
                            // wystarczy, bo plik jest już zoptymalizowany.
                            // Fallback: jeśli brak thumb (np. AI-gen sprzed dorobienia
                            // sharp lub legacy) — używamy pełnego URL.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={
                                p.images[0].thumbnailWebpUrl ?? p.images[0].url
                              }
                              alt={p.images[0].alt ?? p.name}
                              width={36}
                              height={36}
                              loading="lazy"
                              decoding="async"
                              className="size-9 rounded object-cover bg-muted shrink-0 ring-1 ring-border"
                            />
                          ) : (
                            <div className="size-9 rounded bg-muted shrink-0 ring-1 ring-border" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Tooltip>
                                <TooltipTrigger className="block max-w-[220px] cursor-help py-1">
                                  <Link
                                    href={`/produkty/${p.id}`}
                                    className="font-medium text-xs hover:underline truncate block text-left w-full"
                                  >
                                    {p.name}
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[360px]">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-[12px]">
                                      {p.name}
                                    </div>
                                    <div className="text-[10px] opacity-80">
                                      <span className="opacity-60">SKU:</span>{" "}
                                      <code className="font-mono">
                                        {p.productCode}
                                      </code>
                                    </div>
                                    {p.eanCode && (
                                      <div className="text-[10px] opacity-80">
                                        <span className="opacity-60">
                                          EAN:
                                        </span>{" "}
                                        <code className="font-mono">
                                          {p.eanCode}
                                        </code>
                                      </div>
                                    )}
                                    {p.code128 && (
                                      <div className="text-[10px] opacity-80">
                                        <span className="opacity-60">
                                          Code128:
                                        </span>{" "}
                                        <code className="font-mono">
                                          {p.code128}
                                        </code>
                                      </div>
                                    )}
                                    {p.category?.name && (
                                      <div className="text-[10px] opacity-80">
                                        <span className="opacity-60">
                                          Kategoria:
                                        </span>{" "}
                                        {p.category.name}
                                      </div>
                                    )}
                                    {p.compositionMode === "ZESTAW" &&
                                      p.components.length > 0 && (
                                        <div className="text-[10px] opacity-80 pt-1 border-t mt-1">
                                          <span className="opacity-60">
                                            Składa się z:
                                          </span>
                                          <ul className="ml-2 mt-0.5 space-y-0.5">
                                            {p.components.map((pc) => (
                                              <li key={pc.id}>
                                                • {pc.component.name}
                                                {pc.quantity > 1 &&
                                                  ` × ${pc.quantity}`}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                              {/* „zestaw" przeniesiony do pionowego markera
                                  po lewej stronie wiersza (kolumna marker
                                  z rowSpan przykrywa main + sub-rows). */}
                              {p.isComponent ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] bg-violet-100 text-violet-800 px-1 py-0"
                                >
                                  kompon.
                                </Badge>
                              ) : p.compositionMode === "KOMPONENTOWY" ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] bg-blue-100 text-blue-800 px-1 py-0"
                                >
                                  z kompon.
                                </Badge>
                              ) : null}
                              {p.archived && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1 py-0"
                                >
                                  archiwum
                                </Badge>
                              )}
                            </div>
                            <code className="text-[10px] text-muted-foreground">
                              {p.productCode}
                            </code>
                            {/* Lista komponentów USUNIĘTA z komórki nazwy —
                                ZESTAW renderuje sub-rows pod main rowem
                                z pełnymi danymi (formuła + history). */}
                          </div>
                        </div>
                      </td>
                      {/* KOSZTY Z CHIN: jedna szeroka komórka z formułą
                          cena + prowizja + cło + log = suma/szt
                          (1:1 z items-tab w zamówieniu, łącznie z chipem). */}
                      <td
                        colSpan={5}
                        className="px-2 py-2 tabular-nums border-l align-top"
                      >
                        {/* Formuła kosztów: cena + prowizja + cło + log = suma
                            Grid 9-kolumn (1fr/auto/.../1fr) identyczny jak
                            nagłówek — ikony i wartości pokrywają się 1:1. */}
                        <span className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-baseline gap-1 w-full [&>*]:text-center">
                          <PriceCellWithHistory
                            history={historyForPopover(history, econByItemId)}
                            kind="purchase"
                            currentNetto={econ.purchasePricePln}
                            currentUnitPriceUsd={
                              lastItem?.unitPriceUsd ?? p.defaultUnitPriceUsd
                            }
                            currentQty={lastItem?.quantity ?? null}
                            currentSource={
                              lastItem
                                ? `Z zamówienia ${lastItem.order.orderNumber}`
                                : "Domyślna cena produktu (brak zamówień)"
                            }
                            vatRate={DEFAULT_VAT_RATE}
                          >
                            {fmtNum(dpln(econ.purchasePricePln))}
                          </PriceCellWithHistory>
                          <span className="text-muted-foreground/60 select-none">
                            +
                          </span>
                          <span
                            className="text-amber-700"
                            title="Prowizja pośrednika / szt"
                          >
                            {econ.prowizjaPerUnit > 0
                              ? fmtNum(dpln(econ.prowizjaPerUnit))
                              : "0"}
                          </span>
                          <span className="text-muted-foreground/60 select-none">
                            +
                          </span>
                          <span
                            className="text-rose-700"
                            title="Cło importowe / szt"
                          >
                            {econ.cloPerUnit > 0
                              ? fmtNum(econ.cloPerUnit)
                              : "0"}
                          </span>
                          <span className="text-muted-foreground/60 select-none">
                            +
                          </span>
                          <span
                            className="text-indigo-700"
                            title="Logistyka shared / szt"
                          >
                            {econ.logisticsPerUnit != null
                              ? fmtNum(dpln(econ.logisticsPerUnit))
                              : "0"}
                          </span>
                          <span className="text-muted-foreground/60 select-none mx-0.5">
                            =
                          </span>
                          <PriceCellWithHistory
                            history={historyForPopover(history, econByItemId)}
                            kind="landed"
                            currentNetto={econ.productionSumPerUnit}
                            currentQty={lastItem?.quantity ?? null}
                            currentSource={
                              lastItem
                                ? `Zakup + prowizja + cło + logistyka — ${lastItem.order.orderNumber}`
                                : "Suma: zakup + prowizja + cło + logistyka"
                            }
                            vatRate={DEFAULT_VAT_RATE}
                          >
                            <span
                              className={cn(
                                "font-extrabold text-black px-1.5 py-0.5 rounded-sm no-underline decoration-transparent",
                                "bg-yellow-300",
                                "shadow-[2px_2px_0_rgba(0,0,0,0.18)]",
                                "border border-yellow-500",
                              )}
                            >
                              {fmtNum(dpln(econ.productionSumPerUnit))}
                              <span className="text-[9px] opacity-50 ml-0.5">
                                zł
                              </span>
                            </span>
                          </PriceCellWithHistory>
                        </span>
                      </td>
                      {/* WYSYŁKA — Kurier (z silnika InPost+DHL).
                          rowSpan dla ZESTAW: jedna wartosc wyrownana pionowo
                          przez wszystkie sub-rows komponentow zamiast osobnej
                          komorki per kazdy komponent. */}
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "px-1.5 py-2 text-center tabular-nums bg-indigo-50/40 min-w-[52px]",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                        title={
                          shippingQuote?.primary
                            ? `${shippingQuote.primary.serviceLabel} — najem dla primary box${shippingQuote.primaryIsPreferred ? " (Twoja preferencja)" : ""}`
                            : "Brak wyceny — przypisz primary pudełko wysyłkowe"
                        }
                      >
                        {shippingQuote && shippingQuote.applicable.length > 0 ? (
                          <ShippingQuotePopover
                            applicable={shippingQuote.applicable}
                            cheapest={shippingQuote.cheapest}
                            preferredCodes={p.preferredShippingServices}
                          >
                            {fmtNum(dpln(shippingFromEngine))}
                          </ShippingQuotePopover>
                        ) : (
                          fmtNum(dpln(shippingFromEngine ?? econ.shippingPerUnit))
                        )}
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "px-1.5 py-2 text-center tabular-nums bg-indigo-50/40 min-w-[52px]",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <FulfillmentBreakdownPopover
                          breakdown={econ.fulfillmentBreakdown}
                          factor={factor}
                          priceModeLabel={priceMode}
                        >
                          {fmtNum(dpln(econ.fulfillmentPerUnit))}
                        </FulfillmentBreakdownPopover>
                      </td>
                      {(() => {
                        const hasShipping = p.shippingBoxes.some(
                          (pb) => pb.purpose === "SHIPPING",
                        );
                        const hasFactory = p.shippingBoxes.some(
                          (pb) => pb.purpose === "FACTORY",
                        );
                        // ZESTAW SINGLE_CARTON — dedykowany karton zestawu.
                        if (
                          p.compositionMode === "ZESTAW" &&
                          p.bundleShippingMode === "SINGLE_CARTON" &&
                          p.bundleShippingBox
                        ) {
                          const price = p.bundleShippingBox.purchasePricePln;
                          return (
                            <td
                              rowSpan={isZestaw ? markerRowSpan : 1}
                              className={cn(
                                "px-1.5 py-2 text-center tabular-nums bg-indigo-50/40 border-r min-w-[52px]",
                                isZestaw ? "align-middle" : "align-top",
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger className="cursor-help inline-block w-full text-right">
                                  {price != null ? fmtNum(dpln(price)) : "—"}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[320px]">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-[12px]">
                                      Karton zestawu
                                    </div>
                                    <div className="text-[11px]">
                                      „{p.bundleShippingBox.name}"
                                    </div>
                                    <div className="text-[10px] opacity-80 pt-1 border-t">
                                      Cena: {(price ?? 0).toFixed(2)} zł/szt
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        }
                        // ZESTAW INDIVIDUAL_PACKAGING — pakowanie ze składników:
                        // tooltip pokazuje karton KAŻDEGO komponentu + sumę.
                        if (
                          p.compositionMode === "ZESTAW" &&
                          p.bundleShippingMode === "INDIVIDUAL_PACKAGING"
                        ) {
                          // Per-komponent: znajdź primary SHIPPING (lub
                          // FACTORY fallback) i policz koszt na zestaw.
                          const compBoxes = p.components.map((pc) => {
                            const c = pc.component;
                            const primaryShipping =
                              c.shippingBoxes.find(
                                (b) =>
                                  b.purpose === "SHIPPING" && b.isPrimary,
                              ) ??
                              c.shippingBoxes.find(
                                (b) => b.purpose === "SHIPPING",
                              ) ??
                              null;
                            const primaryFactory = c.shippingBoxes.find(
                              (b) => b.purpose === "FACTORY",
                            );
                            const used = primaryShipping ?? primaryFactory ?? null;
                            const pricePerBox =
                              used?.box.purchasePricePln ?? null;
                            const upb = used?.unitsPerBox ?? 1;
                            const perUnit =
                              pricePerBox != null && upb > 0
                                ? pricePerBox / upb
                                : 0;
                            const contribution = perUnit * pc.quantity;
                            return {
                              componentName: c.name,
                              quantity: pc.quantity,
                              boxName: used?.box.name ?? null,
                              dims: used?.box
                                ? `${used.box.widthCm}×${used.box.heightCm}×${used.box.depthCm}`
                                : null,
                              isFactory: used?.purpose === "FACTORY",
                              perUnit,
                              contribution,
                            };
                          });
                          const totalPerSet = compBoxes.reduce(
                            (s, x) => s + x.contribution,
                            0,
                          );
                          return (
                            <td
                              rowSpan={isZestaw ? markerRowSpan : 1}
                              className={cn(
                                "px-1.5 py-2 text-center tabular-nums bg-indigo-50/40 border-r min-w-[52px]",
                                isZestaw ? "align-middle" : "align-top",
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger className="cursor-help inline-block w-full text-right">
                                  {totalPerSet > 0
                                    ? fmtNum(dpln(totalPerSet))
                                    : "ze skł."}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[400px]">
                                  <div className="space-y-1.5">
                                    <div className="font-semibold text-[12px]">
                                      Pakowanie ze składników
                                    </div>
                                    <div className="text-[10px] opacity-60">
                                      Suma kartonów {p.components.length}{" "}
                                      komponentu/ów
                                    </div>
                                    <div className="space-y-1 pt-1 border-t">
                                      {compBoxes.map((cb, i) => (
                                        <div
                                          key={i}
                                          className="text-[10px] space-y-0.5"
                                        >
                                          <div className="font-medium">
                                            • {cb.componentName}
                                            {cb.quantity > 1 &&
                                              ` × ${cb.quantity}`}
                                          </div>
                                          {cb.boxName ? (
                                            <div className="ml-3 opacity-80">
                                              {cb.isFactory && "🏭 "}„
                                              {cb.boxName}"{" "}
                                              {cb.dims && `(${cb.dims} cm)`}
                                              <div className="opacity-70">
                                                {cb.perUnit.toFixed(2)} zł/szt
                                                ×{cb.quantity} ={" "}
                                                <span className="font-semibold">
                                                  {cb.contribution.toFixed(2)}{" "}
                                                  zł
                                                </span>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="ml-3 opacity-50 italic">
                                              brak przypisanego kartonu
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="text-[11px] font-bold pt-1 border-t">
                                      Razem na zestaw:{" "}
                                      {totalPerSet.toFixed(2)} zł
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        }
                        // FACTORY (z Chin) — produkt już zapakowany w fabryce.
                        if (hasFactory) {
                          const factoryPin =
                            p.shippingBoxes.find(
                              (b: typeof p.shippingBoxes[number]) =>
                                b.purpose === "FACTORY" && b.isPrimary,
                            ) ??
                            p.shippingBoxes.find(
                              (b: typeof p.shippingBoxes[number]) =>
                                b.purpose === "FACTORY",
                            ) ??
                            null;
                          return (
                            <td
                              rowSpan={isZestaw ? markerRowSpan : 1}
                              className={cn(
                                "px-1.5 py-2 text-center tabular-nums bg-indigo-50/40 border-r min-w-[52px] text-emerald-700",
                                isZestaw ? "align-middle" : "align-top",
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger className="cursor-help inline-block w-full text-right">
                                  0,00
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[320px]">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-[12px]">
                                      🏭 Karton z Chin (FACTORY)
                                    </div>
                                    {factoryPin && (
                                      <>
                                        <div className="text-[11px]">
                                          „{factoryPin.box.name}"
                                        </div>
                                        <div className="text-[10px] opacity-80">
                                          Wymiary: {factoryPin.box.widthCm}×
                                          {factoryPin.box.heightCm}×
                                          {factoryPin.box.depthCm} cm
                                        </div>
                                        <div className="text-[10px] opacity-80">
                                          {factoryPin.unitsPerBox} szt/karton
                                        </div>
                                      </>
                                    )}
                                    <div className="text-[10px] opacity-70 italic pt-1 border-t">
                                      Produkt przychodzi już zapakowany —
                                      koszt kartonu wysyłkowego = 0 zł
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        }
                        // SHIPPING box z ceną — pokaż cenę / szt.
                        if (econ.boxPricePerUnit != null) {
                          const shipPin = boxWithPriceFor(p);
                          return (
                            <td
                              rowSpan={isZestaw ? markerRowSpan : 1}
                              className={cn(
                                "px-1.5 py-2 text-center tabular-nums bg-indigo-50/40 border-r min-w-[52px]",
                                isZestaw ? "align-middle" : "align-top",
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger className="cursor-help inline-block w-full text-right">
                                  {fmtNum(dpln(econ.boxPricePerUnit))}
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[320px]">
                                  <div className="space-y-1">
                                    <div className="font-semibold text-[12px]">
                                      📦 Karton wysyłkowy
                                    </div>
                                    {shipPin && (
                                      <>
                                        <div className="text-[11px]">
                                          „{shipPin.box.name}"
                                        </div>
                                        <div className="text-[10px] opacity-80">
                                          Wymiary: {shipPin.box.widthCm}×
                                          {shipPin.box.heightCm}×
                                          {shipPin.box.depthCm} cm
                                        </div>
                                        <div className="text-[10px] opacity-80">
                                          {shipPin.unitsPerBox} szt/karton
                                        </div>
                                        <div className="text-[10px] opacity-80 pt-1 border-t">
                                          {(
                                            shipPin.box.purchasePricePln ?? 0
                                          ).toFixed(2)}{" "}
                                          zł/karton ÷ {shipPin.unitsPerBox} szt
                                          ={" "}
                                          <span className="font-semibold">
                                            {econ.boxPricePerUnit.toFixed(2)}{" "}
                                            zł/szt
                                          </span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        }
                        // SHIPPING bez ceny zakupu.
                        if (hasShipping) {
                          return (
                            <td
                              rowSpan={isZestaw ? markerRowSpan : 1}
                              className={cn(
                                "px-1.5 py-2 text-center tabular-nums bg-indigo-50/40 border-r min-w-[52px]",
                                isZestaw ? "align-middle" : "align-top",
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger className="cursor-help inline-block w-full text-right">
                                  —
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[280px]">
                                  <div className="text-[11px]">
                                    Brak ceny zakupu pudełka. Uzupełnij w
                                    katalogu pudełek.
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        }
                        // Brak SHIPPING pudełka — czerwony X otwiera quick-edit
                        // modal z 2 opcjami: pakowanie wysyłkowe + import z Chin.
                        // Zastępuje dawny Link do dedykowanej strony /pakowanie.
                        const shippingPinsLocal = p.shippingBoxes.filter(
                          (b: typeof p.shippingBoxes[number]) =>
                            b.purpose === "SHIPPING",
                        );
                        const initialShippingPin = shippingPinsLocal.find(
                          (b: typeof p.shippingBoxes[number]) => b.isPrimary,
                        );
                        // Mode bazujemy na obecności SHIPPING pina. Foliopak vs Box
                        // user dograi w modalu — wystarczy że BOX jest domyślne
                        // gdy karton się załaduje. Brak pina = SAME_AS_IMPORT.
                        const initialPackagingMode: "BOX" | "FOLIOPAK" | "SAME_AS_IMPORT" = initialShippingPin
                          ? "BOX"
                          : "SAME_AS_IMPORT";
                        return (
                          <td
                            rowSpan={isZestaw ? markerRowSpan : 1}
                            className={cn(
                              "px-1.5 py-2 text-center bg-indigo-50/40 border-r min-w-[52px]",
                              isZestaw ? "align-middle" : "align-top",
                            )}
                          >
                            <QuickPackagingImportButton
                              productId={p.id}
                              productName={p.name}
                              initialPackagingMode={initialPackagingMode}
                              initialShippingBoxId={
                                initialShippingPin?.box.id ?? null
                              }
                              initialImport={{
                                weightKg: p.weightKg,
                                customsDutyPct: p.customsDutyPct,
                                importMode: p.importMode,
                                boxWidthCm: p.boxWidthCm,
                                boxHeightCm: p.boxHeightCm,
                                boxDepthCm: p.boxDepthCm,
                                boxWeightKg: p.boxWeightKg,
                                unitsPerBox: p.unitsPerBox,
                                masterBoxWidthCm: p.masterBoxWidthCm,
                                masterBoxHeightCm: p.masterBoxHeightCm,
                                masterBoxDepthCm: p.masterBoxDepthCm,
                                masterBoxWeightKg: p.masterBoxWeightKg,
                                innerBoxesPerMaster: p.innerBoxesPerMaster,
                                unitsPerContainer: p.unitsPerContainer,
                                referenceContainerM3: p.referenceContainerM3,
                              }}
                              availableBoxes={wizardAvailableBoxes}
                            />
                          </td>
                        );
                      })()}
                      {/* ALLEGRO */}
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-allegro px-0.5 py-2 bg-amber-50/40 font-medium min-w-[52px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultSalePriceAllegroPln"
                          storedValue={econ.allegroPrice}
                          factor={factor}
                          kind="price"
                          tone="price-chip"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-allegro px-0.5 py-2 bg-amber-50/40 min-w-[44px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultAllegroCommissionPct"
                          storedValue={econ.allegroPct}
                          factor={1}
                          kind="percent"
                          tone="cost"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-allegro px-0.5 py-2 bg-amber-50/40 min-w-[44px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultAllegroCustomerShippingPln"
                          storedValue={econ.allegroCustShip}
                          factor={factor}
                          kind="price"
                          tone="revenue"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-allegro px-0.5 py-2 bg-amber-50/40 min-w-[44px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultAllegroOtherCostPln"
                          storedValue={econ.allegroOther}
                          factor={factor}
                          kind="price"
                          tone="cost"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-allegro px-1.5 py-2 text-center tabular-nums bg-amber-50/40 whitespace-nowrap",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        {econ.allegroProfit != null ? (
                          <span
                            className={cn(
                              "font-extrabold px-1.5 py-0.5 rounded-md no-underline inline-block",
                              econ.allegroProfit > 0
                                ? cn(
                                    "text-emerald-950",
                                    "bg-gradient-to-br from-emerald-200 via-emerald-300 to-emerald-200",
                                    "ring-1 ring-emerald-500/60",
                                    "shadow-[1px_1px_0_rgba(6,78,59,0.25),inset_0_1px_0_rgba(255,255,255,0.6)]",
                                  )
                                : econ.allegroProfit < 0
                                  ? cn(
                                      "text-rose-950",
                                      "bg-gradient-to-br from-rose-200 via-rose-300 to-rose-200",
                                      "ring-1 ring-rose-500/60",
                                      "shadow-[1px_1px_0_rgba(136,19,55,0.25),inset_0_1px_0_rgba(255,255,255,0.6)]",
                                    )
                                  : "text-muted-foreground bg-slate-100 ring-1 ring-slate-300",
                            )}
                          >
                            {fmtNum(dpln(econ.allegroProfit))}
                            <span className="text-[9px] opacity-50 ml-0.5">
                              zł
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-allegro px-2 py-2 text-center tabular-nums bg-amber-50/40 border-r font-medium",
                          isZestaw ? "align-middle" : "align-top",
                          marginColor(econ.allegroMargin),
                        )}
                      >
                        {econ.allegroMargin != null
                          ? `${econ.allegroMargin.toFixed(1)}%`
                          : "—"}
                      </td>
                      {/* SKLEP */}
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-sklep px-0.5 py-2 bg-emerald-50/40 font-medium min-w-[52px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultSalePriceSklepPln"
                          storedValue={econ.sklepPrice}
                          factor={factor}
                          kind="price"
                          tone="price-chip"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-sklep px-0.5 py-2 bg-emerald-50/40 min-w-[44px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultSklepCommissionPct"
                          storedValue={econ.sklepPct}
                          factor={1}
                          kind="percent"
                          tone="cost"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-sklep px-0.5 py-2 bg-emerald-50/40 min-w-[44px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultSklepCustomerShippingPln"
                          storedValue={econ.sklepCustShip}
                          factor={factor}
                          kind="price"
                          tone="revenue"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-sklep px-0.5 py-2 bg-emerald-50/40 min-w-[44px] text-center",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        <EditableSaleCell
                          productId={p.id}
                          field="defaultSklepAdCostPln"
                          storedValue={econ.sklepAdCost}
                          factor={factor}
                          kind="price"
                          tone="cost"
                        />
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-sklep px-1.5 py-2 text-center tabular-nums bg-emerald-50/40 whitespace-nowrap",
                          isZestaw ? "align-middle" : "align-top",
                        )}
                      >
                        {econ.sklepProfit != null ? (
                          <span
                            className={cn(
                              "font-extrabold px-1.5 py-0.5 rounded-md no-underline inline-block",
                              econ.sklepProfit > 0
                                ? cn(
                                    "text-emerald-950",
                                    "bg-gradient-to-br from-emerald-200 via-emerald-300 to-emerald-200",
                                    "ring-1 ring-emerald-500/60",
                                    "shadow-[1px_1px_0_rgba(6,78,59,0.25),inset_0_1px_0_rgba(255,255,255,0.6)]",
                                  )
                                : econ.sklepProfit < 0
                                  ? cn(
                                      "text-rose-950",
                                      "bg-gradient-to-br from-rose-200 via-rose-300 to-rose-200",
                                      "ring-1 ring-rose-500/60",
                                      "shadow-[1px_1px_0_rgba(136,19,55,0.25),inset_0_1px_0_rgba(255,255,255,0.6)]",
                                    )
                                  : "text-muted-foreground bg-slate-100 ring-1 ring-slate-300",
                            )}
                          >
                            {fmtNum(dpln(econ.sklepProfit))}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "cv-sklep px-2 py-2 text-center tabular-nums bg-emerald-50/40 border-r font-medium",
                          isZestaw ? "align-middle" : "align-top",
                          marginColor(econ.sklepMargin),
                        )}
                      >
                        {econ.sklepMargin != null
                          ? `${econ.sklepMargin.toFixed(1)}%`
                          : "—"}
                      </td>
                      {/* AKCJE — 6 ikonek. rowSpan dla ZESTAW: wyrownane pionowo. */}
                      <td
                        rowSpan={isZestaw ? markerRowSpan : 1}
                        className={cn(
                          "px-2",
                          isZestaw ? "py-0 align-middle" : "py-2 align-top",
                        )}
                      >
                        <div className="flex items-center justify-end gap-0.5">
                          <DuplicateProductButton
                            categories={categories}
                            componentCategoryOptions={componentCategoryOptions}
                            defaultContainerM3={defaultContainerM3}
                            iconOnly
                            initial={{
                              name: p.name,
                              productCode: p.productCode,
                              eanCode: p.eanCode,
                              code128: p.code128,
                              categoryId: p.categoryId,
                              status: p.status,
                              importMode: p.importMode,
                              compositionMode: p.compositionMode,
                              isComponent: p.isComponent,
                              color: p.color,
                              widthCm: p.widthCm,
                              heightCm: p.heightCm,
                              depthCm: p.depthCm,
                              weightKg: p.weightKg,
                              boxWidthCm: p.boxWidthCm,
                              boxHeightCm: p.boxHeightCm,
                              boxDepthCm: p.boxDepthCm,
                              boxWeightKg: p.boxWeightKg,
                              unitsPerBox: p.unitsPerBox,
                              unitsPerContainer: p.unitsPerContainer,
                              referenceContainerM3: p.referenceContainerM3,
                              shippingBoxWidthCm: p.shippingBoxWidthCm,
                              shippingBoxHeightCm: p.shippingBoxHeightCm,
                              shippingBoxDepthCm: p.shippingBoxDepthCm,
                              shippingBoxWeightKg: p.shippingBoxWeightKg,
                              unitsPerShippingBox: p.unitsPerShippingBox,
                              unitsPerPallet: p.unitsPerPallet,
                              cbmPerUnit: p.cbmPerUnit,
                              customsDutyPct: p.customsDutyPct,
                              defaultUnitPriceUsd: p.defaultUnitPriceUsd,
                              defaultUnitPriceCny: p.defaultUnitPriceCny,
                              defaultSalePriceAllegroPln:
                                p.defaultSalePriceAllegroPln,
                              defaultSalePriceSklepPln:
                                p.defaultSalePriceSklepPln,
                              defaultAllegroCommissionPct:
                                p.defaultAllegroCommissionPct,
                              importGuidelines: p.importGuidelines,
                              productionGuidelines: p.productionGuidelines,
                              userManual: p.userManual,
                              shopDescription: p.shopDescription,
                              internalNotes: p.internalNotes,
                            }}
                          />
                          <ProductRowActions
                            productId={p.id}
                            productName={p.name}
                            productCode={p.productCode}
                            eanCode={p.eanCode}
                            code128={p.code128}
                          />
                        </div>
                      </td>
                    </tr>
                    {/* ZESTAW — sub-rows per komponent z formułą kosztów.
                        Każdy komponent ma własną cenę z fabryki + prowizja +
                        cło + logistyka z ostatniego zamówienia (econByItemId).
                        Liczby klikalne (history popover) — taki sam wzorzec
                        jak w items-tab. */}
                    {p.compositionMode === "ZESTAW" &&
                      p.components.length > 0 &&
                      p.components.map((pc) => {
                        const compLast = componentLastByProduct.get(
                          pc.componentId,
                        );
                        const compEcon = compLast
                          ? econByItemId.get(compLast.id) ?? null
                          : null;
                        const compHistory =
                          historyByProduct.get(pc.componentId) ?? [];
                        // Cena komponentu (CNY/USD × kurs) z ostatniego zamówienia.
                        const cny =
                          compLast?.unitPriceCny ??
                          pc.component.defaultUnitPriceCny ??
                          null;
                        const usd =
                          compLast?.unitPriceUsd ??
                          pc.component.defaultUnitPriceUsd ??
                          null;
                        const cnyRate =
                          compLast?.cnyToPlnRate ??
                          compLast?.order.cnyToPlnRate ??
                          null;
                        const usdRate =
                          compLast?.usdToPlnRate ??
                          compLast?.order.usdToPlnRate ??
                          null;
                        let compPricePln: number | null = null;
                        if (cny != null && cnyRate)
                          compPricePln = cny * cnyRate;
                        else if (usd != null && usdRate)
                          compPricePln = usd * usdRate;
                        // PL fallback: cena bezpośrednio w PLN (materiał krajowy).
                        if (compPricePln == null) {
                          const pln =
                            compLast?.unitPricePln ??
                            pc.component.defaultUnitPricePln ??
                            null;
                          if (pln != null && pln > 0) compPricePln = pln;
                        }
                        const compProw =
                          compEcon?.prowizjaPerUnitPln ?? 0;
                        const compClo = compEcon?.cloPerUnitPln ?? 0;
                        const compLog =
                          compEcon?.logisticsPerUnitPln ?? 0;
                        const compLanded =
                          (compPricePln ?? 0) +
                          compProw +
                          compClo +
                          compLog;
                        const dpln2 = (n: number | null | undefined) =>
                          n == null ? n : n * factor;
                        return (
                          <tr
                            key={`${p.id}-${pc.id}`}
                            className="border-b bg-blue-50/30 hover:bg-blue-50/60"
                          >
                            {/* Nazwa komponentu — indent + image */}
                            <td className="px-2 py-1.5 pl-6 align-middle">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-blue-400 select-none">
                                  ↳
                                </span>
                                {pc.component.images[0] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={
                                      pc.component.images[0].thumbnailWebpUrl ??
                                      pc.component.images[0].url
                                    }
                                    alt={
                                      pc.component.images[0].alt ??
                                      pc.component.name
                                    }
                                    width={24}
                                    height={24}
                                    loading="lazy"
                                    decoding="async"
                                    className="size-6 rounded object-cover bg-muted shrink-0 ring-1 ring-border"
                                  />
                                ) : (
                                  <div className="size-6 rounded bg-muted shrink-0 ring-1 ring-border" />
                                )}
                                <Tooltip>
                                  <TooltipTrigger className="block max-w-[200px] cursor-help py-1">
                                    <Link
                                      href={`/produkty/${pc.component.id}`}
                                      className="text-[11px] font-medium text-foreground hover:underline truncate block text-left w-full"
                                    >
                                      {pc.component.name}
                                    </Link>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[360px]">
                                    <div className="space-y-1">
                                      <div className="font-semibold text-[12px]">
                                        {pc.component.name}
                                      </div>
                                      <div className="text-[10px] opacity-80">
                                        <span className="opacity-60">SKU:</span>{" "}
                                        <code className="font-mono">
                                          {pc.component.productCode}
                                        </code>
                                      </div>
                                      {pc.component.eanCode && (
                                        <div className="text-[10px] opacity-80">
                                          <span className="opacity-60">EAN:</span>{" "}
                                          <code className="font-mono">
                                            {pc.component.eanCode}
                                          </code>
                                        </div>
                                      )}
                                      {pc.component.code128 && (
                                        <div className="text-[10px] opacity-80">
                                          <span className="opacity-60">
                                            Code128:
                                          </span>{" "}
                                          <code className="font-mono">
                                            {pc.component.code128}
                                          </code>
                                        </div>
                                      )}
                                      {pc.component.category?.name && (
                                        <div className="text-[10px] opacity-80">
                                          <span className="opacity-60">
                                            Kategoria:
                                          </span>{" "}
                                          {pc.component.category.name}
                                        </div>
                                      )}
                                      {pc.component.color && (
                                        <div className="text-[10px] opacity-80">
                                          <span className="opacity-60">
                                            Kolor:
                                          </span>{" "}
                                          {pc.component.color}
                                        </div>
                                      )}
                                      <div className="text-[10px] opacity-60 italic pt-1 border-t mt-1">
                                        Komponent zestawu „{p.name}"
                                        {pc.quantity > 1 &&
                                          ` × ${pc.quantity} szt`}
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                                {pc.quantity > 1 && (
                                  <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
                                    × {pc.quantity}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* Koszty komponentu — uspokojone kolory, mniejszy
                                font, suma bez krzykliwego stickera. */}
                            <td
                              colSpan={5}
                              className="px-2 py-1.5 tabular-nums border-l align-middle"
                            >
                              <span className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-baseline gap-1 w-full text-[10.5px] text-slate-500 [&>*]:text-center">
                                <PriceCellWithHistory
                                  history={historyForPopover(
                                    compHistory,
                                    econByItemId,
                                  )}
                                  kind="purchase"
                                  currentNetto={compPricePln}
                                  currentUnitPriceUsd={
                                    compLast?.unitPriceUsd ??
                                    pc.component.defaultUnitPriceUsd
                                  }
                                  currentQty={compLast?.quantity ?? null}
                                  currentSource={
                                    compLast
                                      ? `Z zamówienia komponentu`
                                      : "Domyślna cena komponentu (brak zamówień)"
                                  }
                                  vatRate={DEFAULT_VAT_RATE}
                                >
                                  {fmtNum(dpln2(compPricePln))}
                                </PriceCellWithHistory>
                                <span className="text-muted-foreground/40 select-none text-[10px]">
                                  +
                                </span>
                                <span title="Prowizja / szt">
                                  {compProw > 0
                                    ? fmtNum(dpln2(compProw))
                                    : "0"}
                                </span>
                                <span className="text-muted-foreground/40 select-none text-[10px]">
                                  +
                                </span>
                                <span title="Cło / szt">
                                  {compClo > 0 ? fmtNum(compClo) : "0"}
                                </span>
                                <span className="text-muted-foreground/40 select-none text-[10px]">
                                  +
                                </span>
                                <PriceCellWithHistory
                                  history={historyForPopover(
                                    compHistory,
                                    econByItemId,
                                  )}
                                  kind="logistics"
                                  currentNetto={compLog > 0 ? compLog : null}
                                  currentQty={compLast?.quantity ?? null}
                                  currentSource={
                                    compLast
                                      ? `Logistyka z calc kontenera komponentu`
                                      : "Brak ostatniego zamówienia komponentu"
                                  }
                                  vatRate={DEFAULT_VAT_RATE}
                                >
                                  {fmtNum(dpln2(compLog))}
                                </PriceCellWithHistory>
                                <span className="text-muted-foreground/40 select-none text-[10px] mx-0.5">
                                  =
                                </span>
                                <PriceCellWithHistory
                                  history={historyForPopover(
                                    compHistory,
                                    econByItemId,
                                  )}
                                  kind="landed"
                                  currentNetto={compLanded}
                                  currentQty={compLast?.quantity ?? null}
                                  currentSource="Zakup + prow + cło + log per szt komponentu"
                                  vatRate={DEFAULT_VAT_RATE}
                                >
                                  <span className="font-semibold text-slate-700 px-1 rounded bg-amber-50/60 ring-1 ring-amber-200/60">
                                    {fmtNum(dpln2(compLanded))}
                                    <span className="text-[8px] opacity-50 ml-0.5">
                                      zł
                                    </span>
                                  </span>
                                </PriceCellWithHistory>
                              </span>
                            </td>
                            {/* Wszystkie pozostale kolumny (wysylka 3 + allegro
                                6 + sklep 6 + akcje 1) sa pokryte przez rowSpan
                                z main row ZESTAWU — sub-row nie potrzebuje
                                placeholderow. */}
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </TooltipProvider>
          </div>
        )}
      </Card>
      </ChannelViewSwitcher>
    </div>
  );
}

// ─── Helpery ekonomiki produktu (per wiersz listy) ──────────────────

type LastItemRecord = {
  quantity: number;
  unitPriceCny: number | null;
  unitPriceUsd: number | null;
  unitPricePln: number | null;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  order: {
    cnyToPlnRate: number | null;
    usdToPlnRate: number | null;
  };
};

type ProductForEconomics = {
  weightKg: number | null;
  cbmPerUnit: number | null;
  unitsPerPallet: number | null;
  /** Kategoria produktu — używana do detekcji dopłat per kategoria (np. blat). */
  categoryId: string | null;
  defaultUnitPriceCny: number | null;
  defaultUnitPriceUsd: number | null;
  defaultUnitPricePln: number | null;
  defaultSalePriceAllegroPln: number | null;
  defaultSalePriceSklepPln: number | null;
  defaultAllegroCommissionPct: number | null;
  defaultSklepCommissionPct: number | null;
  defaultAllegroOtherCostPln: number | null;
  defaultSklepOtherCostPln: number | null;
  defaultAllegroCustomerShippingPln: number | null;
  defaultSklepCustomerShippingPln: number | null;
  defaultSklepAdCostPln: number | null;
  /** Liczba unikalnych SKU w wysyłce klientowi:
   * 1 dla produktów całościowych, N dla KOMPONENTOWY (= liczba komponentów). */
  skuCount: number;
  shippingBoxes: {
    box: {
      id: string;
      name: string;
      internalCode: string | null;
      widthCm: number;
      heightCm: number;
      depthCm: number;
      weightKg: number | null;
      purchasePricePln: number | null;
    };
    unitsPerBox: number;
    isPrimary: boolean;
    purpose: "SHIPPING" | "FACTORY";
  }[];
};

type CourierRateForEconomics = Parameters<typeof calculateShipping>[3][number];

type FulfillmentForEconomics = {
  mode: "MALE" | "HURTOWE";
  warehouseType: "GROUND" | "HIGH_RACK";
  orderOpeningCost: number;
  shippingCostPerSku: number;
  palletStorageCostPerMonth: number;
  perPiecePln: number;
  ownCarrierPln: number;
};

function computeProductEconomics(
  product: ProductForEconomics,
  lastItem: LastItemRecord | null,
  courierRates: CourierRateForEconomics[],
  fulfillment: FulfillmentForEconomics,
  /** Domyślne wartości kanałów sprzedaży — fallback gdy produkt ma null. */
  saleDefaults: {
    allegroCommissionPct: number | null;
    allegroCustomerShippingPln: number | null;
    allegroAdCostPln: number | null;
    sklepCommissionPct: number | null;
    sklepCustomerShippingPln: number | null;
    sklepAdCostPln: number | null;
  },
  logisticsPerUnit: number | null = null,
  /** Override z silnika InPost+DHL — gdy ustawione, używamy zamiast legacy
   * calculateShipping z CourierRate. */
  shippingOverridePln: number | null = null,
  /** Override ceny zakupu w PLN — używane dla ZESTAW (suma ostatnich cen
   *  zakupu komponentów). Gdy ustawione, ignorujemy lastItem/defaultPrice. */
  bundlePurchasePlnOverride: number | null = null,
  /** Dodatkowe komponenty kosztu z calc kontenera ostatniego zamówienia.
   *  Prowizja pośrednika (per-value) i cło importowe (per-product) były
   *  wcześniej wliczane do logistyki — teraz mamy je osobno. Marża musi je
   *  uwzględnić w totalCostPerUnit. */
  importExtras: {
    prowizjaPerUnit: number;
    cloPerUnit: number;
  } = { prowizjaPerUnit: 0, cloPerUnit: 0 },
) {
  // Wszystkie wartości PLN traktujemy jako NETTO — przeliczenie do brutto
  // robi warstwa renderu (× factor). Patrz JSX poniżej.
  // Cena zakupu
  const cny = lastItem?.unitPriceCny ?? product.defaultUnitPriceCny;
  const usd = lastItem?.unitPriceUsd ?? product.defaultUnitPriceUsd;
  const cnyRate =
    lastItem?.cnyToPlnRate ?? lastItem?.order.cnyToPlnRate ?? null;
  const usdRate =
    lastItem?.usdToPlnRate ?? lastItem?.order.usdToPlnRate ?? null;
  let purchasePricePln: number | null = null;
  if (cny != null && cnyRate) purchasePricePln = cny * cnyRate;
  else if (usd != null && usdRate) purchasePricePln = usd * usdRate;
  // PL (produkcja krajowa): cena bezpośrednio w PLN — nie ma kursu walut.
  // Najpierw z konkretnej pozycji (ostatnia transakcja), potem fallback
  // na default produktu (gdy produkt nie był jeszcze zamawiany).
  if (purchasePricePln == null) {
    if (lastItem?.unitPricePln != null && lastItem.unitPricePln > 0) {
      purchasePricePln = lastItem.unitPricePln;
    } else if (
      product.defaultUnitPricePln != null &&
      product.defaultUnitPricePln > 0
    ) {
      purchasePricePln = product.defaultUnitPricePln;
    }
  }
  // ZESTAW: nadpisz ceną sumaryczną komponentów
  if (bundlePurchasePlnOverride != null) {
    purchasePricePln = bundlePurchasePlnOverride;
  }

  // Ilość / CBM z ostatniego zamówienia
  const lastQty = lastItem?.quantity ?? null;
  const totalCbm =
    lastQty != null && product.cbmPerUnit != null
      ? lastQty * product.cbmPerUnit
      : null;
  const lastTotalPln =
    lastQty != null && purchasePricePln != null
      ? lastQty * purchasePricePln
      : null;

  // Wysyłka — preferujemy override z silnika InPost+DHL.
  // Legacy fallback: najtańszy kurier z pinniętego box w/g CourierRate.
  // Preferujemy SHIPPING; gdy brak — używamy FACTORY (produkt wysyłany
  // w tym pudle z Chin, więc wymiary są realne dla kuriera).
  let shippingPerUnit: number | null = shippingOverridePln;
  if (shippingPerUnit == null) {
    const courierPins = product.shippingBoxes.filter(
      (pb) => pb.purpose === "SHIPPING",
    );
    const fallbackPins =
      courierPins.length > 0
        ? courierPins
        : product.shippingBoxes.filter((pb) => pb.purpose === "FACTORY");
    const shippingOptions = calculateShipping(
      { weightKg: product.weightKg },
      1,
      fallbackPins.map((pb) => ({
        box: pb.box,
        unitsPerBox: pb.unitsPerBox,
        isPrimary: pb.isPrimary,
      })),
      courierRates,
    );
    const primary =
      shippingOptions.find((o) => o.isPrimary && o.cheapest) ??
      shippingOptions.find((o) => o.cheapest) ??
      null;
    shippingPerUnit =
      primary?.cheapest && primary.unitsPerBox > 0
        ? primary.cheapest.pricePerBox / primary.unitsPerBox
        : null;
  }

  // Karton wysyłkowy per szt: cena zakupu primary box / sztuk w pudełku.
  // Bierzemy primary (jeśli ma `purchasePricePln`), inaczej najtańsze pudełko
  // z ceną — albo null gdy żadne nie ma uzupełnionej ceny.
  // TYLKO SHIPPING — FACTORY box (z Chin) nie wchodzi w koszt wysyłki kurierem.
  const shippingPins = product.shippingBoxes.filter(
    (b) => b.purpose === "SHIPPING",
  );
  const primaryBox = shippingPins.find((b) => b.isPrimary);
  const boxWithPrice = primaryBox?.box.purchasePricePln
    ? primaryBox
    : shippingPins.find((b) => b.box.purchasePricePln);
  const boxPricePerUnit =
    boxWithPrice && boxWithPrice.box.purchasePricePln && boxWithPrice.unitsPerBox > 0
      ? boxWithPrice.box.purchasePricePln / boxWithPrice.unitsPerBox
      : null;

  // Fulfillment per szt — model umowy E-Packman (Załącznik 2):
  //   otwarcie + perSKU × skuCount + perPiece × 1 + ownCarrier + magazyn
  // Tryb (małe/hurtowe) i typ magazynu (ziemia/regał wysoki) wybiera
  // user w ustawieniach; tu używamy aktywnych stawek.
  const palletPerUnit =
    product.unitsPerPallet && product.unitsPerPallet > 0
      ? fulfillment.palletStorageCostPerMonth / product.unitsPerPallet
      : 0;
  const fulfillRaw =
    fulfillment.orderOpeningCost +
    fulfillment.shippingCostPerSku * product.skuCount +
    fulfillment.perPiecePln +
    fulfillment.ownCarrierPln +
    palletPerUnit;
  const fulfillmentPerUnit = fulfillRaw > 0 ? fulfillRaw : null;
  const fulfillmentBreakdown = fulfillmentPerUnit
    ? {
        orderOpening: fulfillment.orderOpeningCost,
        mode: fulfillment.mode,
        perSku: fulfillment.shippingCostPerSku,
        skuCount: product.skuCount,
        perPiece: fulfillment.perPiecePln,
        ownCarrier: fulfillment.ownCarrierPln,
        palletPerUnit,
        palletRate: fulfillment.palletStorageCostPerMonth,
        warehouseType: fulfillment.warehouseType,
        unitsPerPallet: product.unitsPerPallet ?? null,
        total: fulfillRaw,
      }
    : null;

  // Suma w kolumnie „Koszty z Chin" — landed per szt:
  //   zakup + prowizja + cło + logistyka shared.
  // Identyczna logika jak w items-tab zamówienia.
  const productionSumPerUnit =
    (purchasePricePln ?? 0) +
    importExtras.prowizjaPerUnit +
    importExtras.cloPerUnit +
    (logisticsPerUnit ?? 0);
  // Pełna suma kosztów per szt (do liczenia marży Allegro/Sklep).
  const totalCostPerUnit =
    productionSumPerUnit +
    (shippingPerUnit ?? 0) +
    (boxPricePerUnit ?? 0) +
    (fulfillmentPerUnit ?? 0);

  // Allegro / Sklep — ceny domyślne traktujemy jako NETTO (zgodnie z
  // konwencją: wszędzie w systemie wpisujemy netto, brutto = × 1.23 przy
  // renderze).
  // Per-produkt overrides; gdy null → użyj systemowych wartości domyślnych.
  const allegroPrice = product.defaultSalePriceAllegroPln;
  const allegroPct =
    product.defaultAllegroCommissionPct ?? saleDefaults.allegroCommissionPct;
  const allegroOther =
    product.defaultAllegroOtherCostPln ?? saleDefaults.allegroAdCostPln;
  const allegroCustShip =
    product.defaultAllegroCustomerShippingPln ??
    saleDefaults.allegroCustomerShippingPln;
  const allegroCommissionPln =
    allegroPrice != null && allegroPct != null
      ? allegroPrice * allegroPct
      : 0;
  const allegroProfit =
    allegroPrice != null
      ? allegroPrice -
        totalCostPerUnit -
        allegroCommissionPln -
        (allegroOther ?? 0) +
        (allegroCustShip ?? 0)
      : null;
  // Marża liczona od BAZOWEJ ceny (bez wysyłki klienta), żeby porównywać jak
  // u Allegro: marża per produkt vs cena produktu.
  const allegroMargin =
    allegroPrice != null && allegroProfit != null && allegroPrice > 0
      ? (allegroProfit / allegroPrice) * 100
      : null;

  const sklepPrice = product.defaultSalePriceSklepPln;
  const sklepPct =
    product.defaultSklepCommissionPct ?? saleDefaults.sklepCommissionPct;
  const sklepOther = product.defaultSklepOtherCostPln;
  const sklepCustShip =
    product.defaultSklepCustomerShippingPln ??
    saleDefaults.sklepCustomerShippingPln;
  const sklepAdCost =
    product.defaultSklepAdCostPln ?? saleDefaults.sklepAdCostPln;
  const sklepCommissionPln =
    sklepPrice != null && sklepPct != null ? sklepPrice * sklepPct : 0;
  const sklepProfit =
    sklepPrice != null
      ? sklepPrice -
        totalCostPerUnit -
        sklepCommissionPln -
        (sklepOther ?? 0) -
        (sklepAdCost ?? 0) +
        (sklepCustShip ?? 0)
      : null;
  const sklepMargin =
    sklepPrice != null && sklepProfit != null && sklepPrice > 0
      ? (sklepProfit / sklepPrice) * 100
      : null;

  return {
    lastQty,
    totalCbm,
    purchasePricePln,
    prowizjaPerUnit: importExtras.prowizjaPerUnit,
    cloPerUnit: importExtras.cloPerUnit,
    logisticsPerUnit,
    productionSumPerUnit:
      productionSumPerUnit > 0 ? productionSumPerUnit : null,
    totalCostPerUnit: totalCostPerUnit > 0 ? totalCostPerUnit : null,
    lastTotalPln,
    shippingPerUnit,
    boxPricePerUnit,
    fulfillmentPerUnit,
    fulfillmentBreakdown,
    allegroPrice,
    allegroPct,
    allegroOther,
    allegroCustShip,
    allegroProfit,
    allegroMargin,
    sklepPrice,
    sklepPct,
    sklepOther,
    sklepCustShip,
    sklepAdCost,
    sklepProfit,
    sklepMargin,
  };
}

function historyForPopover(
  items: {
    id: string;
    quantity: number;
    unitPriceUsd: number | null;
    usdToPlnRate: number | null;
    createdAt: Date;
    order: {
      id: string;
      orderNumber: string;
      status: string;
      usdToPlnRate: number | null;
    };
  }[],
  econByItemId: Map<
    string,
    {
      purchasePerUnitPln: number;
      prowizjaPerUnitPln: number;
      cloPerUnitPln: number;
      logisticsPerUnitPln: number;
      landedPerUnitPln: number;
      goodsValuePerUnitPln: number;
      totalGoodsValuePln: number;
      totalProwizjaPln: number;
      totalCloPln: number;
      totalLogisticsPln: number;
      quantity: number;
    }
  >,
): PriceHistoryEntry[] {
  return items.map((it) => {
    const e = econByItemId.get(it.id);
    return {
      orderId: it.order.id,
      orderNumber: it.order.orderNumber,
      orderStatus: it.order.status,
      createdAt: it.createdAt,
      quantity: it.quantity,
      unitPriceUsd: it.unitPriceUsd,
      usdToPlnRate: it.usdToPlnRate ?? it.order.usdToPlnRate,
      purchasePerUnitPln: e?.purchasePerUnitPln ?? null,
      logisticsPerUnitPln: e?.logisticsPerUnitPln ?? null,
      landedPerUnitPln: e?.landedPerUnitPln ?? null,
    };
  });
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pl-PL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPlnShort(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return n.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
}

function boxWithPriceFor(p: {
  shippingBoxes: ProductForEconomics["shippingBoxes"];
}): ProductForEconomics["shippingBoxes"][number] | undefined {
  // Tylko SHIPPING — FACTORY box z Chin nie idzie do kosztów wysyłki kurierem.
  const pins = p.shippingBoxes.filter((b) => b.purpose === "SHIPPING");
  const primary = pins.find((b) => b.isPrimary);
  if (primary?.box.purchasePricePln) return primary;
  return pins.find((b) => b.box.purchasePricePln);
}

function marginColor(margin: number | null): string {
  if (margin == null) return "";
  if (margin >= 25) return "text-emerald-700";
  if (margin < 10) return "text-rose-700";
  return "";
}
