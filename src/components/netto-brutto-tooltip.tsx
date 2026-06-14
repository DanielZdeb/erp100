"use client";

/**
 * NettoBruttoTooltip — wrapper komórki z kwotą PLN. Na hover pokazuje
 * popover z netto i brutto w jednolitym stylu (jak tooltip wysyłki /
 * historia cen zakupu).
 *
 * Konwencja: `nettoValue` to wartość PLN netto. Brutto = `nettoValue * (1 + vatRate)`.
 *
 * Use case: lista zamówień (kolumny RAZEM, Pozostało itp.), KPI dashboardu,
 * gdziekolwiek pokazujemy zagregowaną kwotę PLN.
 */

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

export function NettoBruttoTooltip({
  nettoValue,
  vatRate = 0.23,
  label,
  description,
  children,
  align = "end",
  vatExempt = false,
}: {
  /** Wartość PLN netto. */
  nettoValue: number | null | undefined;
  /** Stawka VAT (0..1, domyślnie 0.23). */
  vatRate?: number;
  /** Tytuł popovera, np. "Razem zamówienia" lub "Cena zakupu". */
  label: string;
  /** Opcjonalny opis pod tytułem (kursywą, mały tekst). */
  description?: string;
  /** Komórka — to co widoczne w tabeli (zwykle sformatowana kwota). */
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  /**
   * Typ pozycji nie podlega VAT (np. cło importowe, prowizja pośrednika).
   * Tooltip pokazuje wtedy jedną kwotę bez rozbicia netto/VAT/brutto.
   */
  vatExempt?: boolean;
}) {
  // Brak wartości lub 0 — nie pokazujemy popovera (tylko children).
  if (nettoValue == null || nettoValue === 0) {
    return <>{children}</>;
  }
  const netto = nettoValue;
  const brutto = netto * (1 + vatRate);
  const vatAmount = brutto - netto;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={150}
        nativeButton={false}
        render={
          <span
            className="cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
            tabIndex={0}
          >
            {children}
          </span>
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align={align}
          side="bottom"
          sideOffset={6}
          className="isolate z-[200]"
        >
          <PopoverPrimitive.Popup className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden min-w-[220px]">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="font-semibold text-[11px]">{label}</span>
              <span className="text-[10px] text-muted-foreground">
                {vatExempt ? "bez VAT" : `VAT ${(vatRate * 100).toFixed(0)}%`}
              </span>
            </div>
            {vatExempt ? (
              // Pozycja bez VAT (cło, prowizja): pokazujemy jedną kwotę.
              <table className="w-full text-[10px]">
                <tbody>
                  <tr className="bg-amber-50/60">
                    <td className="px-1 py-1.5 font-semibold">Kwota</td>
                    <td className="px-1 py-1.5 text-right tabular-nums font-semibold text-amber-700">
                      {netto.toLocaleString("pl-PL", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      zł
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="w-full text-[10px]">
                <tbody>
                  <tr className="hover:bg-muted/30">
                    <td className="px-1 py-1 text-muted-foreground">Netto</td>
                    <td className="px-1 py-1 text-right tabular-nums font-medium">
                      {netto.toLocaleString("pl-PL", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      zł
                    </td>
                  </tr>
                  <tr className="hover:bg-muted/30">
                    <td className="px-1 py-1 text-muted-foreground">VAT</td>
                    <td className="px-1 py-1 text-right tabular-nums text-muted-foreground">
                      {vatAmount.toLocaleString("pl-PL", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      zł
                    </td>
                  </tr>
                  <tr className="bg-amber-50/60">
                    <td className="px-1 py-1.5 font-semibold">Brutto</td>
                    <td className="px-1 py-1.5 text-right tabular-nums font-semibold text-amber-700">
                      {brutto.toLocaleString("pl-PL", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      zł
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            {description && (
              <div className="mt-1.5 pt-1.5 border-t px-1 text-[9px] text-muted-foreground italic whitespace-pre-line leading-snug">
                {description}
              </div>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
