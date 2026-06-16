"use client";

/**
 * Edytor "Cena bazowa" produktu.
 *
 * Dwa tryby wyceny:
 *   - UNIT  (za sztuke): jedno pole, defaultUnitPricePln
 *   - METER (za metr) : dwa pola, defaultPricePerMeterPln + lengthM
 *                       -> defaultUnitPricePln = cena * dlugosc (auto)
 *
 * UX: badge "za metr / za sztuke" obok wartosci, inline edit w razie potrzeby,
 * przelaczanie trybu segmented control. Pokazuje tez wyliczona cene za sztuke
 * w trybie METER zeby operator widzial finalna kwote.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleDollarSign, Loader2, Pencil, Save, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProductBasePriceAction } from "@/server/products";

type Mode = "UNIT" | "METER";

export function BasePriceEditor({
  productId,
  defaultUnitPricePln,
  defaultPricePerMeterPln,
  lengthM,
}: {
  productId: string;
  defaultUnitPricePln: number | null;
  defaultPricePerMeterPln: number | null;
  lengthM: number | null;
}) {
  // Detekcja trybu: jesli mamy cene za metr -> METER, inaczej UNIT
  const initialMode: Mode =
    defaultPricePerMeterPln != null ? "METER" : "UNIT";

  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState<string>(() => {
    const v = initialMode === "METER" ? defaultPricePerMeterPln : defaultUnitPricePln;
    return v != null ? String(v) : "";
  });
  const [length, setLength] = useState<string>(
    lengthM != null ? String(lengthM) : "",
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const fmtPrice = (v: number | null) =>
    v == null ? "—" : `${v.toFixed(2).replace(".", ",")} zł`;

  function openEdit() {
    // Reset z domyslnych wartosci
    setMode(initialMode);
    setAmount(
      (initialMode === "METER" ? defaultPricePerMeterPln : defaultUnitPricePln)
        ?.toString() ?? "",
    );
    setLength(lengthM?.toString() ?? "");
    setEditing(true);
  }

  function save() {
    const parsedAmount = amount.trim() === "" ? null : Number(amount.replace(",", "."));
    const parsedLength = length.trim() === "" ? null : Number(length.replace(",", "."));
    if (parsedAmount != null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      toast.error("Cena musi być liczbą >= 0.");
      return;
    }
    if (mode === "METER" && parsedAmount != null && parsedLength == null) {
      toast.error("Podaj długość (w metrach).");
      return;
    }
    if (mode === "METER" && parsedLength != null && parsedLength <= 0) {
      toast.error("Długość musi być > 0.");
      return;
    }
    startTransition(async () => {
      try {
        await updateProductBasePriceAction(
          productId,
          mode,
          parsedAmount,
          mode === "METER" ? parsedLength : null,
        );
        toast.success("Zapisano cenę bazową");
        setEditing(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  // Wyswietlenie poza edycja
  if (!editing) {
    const isPerMeter = initialMode === "METER";
    const displayPrice = isPerMeter
      ? defaultPricePerMeterPln
      : defaultUnitPricePln;
    return (
      <div className="rounded-md ring-1 ring-amber-200 bg-amber-50/30 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <div className="size-8 rounded-md bg-amber-100 text-amber-700 grid place-items-center shrink-0">
            <CircleDollarSign className="size-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
              Cena bazowa
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {fmtPrice(displayPrice)}
              </span>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded",
                  isPerMeter
                    ? "bg-violet-100 text-violet-700"
                    : "bg-emerald-100 text-emerald-700",
                )}
              >
                {isPerMeter ? "za metr" : "za sztukę"}
              </span>
              {isPerMeter && defaultUnitPricePln != null && lengthM != null && (
                <span className="text-[11px] text-slate-600">
                  · {lengthM.toString().replace(".", ",")} m ={" "}
                  <strong className="text-slate-900">
                    {fmtPrice(defaultUnitPricePln)}
                  </strong>{" "}
                  / sztukę
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openEdit}
          className="gap-1.5 h-7 text-xs shrink-0"
        >
          <Pencil className="size-3" />
          Edytuj
        </Button>
      </div>
    );
  }

  // Edycja
  return (
    <div className="rounded-md ring-1 ring-amber-300 bg-amber-50/60 px-3 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <CircleDollarSign className="size-4 text-amber-700" />
        <h4 className="text-sm font-semibold text-amber-900">
          Edytuj cenę bazową
        </h4>
      </div>

      {/* Toggle trybu */}
      <div>
        <Label className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">
          Tryb wyceny
        </Label>
        <div className="inline-flex p-0.5 rounded-md bg-white ring-1 ring-slate-200 mt-1">
          <button
            type="button"
            onClick={() => setMode("UNIT")}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded transition-colors",
              mode === "UNIT"
                ? "bg-emerald-600 text-white"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Za sztukę
          </button>
          <button
            type="button"
            onClick={() => setMode("METER")}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded transition-colors",
              mode === "METER"
                ? "bg-violet-600 text-white"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            Za metr
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="base-amount" className="text-xs">
            {mode === "METER" ? "Cena za 1 metr (zł)" : "Cena za sztukę (zł)"}
          </Label>
          <Input
            id="base-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="np. 12,50"
            className="bg-white"
          />
        </div>
        {mode === "METER" && (
          <div className="space-y-1">
            <Label htmlFor="base-length" className="text-xs">
              Długość 1 sztuki (m)
            </Label>
            <Input
              id="base-length"
              type="text"
              inputMode="decimal"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="np. 6"
              className="bg-white"
            />
          </div>
        )}
      </div>

      {mode === "METER" && amount && length && (
        <div className="text-[11px] text-slate-600 rounded bg-white px-2 py-1.5 ring-1 ring-slate-200">
          Przeliczona cena za sztukę:{" "}
          <strong className="text-slate-900 tabular-nums">
            {fmtPrice(
              (Number(amount.replace(",", ".")) || 0) *
                (Number(length.replace(",", ".")) || 0),
            )}
          </strong>{" "}
          ({amount} zł × {length} m)
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="gap-1.5 h-7 text-xs"
        >
          <X className="size-3" />
          Anuluj
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={pending}
          className="gap-1.5 h-7 text-xs"
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Save className="size-3" />
          )}
          Zapisz
        </Button>
      </div>
    </div>
  );
}
