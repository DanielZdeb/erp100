"use client";

/**
 * EditablePercentInput — komórka procentowa z popoverem do edycji.
 *
 * Mirroring `EditablePriceInput` UX (klik → popover → Enter zapis), ale
 * dla pojedynczej wartości procentowej (np. prowizja platformy 4.5%).
 * W komórce widać liczbę z sufiksem „%"; popover ma jedno pole
 * + opcjonalny podgląd przeliczenia (np. „4.5% × 450 zł = 20.25 zł/szt").
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

type EditablePercentInputProps = {
  /** Wartość procentu (np. 4.5 = 4.5%). null = puste. */
  value: number | null;
  /** Callback zapisu — otrzymuje liczbę lub null (gdy user wyczyścił). */
  onSave: (next: number | null) => Promise<void> | void;
  /** Czy disabled. */
  disabled?: boolean;
  /** Klasa CSS dla wyświetlanej wartości. */
  className?: string;
  /** Tekst placeholdera w pustej komórce. */
  placeholder?: string;
  /** Krótka label w popoverze (np. „Allegro — Prowizja"). */
  label?: string;
  /**
   * Opcjonalne linie kontekstu w popoverze — np. przeliczenie z wartości
   * sprzedaży. Renderowane jak hint pod inputem.
   */
  helperLines?: string[];
  /** Krok inputa (default 0.01). */
  step?: number;
};

function fmtValue(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

export function EditablePercentInput({
  value,
  onSave,
  disabled,
  className,
  placeholder = "0",
  label,
  helperLines,
  step = 0.01,
}: EditablePercentInputProps) {
  const [open, setOpen] = useState(false);
  const [valStr, setValStr] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValStr(value != null ? fmtValue(value) : "");
      // Focus bez scroll (popover deep w tabeli).
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus({ preventScroll: true });
          el.select();
        }
      });
    }
  }, [open, value]);

  async function handleSave() {
    setSaving(true);
    try {
      const n = parseFloat(valStr.replace(",", "."));
      const final = Number.isFinite(n) ? n : null;
      await onSave(final);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const displayed = value != null ? fmtValue(value) : placeholder;

  if (disabled) {
    return (
      <span className={cn("inline-flex items-baseline", className)}>
        <span>{displayed}</span>
        <span className="ml-0.5 text-[10px] opacity-60">%</span>
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
              "inline-flex items-baseline gap-0.5 rounded px-1 -mx-1",
              "hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-colors cursor-pointer",
              className,
            )}
            aria-label={
              label ? `${label} — klik żeby edytować` : "Klik żeby edytować %"
            }
          >
            <span>{displayed}</span>
            <span className="text-[10px] opacity-60">%</span>
          </button>
        }
      />
      <PopoverContent
        className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 min-w-[220px] z-[200]"
        align="start"
        sideOffset={6}
      >
        <div className="mb-1.5 flex items-baseline gap-2 px-1">
          <span className="font-semibold text-[11px]">
            {label ?? "Edytuj prowizję"}
          </span>
          <span className="text-[10px] text-muted-foreground">%</span>
        </div>
        <div className="px-1 mb-1.5">
          <div className="flex items-baseline gap-1">
            <Input
              ref={inputRef}
              inputMode="decimal"
              type="number"
              step={step}
              min="0"
              value={valStr}
              onChange={(e) => setValStr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                }
              }}
              placeholder="0"
              className="h-7 text-xs tabular-nums px-1.5"
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        </div>
        {helperLines && helperLines.length > 0 && (
          <div className="px-1 mb-1.5 pt-1.5 border-t space-y-0.5">
            {helperLines.map((line, i) => (
              <div
                key={i}
                className="text-[10px] text-muted-foreground tabular-nums"
              >
                {line}
              </div>
            ))}
          </div>
        )}
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
