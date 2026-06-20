"use client";

import { useState, useTransition } from "react";
import {
  Anchor,
  Banknote,
  ClipboardCheck,
  CreditCard,
  Factory,
  FileBadge2,
  Plus,
  Receipt,
  Ship,
  Trash2,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  addOrderCostAction,
  deleteOrderCostAction,
  toggleGoodsTranchePaidAction,
  toggleOrderCostPaidAction,
  updateGoodsTrancheAction,
  updateGoodsTranchePaymentAction,
  upsertFixedCostAction,
} from "@/server/order-costs";

type GoodsTranchePhase = "PRE_PRODUCTION" | "POST_PRODUCTION" | "IN_PORT";
type PayCurrency = "PLN" | "USD" | "EUR" | "CNY";
type CostType =
  | "KONTROLA_JAKOSCI"
  | "ODPRAWA"
  | "KOSZTY_TERMINALOWE"
  | "TRANSPORT_LADOWY"
  | "TRANSPORT_MORSKI"
  | "CLO"
  | "PROWIZJA_POSREDNIKA"
  | "VAT"
  | "CIECIE"
  | "KROJENIE"
  | "SZWALNIA"
  | "INNE";

type Tranche = {
  id: string;
  phase: GoodsTranchePhase;
  percentage: number;
  paid: boolean;
  paidAt: Date | null;
  notes: string | null;
  paidCurrency: PayCurrency | null;
  paidExchangeRate: number | null;
  paidAmountOriginal: number | null;
};

type Cost = {
  id: string;
  type: CostType;
  name: string | null;
  amountPln: number;
  amount: number | null;
  currency: PayCurrency;
  exchangeRate: number | null;
  isNetto: boolean;
  vatRate: number | null;
  paid: boolean;
  notes: string | null;
};

type OrderRates = {
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  eurToPlnRate: number | null;
  vatRate: number | null;
};

const PHASE_LABEL: Record<GoodsTranchePhase, string> = {
  PRE_PRODUCTION: "Przed produkcją",
  POST_PRODUCTION: "Po produkcji / QC",
  IN_PORT: "W porcie",
};

const PHASE_ICON: Record<GoodsTranchePhase, LucideIcon> = {
  PRE_PRODUCTION: Factory,
  POST_PRODUCTION: ClipboardCheck,
  IN_PORT: Anchor,
};

// ── CN (import z Chin) ──
// Logistyka (shared CBM): koszty operacyjne kontenera dzielone
// proporcjonalnie do CBM każdej pozycji — wszystkie z VAT 23%.
const LOGISTYKA_TYPES_CN: { type: Exclude<CostType, "INNE">; label: string; icon: LucideIcon }[] = [
  { type: "KONTROLA_JAKOSCI", label: "Kontrola jakości", icon: ClipboardCheck },
  { type: "ODPRAWA", label: "Odprawa", icon: FileBadge2 },
  { type: "KOSZTY_TERMINALOWE", label: "Koszty terminalowe", icon: Anchor },
  { type: "TRANSPORT_LADOWY", label: "Transport lądowy DE → PL", icon: Truck },
  { type: "TRANSPORT_MORSKI", label: "Transport morski CN → PL", icon: Ship },
  { type: "VAT", label: "VAT (dodatkowo)", icon: CreditCard },
];
// Cło + Prowizja: osobny dział — opłaty bez VAT, alokowane per-product
// (cło) / per-value (prowizja). Nie mają VAT — kwota = brutto = netto.
const OPLATY_TYPES_CN: { type: Exclude<CostType, "INNE">; label: string; icon: LucideIcon }[] = [
  { type: "CLO", label: "Cło", icon: FileBadge2 },
  { type: "PROWIZJA_POSREDNIKA", label: "Prowizja Fullbax", icon: Receipt },
];

// ── PL (produkcja krajowa) ──
// Brak transportu morskiego/cła/prowizji. Zamiast tego: cięcie + krojenie
// jako dwa „obowiązkowe" wpisy, dzielone proporcjonalnie do qty pozycji.
const LOGISTYKA_TYPES_PL: { type: Exclude<CostType, "INNE">; label: string; icon: LucideIcon }[] = [
  { type: "KONTROLA_JAKOSCI", label: "Kontrola jakości", icon: ClipboardCheck },
  { type: "TRANSPORT_LADOWY", label: "Transport (z fabryki PL)", icon: Truck },
  { type: "VAT", label: "VAT (dodatkowo)", icon: CreditCard },
];
const OPLATY_TYPES_PL: { type: Exclude<CostType, "INNE">; label: string; icon: LucideIcon }[] = [
  { type: "KROJENIE", label: "Krojenie", icon: FileBadge2 },
  { type: "SZWALNIA", label: "Szwalnia", icon: Receipt },
];

const CURRENCY_SYMBOL: Record<PayCurrency, string> = {
  PLN: "zł",
  USD: "$",
  EUR: "€",
  CNY: "¥",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtPln(n: number): string {
  // Suffix "netto" — kwoty w zakładce Płatności są w netto.
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł netto`;
}

/**
 * Format dla typów które nie mają VATu (CŁO, PROWIZJA_POSREDNIKA).
 * Cło = opłata celna — nie ma od niej VATu. Prowizja pośrednika fakturowana
 * jest jako usługa bez VAT (lub VAT = 0). W obu przypadkach nie chcemy
 * sufiksu "netto", bo wartość brutto = wartość netto = wartość kwoty.
 */
function fmtPlnFlat(n: number): string {
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}

function isVatExempt(type: CostType): boolean {
  return type === "CLO" || type === "PROWIZJA_POSREDNIKA";
}

function phaseOrder(p: GoodsTranchePhase): number {
  return p === "PRE_PRODUCTION" ? 0 : p === "POST_PRODUCTION" ? 1 : 2;
}

export type BrokerCommissionInfo = {
  totalGoodsUsd: number;
  usdToPlnRate: number;
  minValueUsd: number;
  maxValueUsd: number | null;
  ratePct: number | null;
  flatPln: number | null;
  individual: boolean;
  brokerName: string;
};

export type CustomsInfo = {
  totalGoodsValuePln: number;
  totalCustomsDutyPln: number;
  /** Gdy wszystkie pozycje mają tę samą stawkę; null = mieszane. */
  uniformRatePct: number | null;
  byRate: Array<{
    ratePct: number;
    goodsValuePln: number;
    dutyPln: number;
  }>;
};

export function PaymentsTable({
  orderId,
  tranches,
  costs,
  goodsTotal,
  brokerCommissionInfo,
  customsInfo,
  rates,
  country = "CHINA",
  totalOrderQty = 0,
  defaultKrojeniePerSztPln = null,
  defaultSzwalniaPerSztPln = null,
}: {
  orderId: string;
  tranches: Tranche[];
  costs: Cost[];
  goodsTotal: number;
  brokerCommissionInfo: BrokerCommissionInfo | null;
  customsInfo: CustomsInfo | null;
  rates: OrderRates;
  /** Kraj produkcji — wybiera zestaw obowiązkowych kosztów (CN: cło+prowizja,
   *  PL: cięcie+krojenie) i ukrywa nieadekwatne pola. */
  country?: "CHINA" | "POLAND";
  /** Suma sztuk wszystkich pozycji zamówienia — używana dla PL Krojenie/Szwalnia
   *  (wpisujesz cenę za sztukę, system mnoży × tę sumę). */
  totalOrderQty?: number;
  /** Domyślna stawka Krojenia (zł/szt) z szablonu firmy — auto-inicjuje
   *  pole input gdy koszt KROJENIE jeszcze nie ma zapisanej wartości. */
  defaultKrojeniePerSztPln?: number | null;
  /** Domyślna stawka Szwalni (zł/szt) z szablonu firmy. */
  defaultSzwalniaPerSztPln?: number | null;
}) {
  const isPoland = country === "POLAND";
  const LOGISTYKA_TYPES = isPoland ? LOGISTYKA_TYPES_PL : LOGISTYKA_TYPES_CN;
  const OPLATY_TYPES = isPoland ? OPLATY_TYPES_PL : OPLATY_TYPES_CN;

  const sortedTranches = tranches
    .slice()
    .sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase));

  const otherCosts = costs.filter((c) => c.type === "INNE");
  const fixedCosts = costs.filter((c) => c.type !== "INNE");

  // ─── Sumy ──────────────────────────────────────────────────────────
  function trancheAmount(t: Tranche): number {
    if (t.paidAmountOriginal != null && t.paidAmountOriginal > 0) {
      return t.paidAmountOriginal * (t.paidExchangeRate ?? 1);
    }
    return t.percentage * goodsTotal;
  }
  const tranchesSum = sortedTranches.reduce((s, t) => s + trancheAmount(t), 0);
  const tranchesPaid = sortedTranches
    .filter((t) => t.paid)
    .reduce((s, t) => s + trancheAmount(t), 0);

  const fixedSum = fixedCosts.reduce((s, c) => s + c.amountPln, 0);
  const fixedPaid = fixedCosts
    .filter((c) => c.paid)
    .reduce((s, c) => s + c.amountPln, 0);

  // Per-bucket — Logistyka (z VAT) i Opłaty (cło/prowizja CN albo cięcie/krojenie PL).
  const logTypes = new Set<string>(LOGISTYKA_TYPES.map((t) => t.type));
  const oplatyTypes = new Set<string>(OPLATY_TYPES.map((t) => t.type));
  const logisticsSum = fixedCosts
    .filter((c) => logTypes.has(c.type))
    .reduce((s, c) => s + c.amountPln, 0);
  const logisticsPaid = fixedCosts
    .filter((c) => logTypes.has(c.type) && c.paid)
    .reduce((s, c) => s + c.amountPln, 0);
  const oplatySum = fixedCosts
    .filter((c) => oplatyTypes.has(c.type))
    .reduce((s, c) => s + c.amountPln, 0);
  const oplatyPaid = fixedCosts
    .filter((c) => oplatyTypes.has(c.type) && c.paid)
    .reduce((s, c) => s + c.amountPln, 0);
  const otherSum = otherCosts.reduce((s, c) => s + c.amountPln, 0);
  const otherPaid = otherCosts
    .filter((c) => c.paid)
    .reduce((s, c) => s + c.amountPln, 0);

  const grandTotal = tranchesSum + fixedSum + otherSum;
  const grandPaid = tranchesPaid + fixedPaid + otherPaid;

  const [addOtherOpen, setAddOtherOpen] = useState(false);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-3 py-2 border-b bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-indigo-700" />
          <h3 className="text-sm font-semibold text-indigo-900 uppercase tracking-wide">
            Płatności
          </h3>
        </div>
        <div className="text-[11px] text-indigo-800 tabular-nums flex items-center gap-2 flex-wrap">
          <span>
            Opłacono:{" "}
            <span className={cn(grandPaid > 0 && "text-emerald-700 font-bold")}>
              {fmtPln(grandPaid)}
            </span>{" "}
            / <span className="font-semibold">{fmtPln(grandTotal)}</span>
          </span>
          {grandTotal - grandPaid > 0.5 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 ring-1 ring-amber-200 px-2 py-0.5 font-semibold text-amber-900">
              Pozostało: {fmtPln(grandTotal - grandPaid)}
            </span>
          )}
          {grandTotal > 0 && grandTotal - grandPaid <= 0.5 && (
            <span className="inline-flex items-center rounded-full bg-emerald-50 ring-1 ring-emerald-300 px-2 py-0.5 font-semibold text-emerald-800">
              ✓ Opłacone w całości
            </span>
          )}
          {grandTotal > 0 && (
            <span className="inline-flex items-center rounded-full bg-white/80 ring-1 ring-indigo-200 px-2 py-0.5 font-bold text-indigo-900">
              {((grandPaid / grandTotal) * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50/80 border-b text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="border-r border-slate-200 text-left px-2 py-1.5 font-medium w-9"></th>
              <th className="border-r border-slate-200 text-left px-2 py-1.5 font-medium min-w-[200px]">
                Pozycja
              </th>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-16">
                %
              </th>
              <th className="border-r border-slate-200 text-left px-2 py-1.5 font-medium w-20">
                Waluta
              </th>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-32">
                Kwota
              </th>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-24">
                Kurs
              </th>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-32">
                Razem PLN
              </th>
              <th className="border-r border-slate-200 text-center px-2 py-1.5 font-medium w-32">
                Status
              </th>
              <th className="text-center px-2 py-1.5 font-medium w-9"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {/* ─── Transze za towar ─── */}
            <SectionHeaderRow
              icon={Banknote}
              label="Opłata za towar"
              accent="indigo"
            />
            {sortedTranches.map((t) => (
              <TrancheRow
                key={t.id}
                tranche={t}
                goodsTotal={goodsTotal}
                rates={rates}
              />
            ))}
            {sortedTranches.length > 0 && (
              <SectionSubtotalRow
                label="Σ Opłata za towar"
                paid={tranchesPaid}
                total={tranchesSum}
                accent="indigo"
              />
            )}

            {/* ─── Logistyka (transport, kontrola, terminalowe, VAT — z VAT 23%) ─── */}
            <SectionHeaderRow
              icon={Truck}
              label="Logistyka"
              accent="amber"
            />
            {LOGISTYKA_TYPES.map(({ type, label, icon }) => {
              const cost = fixedCosts.find((c) => c.type === type);
              return (
                <FixedCostRow
                  key={type}
                  type={type}
                  label={label}
                  icon={icon}
                  cost={cost}
                  orderId={orderId}
                  rates={rates}
                  brokerInfo={null}
                  customsInfo={null}
                />
              );
            })}
            <SectionSubtotalRow
              label="Σ Logistyka"
              paid={logisticsPaid}
              total={logisticsSum}
              accent="amber"
            />

            {/* ─── Opłaty (CN: cło+prowizja / PL: cięcie+krojenie) ─── */}
            <SectionHeaderRow
              icon={FileBadge2}
              label={
                isPoland
                  ? "Krojenie + szwalnia (dzielone per szt)"
                  : "Opłaty (cło + prowizja)"
              }
              accent="rose"
            />
            {OPLATY_TYPES.map(({ type, label, icon }) => {
              const cost = fixedCosts.find((c) => c.type === type);
              // PL: Krojenie/Szwalnia wpisujemy jako cenę PER SZT, system
              // mnoży przez sumę sztuk wszystkich pozycji zamówienia.
              const perSztMode =
                isPoland && (type === "KROJENIE" || type === "SZWALNIA");
              const defaultPerSzt =
                type === "KROJENIE"
                  ? defaultKrojeniePerSztPln
                  : type === "SZWALNIA"
                    ? defaultSzwalniaPerSztPln
                    : null;
              return (
                <FixedCostRow
                  key={type}
                  type={type}
                  label={label}
                  icon={icon}
                  cost={cost}
                  orderId={orderId}
                  rates={rates}
                  perSztMode={perSztMode}
                  totalQty={totalOrderQty}
                  defaultPerSztPln={defaultPerSzt}
                  brokerInfo={
                    type === "PROWIZJA_POSREDNIKA"
                      ? brokerCommissionInfo
                      : null
                  }
                  customsInfo={type === "CLO" ? customsInfo : null}
                />
              );
            })}
            <SectionSubtotalRow
              label={
                isPoland ? "Σ Krojenie + szwalnia" : "Σ Opłaty (bez VAT)"
              }
              paid={oplatyPaid}
              total={oplatySum}
              accent="rose"
              vatExempt
            />

            {/* ─── Inne opłaty ─── */}
            <SectionHeaderRow
              icon={Plus}
              label="Inne opłaty"
              accent="slate"
              action={
                <button
                  type="button"
                  onClick={() => setAddOtherOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-white ring-1 ring-slate-300 hover:bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700 transition-colors"
                >
                  <Plus className="size-2.5" />
                  Dodaj
                </button>
              }
            />
            {otherCosts.map((c) => (
              <OtherCostRow key={c.id} cost={c} />
            ))}
            {otherCosts.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-2 py-2 text-[10px] text-muted-foreground italic text-center"
                >
                  Brak innych opłat
                </td>
              </tr>
            )}
            {otherCosts.length > 0 && (
              <SectionSubtotalRow
                label="Σ Inne opłaty"
                paid={otherPaid}
                total={otherSum}
                accent="slate"
              />
            )}
          </tbody>

          {/* ─── Σ Razem ─── */}
          <tfoot className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
            <tr>
              <td
                colSpan={6}
                className="border-r border-slate-200 px-2 py-2 text-slate-700 uppercase tracking-wide text-[11px]"
              >
                Σ Razem (towar + logistyka)
              </td>
              <td className="border-r border-slate-200 px-2 py-2 text-right tabular-nums text-slate-900 text-sm">
                {fmtPln(grandTotal)}
              </td>
              <td className="border-r border-slate-200 px-2 py-2 text-center text-[11px] tabular-nums">
                <span className={cn(grandPaid > 0 && "text-emerald-700")}>
                  {fmtPln(grandPaid)}
                </span>
                <span className="text-muted-foreground"> opłacono</span>
              </td>
              <td className="px-2 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <AddOtherDialog
        open={addOtherOpen}
        onClose={() => setAddOtherOpen(false)}
        orderId={orderId}
        rates={rates}
      />
    </Card>
  );
}

// ─── Wiersz nagłówka sekcji ─────────────────────────────────────────

function SectionHeaderRow({
  icon: Icon,
  label,
  summary,
  accent,
  action,
}: {
  icon: LucideIcon;
  label: string;
  summary?: string;
  accent: "indigo" | "amber" | "slate" | "rose" | "violet";
  action?: React.ReactNode;
}) {
  const bg =
    accent === "indigo"
      ? "bg-indigo-50/70"
      : accent === "amber"
        ? "bg-amber-50/60"
        : accent === "rose"
          ? "bg-rose-50/60"
          : accent === "violet"
            ? "bg-violet-50/60"
            : "bg-slate-50/80";
  const text =
    accent === "indigo"
      ? "text-indigo-900"
      : accent === "amber"
        ? "text-amber-900"
        : accent === "rose"
          ? "text-rose-900"
          : accent === "violet"
            ? "text-violet-900"
            : "text-slate-700";
  const ring =
    accent === "indigo"
      ? "border-y-2 border-indigo-200"
      : accent === "amber"
        ? "border-y-2 border-amber-200"
        : accent === "rose"
          ? "border-y-2 border-rose-200"
          : accent === "violet"
            ? "border-y-2 border-violet-200"
            : "border-y border-slate-200";
  return (
    <tr className={cn(bg, ring)}>
      <td colSpan={9} className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Icon className={cn("size-3.5", text)} />
          <span
            className={cn(
              "text-[11px] font-bold uppercase tracking-wide",
              text,
            )}
          >
            {label}
          </span>
          {summary && (
            <span
              className={cn(
                "text-[10px] tabular-nums opacity-70 ml-auto",
                text,
              )}
            >
              {summary}
            </span>
          )}
          {action}
        </div>
      </td>
    </tr>
  );
}

// ─── Wiersz „Σ Suma sekcji" ────────────────────────────────────────

function SectionSubtotalRow({
  label,
  paid,
  total,
  accent,
  vatExempt = false,
}: {
  label: string;
  paid: number;
  total: number;
  accent: "indigo" | "amber" | "slate" | "rose" | "violet";
  /** Cło + prowizja nie mają VATu — pokazuj kwotę bez „netto". */
  vatExempt?: boolean;
}) {
  const bg =
    accent === "indigo"
      ? "bg-indigo-50/40"
      : accent === "amber"
        ? "bg-amber-50/40"
        : accent === "rose"
          ? "bg-rose-50/40"
          : accent === "violet"
            ? "bg-violet-50/40"
            : "bg-slate-50/60";
  const text =
    accent === "indigo"
      ? "text-indigo-900"
      : accent === "amber"
        ? "text-amber-900"
        : accent === "rose"
          ? "text-rose-900"
          : accent === "violet"
            ? "text-violet-900"
            : "text-slate-800";
  const border =
    accent === "indigo"
      ? "border-t border-b-2 border-indigo-300"
      : accent === "amber"
        ? "border-t border-b-2 border-amber-300"
        : accent === "rose"
          ? "border-t border-b-2 border-rose-300"
          : accent === "violet"
            ? "border-t border-b-2 border-violet-300"
            : "border-t border-b-2 border-slate-300";
  const allPaid = paid >= total - 1 && total > 0;
  return (
    <tr className={cn(bg, border, "font-semibold")}>
      <td className="border-r border-slate-200"></td>
      <td
        colSpan={5}
        className={cn(
          "border-r border-slate-200 px-3 py-1.5 text-[11px] uppercase tracking-wide",
          text,
        )}
      >
        {label}
      </td>
      <td
        className={cn(
          "border-r border-slate-200 px-2 py-1.5 text-right tabular-nums text-sm",
          text,
        )}
      >
        {vatExempt ? fmtPlnFlat(total) : fmtPln(total)}
      </td>
      <td
        className="border-r border-slate-200 px-2 py-1.5 text-center text-[11px] tabular-nums"
      >
        <span
          className={cn(
            paid > 0 ? "text-emerald-700 font-bold" : "text-muted-foreground",
            allPaid && "text-emerald-700",
          )}
        >
          {vatExempt ? fmtPlnFlat(paid) : fmtPln(paid)}
        </span>
        <span className="text-muted-foreground"> opłacono</span>
      </td>
      <td className="px-2 py-1.5"></td>
    </tr>
  );
}

// ─── Wiersz transzy ────────────────────────────────────────────────

function TrancheRow({
  tranche,
  goodsTotal,
  rates,
}: {
  tranche: Tranche;
  goodsTotal: number;
  rates: OrderRates;
}) {
  const [pending, startTransition] = useTransition();
  const [pct, setPct] = useState(
    String(Math.round(tranche.percentage * 1000) / 10),
  );

  function defaultRateFor(c: PayCurrency): number {
    if (c === "PLN") return 1;
    if (c === "USD") return rates.usdToPlnRate ?? 0;
    if (c === "EUR") return rates.eurToPlnRate ?? 0;
    return rates.cnyToPlnRate ?? 0;
  }

  const currency: PayCurrency = tranche.paidCurrency ?? "PLN";
  const [rateStr, setRateStr] = useState(
    tranche.paidExchangeRate != null
      ? String(tranche.paidExchangeRate)
      : String(defaultRateFor(currency)),
  );
  const [amountStr, setAmountStr] = useState(
    tranche.paidAmountOriginal != null
      ? String(tranche.paidAmountOriginal)
      : "",
  );
  const effectiveRate = currency === "PLN" ? 1 : Number(rateStr) || 0;
  const enteredAmount = Number(amountStr) || 0;
  const hasManualAmount = amountStr !== "" && enteredAmount > 0;
  const plannedAmountPln = tranche.percentage * goodsTotal;
  const amount =
    hasManualAmount && currency !== "PLN"
      ? enteredAmount * effectiveRate
      : hasManualAmount && currency === "PLN"
        ? enteredAmount
        : plannedAmountPln;

  function togglePaid() {
    startTransition(async () => {
      try {
        await toggleGoodsTranchePaidAction(tranche.id, !tranche.paid, {
          paidCurrency: currency,
          paidExchangeRate: effectiveRate,
          paidAmountOriginal: hasManualAmount ? enteredAmount : null,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveCurrency(c: PayCurrency) {
    const r = defaultRateFor(c);
    setRateStr(String(r));
    if (c === "PLN") setAmountStr("");
    startTransition(async () => {
      try {
        await updateGoodsTranchePaymentAction(tranche.id, {
          paidCurrency: c,
          paidExchangeRate: r,
          paidAmountOriginal: c === "PLN" ? null : undefined,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveRate() {
    const n = Number(rateStr);
    if (!Number.isFinite(n) || n <= 0) return;
    if (Math.abs(n - (tranche.paidExchangeRate ?? 0)) < 0.0001) return;
    startTransition(async () => {
      try {
        await updateGoodsTranchePaymentAction(tranche.id, {
          paidExchangeRate: n,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function saveAmount() {
    const n = amountStr === "" ? null : Number(amountStr);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return;
    if ((n ?? null) === (tranche.paidAmountOriginal ?? null)) return;
    startTransition(async () => {
      try {
        await updateGoodsTranchePaymentAction(tranche.id, {
          paidAmountOriginal: n,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function savePct() {
    const n = Number(pct);
    if (!Number.isFinite(n)) return;
    if (Math.abs(n / 100 - tranche.percentage) < 0.0001) return;
    startTransition(async () => {
      try {
        await updateGoodsTrancheAction(tranche.id, { percentage: n });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const Icon = PHASE_ICON[tranche.phase];

  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/20",
        tranche.paid && "bg-emerald-50/60",
      )}
    >
      {/* Ikona */}
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div
          className={cn(
            "size-7 rounded-md grid place-items-center",
            tranche.paid
              ? "bg-emerald-600 text-white"
              : "bg-indigo-100 text-indigo-700",
          )}
        >
          <Icon className="size-3.5" />
        </div>
      </td>
      {/* Etap */}
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div
          className={cn(
            "font-medium",
            tranche.paid ? "text-emerald-900" : "text-foreground",
          )}
        >
          {PHASE_LABEL[tranche.phase]}
        </div>
      </td>
      {/* % */}
      <td className="border-r border-slate-200 px-2 py-1.5 text-right">
        <div className="inline-flex items-center gap-0.5">
          <Input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={pct}
            onChange={(e) => setPct(e.target.value)}
            onBlur={savePct}
            disabled={pending}
            className="h-6 w-12 text-[11px] px-1.5 text-right tabular-nums"
          />
          <span className="text-[10px] text-muted-foreground">%</span>
        </div>
      </td>
      {/* Waluta */}
      <td className="border-r border-slate-200 px-2 py-1.5">
        <Select
          value={currency}
          onValueChange={(v) => saveCurrency((v as PayCurrency) ?? "PLN")}
        >
          <SelectTrigger className="h-6 text-[11px] px-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PLN">PLN</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
            <SelectItem value="EUR">EUR</SelectItem>
            <SelectItem value="CNY">CNY</SelectItem>
          </SelectContent>
        </Select>
      </td>
      {/* Kwota (waluta) */}
      <td className="border-r border-slate-200 px-2 py-1.5 text-right">
        {currency !== "PLN" ? (
          <div className="inline-flex items-center gap-0.5">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              onBlur={saveAmount}
              disabled={pending}
              className="h-6 w-24 text-[11px] px-1.5 text-right tabular-nums"
              placeholder="0"
            />
            <span className="text-[10px] text-muted-foreground">
              {CURRENCY_SYMBOL[currency]}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </td>
      {/* Kurs */}
      <td className="border-r border-slate-200 px-2 py-1.5 text-right">
        {currency !== "PLN" ? (
          <div className="inline-flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground">×</span>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              onBlur={saveRate}
              disabled={pending}
              className="h-6 w-16 text-[11px] px-1.5 text-right tabular-nums"
            />
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">1.00</span>
        )}
      </td>
      {/* Razem PLN */}
      <td
        className={cn(
          "border-r border-slate-200 px-2 py-1.5 text-right tabular-nums font-semibold",
          tranche.paid && "text-emerald-900",
        )}
      >
        {fmtPln(amount)}
      </td>
      {/* Akcja */}
      <td className="border-r border-slate-200 px-2 py-1.5 text-center">
        <Button
          type="button"
          size="sm"
          variant={tranche.paid ? "outline" : "default"}
          onClick={togglePaid}
          disabled={pending}
          className={cn(
            "h-6 px-2 text-[10px]",
            tranche.paid &&
              "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
          )}
        >
          {tranche.paid ? "✓ Opłacono" : "Akceptuj"}
        </Button>
      </td>
      <td></td>
    </tr>
  );
}

// ─── Wiersz stałej opłaty ─────────────────────────────────────────

function FixedCostRow({
  type,
  label,
  icon: Icon,
  cost,
  orderId,
  rates,
  brokerInfo,
  customsInfo,
  perSztMode = false,
  totalQty = 0,
  defaultPerSztPln = null,
}: {
  type: Exclude<CostType, "INNE">;
  label: string;
  icon: LucideIcon;
  cost: Cost | undefined;
  orderId: string;
  rates: OrderRates;
  brokerInfo?: BrokerCommissionInfo | null;
  customsInfo?: CustomsInfo | null;
  /** PL Krojenie/Szwalnia — input to cena za 1 sztukę, total = perSzt × qty. */
  perSztMode?: boolean;
  /** Suma sztuk zamówienia — używana w perSztMode jako mnożnik. */
  totalQty?: number;
  /** Domyślna stawka (zł/szt) z szablonu firmy — wstawiana do pola input
   *  gdy koszt jeszcze nie ma zapisanej wartości (auto-zaciągnięcie). */
  defaultPerSztPln?: number | null;
}) {
  const [pending, startTransition] = useTransition();
  // W perSztMode `amount` w DB to TOTAL (perSzt × qty). UI pokazuje perSzt.
  // Gdy koszt jeszcze nie istnieje LUB amount=0/null, używamy defaultu z
  // szablonu firmy (auto-zaciągnięcie stawki).
  const initialUiAmount =
    perSztMode && totalQty > 0 && cost?.amount != null && cost.amount > 0
      ? String(round2(cost.amount / totalQty))
      : perSztMode && defaultPerSztPln != null && defaultPerSztPln > 0
        ? String(defaultPerSztPln)
        : cost?.amount != null
          ? String(cost.amount)
          : "";
  const [amount, setAmount] = useState(initialUiAmount);
  const [currency, setCurrency] = useState<PayCurrency>(cost?.currency ?? "PLN");

  function defaultRateFor(c: PayCurrency): number {
    if (c === "PLN") return 1;
    if (c === "USD") return rates.usdToPlnRate ?? 0;
    if (c === "EUR") return rates.eurToPlnRate ?? 0;
    return rates.cnyToPlnRate ?? 0;
  }

  const [rateStr, setRateStr] = useState(
    cost?.exchangeRate != null
      ? String(cost.exchangeRate)
      : String(defaultRateFor(cost?.currency ?? "PLN")),
  );
  const rate = currency === "PLN" ? 1 : Number(rateStr) || 0;
  // perSztMode: input to cena za 1 szt; suma w PLN = amount × totalQty (rate=1).
  // PL koszty zawsze w PLN, więc rate zawsze 1.
  const computedPln = perSztMode
    ? (Number(amount) || 0) * totalQty
    : (Number(amount) || 0) * rate;

  function save(patch?: {
    amount?: string;
    currency?: PayCurrency;
    exchangeRate?: number;
  }) {
    const aRaw = patch?.amount ?? amount;
    // W perSztMode wpisany input to cena za sztukę — zapisujemy TOTAL.
    const aFinal = perSztMode
      ? String(round2((Number(aRaw) || 0) * totalQty))
      : aRaw;
    const c = patch?.currency ?? currency;
    const r =
      patch?.exchangeRate ??
      (c === "PLN" ? 1 : Number(rateStr) || defaultRateFor(c));
    startTransition(async () => {
      try {
        await upsertFixedCostAction(orderId, type, {
          amount: aFinal,
          currency: c,
          exchangeRate: r,
          isNetto: true,
          vatRate: null,
          paid: cost?.paid ?? false,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function togglePaid() {
    if (!cost) return;
    startTransition(async () => {
      try {
        await toggleOrderCostPaidAction(cost.id, !cost.paid);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const filled = !!amount && Number(amount) > 0;

  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/20",
        cost?.paid && "bg-emerald-50/60",
      )}
    >
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div
          className={cn(
            "size-7 rounded-md grid place-items-center",
            cost?.paid
              ? "bg-emerald-600 text-white"
              : filled
                ? "bg-amber-100 text-amber-700"
                : "bg-muted text-muted-foreground/60",
          )}
        >
          <Icon className="size-3.5" />
        </div>
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div
          className={cn(
            "font-medium flex items-center gap-1.5 flex-wrap",
            cost?.paid ? "text-emerald-900" : "text-foreground",
          )}
        >
          {label}
          {brokerInfo && (
            <BrokerBreakdownChip
              info={brokerInfo}
              currentAmount={Number(amount) || 0}
            />
          )}
          {customsInfo && (
            <CustomsBreakdownChip
              info={customsInfo}
              currentAmount={Number(amount) || 0}
            />
          )}
        </div>
      </td>
      <td className="border-r border-slate-200"></td>
      <td className="border-r border-slate-200 px-2 py-1.5">
        {perSztMode ? (
          <span className="text-[11px] font-medium text-muted-foreground">
            PLN
          </span>
        ) : (
          <Select
            value={currency}
            onValueChange={(v) => {
              const cc = (v as PayCurrency) ?? "PLN";
              setCurrency(cc);
              setRateStr(String(defaultRateFor(cc)));
              save({ currency: cc, exchangeRate: defaultRateFor(cc) });
            }}
          >
            <SelectTrigger className="h-6 text-[11px] px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PLN">PLN</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
              <SelectItem value="CNY">CNY</SelectItem>
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5 text-right">
        <div className="inline-flex items-center gap-0.5">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => save()}
            disabled={pending}
            className="h-6 w-24 text-[11px] px-1.5 text-right tabular-nums"
            placeholder="0"
            title={
              perSztMode
                ? `Cena za 1 sztukę × ${totalQty} szt zamówienia`
                : undefined
            }
          />
          <span className="text-[10px] text-muted-foreground">
            {perSztMode
              ? `${CURRENCY_SYMBOL[currency]}/szt`
              : CURRENCY_SYMBOL[currency]}
          </span>
        </div>
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5 text-right">
        {perSztMode ? (
          <span className="text-[10.5px] tabular-nums text-muted-foreground">
            × <span className="font-semibold text-foreground">{totalQty}</span>{" "}
            szt
          </span>
        ) : currency !== "PLN" ? (
          <div className="inline-flex items-center gap-0.5">
            <span className="text-[10px] text-muted-foreground">×</span>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={rateStr}
              onChange={(e) => setRateStr(e.target.value)}
              onBlur={() => save()}
              disabled={pending}
              className="h-6 w-16 text-[11px] px-1.5 text-right tabular-nums"
            />
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground">1.00</span>
        )}
      </td>
      <td
        className={cn(
          "border-r border-slate-200 px-2 py-1.5 text-right tabular-nums font-semibold",
          cost?.paid && "text-emerald-900",
        )}
        title={
          isVatExempt(type)
            ? type === "CLO"
              ? "Cło — opłata celna, nie podlega VAT"
              : "Prowizja pośrednika — bez VAT"
            : undefined
        }
      >
        {filled ? (
          isVatExempt(type) ? (
            fmtPlnFlat(computedPln)
          ) : (
            fmtPln(computedPln)
          )
        ) : (
          <span className="text-muted-foreground font-normal">—</span>
        )}
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5 text-center">
        <Button
          type="button"
          size="sm"
          variant={cost?.paid ? "outline" : "default"}
          onClick={togglePaid}
          disabled={pending || !cost}
          className={cn(
            "h-6 px-2 text-[10px]",
            cost?.paid &&
              "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
            !cost && "opacity-40 pointer-events-none",
          )}
        >
          {cost?.paid ? "✓ Opłacono" : "Akceptuj"}
        </Button>
      </td>
      <td></td>
    </tr>
  );
}

// ─── Wiersz „Inne" (bez edycji inline; tylko akceptacja i kasowanie) ─

function OtherCostRow({ cost }: { cost: Cost }) {
  const [pending, startTransition] = useTransition();

  function togglePaid() {
    startTransition(async () => {
      try {
        await toggleOrderCostPaidAction(cost.id, !cost.paid);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function remove() {
    if (!confirm("Usunąć tę opłatę?")) return;
    startTransition(async () => {
      try {
        await deleteOrderCostAction(cost.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const showFx =
    cost.currency !== "PLN" &&
    cost.amount != null &&
    cost.exchangeRate != null;

  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/20",
        cost.paid && "bg-emerald-50/60",
      )}
    >
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div
          className={cn(
            "size-7 rounded-md grid place-items-center",
            cost.paid
              ? "bg-emerald-600 text-white"
              : "bg-slate-100 text-slate-700",
          )}
        >
          <Receipt className="size-3.5" />
        </div>
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5">
        <div
          className={cn(
            "font-medium truncate",
            cost.paid ? "text-emerald-900" : "text-foreground",
          )}
          title={cost.notes ?? undefined}
        >
          {cost.name ?? "Inne"}
        </div>
      </td>
      <td className="border-r border-slate-200"></td>
      <td className="border-r border-slate-200 px-2 py-1.5">
        <span className="text-[10px] text-muted-foreground">
          {cost.currency}
        </span>
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5 text-right text-[10px] text-muted-foreground tabular-nums">
        {showFx
          ? `${Number(cost.amount).toFixed(2)} ${CURRENCY_SYMBOL[cost.currency]}`
          : "—"}
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5 text-right text-[10px] text-muted-foreground tabular-nums">
        {showFx ? `× ${Number(cost.exchangeRate).toFixed(4)}` : "1.00"}
      </td>
      <td
        className={cn(
          "border-r border-slate-200 px-2 py-1.5 text-right tabular-nums font-semibold",
          cost.paid && "text-emerald-900",
        )}
      >
        {fmtPln(cost.amountPln)}
      </td>
      <td className="border-r border-slate-200 px-2 py-1.5 text-center">
        <Button
          type="button"
          size="sm"
          variant={cost.paid ? "outline" : "default"}
          onClick={togglePaid}
          disabled={pending}
          className={cn(
            "h-6 px-2 text-[10px]",
            cost.paid &&
              "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
          )}
        >
          {cost.paid ? "✓ Opłacono" : "Akceptuj"}
        </Button>
      </td>
      <td className="px-2 py-1.5">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Usuń"
          className="text-muted-foreground hover:text-destructive p-0.5"
        >
          <Trash2 className="size-3" />
        </button>
      </td>
    </tr>
  );
}

// ─── Dialog: nowa „Inne" opłata ────────────────────────────────────

function AddOtherDialog({
  open,
  onClose,
  orderId,
  rates,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  rates: OrderRates;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<PayCurrency>("PLN");

  function defaultRateFor(c: PayCurrency): number {
    if (c === "PLN") return 1;
    if (c === "USD") return rates.usdToPlnRate ?? 0;
    if (c === "EUR") return rates.eurToPlnRate ?? 0;
    return rates.cnyToPlnRate ?? 0;
  }

  const [rateStr, setRateStr] = useState(String(defaultRateFor("PLN")));
  const effectiveRate = currency === "PLN" ? 1 : Number(rateStr) || 0;
  const computedPln = (Number(amount) || 0) * effectiveRate;

  function changeCurrency(c: PayCurrency) {
    setCurrency(c);
    setRateStr(String(defaultRateFor(c)));
  }

  function onSubmit() {
    if (!name.trim()) {
      toast.error("Podaj nazwę");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Podaj kwotę");
      return;
    }
    if (currency !== "PLN" && effectiveRate <= 0) {
      toast.error("Podaj kurs waluty");
      return;
    }
    startTransition(async () => {
      try {
        await addOrderCostAction(orderId, {
          type: "INNE",
          name: name.trim(),
          amount,
          currency,
          exchangeRate: effectiveRate,
          isNetto: true,
          vatRate: null,
          paid: false,
        });
        toast.success("Dodano opłatę");
        setName("");
        setAmount("");
        setCurrency("PLN");
        setRateStr("1");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowa opłata (inne)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">Nazwa</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. opłata bankowa"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="amount">Kwota</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Waluta</Label>
              <Select
                value={currency}
                onValueChange={(v) =>
                  changeCurrency((v as PayCurrency) ?? "PLN")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLN">PLN</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="CNY">CNY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {currency !== "PLN" && (
            <div className="space-y-1">
              <Label htmlFor="rate">Kurs (PLN za 1 jednostkę)</Label>
              <Input
                id="rate"
                type="number"
                step="0.0001"
                min="0"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                placeholder={`np. ${defaultRateFor(currency).toFixed(4)}`}
              />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground italic">
            Wszystkie opłaty zamówienia wpisujemy w wartościach{" "}
            <strong>netto</strong>.
          </p>
          {amount && Number(amount) > 0 && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs flex justify-between items-center">
              <span className="text-muted-foreground">Razem w PLN (netto)</span>
              <span className="font-semibold tabular-nums">
                {fmtPln(computedPln)}
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? "Dodaję…" : "Dodaj"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tooltip prowizji pośrednika ────────────────────────────────────

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function BrokerBreakdownChip({
  info,
  currentAmount,
}: {
  info: BrokerCommissionInfo;
  currentAmount: number;
}) {
  // Auto-wyliczona kwota wg widełek
  const autoAmount = info.individual
    ? 0
    : info.flatPln != null
      ? info.flatPln
      : info.ratePct != null && info.usdToPlnRate > 0
        ? info.totalGoodsUsd * info.ratePct * info.usdToPlnRate
        : 0;
  const drift = Math.abs(autoAmount - currentAmount) > 1;

  const tierLabel = info.individual
    ? "indywidualne (negocjowane)"
    : info.flatPln != null
      ? `ryczałt ${fmtPln(info.flatPln)}`
      : info.ratePct != null
        ? `${(info.ratePct * 100).toFixed(1)}%`
        : "—";
  const bracketLabel = info.maxValueUsd != null
    ? `${fmtUsd(info.minValueUsd)} – ${fmtUsd(info.maxValueUsd)}`
    : `≥ ${fmtUsd(info.minValueUsd)}`;

  const tooltipLines: string[] = [
    `${info.brokerName} — przedział ${bracketLabel}`,
    `Stawka: ${tierLabel}`,
    info.individual
      ? "Brak auto-wyliczenia — negocjowane indywidualnie."
      : info.flatPln != null
        ? `Auto: ${fmtPln(autoAmount)}`
        : info.ratePct != null
          ? `Auto: ${fmtUsd(info.totalGoodsUsd)} × ${(info.ratePct * 100).toFixed(1)}% × ${info.usdToPlnRate.toFixed(4)} = ${fmtPln(autoAmount)}`
          : "",
    drift && currentAmount > 0
      ? `Wpisano: ${fmtPln(currentAmount)} (różnica ${fmtPln(currentAmount - autoAmount)})`
      : "",
  ].filter(Boolean);

  return (
    <span
      className="group/broker relative inline-flex items-center gap-1 rounded-md bg-indigo-50 ring-1 ring-indigo-200 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800 tabular-nums cursor-help"
      title={tooltipLines.join("\n")}
    >
      🛂 {fmtUsd(info.totalGoodsUsd)}
      {info.individual ? (
        <span className="text-amber-700">· indyw.</span>
      ) : info.flatPln != null ? (
        <span>· ryczałt</span>
      ) : info.ratePct != null ? (
        <span>· {(info.ratePct * 100).toFixed(1)}%</span>
      ) : null}
      {/* Rozbudowany popover na hover (CSS-only) */}
      <span
        className="pointer-events-none absolute left-0 top-full mt-1 z-50 w-72 rounded-md bg-slate-900 text-white p-2 text-[10px] leading-snug shadow-lg opacity-0 group-hover/broker:opacity-100 transition-opacity"
      >
        <div className="font-bold text-indigo-200 mb-1">
          {info.brokerName} — przedział {bracketLabel}
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 tabular-nums">
          <span className="text-slate-400">Wartość towaru:</span>
          <span className="font-semibold">{fmtUsd(info.totalGoodsUsd)}</span>
          <span className="text-slate-400">Stawka:</span>
          <span className="font-semibold">{tierLabel}</span>
          {!info.individual && info.ratePct != null && (
            <>
              <span className="text-slate-400">Kurs USD→PLN:</span>
              <span className="font-semibold">
                {info.usdToPlnRate.toFixed(4)}
              </span>
            </>
          )}
          <span className="text-slate-400">Prowizja auto:</span>
          <span className="font-bold text-emerald-300">
            {info.individual ? "—" : fmtPln(autoAmount)}
          </span>
          {currentAmount > 0 && (
            <>
              <span className="text-slate-400">Wpisano:</span>
              <span
                className={cn(
                  "font-bold",
                  drift ? "text-amber-300" : "text-emerald-300",
                )}
              >
                {fmtPln(currentAmount)}
              </span>
            </>
          )}
        </div>
        {!info.individual && info.ratePct != null && (
          <div className="mt-1 pt-1 border-t border-slate-700 text-slate-300 italic">
            {fmtUsd(info.totalGoodsUsd)} × {(info.ratePct * 100).toFixed(1)}%
            × {info.usdToPlnRate.toFixed(4)} = {fmtPln(autoAmount)}
          </div>
        )}
        {info.individual && (
          <div className="mt-1 pt-1 border-t border-slate-700 text-amber-300 italic">
            Powyżej {fmtUsd(info.minValueUsd)} — negocjowane indywidualnie.
          </div>
        )}
      </span>
    </span>
  );
}

// ─── Tooltip cła importowego ────────────────────────────────────────

function CustomsBreakdownChip({
  info,
  currentAmount,
}: {
  info: CustomsInfo;
  currentAmount: number;
}) {
  const autoAmount = info.totalCustomsDutyPln;
  const drift = Math.abs(autoAmount - currentAmount) > 1;
  const isMixed = info.uniformRatePct == null;
  const avgPct =
    info.totalGoodsValuePln > 0
      ? (info.totalCustomsDutyPln / info.totalGoodsValuePln) * 100
      : 0;

  const rateLabel = isMixed
    ? `mix · ~${avgPct.toFixed(1)}%`
    : `${(info.uniformRatePct! * 100).toFixed(1)}%`;

  const tooltipLines: string[] = [
    isMixed
      ? "Cło — mieszane stawki wg kategorii/produktów"
      : `Cło ${(info.uniformRatePct! * 100).toFixed(1)}% od wartości towaru`,
    `Wartość towaru: ${fmtPln(info.totalGoodsValuePln)}`,
    `Auto: ${fmtPln(autoAmount)}`,
    drift && currentAmount > 0
      ? `Wpisano: ${fmtPln(currentAmount)} (różnica ${fmtPln(currentAmount - autoAmount)})`
      : "",
  ].filter(Boolean);

  return (
    <span
      className="group/customs relative inline-flex items-center gap-1 rounded-md bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 tabular-nums cursor-help"
      title={tooltipLines.join("\n")}
    >
      🛃 {rateLabel}
      <span className="pointer-events-none absolute left-0 top-full mt-1 z-50 w-72 rounded-md bg-slate-900 text-white p-2 text-[10px] leading-snug shadow-lg opacity-0 group-hover/customs:opacity-100 transition-opacity">
        <div className="font-bold text-amber-200 mb-1">
          🛃 Cło importowe {isMixed ? "(mieszane)" : `· ${(info.uniformRatePct! * 100).toFixed(1)}%`}
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 tabular-nums">
          <span className="text-slate-400">Wartość towaru:</span>
          <span className="font-semibold">
            {fmtPln(info.totalGoodsValuePln)}
          </span>
          {!isMixed && (
            <>
              <span className="text-slate-400">Stawka:</span>
              <span className="font-semibold">
                {(info.uniformRatePct! * 100).toFixed(1)}%
              </span>
            </>
          )}
          {isMixed && (
            <>
              <span className="text-slate-400">Średnia efekt.:</span>
              <span className="font-semibold">{avgPct.toFixed(2)}%</span>
            </>
          )}
          <span className="text-slate-400">Cło auto:</span>
          <span className="font-bold text-emerald-300">
            {fmtPln(autoAmount)}
          </span>
          {currentAmount > 0 && (
            <>
              <span className="text-slate-400">Wpisano:</span>
              <span
                className={cn(
                  "font-bold",
                  drift ? "text-amber-300" : "text-emerald-300",
                )}
              >
                {fmtPln(currentAmount)}
              </span>
            </>
          )}
        </div>
        {isMixed && info.byRate.length > 0 && (
          <div className="mt-1 pt-1 border-t border-slate-700 space-y-0.5">
            <div className="text-slate-400 text-[9px] uppercase tracking-wide">
              Podział wg stawki
            </div>
            {info.byRate.map((r) => (
              <div
                key={r.ratePct}
                className="flex items-center justify-between gap-2 tabular-nums"
              >
                <span className="text-slate-300">
                  {(r.ratePct * 100).toFixed(1)}% × {fmtPln(r.goodsValuePln)}
                </span>
                <span className="font-semibold">{fmtPln(r.dutyPln)}</span>
              </div>
            ))}
          </div>
        )}
        {!isMixed && (
          <div className="mt-1 pt-1 border-t border-slate-700 text-slate-300 italic">
            {fmtPln(info.totalGoodsValuePln)} ×{" "}
            {(info.uniformRatePct! * 100).toFixed(1)}% = {fmtPln(autoAmount)}
          </div>
        )}
      </span>
    </span>
  );
}
