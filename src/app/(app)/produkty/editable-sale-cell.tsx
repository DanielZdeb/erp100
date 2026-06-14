"use client";

/**
 * Inline-edytowalna komórka na liście produktów: cena Allegro/Sklep, prowizja,
 * KPK, wysyłka klient. Klik otwiera POPOVER (taki sam wzorzec jak items-tab
 * w zamówieniach: EditablePriceInput / EditablePercentInput) — zamiast
 * inline replace inputa.
 *
 * Konwencja PLN:
 *   - storedValue dla cen: NETTO; popover ma 2 pola (netto/brutto) z autosync
 *   - storedValue dla %: fraction 0..1 (np. 0.045 = 4.5%); popover liczy w %
 */

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { updateProductSaleDefaultsAction } from "@/server/products";
import { EditablePriceInput } from "@/components/editable-price-input";
import { EditablePercentInput } from "@/components/editable-percent-input";

type Field =
  | "defaultSalePriceAllegroPln"
  | "defaultSalePriceSklepPln"
  | "defaultAllegroCommissionPct"
  | "defaultSklepCommissionPct"
  | "defaultAllegroOtherCostPln"
  | "defaultSklepOtherCostPln"
  | "defaultAllegroCustomerShippingPln"
  | "defaultSklepCustomerShippingPln"
  | "defaultSklepAdCostPln";

const FIELD_LABEL: Record<Field, string> = {
  defaultSalePriceAllegroPln: "Cena Allegro",
  defaultSalePriceSklepPln: "Cena Sklep",
  defaultAllegroCommissionPct: "Prowizja Allegro",
  defaultSklepCommissionPct: "Prowizja Sklep",
  defaultAllegroOtherCostPln: "Inne (Allegro)",
  defaultSklepOtherCostPln: "Inne (Sklep)",
  defaultAllegroCustomerShippingPln: "Wysyłka klient — Allegro",
  defaultSklepCustomerShippingPln: "Wysyłka klient — Sklep",
  defaultSklepAdCostPln: "Reklama (Sklep)",
};

export function EditableSaleCell({
  productId,
  field,
  storedValue,
  factor,
  kind,
  tone = "neutral",
}: {
  productId: string;
  field: Field;
  /** Wartość zapisana w bazie (netto dla cen, 0..1 dla %). */
  storedValue: number | null;
  /** 1 dla netto, (1 + VAT) dla brutto. Ignorowane dla prowizji.
   *  Używane do wyliczenia vatRate (factor - 1). */
  factor: number;
  /** Format wyświetlania + walidacja. */
  kind: "price" | "percent";
  /** Wizualne oznaczenie:
   *   - revenue/cost/neutral — kolorowy tekst (zielony/czerwony)
   *   - price-chip — niebieska pigułka „price tag" (jak w items-tab dla CENA) */
  tone?: "revenue" | "cost" | "neutral" | "price-chip";
}) {
  const router = useRouter();
  const vatRate = Math.max(0, factor - 1);
  const label = FIELD_LABEL[field];

  // Cena: zapisujemy netto. Popover akceptuje netto lub brutto i autosynchronizuje.
  async function savePrice(nettoValue: number | null) {
    try {
      await updateProductSaleDefaultsAction(productId, { [field]: nettoValue });
      toast.success("Zapisano");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się");
    }
  }

  // Procent: user widzi 0..100, w bazie 0..1. Server-side: trzeba przekazać
  // jako 0..100 — schema `commissionPct` w server/products parse'uje to.
  async function savePercent(valuePct: number | null) {
    try {
      await updateProductSaleDefaultsAction(productId, {
        [field]: valuePct,
      });
      toast.success("Zapisano");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się");
    }
  }

  const toneClass =
    tone === "revenue"
      ? "text-emerald-700"
      : tone === "cost"
        ? "text-rose-700"
        : tone === "price-chip"
          ? cn(
              "text-sky-900 font-bold tabular-nums",
              // px-3 + mx-0 neutralizuje wewnętrzne `px-1 -mx-1` z EditablePriceInput.
              "bg-sky-100 ring-1 ring-sky-400/60 rounded-md !px-3 !mx-0",
              "hover:!bg-sky-200 hover:!ring-sky-500",
              "shadow-[1px_1px_0_rgba(7,89,133,0.18)]",
            )
          : "";

  if (kind === "percent") {
    return (
      <EditablePercentInput
        value={storedValue != null ? storedValue * 100 : null}
        onSave={savePercent}
        label={label}
        className={cn("tabular-nums font-medium", toneClass)}
        placeholder="—"
      />
    );
  }

  return (
    <EditablePriceInput
      nettoValue={storedValue}
      vatRate={vatRate}
      // Display tryb zgodny z preferencją usera (factor>1 = brutto)
      displayMode={factor > 1 ? "brutto" : "netto"}
      label={label}
      className={cn("tabular-nums font-medium", toneClass)}
      placeholder="—"
      onSave={savePrice}
      {...(tone === "price-chip"
        ? { formatValue: fmtMoneyShort, suffix: "zł" }
        : {})}
    />
  );
}

/**
 * "289.00" → "289", "289.5" → "289.50".
 * Skraca wizualny szum w gęstej tabeli — zgodnie ze stylem items-tab.
 */
function fmtMoneyShort(n: number): string {
  if (n === 0) return "0";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}
