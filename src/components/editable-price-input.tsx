"use client";

/**
 * EditablePriceInput — komórka cenowa z popoverem do edycji.
 *
 * Konwencja: w bazie ZAWSZE trzymamy NETTO. UI domyślnie pokazuje BRUTTO.
 * Komponent wyświetla brutto, popover daje 2 pola (netto + brutto) z
 * autosynchronizacją — wpisanie w jednym przelicza drugie przez `vatRate`.
 * Save woła `onSave(nettoValue)` z ostateczną wartością netto do zapisu.
 *
 * Use case:
 *  - lista produktów: defaultSalePriceAllegroPln, defaultSalePriceSklepPln, etc.
 *  - kalkulator zamówień: cena per kanał, INNE, ad cost, wysyłka klienta, etc.
 */

import { useEffect, useRef, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EditablePriceInputProps = {
  /** Wartość NETTO w bazie (null = puste / brak). */
  nettoValue: number | null;
  /** Stawka VAT (0..1, np. 0.23). Default 0.23. */
  vatRate?: number;
  /** Co pokazujemy w komórce — "brutto" (default) lub "netto". */
  displayMode?: "brutto" | "netto";
  /** Callback przy zapisie. Otrzymuje wartość NETTO. */
  onSave: (nettoValue: number | null) => Promise<void> | void;
  /** Czy disabled (read-only). */
  disabled?: boolean;
  /** Klasa CSS dla wyświetlanej wartości. */
  className?: string;
  /** Tekst placeholdera w pustej komórce. */
  placeholder?: string;
  /** Format wartości w komórce — default `n.toFixed(2)`. */
  formatValue?: (n: number) => string;
  /** Sufiks po liczbie (np. "zł"). */
  suffix?: string;
  /** Krótka label w popoverze (np. "Cena Allegro"). */
  label?: string;
};

export function EditablePriceInput({
  nettoValue,
  vatRate = 0.23,
  displayMode = "brutto",
  onSave,
  disabled,
  className,
  placeholder = "—",
  formatValue,
  suffix,
  label,
}: EditablePriceInputProps) {
  const [open, setOpen] = useState(false);
  const [nettoStr, setNettoStr] = useState("");
  const [bruttoStr, setBruttoStr] = useState("");
  const [saving, setSaving] = useState(false);
  // editingField: który input ostatnio user modyfikował (żeby autosync nie
  // nadpisywał aktywnego pola podczas pisania).
  const editingField = useRef<"netto" | "brutto" | null>(null);
  // Ref na pierwszy input — żeby ustawić focus bez scroll (autoFocus
  // domyślnie scrolluje stronę do focusowanego elementu — niepożądane).
  const nettoInputRef = useRef<HTMLInputElement>(null);

  const factor = 1 + vatRate;

  // Init wartości w popoverze przy otwarciu + focus BEZ scroll
  useEffect(() => {
    if (open) {
      const n = nettoValue ?? 0;
      setNettoStr(n === 0 ? "" : n.toFixed(2));
      setBruttoStr(n === 0 ? "" : (n * factor).toFixed(2));
      editingField.current = null;
      // Defer do następnej klatki — popover musi być DOM-mounted.
      requestAnimationFrame(() => {
        const el = nettoInputRef.current;
        if (el) {
          el.focus({ preventScroll: true });
          el.select();
        }
      });
    }
  }, [open, nettoValue, factor]);

  function onNettoChange(v: string) {
    editingField.current = "netto";
    setNettoStr(v);
    const n = parseFloat(v.replace(",", "."));
    if (Number.isFinite(n)) {
      setBruttoStr((n * factor).toFixed(2));
    } else {
      setBruttoStr("");
    }
  }
  function onBruttoChange(v: string) {
    editingField.current = "brutto";
    setBruttoStr(v);
    const b = parseFloat(v.replace(",", "."));
    if (Number.isFinite(b)) {
      setNettoStr((b / factor).toFixed(2));
    } else {
      setNettoStr("");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Jesli user edytowal BRUTTO, liczymy netto = brutto/factor z PELNA
      // precyzja (bez round do 2 cyfr). Bez tego np. user wpisuje 2990 brutto
      // -> displayed netto 2430.89 (round) -> mnozenie × 1.23 daje 2989.99
      // (float imprecision). Zapis pelnej precyzji 2430.0813008... daje
      // dokladnie 2990.00 po mnozeniu.
      let finalNetto: number | null = null;
      if (editingField.current === "brutto") {
        const b = parseFloat(bruttoStr.replace(",", "."));
        if (Number.isFinite(b)) finalNetto = b / factor;
      } else {
        const n = parseFloat(nettoStr.replace(",", "."));
        if (Number.isFinite(n)) finalNetto = n;
      }
      await onSave(finalNetto);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  // Display value — brutto albo netto z VAT factor
  const displayedNum =
    nettoValue != null
      ? displayMode === "brutto"
        ? nettoValue * factor
        : nettoValue
      : null;
  const fmt = formatValue ?? ((n: number) => n.toFixed(2));

  const nettoNum = nettoValue ?? 0;
  const bruttoNum = nettoNum * factor;

  // Hover tooltip — pokazuje obie wartości (netto i brutto). Wysoki z-index
  // żeby zawsze leżał na wierzchu nad innymi elementami (tabele, sticky header).
  const tooltipNode =
    nettoValue != null ? (
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[200] bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap",
          "rounded-md bg-slate-900 px-2 py-1 text-[10px] text-white shadow-lg ring-1 ring-slate-700",
          "opacity-0 scale-95 transition-[opacity,transform] duration-100 delay-100",
          "group-hover/price:opacity-100 group-hover/price:scale-100 group-hover/price:delay-150",
          "group-focus-within/price:opacity-100 group-focus-within/price:scale-100",
        )}
      >
        <span className="tabular-nums">
          <span className="opacity-60">Netto:</span> {nettoNum.toFixed(2)} zł
        </span>
        <span className="opacity-40 mx-1">·</span>
        <span className="tabular-nums text-amber-200">
          <span className="opacity-70">Brutto:</span> {bruttoNum.toFixed(2)} zł
        </span>
      </span>
    ) : null;

  if (disabled) {
    return (
      <span className={cn("relative inline-flex items-baseline group/price", className)}>
        <span>
          {displayedNum != null ? fmt(displayedNum) : placeholder}
        </span>
        {suffix && displayedNum != null && (
          <span className="ml-0.5 text-[10px] opacity-60">{suffix}</span>
        )}
        {tooltipNode}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "relative inline-flex items-baseline gap-0.5 rounded px-1 -mx-1 group/price",
              "hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-colors cursor-pointer",
              className,
            )}
            aria-label={
              label
                ? `${label} — klik żeby edytować`
                : "Klik żeby edytować cenę"
            }
          >
            <span>
              {displayedNum != null ? fmt(displayedNum) : placeholder}
            </span>
            {suffix && displayedNum != null && (
              <span className="text-[10px] opacity-60">{suffix}</span>
            )}
            {tooltipNode}
          </button>
        }
      />
      {/* Popover edycji — minimalistyczny, ten sam look co tooltip wysyłki:
       *  rounded-lg, ring-1, p-2, text-xs, shadow-lg, z-[200].
       *  Focus na input robimy ręcznie w useEffect z preventScroll:true
       *  żeby strona nie skakała przy otwarciu. */}
      <PopoverContent
        className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 min-w-[260px] z-[200]"
        align="start"
        sideOffset={6}
      >
        <div className="mb-1.5 flex items-baseline gap-2 px-1">
          <span className="font-semibold text-[11px]">
            {label ?? "Edytuj cenę"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            VAT {(vatRate * 100).toFixed(0)}%
          </span>
        </div>
        <table className="w-full text-[10px] mb-1.5">
          <thead className="text-muted-foreground border-b">
            <tr>
              <th className="text-left font-medium px-1 py-1">Netto</th>
              <th className="text-left font-medium px-1 py-1 text-amber-700">
                Brutto
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-1 py-1">
                <Input
                  ref={nettoInputRef}
                  inputMode="decimal"
                  value={nettoStr}
                  onChange={(e) => onNettoChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                  placeholder="0.00"
                  className="h-7 text-xs tabular-nums px-1"
                />
              </td>
              <td className="px-1 py-1">
                <Input
                  inputMode="decimal"
                  value={bruttoStr}
                  onChange={(e) => onBruttoChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                  placeholder="0.00"
                  className="h-7 text-xs tabular-nums px-1 text-amber-700"
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="px-1 mb-1.5 text-[9px] text-muted-foreground italic">
          Wpisz w jednym polu — drugie przeliczy się automatycznie. Zapisujemy
          NETTO.
        </div>
        <div className="px-1 flex items-center justify-end gap-2 pt-1 border-t">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="h-6 text-[10px] px-2"
          >
            Anuluj
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="h-6 text-[10px] px-2"
          >
            {saving ? "Zapisuję…" : "Zapisz"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
