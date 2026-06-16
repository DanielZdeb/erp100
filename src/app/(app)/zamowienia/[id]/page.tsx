import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";

import { STATUS_LABEL, type OrderStatusT } from "@/lib/order-status";
import { STATUS_BADGE } from "@/lib/status-colors";
import {
  bundleCbmPerUnit,
  effectiveContainerCbm,
  kalkulujKontener,
} from "@/lib/kalkulacje";
import { resolveCustomsDutyPct } from "@/lib/customs-duty";
import {
  getFulfillmentSettings,
  getSaleChannelDefaults,
} from "@/server/system-settings";
import { quoteShippingForProduct } from "@/lib/courier-pricing/product-quote";

import { StatusWorkflow } from "./status-workflow";
import { ItemsTab } from "./items-tab";
import { DOC_CATEGORIES } from "@/lib/order-doc-slots";
import { StageTasks } from "./stage-tasks";
import { getStageTaskTemplates } from "@/lib/stage-tasks";
import {
  ensureStageTaskTemplates,
  autoApplyBrokerCommission,
  autoApplyCustomsDuty,
} from "@/server/order-costs";
import { backfillOrderItemDefaults } from "@/server/order-items";
import { OrderTabs } from "./order-tabs";
import { PaymentsTable } from "./payments-table";
import { DocsTable } from "./docs-table";
import { AwizacjaTab } from "./awizacja-tab";
import { GuidelinesTab } from "./guidelines-tab";

export const dynamic = "force-dynamic";

export default async function ZamowienieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();

  // findFirst + companyId zamiast findUnique({where:{id}}) — żeby user z firmy A
  // dostał notFound przy próbie wejścia na zamówienie firmy B (zamiast 200 z danymi).
  const order = await db.importOrder.findFirst({
    where: { id, companyId },
    include: {
      company: {
        select: {
          name: true,
          address: true,
          deliveryAddress: true,
          defaultKrojeniePerSztPln: true,
          defaultSzwalniaPerSztPln: true,
        },
      },
      createdBy: { select: { id: true, name: true, email: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              productCode: true,
              eanCode: true,
              code128: true,
              weightKg: true,
              customsDutyPct: true,
              category: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                  parentId: true,
                  customsDutyPct: true,
                  commissionPctAllegro: true,
                  commissionPctSklep: true,
                  kpkPlnAllegro: true,
                  kpkPlnSklep: true,
                  customerShippingPlnAllegro: true,
                  customerShippingPlnSklep: true,
                  parent: {
                    select: {
                      id: true,
                      name: true,
                      level: true,
                      customsDutyPct: true,
                      commissionPctAllegro: true,
                      commissionPctSklep: true,
                      kpkPlnAllegro: true,
                      kpkPlnSklep: true,
                      customerShippingPlnAllegro: true,
                      customerShippingPlnSklep: true,
                      parent: {
                        select: {
                          id: true,
                          name: true,
                          level: true,
                          customsDutyPct: true,
                          commissionPctAllegro: true,
                          commissionPctSklep: true,
                          kpkPlnAllegro: true,
                          kpkPlnSklep: true,
                          customerShippingPlnAllegro: true,
                          customerShippingPlnSklep: true,
                        },
                      },
                    },
                  },
                },
              },
              productionGuidelines: true,
              importGuidelines: true,
              userManual: true,
              cbmPerUnit: true,
              unitsPerBox: true,
              unitsPerPallet: true,
              importMode: true,
              compositionMode: true,
              boxWidthCm: true,
              boxHeightCm: true,
              boxDepthCm: true,
              boxWeightKg: true,
              masterBoxWidthCm: true,
              masterBoxHeightCm: true,
              masterBoxDepthCm: true,
              masterBoxWeightKg: true,
              innerBoxesPerMaster: true,
              unitsPerContainer: true,
              referenceContainerM3: true,
              preferredShippingServices: true,
              components: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  componentId: true,
                  quantity: true,
                  allowVariants: true,
                  poolCategories: { select: { id: true, name: true } },
                  poolProducts: { select: { id: true } },
                  component: {
                    select: {
                      id: true,
                      name: true,
                      productCode: true,
                      categoryId: true,
                      category: { select: { id: true, name: true } },
                      cbmPerUnit: true,
                      images: {
                        where: { isPrimary: true },
                        take: 1,
                        select: { url: true, thumbnailWebpUrl: true },
                      },
                    },
                  },
                },
              },
              shippingBoxes: {
                orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                select: {
                  isPrimary: true,
                  unitsPerBox: true,
                  purpose: true,
                  box: {
                    select: {
                      id: true,
                      name: true,
                      widthCm: true,
                      heightCm: true,
                      depthCm: true,
                      weightKg: true,
                      purchasePricePln: true,
                    },
                  },
                },
              },
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true, alt: true, thumbnailWebpUrl: true, thumbnailBlurDataUrl: true },
              },
              stageCompletions: {
                select: { stage: true, notes: true },
              },
            },
          },
          variantSplits: {
            select: {
              id: true,
              productComponentId: true,
              variantProductId: true,
              units: true,
              variantProduct: {
                select: {
                  id: true,
                  name: true,
                  productCode: true,
                  categoryId: true,
                  cbmPerUnit: true,
                  images: {
                    where: { isPrimary: true },
                    take: 1,
                    select: { url: true, thumbnailWebpUrl: true },
                  },
                },
              },
            },
          },
          saleChannels: { orderBy: { id: "asc" } },
        },
      },
      costs: { orderBy: { createdAt: "asc" } },
      goodsTranches: { orderBy: { phase: "asc" } },
      tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      payments: { orderBy: { createdAt: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      statusHistory: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { name: true, email: true } } },
      },
      pdfSections: {
        orderBy: { sortOrder: "asc" },
        include: {
          images: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  // Szablon wytycznych firmy (PL) — pokazujemy w dialogu w GuidelinesTab,
  // żeby user mógł szybko edytować bez wychodzenia do /ustawienia.
  const orderTemplateSections = order
    ? await db.orderTemplateSection.findMany({
        where: {
          companyId: order.companyId ?? "",
          kind: "MATERIAL_SZARFY",
        },
        orderBy: { sortOrder: "asc" },
        include: { images: { orderBy: { sortOrder: "asc" } } },
      })
    : [];

  if (!order) notFound();

  // Lazy backfill — utwórz domyślne transze dla starych zamówień jeśli brak
  if (order.goodsTranches.length === 0) {
    await db.orderGoodsTranche.createMany({
      data: [
        { orderId: order.id, phase: "PRE_PRODUCTION", percentage: 0.3 },
        { orderId: order.id, phase: "POST_PRODUCTION", percentage: 0.4 },
        { orderId: order.id, phase: "IN_PORT", percentage: 0.3 },
      ],
    });
    order.goodsTranches = await db.orderGoodsTranche.findMany({
      where: { orderId: order.id },
      orderBy: { phase: "asc" },
    });
  }

  // Lazy backfill kanałów Allegro/Sklep — uzupełnia puste pola z aktualnych
  // defaultów produktu + ustawień fulfillmentu. Pola ustawione przez usera
  // nie są nadpisywane.
  await backfillOrderItemDefaults(order.id);
  // Lazy backfill prowizji pośrednika (Fullbax) — tylko jeśli koszt nie istnieje
  // jeszcze albo amount=0. Wartości manualnie wprowadzone przez usera są szanowane.
  await autoApplyBrokerCommission(order.id, { mode: "once" });
  // Re-fetch pozycji po backfillu (saleChannels mogły się zmienić)
  order.items = await db.importOrderItem.findMany({
    where: { orderId: order.id },
    orderBy: { sortOrder: "asc" },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          productCode: true,
          eanCode: true,
          code128: true,
          weightKg: true,
          customsDutyPct: true,
          category: {
            select: {
              id: true,
              name: true,
              level: true,
              parentId: true,
              customsDutyPct: true,
              commissionPctAllegro: true,
              commissionPctSklep: true,
              kpkPlnAllegro: true,
              kpkPlnSklep: true,
              customerShippingPlnAllegro: true,
              customerShippingPlnSklep: true,
              parent: {
                select: {
                  id: true,
                  name: true,
                  level: true,
                  customsDutyPct: true,
                  commissionPctAllegro: true,
                  commissionPctSklep: true,
                  kpkPlnAllegro: true,
                  kpkPlnSklep: true,
                  customerShippingPlnAllegro: true,
                  customerShippingPlnSklep: true,
                  parent: {
                    select: {
                      id: true,
                      name: true,
                      level: true,
                      customsDutyPct: true,
                      commissionPctAllegro: true,
                      commissionPctSklep: true,
                      kpkPlnAllegro: true,
                      kpkPlnSklep: true,
                      customerShippingPlnAllegro: true,
                      customerShippingPlnSklep: true,
                    },
                  },
                },
              },
            },
          },
          productionGuidelines: true,
          importGuidelines: true,
          userManual: true,
          cbmPerUnit: true,
          unitsPerBox: true,
          unitsPerPallet: true,
          importMode: true,
          compositionMode: true,
          boxWidthCm: true,
          boxHeightCm: true,
          boxDepthCm: true,
          boxWeightKg: true,
          masterBoxWidthCm: true,
          masterBoxHeightCm: true,
          masterBoxDepthCm: true,
          masterBoxWeightKg: true,
          innerBoxesPerMaster: true,
          unitsPerContainer: true,
          referenceContainerM3: true,
          preferredShippingServices: true,
          components: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              componentId: true,
              quantity: true,
              allowVariants: true,
              poolCategories: { select: { id: true, name: true } },
              poolProducts: { select: { id: true } },
              component: {
                select: {
                  id: true,
                  name: true,
                  productCode: true,
                  categoryId: true,
                  category: { select: { id: true, name: true } },
                  cbmPerUnit: true,
                  images: {
                    where: { isPrimary: true },
                    take: 1,
                    select: { url: true, thumbnailWebpUrl: true },
                  },
                },
              },
            },
          },
          shippingBoxes: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: {
              isPrimary: true,
              unitsPerBox: true,
              purpose: true,
              box: {
                select: {
                  id: true,
                  name: true,
                  widthCm: true,
                  heightCm: true,
                  depthCm: true,
                  weightKg: true,
                  purchasePricePln: true,
                },
              },
            },
          },
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true, alt: true, thumbnailWebpUrl: true, thumbnailBlurDataUrl: true },
          },
          stageCompletions: {
            select: { stage: true, notes: true },
          },
        },
      },
      variantSplits: {
        select: {
          id: true,
          productComponentId: true,
          variantProductId: true,
          units: true,
          variantProduct: {
            select: {
              id: true,
              name: true,
              productCode: true,
              categoryId: true,
              cbmPerUnit: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                select: { url: true, thumbnailWebpUrl: true },
              },
            },
          },
        },
      },
      saleChannels: { orderBy: { id: "asc" } },
    },
  });

  // Re-fetch kosztów (autoApplyBrokerCommission mógł utworzyć PROWIZJA_POSREDNIKA)
  order.costs = await db.importOrderCost.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "asc" },
  });

  // Breakdown prowizji Fullbax — do tooltipu w tabeli płatności.
  // Konwersja CNY → USD przez kursy gdy pozycja nie ma unitPriceUsd
  // (umowa Fullbax dotyczy wartości w USD niezależnie od waluty zakupu).
  const ordCnyToPln = order.cnyToPlnRate ?? 0;
  const ordUsdToPln = order.usdToPlnRate ?? 0;
  const totalGoodsUsd = order.items.reduce((s, it) => {
    if (it.unitPriceUsd != null && it.unitPriceUsd > 0) {
      return s + it.quantity * it.unitPriceUsd;
    }
    if (it.unitPriceCny != null && it.unitPriceCny > 0) {
      const itCnyToPln = it.cnyToPlnRate ?? ordCnyToPln;
      const itUsdToPln = it.usdToPlnRate ?? ordUsdToPln;
      if (itCnyToPln > 0 && itUsdToPln > 0) {
        return s + (it.quantity * it.unitPriceCny * itCnyToPln) / itUsdToPln;
      }
    }
    return s;
  }, 0);
  const brokerTiers =
    totalGoodsUsd > 0
      ? await db.brokerCommissionTier.findMany({
          where: { companyId: order.companyId, brokerName: "Fullbax" },
          orderBy: [{ sortOrder: "asc" }, { minValueUsd: "asc" }],
        })
      : [];
  const matchedTier = brokerTiers.find(
    (t) =>
      totalGoodsUsd >= t.minValueUsd &&
      (t.maxValueUsd == null || totalGoodsUsd < t.maxValueUsd),
  );
  const brokerCommissionInfo = matchedTier
    ? {
        totalGoodsUsd,
        usdToPlnRate: order.usdToPlnRate ?? 0,
        minValueUsd: matchedTier.minValueUsd,
        maxValueUsd: matchedTier.maxValueUsd,
        ratePct: matchedTier.ratePct,
        flatPln: matchedTier.flatPln,
        individual: matchedTier.individual,
        brokerName: matchedTier.brokerName,
      }
    : null;

  // (customsInfo wyliczane poniżej, po `calc` — wymaga calc.items)

  // Historia cen — top-10 pozycji per produkt z innych zamówień po negocjacji.
  // Wykorzystywane przez popover hover w tabeli pozycji (Koszty z chin).
  const itemProductIds = Array.from(
    new Set(order.items.map((it) => it.productId)),
  );
  const NEGOTIATED_STATUSES = [
    "DOGADYWANE",
    "PRODUKOWANE",
    "WYPRODUKOWANE",
    "WYSLANE",
    "ODEBRANE",
    "W_MAGAZYNIE",
  ] as const;
  const historyItemsRaw =
    itemProductIds.length > 0
      ? await db.importOrderItem.findMany({
          where: {
            productId: { in: itemProductIds },
            orderId: { not: order.id },
            order: { status: { in: [...NEGOTIATED_STATUSES] } },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            productId: true,
            quantity: true,
            unitPriceUsd: true,
            usdToPlnRate: true,
            createdAt: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                usdToPlnRate: true,
              },
            },
          },
        })
      : [];

  // ── Historia cen — czytamy ze SNAPSHOTÓW (bez live calc) ────────────
  // Każde zamówienie >= DOGADYWANE ma zapisany snapshot w ProductPriceHistory
  // (server/orders.ts:snapshotOrderPricesToHistory uruchamia się przy każdym
  // przejściu statusu). Tu po prostu czytamy te wartości — bez `kalkulujKontener`
  // dla każdego z N historycznych zamówień. Wcześniej: 5-20× kalkulacja
  // kontenera per request. Teraz: 1 SELECT z ProductPriceHistory.
  const snapshotPairs = historyItemsRaw.map((h) => ({
    productId: h.productId,
    orderId: h.order.id,
  }));
  const snapshotKeys = new Set(
    snapshotPairs.map((p) => `${p.orderId}:${p.productId}`),
  );
  const snapshots =
    snapshotPairs.length > 0
      ? await db.productPriceHistory.findMany({
          where: {
            productId: { in: itemProductIds },
            importOrderId: { in: snapshotPairs.map((p) => p.orderId) },
          },
          select: {
            productId: true,
            importOrderId: true,
            factoryPricePln: true,
            landedCostPln: true,
            logisticsPerUnitPln: true,
          },
        })
      : [];
  // Mapa: `${orderId}:${itemId}` → ekonomika per szt (netto).
  // Klucz po itemId bo to identyfikator linii — taka sama umowa jak
  // wcześniej, żeby reszta kodu nie wymagała zmian.
  const itemEconByKey = new Map<
    string,
    {
      purchasePerUnitPln: number;
      logisticsPerUnitPln: number;
      landedPerUnitPln: number;
    }
  >();
  // Snapshoty mamy po (productId, orderId), więc tworzymy lookup po tym kluczu
  // i wpisujemy ekonomikę dla każdej linii historii.
  const snapshotByOrderProduct = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    if (!s.importOrderId) continue;
    snapshotByOrderProduct.set(`${s.importOrderId}:${s.productId}`, s);
  }
  for (const h of historyItemsRaw) {
    const key = `${h.order.id}:${h.productId}`;
    if (!snapshotKeys.has(key)) continue;
    const s = snapshotByOrderProduct.get(key);
    if (!s) continue;
    itemEconByKey.set(`${h.order.id}:${h.id}`, {
      purchasePerUnitPln: s.factoryPricePln ?? 0,
      logisticsPerUnitPln: s.logisticsPerUnitPln ?? 0,
      landedPerUnitPln: s.landedCostPln ?? 0,
    });
  }

  const priceHistoryByProduct: Record<
    string,
    {
      orderId: string;
      orderNumber: string;
      orderStatus: string;
      createdAt: Date;
      quantity: number;
      unitPriceUsd: number | null;
      usdToPlnRate: number | null;
      purchasePerUnitPln: number | null;
      logisticsPerUnitPln: number | null;
      landedPerUnitPln: number | null;
    }[]
  > = {};
  for (const it of historyItemsRaw) {
    const arr = priceHistoryByProduct[it.productId] ?? [];
    if (arr.length < 10) {
      const econ = itemEconByKey.get(`${it.order.id}:${it.id}`);
      arr.push({
        orderId: it.order.id,
        orderNumber: it.order.orderNumber,
        orderStatus: it.order.status,
        createdAt: it.createdAt,
        quantity: it.quantity,
        unitPriceUsd: it.unitPriceUsd,
        usdToPlnRate: it.usdToPlnRate ?? it.order.usdToPlnRate,
        purchasePerUnitPln: econ?.purchasePerUnitPln ?? null,
        logisticsPerUnitPln: econ?.logisticsPerUnitPln ?? null,
        landedPerUnitPln: econ?.landedPerUnitPln ?? null,
      });
      priceHistoryByProduct[it.productId] = arr;
    }
  }

  const [products, categoriesWithCounts, fulfillment, saleDefaults] =
    await Promise.all([
      db.product.findMany({
        // Zestawy (compositionMode='ZESTAW') NIE mogą być importowane — to
        // wirtualne produkty złożone z istniejących produktów/komponentów.
        // Picker w zamówieniach widzi tylko CALOSCIOWY/KOMPONENTOWY i komponenty.
        where: {
          companyId,
          archived: false,
          compositionMode: { not: "ZESTAW" },
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          productCode: true,
          code128: true,
          categoryId: true,
          isComponent: true,
          cbmPerUnit: true,
          unitsPerBox: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: { url: true, alt: true, thumbnailWebpUrl: true, thumbnailBlurDataUrl: true },
          },
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
              products: { where: { companyId, archived: false } },
            },
          },
        },
      }),
      getFulfillmentSettings(),
      getSaleChannelDefaults(),
    ]);

  const categoriesForItems = categoriesWithCounts.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    level: c.level,
    productCount: c._count.products,
  }));

  // policz kalkulację raz, używamy w kilku tabach
  const calc = kalkulujKontener({
    rates: {
      cnyToPln: order.cnyToPlnRate ?? 0,
      usdToPln: order.usdToPlnRate ?? 0,
      vatRate: order.vatRate ?? 0.23,
    },
    // PL zamówienia: koszty cięcia/krojenia dzielone per szt, nie per CBM.
    allocationMode: order.country === "POLAND" ? "QTY" : "CBM",
    containerSizeM3: order.containerSizeM3 ?? 28,
    // Logistyka zawsze netto. type → separacja CLO od shared logistyki.
    costs: order.costs.map((c) => ({
      amountPln: c.amountPln,
      type: c.type,
    })),
    goodsTranches: order.goodsTranches.map((t) => ({
      paidCurrency: t.paidCurrency,
      paidExchangeRate: t.paidExchangeRate,
      paidAmountOriginal: t.paidAmountOriginal,
    })),
    items: order.items.map((it) => {
      // Dla bundli (KOMPONENTOWY) wyliczamy efektywne CBM/szt z slotów + wariantów.
      // Override z `it.cbmPerUnit` zawsze ma priorytet (manualna korekta user'a).
      let effCbmPerUnit = it.cbmPerUnit ?? 0;
      const slots = it.product.components ?? [];
      if (it.cbmPerUnit == null && it.product.compositionMode === "KOMPONENTOWY" && slots.length > 0) {
        const splitsBySlot = new Map<
          string,
          { variantCbmPerUnit: number; units: number }[]
        >();
        for (const sp of it.variantSplits ?? []) {
          const arr = splitsBySlot.get(sp.productComponentId) ?? [];
          arr.push({
            variantCbmPerUnit: sp.variantProduct.cbmPerUnit ?? 0,
            units: sp.units,
          });
          splitsBySlot.set(sp.productComponentId, arr);
        }
        const computed = bundleCbmPerUnit(
          slots.map((s) => ({
            quantity: s.quantity,
            defaultCbmPerUnit: s.component.cbmPerUnit ?? 0,
            splits: splitsBySlot.get(s.id),
          })),
          it.quantity,
        );
        if (computed != null) effCbmPerUnit = computed;
      } else if (it.cbmPerUnit == null) {
        effCbmPerUnit = it.product.cbmPerUnit ?? 0;
      }

      // Hierarchia pakowania — preferuj przypięty karton FACTORY z katalogu,
      // bo zmiana pinu w „Pudełka" ma od razu zmieniać wyliczenie CBM (snapshot
      // w `it.cbmPerUnit` i denormalizowane `product.box*` mogą być nieaktualne).
      // Bundle z override'em CBM/szt pomijają to (manual = wiarygodne źródło).
      const isBundleOrOverride =
        it.product.compositionMode === "KOMPONENTOWY" && slots.length > 0;
      if (!isBundleOrOverride) {
        const factoryPin =
          it.product.shippingBoxes?.find(
            (b) => b.purpose === "FACTORY" && b.isPrimary,
          ) ??
          it.product.shippingBoxes?.find((b) => b.purpose === "FACTORY") ??
          null;
        const effBoxW =
          factoryPin?.box.widthCm ?? it.product.boxWidthCm ?? null;
        const effBoxH =
          factoryPin?.box.heightCm ?? it.product.boxHeightCm ?? null;
        const effBoxD =
          factoryPin?.box.depthCm ?? it.product.boxDepthCm ?? null;
        const effUpb =
          factoryPin?.unitsPerBox ?? it.product.unitsPerBox ?? null;
        const eff = effectiveContainerCbm({
          quantity: it.quantity,
          cbmPerUnit: effCbmPerUnit,
          boxWidthCm: effBoxW,
          boxHeightCm: effBoxH,
          boxDepthCm: effBoxD,
          unitsPerBox: effUpb,
          masterBoxWidthCm: it.product.masterBoxWidthCm,
          masterBoxHeightCm: it.product.masterBoxHeightCm,
          masterBoxDepthCm: it.product.masterBoxDepthCm,
          innerBoxesPerMaster: it.product.innerBoxesPerMaster,
        });
        if (eff.source !== "RAW") {
          effCbmPerUnit = eff.effectiveCbmPerUnit;
        }
      }
      return {
      quantity: it.quantity,
      cbmPerUnit: effCbmPerUnit,
      unitPriceUsd: it.unitPriceUsd,
      unitPriceCny: it.unitPriceCny,
      unitPricePln: it.unitPricePln,
      cnyToPlnRate: it.cnyToPlnRate,
      usdToPlnRate: it.usdToPlnRate,
      expectedMonthlySales: it.expectedMonthlySales,
      customsDutyPct: resolveCustomsDutyPct(it.product),
      // Prowizja i KPK NIE są już per-item — pochodzą z kategorii produktu
      // (z dziedziczeniem Category → Parent → Grandparent). Quick-edit
      // z items-tab zapisuje na kategorię, więc kaskada idzie sama.
      // Fallback do per-item wartości jeśli kategoria nie ustawiona
      // (np. legacy dane przed migracją tej funkcji).
      saleChannels: it.saleChannels.map((ch) => {
        const chKey: "Allegro" | "Sklep" =
          ch.channel === "Sklep" ? "Sklep" : "Allegro";
        const catCommission = resolveCategoryDefault(
          it.product.category,
          chKey,
          "commissionPct",
        ).value;
        const catKpk = resolveCategoryDefault(
          it.product.category,
          chKey,
          "kpkPln",
        ).value;
        const catCustomerShipping = resolveCategoryDefault(
          it.product.category,
          chKey,
          "customerShippingPln",
        ).value;
        // KPK mapuje: Allegro → otherCostPln, Sklep → adCostPln
        // (zachowujemy istniejącą strukturę kolumn).
        const adCostFromCategory = chKey === "Sklep" ? catKpk : null;
        const otherCostFromCategory = chKey === "Allegro" ? catKpk : null;
        return {
          channel: ch.channel,
          salePricePln: ch.salePricePln,
          commissionPct: catCommission ?? ch.commissionPct,
          commissionFlat: ch.commissionFlat,
          shippingCostPln: ch.shippingCostPln,
          fulfillmentPln: ch.fulfillmentPln,
          packagingCostPln: ch.packagingCostPln,
          adCostPln: adCostFromCategory ?? ch.adCostPln,
          otherCostPln: otherCostFromCategory ?? ch.otherCostPln,
          customerShippingPln: catCustomerShipping ?? ch.customerShippingPln,
          shareOfQty: ch.shareOfQty,
        };
      }),
      };
    }),
  });

  // Breakdown cła — do tooltipu w wierszu „Cło" w tabeli płatności.
  // Grupowanie wg stawki (z Product/Category resolution) — jeśli różne stawki,
  // pokazujemy „mieszane".
  const customsByRate = new Map<
    number,
    { goodsValuePln: number; dutyPln: number }
  >();
  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i];
    const calcIt = calc.items[i];
    if (!calcIt) continue;
    const dutyPct = resolveCustomsDutyPct(it.product);
    if (dutyPct == null) continue;
    const key = Math.round(dutyPct * 10000) / 10000;
    const bucket = customsByRate.get(key) ?? { goodsValuePln: 0, dutyPln: 0 };
    bucket.goodsValuePln += calcIt.goodsValuePln;
    bucket.dutyPln += calcIt.customsDutyPln;
    customsByRate.set(key, bucket);
  }
  const customsInfo =
    calc.totalCustomsDutyPln > 0
      ? {
          totalGoodsValuePln: calc.totalGoodsValuePln,
          totalCustomsDutyPln: calc.totalCustomsDutyPln,
          uniformRatePct:
            customsByRate.size === 1
              ? Array.from(customsByRate.keys())[0]
              : null,
          byRate: Array.from(customsByRate.entries())
            .map(([ratePct, v]) => ({
              ratePct,
              goodsValuePln: v.goodsValuePln,
              dutyPln: v.dutyPln,
            }))
            .sort((a, b) => b.dutyPln - a.dutyPln),
        }
      : null;

  // Lazy backfill cła — uzupełnia koszt CLO policzony z calc kontenera.
  // "once" oznacza że ręcznie wpisana wartość nie jest nadpisywana.
  if (customsInfo) {
    await autoApplyCustomsDuty(
      order.id,
      customsInfo.totalCustomsDutyPln,
      { mode: "once" },
    );
  }

  const status = order.status as OrderStatusT;

  // Lazy seed sztywnych zadań dla bieżącego etapu
  const stageTemplates = getStageTaskTemplates(status);
  if (stageTemplates.length > 0) {
    await ensureStageTaskTemplates(order.id, status, stageTemplates);
    // odśwież listę zadań żeby pokazać świeżo utworzone
    order.tasks = await db.orderTask.findMany({
      where: { orderId: order.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }
  const currentStageTasks = order.tasks
    .filter((t) => t.status === status)
    .map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      templateKey: t.templateKey,
    }));

  // ── Warunki zamknięcia zamówienia (synchroniczne z checkOrderClosable
  //    w server/orders.ts). Wszystkie: tranches paid, 8 fixed costs paid,
  //    inne costs paid, wszystkie nazwane sloty dokumentacji wypełnione. ──
  const closeBlockers: string[] = [];
  {
    const MANDATORY_FIXED = 7; // bez VAT — VAT nie jest obowiązkowy
    const isExcluded = (type: string) => type === "VAT";
    if (status !== "W_MAGAZYNIE") {
      closeBlockers.push("Status musi być: W magazynie");
    }
    const tranchesUnpaid = order.goodsTranches.filter((t) => !t.paid).length;
    if (tranchesUnpaid > 0)
      closeBlockers.push(`Niezapłacone transze towaru: ${tranchesUnpaid}`);
    if (order.goodsTranches.length === 0)
      closeBlockers.push("Brak transz towaru (30/40/30%)");
    const mandatoryFixed = order.costs.filter(
      (c) => c.type !== "INNE" && !isExcluded(c.type),
    );
    const mandatoryPaid = mandatoryFixed.filter((c) => c.paid).length;
    if (mandatoryFixed.length < MANDATORY_FIXED)
      closeBlockers.push(
        `Brakuje stałych kosztów: ${mandatoryFixed.length}/${MANDATORY_FIXED}`,
      );
    if (mandatoryPaid < MANDATORY_FIXED)
      closeBlockers.push(
        `Niezapłacone stałe koszty: ${MANDATORY_FIXED - mandatoryPaid}`,
      );
    // VAT: pomijamy w sprawdzaniu — nie blokuje zamknięcia
    const otherUnpaid = order.costs.filter(
      (c) => c.type === "INNE" && !c.paid,
    ).length;
    if (otherUnpaid > 0)
      closeBlockers.push(`Niezapłacone inne opłaty: ${otherUnpaid}`);
    const namedSlots = new Set(
      DOC_CATEGORIES.flatMap((c) => c.slots)
        .filter((s) => !s.custom)
        .map((s) => s.id),
    );
    const filled = new Set(
      order.files
        .filter((f) => f.slot && namedSlots.has(f.slot))
        .map((f) => f.slot as string),
    ).size;
    const missing = namedSlots.size - filled;
    if (missing > 0)
      closeBlockers.push(`Brakujące dokumenty: ${missing}/${namedSlots.size}`);
  }
  const isClosed = !!order.closedAt;

  const isPolandOrder = order.country === "POLAND";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href={isPolandOrder ? "/zamowienia/z-polski" : "/zamowienia"}
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            {isPolandOrder ? "Zamówienia z Polski" : "Zamówienia z Chin"}
          </Link>
          <div className="flex items-center gap-3 mt-1">
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              {order.orderNumber}
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-xs ring-1",
                STATUS_BADGE[status],
              )}
            >
              {STATUS_LABEL[status]}
            </span>
            {isClosed && (
              <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold bg-slate-900 text-white ring-1 ring-slate-800">
                <Lock className="size-3" />
                ZAMKNIĘTE ·{" "}
                {new Date(order.closedAt!).toLocaleDateString("pl-PL")}
              </span>
            )}
          </div>
          {order.name && (
            <div className="text-sm text-muted-foreground mt-0.5">
              {order.name}
            </div>
          )}
        </div>

        <StatusWorkflow
          orderId={order.id}
          currentStatus={status}
          closedAt={order.closedAt}
          closeBlockers={closeBlockers}
          containerType={order.containerType}
          containerSizeM3={order.containerSizeM3}
          country={order.country}
        />
      </div>

      {(() => {
        // Stałe kategorie kosztów zawsze obowiązkowe:
        //  • CN — 7 typów: kontrola jakości, odprawa, terminalowe, transport
        //    lądowy + morski, cło, prowizja;
        //  • PL — 4 typy: kontrola jakości, transport, cięcie, krojenie.
        // VAT zawsze pomijany (informacyjny). Synchronicznie z konfigem
        // LOGISTYKA_TYPES_*/OPLATY_TYPES_* w payments-table.tsx.
        const MANDATORY_FIXED_COUNT = order.country === "POLAND" ? 4 : 7;
        const isExcluded = (type: string) => type === "VAT";

        const paidTranches = order.goodsTranches.filter((t) => t.paid).length;
        const totalTranches = order.goodsTranches.length;
        // Mandatory: stałe non-INNE non-VAT (zawsze liczone do Y, nawet jak nie utworzone)
        const paidMandatoryFixed = order.costs.filter(
          (c) => c.type !== "INNE" && !isExcluded(c.type) && c.paid,
        ).length;
        const otherCosts = order.costs.filter((c) => c.type === "INNE");
        const paidOtherCosts = otherCosts.filter((c) => c.paid).length;

        const paidAll = paidTranches + paidMandatoryFixed + paidOtherCosts;
        const totalAll =
          totalTranches + MANDATORY_FIXED_COUNT + otherCosts.length;
        const paymentsBadge =
          totalAll > 0 ? `${paidAll}/${totalAll}` : undefined;

        // Dokumentacja: filled/total wg DOC_CATEGORIES (tylko named sloty)
        const namedSlotIds = new Set(
          DOC_CATEGORIES.flatMap((c) => c.slots)
            .filter((s) => !s.custom)
            .map((s) => s.id),
        );
        const filledSlots = new Set(
          order.files
            .filter((f) => f.slot && namedSlotIds.has(f.slot))
            .map((f) => f.slot as string),
        ).size;
        const totalSlots = namedSlotIds.size;
        const docsBadge =
          totalSlots > 0 ? `${filledSlots}/${totalSlots}` : undefined;
        const itemsBadge = order.items.length.toString();
        // Badge awizacji: ✓ gdy minimum dane kierowcy uzupełnione
        const awizacjaReady =
          !!order.driverName &&
          !!order.driverPhone &&
          !!order.vehiclePlate;
        const awizacjaBadge = awizacjaReady ? "✓" : undefined;

        const isPoland = order.country === "POLAND";
        const guidelinesBadge =
          isPoland && order.pdfSections.length > 0
            ? String(order.pdfSections.length)
            : undefined;

        return (
          <OrderTabs
            itemsBadge={itemsBadge}
            paymentsBadge={paymentsBadge}
            docsBadge={docsBadge}
            awizacjaBadge={awizacjaBadge}
            guidelinesBadge={guidelinesBadge}
            guidelinesFabrykaSection={
              isPoland ? (
                <GuidelinesTab
                  pdfMode="fabryka"
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  orderHasItems={order.items.length > 0}
                  pdfDescription={order.pdfDescription ?? null}
                  deliveryAddressOverrideFabryka={order.deliveryAddressOverrideFabryka ?? null}
                  deliveryAddressOverrideKrajalnia={order.deliveryAddressOverrideKrajalnia ?? null}
                  companyDeliveryAddress={order.company?.deliveryAddress ?? null}
                  barcodeItems={order.items.map((it) => ({
                    productCode: it.product.productCode,
                    productName: it.product.name,
                    color: null,
                    eanCode: it.product.eanCode,
                    code128: it.product.code128,
                  }))}
                  initialSections={orderTemplateSections
                    .filter((s) => s.target === "FABRYKA")
                    .map((s) => ({
                      id: s.id,
                      title: s.title,
                      content: s.content ?? null,
                      sortOrder: s.sortOrder,
                      images: s.images.map((i) => ({
                        id: i.id,
                        url: i.url,
                        alt: i.alt ?? null,
                        sortOrder: i.sortOrder,
                      })),
                    }))}
                  templateSections={orderTemplateSections
                    .filter((s) => s.target === "FABRYKA")
                    .map((s) => ({
                      id: s.id,
                      title: s.title,
                      content: s.content ?? null,
                      sortOrder: s.sortOrder,
                      images: s.images.map((i) => ({
                        id: i.id,
                        url: i.url,
                        alt: i.alt ?? null,
                        sortOrder: i.sortOrder,
                      })),
                    }))}
                />
              ) : undefined
            }
            guidelinesSzwalniaSection={
              isPoland ? (
                <GuidelinesTab
                  pdfMode="krajalnia"
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  orderHasItems={order.items.length > 0}
                  pdfDescription={order.pdfDescription ?? null}
                  deliveryAddressOverrideFabryka={order.deliveryAddressOverrideFabryka ?? null}
                  deliveryAddressOverrideKrajalnia={order.deliveryAddressOverrideKrajalnia ?? null}
                  companyDeliveryAddress={order.company?.deliveryAddress ?? null}
                  barcodeItems={order.items.map((it) => ({
                    productCode: it.product.productCode,
                    productName: it.product.name,
                    color: null,
                    eanCode: it.product.eanCode,
                    code128: it.product.code128,
                  }))}
                  initialSections={orderTemplateSections
                    .filter((s) => s.target === "KRAJALNIA")
                    .map((s) => ({
                      id: s.id,
                      title: s.title,
                      content: s.content ?? null,
                      sortOrder: s.sortOrder,
                      images: s.images.map((i) => ({
                        id: i.id,
                        url: i.url,
                        alt: i.alt ?? null,
                        sortOrder: i.sortOrder,
                      })),
                    }))}
                  templateSections={orderTemplateSections
                    .filter((s) => s.target === "KRAJALNIA")
                    .map((s) => ({
                      id: s.id,
                      title: s.title,
                      content: s.content ?? null,
                      sortOrder: s.sortOrder,
                      images: s.images.map((i) => ({
                        id: i.id,
                        url: i.url,
                        alt: i.alt ?? null,
                        sortOrder: i.sortOrder,
                      })),
                    }))}
                />
              ) : undefined
            }
            paymentsSection={
              <div className="grid grid-cols-1 lg:grid-cols-[1.85fr_1fr] gap-6">
                <PaymentsTable
                  orderId={order.id}
                  tranches={order.goodsTranches}
                  costs={order.costs}
                  goodsTotal={calc.totalGoodsValuePln}
                  brokerCommissionInfo={brokerCommissionInfo}
                  customsInfo={customsInfo}
                  country={order.country}
                  defaultKrojeniePerSztPln={
                    order.company?.defaultKrojeniePerSztPln ?? null
                  }
                  defaultSzwalniaPerSztPln={
                    order.company?.defaultSzwalniaPerSztPln ?? null
                  }
                  totalOrderQty={order.items.reduce(
                    (s, it) => s + it.quantity,
                    0,
                  )}
                  rates={{
                    cnyToPlnRate: order.cnyToPlnRate,
                    usdToPlnRate: order.usdToPlnRate,
                    eurToPlnRate: order.eurToPlnRate,
                    vatRate: order.vatRate,
                  }}
                />
                <StageTasks
                  orderId={order.id}
                  currentStatus={status}
                  tasks={currentStageTasks}
                />
              </div>
            }
            docsSection={
              <DocsTable orderId={order.id} files={order.files} />
            }
            awizacjaSection={
              <AwizacjaTab
                data={{
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  orderName: order.name,
                  driverName: order.driverName,
                  driverPhone: order.driverPhone,
                  vehiclePlate: order.vehiclePlate,
                  vehicleType: order.vehicleType,
                  deliveryDate: order.deliveryDate,
                  awizacjaNotes: order.awizacjaNotes,
                  awizacjaPrintedAt: order.awizacjaPrintedAt,
                }}
                items={order.items.map((it, i) => {
                  const cbm = it.cbmPerUnit ?? it.product.cbmPerUnit ?? 0;
                  const calcItem = calc.items[i];
                  return {
                    productCode: it.product.productCode,
                    productName: it.product.name,
                    color: null,
                    eanCode: it.product.eanCode,
                    code128: it.product.code128,
                    quantity: it.quantity,
                    cbmPerUnit: cbm,
                    totalCbm: cbm * it.quantity,
                    weightKg: it.product.weightKg,
                    category: it.product.category?.name ?? null,
                    landedCostPerUnitPln:
                      calcItem?.landedCostPerUnitPln ?? 0,
                    importMode: it.product.importMode,
                    unitsPerBox: it.product.unitsPerBox,
                    boxWidthCm: it.product.boxWidthCm,
                    boxHeightCm: it.product.boxHeightCm,
                    boxDepthCm: it.product.boxDepthCm,
                  };
                })}
                companyName={order.company?.name ?? "Twoja firma"}
                warehouseAddress={
                  order.company?.address ?? "Magazyn (adres nieuzupełniony)"
                }
                containerType={order.containerType}
                containerCount={calc.containerCount}
              />
            }
            orderSection={
              <div className="space-y-4">
                <ItemsTab
                  orderId={order.id}
                  itemMeta={buildItemMeta({
                    items: order.items,
                    fulfillment,
                  })}
                  items={order.items.map((it) => ({
                    id: it.id,
                    productId: it.productId,
                    product: it.product,
                    quantity: it.quantity,
                    unitPriceUsd: it.unitPriceUsd,
                    unitPriceCny: it.unitPriceCny,
                    cnyToPlnRate: it.cnyToPlnRate,
                    usdToPlnRate: it.usdToPlnRate,
                    cbmPerUnit: it.cbmPerUnit,
                    expectedMonthlySales: it.expectedMonthlySales,
                    notes: it.notes,
                    variantSplits: it.variantSplits,
                    // Fallback: gdy konkretne pole kanału jest null,
                    // podstaw systemowy default z /ustawienia →
                    // „Domyślne wartości kanałów sprzedaży".
                    saleChannels: it.saleChannels.map((ch) => {
                      const isAllegro = ch.channel === "Allegro";
                      return {
                        ...ch,
                        commissionPct:
                          ch.commissionPct ??
                          (isAllegro
                            ? saleDefaults.allegroCommissionPct
                            : saleDefaults.sklepCommissionPct),
                        customerShippingPln:
                          ch.customerShippingPln ??
                          (isAllegro
                            ? saleDefaults.allegroCustomerShippingPln
                            : saleDefaults.sklepCustomerShippingPln),
                        adCostPln:
                          ch.adCostPln ??
                          (isAllegro
                            ? saleDefaults.allegroAdCostPln
                            : saleDefaults.sklepAdCostPln),
                        otherCostPln:
                          ch.otherCostPln ??
                          (isAllegro
                            ? saleDefaults.allegroAdCostPln
                            : null),
                      };
                    }),
                  }))}
                  calc={calc}
                  products={products}
                  categories={categoriesForItems}
                  fulfillment={fulfillment}
                  vatRate={order.vatRate ?? 0.23}
                  cnyToPlnRate={order.cnyToPlnRate}
                  usdToPlnRate={order.usdToPlnRate}
                  goodsTranches={order.goodsTranches.map((t) => ({
                    paidCurrency: t.paidCurrency,
                    paidExchangeRate: t.paidExchangeRate,
                    paidAmountOriginal: t.paidAmountOriginal,
                  }))}
                  orderStatus={status}
                  priceHistoryByProduct={priceHistoryByProduct}
                  country={order.country}
                  pdfDescription={order.pdfDescription ?? null}
                />
              </div>
            }
          />
        );
      })()}
    </div>
  );
}

// ─── Helper: cło importowe — Product > Category > Parent > Grandparent ─
// (Wynesione do `@/lib/customs-duty` żeby produkty/page.tsx i inne miejsca
//  używały tej samej logiki — bez dryftu liczeń landed cost.)

// ─── Helper: defaulty sprzedaży z kategorii (Allegro/Sklep × prowizja/KPK) ─

export type CategoryWithDefaults = {
  id: string;
  name: string;
  commissionPctAllegro: number | null;
  commissionPctSklep: number | null;
  kpkPlnAllegro: number | null;
  kpkPlnSklep: number | null;
  customerShippingPlnAllegro: number | null;
  customerShippingPlnSklep: number | null;
  parent: {
    id: string;
    name: string;
    commissionPctAllegro: number | null;
    commissionPctSklep: number | null;
    kpkPlnAllegro: number | null;
    kpkPlnSklep: number | null;
    customerShippingPlnAllegro: number | null;
    customerShippingPlnSklep: number | null;
    parent: {
      id: string;
      name: string;
      commissionPctAllegro: number | null;
      commissionPctSklep: number | null;
      kpkPlnAllegro: number | null;
      kpkPlnSklep: number | null;
      customerShippingPlnAllegro: number | null;
      customerShippingPlnSklep: number | null;
    } | null;
  } | null;
} | null;

/**
 * Zwraca wartość pola (prowizja % albo KPK zł) dla wybranego kanału,
 * z dziedziczeniem Category → Parent → Grandparent. Zwraca też
 * `sourceCategoryId` — kategorię z której wartość pochodzi (potrzebne
 * do quick-edit, żeby wiedzieć którą kategorię zaktualizować).
 */
export function resolveCategoryDefault(
  category: CategoryWithDefaults,
  channel: "Allegro" | "Sklep",
  field: "commissionPct" | "kpkPln" | "customerShippingPln",
): { value: number | null; sourceCategoryId: string | null; sourceCategoryName: string | null } {
  if (!category) {
    return { value: null, sourceCategoryId: null, sourceCategoryName: null };
  }
  const pick = (
    cat: NonNullable<CategoryWithDefaults>
      | NonNullable<NonNullable<CategoryWithDefaults>["parent"]>
      | NonNullable<NonNullable<NonNullable<CategoryWithDefaults>["parent"]>["parent"]>,
  ): number | null => {
    if (field === "commissionPct") {
      return channel === "Allegro"
        ? cat.commissionPctAllegro
        : cat.commissionPctSklep;
    }
    if (field === "kpkPln") {
      return channel === "Allegro" ? cat.kpkPlnAllegro : cat.kpkPlnSklep;
    }
    return channel === "Allegro"
      ? cat.customerShippingPlnAllegro
      : cat.customerShippingPlnSklep;
  };
  // Najbliższa kategoria która ma wartość — wygrywa.
  const own = pick(category);
  if (own != null) {
    return {
      value: own,
      sourceCategoryId: category.id,
      sourceCategoryName: category.name,
    };
  }
  if (category.parent) {
    const p = pick(category.parent);
    if (p != null) {
      return {
        value: p,
        sourceCategoryId: category.parent.id,
        sourceCategoryName: category.parent.name,
      };
    }
    if (category.parent.parent) {
      const pp = pick(category.parent.parent);
      if (pp != null) {
        return {
          value: pp,
          sourceCategoryId: category.parent.parent.id,
          sourceCategoryName: category.parent.parent.name,
        };
      }
    }
  }
  // Brak ustawienia w hierarchii — sugerujemy ustawienie najbliższej kategorii.
  return {
    value: null,
    sourceCategoryId: category.id,
    sourceCategoryName: category.name,
  };
}

// ─── Helper: meta per item dla tooltipów ─────────────────────────────

export type ItemShippingService = {
  brand: "INPOST" | "DHL";
  serviceCode: string;
  serviceLabel: string;
  deliveryMode: string;
  totalNetPln: number;
  totalGrossPln: number;
};

export type ItemMeta = {
  shipping: {
    applicable: ItemShippingService[];
    cheapest: ItemShippingService | null;
    preferredCodes: string[];
    boxLabel: string;
    boxOrigin: "SHIPPING" | "FACTORY";
  } | null;
  fulfillment: {
    orderOpening: number;
    mode: "MALE" | "HURTOWE";
    perSku: number;
    skuCount: number;
    perPiece: number;
    ownCarrier: number;
    palletPerUnit: number;
    palletRate: number;
    warehouseType: "GROUND" | "HIGH_RACK";
    unitsPerPallet: number | null;
    total: number;
  } | null;
  packaging: {
    boxName: string;
    pricePerBox: number | null;
    unitsPerBox: number;
    isFactory: boolean;
    /** Wymiary kartonu — tylko do tooltipa „jaki karton". */
    boxDims: {
      widthCm: number;
      heightCm: number;
      depthCm: number;
    } | null;
  } | null;
};

type RawItem = {
  id: string;
  product: {
    weightKg: number | null;
    unitsPerPallet: number | null;
    importMode: "KARTON" | "LUZEM";
    boxWidthCm: number | null;
    boxHeightCm: number | null;
    boxDepthCm: number | null;
    boxWeightKg: number | null;
    preferredShippingServices: string[];
    components: { id: string }[];
    shippingBoxes: {
      isPrimary: boolean;
      unitsPerBox: number;
      purpose: "SHIPPING" | "FACTORY";
      box: {
        name: string;
        widthCm: number;
        heightCm: number;
        depthCm: number;
        weightKg: number | null;
        purchasePricePln: number | null;
      };
    }[];
  };
};

function buildItemMeta(args: {
  items: RawItem[];
  fulfillment: {
    mode: "MALE" | "HURTOWE";
    warehouseType: "GROUND" | "HIGH_RACK";
    orderOpeningCost: number;
    shippingCostPerSku: number;
    perPiecePln: number;
    ownCarrierPln: number;
    palletStorageCostPerMonth: number;
  };
}): Record<string, ItemMeta> {
  const out: Record<string, ItemMeta> = {};
  for (const it of args.items) {
    const product = it.product;
    const shipPins = product.shippingBoxes.filter(
      (b) => b.purpose === "SHIPPING",
    );
    const factPins = product.shippingBoxes.filter(
      (b) => b.purpose === "FACTORY",
    );

    // ── Wysyłka kurierem ──
    // Wybór pudełka do wyceny:
    //   1) Catalog pin SHIPPING (primary) — gdy user przypisał osobny karton.
    //   2) Catalog pin SHIPPING (dowolny) — pierwsze przypisanie.
    //   3) Catalog pin FACTORY (primary/dowolne) — karton z Chin z katalogu.
    //   4) Fallback dla KARTON mode: wymiary z product.boxW/H/D (karton z Chin = karton wysyłkowy).
    const catalogPrimary =
      shipPins.find((b) => b.isPrimary) ??
      shipPins[0] ??
      factPins.find((b) => b.isPrimary) ??
      factPins[0] ??
      null;
    const fallbackToProductBox =
      !catalogPrimary &&
      product.importMode === "KARTON" &&
      product.boxWidthCm != null &&
      product.boxHeightCm != null &&
      product.boxDepthCm != null &&
      product.boxWidthCm > 0 &&
      product.boxHeightCm > 0 &&
      product.boxDepthCm > 0;

    type PrimaryBoxLite = {
      box: {
        widthCm: number;
        heightCm: number;
        depthCm: number;
        weightKg: number | null;
      };
      purpose: "SHIPPING" | "FACTORY";
    };
    const primaryBox: PrimaryBoxLite | null = catalogPrimary
      ? {
          box: {
            widthCm: catalogPrimary.box.widthCm,
            heightCm: catalogPrimary.box.heightCm,
            depthCm: catalogPrimary.box.depthCm,
            weightKg: catalogPrimary.box.weightKg,
          },
          purpose: catalogPrimary.purpose as "SHIPPING" | "FACTORY",
        }
      : fallbackToProductBox
        ? {
            box: {
              widthCm: product.boxWidthCm!,
              heightCm: product.boxHeightCm!,
              depthCm: product.boxDepthCm!,
              weightKg: product.boxWeightKg,
            },
            purpose: "FACTORY" as const,
          }
        : null;
    let shipping: ItemMeta["shipping"] = null;
    if (primaryBox) {
      const quote = quoteShippingForProduct({
        productWeightKg: product.weightKg,
        primaryBox: {
          widthCm: primaryBox.box.widthCm,
          heightCm: primaryBox.box.heightCm,
          depthCm: primaryBox.box.depthCm,
          weightKg: primaryBox.box.weightKg,
        },
        preferredServiceCodes: product.preferredShippingServices,
      });
      if (quote) {
        shipping = {
          applicable: quote.applicable.map((s) => ({
            brand: s.brand,
            serviceCode: s.serviceCode,
            serviceLabel: s.serviceLabel,
            deliveryMode: s.deliveryMode,
            totalNetPln: s.totalNetPln,
            totalGrossPln: s.totalGrossPln,
          })),
          cheapest: quote.cheapest
            ? {
                brand: quote.cheapest.brand,
                serviceCode: quote.cheapest.serviceCode,
                serviceLabel: quote.cheapest.serviceLabel,
                deliveryMode: quote.cheapest.deliveryMode,
                totalNetPln: quote.cheapest.totalNetPln,
                totalGrossPln: quote.cheapest.totalGrossPln,
              }
            : null,
          preferredCodes: product.preferredShippingServices,
          boxLabel: `${primaryBox.box.widthCm}×${primaryBox.box.heightCm}×${primaryBox.box.depthCm} cm + ${product.weightKg ?? 0} kg`,
          boxOrigin: primaryBox.purpose,
        };
      }
    }

    // ── Fulfillment ──
    const skuCount = Math.max(1, product.components.length || 1);
    const palletPerUnit =
      product.unitsPerPallet && product.unitsPerPallet > 0
        ? args.fulfillment.palletStorageCostPerMonth / product.unitsPerPallet
        : 0;
    const fulfillTotal =
      args.fulfillment.orderOpeningCost +
      args.fulfillment.shippingCostPerSku * skuCount +
      args.fulfillment.perPiecePln +
      args.fulfillment.ownCarrierPln +
      palletPerUnit;
    const fulfillment = fulfillTotal > 0
      ? {
          orderOpening: args.fulfillment.orderOpeningCost,
          mode: args.fulfillment.mode,
          perSku: args.fulfillment.shippingCostPerSku,
          skuCount,
          perPiece: args.fulfillment.perPiecePln,
          ownCarrier: args.fulfillment.ownCarrierPln,
          palletPerUnit,
          palletRate: args.fulfillment.palletStorageCostPerMonth,
          warehouseType: args.fulfillment.warehouseType,
          unitsPerPallet: product.unitsPerPallet ?? null,
          total: fulfillTotal,
        }
      : null;

    // ── Karton ──
    const pkgBox =
      shipPins.find((b) => b.isPrimary && b.box.purchasePricePln != null) ??
      shipPins.find((b) => b.box.purchasePricePln != null) ??
      shipPins[0] ??
      factPins[0] ??
      null;
    let packaging: ItemMeta["packaging"] = null;
    if (pkgBox) {
      packaging = {
        boxName: pkgBox.box.name,
        pricePerBox: pkgBox.box.purchasePricePln,
        unitsPerBox: pkgBox.unitsPerBox,
        isFactory: pkgBox.purpose === "FACTORY",
        boxDims:
          pkgBox.box.widthCm != null &&
          pkgBox.box.heightCm != null &&
          pkgBox.box.depthCm != null
            ? {
                widthCm: pkgBox.box.widthCm,
                heightCm: pkgBox.box.heightCm,
                depthCm: pkgBox.box.depthCm,
              }
            : null,
      };
    }

    out[it.id] = { shipping, fulfillment, packaging };
  }
  return out;
}
