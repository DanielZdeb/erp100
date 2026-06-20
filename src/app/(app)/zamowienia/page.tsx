import Link from "next/link";
import { Plus } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ORDER_STATUSES,
  STATUS_LABEL,
  STATUS_ICON,
  STATUS_SHORT,
  type OrderStatusT,
} from "@/lib/order-status";
import { effectiveContainerCbm, kalkulujKontener } from "@/lib/kalkulacje";
import { STATUS_BADGE, STATUS_THEME } from "@/lib/status-colors";
import { DOC_CATEGORIES } from "@/lib/order-doc-slots";
import { OrderNumberCell, TrackingCell } from "./order-row-editors";
import { NewOrderDialog } from "./new-order-dialog";
import { ClickableOrderRow } from "./order-row-clickable";
import { ProductsPreviewGrid } from "./_components/products-preview-grid";
import { getDefaultContainerType } from "@/server/system-settings";
import { NettoBruttoTooltip } from "@/components/netto-brutto-tooltip";

const DEFAULT_VAT_RATE = 0.23;

const NAMED_SLOT_IDS = new Set(
  DOC_CATEGORIES.flatMap((c) => c.slots.filter((s) => !s.custom).map((s) => s.id)),
);
const TOTAL_NAMED_SLOTS = NAMED_SLOT_IDS.size;

export const dynamic = "force-dynamic";

const ALL = "all";

type SearchParams = Promise<{
  status?: string;
}>;

function parseStatus(v: string | undefined): OrderStatusT | typeof ALL {
  if (v === ALL) return ALL;
  if (v && (ORDER_STATUSES as readonly string[]).includes(v)) {
    return v as OrderStatusT;
  }
  // Domyślnie pokazujemy WSZYSTKIE zamówienia — user widzi pełną listę
  // z badge'm statusu per wiersz. Wcześniej domyślne „PLANOWANE" często
  // dawało pustą listę bo planowanych zamówień rzadko jest dużo.
  return ALL;
}

export default async function ZamowieniaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const companyId = await getCurrentCompanyId();
  const activeStatus = parseStatus(params.status);

  const [orders, statusCounts, defaultContainerType] = await Promise.all([
    db.importOrder.findMany({
      where: {
        companyId,
        country: "CHINA",
        ...(activeStatus !== ALL ? { status: activeStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            saleChannels: true,
            product: {
              select: {
                customsDutyPct: true,
                name: true,
                productCode: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { url: true, thumbnailWebpUrl: true },
                },
                boxWidthCm: true,
                boxHeightCm: true,
                boxDepthCm: true,
                unitsPerBox: true,
                masterBoxWidthCm: true,
                masterBoxHeightCm: true,
                masterBoxDepthCm: true,
                innerBoxesPerMaster: true,
                shippingBoxes: {
                  orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
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
                category: {
                  select: {
                    id: true,
                    name: true,
                    level: true,
                    customsDutyPct: true,
                    parent: {
                      select: {
                        id: true,
                        name: true,
                        level: true,
                        customsDutyPct: true,
                        parent: {
                          select: {
                            id: true,
                            name: true,
                            level: true,
                            customsDutyPct: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        costs: true,
        goodsTranches: true,
        files: { select: { slot: true } },
        containerLinks: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, containerNumber: true, url: true },
        },
      },
    }),
    db.importOrder.groupBy({
      by: ["status"],
      where: { companyId, country: "CHINA" },
      _count: { _all: true },
    }),
    getDefaultContainerType(),
  ]);

  const countByStatus = new Map<string, number>();
  let totalCount = 0;
  for (const c of statusCounts) {
    countByStatus.set(c.status, c._count._all);
    totalCount += c._count._all;
  }

  const rows = orders.map((o) => {
    const calc = kalkulujKontener({
      rates: {
        cnyToPln: o.cnyToPlnRate ?? 0,
        usdToPln: o.usdToPlnRate ?? 0,
        vatRate: o.vatRate ?? 0.23,
      },
      containerSizeM3: o.containerSizeM3 ?? 28,
      // Logistyka — kwoty w DB są już netto (polityka netto-only).
      // Przekazujemy `type` żeby kalkulator mógł oddzielić CLO od shared.
      costs: o.costs.map((c) => ({
        amountPln: c.amountPln,
        type: c.type,
      })),
      goodsTranches: o.goodsTranches.map((t) => ({
        paidCurrency: t.paidCurrency,
        paidExchangeRate: t.paidExchangeRate,
        paidAmountOriginal: t.paidAmountOriginal,
      })),
      items: o.items.map((it) => {
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
          customsDutyPct:
            it.product.customsDutyPct ??
            it.product.category?.customsDutyPct ??
            it.product.category?.parent?.customsDutyPct ??
            it.product.category?.parent?.parent?.customsDutyPct ??
            null,
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
            // customerShippingPln — REVENUE (klient płaci wysyłkę). Brak tej
            // wartości powodował niższą marżę na liście niż w detalu zamówienia.
            customerShippingPln: ch.customerShippingPln,
            shareOfQty: ch.shareOfQty,
          })),
        };
      }),
    });

    // Płatności: ile zapłacono / ile zostało
    // Faktyczna PLN transzy: wpisana kwota × kurs (gdy podane), inaczej % × goodsTotal
    const goodsTotal = calc.totalGoodsValuePln;
    const trancheAmount = (t: {
      percentage: number;
      paidAmountOriginal: number | null;
      paidExchangeRate: number | null;
    }) =>
      t.paidAmountOriginal != null &&
      t.paidAmountOriginal > 0 &&
      t.paidExchangeRate != null &&
      t.paidExchangeRate > 0
        ? t.paidAmountOriginal * t.paidExchangeRate
        : t.percentage * goodsTotal;
    const goodsTotalEffective = o.goodsTranches.reduce(
      (s, t) => s + trancheAmount(t),
      0,
    );
    const goodsPaid = o.goodsTranches
      .filter((t) => t.paid)
      .reduce((s, t) => s + trancheAmount(t), 0);

    // Logistyka — 7 stałych typów kosztów które ZAWSZE występują w zamówieniu
    // (Kontrola jakości, Odprawa, Koszty terminalowe, Transport lądowy/morski,
    // Cło, Prowizja pośrednika). VAT jest osobno.
    const LOGISTICS_TYPES = [
      "KONTROLA_JAKOSCI",
      "ODPRAWA",
      "KOSZTY_TERMINALOWE",
      "TRANSPORT_LADOWY",
      "TRANSPORT_MORSKI",
      "CLO",
      "PROWIZJA_POSREDNIKA",
    ];
    const logisticsCosts = o.costs.filter((c) =>
      LOGISTICS_TYPES.includes(c.type),
    );
    const logisticsTotal = logisticsCosts.reduce(
      (s, c) => s + c.amountPln,
      0,
    );
    const logisticsPaid = logisticsCosts
      .filter((c) => c.paid)
      .reduce((s, c) => s + c.amountPln, 0);

    const costsTotal = o.costs.reduce((s, c) => s + c.amountPln, 0);
    const costsPaid = o.costs
      .filter((c) => c.paid)
      .reduce((s, c) => s + c.amountPln, 0);
    const payTotal = goodsTotalEffective + costsTotal;
    const payPaid = goodsPaid + costsPaid;
    const payRemaining = Math.max(0, payTotal - payPaid);

    // Liczniki Towar (transze)
    const paidGoodsCount = o.goodsTranches.filter((t) => t.paid).length;
    const totalGoodsCount = o.goodsTranches.length;
    // Liczniki Logistyka — denominator = stała liczba 7 typów
    const paidLogisticsCount = logisticsCosts.filter((c) => c.paid).length;
    const totalLogisticsCount = LOGISTICS_TYPES.length;

    // Dokumenty: ile slotów uzupełnione
    const filledSlotIds = new Set(
      o.files
        .map((f) => f.slot)
        .filter((s): s is string => !!s && NAMED_SLOT_IDS.has(s)),
    );

    const containerSize = o.containerSizeM3 ?? 28;
    const containerCount = calc.containerCount;

    // Breakdown kategorii — grupuj wg L1 (root category) + zbieraj
    // reprezentanta (pierwszy produkt z miniaturką) z każdej kategorii.
    const categoryCounts = new Map<
      string,
      {
        qty: number;
        sku: number;
        sampleImageUrl: string | null;
        sampleProductName: string;
        sampleProductCode: string;
      }
    >();
    for (const it of o.items) {
      const cat = it.product.category;
      let rootName = "Bez kategorii";
      if (cat) {
        if (cat.level === 1) rootName = cat.name;
        else if (cat.level === 2) rootName = cat.parent?.name ?? cat.name;
        else if (cat.level === 3)
          rootName =
            cat.parent?.parent?.name ?? cat.parent?.name ?? cat.name;
      }
      const cur = categoryCounts.get(rootName);
      if (cur) {
        cur.qty += it.quantity;
        cur.sku += 1;
        // Pierwszy produkt z miniaturką wygrywa jako reprezentant
        // Preferujemy thumbnail (~5 KB) zamiast oryginału (1-3 MB).
        const repImg =
          it.product.images[0]?.thumbnailWebpUrl ??
          it.product.images[0]?.url ??
          null;
        if (!cur.sampleImageUrl && repImg) {
          cur.sampleImageUrl = repImg;
          cur.sampleProductName = it.product.name;
          cur.sampleProductCode = it.product.productCode;
        }
      } else {
        categoryCounts.set(rootName, {
          qty: it.quantity,
          sku: 1,
          sampleImageUrl:
            it.product.images[0]?.thumbnailWebpUrl ??
            it.product.images[0]?.url ??
            null,
          sampleProductName: it.product.name,
          sampleProductCode: it.product.productCode,
        });
      }
    }
    const categoryBreakdown = Array.from(categoryCounts.entries())
      .map(([name, v]) => ({
        name,
        qty: v.qty,
        sku: v.sku,
        sampleImageUrl: v.sampleImageUrl,
        sampleProductName: v.sampleProductName,
        sampleProductCode: v.sampleProductCode,
      }))
      .sort((a, b) => b.qty - a.qty);
    // Maks 4 miniatury (z 4 różnych kategorii) — preferujemy produkty z image,
    // ale jeśli któraś kategoria nie ma, pokażemy fallback.
    const previewItems = categoryBreakdown.slice(0, 4);

    // Dni do końca produkcji
    const daysToProductionEnd = o.productionEndAt
      ? Math.ceil(
          (o.productionEndAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
      : null;

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      name: o.name,
      status: o.status as OrderStatusT,
      createdAt: o.createdAt,
      itemsCount: o.items.length,
      usedCbm: calc.usedCbm,
      fillRate: calc.fillRate,
      totalLanded: calc.totalLandedPln,
      totalRevenue: calc.totalRevenuePln,
      marginPct: calc.marginPct,
      payTotal,
      payPaid,
      payRemaining,
      goodsTotalEffective,
      goodsPaid,
      paidGoodsCount,
      totalGoodsCount,
      logisticsTotal,
      logisticsPaid,
      paidLogisticsCount,
      totalLogisticsCount,
      docsFilled: filledSlotIds.size,
      docsTotal: TOTAL_NAMED_SLOTS,
      containerCount,
      containerSize,
      trackingUrl: o.trackingUrl,
      containerLinks: o.containerLinks,
      categoryBreakdown,
      previewItems,
      daysToProductionEnd,
      productionEndAt: o.productionEndAt,
    };
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">
          Zamówienia importowe
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Kontenery z Chin — przeciągaj między etapami.
        </p>
      </div>

      {/* Status tabs jako pipeline — wszystkie w jednym wierszu */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        <Link
          href="/zamowienia?status=all"
          className={cn(
            "rounded-xl ring-1 p-3 transition-all flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5",
            activeStatus === ALL
              ? "bg-indigo-100 border-indigo-400 border-2 shadow-sm"
              : "bg-card border-indigo-200 border",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="size-9 rounded-lg grid place-items-center bg-indigo-100">
              <Plus className="size-4 text-indigo-700" />
            </div>
            <span
              className={cn(
                "text-2xl font-heading font-bold tabular-nums",
                activeStatus === ALL ? "text-indigo-900" : "text-indigo-700",
              )}
            >
              {totalCount}
            </span>
          </div>
          <div
            className={cn(
              "text-xs font-medium",
              activeStatus === ALL ? "text-indigo-900" : "text-indigo-500",
            )}
          >
            Wszystkie
          </div>
        </Link>
        {ORDER_STATUSES.map((s) => {
          const theme = STATUS_THEME[s];
          const Icon = STATUS_ICON[s];
          const count = countByStatus.get(s) ?? 0;
          const isActive = activeStatus === s;
          return (
            <Link
              key={s}
              href={`/zamowienia?status=${s}`}
              className={cn(
                "rounded-xl ring-1 p-3 transition-all flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5",
                isActive
                  ? `${theme.activeBg} ${theme.activeBorder} border-2 shadow-sm`
                  : `bg-card ${theme.border} border`,
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={cn(
                    "size-9 rounded-lg grid place-items-center",
                    theme.iconBg,
                  )}
                >
                  <Icon className={cn("size-4", theme.text)} />
                </div>
                <span
                  className={cn(
                    "text-2xl font-heading font-bold tabular-nums",
                    isActive ? theme.activeText : theme.text,
                  )}
                >
                  {count}
                </span>
              </div>
              <div
                className={cn(
                  "text-xs font-medium",
                  isActive ? theme.activeText : theme.accent,
                )}
              >
                {STATUS_SHORT[s]}
              </div>
            </Link>
          );
        })}
      </div>

      <Card>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {activeStatus === ALL
              ? "Nie masz jeszcze żadnych zamówień. Utwórz pierwszą kalkulację kontenera."
              : `Brak zamówień w statusie ${STATUS_LABEL[activeStatus]}.`}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numer / kontener</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Link</TableHead>
                <TableHead className="text-right">Pozycji</TableHead>
                <TableHead className="text-right">Koszt total</TableHead>
                <TableHead className="text-right">Marża</TableHead>
                <TableHead className="text-right">Opłacono</TableHead>
                <TableHead className="text-right">Pozostało</TableHead>
                <TableHead className="text-right">Dokumenty</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const docsPct =
                  r.docsTotal > 0 ? (r.docsFilled / r.docsTotal) * 100 : 0;
                return (
                  <ClickableOrderRow key={r.id} href={`/zamowienia/${r.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ProductsPreviewGrid
                          items={r.previewItems}
                          fillRate={r.fillRate}
                          containerCount={r.containerCount}
                          containerSize={r.containerSize}
                          usedCbm={r.usedCbm}
                        />
                        <div className="space-y-0.5 min-w-0">
                          <OrderNumberCell
                            orderId={r.id}
                            orderNumber={r.orderNumber}
                          />
                          {r.name && (
                            <div className="text-[11px] text-foreground/70 truncate max-w-[280px]">
                              {r.name}
                            </div>
                          )}
                          <div className="text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                            {r.createdAt.toLocaleDateString("pl-PL")}
                          </div>
                          {r.categoryBreakdown.length > 0 && (
                            <div
                              className="text-[10px] text-violet-700 truncate max-w-[360px]"
                              title={r.categoryBreakdown
                                .map(
                                  (c) =>
                                    `${c.name}: ${c.sku} SKU × ${c.qty} szt`,
                                )
                                .join("\n")}
                            >
                              📂{" "}
                              {r.categoryBreakdown
                                .map(
                                  (c) =>
                                    `${c.name} (${c.qty})`,
                                )
                                .join(" · ")}
                            </div>
                          )}
                          {r.daysToProductionEnd != null && (
                            <DaysToDeadlineBadge
                              days={r.daysToProductionEnd}
                              date={r.productionEndAt!}
                            />
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold tabular-nums tracking-wider ring-1",
                          STATUS_BADGE[r.status],
                        )}
                        title={STATUS_LABEL[r.status]}
                      >
                        {r.status.slice(0, 3)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <TrackingCell
                        orderId={r.id}
                        legacyTrackingUrl={r.trackingUrl}
                        containerLinks={r.containerLinks}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.itemsCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <NettoBruttoTooltip
                        nettoValue={r.totalLanded}
                        vatRate={DEFAULT_VAT_RATE}
                        label="Razem koszt zamówienia (landed)"
                        description="Suma: zakup + logistyka + cło per pozycja"
                      >
                        {fmtPln(r.totalLanded)}
                      </NettoBruttoTooltip>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totalRevenue > 0 ? `${r.marginPct.toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="inline-flex flex-col items-end gap-1 min-w-[140px]">
                        <PaidLine
                          label="Towar"
                          paid={r.goodsPaid}
                          total={r.goodsTotalEffective}
                          paidCount={r.paidGoodsCount}
                          totalCount={r.totalGoodsCount}
                        />
                        <PaidLine
                          label="Logist."
                          paid={r.logisticsPaid}
                          total={r.logisticsTotal}
                          paidCount={r.paidLogisticsCount}
                          totalCount={r.totalLogisticsCount}
                        />
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        r.payRemaining > 0 ? "text-amber-700" : "text-emerald-700",
                      )}
                    >
                      <NettoBruttoTooltip
                        nettoValue={r.payRemaining}
                        vatRate={DEFAULT_VAT_RATE}
                        label="Pozostało do zapłaty"
                        description={`Razem: ${fmtPln(r.payTotal)} · Opłacono: ${fmtPln(r.payPaid)}`}
                      >
                        {fmtPln(r.payRemaining)}
                      </NettoBruttoTooltip>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <ProgressCell
                        value={`${r.docsFilled}/${r.docsTotal}`}
                        pct={docsPct}
                        accent={docsPct >= 100 ? "ok" : "default"}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/zamowienia/${r.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Otwórz
                      </Link>
                    </TableCell>
                  </ClickableOrderRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Przycisk dodawania nowego zamówienia — na dole strony */}
      <div className="flex justify-end pt-2">
        <NewOrderDialog defaultContainerType={defaultContainerType}>
          <Plus className="size-4" />
          Nowe zamówienie
        </NewOrderDialog>
      </div>
    </div>
  );
}

function fmtPln(n: number): string {
  if (!n) return "—";
  // Spójnie z zakładką Płatności — wartości w bazie to netto.
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł netto`;
}

/**
 * Skrócony format kwoty PLN do ciasnego wyświetlania (np. „12 164" zamiast „12 164 zł").
 * Używane w komórkach typu „Opłacono / Total" gdzie kontekst „zł" jest oczywisty.
 */
function fmtPlnShort(n: number): string {
  if (!n) return "0";
  return n.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
}

/**
 * Wiersz „Towar / Logistyka" w komórce Opłacono — kwota PLN + licznik poz.
 * z paskiem postępu. Kolor zależy od % opłaconej kwoty.
 */
function PaidLine({
  label,
  paid,
  total,
  paidCount,
  totalCount,
}: {
  label: string;
  paid: number;
  total: number;
  paidCount: number;
  totalCount: number;
}) {
  const pct = total > 0 ? (paid / total) * 100 : 0;
  const safePct = Math.max(0, Math.min(100, pct));
  const remaining = Math.max(0, total - paid);
  const colorClass =
    pct >= 100
      ? "text-emerald-700"
      : pct > 0
        ? "text-emerald-600"
        : "text-muted-foreground";
  return (
    <NettoBruttoTooltip
      nettoValue={total}
      vatRate={DEFAULT_VAT_RATE}
      label={`${label} — łącznie`}
      description={`Opłacono ${fmtPln(paid)} · Pozostało ${fmtPln(remaining)} (${paidCount}/${totalCount} transz)`}
    >
      <div className="w-full flex flex-col gap-0.5">
        <div className="flex items-baseline justify-end gap-1.5 text-[11px] tabular-nums">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-medium">
            {label}
          </span>
          <span className={cn("font-bold", colorClass)}>
            {fmtPlnShort(paid)}
          </span>
          <span className="text-muted-foreground text-[9px]">/</span>
          <span className="text-foreground/80">{fmtPlnShort(total)}</span>
          <span className="text-[9px] text-muted-foreground">
            ({paidCount}/{totalCount})
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              pct >= 100 ? "bg-emerald-500" : "bg-emerald-400",
            )}
            style={{ width: `${safePct}%` }}
          />
        </div>
        {remaining > 0.5 && (
          <div className="flex justify-end text-[9px] tabular-nums text-amber-700 font-medium">
            do zapłaty: {fmtPlnShort(remaining)}
          </div>
        )}
      </div>
    </NettoBruttoTooltip>
  );
}

/**
 * Badge „dni do końca produkcji" — kolorowanie zmienia się wraz z bliskością deadline.
 * Past = czerwony bold (opóźnione)
 * 0-3 dni = czerwony pulsujący
 * 4-7 dni = pomarańczowy
 * 8-14 dni = żółty
 * >14 dni = neutralny zielony/szary
 */
function DaysToDeadlineBadge({ days, date }: { days: number; date: Date }) {
  const isPast = days < 0;
  const isCritical = days >= 0 && days <= 3;
  const isUrgent = days > 3 && days <= 7;
  const isSoon = days > 7 && days <= 14;
  // isFar gdy >14 — neutralny styl

  const cls = cn(
    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 mt-0.5",
    isPast &&
      "bg-rose-100 text-rose-800 ring-rose-300 animate-pulse",
    isCritical &&
      "bg-rose-50 text-rose-700 ring-rose-200 animate-pulse",
    isUrgent && "bg-amber-50 text-amber-800 ring-amber-200",
    isSoon && "bg-yellow-50 text-yellow-800 ring-yellow-200",
    !isPast &&
      !isCritical &&
      !isUrgent &&
      !isSoon &&
      "bg-emerald-50/60 text-emerald-700 ring-emerald-200",
  );

  const label = isPast
    ? `⚠ Opóźnione o ${Math.abs(days)} dni`
    : days === 0
      ? "🔥 DZIŚ koniec produkcji"
      : days <= 3
        ? `🔥 ${days} dni do końca produkcji`
        : days <= 7
          ? `⚡ ${days} dni do końca produkcji`
          : days <= 14
            ? `⏳ ${days} dni do końca produkcji`
            : `📅 ${days} dni do końca produkcji`;

  return (
    <div
      className={cls}
      title={`Planowany koniec produkcji: ${date.toLocaleDateString("pl-PL")}`}
    >
      {label}
    </div>
  );
}

function ProgressCell({
  value,
  sub,
  pct,
  accent,
}: {
  value: string;
  sub?: string;
  pct: number;
  accent: "ok" | "default";
}) {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <div className="inline-flex flex-col items-end gap-0.5 min-w-[80px]">
      <div
        className={cn(
          "text-sm tabular-nums font-medium",
          accent === "ok" ? "text-emerald-700" : undefined,
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {sub}
        </div>
      )}
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            accent === "ok" ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}
