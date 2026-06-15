"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import JsBarcode from "jsbarcode";
import {
  Barcode,
  ChartPie,
  ChevronRight,
  Coins,
  Factory,
  FileText,
  GripVertical,
  Handshake,
  Layers,
  Megaphone,
  MoreHorizontal,
  Percent,
  Ship,
  Package,
  Pencil,
  Plus,
  Puzzle,
  QrCode,
  Stamp,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  Warehouse,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  addOrderItemAction,
  updateOrderItemAction,
  deleteOrderItemAction,
  reorderOrderItemsAction,
  upsertItemChannelAction,
  updateChannelFieldAction,
} from "@/server/order-items";
import { updateOrderPdfDescriptionAction } from "@/server/orders";
import { updateCategorySalesChannelDefaultsAction } from "@/server/categories";
import { EditablePriceInput } from "@/components/editable-price-input";
import { EditablePercentInput } from "@/components/editable-percent-input";
import { CategoryDefaultInput } from "@/components/category-default-input";
import { NettoBruttoTooltip } from "@/components/netto-brutto-tooltip";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";
import {
  analyzeBolts,
  parseMaterialSku,
  type MaterialItem,
} from "@/lib/material-bolts";

import { MaterialBoltsSummary } from "./material-bolts-summary";
import {
  effectiveRateFromTranches,
  type ContainerResult,
  type GoodsTrancheInput,
} from "@/lib/kalkulacje";
import {
  canDeleteOrder,
  canEditPurchasePrice,
  type OrderStatusT,
} from "@/lib/order-status";
import {
  PriceCellWithHistory,
  type PriceHistoryEntry,
} from "../../produkty/price-history-popover";
import { ShippingQuotePopover } from "../../produkty/_components/shipping-quote-popover";
import { BundleVariantPanel } from "./bundle-variant-panel";
import { FulfillmentBreakdownPopover } from "../../produkty/_components/fulfillment-breakdown-popover";
import type { ItemMeta } from "./page";

type Channel = {
  id: string;
  channel: string;
  salePricePln: number;
  commissionPct: number | null;
  commissionFlat: number | null;
  shippingCostPln: number | null;
  fulfillmentPln: number | null;
  packagingCostPln: number | null;
  adCostPln: number | null;
  otherCostPln: number | null;
  customerShippingPln: number | null;
  shareOfQty: number | null;
};

type GuidelineKind = "production" | "import" | "manual";

const GUIDELINE_SECTIONS: {
  kind: GuidelineKind;
  label: string;
  stage: string;
}[] = [
  { kind: "production", label: "Wytyczne produkcyjne", stage: "PRODUKCJA" },
  { kind: "import", label: "Wytyczne importowe", stage: "IMPORT" },
  { kind: "manual", label: "Instrukcja obsługi", stage: "DOKUMENTACJA" },
];

function getStageNote(item: Item, stage: string): string | null {
  const n = item.product.stageCompletions.find((s) => s.stage === stage)?.notes;
  return n && n.trim() ? n : null;
}

function getProductField(item: Item, kind: GuidelineKind): string | null {
  if (kind === "production") return item.product.productionGuidelines;
  if (kind === "import") return item.product.importGuidelines;
  return item.product.userManual;
}

function getGuidelineContent(item: Item, kind: GuidelineKind): string | null {
  const section = GUIDELINE_SECTIONS.find((s) => s.kind === kind)!;
  // stage note ma pierwszeństwo — to ono jest „zaakceptowane" w workflow etapów;
  // pole z formularza produktu jest fallbackiem
  return getStageNote(item, section.stage) ?? getProductField(item, kind);
}

function hasAnyGuideline(item: Item): boolean {
  return GUIDELINE_SECTIONS.some((s) => !!getGuidelineContent(item, s.kind));
}

function guidelinesTooltipLabel(item: Item): string {
  const filled = GUIDELINE_SECTIONS.filter(
    (s) => !!getGuidelineContent(item, s.kind),
  ).length;
  return `Wytyczne i instrukcja (${filled}/${GUIDELINE_SECTIONS.length})`;
}

type Item = {
  id: string;
  productId: string;
  product: {
    id: string;
    name: string;
    productCode: string;
    eanCode: string | null;
    code128: string | null;
    category: {
      id: string;
      name: string;
      level: number;
      parentId: string | null;
      commissionPctAllegro: number | null;
      commissionPctSklep: number | null;
      kpkPlnAllegro: number | null;
      kpkPlnSklep: number | null;
      customerShippingPlnAllegro: number | null;
      customerShippingPlnSklep: number | null;
      parent: {
        id: string;
        name: string;
        level: number;
        commissionPctAllegro: number | null;
        commissionPctSklep: number | null;
        kpkPlnAllegro: number | null;
        kpkPlnSklep: number | null;
        customerShippingPlnAllegro: number | null;
        customerShippingPlnSklep: number | null;
        parent: {
          id: string;
          name: string;
          level: number;
          commissionPctAllegro: number | null;
          commissionPctSklep: number | null;
          kpkPlnAllegro: number | null;
          kpkPlnSklep: number | null;
          customerShippingPlnAllegro: number | null;
          customerShippingPlnSklep: number | null;
        } | null;
      } | null;
    } | null;
    productionGuidelines: string | null;
    importGuidelines: string | null;
    userManual: string | null;
    stageCompletions: { stage: string; notes: string | null }[];
    cbmPerUnit: number | null;
    unitsPerBox: number | null;
    unitsPerPallet: number | null;
    importMode: "KARTON" | "LUZEM";
    compositionMode: "CALOSCIOWY" | "KOMPONENTOWY" | "ZESTAW";
    components: {
      id: string;
      componentId: string;
      quantity: number;
      allowVariants: boolean;
      poolCategories: { id: string; name: string }[];
      poolProducts: { id: string }[];
      component: {
        id: string;
        name: string;
        productCode: string;
        categoryId: string | null;
        category: { id: string; name: string } | null;
        cbmPerUnit: number | null;
        images: { url: string }[];
      };
    }[];
    boxWidthCm: number | null;
    boxHeightCm: number | null;
    boxDepthCm: number | null;
    boxWeightKg: number | null;
    masterBoxWidthCm: number | null;
    masterBoxHeightCm: number | null;
    masterBoxDepthCm: number | null;
    masterBoxWeightKg: number | null;
    innerBoxesPerMaster: number | null;
    unitsPerContainer: number | null;
    referenceContainerM3: number | null;
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
      };
    }[];
    images: {
      url: string;
      alt: string | null;
      thumbnailWebpUrl: string | null;
      thumbnailBlurDataUrl: string | null;
    }[];
  };
  quantity: number;
  unitPriceUsd: number | null;
  unitPriceCny: number | null;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  cbmPerUnit: number | null;
  expectedMonthlySales: number | null;
  notes: string | null;
  saleChannels: Channel[];
  variantSplits: {
    id: string;
    productComponentId: string;
    variantProductId: string;
    units: number;
    variantProduct: {
      id: string;
      name: string;
      productCode: string;
      categoryId: string | null;
      cbmPerUnit: number | null;
      images: { url: string }[];
    };
  }[];
};

type ProductOption = {
  id: string;
  name: string;
  productCode: string;
  code128: string | null;
  categoryId: string | null;
  isComponent: boolean;
  cbmPerUnit: number | null;
  unitsPerBox: number | null;
  images: {
    url: string;
    alt: string | null;
    thumbnailWebpUrl: string | null;
  }[];
};

type CategoryItem = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  productCount: number;
};

type Fulfillment = {
  shippingCostPerSku: number;
  palletStorageCostPerMonth: number;
};

type PriceMode = "brutto" | "netto";

export function ItemsTab({
  orderId,
  items,
  itemMeta,
  calc,
  products,
  categories,
  fulfillment,
  vatRate,
  cnyToPlnRate,
  usdToPlnRate,
  goodsTranches,
  orderStatus,
  priceHistoryByProduct,
  country = "CHINA",
  pdfDescription = null,
}: {
  orderId: string;
  items: Item[];
  itemMeta: Record<string, ItemMeta>;
  calc: ContainerResult;
  products: ProductOption[];
  categories: CategoryItem[];
  fulfillment: Fulfillment;
  vatRate: number;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  goodsTranches: GoodsTrancheInput[];
  orderStatus: OrderStatusT;
  priceHistoryByProduct: Record<string, PriceHistoryEntry[]>;
  /** Kraj zamówienia — dla PL pokazujemy analizę belek. */
  country?: "CHINA" | "POLAND";
  /** Opis zamówienia pokazywany na stronie 1 PDF (PL only). */
  pdfDescription?: string | null;
}) {
  // Kursy efektywne z opłaconych transz — gdy istnieją, nadpisują wstępne kursy.
  const effectiveTrancheUsd = effectiveRateFromTranches(goodsTranches, "USD");
  const effectiveTrancheCny = effectiveRateFromTranches(goodsTranches, "CNY");
  const canEditQty = canDeleteOrder(orderStatus);
  const isPoland = country === "POLAND";
  // Ceny zakupu (USD/CNY/kursy) edytowalne aż do statusu „W magazynie".
  // Wejście do magazynu zamraża snapshot i blokuje pole — cofnięcie statusu
  // znów udostępnia edycję, kolejne wejście odświeży snapshot.
  const canEditPurchase = canEditPurchasePrice(orderStatus);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  // Default BRUTTO — zgodnie z preferencją usera. Edycja w popoverze pozwala
  // wpisywać netto lub brutto, system przelicza i zapisuje netto do bazy.
  const [priceMode, setPriceMode] = useState<PriceMode>("brutto");
  const [channelView, setChannelView] = useState<"all" | "Allegro" | "Sklep">(
    "Sklep",
  );

  // Modals
  const [guidelinesModal, setGuidelinesModal] = useState<Item | null>(null);
  const [barcodeModal, setBarcodeModal] = useState<{
    item: Item;
    format: "EAN13" | "CODE128";
  } | null>(null);

  const containerCount = calc.containerCount;

  // ─── Drag-and-drop pozycji ──────────────────────────────────────────
  // orderedItems = lokalny porządek (optimistic). Reorder klika klick+drag
  // na uchwycie grip. Po drop wywołujemy server action i optimistic-update.
  const [orderedItems, setOrderedItems] = useState<Item[]>(items);
  useEffect(() => {
    setOrderedItems(items);
  }, [items]);
  // calc.items jest zaindeksowane wg PIERWOTNEJ kolejności props.items.
  // Po reorderze trzeba sięgać po calc po itemId, nie po idx.
  const calcById = new Map<string, ContainerResult["items"][number]>();
  items.forEach((it, i) => {
    const c = calc.items[i];
    if (c) calcById.set(it.id, c);
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [, startReorderTransition] = useTransition();

  function handleRowDragStart(id: string) {
    setDraggedId(id);
  }
  // Real-time reorder: jak ciągniemy nad innym wierszem, od razu zamieniamy
  // pozycje w lokalnym `orderedItems`. Dzięki temu user widzi efekt na
  // żywo (jak sortable list).
  function handleRowDragOver(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOrderedItems((prev) => {
      const fromIdx = prev.findIndex((it) => it.id === draggedId);
      const toIdx = prev.findIndex((it) => it.id === targetId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }
  function handleRowDragLeave(_id: string) {
    // no-op
  }
  function handleRowDrop(_targetId: string) {
    // no-op — commit następuje w onDragEnd, żeby uniknąć double-commit
  }
  function handleRowDragEnd() {
    if (!draggedId) {
      setDropTargetId(null);
      return;
    }
    const ids = orderedItems.map((it) => it.id);
    setDraggedId(null);
    setDropTargetId(null);
    startReorderTransition(async () => {
      try {
        await reorderOrderItemsAction(orderId, ids);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
        setOrderedItems(items); // rollback
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Opis PDF + przycisk wygenerowania PDF przeniesiony do osobnej
          zakładki „Wytyczne i składanie zamówienia". */}
      <div className="flex items-center justify-end gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {!isPoland && (
            <div className="inline-flex rounded-lg ring-1 ring-border bg-card p-0.5 gap-0.5">
              <span className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground self-center">
                Kanał:
              </span>
              {(
                [
                  { id: "Sklep", label: "Sklep" },
                  { id: "Allegro", label: "Allegro" },
                  { id: "all", label: "Wszystkie" },
                ] as { id: "all" | "Allegro" | "Sklep"; label: string }[]
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannelView(c.id)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    channelView === c.id
                      ? c.id === "Allegro"
                        ? "bg-amber-500 text-white"
                        : c.id === "Sklep"
                          ? "bg-emerald-600 text-white"
                          : "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {/* PriceModeToggle usunięty — brutto domyślnie. Edycja przez
           *  popover (klik na komórce) pozwala wpisać netto LUB brutto. */}
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak pozycji. Dodaj pierwszą — wybierając produkt z katalogu.
        </Card>
      ) : (
        <Card className="p-0">
          <TooltipProvider>
          <div>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th
                    colSpan={4}
                    className="text-left px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    Produkt
                  </th>
                  {/* Koszty produktu: Cena/szt + (Prow/Krojenie) + (Cło/Szwalnia) + Logist + Suma/szt + Total */}
                  <th
                    colSpan={6}
                    className="text-center px-2 py-1.5 border-l border-r text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    {isPoland ? "Koszty produktu" : "Koszty z chin"}
                  </th>
                  {/* Wysyłka: Wysyłka_kurier + Fulfillment + Karton = 3 kolumny */}
                  {!isPoland && (
                    <th
                      colSpan={3}
                      className="text-center px-2 py-1.5 border-r bg-indigo-50/60 text-[10px] uppercase tracking-wide text-indigo-700"
                    >
                      Wysyłka
                    </th>
                  )}
                  {!isPoland && channelView !== "Sklep" && (
                    <th
                      colSpan={6}
                      className="text-center px-2 py-1.5 border-r bg-amber-50/60 text-[10px] uppercase tracking-wide text-amber-700"
                    >
                      Allegro
                    </th>
                  )}
                  {!isPoland && channelView !== "Allegro" && (
                    <th
                      colSpan={6}
                      className="text-center px-2 py-1.5 border-r bg-emerald-50/60 text-[10px] uppercase tracking-wide text-emerald-700"
                    >
                      Sklep
                    </th>
                  )}
                  <th
                    colSpan={2}
                    className="text-center px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                  >
                    Pliki / Akcje
                  </th>
                </tr>
                <tr className="bg-muted/20 border-b text-[10px] text-muted-foreground uppercase tracking-wide">
                  <th className="text-center px-1 py-1 font-medium w-8">Lp.</th>
                  <th
                    className={cn(
                      "text-left px-1.5 py-1 font-medium",
                      isPoland && "min-w-[320px]",
                    )}
                  >
                    Nazwa
                  </th>
                  <th className="text-right px-1.5 py-1 font-medium">Ilość</th>
                  <th className="text-right px-1.5 py-1 font-medium w-[64px]">CBM</th>
                  {/* Nagłówek 5-ikonkowy: 1 <th colSpan={5}> z flex
                      justify-between. Body ma 9 dzieci (cena + "+" + prow +
                      "+" + cło + "+" + log + "=" + suma), więc tutaj też
                      dajemy 9 — między ikony wstawiamy placeholdery
                      niewidoczne ("+"/"=") żeby justify-between rozkładało
                      je identycznie i ikona stała DOKŁADNIE nad wartością. */}
                  <th
                    colSpan={5}
                    className="px-2 py-1 font-medium border-l"
                  >
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
                  <th className="text-right px-1.5 py-1 font-medium border-r">
                    <Tooltip>
                      <TooltipTrigger className="inline-flex">
                        <Wallet className="size-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>RAZEM</TooltipContent>
                    </Tooltip>
                  </th>
                  {!isPoland && (
                    <>
                      <th className="text-center px-1.5 py-1 font-medium bg-indigo-50/40 min-w-[44px] align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Truck className="size-3.5 text-indigo-700" />
                          </TooltipTrigger>
                          <TooltipContent>WYSYŁKA</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-indigo-50/40 min-w-[44px] align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Warehouse className="size-3.5 text-indigo-700" />
                          </TooltipTrigger>
                          <TooltipContent>FULFILLMENT</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-indigo-50/40 border-r min-w-[44px] align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Package className="size-3.5 text-indigo-700" />
                          </TooltipTrigger>
                          <TooltipContent>KARTON</TooltipContent>
                        </Tooltip>
                      </th>
                    </>
                  )}
                  {!isPoland && channelView !== "Sklep" && (
                    <>
                      <th className="text-center px-1.5 py-1 font-medium bg-amber-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Tag className="size-3.5 text-amber-700" />
                          </TooltipTrigger>
                          <TooltipContent>CENA SPRZEDAŻY</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-amber-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Percent className="size-3.5 text-amber-700" />
                          </TooltipTrigger>
                          <TooltipContent>PROWIZJA</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-amber-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Truck className="size-3.5 text-amber-700" />
                          </TooltipTrigger>
                          <TooltipContent>WYSYŁKA OD KLIENTA</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-amber-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <MoreHorizontal className="size-3.5 text-amber-700" />
                          </TooltipTrigger>
                          <TooltipContent>INNE KOSZTY</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-amber-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <TrendingUp className="size-3.5 text-amber-700" />
                          </TooltipTrigger>
                          <TooltipContent>ZYSK</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-amber-50/40 border-r align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <ChartPie className="size-3.5 text-amber-700" />
                          </TooltipTrigger>
                          <TooltipContent>MARŻA</TooltipContent>
                        </Tooltip>
                      </th>
                    </>
                  )}
                  {!isPoland && channelView !== "Allegro" && (
                    <>
                      <th className="text-center px-1.5 py-1 font-medium bg-emerald-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Tag className="size-3.5 text-emerald-700" />
                          </TooltipTrigger>
                          <TooltipContent>CENA SPRZEDAŻY</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-emerald-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Percent className="size-3.5 text-emerald-700" />
                          </TooltipTrigger>
                          <TooltipContent>PROWIZJA</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-emerald-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Truck className="size-3.5 text-emerald-700" />
                          </TooltipTrigger>
                          <TooltipContent>WYSYŁKA OD KLIENTA</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-emerald-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <Megaphone className="size-3.5 text-emerald-700" />
                          </TooltipTrigger>
                          <TooltipContent>REKLAMA</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-emerald-50/40 align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <TrendingUp className="size-3.5 text-emerald-700" />
                          </TooltipTrigger>
                          <TooltipContent>ZYSK</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-1.5 py-1 font-medium bg-emerald-50/40 border-r align-middle">
                        <Tooltip>
                          <TooltipTrigger className="inline-flex w-full items-center justify-center">
                            <ChartPie className="size-3.5 text-emerald-700" />
                          </TooltipTrigger>
                          <TooltipContent>MARŻA</TooltipContent>
                        </Tooltip>
                      </th>
                    </>
                  )}
                  <th className="text-center px-1.5 py-1 font-medium">Pliki</th>
                  <th className="text-right px-1.5 py-1 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Sortuj wg (L1, L2, sortOrder) — żeby kategorie były obok siebie.
                  const sortedItems = [...orderedItems].sort((a, b) => {
                    const ga = getCategoryGroupLabels(a.product.category);
                    const gb = getCategoryGroupLabels(b.product.category);
                    const l1 = (ga.l1Name ?? "ZZZ").localeCompare(
                      gb.l1Name ?? "ZZZ",
                    );
                    if (l1 !== 0) return l1;
                    const l2 = (ga.l2Name ?? "ZZZ").localeCompare(
                      gb.l2Name ?? "ZZZ",
                    );
                    if (l2 !== 0) return l2;
                    return 0; // zachowaj oryginalną kolejność w obrębie podkategorii
                  });
                  let prevL1: string | null = "__INIT__";
                  let prevL2: string | null = "__INIT__";
                  const rows: React.ReactNode[] = [];
                  let position = 0;
                  for (const item of sortedItems) {
                    const itemCalc = calcById.get(item.id);
                    if (!itemCalc) continue;
                    position += 1;
                    const { l1Name, l2Name } = getCategoryGroupLabels(
                      item.product.category,
                    );
                    const l1Key = l1Name ?? "__NONE__";
                    const l2Key = l2Name ?? "__NONE__";
                    if (l1Key !== prevL1) {
                      rows.push(
                        <CategoryHeaderRow
                          key={`l1-${item.id}`}
                          level={1}
                          label={l1Name ?? "Bez kategorii"}
                        />,
                      );
                      prevL1 = l1Key;
                      prevL2 = "__INIT__";
                    }
                    if (l2Key !== prevL2 && l2Name) {
                      rows.push(
                        <CategoryHeaderRow
                          key={`l2-${item.id}`}
                          level={2}
                          label={l2Name}
                        />,
                      );
                      prevL2 = l2Key;
                    }
                    rows.push(
                      <ItemRow
                        key={item.id}
                        position={position}
                        item={item}
                        meta={itemMeta[item.id] ?? null}
                        itemCalc={itemCalc}
                        priceMode={priceMode}
                        channelView={channelView}
                        vatRate={vatRate}
                        cnyToPlnRate={cnyToPlnRate}
                        usdToPlnRate={usdToPlnRate}
                        effectiveTrancheUsd={effectiveTrancheUsd}
                        effectiveTrancheCny={effectiveTrancheCny}
                        canEditQty={canEditQty}
                        canEditPurchase={canEditPurchase}
                        priceHistory={
                          priceHistoryByProduct[item.productId] ?? []
                        }
                        products={products}
                        categories={categories}
                        isDragging={draggedId === item.id}
                        isDropTarget={dropTargetId === item.id}
                        onDragStart={() => handleRowDragStart(item.id)}
                        onDragOver={() => handleRowDragOver(item.id)}
                        onDragLeave={() => handleRowDragLeave(item.id)}
                        onDrop={() => handleRowDrop(item.id)}
                        onDragEnd={handleRowDragEnd}
                        onEdit={() => setEditItem(item)}
                        onOpenGuidelines={() => setGuidelinesModal(item)}
                        isPoland={country === "POLAND"}
                        onOpenBarcode={(format) =>
                          setBarcodeModal({ item, format })
                        }
                      />,
                    );
                  }
                  return rows;
                })()}
              </tbody>
              <TableFooterTotals
                items={orderedItems}
                calc={calc}
                priceMode={priceMode}
                vatRate={vatRate}
                channelView={channelView}
                isPoland={isPoland}
              />
            </table>
          </div>
          </TooltipProvider>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Dodaj pozycję
        </Button>
      </div>

      {/* CN: licznik kategorii + wizualizacja kontenera (dwie kolumny).
          PL: analiza belek materiału — wizualizacja cięcia, minimum 6 belek
          per kolor, sugestia dosypki. */}
      {items.length > 0 && country === "POLAND" && (
        <MaterialBoltsSummary
          analysis={analyzeBolts(buildMaterialItems(orderedItems))}
          orderId={orderId}
        />
      )}
      {items.length > 0 && country !== "POLAND" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CategoryBreakdown items={orderedItems} />
          <ContainerVisual calc={calc} containerCount={containerCount} />
        </div>
      )}

      <AddItemDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        orderId={orderId}
        products={products}
        categories={categories}
        alreadyInOrderProductIds={
          new Set(items.map((it) => it.productId))
        }
      />
      <EditItemDialog item={editItem} onClose={() => setEditItem(null)} />
      <GuidelinesModal
        item={guidelinesModal}
        onClose={() => setGuidelinesModal(null)}
      />
      <BarcodeModal
        state={barcodeModal}
        onClose={() => setBarcodeModal(null)}
      />

      {/* used to silence unused-import warning */}
      <span hidden>{fulfillment.shippingCostPerSku.toFixed(2)}</span>
    </div>
  );
}

// ─── Toggle netto/brutto ─────────────────────────────────────────────

function PriceModeToggle({
  mode,
  onChange,
}: {
  mode: PriceMode;
  onChange: (m: PriceMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md ring-1 ring-border bg-card p-0.5 text-xs">
      <button
        type="button"
        className={cn(
          "px-3 py-1 rounded transition-colors",
          mode === "brutto"
            ? "bg-primary text-primary-foreground font-medium"
            : "text-muted-foreground hover:bg-muted",
        )}
        onClick={() => onChange("brutto")}
      >
        Brutto
      </button>
      <button
        type="button"
        className={cn(
          "px-3 py-1 rounded transition-colors",
          mode === "netto"
            ? "bg-primary text-primary-foreground font-medium"
            : "text-muted-foreground hover:bg-muted",
        )}
        onClick={() => onChange("netto")}
      >
        Netto
      </button>
    </div>
  );
}

// ─── Wiersz pozycji ──────────────────────────────────────────────────

function ItemRow({
  position,
  item,
  meta,
  itemCalc,
  priceMode,
  channelView,
  vatRate,
  cnyToPlnRate,
  usdToPlnRate,
  effectiveTrancheUsd,
  effectiveTrancheCny,
  canEditQty,
  canEditPurchase,
  priceHistory,
  products,
  categories,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onEdit,
  onOpenGuidelines,
  onOpenBarcode,
  isPoland = false,
}: {
  position: number;
  item: Item;
  meta: ItemMeta | null;
  itemCalc: ContainerResult["items"][number];
  priceMode: PriceMode;
  channelView: "all" | "Allegro" | "Sklep";
  vatRate: number;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  effectiveTrancheUsd: number | null;
  effectiveTrancheCny: number | null;
  canEditQty: boolean;
  canEditPurchase: boolean;
  priceHistory: PriceHistoryEntry[];
  products: ProductOption[];
  categories: CategoryItem[];
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onOpenGuidelines: () => void;
  onOpenBarcode: (format: "EAN13" | "CODE128") => void;
  /** Kraj zamówienia — PL ukrywa kolumny Wysyłka/Allegro/Sklep. */
  isPoland?: boolean;
}) {
  const isBundle = item.product.compositionMode === "KOMPONENTOWY";
  const hasSlots = isBundle && item.product.components.length > 0;
  const [bundleExpanded, setBundleExpanded] = useState(false);
  // Drag tylko z uchwytu (grip) — natywny HTML5 drag wymaga draggable na
  // <tr>, więc włączamy go onMouseDown na gripie, wyłączamy po onDragEnd.
  const [dragHandleEnabled, setDragHandleEnabled] = useState(false);
  const allegro = item.saleChannels.find((c) => c.channel === "Allegro");
  const sklep = item.saleChannels.find((c) => c.channel === "Sklep");
  const allegroCalc = itemCalc.channels.find((c) => c.channel === "Allegro");
  const sklepCalc = itemCalc.channels.find((c) => c.channel === "Sklep");

  // Koszty z chin — wartości w PLN (uwzględniają toggle netto/brutto)
  const cenaProduktuPln = toMode(
    itemCalc.unitPriceNettoPln,
    priceMode,
    vatRate,
  );
  const dodatkowePln = toMode(
    itemCalc.allocatedLogisticsPln / Math.max(1, item.quantity),
    priceMode,
    vatRate,
  );
  // Prowizja per szt (proporcjonalna do wartości pozycji).
  // PROWIZJA MA VAT — wyświetlamy wg priceMode (brutto/netto).
  const prowizjaPln = toMode(
    itemCalc.allocatedBrokerCommissionPln / Math.max(1, item.quantity),
    priceMode,
    vatRate,
  );
  // Wartość raw netto prowizji per szt — używane w tooltipach (informacyjnie).
  const prowizjaNettoPln =
    itemCalc.allocatedBrokerCommissionPln / Math.max(1, item.quantity);
  // Cło per szt — opłata celna NIE podlega VAT, wyświetlamy raw netto.
  const cloPln = itemCalc.customsDutyPln / Math.max(1, item.quantity);
  const landed = toMode(itemCalc.landedCostPerUnitPln, priceMode, vatRate);
  const total = toMode(itemCalc.landedTotalPln, priceMode, vatRate);

  return (
    <>
    <tr
      draggable={dragHandleEnabled}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!isDragging) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOver();
        }
      }}
      onDragLeave={() => onDragLeave()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
        setDragHandleEnabled(false);
      }}
      onDragEnd={() => {
        onDragEnd();
        setDragHandleEnabled(false);
      }}
      className={cn(
        "border-b hover:bg-muted/20 transition-colors",
        isDragging && "opacity-40",
        isDropTarget && "ring-2 ring-inset ring-primary/50 bg-primary/5",
        hasSlots && bundleExpanded && "bg-violet-50/40",
      )}
    >
      <td className="text-center px-1 py-1.5 tabular-nums text-[11px] text-muted-foreground font-medium w-8">
        {position}.
      </td>
      <td className="px-1 py-1.5">
        <div className="flex items-center gap-1">
          <span
            onMouseDown={() => setDragHandleEnabled(true)}
            onMouseUp={() => {
              // Jeśli user kliknął ale nie rozpoczął przeciągania, wyłącz drag
              // (inaczej drag pozostawałby aktywny do następnego kliknięcia).
              setTimeout(() => setDragHandleEnabled(false), 0);
            }}
            className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground p-0.5 -ml-0.5"
            title="Przeciągnij, aby zmienić kolejność"
            aria-label="Uchwyt przeciągania"
          >
            <GripVertical className="size-3.5" />
          </span>
          <Link
            href={`/produkty/${item.product.id}`}
            className="flex items-center gap-2 hover:bg-muted/40 -mx-1 px-1 py-0.5 rounded transition-colors group flex-1 min-w-0"
          >
            {item.product.images[0]?.thumbnailWebpUrl ? (
              // WebP miniaturka 144×144 (~5 KB) — zwykły <img> wystarczy.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.product.images[0].thumbnailWebpUrl}
                alt={item.product.images[0].alt ?? item.product.name}
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
                className="size-7 rounded object-cover bg-muted shrink-0"
              />
            ) : (
              <div className="size-7 rounded bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <Tooltip>
                <TooltipTrigger
                  className={cn(
                    "font-medium text-xs leading-tight truncate group-hover:underline block text-left cursor-help",
                    isPoland ? "max-w-[320px]" : "max-w-[110px]",
                  )}
                >
                  {item.product.name}
                </TooltipTrigger>
                <TooltipContent className="max-w-[360px]">
                  <div className="space-y-1">
                    <div className="font-semibold text-[12px]">
                      {item.product.name}
                    </div>
                    <div className="text-[10px] opacity-80">
                      <span className="opacity-60">SKU:</span>{" "}
                      <code className="font-mono">
                        {item.product.productCode}
                      </code>
                    </div>
                    {item.product.eanCode && (
                      <div className="text-[10px] opacity-80">
                        <span className="opacity-60">EAN:</span>{" "}
                        <code className="font-mono">
                          {item.product.eanCode}
                        </code>
                      </div>
                    )}
                    {item.product.code128 && (
                      <div className="text-[10px] opacity-80">
                        <span className="opacity-60">Code128:</span>{" "}
                        <code className="font-mono">
                          {item.product.code128}
                        </code>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              <code
                className={cn(
                  "text-[10px] text-muted-foreground block",
                  isPoland
                    ? "whitespace-nowrap"
                    : "truncate max-w-[110px]",
                )}
              >
                {item.product.productCode}
              </code>
            </div>
          </Link>
          {hasSlots && (
            <button
              type="button"
              onClick={() => setBundleExpanded((v) => !v)}
              className={cn(
                "shrink-0 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-semibold ring-1 transition-colors",
                bundleExpanded
                  ? "bg-violet-100 text-violet-800 ring-violet-300"
                  : "bg-violet-50 text-violet-700 ring-violet-200 hover:bg-violet-100",
              )}
              title="Konfiguruj warianty wewnątrz bundla"
            >
              <Puzzle className="size-2.5" />
              <span>W zestawie ({item.product.components.length})</span>
              <ChevronRight
                className={cn(
                  "size-2.5 transition-transform",
                  bundleExpanded && "rotate-90",
                )}
              />
            </button>
          )}
        </div>
      </td>

      <QuantityCell
        itemId={item.id}
        quantity={item.quantity}
        editable={canEditQty}
      />

      <CbmCell item={item} itemCalc={itemCalc} />

      {/* ─── Koszty z Chin: ONE wide cell with formuła cena + prow + cło + log = suma/szt
            Liczby wyrównane do swoich nagłówków przez justify-between na pełnej
            szerokości komórki. Każda liczba zachowuje swój tooltip/popover. */}
      <td
        colSpan={5}
        className="px-2 py-1.5 tabular-nums whitespace-nowrap border-l"
      >
        {/* Grid 9-kolumnowy: 5 wartości (1fr każda, centered) + 4 separatory
            (auto). Nagłówek z 5 ikon ma identyczną templatę — dzięki temu
            ikony lądują dokładnie nad swoimi wartościami. */}
        <span className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-baseline gap-1 w-full [&>*]:text-center">
          {/* Cena/szt zakup */}
          <PurchasePriceCell
            itemId={item.id}
            unitPriceCny={item.unitPriceCny}
            unitPriceUsd={item.unitPriceUsd}
            itemCnyRate={item.cnyToPlnRate}
            itemUsdRate={item.usdToPlnRate}
            cnyToPlnRate={cnyToPlnRate}
            usdToPlnRate={usdToPlnRate}
            effectiveTrancheUsd={effectiveTrancheUsd}
            effectiveTrancheCny={effectiveTrancheCny}
            vatRate={vatRate}
            priceMode={priceMode}
            displayedPln={cenaProduktuPln}
            nettoPerUnitPln={itemCalc.unitPriceNettoPln}
            itemQty={item.quantity}
            editable={canEditPurchase}
            priceHistory={priceHistory}
            inline
          />
          <span className="text-muted-foreground/60 select-none">+</span>
          {/* Prowizja pośrednika per szt (CN: % × wartość, PL: 0 — krojenie idzie do logistyki) */}
          {prowizjaPln > 0 ? (
            (() => {
              const totalNet = itemCalc.allocatedBrokerCommissionPln;
              const goodsValue = itemCalc.goodsValuePln;
              const effectivePct =
                goodsValue > 0 ? (totalNet / goodsValue) * 100 : 0;
              const unitNetto =
                item.quantity > 0 ? goodsValue / item.quantity : 0;
              return (
                <NettoBruttoTooltip
                  nettoValue={totalNet}
                  vatRate={vatRate}
                  label="Prowizja pośrednika (pozycja)"
                  description={`Stawka: ${effectivePct.toFixed(2)}% × wartość pozycji.\nWartość pozycji netto: ${unitNetto.toFixed(2)} zł/szt × ${item.quantity} szt = ${goodsValue.toFixed(2)} zł.\n${effectivePct.toFixed(2)}% × ${goodsValue.toFixed(2)} zł = ${totalNet.toFixed(2)} zł netto.\nPer szt netto: ${prowizjaNettoPln.toFixed(2)} zł.`}
                >
                  <span className="text-amber-700">
                    {fmtMoneyShort(prowizjaPln)}
                  </span>
                </NettoBruttoTooltip>
              );
            })()
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
          <span className="text-muted-foreground/60 select-none">+</span>
          {/* Per-szt: CN — cło, PL — szwalnia (per qty) */}
          {cloPln > 0 ? (
            (() => {
              const totalClo = itemCalc.customsDutyPln;
              const goodsValue = itemCalc.goodsValuePln;
              const effectivePct =
                goodsValue > 0 ? (totalClo / goodsValue) * 100 : 0;
              const unitNetto =
                item.quantity > 0 ? goodsValue / item.quantity : 0;
              return (
                <NettoBruttoTooltip
                  nettoValue={totalClo}
                  vatRate={vatRate}
                  vatExempt
                  label="Cło importowe (pozycja)"
                  description={`Stawka cła: ${effectivePct.toFixed(2)}% (z kategorii/produktu).\nWartość pozycji netto: ${unitNetto.toFixed(2)} zł/szt × ${item.quantity} szt = ${goodsValue.toFixed(2)} zł.\n${effectivePct.toFixed(2)}% × ${goodsValue.toFixed(2)} zł = ${totalClo.toFixed(2)} zł.\nPer szt: ${cloPln.toFixed(2)} zł.`}
                >
                  <span className="text-rose-700">{fmtMoneyShort(cloPln)}</span>
                </NettoBruttoTooltip>
              );
            })()
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
          <span className="text-muted-foreground/60 select-none">+</span>
          {/* Logistyka per szt */}
          {dodatkowePln > 0 ? (
            <PriceCellWithHistory
              history={priceHistory}
              kind="logistics"
              currentNetto={
                itemCalc.allocatedLogisticsPln / Math.max(1, item.quantity)
              }
              vatRate={vatRate}
              currentQty={item.quantity}
              currentSource={
                isPoland
                  ? "Z Płatności tego zamówienia (dzielone per szt)"
                  : "Z calc kontenera tego zamówienia (shared CBM)"
              }
            >
              <span className="text-indigo-700">
                {fmtMoneyShort(dodatkowePln)}
              </span>
            </PriceCellWithHistory>
          ) : (
            <span className="text-muted-foreground">0</span>
          )}
          <span className="text-muted-foreground/60 select-none mx-0.5">=</span>
          {/* Suma per szt (landed) — wyróżniona „naklejka" w żółto-amber gradient.
              no-underline nadpisuje dotted underline z PriceCellWithHistory żeby
              chip wyglądał jak naklejka a nie podkreślony link. */}
          <PriceCellWithHistory
            history={priceHistory}
            kind="landed"
            currentNetto={itemCalc.landedCostPerUnitPln}
            vatRate={vatRate}
            currentQty={item.quantity}
            currentSource="Zakup + prowizja + cło + logistyka per szt"
          >
            <span
              className={cn(
                "font-extrabold text-black px-1.5 py-0.5 rounded-sm no-underline decoration-transparent",
                "bg-yellow-300",
                "shadow-[2px_2px_0_rgba(0,0,0,0.18)]",
                "border border-yellow-500",
              )}
            >
              {fmtMoneyShort(landed)}
              <ZlSuffix />
            </span>
          </PriceCellWithHistory>
        </span>
      </td>
      <td className="text-right px-1.5 py-1.5 tabular-nums whitespace-nowrap font-semibold border-r">
        <PriceCellWithHistory
          history={priceHistory}
          kind="landed"
          currentNetto={itemCalc.landedCostPerUnitPln}
          vatRate={vatRate}
          currentQty={item.quantity}
          currentSource={`Razem: ${item.quantity} szt × landed`}
        >
          {fmtPlnShort(total)}
          <ZlSuffix />
        </PriceCellWithHistory>
      </td>

      {/* Wysyłka + Fulfillment + Karton — wspólne dla Allegro i Sklep.
          Dla PL ukrywane (materiał nie idzie bezpośrednio do klienta). */}
      {!isPoland && (
      <SharedShippingCell
        itemId={item.id}
        currentShipping={
          allegro?.shippingCostPln ??
          sklep?.shippingCostPln ??
          null
        }
        priceMode={priceMode}
        vatRate={vatRate}
        meta={meta?.shipping ?? null}
      />
      )}
      {!isPoland && (
        <SharedFulfillmentCell
          itemId={item.id}
          currentFulfillment={
            allegro?.fulfillmentPln ??
            sklep?.fulfillmentPln ??
            null
          }
          priceMode={priceMode}
          vatRate={vatRate}
          meta={meta?.fulfillment ?? null}
        />
      )}
      {!isPoland && (
        <SharedPackagingCell
          itemId={item.id}
          currentPackaging={
            allegro?.packagingCostPln ??
            sklep?.packagingCostPln ??
            null
          }
          priceMode={priceMode}
          vatRate={vatRate}
          meta={meta?.packaging ?? null}
        />
      )}

      {!isPoland && channelView !== "Sklep" && (
        <ChannelCells
          itemId={item.id}
          name="Allegro"
          channel={allegro}
          calc={allegroCalc}
          landedCostPerUnitPln={itemCalc.landedCostPerUnitPln}
          bg="bg-amber-50/20"
          bgFocus="focus:bg-amber-50"
          priceMode={priceMode}
          vatRate={vatRate}
          showOther
          productCategory={item.product.category}
        />
      )}

      {!isPoland && channelView !== "Allegro" && (
        <ChannelCells
          itemId={item.id}
          name="Sklep"
          channel={sklep}
          calc={sklepCalc}
          landedCostPerUnitPln={itemCalc.landedCostPerUnitPln}
          bg="bg-emerald-50/20"
          bgFocus="focus:bg-emerald-50"
          priceMode={priceMode}
          vatRate={vatRate}
          showAdCost
          productCategory={item.product.category}
        />
      )}

      {/* Pliki: 3 ikony — wytyczne (zbiorczo) + 2 kody */}
      <td className="px-1 py-1 whitespace-nowrap">
        <div className="flex gap-0.5 justify-center">
          <FilesButton
            label={guidelinesTooltipLabel(item)}
            icon={FileText}
            onClick={() => onOpenGuidelines()}
            active={hasAnyGuideline(item)}
          />
          <FilesButton
            label="EAN"
            icon={Barcode}
            onClick={() => onOpenBarcode("EAN13")}
            active={!!item.product.eanCode}
          />
          <FilesButton
            label="C128"
            icon={QrCode}
            onClick={() => onOpenBarcode("CODE128")}
            active={!!item.product.code128}
          />
        </div>
      </td>

      {/* Akcje */}
      <td className="px-1 py-1 whitespace-nowrap">
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            className="size-6 rounded hover:bg-muted grid place-items-center"
            aria-label="Edytuj"
          >
            <Pencil className="size-3" />
          </button>
          <DeleteItemButton itemId={item.id} />
        </div>
      </td>
    </tr>
    {hasSlots && bundleExpanded && (
      <tr className="bg-violet-50/20">
        <td colSpan={999} className="px-3 py-2 border-b">
          <BundleVariantPanel
            orderItemId={item.id}
            bundleQuantity={item.quantity}
            slots={item.product.components.map((c) => ({
              id: c.id,
              componentId: c.componentId,
              quantity: c.quantity,
              poolCategoryIds: c.poolCategories.map((pc) => pc.id),
              poolCategoryNames: c.poolCategories.map((pc) => pc.name),
              poolProductIds: c.poolProducts.map((pp) => pp.id),
              allowVariants: c.allowVariants,
              component: {
                id: c.component.id,
                name: c.component.name,
                productCode: c.component.productCode,
                categoryId: c.component.categoryId,
                categoryName: c.component.category?.name ?? null,
                cbmPerUnit: c.component.cbmPerUnit,
              },
            }))}
            splits={item.variantSplits.map((s) => ({
              id: s.id,
              productComponentId: s.productComponentId,
              variantProductId: s.variantProductId,
              units: s.units,
              variantProduct: {
                id: s.variantProduct.id,
                name: s.variantProduct.name,
                productCode: s.variantProduct.productCode,
                categoryId: s.variantProduct.categoryId,
                cbmPerUnit: s.variantProduct.cbmPerUnit,
              },
            }))}
            variantPool={products.map((p) => ({
              id: p.id,
              name: p.name,
              productCode: p.productCode,
              categoryId: p.categoryId,
            }))}
            categoryTree={categories.map((c) => ({
              id: c.id,
              parentId: c.parentId,
            }))}
          />
        </td>
      </tr>
    )}
    </>
  );
}

// ─── Komórka CBM z tooltipem wymiarów paczki ─────────────────────────

/**
 * "1.5" / "12" / "0.75" — bez zbędnych zer, max 2 miejsca po przecinku.
 * Używane do display ułamkowej liczby kartonów (zbiorczych i prod.).
 */
function formatKartonCount(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function CbmCell({
  item,
  itemCalc,
}: {
  item: Item;
  itemCalc: ContainerResult["items"][number];
}) {
  const product = item.product;
  const cbmPerUnit = itemCalc.cbmPerUnit;
  const totalCbm = itemCalc.totalCbm;
  const isKarton = product.importMode === "KARTON";

  // Priorytet wymiarów: PRZYPIĘTY karton z katalogu (FACTORY pin) > zdenormalizowane
  // pola na produkcie. Dzięki temu zmiana w „Pudełka" → product instantly propaguje
  // się do tooltipa — user nie musi pamiętać o ręcznym przepisaniu wymiarów.
  // Denormalizowane Product.box*Cm są fallbackiem dla legacy produktów bez pinu.
  const factoryPin =
    product.shippingBoxes.find((b) => b.purpose === "FACTORY" && b.isPrimary) ??
    product.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
    null;
  const effBoxW = factoryPin?.box.widthCm ?? product.boxWidthCm ?? null;
  const effBoxH = factoryPin?.box.heightCm ?? product.boxHeightCm ?? null;
  const effBoxD = factoryPin?.box.depthCm ?? product.boxDepthCm ?? null;
  const effBoxWeight = factoryPin?.box.weightKg ?? product.boxWeightKg ?? null;
  const effUnitsPerBox =
    factoryPin?.unitsPerBox ?? product.unitsPerBox ?? null;
  const boxSource = factoryPin ? "catalog" : product.boxWidthCm != null ? "product" : "none";

  // ── Master karton — gdy pełen komplet pól, liczymy ile masterów na zamówienie
  const hasMaster =
    isKarton &&
    product.masterBoxWidthCm != null &&
    product.masterBoxHeightCm != null &&
    product.masterBoxDepthCm != null &&
    product.innerBoxesPerMaster != null &&
    product.innerBoxesPerMaster > 0 &&
    effUnitsPerBox != null &&
    effUnitsPerBox > 0;
  const innerCount = hasMaster ? product.innerBoxesPerMaster! : null;
  const unitsPerMaster = hasMaster ? innerCount! * effUnitsPerBox! : null;
  // Ułamkowe liczby kartonów — pakowanie w kontener traktujemy proporcjonalnie
  // (partial karton = partial CBM). 18 szt przy 12/zbiorczy → 1.5 zbiorczego.
  const innerKartonsTotal =
    isKarton && effUnitsPerBox != null && effUnitsPerBox > 0
      ? item.quantity / effUnitsPerBox
      : null;
  const mastersTotal =
    hasMaster && unitsPerMaster != null && unitsPerMaster > 0
      ? item.quantity / unitsPerMaster
      : null;

  // Buduj tekst tooltipa — pokazuj co JEST dostępne, nie wymagaj wszystkich pól.
  const breakdownLines: string[] = [];
  const missingFields: string[] = [];

  if (isKarton) {
    const hasFullBox = effBoxW != null && effBoxH != null && effBoxD != null;
    if (hasFullBox) {
      const w = effBoxW!;
      const h = effBoxH!;
      const d = effBoxD!;
      const boxLabel =
        boxSource === "catalog"
          ? `Karton (z katalogu „${factoryPin!.box.name}"): ${w} × ${h} × ${d} cm`
          : `Karton: ${w} × ${h} × ${d} cm`;
      breakdownLines.push(boxLabel);
      if (effBoxWeight != null) {
        breakdownLines.push(`Waga kartonu: ${effBoxWeight} kg`);
      } else {
        missingFields.push("waga kartonu");
      }
      if (effUnitsPerBox != null && effUnitsPerBox > 0) {
        const upb = effUnitsPerBox;
        const boxCbm = (w * h * d) / 1_000_000;
        breakdownLines.push(`Sztuk w kartonie: ${upb}`);
        breakdownLines.push(`CBM kartonu: ${boxCbm.toFixed(4)} m³`);
        breakdownLines.push(
          `CBM / szt: ${cbmPerUnit.toFixed(4)} m³ (${boxCbm.toFixed(4)} / ${upb})`,
        );
      } else {
        missingFields.push("sztuk w kartonie");
        breakdownLines.push(`CBM / szt: ${cbmPerUnit.toFixed(4)} m³`);
      }
    } else {
      // Brak wymiarów kartonu — pokazujemy co jest + ostrzeżenie
      if (effBoxW != null)
        breakdownLines.push(`Szerokość kartonu: ${effBoxW} cm`);
      else missingFields.push("szerokość kartonu");
      if (effBoxH != null)
        breakdownLines.push(`Wysokość kartonu: ${effBoxH} cm`);
      else missingFields.push("wysokość kartonu");
      if (effBoxD != null)
        breakdownLines.push(`Głębokość kartonu: ${effBoxD} cm`);
      else missingFields.push("głębokość kartonu");
      if (effBoxWeight != null)
        breakdownLines.push(`Waga kartonu: ${effBoxWeight} kg`);
      else missingFields.push("waga kartonu");
      if (effUnitsPerBox != null)
        breakdownLines.push(`Sztuk w kartonie: ${effUnitsPerBox}`);
      else missingFields.push("sztuk w kartonie");
      breakdownLines.push(`CBM / szt: ${cbmPerUnit.toFixed(4)} m³`);
    }
  } else {
    // LUZEM
    if (
      product.unitsPerContainer != null &&
      product.unitsPerContainer > 0 &&
      product.referenceContainerM3 != null
    ) {
      const upc = product.unitsPerContainer;
      const refM3 = product.referenceContainerM3;
      breakdownLines.push(`Tryb: LUZEM`);
      breakdownLines.push(`Kontener ref.: ${refM3} m³`);
      breakdownLines.push(`Sztuk w kontenerze: ${upc}`);
      breakdownLines.push(
        `CBM / szt: ${cbmPerUnit.toFixed(4)} m³ (${refM3} / ${upc})`,
      );
    } else {
      breakdownLines.push(`Tryb: LUZEM`);
      if (product.referenceContainerM3 != null)
        breakdownLines.push(`Kontener ref.: ${product.referenceContainerM3} m³`);
      else missingFields.push("kontener referencyjny");
      if (product.unitsPerContainer != null)
        breakdownLines.push(`Sztuk w kontenerze: ${product.unitsPerContainer}`);
      else missingFields.push("sztuk w kontenerze");
      breakdownLines.push(`CBM / szt: ${cbmPerUnit.toFixed(4)} m³`);
    }
  }

  // CBM zbiorczego kartonu — używany w finalnym liczeniu objętości kontenera
  // (pełne zbiorcze kartony, nie suma inner-ów, bo zbiorczy ma własną geometrię).
  const masterCbm = hasMaster
    ? (product.masterBoxWidthCm! *
        product.masterBoxHeightCm! *
        product.masterBoxDepthCm!) /
      1_000_000
    : null;

  if (hasMaster) {
    breakdownLines.push(
      `Karton zbiorczy: ${product.masterBoxWidthCm}×${product.masterBoxHeightCm}×${product.masterBoxDepthCm} cm`,
    );
    breakdownLines.push(`CBM zbiorczego: ${masterCbm!.toFixed(4)} m³`);
    breakdownLines.push(
      `Prod. w zbiorczym: ${innerCount} · szt/zbiorczy: ${unitsPerMaster}`,
    );
  }

  breakdownLines.push(`Ilość: ${item.quantity} szt`);
  if (innerKartonsTotal != null) {
    breakdownLines.push(`Prod. kartonów: ${formatKartonCount(innerKartonsTotal)}`);
  }
  if (mastersTotal != null) {
    breakdownLines.push(`Zbiorczych kartonów: ${formatKartonCount(mastersTotal)}`);
  }
  if (hasMaster && masterCbm != null && mastersTotal != null) {
    breakdownLines.push(
      `Razem CBM: ${totalCbm.toFixed(4)} m³ (${formatKartonCount(mastersTotal)} × ${masterCbm.toFixed(4)})`,
    );
  } else if (
    isKarton &&
    !hasMaster &&
    innerKartonsTotal != null &&
    effBoxW != null &&
    effBoxH != null &&
    effBoxD != null
  ) {
    const innerCbm = (effBoxW * effBoxH * effBoxD) / 1_000_000;
    breakdownLines.push(
      `Razem CBM: ${totalCbm.toFixed(4)} m³ (${formatKartonCount(innerKartonsTotal)} × ${innerCbm.toFixed(4)})`,
    );
  } else {
    breakdownLines.push(`Razem CBM: ${totalCbm.toFixed(4)} m³`);
  }
  if (missingFields.length > 0) {
    breakdownLines.push(`⚠ Uzupełnij w karcie: ${missingFields.join(", ")}`);
  }

  return (
    <td className="text-right px-1.5 py-1.5 tabular-nums whitespace-nowrap">
      <PopoverPrimitive.Root>
        <PopoverPrimitive.Trigger
          openOnHover
          delay={150}
          nativeButton={false}
          render={
            <span
              className="cursor-help inline-flex flex-col items-end leading-tight"
              tabIndex={0}
            >
              <span className="font-semibold underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                {totalCbm.toFixed(2)}
              </span>
              {/* Bez literek „M"/„p" — same liczby, kolory rozróżniają:
               *  orange = master (zbiorcze), slate = produktowe (inner).
               *  Pełny opis w tooltipie wyliczenia CBM. */}
              {mastersTotal != null ? (
                <span className="text-[8px] font-medium tabular-nums leading-none">
                  <span className="text-orange-700">
                    {formatKartonCount(mastersTotal)}
                  </span>
                  <span className="text-muted-foreground/50 mx-0.5">·</span>
                  <span className="text-slate-500">
                    {formatKartonCount(innerKartonsTotal!)}
                  </span>
                </span>
              ) : innerKartonsTotal != null ? (
                <span className="text-[8px] text-slate-500 font-medium tabular-nums leading-none">
                  {formatKartonCount(innerKartonsTotal)}
                </span>
              ) : null}
            </span>
          }
        />
        {/* Portal — żeby popover nie był ucinany przez overflow / clipping
         *  przodków (tabela / sekcja kontenera). z-[200] żeby leżał nad
         *  innymi tooltipami i sticky headerami. */}
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            align="end"
            side="bottom"
            sideOffset={6}
            className="isolate z-[200]"
          >
            <PopoverPrimitive.Popup className="rounded-md bg-slate-900 text-white p-2 text-[10px] leading-snug shadow-lg ring-1 ring-slate-700 w-72 max-w-[min(380px,90vw)] whitespace-normal break-words text-left outline-hidden">
              <div className="font-bold text-indigo-200 mb-1 flex items-center gap-1">
                📦 Wyliczenie CBM
                <span className="ml-auto text-[9px] uppercase text-slate-400">
                  {isKarton ? "KARTON" : "LUZEM"}
                </span>
              </div>
              <div className="space-y-0.5 tabular-nums">
                {breakdownLines.map((line, i) => {
                  const isResult = line.startsWith("Razem CBM");
                  const isPerUnit = line.startsWith("CBM / szt");
                  const isWarn = line.startsWith("⚠");
                  return (
                    <div
                      key={i}
                      className={cn(
                        isResult &&
                          "font-bold text-emerald-300 pt-1 mt-1 border-t border-slate-700",
                        isPerUnit && "text-amber-200",
                        isWarn &&
                          "text-amber-300 italic pt-1 mt-1 border-t border-slate-700",
                      )}
                    >
                      {line}
                    </div>
                  );
                })}
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </td>
  );
}

function FilesButton({
  label,
  icon: Icon,
  onClick,
  active,
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "size-6 rounded grid place-items-center transition-colors",
            active
              ? "hover:bg-primary/10 text-primary"
              : "text-muted-foreground/40 hover:bg-muted",
          )}
          aria-label={label}
        >
          <Icon className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {!active && <span className="opacity-60"> · nie uzupełnione</span>}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Komórki kanału (4 kolumny: cena, prow, zysk, marża) ────────────

/**
 * Wartość pola sales-channel z kategorii z dziedziczeniem: Category →
 * Parent → Grandparent. Zwraca też która kategoria w hierarchii podała
 * wartość — quick-edit zapisuje na tę kategorię (kaskada).
 */
function resolveCategorySalesDefault(
  category: Item["product"]["category"],
  channel: "Allegro" | "Sklep",
  field: "commissionPct" | "kpkPln" | "customerShippingPln",
): {
  value: number | null;
  sourceCategoryId: string | null;
  sourceCategoryName: string | null;
  ownCategoryId: string | null;
  ownCategoryName: string;
} {
  if (!category) {
    return {
      value: null,
      sourceCategoryId: null,
      sourceCategoryName: null,
      ownCategoryId: null,
      ownCategoryName: "—",
    };
  }
  const ownId = category.id;
  const ownName = category.name;
  const fieldOn = (
    cat: {
      commissionPctAllegro: number | null;
      commissionPctSklep: number | null;
      kpkPlnAllegro: number | null;
      kpkPlnSklep: number | null;
      customerShippingPlnAllegro: number | null;
      customerShippingPlnSklep: number | null;
    },
  ): number | null => {
    if (field === "commissionPct") {
      return channel === "Allegro" ? cat.commissionPctAllegro : cat.commissionPctSklep;
    }
    if (field === "kpkPln") {
      return channel === "Allegro" ? cat.kpkPlnAllegro : cat.kpkPlnSklep;
    }
    return channel === "Allegro"
      ? cat.customerShippingPlnAllegro
      : cat.customerShippingPlnSklep;
  };
  const own = fieldOn(category);
  if (own != null) {
    return {
      value: own,
      sourceCategoryId: ownId,
      sourceCategoryName: ownName,
      ownCategoryId: ownId,
      ownCategoryName: ownName,
    };
  }
  if (category.parent) {
    const p = fieldOn(category.parent);
    if (p != null) {
      return {
        value: p,
        sourceCategoryId: category.parent.id,
        sourceCategoryName: category.parent.name,
        ownCategoryId: ownId,
        ownCategoryName: ownName,
      };
    }
    if (category.parent.parent) {
      const pp = fieldOn(category.parent.parent);
      if (pp != null) {
        return {
          value: pp,
          sourceCategoryId: category.parent.parent.id,
          sourceCategoryName: category.parent.parent.name,
          ownCategoryId: ownId,
          ownCategoryName: ownName,
        };
      }
    }
  }
  // Brak ustawienia — sugerujemy ownCategory jako miejsce zapisu.
  return {
    value: null,
    sourceCategoryId: ownId,
    sourceCategoryName: ownName,
    ownCategoryId: ownId,
    ownCategoryName: ownName,
  };
}

function ChannelCells({
  itemId,
  name,
  channel,
  calc,
  landedCostPerUnitPln,
  bg,
  bgFocus,
  priceMode,
  vatRate,
  showOther = false,
  showAdCost = false,
  productCategory,
}: {
  itemId: string;
  name: string;
  channel: Channel | undefined;
  calc: ContainerResult["items"][number]["channels"][number] | undefined;
  landedCostPerUnitPln: number;
  bg: string;
  bgFocus: string;
  priceMode: PriceMode;
  vatRate: number;
  showOther?: boolean;
  /** Sklep: dodaj kolumnę KPK (adCostPln). */
  showAdCost?: boolean;
  /** Hierarchia kategorii produktu — do dziedziczenia commission/KPK. */
  productCategory: Item["product"]["category"];
}) {
  const [pending, startTransition] = useTransition();

  const initialPrice = channel?.salePricePln ?? 0;
  const initialCommission = channel?.commissionPct ?? null;

  const [price, setPrice] = useState(
    initialPrice > 0
      ? String(round2(toMode(initialPrice, priceMode, vatRate)))
      : "",
  );
  const [commissionPct, setCommissionPct] = useState(
    initialCommission != null
      ? String(round2(initialCommission * 100))
      : "",
  );
  const [otherCost, setOtherCost] = useState(
    channel?.otherCostPln != null
      ? String(round2(toMode(channel.otherCostPln, priceMode, vatRate)))
      : "",
  );
  const [customerShipping, setCustomerShipping] = useState(
    channel?.customerShippingPln != null
      ? String(round2(toMode(channel.customerShippingPln, priceMode, vatRate)))
      : "",
  );
  const [adCost, setAdCost] = useState(
    channel?.adCostPln != null
      ? String(round2(toMode(channel.adCostPln, priceMode, vatRate)))
      : "",
  );

  // Gdy zmienia się tryb netto/brutto, przelicz wyświetlane wartości
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrice(
      channel && channel.salePricePln > 0
        ? String(round2(toMode(channel.salePricePln, priceMode, vatRate)))
        : "",
    );
    setOtherCost(
      channel?.otherCostPln != null
        ? String(round2(toMode(channel.otherCostPln, priceMode, vatRate)))
        : "",
    );
    setCustomerShipping(
      channel?.customerShippingPln != null
        ? String(
            round2(toMode(channel.customerShippingPln, priceMode, vatRate)),
          )
        : "",
    );
    setAdCost(
      channel?.adCostPln != null
        ? String(round2(toMode(channel.adCostPln, priceMode, vatRate)))
        : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceMode]);

  function save() {
    const priceBrutto = fromMode(Number(price) || 0, priceMode, vatRate);
    const otherBrutto =
      otherCost === ""
        ? null
        : fromMode(Number(otherCost) || 0, priceMode, vatRate);
    const customerShippingBrutto =
      customerShipping === ""
        ? null
        : fromMode(Number(customerShipping) || 0, priceMode, vatRate);
    const adCostBrutto =
      adCost === "" ? null : fromMode(Number(adCost) || 0, priceMode, vatRate);
    startTransition(async () => {
      try {
        await upsertItemChannelAction(itemId, name, {
          salePricePln: priceBrutto,
          commissionPct,
          shippingCostPln: channel?.shippingCostPln ?? null,
          fulfillmentPln: channel?.fulfillmentPln ?? null,
          adCostPln: adCostBrutto ?? channel?.adCostPln ?? null,
          otherCostPln: otherBrutto,
          customerShippingPln: customerShippingBrutto,
          shareOfQty: null,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  /** Zapisz wartość netto bezpośrednio na kanale dla danego pola.
   *  Jeśli kanał jeszcze nie istnieje (channel?.id == null), tworzymy go
   *  przez upsert z bieżącymi wartościami stanu + ten field jako override. */
  /** Zapis stawki prowizji platformy (np. 4.5%). Input dostarcza
   *  liczbę procentu — konwertujemy na fraction 0..1 do DB. */
  async function saveCommissionPctNumber(value: number | null) {
    const fraction = value != null ? value / 100 : null;
    // Sync local state żeby UI od razu pokazywał nową wartość
    setCommissionPct(value != null ? String(value) : "");
    try {
      if (channel?.id) {
        await updateChannelFieldAction(channel.id, "commissionPct", fraction);
      } else {
        await upsertItemChannelAction(itemId, name, {
          salePricePln: channel?.salePricePln ?? 0,
          commissionPct: value != null ? String(value) : "",
          shippingCostPln: channel?.shippingCostPln ?? null,
          fulfillmentPln: channel?.fulfillmentPln ?? null,
          adCostPln: channel?.adCostPln ?? null,
          otherCostPln: channel?.otherCostPln ?? null,
          customerShippingPln: channel?.customerShippingPln ?? null,
          shareOfQty: null,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się");
    }
  }

  async function saveFieldNetto(
    field:
      | "salePricePln"
      | "customerShippingPln"
      | "otherCostPln"
      | "adCostPln",
    nettoValue: number | null,
  ) {
    try {
      if (channel?.id) {
        await updateChannelFieldAction(channel.id, field, nettoValue);
      } else {
        // Brak kanału — utwórz przez upsert. salePricePln nie może być null.
        const priceNet =
          field === "salePricePln"
            ? (nettoValue ?? 0)
            : (channel?.salePricePln ?? 0);
        await upsertItemChannelAction(itemId, name, {
          salePricePln: priceNet,
          commissionPct,
          shippingCostPln: channel?.shippingCostPln ?? null,
          fulfillmentPln: channel?.fulfillmentPln ?? null,
          adCostPln: field === "adCostPln" ? nettoValue : null,
          otherCostPln: field === "otherCostPln" ? nettoValue : null,
          customerShippingPln:
            field === "customerShippingPln" ? nettoValue : null,
          shareOfQty: null,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się");
    }
  }

  const profit = calc ? toMode(calc.unitProfit, priceMode, vatRate) : 0;
  const profitClass = calc
    ? calc.unitProfit > 0
      ? "text-emerald-700"
      : calc.unitProfit < 0
        ? "text-destructive"
        : "text-muted-foreground"
    : "text-muted-foreground";
  const marginClass = calc
    ? calc.marginPct >= 30
      ? "text-emerald-700 font-semibold"
      : calc.marginPct >= 15
        ? "text-amber-700"
        : "text-destructive"
    : "text-muted-foreground";

  const inputCls = cn(
    "w-full h-7 text-right text-xs tabular-nums px-1 bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-inset",
    bgFocus,
  );
  const inputRevenue = cn(inputCls, "text-emerald-700");
  const inputCost = cn(inputCls, "text-rose-700");

  // ─── Tooltipy z breakdown ────────────────────────────────────────
  const modeLabel = priceMode === "brutto" ? "brutto" : "netto";
  const priceLines: string[] = [
    `Wartość: ${calc ? round2(toMode(calc.salePricePln, priceMode, vatRate)).toFixed(2) : (Number(price) || 0).toFixed(2)} zł/szt (${modeLabel})`,
    `+ REVENUE — od tego liczona jest marża`,
    `Klik = edycja w komórce, blur = zapis`,
  ];

  const commissionLines: string[] = (() => {
    const arr: string[] = [];
    if (calc && calc.salePricePln > 0) {
      const pct = (calc.commissionPln / calc.salePricePln) * 100;
      arr.push(
        `${calc.salePricePln.toFixed(2)} zł × ${pct.toFixed(2)}% = ${calc.commissionPln.toFixed(2)} zł/szt`,
      );
    } else {
      arr.push(`Stawka: ${commissionPct || 0}%`);
    }
    arr.push("− KOSZT (pomniejsza zysk)");
    return arr;
  })();

  const customerShippingValue = calc?.salePricePln != null
    ? channel?.customerShippingPln ?? 0
    : Number(customerShipping) || 0;
  const customerShippingLines: string[] = [
    `${round2(toMode(customerShippingValue, priceMode, vatRate)).toFixed(2)} zł/szt (${modeLabel})`,
    `+ REVENUE — doliczana do marży (klient płaci za wysyłkę)`,
  ];

  const otherLines: string[] = [
    `${(Number(otherCost) || 0).toFixed(2)} zł/szt (${modeLabel})`,
    `− KOSZT (np. opłaty serwisowe, ZUS od sprzedaży)`,
  ];

  const adCostLines: string[] = [
    `${(Number(adCost) || 0).toFixed(2)} zł/szt (${modeLabel})`,
    `− KOSZT (CAC — Customer Acquisition Cost)`,
  ];

  // Pomocnik: pokazuje "X netto / Y brutto" (wartości w bazie są netto).
  const fmtNetBrutto = (netto: number): string => {
    const brutto = netto * (1 + vatRate);
    return `${netto.toFixed(2)} / ${brutto.toFixed(2)} zł`;
  };

  const profitLines: string[] = calc
    ? [
        `+ Cena: ${fmtNetBrutto(calc.salePricePln)}`,
        `+ Wysyłka klient: ${fmtNetBrutto(channel?.customerShippingPln ?? 0)}`,
        `− Landed: ${fmtNetBrutto(landedCostPerUnitPln)}`,
        `− Wysyłka kurierem: ${fmtNetBrutto(calc.shippingCostPln)}`,
        `− Fulfillment: ${fmtNetBrutto(calc.fulfillmentPln)}`,
        `− Karton: ${fmtNetBrutto(calc.packagingCostPln)}`,
        `− Prowizja: ${fmtNetBrutto(calc.commissionPln)}`,
        showAdCost
          ? `− Reklama: ${fmtNetBrutto(calc.adCostPln)}`
          : `− Inne: ${fmtNetBrutto(calc.otherCostPln)}`,
        `= Zysk: ${fmtNetBrutto(calc.unitProfit)} / szt`,
        `Format: netto / brutto (VAT ${(vatRate * 100).toFixed(0)}%)`,
      ]
    : ["Brak danych"];

  const marginLines: string[] = calc
    ? [
        `Zysk: ${fmtNetBrutto(calc.unitProfit)}`,
        `÷ Cena: ${fmtNetBrutto(calc.salePricePln)}`,
        `× 100 = ${calc.marginPct.toFixed(2)}%`,
        calc.marginPct >= 30
          ? "✓ Bardzo dobra marża (≥30%)"
          : calc.marginPct >= 15
            ? "⚠ Średnia marża (15-30%)"
            : "✗ Niska marża (<15%)",
      ]
    : ["Brak danych"];

  // Kolor akcentu zależnie od kanału
  const accentColor = name === "Sklep" ? "text-emerald-300" : "text-amber-300";

  return (
    <>
      <td className={cn("px-0.5 py-1.5 w-[52px] text-right", bg)}>
        <EditablePriceInput
          nettoValue={channel?.salePricePln ?? null}
          vatRate={vatRate}
          displayMode="brutto"
          label={`${name} — Cena sprzedaży`}
          // Price-tag styl: niebieski chip — cena sprzedaży jako „price tag".
          // Hover override: hover:bg-sky-200 zamiast standardowego indigo.
          className={cn(
            "text-sky-900 font-bold tabular-nums",
            "bg-sky-100 ring-1 ring-sky-400/60 rounded-sm",
            "hover:!bg-sky-200 hover:!ring-sky-500",
            "shadow-[1px_1px_0_rgba(7,89,133,0.18)]",
          )}
          placeholder="0"
          formatValue={fmtMoneyShort}
          suffix="zł"
          onSave={(n) => saveFieldNetto("salePricePln", n)}
        />
      </td>
      <td className={cn("px-1.5 py-1.5 min-w-[44px] text-right", bg)}>
        {(() => {
          const ch = name === "Sklep" ? "Sklep" : "Allegro";
          const res = resolveCategorySalesDefault(
            productCategory,
            ch,
            "commissionPct",
          );
          return (
            <CategoryDefaultInput
              value={res.value != null ? res.value * 100 : null}
              mode="percent"
              sourceCategoryId={res.sourceCategoryId}
              sourceCategoryName={res.sourceCategoryName}
              ownCategoryName={res.ownCategoryName}
              channelLabel={ch}
              fieldLabel="Prowizja platformy"
              className="text-rose-600 font-medium tabular-nums"
              placeholder="—"
              onSave={async (catId, valuePct) => {
                const fraction = valuePct != null ? valuePct / 100 : null;
                await updateCategorySalesChannelDefaultsAction(
                  catId,
                  ch,
                  "commissionPct",
                  fraction,
                );
              }}
            />
          );
        })()}
      </td>
      <td className={cn("px-1.5 py-1.5 min-w-[44px] text-right", bg)}>
        {(() => {
          const ch = name === "Sklep" ? "Sklep" : "Allegro";
          const res = resolveCategorySalesDefault(
            productCategory,
            ch,
            "customerShippingPln",
          );
          return (
            <CategoryDefaultInput
              value={res.value}
              mode="money"
              sourceCategoryId={res.sourceCategoryId}
              sourceCategoryName={res.sourceCategoryName}
              ownCategoryName={res.ownCategoryName}
              channelLabel={ch}
              fieldLabel="Wysyłka pokrywana przez klienta (REVENUE)"
              className="text-emerald-700 tabular-nums"
              placeholder="—"
              onSave={async (catId, val) => {
                await updateCategorySalesChannelDefaultsAction(
                  catId,
                  ch,
                  "customerShippingPln",
                  val,
                );
              }}
            />
          );
        })()}
      </td>
      {showOther && (
        // Allegro „Inne" = KPK Allegro (dziedziczone z kategorii).
        <td className={cn("px-1.5 py-1.5 min-w-[44px] text-right", bg)}>
          {(() => {
            const res = resolveCategorySalesDefault(
              productCategory,
              "Allegro",
              "kpkPln",
            );
            return (
              <CategoryDefaultInput
                value={res.value}
                mode="money"
                sourceCategoryId={res.sourceCategoryId}
                sourceCategoryName={res.sourceCategoryName}
                ownCategoryName={res.ownCategoryName}
                channelLabel="Allegro"
                fieldLabel="KPK (koszt pozyskania klienta)"
                className="text-rose-700 tabular-nums"
                placeholder="—"
                onSave={async (catId, val) => {
                  await updateCategorySalesChannelDefaultsAction(
                    catId,
                    "Allegro",
                    "kpkPln",
                    val,
                  );
                }}
              />
            );
          })()}
        </td>
      )}
      {showAdCost && (
        // Sklep „Reklama" = KPK Sklep (dziedziczone z kategorii).
        <td className={cn("px-1.5 py-1.5 min-w-[44px] text-right", bg)}>
          {(() => {
            const res = resolveCategorySalesDefault(
              productCategory,
              "Sklep",
              "kpkPln",
            );
            return (
              <CategoryDefaultInput
                value={res.value}
                mode="money"
                sourceCategoryId={res.sourceCategoryId}
                sourceCategoryName={res.sourceCategoryName}
                ownCategoryName={res.ownCategoryName}
                channelLabel="Sklep"
                fieldLabel="KPK (koszt pozyskania klienta)"
                className="text-rose-700 tabular-nums"
                placeholder="—"
                onSave={async (catId, val) => {
                  await updateCategorySalesChannelDefaultsAction(
                    catId,
                    "Sklep",
                    "kpkPln",
                    val,
                  );
                }}
              />
            );
          })()}
        </td>
      )}
      <td
        className={cn(
          "text-right px-1.5 py-1.5 tabular-nums whitespace-nowrap min-w-[56px] cursor-help",
          bg,
        )}
      >
        <span className="relative group/tip inline-block">
          {calc ? (
            // Zysk: badge z gradientem zielonym (+) lub różowym (−).
            // Lekkie skewowanie + offset shadow + biały shine na górze
            // żeby badge wyglądał jak medal/etykieta zysku.
            <span
              className={cn(
                "font-extrabold px-1.5 py-0.5 rounded-md no-underline",
                profit > 0
                  ? cn(
                      "text-emerald-950",
                      "bg-gradient-to-br from-emerald-200 via-emerald-300 to-emerald-200",
                      "ring-1 ring-emerald-500/60",
                      "shadow-[1px_1px_0_rgba(6,78,59,0.25),inset_0_1px_0_rgba(255,255,255,0.6)]",
                    )
                  : profit < 0
                    ? cn(
                        "text-rose-950",
                        "bg-gradient-to-br from-rose-200 via-rose-300 to-rose-200",
                        "ring-1 ring-rose-500/60",
                        "shadow-[1px_1px_0_rgba(136,19,55,0.25),inset_0_1px_0_rgba(255,255,255,0.6)]",
                      )
                    : "text-muted-foreground bg-slate-100 ring-1 ring-slate-300 rounded-md px-1.5",
              )}
            >
              {fmtMoneyShort(profit)}
              <ZlSuffix />
            </span>
          ) : (
            "—"
          )}
          <ChannelTooltip
            title={`${name} — Zysk per sztuka`}
            lines={profitLines}
            accentColor={accentColor}
          />
        </span>
      </td>
      <td
        className={cn(
          "text-right px-1.5 py-1.5 tabular-nums whitespace-nowrap border-r min-w-[44px] cursor-help",
          bg,
          marginClass,
        )}
      >
        <span className="relative group/tip inline-block">
          {calc ? `${calc.marginPct.toFixed(0)}%` : "—"}
          <ChannelTooltip
            title={`${name} — Marża %`}
            lines={marginLines}
            accentColor={accentColor}
          />
        </span>
      </td>
    </>
  );
}

// ─── Tooltip kanału sprzedaży (CSS-only popover) ─────────────────────

function ChannelTooltip({
  title,
  lines,
  accentColor,
}: {
  title: string;
  lines: string[];
  accentColor: string;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-full right-0 mt-1 z-50 w-64 rounded-md bg-slate-900 text-white p-2 text-[10px] leading-snug shadow-lg",
        "opacity-0 group-hover/tip:opacity-100 group-focus-within/tip:opacity-0",
        "transition-opacity duration-150 text-left",
      )}
    >
      <div className={cn("font-bold mb-1", accentColor)}>{title}</div>
      <div className="space-y-0.5 tabular-nums">
        {lines.map((line, i) => {
          const isPlus = line.startsWith("+ ");
          const isMinus = line.startsWith("− ");
          const isResult = line.startsWith("= ") || line.startsWith("Σ ");
          const isMeta =
            line.startsWith("Wyświetlane") ||
            line.startsWith("Stawka") ||
            line.startsWith("Klik");
          const isGood = line.startsWith("✓ ") || line.startsWith("✓ ");
          const isWarn = line.startsWith("⚠ ");
          const isBad = line.startsWith("✗ ");
          const isLabel = line.startsWith("+ REVENUE") || line.startsWith("− KOSZT");
          return (
            <div
              key={i}
              className={cn(
                isPlus && !isLabel && "text-emerald-300",
                isMinus && !isLabel && "text-rose-300",
                isResult &&
                  "font-bold text-emerald-300 pt-1 mt-1 border-t border-slate-700",
                isMeta && "text-slate-400 italic",
                isGood && "text-emerald-300 italic pt-1 mt-1 border-t border-slate-700",
                isWarn && "text-amber-300 italic pt-1 mt-1 border-t border-slate-700",
                isBad && "text-rose-300 italic pt-1 mt-1 border-t border-slate-700",
                isLabel && "text-slate-400 italic text-[9px] uppercase tracking-wide",
              )}
            >
              {line}
            </div>
          );
        })}
      </div>
    </span>
  );
}

// ─── Wspólna wysyłka (Allegro + Sklep dostają tę samą wartość) ──────

function SharedShippingCell({
  itemId,
  currentShipping,
  priceMode,
  vatRate,
  meta,
}: {
  itemId: string;
  currentShipping: number | null;
  priceMode: PriceMode;
  vatRate: number;
  meta: ItemMeta["shipping"] | null;
}) {
  void itemId;
  // Tylko-odczyt — koszt wysyłki narzucany z góry (z kalkulatora kurierskiego /
  // umowy). Edytować można w karcie produktu (preferowane usługi) lub w
  // ustawieniach.
  const displayed =
    currentShipping && currentShipping > 0
      ? round2(toMode(currentShipping, priceMode, vatRate))
      : null;

  const content =
    displayed != null ? (
      <span className="text-rose-700">
        {fmtMoneyShort(displayed)}
        <ZlSuffix />
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  // Gdy mamy popover z opcjami wysyłki — bez natywnego `title=`, żeby nie
  // dublować tooltipa. Gdy brak popovera — krótki natywny title.
  if (meta && meta.applicable.length > 0) {
    return (
      <td className="bg-indigo-50/20 min-w-[44px] text-right text-xs tabular-nums px-2 py-1.5 cursor-help select-none">
        <ShippingQuotePopover
          applicable={meta.applicable}
          cheapest={meta.cheapest}
          preferredCodes={meta.preferredCodes}
        >
          <span className="inline-block">{content}</span>
        </ShippingQuotePopover>
      </td>
    );
  }
  return (
    <td
      className="bg-indigo-50/20 min-w-[44px] text-right text-xs tabular-nums px-2 py-1.5 cursor-help select-none"
      title="🔒 Wartość narzucana z kalkulatora kurierskiego — brak danych"
    >
      {content}
    </td>
  );
}

// ─── Wspólny karton wysyłkowy (Allegro + Sklep ta sama wartość) ─────

function SharedPackagingCell({
  itemId,
  currentPackaging,
  priceMode,
  vatRate,
  meta,
}: {
  itemId: string;
  currentPackaging: number | null;
  priceMode: PriceMode;
  vatRate: number;
  meta: ItemMeta["packaging"] | null;
}) {
  void itemId;
  // Tylko-odczyt — koszt kartonu narzucany z katalogu pudełek przypiętych
  // do produktu (sztuk/karton × cena/karton).
  const displayed =
    currentPackaging && currentPackaging > 0
      ? round2(toMode(currentPackaging, priceMode, vatRate))
      : null;

  // Tooltip zawiera ZAWSZE: nazwę kartonu, jego wymiary (jeśli są) oraz
  // ile sztuk produktu się w nim mieści (unitsPerBox). Dla FACTORY dochodzi
  // info „koszt 0 zł — z fabryki", dla SHIPPING — cena/karton + cena/szt.
  const dimsStr = meta?.boxDims
    ? ` (${meta.boxDims.widthCm}×${meta.boxDims.heightCm}×${meta.boxDims.depthCm} cm)`
    : "";
  const upbStr =
    meta?.unitsPerBox != null ? `${meta.unitsPerBox} szt/karton` : null;
  const baseLines = meta
    ? meta.isFactory
      ? [
          `Karton z Chin: „${meta.boxName}"${dimsStr}`,
          upbStr,
          "Koszt 0 zł — produkt już w pudełku z fabryki",
        ].filter(Boolean) as string[]
      : meta.pricePerBox != null
        ? [
            `Karton: „${meta.boxName}"${dimsStr}`,
            upbStr,
            `${meta.pricePerBox.toFixed(2)} zł/karton ÷ ${meta.unitsPerBox} szt = ${(meta.pricePerBox / meta.unitsPerBox).toFixed(2)} zł/szt`,
          ].filter(Boolean) as string[]
        : [
            `Karton: „${meta.boxName}"${dimsStr}`,
            upbStr,
            "Brak ceny zakupu pudełka",
          ].filter(Boolean) as string[]
    : ["Brak przypisanego pudełka"];
  const titleText = [
    ...baseLines,
    "🔒 Wartość narzucana z katalogu pudełek — edytuj cenę pudełka w katalogu",
  ].join("\n");

  // Karton z Chin → wartość = 0 i pokazujemy "0" na zielono jako sygnał
  // „produkt już zapakowany w fabryce, nie płacimy ekstra za karton".
  const isFreeFactory = !!meta?.isFactory;

  return (
    <td
      className="bg-indigo-50/20 border-r min-w-[44px] text-right text-xs tabular-nums px-2 py-1.5 cursor-help select-none"
      title={titleText}
    >
      {displayed != null ? (
        <span className="text-rose-700">
          {fmtMoneyShort(displayed)}
          <ZlSuffix />
        </span>
      ) : isFreeFactory ? (
        <span className="text-emerald-700 font-semibold">
          0<ZlSuffix />
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </td>
  );
}

// ─── Wspólny fulfillment (Allegro + Sklep ta sama wartość) ──────────

function SharedFulfillmentCell({
  itemId,
  currentFulfillment,
  priceMode,
  vatRate,
  meta,
}: {
  itemId: string;
  currentFulfillment: number | null;
  priceMode: PriceMode;
  vatRate: number;
  meta: ItemMeta["fulfillment"] | null;
}) {
  void itemId;
  // Tylko-odczyt — fulfillment per sztuka liczony z ustawień systemowych
  // (umowa magazyn + sztuki w opakowaniu/palecie). Edytuj w /ustawienia.
  const displayed =
    currentFulfillment && currentFulfillment > 0
      ? round2(toMode(currentFulfillment, priceMode, vatRate))
      : null;

  const content =
    displayed != null ? (
      <span className="text-rose-700">
        {fmtMoneyShort(displayed)}
        <ZlSuffix />
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  if (meta) {
    return (
      <td className="bg-indigo-50/20 border-r min-w-[44px] text-right text-xs tabular-nums px-2 py-1.5 cursor-help select-none">
        <FulfillmentBreakdownPopover
          breakdown={meta}
          factor={priceMode === "brutto" ? 1 + vatRate : 1}
          priceModeLabel={priceMode}
        >
          <span className="inline-block">{content}</span>
        </FulfillmentBreakdownPopover>
      </td>
    );
  }
  return (
    <td
      className="bg-indigo-50/20 border-r min-w-[44px] text-right text-xs tabular-nums px-2 py-1.5 cursor-help select-none"
      title="🔒 Wartość narzucana z ustawień fulfillmentu. Edytuj w /ustawienia."
    >
      {content}
    </td>
  );
}

// ─── Cena zakupu: popover z CNY/USD + kurs + brutto ─────────────────

function PurchasePriceCell({
  itemId,
  unitPriceCny,
  unitPriceUsd,
  itemCnyRate,
  itemUsdRate,
  cnyToPlnRate,
  usdToPlnRate,
  effectiveTrancheUsd,
  effectiveTrancheCny,
  vatRate,
  priceMode,
  displayedPln,
  nettoPerUnitPln,
  itemQty,
  editable,
  priceHistory,
  inline = false,
}: {
  itemId: string;
  unitPriceCny: number | null;
  unitPriceUsd: number | null;
  itemCnyRate: number | null;
  itemUsdRate: number | null;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  effectiveTrancheUsd: number | null;
  effectiveTrancheCny: number | null;
  vatRate: number;
  priceMode: PriceMode;
  displayedPln: number;
  /** Cena zakupu netto/szt (PLN) — używana w popoverze jako Aktualna. */
  nettoPerUnitPln: number;
  /** Ilość z tej pozycji — pokazywana w popoverze. */
  itemQty: number;
  editable: boolean;
  priceHistory: PriceHistoryEntry[];
  /**
   * Tryb inline — zwraca samą zawartość (span/popover-trigger) BEZ <td>.
   * Używany do układu „formuła kosztów" w jednej szerokiej komórce.
   * Bez ZlSuffix w środku formuły (zł jest na końcu sumy).
   */
  inline?: boolean;
}) {
  const shown =
    displayedPln > 0 ? (
      <>
        {fmtMoneyShort(displayedPln)}
        {!inline && <ZlSuffix />}
      </>
    ) : (
      "—"
    );
  const [open, setOpen] = useState(false);

  // Breakdown tooltipa — pokazuje jak liczona jest cena PLN/szt.
  const lines: string[] = [];
  if (unitPriceUsd != null && unitPriceUsd > 0) {
    const rate = effectiveTrancheUsd ?? itemUsdRate ?? usdToPlnRate ?? 0;
    lines.push(
      `Zakup: ${unitPriceUsd.toFixed(2)} USD × ${rate.toFixed(4)} zł/USD = ${(unitPriceUsd * rate).toFixed(2)} zł/szt`,
    );
    if (effectiveTrancheUsd != null) {
      lines.push(`Kurs USD: efektywny z opłaconych transz`);
    } else if (itemUsdRate != null) {
      lines.push(`Kurs USD: z pozycji (${itemUsdRate.toFixed(4)})`);
    } else if (usdToPlnRate != null) {
      lines.push(`Kurs USD: z nagłówka zamówienia (${usdToPlnRate.toFixed(4)})`);
    }
  }
  if (unitPriceCny != null && unitPriceCny > 0) {
    const rate = effectiveTrancheCny ?? itemCnyRate ?? cnyToPlnRate ?? 0;
    lines.push(
      `Zakup: ${unitPriceCny.toFixed(2)} CNY × ${rate.toFixed(4)} zł/CNY = ${(unitPriceCny * rate).toFixed(2)} zł/szt`,
    );
  }
  lines.push(`= ${displayedPln.toFixed(2)} zł/szt`);
  if (priceMode === "brutto") {
    lines.push(`Wyświetlane: brutto (VAT ${(vatRate * 100).toFixed(0)}%)`);
  } else {
    lines.push(`Wyświetlane: netto`);
  }

  // Pokazuj breakdown tylko gdy NIE ma historii cen — żeby nie dublować popoverów.
  void lines; // breakdown niepotrzebny — popover historii pokrywa oba przypadki

  // Wspólne propsy dla obu wariantów PriceCellWithHistory (read-only i editable).
  const cellCurrentProps = {
    currentNetto: nettoPerUnitPln > 0 ? nettoPerUnitPln : null,
    vatRate,
    currentUnitPriceUsd: unitPriceUsd,
    currentQty: itemQty,
    currentSource: "Cena z tego zamówienia",
  };

  // Inline mode — bez <td>, zwracamy samą zawartość do układu „formuła".
  if (inline) {
    if (!editable) {
      return (
        <PriceCellWithHistory
          history={priceHistory}
          kind="purchase"
          {...cellCurrentProps}
        >
          {shown}
        </PriceCellWithHistory>
      );
    }
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex items-baseline rounded px-0.5 hover:bg-muted/40 transition-colors cursor-pointer">
          <PriceCellWithHistory
            history={priceHistory}
            kind="purchase"
            {...cellCurrentProps}
          >
            {shown}
          </PriceCellWithHistory>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <PurchasePriceEditor
            itemId={itemId}
            initialCny={unitPriceCny}
            initialUsd={unitPriceUsd}
            initialCnyRate={itemCnyRate}
            initialUsdRate={itemUsdRate}
            orderCnyRate={cnyToPlnRate}
            orderUsdRate={usdToPlnRate}
            effectiveTrancheUsd={effectiveTrancheUsd}
            effectiveTrancheCny={effectiveTrancheCny}
            vatRate={vatRate}
            priceMode={priceMode}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    );
  }

  if (!editable) {
    return (
      <td className="text-right px-1.5 py-1.5 tabular-nums whitespace-nowrap border-l">
        <PriceCellWithHistory
          history={priceHistory}
          kind="purchase"
          {...cellCurrentProps}
        >
          {shown}
        </PriceCellWithHistory>
      </td>
    );
  }

  return (
    <td className="p-0 border-l">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="w-full h-7 text-right text-xs tabular-nums px-2 hover:bg-muted/40 transition-colors cursor-pointer">
          <PriceCellWithHistory
            history={priceHistory}
            kind="purchase"
            {...cellCurrentProps}
          >
            {shown}
          </PriceCellWithHistory>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <PurchasePriceEditor
            itemId={itemId}
            initialCny={unitPriceCny}
            initialUsd={unitPriceUsd}
            initialCnyRate={itemCnyRate}
            initialUsdRate={itemUsdRate}
            orderCnyRate={cnyToPlnRate}
            orderUsdRate={usdToPlnRate}
            effectiveTrancheUsd={effectiveTrancheUsd}
            effectiveTrancheCny={effectiveTrancheCny}
            vatRate={vatRate}
            priceMode={priceMode}
            onClose={() => setOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </td>
  );
}

function PurchasePriceEditor({
  itemId,
  initialCny,
  initialUsd,
  initialCnyRate,
  initialUsdRate,
  orderCnyRate,
  orderUsdRate,
  effectiveTrancheUsd,
  effectiveTrancheCny,
  vatRate,
  priceMode,
  onClose,
}: {
  itemId: string;
  initialCny: number | null;
  initialUsd: number | null;
  initialCnyRate: number | null;
  initialUsdRate: number | null;
  orderCnyRate: number | null;
  orderUsdRate: number | null;
  effectiveTrancheUsd: number | null;
  effectiveTrancheCny: number | null;
  vatRate: number;
  priceMode: PriceMode;
  onClose: () => void;
}) {
  const [cny, setCny] = useState(initialCny != null ? String(initialCny) : "");
  const [usd, setUsd] = useState(initialUsd != null ? String(initialUsd) : "");
  const [cnyRate, setCnyRate] = useState(
    initialCnyRate != null
      ? String(initialCnyRate)
      : orderCnyRate != null
        ? String(orderCnyRate)
        : "",
  );
  const [usdRate, setUsdRate] = useState(
    initialUsdRate != null
      ? String(initialUsdRate)
      : orderUsdRate != null
        ? String(orderUsdRate)
        : "",
  );
  const [pending, startTransition] = useTransition();

  function saveCny() {
    const n = cny.trim();
    if (n === String(initialCny ?? "")) return;
    startTransition(async () => {
      try {
        await updateOrderItemAction(itemId, {
          unitPriceCny: n === "" ? null : n,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveUsd() {
    const n = usd.trim();
    if (n === String(initialUsd ?? "")) return;
    startTransition(async () => {
      try {
        await updateOrderItemAction(itemId, {
          unitPriceUsd: n === "" ? null : n,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveCnyRate() {
    const n = cnyRate.trim();
    const parsed = n === "" ? null : Number(n);
    if (n === String(initialCnyRate ?? "")) return;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    startTransition(async () => {
      try {
        await updateOrderItemAction(itemId, {
          cnyToPlnRate: n === "" ? null : n,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveUsdRate() {
    const n = usdRate.trim();
    const parsed = n === "" ? null : Number(n);
    if (n === String(initialUsdRate ?? "")) return;
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return;
    startTransition(async () => {
      try {
        await updateOrderItemAction(itemId, {
          usdToPlnRate: n === "" ? null : n,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function confirmAll() {
    const patch: Record<string, string | null> = {};
    const cnyTrim = cny.trim();
    const usdTrim = usd.trim();
    const cnyRateTrim = cnyRate.trim();
    const usdRateTrim = usdRate.trim();
    if (cnyTrim !== String(initialCny ?? "")) {
      patch.unitPriceCny = cnyTrim === "" ? null : cnyTrim;
    }
    if (usdTrim !== String(initialUsd ?? "")) {
      patch.unitPriceUsd = usdTrim === "" ? null : usdTrim;
    }
    if (cnyRateTrim !== String(initialCnyRate ?? "")) {
      patch.cnyToPlnRate = cnyRateTrim === "" ? null : cnyRateTrim;
    }
    if (usdRateTrim !== String(initialUsdRate ?? "")) {
      patch.usdToPlnRate = usdRateTrim === "" ? null : usdRateTrim;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    startTransition(async () => {
      try {
        await updateOrderItemAction(itemId, patch);
        toast.success("Zapisano cenę zakupu");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const cnyNum = Number(cny) || 0;
  const usdNum = Number(usd) || 0;
  // Per-item kurs nadpisuje kurs z nagłówka
  const rateCny =
    cnyRate !== "" ? Number(cnyRate) || 0 : orderCnyRate ?? 0;
  const rateUsd =
    usdRate !== "" ? Number(usdRate) || 0 : orderUsdRate ?? 0;
  // Tranche-derived effective rate ma priorytet (to faktyczny kurs po jakim opłaciliśmy)
  const effRateCny = effectiveTrancheCny ?? rateCny;
  const effRateUsd = effectiveTrancheUsd ?? rateUsd;
  const fromCnyPln = cnyNum * effRateCny;
  const fromUsdPln = usdNum * effRateUsd;
  // USD ma priorytet jeśli ustawione. Cena zakupu zawsze jako netto — VAT dolicza Polska.
  const activePln = usdNum > 0 ? fromUsdPln : fromCnyPln;
  const finalNetto = activePln;
  const finalBrutto = activePln * (1 + vatRate);
  const displayValue = priceMode === "netto" ? finalNetto : finalBrutto;

  const cnyHasRate = effRateCny > 0;
  const usdHasRate = effRateUsd > 0;

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium">Cena zakupu / sztuka</div>

      <div className="space-y-2">
        <CurrencyBlock
          label="CNY"
          symbol="¥"
          amountValue={cny}
          onAmountChange={setCny}
          onAmountBlur={saveCny}
          rateValue={cnyRate}
          onRateChange={setCnyRate}
          onRateBlur={saveCnyRate}
          orderRate={orderCnyRate}
          hasOwnRate={initialCnyRate != null}
          rateActive={effRateCny}
          tranchesRate={effectiveTrancheCny}
          computedPln={fromCnyPln}
          pending={pending}
          dimmed={usdNum > 0}
          noRate={!cnyHasRate}
        />
        <CurrencyBlock
          label="USD"
          symbol="$"
          amountValue={usd}
          onAmountChange={setUsd}
          onAmountBlur={saveUsd}
          rateValue={usdRate}
          onRateChange={setUsdRate}
          onRateBlur={saveUsdRate}
          orderRate={orderUsdRate}
          hasOwnRate={initialUsdRate != null}
          rateActive={effRateUsd}
          tranchesRate={effectiveTrancheUsd}
          computedPln={fromUsdPln}
          pending={pending}
          dimmed={usdNum === 0 && cnyNum > 0}
          noRate={!usdHasRate}
        />
      </div>

      <div className="border-t pt-2 space-y-0.5 text-xs">
        <div className="text-muted-foreground">
          Aktywna:{" "}
          <strong>{usdNum > 0 ? "USD" : cnyNum > 0 ? "CNY" : "—"}</strong>
          {" · "}
          {finalNetto.toFixed(2)} zł netto + VAT {(vatRate * 100).toFixed(0)}% ={" "}
          {finalBrutto.toFixed(2)} zł brutto
        </div>
        <div className="text-base font-heading font-bold tabular-nums">
          = {displayValue.toFixed(2)} zł {priceMode}
        </div>
        <div className="text-[10px] text-muted-foreground italic">
          Przełącznik Brutto/Netto u góry tabeli decyduje którą wartość pokazujemy.
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={pending}
          className="h-7 px-3 text-xs"
        >
          Anuluj
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={confirmAll}
          disabled={pending}
          className="h-7 px-3 text-xs"
        >
          {pending ? "Zapisuję…" : "Zatwierdź"}
        </Button>
      </div>
    </div>
  );
}

function CurrencyBlock({
  label,
  symbol,
  amountValue,
  onAmountChange,
  onAmountBlur,
  rateValue,
  onRateChange,
  onRateBlur,
  orderRate,
  hasOwnRate,
  rateActive,
  tranchesRate,
  computedPln,
  pending,
  dimmed,
  noRate,
}: {
  label: string;
  symbol: string;
  amountValue: string;
  onAmountChange: (v: string) => void;
  onAmountBlur: () => void;
  rateValue: string;
  onRateChange: (v: string) => void;
  onRateBlur: () => void;
  orderRate: number | null;
  hasOwnRate: boolean;
  rateActive: number;
  tranchesRate: number | null;
  computedPln: number;
  pending: boolean;
  dimmed: boolean;
  noRate: boolean;
}) {
  const hasTranchesRate = tranchesRate != null && tranchesRate > 0;

  return (
    <div
      className={cn(
        "rounded-md ring-1 ring-border p-2 space-y-1.5",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-10">{label}</span>
        <span className="text-sm">{symbol}</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          value={amountValue}
          onChange={(e) => onAmountChange(e.target.value)}
          onBlur={onAmountBlur}
          disabled={pending}
          className="h-7 text-xs"
          placeholder="0"
        />
      </div>
      <div className="flex items-center gap-2 pl-12">
        <span className="text-[11px] text-muted-foreground">× kurs</span>
        <Input
          type="number"
          step="0.0001"
          min="0"
          value={rateValue}
          onChange={(e) => onRateChange(e.target.value)}
          onBlur={onRateBlur}
          disabled={pending || hasTranchesRate}
          className={cn(
            "h-6 text-[11px] w-24 tabular-nums",
            hasTranchesRate && "opacity-50",
          )}
          placeholder={
            orderRate != null && orderRate > 0
              ? `${orderRate.toFixed(4)} (wstępny)`
              : "0.0000"
          }
        />
        {hasOwnRate && !hasTranchesRate && (
          <span
            className="text-[10px] text-emerald-700"
            title="Kurs nadpisany na pozycji (różny od nagłówka)"
          >
            ✓ własny
          </span>
        )}
      </div>
      {hasTranchesRate && (
        <div className="flex items-start gap-1 pl-12 text-[10px] text-emerald-700 bg-emerald-50 -mx-2 px-2 py-1 rounded">
          <span className="font-medium">↻ Efektywny z opłaconych transz:</span>
          <span className="tabular-nums font-bold">
            {tranchesRate.toFixed(4)} PLN/{label}
          </span>
        </div>
      )}
      <div className="text-[11px] text-muted-foreground tabular-nums pl-12">
        {noRate ? (
          <span className="text-amber-700">
            Wpisz kurs aby przeliczyć na PLN
          </span>
        ) : (
          <>
            ={" "}
            <strong className="text-foreground">
              {computedPln.toFixed(2)} zł
            </strong>{" "}
            netto
            {rateActive > 0 && (
              <span> (= {rateActive.toFixed(4)} PLN za 1 {label})</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Ilość: read-only albo inline editable (PLANOWANE/DOGADYWANE) ───

function QuantityCell({
  itemId,
  quantity,
  editable,
}: {
  itemId: string;
  quantity: number;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState(String(quantity));
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset value when quantity changes z zewnątrz (optimistic UI).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(String(quantity));
  }, [quantity]);

  // Focus + select on open (z preventScroll żeby strona nie skakała).
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus({ preventScroll: true });
          el.select();
        }
      });
    }
  }, [open]);

  function handleSave() {
    const n = Number(local);
    if (!Number.isFinite(n) || n < 1) {
      setLocal(String(quantity));
      setOpen(false);
      return;
    }
    const rounded = Math.round(n);
    if (rounded === quantity) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      try {
        await updateOrderItemAction(itemId, { quantity: rounded });
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  // Wyświetlana wartość — pogrubiona, z subscript „szt." (spójnie z resztą).
  const display = (
    <span className="font-bold tabular-nums">
      {quantity.toLocaleString("pl-PL")}
      <SztSuffix />
    </span>
  );

  if (!editable) {
    return (
      <td className="text-right px-1.5 py-1.5 whitespace-nowrap">{display}</td>
    );
  }

  return (
    <td className="text-right px-1.5 py-1.5 whitespace-nowrap">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="inline-flex items-baseline rounded px-1 -mx-1 hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-colors cursor-pointer"
              aria-label="Edytuj ilość"
            >
              {display}
            </button>
          }
        />
        <PopoverContent
          className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 min-w-[220px] z-[200]"
          align="end"
          sideOffset={6}
        >
          <div className="mb-1.5 flex items-baseline gap-2 px-1">
            <span className="font-semibold text-[11px]">Ilość zamówienia</span>
            <span className="text-[10px] text-muted-foreground">szt.</span>
          </div>
          <div className="px-1 mb-1.5">
            <div className="flex items-baseline gap-1">
              <Input
                ref={inputRef}
                type="number"
                step="1"
                min="0"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                disabled={pending}
                placeholder="1"
                className="h-7 text-xs tabular-nums px-1.5"
              />
              <span className="text-[10px] text-muted-foreground">szt.</span>
            </div>
          </div>
          <div className="px-1 flex items-center justify-end gap-2 pt-1 border-t">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setLocal(String(quantity));
                setOpen(false);
              }}
              disabled={pending}
              className="h-6 text-[10px] px-2"
            >
              Anuluj
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={pending}
              className="h-6 text-[10px] px-2"
            >
              {pending ? "Zapisuję…" : "Zapisz"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </td>
  );
}

function DeleteItemButton({ itemId }: { itemId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Usunąć tę pozycję?")) return;
        startTransition(async () => {
          try {
            await deleteOrderItemAction(itemId);
            toast.success("Usunięto");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Nie udało się");
          }
        });
      }}
      className="size-6 rounded hover:bg-destructive/10 grid place-items-center"
      aria-label="Usuń"
    >
      <Trash2 className="size-3 text-destructive" />
    </button>
  );
}

// ─── Modal: wytyczne produkcyjne ─────────────────────────────────────

function GuidelinesModal({
  item,
  onClose,
}: {
  item: Item | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Wytyczne i instrukcja — {item?.product.name}
          </DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {GUIDELINE_SECTIONS.map((s) => {
              const content = getGuidelineContent(item, s.kind);
              return (
                <section key={s.kind} className="space-y-1.5">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    {s.label}
                    {content ? (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded px-1.5 py-0.5">
                        uzupełnione
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground bg-muted ring-1 ring-border rounded px-1.5 py-0.5">
                        puste
                      </span>
                    )}
                  </h3>
                  {content ? (
                    <div className="text-sm whitespace-pre-wrap p-3 rounded-md bg-muted/40">
                      {content}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Brak — uzupełnij w edycji produktu.
                    </p>
                  )}
                </section>
              );
            })}
            <div className="flex justify-end pt-1">
              <a
                href={`/produkty/${item.product.id}/edytuj`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                Otwórz edycję produktu
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: kod kreskowy (EAN13 / CODE128) ──────────────────────────

function BarcodeModal({
  state,
  onClose,
}: {
  state: { item: Item; format: "EAN13" | "CODE128" } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {state && <BarcodeBody item={state.item} format={state.format} />}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Zamknij
          </Button>
          <Button
            type="button"
            onClick={() => window.print()}
            className="gap-2"
          >
            Drukuj / Zapisz PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BarcodeBody({
  item,
  format,
}: {
  item: Item;
  format: "EAN13" | "CODE128";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState<string | null>(null);

  const data =
    format === "EAN13"
      ? item.product.eanCode ?? ""
      : sanitizeAscii(item.product.code128 ?? "");
  const validationError =
    format === "EAN13" && !/^\d{13}$/.test(data)
      ? "EAN-13 wymaga 13 cyfr w polu Kod EAN."
      : !data
        ? format === "CODE128"
          ? 'Brak kodu CODE-128 — uzupełnij pole „CODE128" w danych produktu.'
          : "Brak danych do wygenerowania kodu."
        : null;

  useEffect(() => {
    if (!svgRef.current || !data || validationError) {
      setError(null);
      return;
    }
    try {
      JsBarcode(svgRef.current, data, {
        format,
        displayValue: true,
        fontSize: 16,
        margin: 8,
        height: 70,
        width: 2,
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Błąd generowania";
      setError(`JsBarcode: ${msg}`);
    }
  }, [data, format, validationError]);

  const finalError = validationError ?? error;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {format === "EAN13" ? "Kod EAN-13" : "Code 128"} — {item.product.name}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        {finalError ? (
          <Alert variant="destructive">
            <AlertDescription>{finalError}</AlertDescription>
          </Alert>
        ) : (
          <div className="print-label-container bg-white p-4 ring-1 ring-border rounded-md flex flex-col items-center gap-2">
            <div className="font-semibold text-sm text-center">
              {item.product.name}
            </div>
            <code className="text-xs text-muted-foreground">
              {item.product.productCode}
            </code>
            <svg ref={svgRef} />
          </div>
        )}
      </div>
    </>
  );
}

function sanitizeAscii(input: string): string {
  if (!input) return "";
  const map: Record<string, string> = {
    ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
    Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
  };
  return input
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^\x20-\x7E]/g, "");
}

// ─── Konwersje netto/brutto ─────────────────────────────────────────

// KONWENCJA: w bazie wszystkie kwoty na ItemSaleChannel zapisane są jako NETTO
// (zgodnie z systemową konwencją „wszędzie wpisujemy netto, brutto liczone
// w renderze przez × 1.23"). toMode konwertuje stored netto → display, fromMode
// konwertuje display → stored netto.
function toMode(netto: number, mode: PriceMode, vat: number): number {
  if (mode === "brutto") return netto * (1 + vat);
  return netto;
}

function fromMode(displayed: number, mode: PriceMode, vat: number): number {
  if (mode === "brutto") return displayed / (1 + vat);
  return displayed;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtPln(n: number): string {
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}


function fmtPlnShort(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  return n.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
}

/**
 * Smart format dla kwot per szt w tabeli: integer → "10", float → "18.45".
 * Pomija końcówkę `.00` żeby zmniejszyć szum wizualny w gęstej tabeli.
 * Zaokrąglamy do 2 miejsc PRZED sprawdzeniem integer-a, żeby błąd float
 * (289.0001 → "289.00") nie psuł skrótu.
 */
function fmtMoneyShort(n: number): string {
  if (n === 0) return "0";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}

/** Mały znacznik „zł" obok kwoty — spójny styl w całej tabeli. */
function ZlSuffix() {
  return <span className="text-[9px] opacity-50 ml-0.5">zł</span>;
}

/** Mały znacznik „szt." obok ilości. */
function SztSuffix() {
  return <span className="text-[8px] opacity-50 ml-0.5">szt.</span>;
}


// ─── Add dialog (4-kolumnowy bulk picker z katalogu) ─────────────────

function AddItemDialog({
  open,
  onClose,
  orderId,
  products,
  categories,
  alreadyInOrderProductIds,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  products: ProductOption[];
  categories: CategoryItem[];
  /** Produkty już w zamówieniu — wyszarzone i zablokowane do zaznaczenia. */
  alreadyInOrderProductIds: Set<string>;
}) {
  const [pending, startTransition] = useTransition();
  const [l1Id, setL1Id] = useState<string | null>(null);
  const [l2Id, setL2Id] = useState<string | null>(null);
  const [l3Id, setL3Id] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState<string>("1");
  const [query, setQuery] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | "product" | "component"
  >("all");

  // Reset stanu przy każdym otwarciu
  useEffect(() => {
    if (open) {
      setL1Id(null);
      setL2Id(null);
      setL3Id(null);
      setSelectedIds(new Set());
      setQuantity("1");
      setQuery("");
      setTypeFilter("all");
    }
  }, [open]);

  // Drzewo kategorii
  const childrenOf = new Map<string | null, CategoryItem[]>();
  for (const c of categories) {
    const k = c.parentId ?? null;
    childrenOf.set(k, [...(childrenOf.get(k) ?? []), c]);
  }
  const level1 = childrenOf.get(null) ?? [];
  const level2 = l1Id ? (childrenOf.get(l1Id) ?? []) : [];
  const level3 = l2Id ? (childrenOf.get(l2Id) ?? []) : [];

  // Najbardziej szczegółowa wybrana kategoria
  const selectedCatId = l3Id ?? l2Id ?? l1Id;

  // Descendant set wybranej kategorii (włącznie z nią samą)
  function descendantsOf(catId: string): Set<string> {
    const result = new Set<string>([catId]);
    const stack = [catId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const c of childrenOf.get(id) ?? []) {
        if (!result.has(c.id)) {
          result.add(c.id);
          stack.push(c.id);
        }
      }
    }
    return result;
  }
  const allowedCategoryIds = selectedCatId
    ? descendantsOf(selectedCatId)
    : null;

  // Produkty pasujące do filtrów (kategoria + typ + search)
  const filteredProducts = products.filter((p) => {
    if (
      allowedCategoryIds &&
      (!p.categoryId || !allowedCategoryIds.has(p.categoryId))
    ) {
      return false;
    }
    if (typeFilter === "product" && p.isComponent) return false;
    if (typeFilter === "component" && !p.isComponent) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay =
        `${p.name} ${p.productCode} ${p.code128 ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  function toggleProduct(id: string) {
    // Blokuj zaznaczenie produktów już w zamówieniu.
    if (alreadyInOrderProductIds.has(id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredProducts) next.add(p.id);
      return next;
    });
  }
  function deselectAll() {
    setSelectedIds(new Set());
  }

  function onSubmit() {
    if (selectedIds.size === 0) {
      toast.error("Zaznacz przynajmniej jeden produkt");
      return;
    }
    const qty = Math.max(1, Math.trunc(Number(quantity) || 1));
    startTransition(async () => {
      let added = 0;
      let failed = 0;
      for (const productId of selectedIds) {
        try {
          await addOrderItemAction(orderId, {
            productId,
            quantity: String(qty),
          });
          added++;
        } catch {
          failed++;
        }
      }
      if (added > 0) {
        toast.success(
          failed === 0
            ? `Dodano ${added} ${added === 1 ? "pozycję" : "pozycji"}`
            : `Dodano ${added}, nie udało się ${failed}`,
        );
      } else {
        toast.error("Nie udało się dodać pozycji");
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[min(98vw,1400px)] sm:!max-w-[min(98vw,1400px)] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Dodaj pozycje z katalogu</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Input
              placeholder="Szukaj po nazwie, kodzie lub code 128…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="inline-flex rounded-lg ring-1 ring-border bg-card p-0.5 gap-0.5">
            {(
              [
                { id: "all", label: "Wszystko" },
                { id: "product", label: "Produkty" },
                { id: "component", label: "Komponenty" },
              ] as { id: typeof typeFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  typeFilter === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4-kolumnowy picker — 3 kolumny kategorii + lista produktów */}
        <div className="flex-1 min-h-0 flex divide-x">
          <CategoryColumn
            title="Kategoria główna"
            cats={level1}
            selectedId={l1Id}
            onSelect={(id) => {
              setL1Id(id);
              setL2Id(null);
              setL3Id(null);
            }}
            showAll
            allLabel="Wszystkie produkty"
            onSelectAll={() => {
              setL1Id(null);
              setL2Id(null);
              setL3Id(null);
            }}
            isAllActive={l1Id === null}
          />
          <CategoryColumn
            title="Podkategoria"
            cats={level2}
            selectedId={l2Id}
            onSelect={(id) => {
              setL2Id(id);
              setL3Id(null);
            }}
            emptyLabel={l1Id ? "Brak podkategorii" : "Wybierz kategorię"}
          />
          <CategoryColumn
            title="Typ produktu"
            cats={level3}
            selectedId={l3Id}
            onSelect={setL3Id}
            emptyLabel={l2Id ? "Brak typów" : "Wybierz podkategorię"}
          />

          {/* Lista produktów */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Produkty ({filteredProducts.length})
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  disabled={filteredProducts.length === 0}
                  className="text-[10px] text-primary hover:underline disabled:opacity-40"
                >
                  Zaznacz widoczne
                </button>
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-[10px] text-muted-foreground">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Odznacz wszystko
                    </button>
                  </>
                )}
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto divide-y">
              {filteredProducts.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">
                  Brak produktów w wybranej kategorii.
                </li>
              ) : (
                filteredProducts.map((p) => {
                  const isSelected = selectedIds.has(p.id);
                  const isInOrder = alreadyInOrderProductIds.has(p.id);
                  return (
                    <li
                      key={p.id}
                      onClick={() => toggleProduct(p.id)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 transition-colors",
                        isInOrder
                          ? "bg-slate-100/60 opacity-50 cursor-not-allowed"
                          : isSelected
                            ? "bg-primary/5 hover:bg-primary/10 cursor-pointer"
                            : "hover:bg-muted/40 cursor-pointer",
                      )}
                      title={
                        isInOrder
                          ? "Ten produkt jest już w zamówieniu — edytuj ilość istniejącej pozycji."
                          : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isInOrder}
                        onChange={() => toggleProduct(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 accent-primary shrink-0"
                      />
                      {p.images[0]?.thumbnailWebpUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.images[0].thumbnailWebpUrl}
                          alt={p.images[0].alt ?? p.name}
                          width={40}
                          height={40}
                          loading="lazy"
                          decoding="async"
                          className="size-10 rounded object-cover bg-muted shrink-0 ring-1 ring-border"
                        />
                      ) : (
                        <div className="size-10 rounded bg-muted shrink-0 ring-1 ring-border" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {p.name}
                          </span>
                          {p.isComponent && (
                            <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ring-1 bg-violet-100 text-violet-800 ring-violet-200">
                              komponent
                            </span>
                          )}
                          {isInOrder && (
                            <span className="inline-flex items-center rounded px-1 py-0 text-[9px] font-medium ring-1 bg-amber-100 text-amber-800 ring-amber-200">
                              już w zamówieniu
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums flex gap-2 mt-0.5">
                          <code>{p.productCode}</code>
                          {p.code128 && <code>{p.code128}</code>}
                          {p.unitsPerBox != null && (
                            <span>{p.unitsPerBox} szt/krt</span>
                          )}
                          {p.cbmPerUnit != null && (
                            <span>{p.cbmPerUnit.toFixed(4)} m³/szt</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/20 flex items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 text-sm">
            <span>
              Wybrano: <strong className="tabular-nums">{selectedIds.size}</strong>
            </span>
            <span className="text-muted-foreground">·</span>
            <Label
              htmlFor="bulk-qty"
              className="text-sm font-normal whitespace-nowrap"
            >
              Sztuk na każdą pozycję:
            </Label>
            <Input
              id="bulk-qty"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-8 w-20 tabular-nums"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              type="button"
              onClick={onSubmit}
              disabled={pending || selectedIds.size === 0}
            >
              {pending
                ? "Dodaję…"
                : `Dodaj ${selectedIds.size > 0 ? selectedIds.size : ""} ${selectedIds.size === 1 ? "pozycję" : "pozycji"}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryColumn({
  title,
  cats,
  selectedId,
  onSelect,
  emptyLabel,
  showAll,
  allLabel,
  onSelectAll,
  isAllActive,
}: {
  title: string;
  cats: CategoryItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyLabel?: string;
  showAll?: boolean;
  allLabel?: string;
  onSelectAll?: () => void;
  isAllActive?: boolean;
}) {
  return (
    <div className="w-[200px] min-w-[200px] flex flex-col">
      <div className="px-3 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {showAll && (
          <li>
            <button
              type="button"
              onClick={onSelectAll}
              className={cn(
                "w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors border-b",
                isAllActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted/40",
              )}
            >
              <span>{allLabel ?? "Wszystkie"}</span>
            </button>
          </li>
        )}
        {cats.length === 0 ? (
          <li className="px-3 py-6 text-xs text-muted-foreground text-center italic">
            {emptyLabel ?? "—"}
          </li>
        ) : (
          cats.map((c) => {
            const isActive = selectedId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted/40",
                  )}
                >
                  <span className="flex-1 min-w-0 truncate">{c.name}</span>
                  <span
                    className={cn(
                      "text-[10px] tabular-nums rounded-full px-1.5 py-0 ring-1 shrink-0",
                      isActive
                        ? "bg-primary/15 text-primary ring-primary/30"
                        : "bg-muted text-muted-foreground ring-border",
                    )}
                  >
                    {c.productCount}
                  </span>
                  {isActive && (
                    <span className="text-primary text-xs">›</span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

// ─── Edit dialog ─────────────────────────────────────────────────────

function EditItemDialog({
  item,
  onClose,
}: {
  item: Item | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {item && <EditItemForm key={item.id} item={item} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditItemForm({
  item,
  onClose,
}: {
  item: Item;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [pieces, setPieces] = useState<string>(String(item.quantity));

  const upb = item.product.unitsPerBox ?? null;
  const boxes = upb && Number(pieces) > 0 ? Number(pieces) / upb : null;

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    payload.quantity = pieces;
    startTransition(async () => {
      try {
        await updateOrderItemAction(item.id, payload);
        toast.success("Zapisano");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{item.product.name}</DialogTitle>
        {upb && (
          <p className="text-xs text-muted-foreground">{upb} szt w kartonie</p>
        )}
      </DialogHeader>
      <form action={onSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {upb && (
            <div className="space-y-2">
              <Label htmlFor="boxes">Kartonów</Label>
              <Input
                id="boxes"
                type="number"
                step="1"
                min="0"
                value={boxes != null ? Math.round(boxes).toString() : ""}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0) {
                    setPieces(String(Math.round(n * upb)));
                  }
                }}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="quantity">Sztuk</Label>
            <Input
              id="quantity"
              type="number"
              step="1"
              min="1"
              value={pieces}
              onChange={(e) => setPieces(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cbmPerUnit">CBM / sztuka</Label>
            <Input
              id="cbmPerUnit"
              name="cbmPerUnit"
              type="number"
              step="0.0001"
              defaultValue={item.cbmPerUnit ?? ""}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="unitPriceCny">Cena fabryczna ¥</Label>
            <Input
              id="unitPriceCny"
              name="unitPriceCny"
              type="number"
              step="0.01"
              defaultValue={item.unitPriceCny ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unitPriceUsd">Cena fabryczna $</Label>
            <Input
              id="unitPriceUsd"
              name="unitPriceUsd"
              type="number"
              step="0.01"
              defaultValue={item.unitPriceUsd ?? ""}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="expectedMonthlySales">Sprzedaż mc (szt)</Label>
          <Input
            id="expectedMonthlySales"
            name="expectedMonthlySales"
            type="number"
            defaultValue={item.expectedMonthlySales ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notatki</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={item.notes ?? ""}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Zapisuję…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ─── Grupowanie po kategorii ────────────────────────────────────────

type CategoryNode = {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  parent: {
    id: string;
    name: string;
    level: number;
    parent: { id: string; name: string; level: number } | null;
  } | null;
};

/**
 * Wyznacza nazwę kategorii głównej (L1) i podkategorii (L2) dla produktu
 * z dowolnego poziomu (1/2/3). Produkty L3 dziedziczą L1 i L2 od przodków.
 */
function getCategoryGroupLabels(category: CategoryNode | null): {
  l1Name: string | null;
  l2Name: string | null;
} {
  if (!category) return { l1Name: null, l2Name: null };
  // Walk up: dla każdego poziomu znajdź odpowiednią kategorię
  if (category.level === 1) {
    return { l1Name: category.name, l2Name: null };
  }
  if (category.level === 2) {
    return {
      l1Name: category.parent?.name ?? category.name,
      l2Name: category.name,
    };
  }
  // level 3 — parent jest L2, parent.parent to L1
  return {
    l1Name: category.parent?.parent?.name ?? category.parent?.name ?? null,
    l2Name: category.parent?.name ?? null,
  };
}

function CategoryHeaderRow({
  level,
  label,
}: {
  level: 1 | 2;
  label: string;
}) {
  if (level === 1) {
    return (
      <tr className="bg-violet-100 sticky">
        <td
          colSpan={999}
          className="px-3 py-2 text-sm font-bold text-violet-900 uppercase tracking-wide border-y-2 border-violet-300"
        >
          📂 {label}
        </td>
      </tr>
    );
  }
  return (
    <tr className="bg-indigo-50/60">
      <td
        colSpan={999}
        className="px-6 py-1.5 text-xs font-semibold text-indigo-800 uppercase tracking-wide border-y border-indigo-200"
      >
        ↳ {label}
      </td>
    </tr>
  );
}

// ─── Podsumowanie kolumn (tfoot) ────────────────────────────────────

function TableFooterTotals({
  items,
  calc,
  priceMode,
  vatRate,
  channelView,
  isPoland = false,
}: {
  items: Item[];
  calc: ContainerResult;
  priceMode: PriceMode;
  vatRate: number;
  channelView: "all" | "Allegro" | "Sklep";
  isPoland?: boolean;
}) {
  // Sum across all items (calc.items[] runs parallel to original items prop).
  // Sumy są zawsze tymi samymi liczbami niezależnie od kolejności wierszy.
  let totalQty = 0;
  let totalCbm = 0;
  let totalLandedNetto = 0;
  let totalLogisticsNetto = 0;
  let totalProwizjaNetto = 0;
  let totalCloNetto = 0;
  let totalShippingNetto = 0;
  let totalFulfillmentNetto = 0;
  let totalPackagingNetto = 0;
  let allegroRevenueNetto = 0;
  let allegroProfitNetto = 0;
  let sklepRevenueNetto = 0;
  let sklepProfitNetto = 0;
  let totalInnerKartons = 0;
  let totalMasters = 0;

  // PL: total belek (z fabryki) — sumarycznie po wszystkich kolorach
  // materiałów. Wyświetlamy pod totalQty w stopce. Liczone tylko gdy
  // zamówienie polskie + zawiera materiały (SKU M-*).
  const totalFactoryBolts = isPoland
    ? analyzeBolts(buildMaterialItems(items)).totalBolts
    : 0;

  for (let i = 0; i < calc.items.length; i++) {
    const it = calc.items[i];
    const raw = items[i];
    totalQty += it.quantity;
    totalCbm += it.totalCbm;
    totalLandedNetto += it.landedTotalPln;
    totalLogisticsNetto += it.allocatedLogisticsPln;
    totalProwizjaNetto += it.allocatedBrokerCommissionPln;
    totalCloNetto += it.customsDutyPln;
    // Wysyłka/Fulfillment/Karton — wartości są dzielone między Allegro i Sklep
    // (jak w wierszu — allegro first, sklep jako fallback). Mnożymy przez
    // quantity bo w wierszu pokazujemy per-szt.
    const allegro = raw?.saleChannels.find((c) => c.channel === "Allegro");
    const sklep = raw?.saleChannels.find((c) => c.channel === "Sklep");
    const shipPerUnit =
      allegro?.shippingCostPln ?? sklep?.shippingCostPln ?? 0;
    const fulfPerUnit =
      allegro?.fulfillmentPln ?? sklep?.fulfillmentPln ?? 0;
    const pkgPerUnit =
      allegro?.packagingCostPln ?? sklep?.packagingCostPln ?? 0;
    totalShippingNetto += shipPerUnit * it.quantity;
    totalFulfillmentNetto += fulfPerUnit * it.quantity;
    totalPackagingNetto += pkgPerUnit * it.quantity;
    for (const ch of it.channels) {
      if (ch.channel === "Allegro") {
        allegroRevenueNetto += ch.channelRevenue;
        allegroProfitNetto += ch.channelProfit;
      } else if (ch.channel === "Sklep") {
        sklepRevenueNetto += ch.channelRevenue;
        sklepProfitNetto += ch.channelProfit;
      }
    }
  }

  // Master/inner karton totals — wymagają dostępu do pól z `items` (calc.items
  // ma tylko cbmPerUnit / quantity). Liczymy w osobnej pętli, w tej samej
  // kolejności (`items[i]` ⇄ `calc.items[i]`).
  for (const it of items) {
    if (it.product.importMode !== "KARTON") continue;
    const factoryPin =
      it.product.shippingBoxes.find(
        (b) => b.purpose === "FACTORY" && b.isPrimary,
      ) ??
      it.product.shippingBoxes.find((b) => b.purpose === "FACTORY") ??
      null;
    const upb = it.product.unitsPerBox ?? factoryPin?.unitsPerBox ?? null;
    if (upb == null || upb <= 0) continue;
    const innerKartons = Math.ceil(it.quantity / upb);
    totalInnerKartons += innerKartons;
    const inner = it.product.innerBoxesPerMaster;
    if (
      it.product.masterBoxWidthCm != null &&
      it.product.masterBoxHeightCm != null &&
      it.product.masterBoxDepthCm != null &&
      inner != null &&
      inner > 0
    ) {
      const unitsPerMaster = inner * upb;
      if (unitsPerMaster > 0) {
        totalMasters += Math.ceil(it.quantity / unitsPerMaster);
      }
    }
  }

  const totalLanded = toMode(totalLandedNetto, priceMode, vatRate);
  const totalLogistics = toMode(totalLogisticsNetto, priceMode, vatRate);
  const totalProwizja = toMode(totalProwizjaNetto, priceMode, vatRate);
  const totalClo = toMode(totalCloNetto, priceMode, vatRate);
  const totalShipping = toMode(totalShippingNetto, priceMode, vatRate);
  const totalFulfillment = toMode(totalFulfillmentNetto, priceMode, vatRate);
  const totalPackaging = toMode(totalPackagingNetto, priceMode, vatRate);
  const allegroRevenue = toMode(allegroRevenueNetto, priceMode, vatRate);
  const allegroProfit = toMode(allegroProfitNetto, priceMode, vatRate);
  const sklepRevenue = toMode(sklepRevenueNetto, priceMode, vatRate);
  const sklepProfit = toMode(sklepProfitNetto, priceMode, vatRate);

  const allegroMarginPct =
    allegroRevenueNetto > 0
      ? (allegroProfitNetto / allegroRevenueNetto) * 100
      : 0;
  const sklepMarginPct =
    sklepRevenueNetto > 0 ? (sklepProfitNetto / sklepRevenueNetto) * 100 : 0;

  // Przychód i zysk CAŁKOWITE = Allegro + Sklep. Per-kanał revenue/profit
  // uwzględniają `shareOfQty` (split sprzedaży między kanały), więc suma obu = 100% qty.
  const totalRevenueNetto = allegroRevenueNetto + sklepRevenueNetto;
  const totalProfitNetto = allegroProfitNetto + sklepProfitNetto;
  const totalProfit = toMode(totalProfitNetto, priceMode, vatRate);
  const totalMarginPct =
    totalRevenueNetto > 0 ? (totalProfitNetto / totalRevenueNetto) * 100 : 0;

  return (
    <tfoot className="bg-slate-50 border-t-2 border-slate-300 text-xs font-semibold">
      <tr>
        {/* Lp. */}
        <td className="px-1 py-2 text-center text-slate-500"></td>
        {/* Nazwa */}
        <td className="px-2 py-2 text-slate-700 uppercase tracking-wide text-[11px]">
          Σ Razem
        </td>
        {/* Ilość + (PL) suma belek z fabryki */}
        <td className="px-2 py-2 text-right tabular-nums text-slate-900">
          <div className="inline-flex flex-col items-end leading-tight">
            <span>{totalQty.toLocaleString("pl-PL")}</span>
            {totalFactoryBolts > 0 ? (
              <span
                className="text-[9px] font-semibold tabular-nums leading-none text-indigo-700"
                title={`${totalFactoryBolts} belek z fabryki (po wszystkich kolorach materiałów)`}
              >
                {totalFactoryBolts} belek
              </span>
            ) : null}
          </div>
        </td>
        {/* CBM + master/inner totals */}
        <td className="px-2 py-2 text-right tabular-nums text-slate-900">
          <div className="inline-flex flex-col items-end leading-tight">
            <span>{totalCbm.toFixed(2)}</span>
            {totalMasters > 0 ? (
              <span
                className="text-[8px] font-semibold tabular-nums leading-none"
                title={`${totalMasters} kartonów zbiorczych · ${totalInnerKartons} produktowych`}
              >
                <span className="text-orange-700">{totalMasters}</span>
                <span className="text-muted-foreground/50 mx-0.5">·</span>
                <span className="text-slate-500">{totalInnerKartons}</span>
              </span>
            ) : totalInnerKartons > 0 ? (
              <span
                className="text-[8px] text-slate-500 font-semibold tabular-nums leading-none"
                title={`${totalInnerKartons} kartonów produktowych`}
              >
                {totalInnerKartons}
              </span>
            ) : null}
          </div>
        </td>
        {/* Koszty z Chin (5 kolumn) — grid 9-kol identyczny jak nagłówek
            i wiersze body, żeby sumy lądowały dokładnie pod ikonami:
            Factory | + | Handshake | + | Stamp | + | Ship | = | Coins.
            Cena/szt i Suma/szt (sloty 1 i 9) puste — to wartości per szt. */}
        <td colSpan={5} className="px-2 py-2 border-l">
          <span className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-baseline gap-1 w-full text-[10.5px] tabular-nums whitespace-nowrap [&>*]:text-center">
            {/* Cena/szt — per-unit, pomijamy */}
            <span aria-hidden />
            <span aria-hidden className="opacity-0 select-none">+</span>
            {/* Prowizja Σ */}
            <span className="text-amber-700">
              {totalProwizjaNetto > 0 ? (
                <NettoBruttoTooltip
                  nettoValue={totalProwizjaNetto}
                  vatRate={vatRate}
                  label="Prowizja pośrednika"
                  description="Proporcjonalna do wartości pozycji (per-value). Z VAT 23%."
                >
                  {fmtPln(totalProwizja)}
                </NettoBruttoTooltip>
              ) : (
                "—"
              )}
            </span>
            <span aria-hidden className="opacity-0 select-none">+</span>
            {/* Cło Σ — bez VAT */}
            <span className="text-rose-700">
              {totalCloNetto > 0 ? (
                <NettoBruttoTooltip
                  nettoValue={totalCloNetto}
                  vatRate={vatRate}
                  vatExempt
                  label="Cło importowe"
                  description="customsDutyPct × wartość pozycji (per-product). Cło nie podlega VAT."
                >
                  {fmtPln(totalCloNetto)}
                </NettoBruttoTooltip>
              ) : (
                "—"
              )}
            </span>
            <span aria-hidden className="opacity-0 select-none">+</span>
            {/* Logistyka Σ — granatowo, spójnie z kolorem ikony Ship */}
            <span className="text-indigo-900 font-semibold">
              {totalLogisticsNetto > 0 ? (
                <NettoBruttoTooltip
                  nettoValue={totalLogisticsNetto}
                  vatRate={vatRate}
                  label="Logistyka (shared)"
                  description="Transport, kontrola, terminalowe, inne — dzielone proporcjonalnie do CBM."
                >
                  {fmtPln(totalLogistics)}
                </NettoBruttoTooltip>
              ) : (
                "—"
              )}
            </span>
            <span aria-hidden className="opacity-0 select-none">=</span>
            {/* Suma/szt — per-unit, pomijamy */}
            <span aria-hidden />
          </span>
        </td>
        {/* Total — suma landed netto/brutto */}
        <td className="px-1.5 py-2 text-right tabular-nums text-slate-900 border-r text-[10.5px] whitespace-nowrap">
          <NettoBruttoTooltip
            nettoValue={totalLandedNetto}
            vatRate={vatRate}
            label="Σ Total (landed)"
            description="Zakup + prowizja + cło + logistyka."
          >
            {fmtPln(totalLanded)}
          </NettoBruttoTooltip>
        </td>
        {!isPoland && (
          <>
            {/* Wysyłka, Fulfillment — pomijamy (nie sumujemy w tfoot, koszty per szt) */}
            <td className="bg-indigo-50/30"></td>
            <td className="bg-indigo-50/30"></td>
            {/* Karton — Σ packagingCostPln × qty */}
            <td className="px-1.5 py-2 text-right tabular-nums text-slate-700 bg-indigo-50/30 border-r text-[10.5px] whitespace-nowrap">
              {totalPackagingNetto > 0 ? (
                <NettoBruttoTooltip
                  nettoValue={totalPackagingNetto}
                  vatRate={vatRate}
                  label="Karton wysyłkowy"
                  description="Σ per szt × ilość."
                >
                  {fmtPln(totalPackaging)}
                </NettoBruttoTooltip>
              ) : (
                "—"
              )}
            </td>
          </>
        )}
        {!isPoland && channelView !== "Sklep" && (
          <>
            {/* Cena — Σ przychód CAŁKOWITY (Allegro + Sklep, pełne qty × cena) */}
            <td className="px-1.5 py-2 text-right tabular-nums bg-amber-50/30 text-[10.5px] whitespace-nowrap font-semibold text-amber-900">
              {totalRevenueNetto > 0 ? (
                <NettoBruttoTooltip
                  nettoValue={totalRevenueNetto}
                  vatRate={vatRate}
                  label="Przychód całkowity"
                  description={`Allegro: ${Math.round(allegroRevenueNetto).toLocaleString("pl-PL")} zł · Sklep: ${Math.round(sklepRevenueNetto).toLocaleString("pl-PL")} zł (netto). Suma cena × ilość z obu kanałów.`}
                >
                  {fmtPln(toMode(totalRevenueNetto, priceMode, vatRate))}
                </NettoBruttoTooltip>
              ) : (
                "—"
              )}
            </td>
            {/* Prow%, Wysyłka, Inne — pomijamy */}
            <td colSpan={3} className="bg-amber-50/30"></td>
            {/* Zysk — CAŁKOWITY (Allegro + Sklep, pełne qty) */}
            <td
              className={cn(
                "px-1.5 py-2 text-right tabular-nums bg-amber-50/30 text-[10.5px] whitespace-nowrap",
                totalProfit >= 0 ? "text-emerald-700" : "text-rose-700",
              )}
            >
              <NettoBruttoTooltip
                nettoValue={totalProfitNetto}
                vatRate={vatRate}
                label="Zysk całkowity"
                description={`Allegro: ${Math.round(allegroProfitNetto).toLocaleString("pl-PL")} zł · Sklep: ${Math.round(sklepProfitNetto).toLocaleString("pl-PL")} zł (netto). Suma zysków z obu kanałów.`}
              >
                {fmtPln(totalProfit)}
              </NettoBruttoTooltip>
            </td>
            {/* Marża — CAŁKOWITA (Allegro + Sklep) */}
            <td
              className={cn(
                "px-2 py-2 text-right tabular-nums bg-amber-50/30 border-r",
                totalMarginPct >= 15 ? "text-emerald-700" : "text-rose-700",
              )}
              title={`Marża całkowita: zysk ${Math.round(totalProfitNetto).toLocaleString("pl-PL")} zł / przychód ${Math.round(totalRevenueNetto).toLocaleString("pl-PL")} zł (netto)`}
            >
              {totalRevenueNetto > 0
                ? `${totalMarginPct.toFixed(1)}%`
                : "—"}
            </td>
          </>
        )}
        {!isPoland && channelView !== "Allegro" && (
          <>
            {/* Cena — Σ przychód CAŁKOWITY (Allegro + Sklep, pełne qty × cena) */}
            <td className="px-1.5 py-2 text-right tabular-nums bg-emerald-50/30 text-[10.5px] whitespace-nowrap font-semibold text-emerald-900">
              {totalRevenueNetto > 0 ? (
                <NettoBruttoTooltip
                  nettoValue={totalRevenueNetto}
                  vatRate={vatRate}
                  label="Przychód całkowity"
                  description={`Allegro: ${Math.round(allegroRevenueNetto).toLocaleString("pl-PL")} zł · Sklep: ${Math.round(sklepRevenueNetto).toLocaleString("pl-PL")} zł (netto). Suma cena × ilość z obu kanałów.`}
                >
                  {fmtPln(toMode(totalRevenueNetto, priceMode, vatRate))}
                </NettoBruttoTooltip>
              ) : (
                "—"
              )}
            </td>
            {/* Prow%, Wysyłka, Reklama — pomijamy */}
            <td colSpan={3} className="bg-emerald-50/30"></td>
            {/* Zysk — CAŁKOWITY (Allegro + Sklep, pełne qty) */}
            <td
              className={cn(
                "px-1.5 py-2 text-right tabular-nums bg-emerald-50/30 text-[10.5px] whitespace-nowrap",
                totalProfit >= 0 ? "text-emerald-700" : "text-rose-700",
              )}
            >
              <NettoBruttoTooltip
                nettoValue={totalProfitNetto}
                vatRate={vatRate}
                label="Zysk całkowity"
                description={`Allegro: ${Math.round(allegroProfitNetto).toLocaleString("pl-PL")} zł · Sklep: ${Math.round(sklepProfitNetto).toLocaleString("pl-PL")} zł (netto). Suma zysków z obu kanałów.`}
              >
                {fmtPln(totalProfit)}
              </NettoBruttoTooltip>
            </td>
            {/* Marża — CAŁKOWITA (Allegro + Sklep) */}
            <td
              className={cn(
                "px-2 py-2 text-right tabular-nums bg-emerald-50/30 border-r",
                totalMarginPct >= 15 ? "text-emerald-700" : "text-rose-700",
              )}
              title={`Marża całkowita: zysk ${Math.round(totalProfitNetto).toLocaleString("pl-PL")} zł / przychód ${Math.round(totalRevenueNetto).toLocaleString("pl-PL")} zł (netto)`}
            >
              {totalRevenueNetto > 0
                ? `${totalMarginPct.toFixed(1)}%`
                : "—"}
            </td>
          </>
        )}
        {/* Pliki, Akcje */}
        <td colSpan={2}></td>
      </tr>
    </tfoot>
  );
}

// ─── Materiały: parsowanie pozycji do analizy belek ─────────────────

/**
 * Zbiera pozycje typu „materiał" (SKU pasujący do wzorca M-AS/M-KH lub legacy FABRIC) i mapuje
 * je do struktury wymaganej przez `analyzeBolts`. Pozycje które nie są
 * materiałami zostają pominięte.
 */
function buildMaterialItems(items: Item[]): MaterialItem[] {
  const out: MaterialItem[] = [];
  for (const it of items) {
    const parsed = parseMaterialSku(it.product.productCode);
    if (!parsed) continue;
    out.push({
      itemId: it.id,
      sku: it.product.productCode,
      name: it.product.name,
      lengthM: parsed.lengthM,
      color: parsed.color,
      quantity: it.quantity,
      // Preferujemy miniaturkę WebP (5 KB) — fallback na oryginał gdy brak
      // (legacy obrazek sprzed thumbnail feature'a).
      imageUrl:
        it.product.images?.[0]?.thumbnailWebpUrl ??
        it.product.images?.[0]?.url ??
        null,
    });
  }
  return out;
}

// ─── Licznik kategorii / podkategorii ───────────────────────────────

function CategoryBreakdown({ items }: { items: Item[] }) {
  // Group: L1 -> L2 -> { skuCount, qtySum }
  type L2Bucket = { name: string; skuCount: number; qty: number };
  type L1Bucket = {
    name: string;
    skuCount: number;
    qty: number;
    l2s: Map<string, L2Bucket>;
  };
  const byL1 = new Map<string, L1Bucket>();

  let totalSkus = 0;
  let totalQty = 0;

  for (const it of items) {
    totalSkus += 1;
    totalQty += it.quantity;
    const { l1Name, l2Name } = getCategoryGroupLabels(it.product.category);
    const l1Key = l1Name ?? "Bez kategorii";
    const l2Key = l2Name ?? "—";
    let l1 = byL1.get(l1Key);
    if (!l1) {
      l1 = { name: l1Key, skuCount: 0, qty: 0, l2s: new Map() };
      byL1.set(l1Key, l1);
    }
    l1.skuCount += 1;
    l1.qty += it.quantity;
    let l2 = l1.l2s.get(l2Key);
    if (!l2) {
      l2 = { name: l2Key, skuCount: 0, qty: 0 };
      l1.l2s.set(l2Key, l2);
    }
    l2.skuCount += 1;
    l2.qty += it.quantity;
  }

  const l1List = Array.from(byL1.values()).sort((a, b) => b.qty - a.qty);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          📊 Licznik kategorii
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">SKU:</span>
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 px-2 py-0.5 tabular-nums font-semibold">
              {totalSkus}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Sztuk:</span>
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 px-2 py-0.5 tabular-nums font-semibold">
              {totalQty.toLocaleString("pl-PL")}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {l1List.map((l1) => {
          const l2List = Array.from(l1.l2s.values()).sort(
            (a, b) => b.qty - a.qty,
          );
          const qtyShare = totalQty > 0 ? (l1.qty / totalQty) * 100 : 0;
          return (
            <div
              key={l1.name}
              className="rounded-md ring-1 ring-violet-200 bg-violet-50/40 p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-violet-900 uppercase tracking-wide truncate">
                  📂 {l1.name}
                </span>
                <span className="text-[10px] text-violet-700 tabular-nums shrink-0">
                  {qtyShare.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-violet-800">
                <span className="inline-flex items-center gap-1">
                  <span className="text-violet-500">SKU</span>
                  <span className="tabular-nums font-semibold">
                    {l1.skuCount}
                  </span>
                </span>
                <span className="text-violet-300">·</span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-violet-500">szt</span>
                  <span className="tabular-nums font-semibold">
                    {l1.qty.toLocaleString("pl-PL")}
                  </span>
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1 rounded-full bg-violet-100 overflow-hidden">
                <div
                  className="h-full bg-violet-500"
                  style={{ width: `${qtyShare}%` }}
                />
              </div>
              {/* Subcategories */}
              {l2List.length > 0 && (
                <ul className="pt-1 space-y-0.5">
                  {l2List.map((l2) => (
                    <li
                      key={l2.name}
                      className="flex items-center justify-between gap-2 text-[11px] text-indigo-800"
                    >
                      <span className="truncate">↳ {l2.name}</span>
                      <span className="tabular-nums shrink-0 text-indigo-600">
                        {l2.skuCount}× / {l2.qty.toLocaleString("pl-PL")}szt
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Wizualizacja wypełnienia kontenera (SVG) ───────────────────────

function ContainerVisual({
  calc,
  containerCount,
}: {
  calc: ContainerResult;
  containerCount: number;
}) {
  const fillRate = Math.min(calc.fillRate, 1);
  const overflowRate = calc.fillRate > 1 ? calc.fillRate - 1 : 0;
  const fillPct = fillRate * 100;
  const isOverflow = calc.fillRate > 1;
  const isGood = calc.fillRate >= 0.85 && calc.fillRate <= 1;

  // Render up to N containers visually. If more, show "×N" badge on first.
  const visibleContainers = Math.min(containerCount, 3);
  const hiddenContainers = containerCount - visibleContainers;

  const fillColor = isOverflow
    ? "#f59e0b" // amber-500
    : isGood
      ? "#10b981" // emerald-500
      : "#6366f1"; // indigo-500
  const fillColorLight = isOverflow
    ? "#fef3c7"
    : isGood
      ? "#d1fae5"
      : "#e0e7ff";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          🚢 Wizualizacja kontenera
        </h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Wypełnienie:</span>
          <span
            className={cn(
              "px-2 py-0.5 rounded-full font-semibold tabular-nums ring-1",
              isOverflow
                ? "bg-amber-100 text-amber-800 ring-amber-200"
                : isGood
                  ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                  : "bg-indigo-100 text-indigo-800 ring-indigo-200",
            )}
          >
            {(calc.fillRate * 100).toFixed(0)}%
          </span>
          <span className="text-muted-foreground tabular-nums">
            {calc.usedCbm.toFixed(2)} /{" "}
            {calc.totalContainerVolume.toFixed(0)} m³
          </span>
        </div>
      </div>

      <div className="flex items-end justify-center gap-3 py-2 flex-wrap">
        {Array.from({ length: visibleContainers }).map((_, idx) => {
          // Per-container fill: rozłóż wypełnienie po wszystkich kontenerach
          // równomiernie (pierwsze pełne, ostatni częściowy).
          const cbmPerContainer = calc.containerSizeM3;
          const cumUsedBeforeThis = idx * cbmPerContainer;
          const remainingForThis = Math.max(
            0,
            calc.usedCbm - cumUsedBeforeThis,
          );
          const thisFillRate = Math.min(remainingForThis / cbmPerContainer, 1);
          const thisOverflow =
            remainingForThis / cbmPerContainer > 1
              ? remainingForThis / cbmPerContainer - 1
              : 0;
          return (
            <ContainerSvg
              key={idx}
              fillRate={thisFillRate}
              overflowRate={thisOverflow}
              fillColor={fillColor}
              fillColorLight={fillColorLight}
              badge={
                idx === 0 && hiddenContainers > 0
                  ? `+${hiddenContainers} więcej`
                  : null
              }
              label={`#${idx + 1}`}
              containerSizeM3={calc.containerSizeM3}
            />
          );
        })}
      </div>

      {/* Legenda / wskazówki */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-[11px]">
        <LegendStat
          label="Pojemność / 1"
          value={`${calc.containerSizeM3} m³`}
        />
        <LegendStat
          label="Liczba kontenerów"
          value={containerCount.toString()}
        />
        <LegendStat
          label="Użyte CBM"
          value={`${calc.usedCbm.toFixed(2)} m³`}
        />
        <LegendStat
          label="Wolne CBM"
          value={`${Math.max(0, calc.totalContainerVolume - calc.usedCbm).toFixed(2)} m³`}
          accent={isOverflow ? "warn" : undefined}
        />
        <LegendStat
          label="Koszt 1 m³"
          value={`${calc.costPerM3.toFixed(2)} zł`}
        />
        <LegendStat
          label="🛃 Cło auto"
          value={
            calc.totalCustomsDutyPln > 0
              ? `${calc.totalCustomsDutyPln.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`
              : "—"
          }
        />
      </div>

      {isOverflow && (
        <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded px-2 py-1.5">
          ⚠ Przekroczenie pojemności o {(overflowRate * 100).toFixed(0)}% —
          rozważ dodatkowy kontener lub zmniejszenie ilości.
        </div>
      )}
      {!isOverflow && fillRate < 0.7 && (
        <div className="mt-2 text-[11px] text-indigo-800 bg-indigo-50 ring-1 ring-indigo-200 rounded px-2 py-1.5">
          💡 Słabe wykorzystanie kontenera ({fillPct.toFixed(0)}%) — dorzuć
          więcej towaru, aby obniżyć koszt 1m³.
        </div>
      )}
      {isGood && (
        <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 ring-1 ring-emerald-200 rounded px-2 py-1.5">
          ✓ Optymalne wykorzystanie kontenera — koszt 1m³ rozłożony efektywnie.
        </div>
      )}
    </Card>
  );
}

function ContainerSvg({
  fillRate,
  overflowRate,
  fillColor,
  fillColorLight,
  badge,
  label,
  containerSizeM3,
}: {
  fillRate: number;
  overflowRate: number;
  fillColor: string;
  fillColorLight: string;
  badge: string | null;
  label: string;
  containerSizeM3: number;
}) {
  // Container outline: izometryczny widok 3D z perspektywą boczną.
  // Box: 240w × 130h SVG. Wewnętrzna pojemność wypełniana od dołu.
  const W = 240;
  const H = 130;
  const padX = 16;
  const padY = 14;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  // Wysokość wypełnienia = fillRate × innerH (cut off at 100%)
  const fillH = innerH * Math.min(fillRate, 1);
  const fillY = padY + innerH - fillH;

  // Stack of "box" rectangles inside to simulate boxes being loaded
  const numBoxRows = Math.max(1, Math.round(fillRate * 5));
  const boxRowH = fillH / numBoxRows;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
        {label} · {containerSizeM3}m³
      </div>
      <div className="relative">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="drop-shadow-sm"
        >
          {/* Cień pod kontenerem */}
          <ellipse
            cx={W / 2}
            cy={H - 3}
            rx={W / 2 - 10}
            ry={3}
            fill="rgba(0,0,0,0.08)"
          />
          {/* Bok kontenera (perspektywa) */}
          <polygon
            points={`${padX},${padY} ${padX + 8},${padY - 6} ${W - padX + 8},${padY - 6} ${W - padX},${padY}`}
            fill="#475569"
            opacity={0.7}
          />
          <polygon
            points={`${W - padX},${padY} ${W - padX + 8},${padY - 6} ${W - padX + 8},${H - padY - 6} ${W - padX},${H - padY}`}
            fill="#334155"
            opacity={0.7}
          />
          {/* Korpus kontenera (przednia ściana — przezroczysta z obrysem) */}
          <rect
            x={padX}
            y={padY}
            width={innerW}
            height={innerH}
            fill={fillColorLight}
            opacity={0.3}
            stroke="#475569"
            strokeWidth={1.5}
            rx={2}
          />
          {/* Wypełnienie (od dołu) */}
          {fillH > 0 && (
            <g>
              <rect
                x={padX + 1}
                y={fillY}
                width={innerW - 2}
                height={fillH}
                fill={fillColor}
                opacity={0.85}
              />
              {/* Linie symulujące rzędy pudeł */}
              {Array.from({ length: numBoxRows }).map((_, i) => (
                <line
                  key={i}
                  x1={padX + 1}
                  y1={fillY + boxRowH * (i + 1) - 0.5}
                  x2={padX + innerW - 1}
                  y2={fillY + boxRowH * (i + 1) - 0.5}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={0.5}
                />
              ))}
              {/* Pionowe linie dla pudeł — 6 kolumn */}
              {Array.from({ length: 5 }).map((_, i) => (
                <line
                  key={i}
                  x1={padX + ((innerW / 6) * (i + 1))}
                  y1={fillY}
                  x2={padX + ((innerW / 6) * (i + 1))}
                  y2={fillY + fillH}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={0.5}
                />
              ))}
            </g>
          )}
          {/* Drzwi kontenera (po lewej) */}
          <line
            x1={padX + 6}
            y1={padY + 4}
            x2={padX + 6}
            y2={H - padY - 4}
            stroke="#475569"
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
          <circle
            cx={padX + 6}
            cy={(padY + H - padY) / 2}
            r={1.5}
            fill="#475569"
          />
          {/* Ridges (poziome linie dachu kontenera) */}
          {Array.from({ length: 12 }).map((_, i) => (
            <line
              key={i}
              x1={padX + 14 + ((innerW - 18) / 12) * i}
              y1={padY}
              x2={padX + 14 + ((innerW - 18) / 12) * i}
              y2={padY + innerH}
              stroke="rgba(71,85,105,0.15)"
              strokeWidth={0.5}
            />
          ))}
          {/* Overflow indicator — czerwona kreska nad kontenerem */}
          {overflowRate > 0 && (
            <g>
              <line
                x1={padX - 4}
                y1={padY - 2}
                x2={W - padX + 4}
                y2={padY - 2}
                stroke="#dc2626"
                strokeWidth={2}
                strokeDasharray="3 2"
              />
              <text
                x={W / 2}
                y={padY - 6}
                fill="#dc2626"
                fontSize={9}
                fontWeight={700}
                textAnchor="middle"
              >
                +{(overflowRate * 100).toFixed(0)}% za dużo
              </text>
            </g>
          )}
          {/* Procent wypełnienia w centrum */}
          <text
            x={W / 2}
            y={padY + innerH / 2 + 4}
            fill={fillRate > 0.4 ? "white" : "#475569"}
            fontSize={18}
            fontWeight={800}
            textAnchor="middle"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {(fillRate * 100).toFixed(0)}%
          </text>
        </svg>
        {badge && (
          <div className="absolute -top-1 -right-1 bg-slate-700 text-white text-[10px] font-bold rounded-full px-2 py-0.5 shadow-sm">
            {badge}
          </div>
        )}
      </div>
    </div>
  );
}

function LegendStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "warn";
}) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          accent === "warn" && "text-amber-700",
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Sekcja PL: textarea „opis zamówienia" (zapisywany do `pdfDescription`) +
 * przycisk wygenerowania PDF. Opis ląduje na stronie 1 PDF; lista pozycji
 * od strony 2. Zapis przez updateOrderPdfDescriptionAction; przycisk
 * „Zapisz" aktywny tylko gdy zmieniono wartość.
 */
function PlPdfBlock({
  orderId,
  pdfDescription,
}: {
  orderId: string;
  pdfDescription: string | null;
}) {
  const [draft, setDraft] = useState(pdfDescription ?? "");
  const [savedValue, setSavedValue] = useState(pdfDescription ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = draft !== savedValue;

  function save() {
    startTransition(async () => {
      try {
        await updateOrderPdfDescriptionAction(orderId, draft);
        setSavedValue(draft);
        toast.success("Zapisano opis zamówienia");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-indigo-900">
            Opis zamówienia (strona 1 PDF)
          </h3>
        </div>
        <a
          href={`/api/zamowienia/${orderId}/pdf-pl`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-700 transition-colors"
        >
          <FileText className="size-4" />
          Wygeneruj zamówienie (PDF)
        </a>
      </div>
      <p className="text-xs text-indigo-700/80">
        Tekst pojawi się na pierwszej stronie PDF razem z danymi firmy
        zamawiającej. Lista pozycji startuje od strony 2.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="np. Zamówienie na rolety materiałowe — kolory PIST i AGUA, dostawa do 15.07.2026..."
        rows={4}
        className="bg-white text-sm"
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!dirty || pending}
          variant={dirty ? "default" : "secondary"}
        >
          {pending
            ? "Zapisuję…"
            : dirty
              ? "Zapisz opis"
              : "Zapisano"}
        </Button>
      </div>
    </div>
  );
}
