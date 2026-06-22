import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { db } from "@/lib/db";
import { getCurrentCompanyId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_LABEL, type OrderStatusT } from "@/lib/order-status";
import { STATUS_BADGE } from "@/lib/status-colors";

import { CompanyTasksKanban } from "./_components/company-tasks-kanban";
import type {
  CompanyTaskWithRelations,
  TaskUser,
} from "./_components/company-tasks-types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const companyId = await getCurrentCompanyId();
  const [
    activeOrders,
    productCount,
    activeOrdersList,
    companyTasks,
    members,
  ] = await Promise.all([
    db.importOrder.count({
      where: { companyId, status: { not: "W_MAGAZYNIE" } },
    }),
    db.product.count({ where: { companyId, archived: false } }),
    // Lekka lista aktywnych zamowien dla dashboardu — bez calc, tylko transze
    // towaru i koszty (do prostej sumy "do zaplaty"). Pelne kalkulacje sa na
    // stronie /zamowienia.
    db.importOrder.findMany({
      where: { companyId, status: { not: "W_MAGAZYNIE" } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        orderNumber: true,
        name: true,
        status: true,
        costs: { select: { amountPln: true, paid: true } },
        goodsTranches: {
          select: {
            percentage: true,
            paid: true,
            paidAmountOriginal: true,
            paidExchangeRate: true,
          },
        },
        items: {
          select: {
            quantity: true,
            unitPricePln: true,
            unitPriceIsBrutto: true,
          },
        },
        vatRate: true,
      },
    }),
    db.companyTask.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            url: true,
            filename: true,
            contentType: true,
            sizeBytes: true,
            isImage: true,
            createdAt: true,
          },
        },
      },
    }),
    db.user.findMany({
      where: { companyId, active: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { id: true, name: true, email: true },
    }),
  ]);

  // Prosta suma "do zaplaty" dla dashboard — koszty niezaplacone + transze
  // niezaplacone (transza estymowana jako % × suma towaru). Bez kalkulacji
  // calowej ekonomiki (logistyka per-CBM itp) — to siedzi na stronie zamowien.
  let totalUnpaid = 0;
  const orderSummaries: Array<{
    id: string;
    orderNumber: string;
    name: string | null;
    status: OrderStatusT;
    unpaid: number;
  }> = [];

  for (const o of activeOrdersList) {
    const vat = o.vatRate ?? 0.23;
    // Goods total — suma cen netto × qty (heurystyka: jesli brutto → / (1+vat))
    let goodsNetTotal = 0;
    for (const it of o.items) {
      if (it.unitPricePln == null) continue;
      const netto = it.unitPriceIsBrutto
        ? it.unitPricePln / (1 + vat)
        : it.unitPricePln;
      goodsNetTotal += netto * it.quantity;
    }
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
        : t.percentage * goodsNetTotal;
    const goodsRemaining = o.goodsTranches
      .filter((t) => !t.paid)
      .reduce((s, t) => s + trancheAmount(t), 0);
    const costsRemaining = o.costs
      .filter((c) => !c.paid)
      .reduce((s, c) => s + c.amountPln, 0);
    const unpaid = goodsRemaining + costsRemaining;
    totalUnpaid += unpaid;
    orderSummaries.push({
      id: o.id,
      orderNumber: o.orderNumber,
      name: o.name,
      status: o.status as OrderStatusT,
      unpaid,
    });
  }

  // Statystyki Kanbanu
  const now = new Date();
  const overdueTasks = companyTasks.filter(
    (t) => t.dueAt && new Date(t.dueAt) < now && t.status !== "DONE",
  ).length;
  const urgentTasks = companyTasks.filter(
    (t) => t.priority === "URGENT" && t.status !== "DONE",
  ).length;
  const inProgressTasks = companyTasks.filter(
    (t) => t.status === "IN_PROGRESS",
  ).length;
  const attentionCount = overdueTasks + urgentTasks;

  const tasksForClient: CompanyTaskWithRelations[] = companyTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assignedToId: t.assignedToId,
    assignedTo: t.assignedTo,
    createdBy: t.createdBy,
    dueAt: t.dueAt,
    completedAt: t.completedAt,
    sortOrder: t.sortOrder,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    attachments: t.attachments,
  }));

  const membersForClient: TaskUser[] = members;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Zadania zespołu i kluczowe wskaźniki firmy.
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
          label="Zadania pilne"
          value={attentionCount.toString()}
          subtitle={
            attentionCount > 0
              ? `${overdueTasks} po terminie · ${urgentTasks} URGENT · ${inProgressTasks} w trakcie`
              : `${inProgressTasks} w trakcie`
          }
          theme={attentionCount > 0 ? "rose" : "emerald"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Tablica zadań zespołu
            <span className="text-xs font-normal text-muted-foreground">
              · drag&drop między kolumnami zmienia status
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompanyTasksKanban
            tasks={tasksForClient}
            members={membersForClient}
          />
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
  subtitle,
  theme = "indigo",
  href,
}: {
  label: string;
  value: string;
  subtitle?: string;
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
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
          <div
            className={cn(
              "text-3xl font-heading font-bold tabular-nums mt-1",
              t.accent,
            )}
          >
            {value}
          </div>
          {subtitle && (
            <div className="text-[10px] text-muted-foreground mt-1 truncate">
              {subtitle}
            </div>
          )}
        </div>
        {href && (
          <div
            className={cn(
              "size-8 rounded-lg grid place-items-center shrink-0",
              t.iconBg,
            )}
          >
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

function fmtPln(n: number): string {
  if (!n) return "0 zł";
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}
