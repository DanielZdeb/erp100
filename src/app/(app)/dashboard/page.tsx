import Link from "next/link";
import { ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { effectiveContainerCbm, kalkulujKontener } from "@/lib/kalkulacje";
import { resolveCustomsDutyPct } from "@/lib/customs-duty";
import { STATUS_LABEL, type OrderStatusT } from "@/lib/order-status";
import { STATUS_BADGE } from "@/lib/status-colors";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const companyId = await getCurrentCompanyId();
  const [activeOrders, productCount, allOrdersWithCosts, openTasks] =
    await Promise.all([
      db.importOrder.count({
        where: { companyId, status: { not: "W_MAGAZYNIE" } },
      }),
      db.product.count({ where: { companyId, archived: false } }),
      db.importOrder.findMany({
        where: { companyId, status: { not: "W_MAGAZYNIE" } },
        include: {
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
                  customsDutyPct: true,
                  category: {
                    select: {
                      customsDutyPct: true,
                      parent: {
                        select: {
                          customsDutyPct: true,
                          parent: {
                            select: { customsDutyPct: true },
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
          costs: true,
          payments: true,
          goodsTranches: true,
        },
      }),
      db.orderTask.findMany({
        where: { done: false, order: { companyId } },
        orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        take: 30,
        include: {
          order: {
            select: { id: true, orderNumber: true, name: true, status: true },
          },
        },
      }),
    ]);

  // Suma "do zapłaty" po wszystkich zamówieniach
  // Liczona jako: (suma kosztów + wartość towaru) - suma płatności
  let totalUnpaid = 0;
  let totalActiveRevenue = 0;
  const orderSummaries: Array<{
    id: string;
    orderNumber: string;
    name: string | null;
    status: OrderStatusT;
    fillRate: number;
    totalLanded: number;
    paidSum: number;
    unpaid: number;
    marginPct: number;
  }> = [];

  for (const o of allOrdersWithCosts) {
    const calc = kalkulujKontener({
      rates: {
        cnyToPln: o.cnyToPlnRate ?? 0,
        usdToPln: o.usdToPlnRate ?? 0,
        vatRate: o.vatRate ?? 0.23,
      },
      containerSizeM3: o.containerSizeM3 ?? 28,
      goodsTranches: o.goodsTranches.map((t) => ({
        paidCurrency: t.paidCurrency,
        paidExchangeRate: t.paidExchangeRate,
        paidAmountOriginal: t.paidAmountOriginal,
      })),
      // Logistyka — kwoty w DB są już netto (polityka netto-only).
      costs: o.costs.map((c) => ({
        amountPln: c.amountPln,
        type: c.type,
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
          unitPriceIsBrutto: it.unitPriceIsBrutto,
          expectedMonthlySales: it.expectedMonthlySales,
          customsDutyPct: resolveCustomsDutyPct({
            customsDutyPct: it.product.customsDutyPct,
            category: it.product.category,
          }),
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

    const paidSum = o.payments.reduce((s, p) => s + p.amountPln, 0);
    const unpaid = Math.max(0, calc.totalLandedPln - paidSum);

    totalUnpaid += unpaid;
    totalActiveRevenue += calc.totalRevenuePln;

    orderSummaries.push({
      id: o.id,
      orderNumber: o.orderNumber,
      name: o.name,
      status: o.status as OrderStatusT,
      fillRate: calc.fillRate,
      totalLanded: calc.totalLandedPln,
      paidSum,
      unpaid,
      marginPct: calc.marginPct,
    });
  }

  // Tasks bucketing
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueTasks = openTasks.filter(
    (t) => t.dueAt && new Date(t.dueAt) < today,
  );
  const dueTodayTasks = openTasks.filter(
    (t) =>
      t.dueAt &&
      new Date(t.dueAt) >= today &&
      new Date(t.dueAt) < new Date(today.getTime() + 86400000),
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Przegląd zadań i kluczowych wskaźników firmy.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Aktywne zamówienia"
          value={activeOrders.toString()}
          href="/zamowienia"
          theme="cyan"
        />
        <KpiCard
          label="Produkty w katalogu"
          value={productCount.toString()}
          href="/produkty"
          theme="emerald"
        />
        <KpiCard
          label="Gotówka do zapłaty"
          value={fmtPln(totalUnpaid)}
          theme={totalUnpaid > 0 ? "amber" : "emerald"}
        />
        <KpiCard
          label="Zaległe zadania"
          value={overdueTasks.length.toString()}
          theme={overdueTasks.length > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Zadania do wykonania ({openTasks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {openTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Brak otwartych zadań. Wszystko wykonane.
              </div>
            ) : (
              <ul className="divide-y">
                {overdueTasks.length > 0 && (
                  <li className="bg-amber-50/50 px-4 py-2 text-xs uppercase tracking-wide text-amber-700 font-medium flex items-center gap-2">
                    <AlertCircle className="size-4" />
                    Zaległe ({overdueTasks.length})
                  </li>
                )}
                {overdueTasks.map((t) => (
                  <TaskItem key={t.id} task={t} variant="overdue" />
                ))}
                {dueTodayTasks.length > 0 && (
                  <li className="bg-blue-50/50 px-4 py-2 text-xs uppercase tracking-wide text-blue-700 font-medium">
                    Na dziś ({dueTodayTasks.length})
                  </li>
                )}
                {dueTodayTasks.map((t) => (
                  <TaskItem key={t.id} task={t} variant="today" />
                ))}
                {openTasks
                  .filter(
                    (t) => !overdueTasks.includes(t) && !dueTodayTasks.includes(t),
                  )
                  .slice(0, 10)
                  .map((t) => (
                    <TaskItem key={t.id} task={t} variant="normal" />
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Aktywne zamówienia ({orderSummaries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {orderSummaries.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Brak aktywnych zamówień.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zamówienie</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Do zapłaty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderSummaries.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link
                          href={`/zamowienia/${o.id}`}
                          className="hover:underline"
                        >
                          <div className="font-medium text-sm">
                            {o.orderNumber}
                          </div>
                          {o.name && (
                            <div className="text-xs text-muted-foreground">
                              {o.name}
                            </div>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded px-2 py-0.5 text-xs ring-1",
                            STATUS_BADGE[o.status],
                          )}
                        >
                          {STATUS_LABEL[o.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {o.unpaid > 0 ? (
                          <span className="text-amber-600 font-medium">
                            {fmtPln(o.unpaid)}
                          </span>
                        ) : (
                          <CheckCircle2 className="size-4 text-emerald-600 inline" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Wskaźniki sprzedaży (aktywne kontenery)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <Stat
              label="Pełna wartość zakupu"
              value={fmtPln(orderSummaries.reduce((s, o) => s + o.totalLanded, 0))}
            />
            <Stat label="Założony przychód" value={fmtPln(totalActiveRevenue)} />
            <Stat label="Łączna gotówka do zapłaty" value={fmtPln(totalUnpaid)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const KPI_THEME = {
  indigo: {
    iconBg: "bg-indigo-100 text-indigo-700",
    accent: "text-indigo-700",
    ring: "hover:ring-indigo-200",
    glow: "from-indigo-50/60",
  },
  cyan: {
    iconBg: "bg-cyan-100 text-cyan-700",
    accent: "text-cyan-700",
    ring: "hover:ring-cyan-200",
    glow: "from-cyan-50/60",
  },
  emerald: {
    iconBg: "bg-emerald-100 text-emerald-700",
    accent: "text-emerald-700",
    ring: "hover:ring-emerald-200",
    glow: "from-emerald-50/60",
  },
  amber: {
    iconBg: "bg-amber-100 text-amber-700",
    accent: "text-amber-700",
    ring: "hover:ring-amber-200",
    glow: "from-amber-50/60",
  },
  rose: {
    iconBg: "bg-rose-100 text-rose-700",
    accent: "text-rose-700",
    ring: "hover:ring-rose-200",
    glow: "from-rose-50/60",
  },
} as const;

type KpiTheme = keyof typeof KPI_THEME;

function KpiCard({
  label,
  value,
  theme = "indigo",
  href,
}: {
  label: string;
  value: string;
  theme?: KpiTheme;
  href?: string;
}) {
  const t = KPI_THEME[theme];
  const body = (
    <div
      className={cn(
        "relative h-full rounded-xl bg-card ring-1 ring-border p-4 overflow-hidden transition-all",
        href && "hover:shadow-md hover:-translate-y-0.5",
        t.ring,
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-16 bg-gradient-to-b to-transparent pointer-events-none",
          t.glow,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
          <div className={cn("text-3xl font-heading font-bold tabular-nums mt-1", t.accent)}>
            {value}
          </div>
        </div>
        {href && (
          <div className={cn("size-8 rounded-lg grid place-items-center", t.iconBg)}>
            <ArrowRight className="size-4" />
          </div>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function TaskItem({
  task,
  variant,
}: {
  task: {
    id: string;
    title: string;
    description: string | null;
    dueAt: Date | null;
    status: OrderStatusT | null;
    order: {
      id: string;
      orderNumber: string;
      name: string | null;
      status: string;
    };
  };
  variant: "overdue" | "today" | "normal";
}) {
  return (
    <li className="p-3 flex items-start gap-3">
      <div
        className={cn(
          "size-2 rounded-full mt-2 shrink-0",
          variant === "overdue"
            ? "bg-amber-500"
            : variant === "today"
              ? "bg-blue-500"
              : "bg-muted-foreground/40",
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{task.title}</div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
          <Link href={`/zamowienia/${task.order.id}`} className="hover:underline">
            {task.order.orderNumber}
            {task.order.name && ` · ${task.order.name}`}
          </Link>
          {task.status && (
            <Badge variant="secondary" className="text-[10px] py-0">
              etap: {STATUS_LABEL[task.status]}
            </Badge>
          )}
          {task.dueAt && (
            <span className={variant === "overdue" ? "text-amber-700 font-medium" : ""}>
              {new Date(task.dueAt).toLocaleDateString("pl-PL")}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function fmtPln(n: number): string {
  if (!n) return "0 zł";
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}
