"use client";

import { useMemo, useState } from "react";
import { Calculator, Package, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

type Row = {
  id: string;
  productCode: string;
  name: string;
  image: string | null;
  categoryName: string;
  salePriceNetto: number;
  costNetto: number;
  shippingCostNetto: number;
  warehouseCostNetto: number;
  commissionPct: number;
  adCostNetto: number;
  customerShipNetto: number;
};

const VAT = 1.23;

function brutto(n: number): number {
  return n * VAT;
}

function fmt(n: number): string {
  return n.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtInt(n: number): string {
  return n.toLocaleString("pl-PL", { maximumFractionDigits: 0 });
}

export function KalkulatorZyskowClient({ rows }: { rows: Row[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [hideZero, setHideZero] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.categoryName));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pl"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeCategory && r.categoryName !== activeCategory) return false;
      if (hideZero && (qty[r.id] ?? 0) === 0) return false;
      if (q) {
        return (
          r.name.toLowerCase().includes(q) ||
          r.productCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, activeCategory, hideZero, qty]);

  // Per-row computed values (brutto)
  function computeRow(r: Row, n: number) {
    const revenue = brutto(r.salePriceNetto + r.customerShipNetto) * n;
    const costGoods = brutto(r.costNetto) * n;
    const costShipping = brutto(r.shippingCostNetto) * n;
    const costWarehouse = brutto(r.warehouseCostNetto) * n;
    const costAd = brutto(r.adCostNetto) * n;
    const commission = brutto(r.salePriceNetto) * r.commissionPct * n;
    const totalCost = costGoods + costShipping + costWarehouse + costAd + commission;
    const profit = revenue - totalCost;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    return {
      revenue,
      costGoods,
      costShipping,
      costWarehouse,
      costAd,
      commission,
      totalCost,
      profit,
      marginPct,
    };
  }

  // Total sumy (po wszystkich rowach gdzie qty > 0)
  const totals = useMemo(() => {
    let revenue = 0,
      costGoods = 0,
      costShipping = 0,
      costWarehouse = 0,
      costAd = 0,
      commission = 0,
      profit = 0,
      totalQty = 0,
      skuCount = 0;
    for (const r of rows) {
      const n = qty[r.id] ?? 0;
      if (n <= 0) continue;
      skuCount++;
      totalQty += n;
      const c = computeRow(r, n);
      revenue += c.revenue;
      costGoods += c.costGoods;
      costShipping += c.costShipping;
      costWarehouse += c.costWarehouse;
      costAd += c.costAd;
      commission += c.commission;
      profit += c.profit;
    }
    const totalCost =
      costGoods + costShipping + costWarehouse + costAd + commission;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    return {
      revenue,
      costGoods,
      costShipping,
      costWarehouse,
      costAd,
      commission,
      totalCost,
      profit,
      marginPct,
      totalQty,
      skuCount,
    };
  }, [rows, qty]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="size-5 text-emerald-700" />
            <h1 className="text-2xl font-bold">Kalkulator zysków</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Wpisz ile sztuk sprzedałeś każdego produktu — system wyliczy
            przychód, wszystkie koszty (towar, wysyłka, magazyn, prowizja,
            reklama) i zysk z marżą. Wartości brutto.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setQty({})}
          className="text-xs text-amber-700 hover:underline flex items-center gap-1"
        >
          <X className="size-3" />
          Wyczyść wszystko
        </button>
      </div>

      {/* Filtry */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj nazwa / kod..."
            className="pl-8 pr-3 py-1.5 text-sm rounded-md ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none w-64"
          />
        </div>
        <select
          value={activeCategory ?? ""}
          onChange={(e) => setActiveCategory(e.target.value || null)}
          className="px-3 py-1.5 text-sm rounded-md ring-1 ring-slate-200 focus:ring-2 focus:ring-emerald-400 outline-none bg-white"
        >
          <option value="">Wszystkie kategorie ({rows.length})</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="text-xs text-slate-600 flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            className="size-3.5 accent-emerald-600"
          />
          Tylko z wpisaną ilością
        </label>
        <div className="ml-auto text-xs text-slate-500">
          Pokazane: <strong>{filtered.length}</strong> z {rows.length}
        </div>
      </div>

      {/* Lista produktów */}
      <div className="rounded-lg ring-1 ring-slate-200 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left p-2 w-12"></th>
              <th className="text-left p-2 min-w-[280px]">Produkt</th>
              <th className="text-right p-2">Cena/szt</th>
              <th className="text-center p-2 w-24">Sprzedano</th>
              <th className="text-right p-2">Przychód</th>
              <th className="text-right p-2">Towar</th>
              <th className="text-right p-2">Kurier</th>
              <th className="text-right p-2">Prowizja</th>
              <th className="text-right p-2">Reklama</th>
              <th className="text-right p-2">Zysk</th>
              <th className="text-right p-2">%</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const n = qty[r.id] ?? 0;
              const c = computeRow(r, n);
              const active = n > 0;
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "border-t hover:bg-slate-50",
                    active && "bg-emerald-50/40",
                  )}
                >
                  <td className="p-2">
                    {r.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.image}
                        alt={r.name}
                        className="size-9 object-cover rounded ring-1 ring-slate-200"
                      />
                    ) : (
                      <div className="size-9 rounded bg-slate-100 grid place-items-center text-slate-300">
                        <Package className="size-4" />
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="font-medium truncate max-w-[280px]">
                      {r.name}
                    </div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2">
                      <span className="font-mono">{r.productCode}</span>
                      <span className="text-violet-700">{r.categoryName}</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums p-2 font-semibold text-emerald-700">
                    {fmtInt(brutto(r.salePriceNetto))} zł
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={qty[r.id] ?? ""}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setQty((prev) => {
                          const next = { ...prev };
                          if (Number.isFinite(v) && v > 0) next[r.id] = v;
                          else delete next[r.id];
                          return next;
                        });
                      }}
                      placeholder="0"
                      className="w-16 px-2 py-1 rounded ring-1 ring-slate-200 text-center text-sm tabular-nums focus:ring-2 focus:ring-emerald-400 outline-none"
                    />
                  </td>
                  <td className="text-right tabular-nums p-2 font-semibold">
                    {active ? `${fmtInt(c.revenue)}` : "—"}
                  </td>
                  <td className="text-right tabular-nums p-2 text-rose-700/70">
                    {active ? fmtInt(c.costGoods) : "—"}
                  </td>
                  <td className="text-right tabular-nums p-2 text-rose-700/70">
                    {active ? fmtInt(c.costShipping) : "—"}
                  </td>
                  <td className="text-right tabular-nums p-2 text-rose-700/70">
                    {active ? fmtInt(c.commission) : "—"}
                  </td>
                  <td className="text-right tabular-nums p-2 text-rose-700/70">
                    {active ? fmtInt(c.costAd) : "—"}
                  </td>
                  <td className="text-right tabular-nums p-2 font-bold">
                    {active ? (
                      <span
                        className={cn(
                          c.profit > 0
                            ? "text-emerald-700"
                            : c.profit < 0
                              ? "text-rose-700"
                              : "text-muted-foreground",
                        )}
                      >
                        {fmtInt(c.profit)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-right tabular-nums p-2 font-semibold">
                    {active ? (
                      <span
                        className={cn(
                          c.marginPct >= 30
                            ? "text-emerald-700"
                            : c.marginPct >= 10
                              ? "text-amber-700"
                              : "text-rose-700",
                        )}
                      >
                        {c.marginPct.toFixed(1)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sumy globalne — sticky bottom */}
      <div className="sticky bottom-4 mt-4 rounded-xl bg-white ring-2 ring-emerald-300 shadow-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="size-4 text-emerald-700" />
          <h2 className="text-sm font-heading font-bold text-emerald-900 uppercase tracking-wide">
            Podsumowanie
          </h2>
          <span className="ml-auto text-xs text-slate-500">
            Wpisano: <strong>{totals.skuCount}</strong> SKU,{" "}
            <strong>{fmtInt(totals.totalQty)}</strong> szt łącznie
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          <SummaryCard label="Przychód" value={totals.revenue} accent="emerald" />
          <SummaryCard label="Towar" value={totals.costGoods} accent="rose" />
          <SummaryCard label="Kurier" value={totals.costShipping} accent="rose" />
          <SummaryCard
            label="Magazyn"
            value={totals.costWarehouse}
            accent="rose"
          />
          <SummaryCard
            label="Prowizja"
            value={totals.commission}
            accent="rose"
          />
          <SummaryCard label="Reklama" value={totals.costAd} accent="rose" />
          <SummaryCard
            label="Zysk"
            value={totals.profit}
            accent={totals.profit > 0 ? "emerald" : "rose"}
            big
            margin={totals.marginPct}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  big,
  margin,
}: {
  label: string;
  value: number;
  accent: "emerald" | "rose";
  big?: boolean;
  margin?: number;
}) {
  const colors =
    accent === "emerald"
      ? "bg-emerald-50 ring-emerald-200 text-emerald-900"
      : "bg-rose-50/60 ring-rose-200 text-rose-900";
  return (
    <div className={cn("rounded-lg ring-1 p-2", colors)}>
      <div className="text-[9px] uppercase tracking-wider font-bold opacity-80">
        {label}
      </div>
      <div
        className={cn(
          "tabular-nums font-bold mt-0.5",
          big ? "text-base" : "text-sm",
        )}
      >
        {fmt(value)} zł
      </div>
      {margin != null && (
        <div className="text-[10px] opacity-70 font-medium">
          marża {margin.toFixed(1)}%
        </div>
      )}
    </div>
  );
}
