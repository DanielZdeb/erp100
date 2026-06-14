"use client";

import { useState, useTransition } from "react";
import { Handshake, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  deleteBrokerTierAction,
  resetBrokerTiersToDefault,
  upsertBrokerTierAction,
} from "@/server/broker-commission";

type Tier = {
  id: string;
  brokerName: string;
  minValueUsd: number;
  maxValueUsd: number | null;
  ratePct: number | null; // 0..1
  flatPln: number | null;
  individual: boolean;
  sortOrder: number;
};

function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPln(n: number): string {
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł`;
}

export function BrokerCommissionForm({
  brokerName,
  tiers,
}: {
  brokerName: string;
  tiers: Tier[];
}) {
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  function reset() {
    if (
      !confirm(
        `Przywrócić domyślne widełki ${brokerName} z umowy ramowej? Usunie to obecne ustawienia firmy.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        await resetBrokerTiersToDefault(brokerName);
        toast.success("Przywrócono domyślne widełki");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Handshake className="size-4 text-indigo-700" />
          <div>
            <div className="font-semibold text-sm">{brokerName}</div>
            <div className="text-[11px] text-muted-foreground">
              Stawki z umowy ramowej. Wartości w USD netto, prowizja w % lub
              ryczałtowo (PLN).
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={reset}
          disabled={pending}
          className="gap-1"
        >
          <RotateCcw className="size-3" />
          Przywróć z umowy
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md ring-1 ring-border">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-28">
                Od (USD)
              </th>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-28">
                Do (USD)
              </th>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-24">
                Stawka %
              </th>
              <th className="border-r border-slate-200 text-right px-2 py-1.5 font-medium w-28">
                Ryczałt (PLN)
              </th>
              <th className="border-r border-slate-200 text-center px-2 py-1.5 font-medium w-24">
                Indywidualne
              </th>
              <th className="text-center px-2 py-1.5 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tiers.map((t) => (
              <TierRow key={t.id} tier={t} brokerName={brokerName} />
            ))}
            {showAdd && (
              <NewTierRow
                brokerName={brokerName}
                nextSortOrder={(tiers[tiers.length - 1]?.sortOrder ?? 0) + 1}
                onClose={() => setShowAdd(false)}
              />
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAdd(true)}
          disabled={pending || showAdd}
          className="gap-1"
        >
          <Plus className="size-3" />
          Dodaj przedział
        </Button>
        <p className="text-[10px] text-muted-foreground">
          Auto-doliczane do zamówienia jako „Prowizja Fullbax". Wybór przedziału:{" "}
          <code>min ≤ wartość USD &lt; max</code>.
        </p>
      </div>
    </div>
  );
}

function TierRow({
  tier,
  brokerName,
}: {
  tier: Tier;
  brokerName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [minV, setMin] = useState(String(tier.minValueUsd));
  const [maxV, setMax] = useState(
    tier.maxValueUsd != null ? String(tier.maxValueUsd) : "",
  );
  const [ratePct, setRate] = useState(
    tier.ratePct != null ? (tier.ratePct * 100).toFixed(2) : "",
  );
  const [flatPln, setFlat] = useState(
    tier.flatPln != null ? String(tier.flatPln) : "",
  );
  const [individual, setIndividual] = useState(tier.individual);

  function save() {
    const minN = Number(minV);
    const maxN = maxV.trim() === "" ? null : Number(maxV);
    const rateN = ratePct.trim() === "" ? null : Number(ratePct);
    const flatN = flatPln.trim() === "" ? null : Number(flatPln);
    if (Number.isNaN(minN) || minN < 0) {
      toast.error("Niepoprawne 'od'");
      return;
    }
    if (maxN != null && (Number.isNaN(maxN) || maxN <= minN)) {
      toast.error("'Do' musi być większe niż 'od'");
      return;
    }
    if (
      !individual &&
      (rateN == null || rateN === 0) &&
      (flatN == null || flatN === 0)
    ) {
      toast.error("Podaj stawkę % LUB ryczałt PLN");
      return;
    }
    startTransition(async () => {
      try {
        await upsertBrokerTierAction({
          id: tier.id,
          brokerName,
          minValueUsd: minN,
          maxValueUsd: maxN,
          ratePct: rateN,
          flatPln: flatN,
          individual,
          sortOrder: tier.sortOrder,
        });
        toast.success("Zapisano");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function remove() {
    if (!confirm("Usunąć przedział?")) return;
    startTransition(async () => {
      try {
        await deleteBrokerTierAction(tier.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <tr className={cn(individual && "bg-amber-50/40")}>
      <td className="border-r border-slate-200 px-2 py-1 text-right">
        <Input
          type="number"
          step="100"
          min="0"
          value={minV}
          onChange={(e) => setMin(e.target.value)}
          onBlur={save}
          disabled={pending}
          className="h-7 text-[11px] text-right tabular-nums"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1 text-right">
        <Input
          type="number"
          step="100"
          min="0"
          value={maxV}
          onChange={(e) => setMax(e.target.value)}
          onBlur={save}
          disabled={pending}
          className="h-7 text-[11px] text-right tabular-nums"
          placeholder="∞"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1 text-right">
        <Input
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={ratePct}
          onChange={(e) => setRate(e.target.value)}
          onBlur={save}
          disabled={pending || individual}
          className="h-7 text-[11px] text-right tabular-nums"
          placeholder="np. 5.5"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1 text-right">
        <Input
          type="number"
          step="100"
          min="0"
          value={flatPln}
          onChange={(e) => setFlat(e.target.value)}
          onBlur={save}
          disabled={pending || individual}
          className="h-7 text-[11px] text-right tabular-nums"
          placeholder="—"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1 text-center">
        <label className="inline-flex items-center justify-center cursor-pointer">
          <input
            type="checkbox"
            checked={individual}
            onChange={(e) => {
              setIndividual(e.target.checked);
              // od razu zapisuje
              setTimeout(save, 0);
            }}
            disabled={pending}
            className="size-4"
          />
        </label>
      </td>
      <td className="px-2 py-1 text-center">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label="Usuń"
          className="text-muted-foreground hover:text-destructive p-1"
        >
          <Trash2 className="size-3" />
        </button>
      </td>
    </tr>
  );
}

function NewTierRow({
  brokerName,
  nextSortOrder,
  onClose,
}: {
  brokerName: string;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [minV, setMin] = useState("");
  const [maxV, setMax] = useState("");
  const [ratePct, setRate] = useState("");
  const [flatPln, setFlat] = useState("");
  const [individual, setIndividual] = useState(false);

  function save() {
    const minN = Number(minV);
    if (Number.isNaN(minN) || minN < 0) {
      toast.error("Podaj 'od' (USD)");
      return;
    }
    const maxN = maxV.trim() === "" ? null : Number(maxV);
    const rateN = ratePct.trim() === "" ? null : Number(ratePct);
    const flatN = flatPln.trim() === "" ? null : Number(flatPln);
    if (
      !individual &&
      (rateN == null || rateN === 0) &&
      (flatN == null || flatN === 0)
    ) {
      toast.error("Podaj stawkę % LUB ryczałt PLN");
      return;
    }
    startTransition(async () => {
      try {
        await upsertBrokerTierAction({
          brokerName,
          minValueUsd: minN,
          maxValueUsd: maxN,
          ratePct: rateN,
          flatPln: flatN,
          individual,
          sortOrder: nextSortOrder,
        });
        toast.success("Dodano");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <tr className="bg-emerald-50/30">
      <td className="border-r border-slate-200 px-2 py-1">
        <Input
          type="number"
          step="100"
          value={minV}
          onChange={(e) => setMin(e.target.value)}
          autoFocus
          className="h-7 text-[11px] text-right tabular-nums"
          placeholder="0"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1">
        <Input
          type="number"
          step="100"
          value={maxV}
          onChange={(e) => setMax(e.target.value)}
          className="h-7 text-[11px] text-right tabular-nums"
          placeholder="∞"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1">
        <Input
          type="number"
          step="0.1"
          value={ratePct}
          onChange={(e) => setRate(e.target.value)}
          disabled={individual}
          className="h-7 text-[11px] text-right tabular-nums"
          placeholder="np. 5.5"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1">
        <Input
          type="number"
          step="100"
          value={flatPln}
          onChange={(e) => setFlat(e.target.value)}
          disabled={individual}
          className="h-7 text-[11px] text-right tabular-nums"
          placeholder="—"
        />
      </td>
      <td className="border-r border-slate-200 px-2 py-1 text-center">
        <input
          type="checkbox"
          checked={individual}
          onChange={(e) => setIndividual(e.target.checked)}
          className="size-4"
        />
      </td>
      <td className="px-2 py-1 text-center">
        <div className="inline-flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending}
            className="h-6 px-2 text-[10px]"
          >
            Zapisz
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-[10px] px-1"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// Helper export — używane tylko z server page do podglądu obliczeń.
export function BrokerCommissionPreview({
  tiers,
  goodsValueUsd,
  usdToPlnRate,
}: {
  tiers: Tier[];
  goodsValueUsd: number;
  usdToPlnRate: number;
}) {
  const match = tiers.find((t) => {
    if (goodsValueUsd < t.minValueUsd) return false;
    if (t.maxValueUsd != null && goodsValueUsd >= t.maxValueUsd) return false;
    return true;
  });
  if (!match) return null;
  let amount = 0;
  if (match.individual) amount = 0;
  else if (match.flatPln != null) amount = match.flatPln;
  else if (match.ratePct != null) amount = goodsValueUsd * match.ratePct * usdToPlnRate;
  return (
    <div className="rounded-md bg-indigo-50/50 ring-1 ring-indigo-200 p-2 text-[11px] text-indigo-900">
      <div className="font-semibold">Podgląd dla {fmtUsd(goodsValueUsd)}</div>
      <div>
        Przedział: {fmtUsd(match.minValueUsd)} – {match.maxValueUsd != null ? fmtUsd(match.maxValueUsd) : "∞"}
        {match.individual
          ? " · indywidualne (negocjowane)"
          : match.flatPln != null
            ? ` · ryczałt ${fmtPln(match.flatPln)}`
            : match.ratePct != null
              ? ` · ${(match.ratePct * 100).toFixed(1)}%`
              : ""}
      </div>
      <div className="font-bold mt-1">Prowizja: {fmtPln(amount)}</div>
    </div>
  );
}
