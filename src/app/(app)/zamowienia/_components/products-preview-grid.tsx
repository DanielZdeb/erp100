/**
 * ProductsPreviewGrid — pokazuje 1 zdjęcie reprezentanta zamówienia
 * (produkt z największej kategorii). Zastępuje stary MiniContainerVisual
 * na liście zamówień — szybsza wizualna identyfikacja „co jest w środku".
 *
 * Pod miniaturą małe info o kontenerze (fillRate + size) — żeby user nie
 * tracił tych danych.
 */

import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

type PreviewItem = {
  name: string;
  qty: number;
  sku: number;
  sampleImageUrl: string | null;
  sampleProductName: string;
  sampleProductCode: string;
};

export function ProductsPreviewGrid({
  items,
  fillRate,
  containerCount,
  containerSize,
  usedCbm,
}: {
  items: PreviewItem[];
  fillRate: number;
  containerCount: number;
  containerSize: number;
  usedCbm: number;
}) {
  // Bierzemy 1 reprezentanta — pierwszy z miniaturką (items są już sortowane
  // po qty, więc dominująca kategoria wygrywa).
  const hero =
    items.find((i) => i.sampleImageUrl) ?? items[0] ?? null;
  const fillPct = Math.round(fillRate * 100);

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div
        className="size-14 rounded overflow-hidden ring-1 ring-slate-200 bg-slate-50 grid place-items-center"
        title={items
          .map(
            (i) =>
              `${i.name}: ${i.sampleProductName} (${i.sku} SKU × ${i.qty} szt)`,
          )
          .join("\n")}
      >
        {hero?.sampleImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={hero.sampleImageUrl}
            alt={hero.sampleProductName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="size-full grid place-items-center bg-slate-100 text-slate-300">
            <Package className="size-5" />
          </div>
        )}
      </div>
      {/* Pod miniaturą: skrót danych kontenera */}
      <div
        className={cn(
          "text-[8px] tabular-nums font-semibold",
          fillPct >= 90
            ? "text-emerald-700"
            : fillPct >= 50
              ? "text-amber-700"
              : "text-slate-500",
        )}
        title={`Wypełnienie: ${usedCbm.toFixed(1)} / ${(containerSize * containerCount).toFixed(1)} m³`}
      >
        {containerCount}×{containerSize.toFixed(0)}m³ · {fillPct}%
      </div>
    </div>
  );
}
