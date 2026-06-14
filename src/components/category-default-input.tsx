"use client";

/**
 * CategoryDefaultInput — komórka tabeli pokazująca DEFAULT z kategorii.
 * Klik → popover edycji wartości z OSTRZEŻENIEM („ta zmiana zaktualizuje
 * wszystkie produkty w kategorii X").
 *
 * Używane w kalkulatorze zamówień dla:
 *  - prowizji platformy (Allegro/Sklep) — wartość 0..100 %
 *  - KPK = kosztu pozyskania klienta — zł/szt netto
 *
 * Dzięki temu zmiana z poziomu 1 pozycji zamówienia kaskaduje na całą
 * kategorię i wszystkie produkty w niej (zgodnie z designem usera).
 */

import { useEffect, useRef, useState, useTransition } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info } from "lucide-react";

export type CategoryDefaultInputProps = {
  /** Wartość: dla "percent" w %, dla "money" w zł. null = brak (puste). */
  value: number | null;
  /** Tryb edycji — % (0..100, krok 0.01) lub zł (krok 0.01). */
  mode: "percent" | "money";
  /**
   * Kategoria z której wartość pochodzi (dziedziczenie z parent może
   * sprawić że zapis pójdzie na inną kategorię niż jest pokazana).
   * null = nie ma kategorii, edycja zablokowana.
   */
  sourceCategoryId: string | null;
  sourceCategoryName: string | null;
  /**
   * Najbliższa kategoria do której można zapisać (jeśli wartość pochodzi
   * z parenta, sugerujemy parent jako source — chyba że user chce zapisać
   * niżej). Tu trzymamy nazwę najbliższej.
   */
  ownCategoryName: string;
  /** Liczba produktów w kategorii źródłowej (do komunikatu „N produktów"). */
  productsCount?: number;
  /** Kanał — tylko do wyświetlenia w nagłówku popovera. */
  channelLabel: string;
  /** Label pola (np. „Prowizja Allegro" lub „KPK Sklep"). */
  fieldLabel: string;
  /** Callback zapisu — sourceCategoryId zawsze != null (UI tylko wtedy
   *  wywołuje), value w jednostce wejściowej (% lub zł). */
  onSave: (categoryId: string, value: number | null) => Promise<void>;
  /** Klasa CSS na zewnętrznej liczbie. */
  className?: string;
  /** Sufiks (np. „%" — opcjonalny, default zależy od mode). */
  suffix?: string;
  /** Placeholder gdy wartość = null (default "—"). */
  placeholder?: string;
};

function fmtValue(n: number, mode: "percent" | "money"): string {
  // Skróć .00 dla obu trybów (10.00 → 10) — zmniejsza szum w tabeli.
  if (Number.isInteger(n)) return n.toString();
  return mode === "percent" ? n.toFixed(2) : n.toFixed(2);
}

export function CategoryDefaultInput({
  value,
  mode,
  sourceCategoryId,
  sourceCategoryName,
  ownCategoryName,
  productsCount,
  channelLabel,
  fieldLabel,
  onSave,
  className,
  suffix,
  placeholder = "—",
}: CategoryDefaultInputProps) {
  const [open, setOpen] = useState(false);
  const [valStr, setValStr] = useState("");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveSuffix = suffix ?? (mode === "percent" ? "%" : "zł");

  useEffect(() => {
    if (open) {
      setValStr(value != null ? fmtValue(value, mode) : "");
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus({ preventScroll: true });
          el.select();
        }
      });
    }
  }, [open, value, mode]);

  function handleSave() {
    if (!sourceCategoryId) return;
    const n = parseFloat(valStr.replace(",", "."));
    const finalVal = Number.isFinite(n) ? n : null;
    startTransition(async () => {
      try {
        await onSave(sourceCategoryId, finalVal);
        setOpen(false);
      } catch {
        // toast jest emitowany przez parent
      }
    });
  }

  const disabled = !sourceCategoryId;
  const displayed = value != null ? fmtValue(value, mode) : placeholder;
  // Inherited = wartość pochodzi z parent kategorii (nie ownCategory) →
  // pokazujemy ostrzeżenie w popoverze że zmiana wpłynie na inną kategorię.
  const inheritedFromParent =
    sourceCategoryName != null && sourceCategoryName !== ownCategoryName;

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-baseline gap-0.5 rounded px-1 -mx-1",
              "hover:bg-indigo-50 hover:ring-1 hover:ring-indigo-200 transition-colors",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              value == null && "text-muted-foreground italic",
              className,
            )}
            aria-label={`${fieldLabel} — klik żeby edytować w kategorii`}
          >
            <span>{displayed}</span>
            <span className="text-[10px] opacity-60">{effectiveSuffix}</span>
          </button>
        }
      />
      <PopoverContent
        className="rounded-lg bg-popover p-2.5 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 min-w-[280px] z-[200]"
        align="start"
        sideOffset={6}
      >
        <div className="mb-2 px-1">
          <div className="font-semibold text-[11px] flex items-center gap-1.5">
            <span>{fieldLabel}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
              {channelLabel}
            </span>
          </div>
          {sourceCategoryName && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              kategoria:{" "}
              <span className="font-medium text-slate-700">
                {sourceCategoryName}
              </span>
            </div>
          )}
        </div>
        {inheritedFromParent && (
          <div className="flex items-start gap-1.5 mb-2 mx-1 p-1.5 rounded bg-amber-50 border border-amber-200">
            <AlertTriangle className="size-3 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[10px] text-amber-900 leading-tight">
              Wartość dziedziczona z <b>{sourceCategoryName}</b>. Zmiana
              zaktualizuje TĘ kategorię (i wszystkie produkty w niej + jej
              podkategoriach).
            </div>
          </div>
        )}
        <div className="px-1 mb-2">
          <div className="flex items-baseline gap-1">
            <Input
              ref={inputRef}
              inputMode="decimal"
              type="number"
              step="0.01"
              min="0"
              max={mode === "percent" ? "100" : undefined}
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
            <span className="text-[10px] text-muted-foreground">
              {effectiveSuffix}
            </span>
          </div>
        </div>
        <div className="flex items-start gap-1.5 mx-1 mb-2 p-1.5 rounded bg-slate-50 border border-slate-200">
          <Info className="size-3 text-slate-500 mt-0.5 shrink-0" />
          <div className="text-[10px] text-slate-700 leading-tight">
            Ta wartość jest DOMYŚLNĄ kategorii — kaskaduje na{" "}
            {productsCount != null ? (
              <b>{productsCount} produktów</b>
            ) : (
              <b>wszystkie produkty</b>
            )}{" "}
            w tej kategorii. Zmiana wpłynie na każde zamówienie używające
            tych produktów.
          </div>
        </div>
        <div className="px-1 flex items-center justify-end gap-2 pt-1.5 border-t">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="h-6 text-[10px] px-2"
          >
            Anuluj
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={pending}
            className="h-6 text-[10px] px-2"
          >
            {pending ? "Zapisuję…" : "Zapisz w kategorii"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
