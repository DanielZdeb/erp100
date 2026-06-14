"use client";

import { useState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const VAT = 0.23;

/**
 * Para inputów: NETTO + BRUTTO. Edycja jednego automatycznie przelicza drugi.
 * Hidden input z nazwą `name` przesyła do formy zawsze wartość NETTO (zgodnie
 * z systemową konwencją „wszystko trzymamy w netto").
 *
 * Przyjmuje `initialNetto` — wartość zapisana w bazie (netto).
 */
export function NetBruttoInput({
  name,
  initialNetto,
  placeholder,
  label,
}: {
  /** Nazwa pola w form data — przesyłana jako netto. */
  name: string;
  initialNetto: number | null | undefined;
  placeholder?: string;
  label?: string;
}) {
  const [nettoStr, setNettoStr] = useState<string>(
    initialNetto != null ? initialNetto.toFixed(2) : "",
  );
  const [bruttoStr, setBruttoStr] = useState<string>(
    initialNetto != null ? (initialNetto * (1 + VAT)).toFixed(2) : "",
  );

  // Sync gdy zmienia się initial (np. reset formy)
  useEffect(() => {
    if (initialNetto != null) {
      setNettoStr(initialNetto.toFixed(2));
      setBruttoStr((initialNetto * (1 + VAT)).toFixed(2));
    } else {
      setNettoStr("");
      setBruttoStr("");
    }
  }, [initialNetto]);

  function onNettoChange(v: string) {
    setNettoStr(v);
    const n = Number(v.replace(",", "."));
    if (v === "") {
      setBruttoStr("");
    } else if (Number.isFinite(n)) {
      setBruttoStr((n * (1 + VAT)).toFixed(2));
    }
  }

  function onBruttoChange(v: string) {
    setBruttoStr(v);
    const n = Number(v.replace(",", "."));
    if (v === "") {
      setNettoStr("");
    } else if (Number.isFinite(n)) {
      setNettoStr((n / (1 + VAT)).toFixed(2));
    }
  }

  return (
    <div className="space-y-1">
      {label && (
        <Label className="text-xs text-muted-foreground">
          {label}{" "}
          <span className="text-[10px] text-muted-foreground/70">
            (wpisz jedno, drugie się przeliczy)
          </span>
        </Label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={nettoStr}
            onChange={(e) => onNettoChange(e.target.value)}
            placeholder={placeholder}
            className={cn("pr-12 text-emerald-700 tabular-nums")}
            inputMode="decimal"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-700 font-medium uppercase tracking-wide">
            netto
          </span>
        </div>
        <div className="relative">
          <Input
            type="number"
            step="0.01"
            min="0"
            value={bruttoStr}
            onChange={(e) => onBruttoChange(e.target.value)}
            placeholder={
              placeholder
                ? (Number(placeholder) * (1 + VAT)).toFixed(2)
                : undefined
            }
            className={cn("pr-12 text-amber-700 tabular-nums")}
            inputMode="decimal"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-amber-700 font-medium uppercase tracking-wide">
            brutto
          </span>
        </div>
      </div>
      {/* Faktyczna wartość przesyłana do akcji = netto */}
      <input type="hidden" name={name} value={nettoStr} />
    </div>
  );
}
