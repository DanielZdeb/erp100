import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Calculator,
  CircleDollarSign,
  Coins,
  FileText,
  Image as ImageIcon,
  Layers,
  Megaphone,
  Package,
  Pencil,
  Puzzle,
  Ruler,
  Ship,
  ShoppingCart,
  Tag,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ArchiveButton } from "../archive-button";
import { DeleteProductButton } from "../delete-button";
import { ImagesTab } from "../images-tab";
import { FilesTab } from "../files-tab";
import { PriceHistoryTab } from "../price-history-tab";
import { CouriersTab } from "../couriers-tab";
import { LabelTab } from "../label-tab";
import { StagesStepper } from "../stages-stepper";
import { StagesTab } from "../stages-tab";
import { ComponentsTab } from "../components-tab";
import {
  PurchaseHistoryTab,
  type PurchaseHistoryRow,
} from "../purchase-history-tab";
import type { OrderStatusT } from "@/lib/order-status";
import { EditProductDialog } from "../../product-form-dialog";
import {
  getDefaultContainerM3,
  getFulfillmentSettings,
} from "@/server/system-settings";
import { BoxesTab } from "../boxes-tab";
import { ShippingCalculator } from "../shipping-calculator";
import { calculateShipping } from "@/lib/shipping-calc";
import { effectiveContainerCbm, kalkulujKontener } from "@/lib/kalkulacje";
import {
  PriceCellWithHistory,
  type PriceHistoryEntry,
} from "../../price-history-popover";
import { EditableSaleCell } from "../../editable-sale-cell";
import {
  PRODUCT_STATUS_BADGE,
  PRODUCT_STATUS_SHORT,
  type ProductStatusT,
} from "@/lib/product-status";
import type { ProductStageT } from "@/lib/product-stages";

export const dynamic = "force-dynamic";

const NEGOTIATED_STATUSES = [
  "DOGADYWANE",
  "PRODUKOWANE",
  "WYPRODUKOWANE",
  "WYSLANE",
  "ODEBRANE",
  "W_MAGAZYNIE",
] as const;
const DEFAULT_VAT_RATE_PD = 0.23;
type DetailPriceMode = "brutto" | "netto";

export default async function ProduktSzczegolyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
}) {
  const { id } = await params;
  const companyId = await getCurrentCompanyId();
  const sp = (await searchParams) ?? {};
  const priceMode: DetailPriceMode =
    sp.mode === "brutto" ? "brutto" : "netto";

  const [
    product,
    couriers,
    availableProducts,
    orderItems,
    categories,
    defaultContainerM3,
    availableBoxes,
    courierRates,
    componentCategoryOptionsRaw,
    componentRules,
    fulfillment,
  ] = await Promise.all([
    db.product.findFirst({
      where: { id, companyId },
      include: {
        category: { select: { id: true, name: true } },
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        files: { orderBy: { createdAt: "desc" } },
        priceHistory: { orderBy: { recordedAt: "desc" } },
        courierRecommendations: {
          orderBy: { priority: "asc" },
          include: {
            courier: { select: { id: true, name: true } },
          },
        },
        stageCompletions: true,
        stageChecklistItems: {
          orderBy: { sortOrder: "asc" },
        },
        shippingBoxes: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          include: {
            box: {
              select: {
                id: true,
                name: true,
                internalCode: true,
                packagingType: true,
                widthCm: true,
                heightCm: true,
                depthCm: true,
                weightKg: true,
                cardboardLayers: true,
                purchasePricePln: true,
              },
            },
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
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { url: true, alt: true },
                },
              },
            },
          },
        },
      },
    }),
    db.courier.findMany({
      where: { companyId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    db.product.findMany({
      where: { companyId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, productCode: true },
    }),
    db.importOrderItem.findMany({
      where: { productId: id, order: { companyId } },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            createdAt: true,
            cnyToPlnRate: true,
            usdToPlnRate: true,
          },
        },
        saleChannels: {
          select: { channel: true, salePricePln: true, commissionPct: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.category.findMany({
      where: { companyId },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parentId: true, level: true },
    }),
    getDefaultContainerM3(),
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
      },
    }),
    db.courierRate.findMany({
      where: { courier: { companyId, active: true } },
      include: {
        courier: { select: { id: true, name: true } },
      },
      orderBy: { pricePln: "asc" },
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
    db.componentCategoryRule.findMany({
      where: { componentId: id, component: { companyId } },
      select: { categoryId: true },
    }),
    getFulfillmentSettings(),
  ]);

  if (!product) notFound();

  const componentCategoryOptions = componentCategoryOptionsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parentId,
    level: c.level,
    productCount: c._count.products,
  }));
  const initialAssignedCategoryIds = componentRules.map((r) => r.categoryId);

  // ─── Dane do wiersza ekonomiki produktu ──────────────────────────────
  // Bierzemy tylko pozycje z zamówień ≥ DOGADYWANE (po negocjacji ceny).
  const negotiatedItems = orderItems.filter((it) =>
    (NEGOTIATED_STATUSES as readonly string[]).includes(it.order.status),
  );
  const lastItem = negotiatedItems[0] ?? null;
  const lastOrderInfo = lastItem
    ? {
        orderId: lastItem.order.id,
        orderNumber: lastItem.order.orderNumber,
        createdAt: lastItem.order.createdAt,
        unitPriceCny: lastItem.unitPriceCny,
        unitPriceUsd: lastItem.unitPriceUsd,
        cnyToPlnRate: lastItem.cnyToPlnRate ?? lastItem.order.cnyToPlnRate,
        usdToPlnRate: lastItem.usdToPlnRate ?? lastItem.order.usdToPlnRate,
      }
    : null;
  // Historia ostatnich 10 dla popovera — z osobnymi seriami: zakup,
  // logistyka, landed (suma). Dla każdego unikalnego historycznego
  // zamówienia odpalamy `kalkulujKontener` żeby policzyć logistykę i
  // landed per szt. Zakup liczymy z (USD × kurs) + flaga isBrutto.
  const top10HistItems = negotiatedItems.slice(0, 10);
  const histOrderIds = Array.from(
    new Set(top10HistItems.map((it) => it.order.id)),
  );
  const histFullOrders =
    histOrderIds.length > 0
      ? await db.importOrder.findMany({
          where: { companyId, id: { in: histOrderIds } },
          include: {
            costs: true,
            goodsTranches: true,
            items: {
              include: {
                saleChannels: true,
                product: {
                  select: {
                    boxWidthCm: true,
                    boxHeightCm: true,
                    boxDepthCm: true,
                    unitsPerBox: true,
                    masterBoxWidthCm: true,
                    masterBoxHeightCm: true,
                    masterBoxDepthCm: true,
                    innerBoxesPerMaster: true,
                    shippingBoxes: {
                      orderBy: [
                        { isPrimary: "desc" },
                        { createdAt: "asc" },
                      ],
                      select: {
                        isPrimary: true,
                        unitsPerBox: true,
                        purpose: true,
                        box: {
                          select: {
                            widthCm: true,
                            heightCm: true,
                            depthCm: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : [];
  const histEconByItemId = new Map<
    string,
    {
      purchasePerUnitPln: number;
      logisticsPerUnitPln: number;
      landedPerUnitPln: number;
    }
  >();
  for (const ord of histFullOrders) {
    const calc = kalkulujKontener({
      rates: {
        cnyToPln: ord.cnyToPlnRate ?? 0,
        usdToPln: ord.usdToPlnRate ?? 0,
        vatRate: ord.vatRate ?? 0.23,
      },
      containerSizeM3: ord.containerSizeM3 ?? 28,
      costs: ord.costs.map((c) => ({ amountPln: c.amountPln })),
      goodsTranches: ord.goodsTranches.map((t) => ({
        paidCurrency: t.paidCurrency,
        paidExchangeRate: t.paidExchangeRate,
        paidAmountOriginal: t.paidAmountOriginal,
      })),
      items: ord.items.map((it) => {
        const baseCbm = it.cbmPerUnit ?? 0;
        const factoryPin =
          it.product.shippingBoxes.find(
            (b) => b.purpose === "FACTORY" && b.isPrimary,
          ) ??
          it.product.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
          null;
        const eff = effectiveContainerCbm({
          quantity: it.quantity,
          cbmPerUnit: baseCbm,
          boxWidthCm: factoryPin?.box.widthCm ?? it.product.boxWidthCm,
          boxHeightCm: factoryPin?.box.heightCm ?? it.product.boxHeightCm,
          boxDepthCm: factoryPin?.box.depthCm ?? it.product.boxDepthCm,
          unitsPerBox: factoryPin?.unitsPerBox ?? it.product.unitsPerBox,
          masterBoxWidthCm: it.product.masterBoxWidthCm,
          masterBoxHeightCm: it.product.masterBoxHeightCm,
          masterBoxDepthCm: it.product.masterBoxDepthCm,
          innerBoxesPerMaster: it.product.innerBoxesPerMaster,
        });
        return {
          quantity: it.quantity,
          cbmPerUnit:
            eff.source !== "RAW" ? eff.effectiveCbmPerUnit : baseCbm,
          unitPriceUsd: it.unitPriceUsd,
          unitPriceCny: it.unitPriceCny,
          cnyToPlnRate: it.cnyToPlnRate,
          usdToPlnRate: it.usdToPlnRate,
          expectedMonthlySales: it.expectedMonthlySales,
          saleChannels: it.saleChannels.map((ch) => ({
            channel: ch.channel,
            salePricePln: ch.salePricePln,
            commissionPct: ch.commissionPct,
            commissionFlat: ch.commissionFlat,
            shippingCostPln: ch.shippingCostPln,
            fulfillmentPln: ch.fulfillmentPln,
            packagingCostPln: ch.packagingCostPln,
            adCostPln: ch.adCostPln,
            otherCostPln: ch.otherCostPln,
            shareOfQty: ch.shareOfQty,
          })),
        };
      }),
    });
    for (let i = 0; i < calc.items.length; i++) {
      const oi = ord.items[i];
      const ic = calc.items[i];
      if (oi.quantity > 0) {
        histEconByItemId.set(oi.id, {
          purchasePerUnitPln: ic.unitPriceNettoPln,
          logisticsPerUnitPln: ic.allocatedLogisticsPln / oi.quantity,
          landedPerUnitPln: ic.landedCostPerUnitPln,
        });
      }
    }
  }
  const priceHistory: PriceHistoryEntry[] = top10HistItems.map((it) => {
    const e = histEconByItemId.get(it.id);
    return {
      orderId: it.order.id,
      orderNumber: it.order.orderNumber,
      orderStatus: it.order.status,
      createdAt: it.order.createdAt,
      quantity: it.quantity,
      unitPriceUsd: it.unitPriceUsd,
      usdToPlnRate: it.usdToPlnRate ?? it.order.usdToPlnRate,
      purchasePerUnitPln: e?.purchasePerUnitPln ?? null,
      logisticsPerUnitPln: e?.logisticsPerUnitPln ?? null,
      landedPerUnitPln: e?.landedPerUnitPln ?? null,
    };
  });

  // Logistyka per szt — wyciągana z calc kontenera ostatniego negocjowanego zamówienia.
  let logisticsPerUnit: number | null = null;
  if (lastItem) {
    const fullOrder = await db.importOrder.findFirst({
      where: { id: lastItem.order.id, companyId },
      include: {
        costs: true,
        goodsTranches: true,
        items: {
          include: {
            saleChannels: true,
            product: {
              select: {
                boxWidthCm: true,
                boxHeightCm: true,
                boxDepthCm: true,
                unitsPerBox: true,
                masterBoxWidthCm: true,
                masterBoxHeightCm: true,
                masterBoxDepthCm: true,
                innerBoxesPerMaster: true,
                shippingBoxes: {
                  orderBy: [
                    { isPrimary: "desc" },
                    { createdAt: "asc" },
                  ],
                  select: {
                    isPrimary: true,
                    unitsPerBox: true,
                    purpose: true,
                    box: {
                      select: {
                        widthCm: true,
                        heightCm: true,
                        depthCm: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (fullOrder) {
      const calc = kalkulujKontener({
        rates: {
          cnyToPln: fullOrder.cnyToPlnRate ?? 0,
          usdToPln: fullOrder.usdToPlnRate ?? 0,
          vatRate: fullOrder.vatRate ?? 0.23,
        },
        containerSizeM3: fullOrder.containerSizeM3 ?? 28,
        // Logistyka — kwoty w DB są już netto (polityka netto-only).
        costs: fullOrder.costs.map((c) => ({
          amountPln: c.amountPln,
        })),
        goodsTranches: fullOrder.goodsTranches.map((t) => ({
          paidCurrency: t.paidCurrency,
          paidExchangeRate: t.paidExchangeRate,
          paidAmountOriginal: t.paidAmountOriginal,
        })),
        items: fullOrder.items.map((it) => {
          const baseCbm = it.cbmPerUnit ?? 0;
          const factoryPin =
            it.product.shippingBoxes.find(
              (b) => b.purpose === "FACTORY" && b.isPrimary,
            ) ??
            it.product.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
            null;
          const eff = effectiveContainerCbm({
            quantity: it.quantity,
            cbmPerUnit: baseCbm,
            boxWidthCm: factoryPin?.box.widthCm ?? it.product.boxWidthCm,
            boxHeightCm: factoryPin?.box.heightCm ?? it.product.boxHeightCm,
            boxDepthCm: factoryPin?.box.depthCm ?? it.product.boxDepthCm,
            unitsPerBox: factoryPin?.unitsPerBox ?? it.product.unitsPerBox,
            masterBoxWidthCm: it.product.masterBoxWidthCm,
            masterBoxHeightCm: it.product.masterBoxHeightCm,
            masterBoxDepthCm: it.product.masterBoxDepthCm,
            innerBoxesPerMaster: it.product.innerBoxesPerMaster,
          });
          return {
            quantity: it.quantity,
            cbmPerUnit:
              eff.source !== "RAW" ? eff.effectiveCbmPerUnit : baseCbm,
            unitPriceUsd: it.unitPriceUsd,
            unitPriceCny: it.unitPriceCny,
            cnyToPlnRate: it.cnyToPlnRate,
            usdToPlnRate: it.usdToPlnRate,
            expectedMonthlySales: it.expectedMonthlySales,
            saleChannels: it.saleChannels.map((ch) => ({
              channel: ch.channel,
              salePricePln: ch.salePricePln,
              commissionPct: ch.commissionPct,
              commissionFlat: ch.commissionFlat,
              shippingCostPln: ch.shippingCostPln,
              fulfillmentPln: ch.fulfillmentPln,
              packagingCostPln: ch.packagingCostPln,
              adCostPln: ch.adCostPln,
              otherCostPln: ch.otherCostPln,
              shareOfQty: ch.shareOfQty,
            })),
          };
        }),
      });
      const idx = fullOrder.items.findIndex((it) => it.id === lastItem.id);
      if (idx >= 0 && fullOrder.items[idx].quantity > 0) {
        logisticsPerUnit =
          calc.items[idx].allocatedLogisticsPln /
          fullOrder.items[idx].quantity;
      }
    }
  }

  // Karton wysyłkowy — cena zakupu primary box (jeśli ustawiona) / sztuk w pudełku.
  // TYLKO SHIPPING — FACTORY box (z Chin) nie wchodzi w koszt wysyłki kurierem.
  const shippingPinsDetail = product.shippingBoxes.filter(
    (b) => b.purpose === "SHIPPING",
  );
  const primaryBoxLink =
    shippingPinsDetail.find(
      (b) => b.isPrimary && b.box.purchasePricePln != null,
    ) ??
    shippingPinsDetail.find((b) => b.box.purchasePricePln != null) ??
    null;
  const detailBoxPricePerUnit =
    primaryBoxLink && primaryBoxLink.box.purchasePricePln && primaryBoxLink.unitsPerBox > 0
      ? primaryBoxLink.box.purchasePricePln / primaryBoxLink.unitsPerBox
      : null;
  const detailBoxName = primaryBoxLink?.box.name ?? null;

  // Najtańszy kurier z dopasowanym primary box — do podpowiedzi „Wysyłka".
  const shippingOptions = calculateShipping(
    { weightKg: product.weightKg },
    1,
    product.shippingBoxes.map((pb) => ({
      box: pb.box,
      unitsPerBox: pb.unitsPerBox,
      isPrimary: pb.isPrimary,
    })),
    courierRates,
  );
  const primaryShippingOption =
    shippingOptions.find((o) => o.isPrimary && o.cheapest) ?? null;
  const cheapestShipping = primaryShippingOption?.cheapest
    ? {
        courierName: primaryShippingOption.cheapest.courierName,
        serviceType: primaryShippingOption.cheapest.serviceType,
        pricePerBox: primaryShippingOption.cheapest.pricePerBox,
        unitsPerBox: primaryShippingOption.unitsPerBox,
        pricePerUnit:
          primaryShippingOption.cheapest.pricePerBox /
          Math.max(1, primaryShippingOption.unitsPerBox),
        boxName: primaryShippingOption.boxName,
      }
    : null;

  const completedStages = new Set<ProductStageT>(
    product.stageCompletions.map((s) => s.stage as ProductStageT),
  );

  // Grupowanie po etapie (do StagesTab)
  const emptyByStage = <T,>(): Record<ProductStageT, T[]> => ({
    PRODUKCJA: [],
    IMPORT: [],
    DOKUMENTACJA: [],
    WYSYLKA: [],
    OPIS: [],
    GRAFIKI: [],
  });

  const checklistByStage = emptyByStage<typeof product.stageChecklistItems[number]>();
  for (const c of product.stageChecklistItems) {
    checklistByStage[c.stage as ProductStageT].push(c);
  }

  const stageImagesByStage = emptyByStage<typeof product.images[number]>();
  const generalImages: typeof product.images = [];
  for (const img of product.images) {
    if (img.stage) {
      stageImagesByStage[img.stage as ProductStageT].push(img);
    } else {
      generalImages.push(img);
    }
  }

  const stageFilesByStage = emptyByStage<typeof product.files[number]>();
  const generalFiles: typeof product.files = [];
  for (const f of product.files) {
    if (f.stage) {
      stageFilesByStage[f.stage as ProductStageT].push(f);
    } else {
      generalFiles.push(f);
    }
  }

  const purchaseHistory: PurchaseHistoryRow[] = orderItems.map((it) => ({
    itemId: it.id,
    orderId: it.order.id,
    orderNumber: it.order.orderNumber,
    orderStatus: it.order.status as OrderStatusT,
    orderCreatedAt: it.order.createdAt,
    quantity: it.quantity,
    unitPriceUsd: it.unitPriceUsd,
    unitPriceCny: it.unitPriceCny,
    usdRate: it.usdToPlnRate ?? it.order.usdToPlnRate,
    cnyRate: it.cnyToPlnRate ?? it.order.cnyToPlnRate,
    channels: it.saleChannels,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/produkty"
            className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            Produkty
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-3xl font-heading font-bold tracking-tight">
              {product.name}
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded px-2 py-0.5 text-xs ring-1",
                PRODUCT_STATUS_BADGE[product.status as ProductStatusT],
              )}
            >
              {PRODUCT_STATUS_SHORT[product.status as ProductStatusT]}
            </span>
            {product.archived && (
              <Badge variant="secondary">zarchiwizowany</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground flex gap-3 mt-1 flex-wrap">
            <span>
              Kod: <code>{product.productCode}</code>
            </span>
            {product.eanCode && (
              <span>
                EAN: <code>{product.eanCode}</code>
              </span>
            )}
            {product.category && (
              <span>Kategoria: {product.category.name}</span>
            )}
            {product.color && <span>Kolor: {product.color}</span>}
            {product.compositionMode === "KOMPONENTOWY" && (
              <Badge variant="secondary">z komponentów</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <ArchiveButton id={product.id} archived={product.archived} />
          <DeleteProductButton
            id={product.id}
            name={product.name}
            isComponent={product.isComponent}
          />
          <EditProductDialog
            productId={product.id}
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            initialAssignedCategoryIds={initialAssignedCategoryIds}
            defaultContainerM3={defaultContainerM3}
            productBoxes={product.shippingBoxes.map((pb) => ({
              id: pb.id,
              purpose: pb.purpose as "SHIPPING" | "FACTORY",
              unitsPerBox: pb.unitsPerBox,
              isPrimary: pb.isPrimary,
              notes: pb.notes,
              imageUrl: pb.imageUrl,
              imageAlt: pb.imageAlt,
              designUrl: pb.designUrl,
              designName: pb.designName,
              box: {
                id: pb.box.id,
                name: pb.box.name,
                internalCode: pb.box.internalCode,
                packagingType: pb.box.packagingType as "BOX" | "POLY_BAG",
                widthCm: pb.box.widthCm,
                heightCm: pb.box.heightCm,
                depthCm: pb.box.depthCm,
                weightKg: pb.box.weightKg,
                cardboardLayers: pb.box.cardboardLayers,
              },
            }))}
            availableBoxes={availableBoxes.map((b) => ({
              id: b.id,
              name: b.name,
              internalCode: b.internalCode,
              packagingType: b.packagingType as "BOX" | "POLY_BAG",
              widthCm: b.widthCm,
              heightCm: b.heightCm,
              depthCm: b.depthCm,
              cardboardLayers: b.cardboardLayers,
            }))}
            initial={{
              name: product.name,
              productCode: product.productCode,
              eanCode: product.eanCode,
              code128: product.code128,
              categoryId: product.categoryId,
              status: product.status,
              importMode: product.importMode,
              compositionMode: product.compositionMode,
              isComponent: product.isComponent,
              color: product.color,
              widthCm: product.widthCm,
              heightCm: product.heightCm,
              depthCm: product.depthCm,
              weightKg: product.weightKg,
              boxWidthCm: product.boxWidthCm,
              boxHeightCm: product.boxHeightCm,
              boxDepthCm: product.boxDepthCm,
              boxWeightKg: product.boxWeightKg,
              unitsPerBox: product.unitsPerBox,
              unitsPerContainer: product.unitsPerContainer,
              referenceContainerM3: product.referenceContainerM3,
              shippingBoxWidthCm: product.shippingBoxWidthCm,
              shippingBoxHeightCm: product.shippingBoxHeightCm,
              shippingBoxDepthCm: product.shippingBoxDepthCm,
              shippingBoxWeightKg: product.shippingBoxWeightKg,
              unitsPerShippingBox: product.unitsPerShippingBox,
              unitsPerPallet: product.unitsPerPallet,
              cbmPerUnit: product.cbmPerUnit,
              customsDutyPct: product.customsDutyPct,
              defaultUnitPriceUsd: product.defaultUnitPriceUsd,
              defaultUnitPriceCny: product.defaultUnitPriceCny,
              defaultSalePriceAllegroPln: product.defaultSalePriceAllegroPln,
              defaultSalePriceSklepPln: product.defaultSalePriceSklepPln,
              defaultAllegroCommissionPct: product.defaultAllegroCommissionPct,
              importGuidelines: product.importGuidelines,
              productionGuidelines: product.productionGuidelines,
              userManual: product.userManual,
              shopDescription: product.shopDescription,
              internalNotes: product.internalNotes,
            }}
            triggerClassName="gap-2"
          >
            <Pencil className="size-4" />
            Edytuj
          </EditProductDialog>
        </div>
      </div>

      <ProductEconomicsRow
        product={{
          id: product.id,
          name: product.name,
          isComponent: product.isComponent,
          weightKg: product.weightKg,
          cbmPerUnit: product.cbmPerUnit,
          unitsPerPallet: product.unitsPerPallet,
          defaultUnitPriceCny: product.defaultUnitPriceCny,
          defaultUnitPriceUsd: product.defaultUnitPriceUsd,
          defaultSalePriceAllegroPln: product.defaultSalePriceAllegroPln,
          defaultSalePriceSklepPln: product.defaultSalePriceSklepPln,
          defaultAllegroCommissionPct: product.defaultAllegroCommissionPct,
          defaultSklepCommissionPct: product.defaultSklepCommissionPct,
          defaultAllegroOtherCostPln: product.defaultAllegroOtherCostPln,
          defaultSklepOtherCostPln: product.defaultSklepOtherCostPln,
          defaultAllegroCustomerShippingPln:
            product.defaultAllegroCustomerShippingPln,
          defaultSklepCustomerShippingPln:
            product.defaultSklepCustomerShippingPln,
          defaultSklepAdCostPln: product.defaultSklepAdCostPln,
          imageUrl: generalImages[0]?.url ?? null,
          imageAlt: generalImages[0]?.alt ?? null,
          skuCount: Math.max(1, product.components.length || 1),
          boxPricePerUnit: detailBoxPricePerUnit,
          boxName: detailBoxName,
        }}
        lastOrder={lastOrderInfo}
        shipping={cheapestShipping}
        fulfillment={fulfillment}
        priceMode={priceMode}
        priceHistory={priceHistory}
        logisticsPerUnit={logisticsPerUnit}
      />

      <StagesStepper completedStages={completedStages} />

      {/* Sticky anchor nav — żeby dało się szybko skoczyć między sekcjami */}
      <nav className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur border-b">
        <div className="flex flex-wrap gap-1.5">
          <AnchorPill href="#etapy" icon={Layers} label="Etapy" count={`${completedStages.size}/6`} />
          <AnchorPill href="#wymiary" icon={Ruler} label="Przegląd" />
          {product.compositionMode === "KOMPONENTOWY" && (
            <AnchorPill href="#komponenty" icon={Puzzle} label="Komponenty" count={product.components.length} />
          )}
          <AnchorPill href="#zamowienia" icon={ShoppingCart} label="Zamówienia" count={purchaseHistory.length} />
          <AnchorPill href="#pudelka" icon={Boxes} label="Pudełka" count={product.shippingBoxes.length} />
          <AnchorPill href="#grafiki" icon={ImageIcon} label="Grafiki" count={generalImages.length} />
          <AnchorPill href="#pliki" icon={FileText} label="Pliki" count={generalFiles.length} />
          <AnchorPill href="#ceny" icon={TrendingUp} label="Ceny" count={product.priceHistory.length} />
          <AnchorPill href="#kurierzy" icon={Truck} label="Kurierzy" count={product.courierRecommendations.length} />
          <AnchorPill href="#etykieta" icon={Tag} label="Etykieta" />
        </div>
      </nav>

      {/* ETAPY */}
      <section id="etapy" className="scroll-mt-20 space-y-3">
        <SectionHeader
          icon={Layers}
          title="Etapy wdrożenia"
          count={`${completedStages.size}/6`}
          colorClass="bg-indigo-100 text-indigo-700"
        />
        <StagesTab
          productId={product.id}
          stages={product.stageCompletions.map((s) => ({
            stage: s.stage as ProductStageT,
            completedAt: s.completedAt,
            notes: s.notes,
          }))}
          product={{
            productionGuidelines: product.productionGuidelines,
            importGuidelines: product.importGuidelines,
            userManual: product.userManual,
            shopDescription: product.shopDescription,
            eanCode: product.eanCode,
            color: product.color,
            shippingBoxWidthCm: product.shippingBoxWidthCm,
            shippingBoxHeightCm: product.shippingBoxHeightCm,
            shippingBoxDepthCm: product.shippingBoxDepthCm,
            imagesCount: generalImages.length,
            filesCount: generalFiles.length,
          }}
          checklist={Object.fromEntries(
            Object.entries(checklistByStage).map(([k, items]) => [
              k,
              items.map((i) => ({
                id: i.id,
                title: i.title,
                done: i.done,
                sortOrder: i.sortOrder,
              })),
            ]),
          ) as Record<ProductStageT, { id: string; title: string; done: boolean; sortOrder: number }[]>}
          stageImages={Object.fromEntries(
            Object.entries(stageImagesByStage).map(([k, images]) => [
              k,
              images.map((i) => ({ id: i.id, url: i.url, alt: i.alt })),
            ]),
          ) as Record<ProductStageT, { id: string; url: string; alt: string | null }[]>}
          stageFiles={Object.fromEntries(
            Object.entries(stageFilesByStage).map(([k, files]) => [
              k,
              files.map((f) => ({
                id: f.id,
                url: f.url,
                filename: f.filename,
                sizeBytes: f.sizeBytes,
                contentType: f.contentType,
              })),
            ]),
          ) as Record<ProductStageT, { id: string; url: string; filename: string; sizeBytes: number | null; contentType: string | null }[]>}
        />
      </section>

      {/* PRZEGLĄD: Wymiary | Import | Pudło wysyłkowe */}
      <section id="wymiary" className="scroll-mt-20 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="overflow-hidden border-l-4 border-l-slate-400">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="size-7 rounded-md bg-slate-100 text-slate-700 flex items-center justify-center">
                <Ruler className="size-3.5" />
              </div>
              Wymiary produktu
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Definitions
              items={[
                ["Szerokość", fmt(product.widthCm, "cm")],
                ["Wysokość", fmt(product.heightCm, "cm")],
                ["Głębokość", fmt(product.depthCm, "cm")],
                ["Waga", fmt(product.weightKg, "kg")],
              ]}
            />
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-amber-400">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="size-7 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center">
                <Ship className="size-3.5" />
              </div>
              Import z Chin
              <Badge variant="secondary" className="text-[10px]">
                {product.importMode === "KARTON" ? "w kartonach" : "luzem"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {product.importMode === "KARTON" ? (
              <Definitions
                items={[
                  [
                    "Karton",
                    product.boxWidthCm && product.boxHeightCm && product.boxDepthCm
                      ? `${product.boxWidthCm} × ${product.boxHeightCm} × ${product.boxDepthCm} cm`
                      : "—",
                  ],
                  ["Waga kartonu", fmt(product.boxWeightKg, "kg")],
                  [
                    "Sztuk w kartonie",
                    product.unitsPerBox ? String(product.unitsPerBox) : "—",
                  ],
                  [
                    "CBM / sztuka",
                    product.cbmPerUnit
                      ? `${product.cbmPerUnit.toFixed(4)} m³`
                      : "—",
                  ],
                ]}
              />
            ) : (
              <Definitions
                items={[
                  [
                    "Sztuk w kontenerze",
                    product.unitsPerContainer
                      ? String(product.unitsPerContainer)
                      : "—",
                  ],
                  [
                    "Kontener referencyjny",
                    product.referenceContainerM3
                      ? `${product.referenceContainerM3} m³`
                      : "—",
                  ],
                  [
                    "CBM / sztuka",
                    product.cbmPerUnit
                      ? `${product.cbmPerUnit.toFixed(4)} m³`
                      : "—",
                  ],
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-l-4 border-l-blue-400">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="size-7 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center">
                <Package className="size-3.5" />
              </div>
              Pudło wysyłkowe
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Definitions
              items={[
                [
                  "Pudło",
                  product.shippingBoxWidthCm &&
                  product.shippingBoxHeightCm &&
                  product.shippingBoxDepthCm
                    ? `${product.shippingBoxWidthCm} × ${product.shippingBoxHeightCm} × ${product.shippingBoxDepthCm} cm`
                    : "—",
                ],
                [
                  "Waga z opakowaniem",
                  fmt(product.shippingBoxWeightKg, "kg"),
                ],
                [
                  "Sztuk w paczce",
                  product.unitsPerShippingBox
                    ? String(product.unitsPerShippingBox)
                    : "—",
                ],
              ]}
            />
          </CardContent>
        </Card>
      </section>

      {/* OPISY */}
      {(product.importGuidelines ||
        product.productionGuidelines ||
        product.shopDescription ||
        product.internalNotes) && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {product.importGuidelines && (
            <DescriptionCard
              title="Wytyczne importowe"
              body={product.importGuidelines}
              accent="amber"
            />
          )}
          {product.productionGuidelines && (
            <DescriptionCard
              title="Wytyczne produkcji"
              body={product.productionGuidelines}
              accent="emerald"
            />
          )}
          {product.shopDescription && (
            <DescriptionCard
              title="Opis do sklepu"
              body={product.shopDescription}
              accent="violet"
            />
          )}
          {product.internalNotes && (
            <DescriptionCard
              title="Notatki wewnętrzne"
              body={product.internalNotes}
              accent="slate"
            />
          )}
        </section>
      )}

      {/* KOMPONENTY (jeśli KOMPONENTOWY) */}
      {product.compositionMode === "KOMPONENTOWY" && (
        <section id="komponenty" className="scroll-mt-20 space-y-3">
          <SectionHeader
            icon={Puzzle}
            title="Komponenty"
            count={product.components.length}
            colorClass="bg-violet-100 text-violet-700"
          />
          <ComponentsTab
            productId={product.id}
            components={product.components}
            availableProducts={availableProducts}
          />
        </section>
      )}

      {/* ZAMÓWIENIA */}
      <section id="zamowienia" className="scroll-mt-20 space-y-3">
        <SectionHeader
          icon={ShoppingCart}
          title="Zamówienia"
          count={purchaseHistory.length}
          colorClass="bg-emerald-100 text-emerald-700"
        />
        <PurchaseHistoryTab rows={purchaseHistory} />
      </section>

      {/* PUDEŁKA + WYCENA WYSYŁKI */}
      <section id="pudelka" className="scroll-mt-20 space-y-4">
        <SectionHeader
          icon={Boxes}
          title="Pudełka wysyłkowe"
          count={product.shippingBoxes.length}
          colorClass="bg-cyan-100 text-cyan-700"
        />
        <BoxesTab
          productId={product.id}
          productBoxes={product.shippingBoxes.map((pb) => ({
            id: pb.id,
            purpose: pb.purpose as "SHIPPING" | "FACTORY",
            unitsPerBox: pb.unitsPerBox,
            isPrimary: pb.isPrimary,
            notes: pb.notes,
            imageUrl: pb.imageUrl,
            imageAlt: pb.imageAlt,
            designUrl: pb.designUrl,
            designName: pb.designName,
            box: {
              id: pb.box.id,
              name: pb.box.name,
              internalCode: pb.box.internalCode,
              packagingType: pb.box.packagingType as "BOX" | "POLY_BAG",
              widthCm: pb.box.widthCm,
              heightCm: pb.box.heightCm,
              depthCm: pb.box.depthCm,
              weightKg: pb.box.weightKg,
              cardboardLayers: pb.box.cardboardLayers,
            },
          }))}
          availableBoxes={availableBoxes.map((b) => ({
            id: b.id,
            name: b.name,
            internalCode: b.internalCode,
            packagingType: b.packagingType as "BOX" | "POLY_BAG",
            widthCm: b.widthCm,
            heightCm: b.heightCm,
            depthCm: b.depthCm,
            cardboardLayers: b.cardboardLayers,
          }))}
        />
        <div className="pt-2">
          <SectionHeader
            icon={Calculator}
            title="Wycena wysyłki"
            colorClass="bg-sky-100 text-sky-700"
          />
          <ShippingCalculator
            product={{ weightKg: product.weightKg }}
            productBoxes={product.shippingBoxes.map((pb) => ({
              box: pb.box,
              unitsPerBox: pb.unitsPerBox,
              isPrimary: pb.isPrimary,
            }))}
            rates={courierRates}
          />
        </div>
      </section>

      {/* GRAFIKI + PLIKI — 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section id="grafiki" className="scroll-mt-20 space-y-3">
          <SectionHeader
            icon={ImageIcon}
            title="Grafiki"
            count={generalImages.length}
            colorClass="bg-pink-100 text-pink-700"
          />
          <ImagesTab productId={product.id} images={generalImages} />
        </section>

        <section id="pliki" className="scroll-mt-20 space-y-3">
          <SectionHeader
            icon={FileText}
            title="Pliki"
            count={generalFiles.length}
            colorClass="bg-gray-100 text-gray-700"
          />
          <FilesTab productId={product.id} files={generalFiles} />
        </section>
      </div>

      {/* HISTORIA CEN + KURIERZY — 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section id="ceny" className="scroll-mt-20 space-y-3">
          <SectionHeader
            icon={TrendingUp}
            title="Historia cen"
            count={product.priceHistory.length}
            colorClass="bg-rose-100 text-rose-700"
          />
          <PriceHistoryTab
            productId={product.id}
            entries={product.priceHistory}
          />
        </section>

        <section id="kurierzy" className="scroll-mt-20 space-y-3">
          <SectionHeader
            icon={Truck}
            title="Rekomendowani kurierzy"
            count={product.courierRecommendations.length}
            colorClass="bg-green-100 text-green-700"
          />
          <CouriersTab
            productId={product.id}
            recommendations={product.courierRecommendations}
            allCouriers={couriers}
          />
        </section>
      </div>

      {/* ETYKIETA */}
      <section id="etykieta" className="scroll-mt-20 space-y-3">
        <SectionHeader
          icon={Tag}
          title="Etykieta"
          colorClass="bg-orange-100 text-orange-700"
        />
        <LabelTab
          name={product.name}
          productCode={product.productCode}
          eanCode={product.eanCode}
          code128={product.code128}
        />
      </section>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  colorClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number | string;
  colorClass: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "size-9 rounded-lg flex items-center justify-center shrink-0",
          colorClass,
        )}
      >
        <Icon className="size-4" />
      </div>
      <h2 className="text-lg font-heading font-semibold leading-none">
        {title}
      </h2>
      {count !== undefined && count !== null && count !== "" && (
        <span className="text-sm text-muted-foreground tabular-nums">
          ({count})
        </span>
      )}
    </div>
  );
}

function AnchorPill({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number | string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
      {count !== undefined && count !== null && count !== "" && count !== 0 && (
        <span className="tabular-nums text-[10px] rounded-full bg-muted px-1.5 py-0.5">
          {count}
        </span>
      )}
    </a>
  );
}

function fmt(n: number | null | undefined, unit: string): string {
  if (n === null || n === undefined) return "—";
  return `${n} ${unit}`;
}

function fmtPlnNum(n: number | null | undefined, fractionDigits = 2): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pl-PL", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

type EconomicsProduct = {
  id: string;
  name: string;
  isComponent: boolean;
  weightKg: number | null;
  cbmPerUnit: number | null;
  unitsPerPallet: number | null;
  defaultUnitPriceCny: number | null;
  defaultUnitPriceUsd: number | null;
  defaultSalePriceAllegroPln: number | null;
  defaultSalePriceSklepPln: number | null;
  defaultAllegroCommissionPct: number | null;
  defaultSklepCommissionPct: number | null;
  defaultAllegroOtherCostPln: number | null;
  defaultSklepOtherCostPln: number | null;
  defaultAllegroCustomerShippingPln: number | null;
  defaultSklepCustomerShippingPln: number | null;
  defaultSklepAdCostPln: number | null;
  imageUrl: string | null;
  imageAlt: string | null;
  /** Liczba unikalnych SKU w wysyłce — 1 dla całościowych, N dla KOMPONENTOWY. */
  skuCount: number;
  /** Cena zakupu kartonu (primary box) / sztuk w pudełku. */
  boxPricePerUnit: number | null;
  /** Nazwa pudełka źródłowego dla tooltipa. */
  boxName: string | null;
};

type LastOrderInfo = {
  orderId: string;
  orderNumber: string;
  createdAt: Date;
  unitPriceCny: number | null;
  unitPriceUsd: number | null;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
};

type ShippingInfo = {
  courierName: string;
  serviceType: string;
  pricePerBox: number;
  unitsPerBox: number;
  pricePerUnit: number;
  boxName: string;
};

function ProductEconomicsRow({
  product,
  lastOrder,
  shipping,
  fulfillment,
  priceMode,
  priceHistory,
  logisticsPerUnit,
}: {
  product: EconomicsProduct;
  lastOrder: LastOrderInfo | null;
  shipping: ShippingInfo | null;
  fulfillment: {
    orderOpeningCost: number;
    shippingCostPerSku: number;
    palletStorageCostPerMonth: number;
    perPiecePln: number;
    ownCarrierPln: number;
  };
  priceMode: DetailPriceMode;
  priceHistory: PriceHistoryEntry[];
  logisticsPerUnit: number | null;
}) {
  // Wszystkie wartości PLN traktujemy jako NETTO (konwencja systemowa).
  // Brutto = × (1 + VAT) na poziomie renderu.
  const factor = priceMode === "brutto" ? 1 + DEFAULT_VAT_RATE_PD : 1;
  const dpln = (n: number | null | undefined) =>
    n == null ? n : n * factor;
  // ─── KOSZTY Z CHIN ─────────────────────────────────────────────────
  const cny = lastOrder?.unitPriceCny ?? product.defaultUnitPriceCny;
  const usd = lastOrder?.unitPriceUsd ?? product.defaultUnitPriceUsd;
  const cnyRate = lastOrder?.cnyToPlnRate ?? null;
  const usdRate = lastOrder?.usdToPlnRate ?? null;
  // Cena PLN/szt — preferuj CNY (jeśli mamy kurs), fallback do USD.
  let purchasePricePln: number | null = null;
  if (cny != null && cnyRate) purchasePricePln = cny * cnyRate;
  else if (usd != null && usdRate) purchasePricePln = usd * usdRate;

  // Suma "Koszty produkcji" = tylko zakup + logistyka transportu.
  // Kurier, karton i fulfillment są osobno w sekcji Wysyłka.
  const productionSumPerUnit =
    (purchasePricePln ?? 0) + (logisticsPerUnit ?? 0);

  // ─── WYSYŁKA ───────────────────────────────────────────────────────
  const shippingPerUnit = shipping?.pricePerUnit ?? null;
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

  // Pełna suma kosztów per szt (do liczenia marży).
  const totalCostPerUnit =
    productionSumPerUnit +
    (shippingPerUnit ?? 0) +
    (product.boxPricePerUnit ?? 0) +
    (fulfillmentPerUnit ?? 0);

  // ─── ALLEGRO (z wszystkimi polami jak na liście produktów) ─────────
  const allegroPrice = product.defaultSalePriceAllegroPln;
  const allegroPct = product.defaultAllegroCommissionPct;
  const allegroOther = product.defaultAllegroOtherCostPln;
  const allegroCustShip = product.defaultAllegroCustomerShippingPln;
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
  const allegroMargin =
    allegroPrice != null && allegroProfit != null && allegroPrice > 0
      ? (allegroProfit / allegroPrice) * 100
      : null;

  // ─── SKLEP (z wszystkimi polami jak na liście produktów) ───────────
  const sklepPrice = product.defaultSalePriceSklepPln;
  const sklepPct = product.defaultSklepCommissionPct;
  const sklepOther = product.defaultSklepOtherCostPln;
  const sklepCustShip = product.defaultSklepCustomerShippingPln;
  const sklepAdCost = product.defaultSklepAdCostPln;
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

  const marginColor = (margin: number | null) =>
    margin == null
      ? ""
      : margin >= 25
        ? "text-emerald-700"
        : margin < 10
          ? "text-rose-700"
          : "";

  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/30 border-b">
              <th
                colSpan={1}
                className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Produkt
              </th>
              <th
                colSpan={3}
                className="text-center px-2 py-1.5 border-l border-r text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Koszty produkcji
              </th>
              <th
                colSpan={3}
                className="text-center px-2 py-1.5 border-r bg-indigo-50/60 text-[10px] uppercase tracking-wide text-indigo-700"
              >
                Wysyłka
              </th>
              <th
                colSpan={6}
                className="text-center px-2 py-1.5 border-r bg-amber-50/60 text-[10px] uppercase tracking-wide text-amber-700"
              >
                Allegro ({priceMode})
              </th>
              <th
                colSpan={6}
                className="text-center px-2 py-1.5 border-r bg-emerald-50/60 text-[10px] uppercase tracking-wide text-emerald-700"
              >
                Sklep ({priceMode})
              </th>
              <th className="px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground text-center">
                <div className="flex items-center justify-center gap-1">
                  <Link
                    href={`/produkty/${product.id}?mode=brutto`}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px]",
                      priceMode === "brutto"
                        ? "bg-amber-500 text-white"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    Brutto
                  </Link>
                  <Link
                    href={`/produkty/${product.id}?mode=netto`}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px]",
                      priceMode === "netto"
                        ? "bg-amber-500 text-white"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    Netto
                  </Link>
                </div>
              </th>
            </tr>
            <tr className="bg-muted/20 border-b text-[10px] text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-2 py-1 font-medium">Nazwa</th>
              <th
                className="px-2 py-1 font-medium border-l"
                title="Cena zakupu (PLN/szt)"
              >
                <CircleDollarSign className="size-3.5 text-muted-foreground inline" />
              </th>
              <th className="px-2 py-1 font-medium" title="Logistyka">
                <Layers className="size-3.5 text-muted-foreground inline" />
              </th>
              <th
                className="px-2 py-1 font-medium border-r"
                title="Suma kosztów / szt (zakup + logistyka)"
              >
                <Coins className="size-3.5 text-muted-foreground inline" />
              </th>
              <th
                className="px-2 py-1 font-medium bg-indigo-50/40 min-w-[60px]"
                title="Kurier / szt"
              >
                <Truck className="size-3.5 text-indigo-700 inline" />
              </th>
              <th
                className="px-2 py-1 font-medium bg-indigo-50/40 min-w-[60px]"
                title={`Fulfillment = otwarcie + dopłata × ${product.skuCount} SKU + magazyn palety`}
              >
                <Warehouse className="size-3.5 text-indigo-700 inline" />
              </th>
              <th
                className="px-2 py-1 font-medium bg-indigo-50/40 border-r min-w-[60px]"
                title="Karton wysyłkowy / szt"
              >
                <Package className="size-3.5 text-indigo-700 inline" />
              </th>
              <th className="text-right px-2 py-1 font-medium bg-amber-50/40">
                Cena
              </th>
              <th className="text-right px-2 py-1 font-medium bg-amber-50/40">
                Prow%
              </th>
              <th
                className="px-2 py-1 font-medium bg-amber-50/40"
                title="Wysyłka pokrywana przez klienta — REVENUE per szt."
              >
                <Truck className="size-3.5 text-amber-700 inline" />
              </th>
              <th className="text-right px-2 py-1 font-medium bg-amber-50/40">
                Inne
              </th>
              <th className="text-right px-2 py-1 font-medium bg-amber-50/40">
                Zysk
              </th>
              <th className="text-right px-2 py-1 font-medium bg-amber-50/40 border-r">
                Marża
              </th>
              <th className="text-right px-2 py-1 font-medium bg-emerald-50/40">
                Cena
              </th>
              <th className="text-right px-2 py-1 font-medium bg-emerald-50/40">
                Prow%
              </th>
              <th
                className="px-2 py-1 font-medium bg-emerald-50/40"
                title="Wysyłka pokrywana przez klienta — REVENUE per szt."
              >
                <Truck className="size-3.5 text-emerald-700 inline" />
              </th>
              <th
                className="px-2 py-1 font-medium bg-emerald-50/40"
                title="Koszt pozyskania klienta (marketing / reklama / SEO) na sztukę."
              >
                <Megaphone className="size-3.5 text-emerald-700 inline" />
              </th>
              <th className="text-right px-2 py-1 font-medium bg-emerald-50/40">
                Zysk
              </th>
              <th className="text-right px-2 py-1 font-medium bg-emerald-50/40 border-r">
                Marża
              </th>
              <th className="text-center px-2 py-1 font-medium">—</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="px-2 py-2 align-top">
                <div className="flex items-start gap-2">
                  {product.imageUrl ? (
                    <div className="relative size-10 rounded overflow-hidden bg-muted shrink-0 ring-1 ring-border">
                      <Image
                        src={product.imageUrl}
                        alt={product.imageAlt ?? product.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="size-10 rounded bg-muted shrink-0 ring-1 ring-border" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {product.name}
                    </div>
                    {product.isComponent && (
                      <Badge
                        variant="secondary"
                        className="text-[9px] bg-violet-100 text-violet-800"
                      >
                        komponent
                      </Badge>
                    )}
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {product.cbmPerUnit != null
                        ? `${product.cbmPerUnit.toFixed(4)} m³/szt`
                        : "brak CBM"}
                      {product.weightKg != null
                        ? ` · ${product.weightKg} kg`
                        : ""}
                    </div>
                  </div>
                </div>
              </td>
              {/* KOSZTY PRODUKCJI */}
              <td className="px-2 py-2 text-right tabular-nums border-l align-top">
                <PriceCellWithHistory history={priceHistory} kind="purchase">
                  {fmtPlnNum(dpln(purchasePricePln))}
                </PriceCellWithHistory>
              </td>
              <td
                className="px-2 py-2 text-right tabular-nums align-top"
                title={
                  lastOrder
                    ? `Z calc kontenera ${lastOrder.orderNumber}: koszty zamówienia rozdzielone po CBM × ilość`
                    : "Brak zamówienia po negocjacji — logistyka liczona z calc kontenera"
                }
              >
                <PriceCellWithHistory history={priceHistory} kind="logistics">
                  {fmtPlnNum(dpln(logisticsPerUnit))}
                </PriceCellWithHistory>
              </td>
              <td className="px-2 py-2 text-right tabular-nums font-medium border-r align-top">
                <PriceCellWithHistory history={priceHistory} kind="landed">
                  {fmtPlnNum(
                    dpln(productionSumPerUnit > 0 ? productionSumPerUnit : null),
                  )}
                </PriceCellWithHistory>
              </td>
              {/* WYSYŁKA */}
              <td className="px-1.5 py-2 text-right tabular-nums bg-indigo-50/40 align-top min-w-[60px]">
                {fmtPlnNum(dpln(shippingPerUnit))}
                {shipping && (
                  <div className="text-[9px] text-muted-foreground truncate">
                    {shipping.courierName}
                  </div>
                )}
              </td>
              <td className="px-1.5 py-2 text-right tabular-nums bg-indigo-50/40 align-top min-w-[60px]">
                {fmtPlnNum(dpln(fulfillmentPerUnit))}
              </td>
              <td
                className="px-1.5 py-2 text-right tabular-nums bg-indigo-50/40 border-r align-top min-w-[60px]"
                title={
                  product.boxName
                    ? `Karton ${product.boxName} (cena netto)`
                    : "Brak ceny zakupu pudełka — uzupełnij w katalogu pudełek"
                }
              >
                {fmtPlnNum(dpln(product.boxPricePerUnit))}
              </td>
              {/* ALLEGRO */}
              <td className="px-0.5 py-2 bg-amber-50/40 font-medium align-top min-w-[60px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultSalePriceAllegroPln"
                  storedValue={allegroPrice}
                  factor={factor}
                  kind="price"
                  tone="revenue"
                />
              </td>
              <td className="px-0.5 py-2 bg-amber-50/40 align-top min-w-[52px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultAllegroCommissionPct"
                  storedValue={allegroPct}
                  factor={1}
                  kind="percent"
                  tone="cost"
                />
              </td>
              <td className="px-0.5 py-2 bg-amber-50/40 align-top min-w-[52px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultAllegroCustomerShippingPln"
                  storedValue={allegroCustShip}
                  factor={factor}
                  kind="price"
                  tone="revenue"
                />
              </td>
              <td className="px-0.5 py-2 bg-amber-50/40 align-top min-w-[52px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultAllegroOtherCostPln"
                  storedValue={allegroOther}
                  factor={factor}
                  kind="price"
                  tone="cost"
                />
              </td>
              <td className="px-2 py-2 text-right tabular-nums bg-amber-50/40 align-top">
                {fmtPlnNum(dpln(allegroProfit))}
              </td>
              <td
                className={cn(
                  "px-2 py-2 text-right tabular-nums bg-amber-50/40 border-r font-medium align-top",
                  marginColor(allegroMargin),
                )}
              >
                {allegroMargin != null
                  ? `${allegroMargin.toFixed(1)}%`
                  : "—"}
              </td>
              {/* SKLEP */}
              <td className="px-0.5 py-2 bg-emerald-50/40 font-medium align-top min-w-[60px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultSalePriceSklepPln"
                  storedValue={sklepPrice}
                  factor={factor}
                  kind="price"
                  tone="revenue"
                />
              </td>
              <td className="px-0.5 py-2 bg-emerald-50/40 align-top min-w-[52px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultSklepCommissionPct"
                  storedValue={sklepPct}
                  factor={1}
                  kind="percent"
                  tone="cost"
                />
              </td>
              <td className="px-0.5 py-2 bg-emerald-50/40 align-top min-w-[52px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultSklepCustomerShippingPln"
                  storedValue={sklepCustShip}
                  factor={factor}
                  kind="price"
                  tone="revenue"
                />
              </td>
              <td className="px-0.5 py-2 bg-emerald-50/40 align-top min-w-[52px]">
                <EditableSaleCell
                  productId={product.id}
                  field="defaultSklepAdCostPln"
                  storedValue={sklepAdCost}
                  factor={factor}
                  kind="price"
                  tone="cost"
                />
              </td>
              <td className="px-2 py-2 text-right tabular-nums bg-emerald-50/40 align-top">
                {fmtPlnNum(dpln(sklepProfit))}
              </td>
              <td
                className={cn(
                  "px-2 py-2 text-right tabular-nums bg-emerald-50/40 border-r font-medium align-top",
                  marginColor(sklepMargin),
                )}
              >
                {sklepMargin != null ? `${sklepMargin.toFixed(1)}%` : "—"}
              </td>
              {/* Akcje */}
              <td className="px-2 py-2 text-center align-top">
                <Link
                  href={`/produkty/${product.id}/edytuj`}
                  className="inline-flex items-center justify-center size-7 rounded hover:bg-muted/60"
                  title="Edytuj ceny domyślne"
                >
                  <Pencil className="size-3.5" />
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {lastOrder && (
        <div className="px-3 py-1.5 border-t bg-muted/20 text-[10px] text-muted-foreground">
          Ostatnio zamawiane:{" "}
          <Link
            href={`/zamowienia/${lastOrder.orderId}`}
            className="underline hover:text-foreground"
          >
            {lastOrder.orderNumber}
          </Link>{" "}
          ({lastOrder.createdAt.toLocaleDateString("pl-PL")})
        </div>
      )}
    </Card>
  );
}

function Definitions({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const ACCENT_BORDER: Record<string, string> = {
  amber: "border-l-amber-400",
  emerald: "border-l-emerald-400",
  violet: "border-l-violet-400",
  slate: "border-l-slate-400",
};

function DescriptionCard({
  title,
  body,
  accent = "slate",
}: {
  title: string;
  body: string;
  accent?: "amber" | "emerald" | "violet" | "slate";
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4",
        ACCENT_BORDER[accent] ?? ACCENT_BORDER.slate,
      )}
    >
      <CardHeader className="py-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
          {body}
        </p>
      </CardContent>
    </Card>
  );
}
