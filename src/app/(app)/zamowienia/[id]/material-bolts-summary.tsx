"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Layers, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  boltStatus,
  type Bolt,
  type BoltsAnalysis,
  type BoltStatus,
  type ColorBoltSummary,
  colorMeta,
  DEFAULT_BOLT_LENGTH_M,
  DEFAULT_MIN_BOLTS_PER_COLOR,
  type FillSuggestion,
  type MaterialItem,
} from "@/lib/material-bolts";
import {
  applyBoltSuggestionAction,
  updateOrderItemAction,
} from "@/server/order-items";

/**
 * Wizualizacja belek dla zamówienia PL — układ jak tabela:
 *  • Header karty: nazwa koloru (z tłem w danym kolorze).
 *  • Wiersze: BELKA 1..5 — zawsze pokazujemy minimum (puste belki = czerwone).
 *  • Każdy wiersz ma kropkę statusu na początku (czerwony / pomarańczowy /
 *    zielony) + ciemne segmenty cięć + szarą resztkę + licznik X/98 m.
 */
export function MaterialBoltsSummary({
  analysis,
  orderId,
}: {
  analysis: BoltsAnalysis;
  orderId: string;
}) {
  if (analysis.byColor.length === 0) return null;

  return (
    <div className="rounded-xl border bg-white p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold inline-flex items-center gap-2">
            <Layers className="size-4 text-pink-600" />
            Belki materiału — wizualizacja cięcia
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Belki po <strong>{DEFAULT_BOLT_LENGTH_M} m</strong>, minimum{" "}
            <strong>{DEFAULT_MIN_BOLTS_PER_COLOR} belek na kolor</strong>.
            Status kropki:{" "}
            <StatusDot status="empty" />
            <span className="text-rose-700"> brak</span>,{" "}
            <StatusDot status="partial" />
            <span className="text-amber-700"> brakuje</span>,{" "}
            <StatusDot status="full" />
            <span className="text-emerald-700"> pełna</span>.
          </p>
        </div>
        <SummaryStats analysis={analysis} />
      </header>

      <div className="space-y-[70px]">
        {analysis.byColor.map((c) => (
          <ColorSection key={c.color} summary={c} orderId={orderId} />
        ))}
      </div>
    </div>
  );
}

// ─── Statystyki sumaryczne ──────────────────────────────────────────

function SummaryStats({ analysis }: { analysis: BoltsAnalysis }) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <Pill
        label="belek użytych"
        value={analysis.totalBolts.toString()}
        accent="indigo"
      />
      <Pill
        label="metrów"
        value={`${analysis.totalRequestedM.toFixed(1)} m`}
        accent="pink"
      />
      <Pill
        label="wykorzystanie"
        value={`${analysis.utilizationPct.toFixed(1)}%`}
        accent={
          analysis.utilizationPct >= 90
            ? "emerald"
            : analysis.utilizationPct >= 75
              ? "amber"
              : "rose"
        }
      />
    </div>
  );
}

// ─── Sekcja per kolor ──────────────────────────────────────────────

function ColorSection({
  summary,
  orderId,
}: {
  summary: ColorBoltSummary;
  orderId: string;
}) {
  const meta = colorMeta(summary.color);
  // Limit wierszy do max(minBolts, faktycznie użytych) — zawsze ≥ 5.
  const displayedBolts = summary.bolts.slice(
    0,
    Math.max(DEFAULT_MIN_BOLTS_PER_COLOR, summary.boltsUsed),
  );
  return (
    <section className="rounded-lg ring-1 ring-slate-200 overflow-hidden flex items-stretch">
      {/* Pasek koloru — pełna wysokość sekcji (od header do ostatniej belki),
          szerokość 80 px żeby napisy były wyraźne. */}
      <div
        className="w-20 shrink-0 flex items-center justify-center gap-3 py-3"
        style={{
          background: meta.hex,
          color: meta.textOnBg === "light" ? "#fff" : "#0f172a",
        }}
      >
        <span
          className="text-lg font-bold uppercase tracking-[0.3em] whitespace-nowrap"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
        >
          {meta.label}
        </span>
        <span
          className="text-xs font-mono uppercase tracking-widest whitespace-nowrap opacity-75"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
          }}
        >
          {summary.color}
        </span>
      </div>

      {/* Prawa kolumna: header statystyk + ostrzeżenie + belki */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div
          className="px-3 py-2 flex items-center justify-end gap-3 flex-wrap"
          style={{
            background: `${meta.hex}10`,
            borderBottom: `1px solid ${meta.hex}40`,
          }}
        >
          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
            <Pill
              label="belek"
              value={`${summary.boltsUsed}/${DEFAULT_MIN_BOLTS_PER_COLOR} min`}
              accent={summary.meetsMinimum ? "emerald" : "rose"}
            />
            <Pill
              label="metrów"
              value={`${summary.totalRequestedM.toFixed(1)} m`}
              accent="indigo"
            />
            <Pill
              label="wykorz."
              value={`${summary.utilizationPct.toFixed(0)}%`}
              accent={
                summary.utilizationPct >= 90
                  ? "emerald"
                  : summary.utilizationPct >= 75
                    ? "amber"
                    : "rose"
              }
            />
          </div>
        </div>

        {!summary.meetsMinimum && (
          <div className="flex items-start gap-2 bg-rose-50 px-3 py-1.5 text-[11px] text-rose-900 border-b border-rose-200">
            <AlertTriangle className="size-3.5 text-rose-600 shrink-0 mt-0.5" />
            <span>
              Brakuje <strong>{summary.boltsShortOfMinimum}</strong>{" "}
              {pluralBolt(summary.boltsShortOfMinimum)} do minimum. Dosyp
              jeszcze{" "}
              <strong>{summary.metersUntilMinimum.toFixed(1)} m</strong>{" "}
              materiału w tym kolorze.
            </span>
          </div>
        )}
        {summary.meetsMinimum &&
          summary.metersFreeInOpenBolts > 0.5 && (
            <div className="flex items-start gap-2 bg-amber-50/60 px-3 py-1.5 text-[11px] text-amber-900 border-b border-amber-200">
              <TrendingUp className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                W otwartych belkach zostało{" "}
                <strong>{summary.metersFreeInOpenBolts.toFixed(1)} m</strong>{" "}
                wolnego miejsca — możesz dosypać bez nowych belek.
              </span>
            </div>
          )}
        {summary.meetsMinimum &&
          summary.metersFreeInOpenBolts <= 0.5 && (
            <div className="flex items-center gap-2 bg-emerald-50/50 px-3 py-1.5 text-[11px] text-emerald-900 border-b border-emerald-200">
              <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              <span>
                Cięcie wzorowe — odpad{" "}
                <strong>{summary.totalWasteM.toFixed(1)} m</strong>.
              </span>
            </div>
          )}

        {/* Lista zamówionych pozycji tego koloru — z miniaturą + edytowalną ilością */}
        <OrderedItemsList items={summary.items} />

        {/* Sugestie systemu: co dodać / co usunąć żeby zapełnić bez odpadu */}
        <SuggestionsPanel summary={summary} orderId={orderId} />

        <div className="flex-1 bg-white py-1.5">
          {displayedBolts.map((bolt, idx) => (
            <BoltRow
              key={idx}
              bolt={bolt}
              index={idx + 1}
              colorHex={meta.hex}
              textOnBg={meta.textOnBg}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Lista pozycji zamówionych w tym kolorze (z edycją qty) ───────

function OrderedItemsList({ items }: { items: MaterialItem[] }) {
  if (items.length === 0) return null;
  // Sort: po długości rosnąco (4m, 6m, 7m, 8m)
  const sorted = [...items].sort((a, b) => a.lengthM - b.lengthM);
  return (
    <div className="bg-white px-3 py-2 border-b border-slate-200 flex flex-wrap gap-2">
      {sorted.map((it) => (
        <ItemCard key={it.itemId} item={it} />
      ))}
    </div>
  );
}

function ItemCard({ item }: { item: MaterialItem }) {
  const [qty, setQty] = useState(String(item.quantity));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Sync local state gdy ilość zmieni się po stronie serwera (np. po
  // zastosowaniu sugestii) — bez tego input pokazuje starą wartość.
  useEffect(() => {
    setQty(String(item.quantity));
  }, [item.quantity]);

  function commit() {
    const n = Math.max(0, Math.floor(Number(qty) || 0));
    if (n === item.quantity) return;
    startTransition(async () => {
      try {
        await updateOrderItemAction(item.itemId, { quantity: String(n) });
        toast.success(`${item.sku}: ${n} szt`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
        setQty(String(item.quantity));
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-md ring-1 ring-slate-200 bg-slate-50/50 pl-1 pr-2 py-1 min-w-0">
      <div className="size-9 rounded shrink-0 bg-slate-200 overflow-hidden grid place-items-center">
        {item.imageUrl ? (
          // `imageUrl` przychodzi z parsera materiałów (items-tab.tsx) —
          // preferowana jest thumbnailWebpUrl (~5KB), fallback na oryginał.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.name}
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            className="object-cover w-full h-full"
          />
        ) : (
          <span className="text-[8px] text-slate-400 uppercase">brak</span>
        )}
      </div>
      <div className="min-w-0 flex items-center">
        <span
          className="text-[11px] font-mono font-bold text-slate-900 whitespace-nowrap"
          title={item.name}
        >
          {item.sku}
        </span>
      </div>
      <div className="inline-flex items-center gap-0.5 shrink-0">
        <input
          type="number"
          min={0}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          disabled={pending}
          className="h-6 w-12 text-[11px] px-1 text-right tabular-nums ring-1 ring-slate-300 rounded focus:ring-indigo-500 outline-none"
        />
        <span className="text-[10px] text-muted-foreground">szt</span>
      </div>
    </div>
  );
}

// ─── Sugestie systemu (co dodać / co usunąć) ──────────────────────

function SuggestionsPanel({
  summary,
  orderId,
}: {
  summary: ColorBoltSummary;
  orderId: string;
}) {
  // Łączymy SWAP + ADD jako sugestie „uzupełnij do bieżącej liczby belek" —
  // obie utrzymują tę samą liczbę belek a wypełniają je idealnie.
  const fillCurrent: FillSuggestion[] = [
    ...summary.suggestionsToSwap,
    ...summary.suggestionsToAdd,
  ]
    // Najmniej zaangażowane na górę.
    .sort((a, b) => a.totalPiecesMoved - b.totalPiecesMoved)
    .slice(0, 3);
  const reduceToLess = summary.suggestionsToRemove.slice(0, 3);

  if (fillCurrent.length === 0 && reduceToLess.length === 0) return null;

  return (
    <div className="mx-3 my-3 rounded-lg border-2 border-indigo-300 bg-white shadow-sm overflow-hidden">
      <div className="bg-indigo-600 text-white px-3 py-2 flex items-center gap-2">
        <span className="text-base">💡</span>
        <span className="text-xs font-bold uppercase tracking-wide">
          Sugestie systemu — jak zapełnić belki dokładnie
        </span>
      </div>
      <div className="p-3 space-y-3 bg-slate-50/50">
        {fillCurrent.length > 0 && (
          <SuggestionSection
            headline={`Uzupełnij do bieżących ${summary.boltsUsed} belek`}
            subline="Dosyp lub zamień — utrzymuje aktualną liczbę belek, wypełnia każdą do 98 m."
            suggestions={fillCurrent}
            accent="emerald"
            orderId={orderId}
            color={summary.color}
          />
        )}
        {reduceToLess.length > 0 && (
          <SuggestionSection
            headline={`Zmniejsz do ${summary.boltsUsed - 1} belek`}
            subline="Usuń pieces, mieścisz się w jednej belce mniej — wszystkie pełne."
            suggestions={reduceToLess}
            accent="rose"
            orderId={orderId}
            color={summary.color}
          />
        )}
      </div>
    </div>
  );
}

function SuggestionSection({
  headline,
  subline,
  suggestions,
  accent,
  orderId,
  color,
}: {
  headline: string;
  subline: string;
  suggestions: FillSuggestion[];
  accent: "emerald" | "rose";
  orderId: string;
  color: string;
}) {
  const headBgCls =
    accent === "emerald"
      ? "bg-emerald-100 border-emerald-300 text-emerald-900"
      : "bg-rose-100 border-rose-300 text-rose-900";
  return (
    <div className="rounded-md ring-1 ring-slate-200 bg-white overflow-hidden shadow-xs">
      <div
        className={cn(
          "px-3 py-1.5 border-b flex items-baseline gap-2 flex-wrap",
          headBgCls,
        )}
      >
        <span className="text-[13px] font-bold">{headline}</span>
        <span className="text-[10.5px] opacity-80">{subline}</span>
      </div>
      <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {suggestions.map((s, i) => (
          <SuggestionCard
            key={i}
            suggestion={s}
            accent={accent}
            orderId={orderId}
            color={color}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  accent,
  orderId,
  color,
}: {
  suggestion: FillSuggestion;
  accent: "emerald" | "rose";
  orderId: string;
  color: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isSwap = s.remove.length > 0 && s.add.length > 0;
  const isAdd = s.remove.length === 0 && s.add.length > 0;
  const isRemove = s.remove.length > 0 && s.add.length === 0;
  const label = isSwap ? "Zamień" : isAdd ? "Dodaj" : "Usuń";
  const cardCls =
    accent === "emerald"
      ? "ring-emerald-300 bg-white hover:bg-emerald-50/40"
      : "ring-rose-300 bg-white hover:bg-rose-50/40";
  const labelCls =
    accent === "emerald"
      ? "bg-emerald-600 text-white"
      : "bg-rose-600 text-white";
  const piecesTotal = s.totalPiecesMoved;

  function apply() {
    // Budujemy listę zmian (delta per długość).
    const changes: { lengthM: number; delta: number }[] = [];
    for (const p of s.remove) {
      changes.push({ lengthM: p.lengthM, delta: -p.count });
    }
    for (const p of s.add) {
      changes.push({ lengthM: p.lengthM, delta: p.count });
    }
    startTransition(async () => {
      try {
        const res = await applyBoltSuggestionAction({
          orderId,
          color,
          changes,
        });
        toast.success(`Zastosowano: ${res.summary}`);
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Nie udało się zastosować",
        );
      }
    });
  }

  return (
    <div
      className={cn(
        "rounded-md ring-1 px-2.5 py-2 flex flex-col gap-2 transition-colors",
        cardCls,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded shrink-0",
            labelCls,
          )}
        >
          {label}
        </span>
        <span className="text-[10px] text-slate-600 tabular-nums">
          {piecesTotal} szt · {(s.netDeltaM > 0 ? "+" : "") + s.netDeltaM} m
        </span>
        <button
          type="button"
          onClick={apply}
          disabled={pending}
          className={cn(
            "ml-auto text-[11px] uppercase tracking-wide font-bold px-2.5 py-1 rounded shadow-sm transition-all shrink-0",
            accent === "emerald"
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-rose-600 text-white hover:bg-rose-700",
            pending && "opacity-50 cursor-not-allowed",
          )}
        >
          {pending ? "…" : "Zastosuj"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[12px]">
        {isRemove || isSwap ? (
          <span className="inline-flex flex-wrap gap-1">
            {s.remove.map((p, i) => (
              <PiecePill
                key={`r-${i}`}
                sign="-"
                count={p.count}
                lengthM={p.lengthM}
                accent="rose"
              />
            ))}
          </span>
        ) : null}
        {isAdd || isSwap ? (
          <span className="inline-flex flex-wrap gap-1">
            {s.add.map((p, i) => (
              <PiecePill
                key={`a-${i}`}
                sign="+"
                count={p.count}
                lengthM={p.lengthM}
                accent="emerald"
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PiecePill({
  sign,
  count,
  lengthM,
  accent,
}: {
  sign: "+" | "-";
  count: number;
  lengthM: number;
  accent: "emerald" | "rose";
}) {
  const cls =
    accent === "emerald"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-300"
      : "bg-rose-100 text-rose-900 ring-rose-300";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ring-1 tabular-nums font-semibold",
        cls,
      )}
    >
      <span className="opacity-70">{sign}</span>
      <span>{count}×</span>
      <span>{lengthM} m</span>
    </span>
  );
}

// ─── Wiersz pojedynczej belki ──────────────────────────────────────

function BoltRow({
  bolt,
  index,
  colorHex,
  textOnBg,
}: {
  bolt: Bolt;
  index: number;
  colorHex: string;
  textOnBg: "light" | "dark";
}) {
  const status = boltStatus(bolt);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-slate-50/60">
      <StatusDot status={status} />
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground font-bold">
        Belka {index}
      </span>
      {/* Bar */}
      <div className="flex-1 h-7 rounded ring-1 ring-slate-200 overflow-hidden flex">
        {bolt.cuts.map((cut, i) => {
          const pct = (cut.lengthM / bolt.capacityM) * 100;
          return (
            <div
              key={i}
              className="h-full flex items-center justify-center border-r border-white/30 last:border-r-0"
              style={{
                width: `${pct}%`,
                background: colorHex,
                color: textOnBg === "light" ? "#fff" : "#0f172a",
              }}
              title={`${cut.sku} · ${cut.lengthM} m`}
            >
              <span className="text-[10px] font-semibold opacity-95">
                {cut.lengthM} m
              </span>
            </div>
          );
        })}
        {bolt.remainingM > 0.1 && (
          <div
            className="h-full flex items-center justify-center text-slate-500 italic bg-slate-50"
            style={{
              width: `${(bolt.remainingM / bolt.capacityM) * 100}%`,
            }}
            title={`Wolne ${Math.round(bolt.remainingM)} m`}
          >
            <span className="text-[9.5px]">
              {Math.round(bolt.remainingM)} m
            </span>
          </div>
        )}
      </div>
      <span
        className={cn(
          "w-20 shrink-0 text-right text-[10.5px] tabular-nums font-medium",
          status === "full"
            ? "text-emerald-600 font-bold"
            : "text-muted-foreground",
        )}
      >
        {Math.round(bolt.usedM)} / {bolt.capacityM} m
      </span>
    </div>
  );
}

// ─── Kropka statusu ────────────────────────────────────────────────

function StatusDot({ status }: { status: BoltStatus }) {
  const styles: Record<BoltStatus, string> = {
    empty: "bg-rose-500 ring-rose-300",
    partial: "bg-amber-500 ring-amber-300",
    full: "bg-emerald-500 ring-emerald-300",
  };
  return (
    <span
      className={cn(
        "size-3 rounded-full ring-2 inline-block shrink-0",
        styles[status],
      )}
      aria-label={status}
    />
  );
}

// ─── Pomocnicze pill / pluralizacja ────────────────────────────────

function Pill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "indigo" | "pink" | "emerald" | "amber" | "rose";
}) {
  const ACCENT: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    pink: "bg-pink-50 text-pink-700 ring-pink-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded ring-1 text-[10.5px] whitespace-nowrap",
        ACCENT[accent],
      )}
    >
      <span className="uppercase tracking-wide font-bold opacity-70">
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function pluralBolt(n: number): string {
  if (n === 1) return "belki";
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 12 && lastTwo <= 14) return "belek";
  if (last >= 2 && last <= 4) return "belki";
  return "belek";
}
