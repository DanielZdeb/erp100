"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchNbpRate,
  type NbpRate,
  type SupportedCurrency,
} from "@/lib/nbp-rates";

/**
 * Pole tekstowe na kurs waluty z auto-podpowiedzią NBP.
 * Pokazuje aktualny średni kurs NBP (tabela A) + przycisk „użyj" wstawiający
 * ten kurs do pola. Działa zarówno jako controlled (value + onChange) jak i
 * uncontrolled (defaultValue + name dla form action).
 */
export function CurrencyRateInput({
  currency,
  id,
  name,
  defaultValue,
  value,
  onChange,
  placeholder,
  required,
  className,
}: {
  currency: SupportedCurrency;
  id?: string;
  name?: string;
  defaultValue?: string | number;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [nbpRate, setNbpRate] = useState<NbpRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [internalValue, setInternalValue] = useState<string>(
    value ?? (defaultValue != null ? String(defaultValue) : ""),
  );

  // Sync z value-controlled mode
  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  // Pobierz aktualny kurs NBP
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchNbpRate(currency)
      .then((r) => {
        if (!cancelled) {
          setNbpRate(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  function handleApplyNbp() {
    if (!nbpRate) return;
    const v = nbpRate.mid.toFixed(4);
    setInternalValue(v);
    onChange?.(v);
  }

  const showHint = !loading && nbpRate != null;
  const currentNum = Number(internalValue);
  const isFilled = internalValue !== "" && Number.isFinite(currentNum);
  const differsFromNbp =
    isFilled && nbpRate != null && Math.abs(currentNum - nbpRate.mid) > 0.0001;

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          name={name}
          type="number"
          step="0.0001"
          required={required}
          placeholder={
            nbpRate
              ? `NBP: ${nbpRate.mid.toFixed(4)}`
              : placeholder ?? "0.0000"
          }
          value={value !== undefined ? value : internalValue}
          onChange={(e) => {
            if (value === undefined) setInternalValue(e.target.value);
            onChange?.(e.target.value);
          }}
          className={cn("pr-20", className)}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {loading ? (
            <div className="px-1.5 py-0.5 text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              NBP…
            </div>
          ) : nbpRate ? (
            <button
              type="button"
              onClick={handleApplyNbp}
              title={`Wstaw kurs NBP z ${nbpRate.effectiveDate} (tabela ${nbpRate.tableNo})`}
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                differsFromNbp
                  ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300 hover:bg-amber-200"
                  : "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 hover:bg-emerald-200",
              )}
            >
              <TrendingUp className="size-2.5" />
              {nbpRate.mid.toFixed(4)}
            </button>
          ) : (
            <span className="px-1.5 py-0.5 text-[10px] text-muted-foreground italic">
              NBP n/d
            </span>
          )}
        </div>
      </div>
      {showHint && (
        <p className="text-[10px] text-muted-foreground">
          NBP tabela A z {nbpRate.effectiveDate} ({nbpRate.tableNo})
          {differsFromNbp && isFilled && (
            <span className="ml-1 text-amber-700">
              · różni się o {(currentNum - nbpRate.mid).toFixed(4)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
