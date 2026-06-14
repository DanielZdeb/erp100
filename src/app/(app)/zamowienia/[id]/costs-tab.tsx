"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import {
  addOrderCostAction,
  updateOrderCostAction,
  deleteOrderCostAction,
  toggleOrderCostPaidAction,
  toggleGoodsTranchePaidAction,
  updateGoodsTrancheAction,
} from "@/server/order-costs";
import type { ContainerResult } from "@/lib/kalkulacje";

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

const COST_LABEL: Record<CostType, string> = {
  KONTROLA_JAKOSCI: "Kontrola jakości",
  ODPRAWA: "Odprawa",
  KOSZTY_TERMINALOWE: "Koszty terminalowe",
  TRANSPORT_LADOWY: "Transport lądowy DE → PL",
  TRANSPORT_MORSKI: "Transport morski CN → PL",
  CLO: "Cło",
  PROWIZJA_POSREDNIKA: "Prowizja Fullbax (pośrednik)",
  VAT: "VAT",
  CIECIE: "Cięcie",
  KROJENIE: "Krojenie",
  SZWALNIA: "Szwalnia",
  INNE: "Inne",
};

type CostCurrencyT = "PLN" | "USD" | "EUR" | "CNY";
const CURRENCY_SYMBOL: Record<CostCurrencyT, string> = {
  PLN: "zł",
  USD: "$",
  EUR: "€",
  CNY: "¥",
};

const TYPICAL_DEFAULTS: { type: CostType; amountPln: number }[] = [
  { type: "KONTROLA_JAKOSCI", amountPln: 2500 },
  { type: "ODPRAWA", amountPln: 800 },
  { type: "KOSZTY_TERMINALOWE", amountPln: 1900 },
  { type: "TRANSPORT_LADOWY", amountPln: 9000 },
  { type: "TRANSPORT_MORSKI", amountPln: 11000 },
  { type: "CLO", amountPln: 3000 },
  { type: "PROWIZJA_POSREDNIKA", amountPln: 10000 },
];

type Cost = {
  id: string;
  type: CostType;
  name: string | null;
  amountPln: number;
  amount: number | null;
  currency: CostCurrencyT;
  exchangeRate: number | null;
  isNetto: boolean;
  vatRate: number | null;
  paid: boolean;
  notes: string | null;
};

type GoodsTranchePhase = "PRE_PRODUCTION" | "POST_PRODUCTION" | "IN_PORT";

const PHASE_LABEL: Record<GoodsTranchePhase, string> = {
  PRE_PRODUCTION: "Zaliczka przed produkcją",
  POST_PRODUCTION: "Po produkcji / QC",
  IN_PORT: "W porcie / przed odbiorem",
};

const PHASE_THEME: Record<GoodsTranchePhase, { ring: string; iconBg: string; text: string }> = {
  PRE_PRODUCTION: {
    ring: "ring-slate-200",
    iconBg: "bg-slate-100 text-slate-700",
    text: "text-slate-700",
  },
  POST_PRODUCTION: {
    ring: "ring-purple-200",
    iconBg: "bg-purple-100 text-purple-700",
    text: "text-purple-700",
  },
  IN_PORT: {
    ring: "ring-cyan-200",
    iconBg: "bg-cyan-100 text-cyan-700",
    text: "text-cyan-700",
  },
};

type Tranche = {
  id: string;
  phase: GoodsTranchePhase;
  percentage: number;
  paid: boolean;
  paidAt: Date | null;
  notes: string | null;
};

export function CostsTab({
  orderId,
  costs,
  calc,
  tranches,
  cnyToPlnRate,
  usdToPlnRate,
  eurToPlnRate,
  vatRate,
}: {
  orderId: string;
  costs: Cost[];
  calc: ContainerResult;
  tranches: Tranche[];
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  eurToPlnRate: number | null;
  vatRate: number | null;
}) {
  const [dialog, setDialog] = useState<{ open: true; cost: Cost | null } | { open: false }>({ open: false });

  // Sumy
  const containerTotal = costs.reduce((s, c) => s + c.amountPln, 0);
  const containerPaid = costs.filter((c) => c.paid).reduce((s, c) => s + c.amountPln, 0);
  const containerUnpaid = containerTotal - containerPaid;

  const goodsTotal = calc.totalGoodsValuePln;
  const goodsTranches = tranches
    .slice()
    .sort((a, b) => phaseOrder(a.phase) - phaseOrder(b.phase));
  const goodsPaid = goodsTranches
    .filter((t) => t.paid)
    .reduce((s, t) => s + t.percentage * goodsTotal, 0);
  const goodsUnpaid = goodsTotal - goodsPaid;
  const trancheTotalPct = goodsTranches.reduce((s, t) => s + t.percentage, 0);

  const grandTotal = goodsTotal + containerTotal;
  const grandUnpaid = goodsUnpaid + containerUnpaid;

  return (
    <div className="space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiSmall label="Wartość towaru (brutto)" value={fmtPln(goodsTotal)} />
        <KpiSmall
          label="Koszty kontenera"
          value={fmtPln(containerTotal)}
          sub={`${calc.costPerM3.toFixed(2)} zł / m³`}
        />
        <KpiSmall
          label="Suma do zapłaty"
          value={fmtPln(grandTotal)}
          accent="neutral"
        />
        <KpiSmall
          label="Pozostało"
          value={fmtPln(grandUnpaid)}
          accent={grandUnpaid > 0 ? "warn" : "ok"}
        />
      </div>

      {/* Transze opłaty za towar */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-heading font-semibold">
              Opłata za towar — transze
            </h3>
            <p className="text-xs text-muted-foreground">
              Wartość towaru ({fmtPln(goodsTotal)}) rozdzielona na 3 etapy
              płatności. Procenty są edytowalne (suma:{" "}
              <span
                className={cn(
                  Math.abs(trancheTotalPct - 1) > 0.001 && "text-amber-700",
                )}
              >
                {(trancheTotalPct * 100).toFixed(0)}%
              </span>
              ).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {goodsTranches.map((t) => (
            <TrancheCard
              key={t.id}
              tranche={t}
              goodsTotal={goodsTotal}
            />
          ))}
        </div>
      </section>

      {/* Dodatkowe opłaty kontenera */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-heading font-semibold">
              Dodatkowe opłaty kontenera
            </h3>
            <p className="text-xs text-muted-foreground">
              Wpływają na koszt 1 m³ i finalną cenę 1 szt produktów.
              Akceptujemy wiele walut, netto/brutto — przeliczanie auto.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setDialog({ open: true, cost: null })}
              className="gap-2"
            >
              <Plus className="size-4" />
              Dodaj opłatę
            </Button>
            {costs.length === 0 && (
              <QuickAddTypicalButton orderId={orderId} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiSmall label="Suma kosztów" value={fmtPln(containerTotal)} />
          <KpiSmall label="Zapłacone" value={fmtPln(containerPaid)} accent="ok" />
          <KpiSmall
            label="Do zapłaty"
            value={fmtPln(containerUnpaid)}
            accent={containerUnpaid > 0 ? "warn" : "neutral"}
          />
          <KpiSmall
            label="Koszt 1m³"
            value={`${calc.costPerM3.toFixed(2)} zł`}
          />
        </div>

        {costs.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Brak opłat. Dodaj pierwszą lub użyj &quot;Załaduj typowe&quot;.
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Pozycja</TableHead>
                  <TableHead>Waluta</TableHead>
                  <TableHead className="text-right">Kwota oryginalna</TableHead>
                  <TableHead className="text-right">PLN brutto</TableHead>
                  <TableHead className="w-[1%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costs.map((c) => (
                  <CostRow
                    key={c.id}
                    cost={c}
                    onEdit={() => setDialog({ open: true, cost: c })}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <CostDialog
        state={dialog}
        onClose={() => setDialog({ open: false })}
        orderId={orderId}
        rates={{ cnyToPlnRate, usdToPlnRate, eurToPlnRate, vatRate }}
      />
    </div>
  );
}

function phaseOrder(p: GoodsTranchePhase): number {
  return p === "PRE_PRODUCTION" ? 0 : p === "POST_PRODUCTION" ? 1 : 2;
}

// ─── Karta transzy ───────────────────────────────────────────────────

function TrancheCard({
  tranche,
  goodsTotal,
}: {
  tranche: Tranche;
  goodsTotal: number;
}) {
  const [pending, startTransition] = useTransition();
  const [pct, setPct] = useState(String(Math.round(tranche.percentage * 1000) / 10));
  const theme = PHASE_THEME[tranche.phase];
  const amount = tranche.percentage * goodsTotal;

  function togglePaid() {
    startTransition(async () => {
      try {
        await toggleGoodsTranchePaidAction(tranche.id, !tranche.paid);
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
        toast.success("Zaktualizowano %");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card
      className={cn(
        "p-4 space-y-2 ring-1",
        theme.ring,
        tranche.paid && "bg-emerald-50/30 ring-emerald-200",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={cn("text-xs font-medium uppercase tracking-wide", theme.text)}>
            {PHASE_LABEL[tranche.phase]}
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              onBlur={savePct}
              className="h-7 w-16 text-xs"
              disabled={pending}
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <div className="text-2xl font-heading font-bold tabular-nums mt-1">
            {fmtPln(amount)}
          </div>
        </div>
        <div className={cn("size-9 rounded-lg grid place-items-center shrink-0", theme.iconBg)}>
          <span className="text-sm font-semibold">
            {(tranche.percentage * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      <label className="flex items-center gap-2 pt-2 border-t cursor-pointer">
        <Checkbox
          checked={tranche.paid}
          onCheckedChange={togglePaid}
          disabled={pending}
        />
        <span className="text-sm font-medium">
          {tranche.paid ? "Zapłacono" : "Do zapłaty"}
        </span>
        {tranche.paid && tranche.paidAt && (
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(tranche.paidAt).toLocaleDateString("pl-PL")}
          </span>
        )}
      </label>
    </Card>
  );
}

// ─── Wiersz kosztu z walutą ──────────────────────────────────────────

function CostRow({ cost, onEdit }: { cost: Cost; onEdit: () => void }) {
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

  function onDelete() {
    if (!confirm("Usunąć ten koszt?")) return;
    startTransition(async () => {
      try {
        await deleteOrderCostAction(cost.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const original = cost.amount ?? cost.amountPln;
  const symbol = CURRENCY_SYMBOL[cost.currency];

  return (
    <TableRow>
      <TableCell>
        <Checkbox
          checked={cost.paid}
          onCheckedChange={togglePaid}
          disabled={pending}
          aria-label="Zapłacone"
        />
      </TableCell>
      <TableCell>
        <div className="font-medium">{cost.name ?? COST_LABEL[cost.type]}</div>
        <div className="flex gap-2 items-center mt-0.5">
          {cost.name && (
            <Badge variant="secondary" className="text-[10px]">
              {COST_LABEL[cost.type]}
            </Badge>
          )}
          {cost.notes && (
            <span className="text-xs text-muted-foreground">{cost.notes}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-mono">
          {cost.currency}
        </Badge>
        {cost.isNetto && (
          <Badge variant="secondary" className="ml-1 text-[10px]">
            netto
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {original.toFixed(2)} {symbol}
        {cost.exchangeRate && cost.currency !== "PLN" && (
          <div className="text-[10px] text-muted-foreground">
            kurs {cost.exchangeRate.toFixed(4)}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmtPln(cost.amountPln)}
      </TableCell>
      <TableCell>
        <div className="flex gap-1 justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={pending}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={pending}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function KpiSmall({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: "ok" | "warn" | "neutral";
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-lg font-heading font-bold tabular-nums",
            accent === "ok" && "text-emerald-700",
            accent === "warn" && "text-amber-700",
          )}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ─── Dialog kosztu z walutą + netto/brutto ──────────────────────────

function CostDialog({
  state,
  onClose,
  orderId,
  rates,
}: {
  state: { open: true; cost: Cost | null } | { open: false };
  onClose: () => void;
  orderId: string;
  rates: {
    cnyToPlnRate: number | null;
    usdToPlnRate: number | null;
    eurToPlnRate: number | null;
    vatRate: number | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  const open = state.open;
  const editing = state.open ? state.cost : null;

  const [type, setType] = useState<CostType>(editing?.type ?? "KONTROLA_JAKOSCI");
  const [currency, setCurrency] = useState<CostCurrencyT>(
    editing?.currency ?? "PLN",
  );
  const [amount, setAmount] = useState(
    editing
      ? String(editing.amount ?? editing.amountPln)
      : "",
  );
  const defaultRate =
    currency === "PLN"
      ? 1
      : currency === "USD"
        ? rates.usdToPlnRate ?? 0
        : currency === "EUR"
          ? rates.eurToPlnRate ?? 0
          : rates.cnyToPlnRate ?? 0;
  const [exchangeRate, setExchangeRate] = useState(
    editing?.exchangeRate != null ? String(editing.exchangeRate) : "",
  );
  const [isNetto, setIsNetto] = useState(editing?.isNetto ?? false);
  const [vatPct, setVatPct] = useState(
    editing?.vatRate != null
      ? String(Math.round(editing.vatRate * 100))
      : String(Math.round((rates.vatRate ?? 0.23) * 100)),
  );

  const effectiveRate = currency === "PLN" ? 1 : Number(exchangeRate) || defaultRate || 0;
  const baseInPln = (Number(amount) || 0) * effectiveRate;
  const computedPln = isNetto
    ? baseInPln * (1 + (Number(vatPct) || 0) / 100)
    : baseInPln;

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    payload.type = type;
    payload.currency = currency;
    payload.amount = amount;
    payload.exchangeRate = currency === "PLN" ? "1" : exchangeRate || String(defaultRate);
    payload.isNetto = isNetto ? "true" : "false";
    payload.vatRate = isNetto ? String(Number(vatPct) / 100) : "";

    startTransition(async () => {
      try {
        if (editing) {
          await updateOrderCostAction(editing.id, payload);
          toast.success("Zapisano");
        } else {
          await addOrderCostAction(orderId, payload);
          toast.success("Dodano opłatę");
        }
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edytuj opłatę" : "Nowa opłata"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Typ opłaty</Label>
            <Select value={type} onValueChange={(v) => setType((v as CostType) ?? "KONTROLA_JAKOSCI")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(COST_LABEL) as CostType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {COST_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "INNE" && (
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa własna</Label>
              <Input
                id="name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Kwota</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Waluta</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency((v as CostCurrencyT) ?? "PLN")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLN">PLN — zł</SelectItem>
                  <SelectItem value="USD">USD — $</SelectItem>
                  <SelectItem value="EUR">EUR — €</SelectItem>
                  <SelectItem value="CNY">CNY — ¥</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {currency !== "PLN" && (
            <div className="space-y-2">
              <Label htmlFor="exchangeRate">
                Kurs {currency} → PLN
              </Label>
              <Input
                id="exchangeRate"
                type="number"
                step="0.0001"
                min="0"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                placeholder={
                  defaultRate > 0
                    ? `z nagłówka zamówienia: ${defaultRate}`
                    : "podaj kurs"
                }
              />
            </div>
          )}

          <div className="space-y-2 rounded-md ring-1 ring-border p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="isNetto"
                checked={isNetto}
                onCheckedChange={(c) => setIsNetto(!!c)}
              />
              <Label htmlFor="isNetto" className="cursor-pointer">
                Kwota jest <strong>netto</strong> (dolicz VAT)
              </Label>
            </div>
            {isNetto && (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1 col-span-1">
                  <Label htmlFor="vatPct" className="text-xs">
                    VAT %
                  </Label>
                  <Input
                    id="vatPct"
                    type="number"
                    step="1"
                    value={vatPct}
                    onChange={(e) => setVatPct(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md bg-muted/40 p-3">
            <div className="text-xs text-muted-foreground">Przeliczenie</div>
            <div className="text-lg font-heading font-bold tabular-nums">
              = {fmtPln(computedPln)} brutto
            </div>
            <div className="text-[10px] text-muted-foreground">
              {currency === "PLN"
                ? "PLN"
                : `${Number(amount) || 0} ${CURRENCY_SYMBOL[currency]} × ${effectiveRate.toFixed(4)}`}
              {isNetto && ` × (1 + ${vatPct}% VAT)`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="paid"
              name="paid"
              defaultChecked={editing?.paid ?? false}
            />
            <Label htmlFor="paid">Zapłacone</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notatki</Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={editing?.notes ?? ""}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisuję…" : editing ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddTypicalButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  function add() {
    if (
      !confirm(
        "Dodać typowe opłaty z Excela (kontrola jakości, odprawa, transport, cło, prowizja)?",
      )
    )
      return;
    startTransition(async () => {
      try {
        for (const d of TYPICAL_DEFAULTS) {
          await addOrderCostAction(orderId, {
            type: d.type,
            amount: d.amountPln,
            currency: "PLN",
            paid: false,
          });
        }
        toast.success("Dodano typowe opłaty");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={add}
      className="gap-2"
    >
      {pending ? <X className="size-4" /> : <Check className="size-4" />}
      {pending ? "Dodaję…" : "Załaduj typowe (28 200 zł)"}
    </Button>
  );
}

function fmtPln(n: number): string {
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}
