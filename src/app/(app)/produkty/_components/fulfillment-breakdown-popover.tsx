"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  Boxes,
  FileText,
  Layers as LayersIcon,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";

export type FulfillmentBreakdown = {
  /** Otwarcie zamówienia — flat fee, każda wysyłka. */
  orderOpening: number;
  /** Aktywny tryb — wpływa na stawkę otwarcia + SKU. */
  mode: "MALE" | "HURTOWE";
  /** Koszt obsługi 1 SKU. */
  perSku: number;
  /** Liczba SKU produktu (produkt + komponenty). */
  skuCount: number;
  /** Koszt za 1 sztukę produktu w zamówieniu. */
  perPiece: number;
  /** Dopłata za korzystanie z własnej umowy kurierskiej (per zam). */
  ownCarrier: number;
  /** Zaalokowany koszt magazynu palety na 1 szt. */
  palletPerUnit: number;
  /** Aktywna stawka magazynu / EPal / mc. */
  palletRate: number;
  /** Typ magazynu — pokazywany w popoverze. */
  warehouseType: "GROUND" | "HIGH_RACK";
  /** Sztuk na palecie (do alokacji). */
  unitsPerPallet: number | null;
  /** Łączny koszt fulfillmentu per szt. */
  total: number;
};

/**
 * Hover-popover wyjaśniający z czego składa się koszt fulfillmentu / szt.
 * Pozycje wynikają z umowy E-Packman (Załącznik 2):
 *  1. Otwarcie zamówienia (flat / wysyłka)
 *  2. Przygotowanie SKU (× skuCount)
 *  3. Sztuki w zamówieniu (× perPiece, dla 1 szt = 0,05 zł)
 *  4. Własna umowa kurierska (gdy nadajesz przez swoje DHL/InPost)
 *  5. Magazyn palety (ziemia/półka vs regał wysokiego składu)
 *
 * Wszystkie kwoty wyświetlane w trybie cenowym netto/brutto wg `factor`.
 */
export function FulfillmentBreakdownPopover({
  breakdown,
  factor,
  priceModeLabel,
  children,
  align = "end",
}: {
  breakdown: FulfillmentBreakdown | null;
  factor: number;
  priceModeLabel: "netto" | "brutto";
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  if (!breakdown || breakdown.total <= 0) {
    return <>{children}</>;
  }
  const fmt = (n: number) => (n * factor).toFixed(2);
  const skuTotal = breakdown.perSku * breakdown.skuCount;
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
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup className="rounded-lg bg-popover p-3 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden min-w-[340px]">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-semibold text-[11px]">
                Fulfillment / szt
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={
                    "text-[9px] px-1.5 py-0.5 rounded-full ring-1 " +
                    (breakdown.mode === "HURTOWE"
                      ? "bg-violet-50 text-violet-800 ring-violet-200"
                      : "bg-emerald-50 text-emerald-800 ring-emerald-200")
                  }
                >
                  tryb: {breakdown.mode === "HURTOWE" ? "hurtowy" : "mały"}
                </span>
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {priceModeLabel}
                </span>
              </div>
            </div>

            <table className="w-full text-[11px]">
              <tbody>
                <Row
                  icon={<FileText className="size-3 text-muted-foreground" />}
                  title="Otwarcie zamówienia"
                  subtitle="Flat fee — każda wysłana paczka."
                  value={fmt(breakdown.orderOpening)}
                />
                <Row
                  icon={<LayersIcon className="size-3 text-muted-foreground" />}
                  title={
                    <>
                      Przygotowanie SKU
                      <span className="ml-1 text-[10px] text-muted-foreground font-normal tabular-nums">
                        ({breakdown.skuCount} × {fmt(breakdown.perSku)} zł)
                      </span>
                    </>
                  }
                  subtitle={
                    breakdown.skuCount === 1
                      ? "Produkt prosty — 1 SKU."
                      : `Produkt komponentowy — ${breakdown.skuCount} SKU do skompletowania.`
                  }
                  value={fmt(skuTotal)}
                />
                {breakdown.perPiece > 0 && (
                  <Row
                    icon={<Boxes className="size-3 text-muted-foreground" />}
                    title="Sztuka w zamówieniu"
                    subtitle="Stawka × ilość sztuk produktu w paczce (per 1 szt.)."
                    value={fmt(breakdown.perPiece)}
                  />
                )}
                {breakdown.ownCarrier > 0 && (
                  <Row
                    icon={<Truck className="size-3 text-muted-foreground" />}
                    title="Własna umowa kurierska"
                    subtitle="Dopłata za nadanie przez Twoje umowy DHL/InPost."
                    value={fmt(breakdown.ownCarrier)}
                  />
                )}
                <Row
                  icon={
                    <WarehouseIcon className="size-3 text-muted-foreground" />
                  }
                  title={
                    <>
                      Magazyn palety
                      {breakdown.unitsPerPallet ? (
                        <span className="ml-1 text-[10px] text-muted-foreground font-normal tabular-nums">
                          ({fmt(breakdown.palletRate)} zł /{" "}
                          {breakdown.unitsPerPallet} szt)
                        </span>
                      ) : null}
                    </>
                  }
                  subtitle={
                    breakdown.unitsPerPallet
                      ? `${breakdown.warehouseType === "HIGH_RACK" ? "Regał wysokiego składu" : "Ziemia / regał półkowy"} — stawka / szt na palecie.`
                      : "Brak — nie podano sztuk/paletę dla produktu."
                  }
                  value={fmt(breakdown.palletPerUnit)}
                  noBorder
                />
              </tbody>
              <tfoot className="border-t">
                <tr>
                  <td className="pt-1.5 pr-2 font-semibold text-[11px]">
                    Razem / szt
                  </td>
                  <td className="pt-1.5 pl-2 text-right tabular-nums whitespace-nowrap font-bold">
                    {fmt(breakdown.total)} zł
                  </td>
                </tr>
              </tfoot>
            </table>

            <p className="mt-2 text-[10px] text-muted-foreground leading-snug">
              Wg umowy <strong>E-Packman</strong> (Załącznik 2). Stawki edytujesz
              w <strong>Ustawienia → Fulfillment</strong>. Liczba SKU = produkt
              + komponenty.
            </p>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function Row({
  icon,
  title,
  subtitle,
  value,
  noBorder,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle: string;
  value: string;
  noBorder?: boolean;
}) {
  return (
    <tr className={noBorder ? "" : "border-b border-dashed"}>
      <td className="py-1.5 pr-2">
        <div className="flex items-start gap-1.5">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <div className="min-w-0">
            <div className="font-medium">{title}</div>
            <div className="text-[10px] text-muted-foreground">{subtitle}</div>
          </div>
        </div>
      </td>
      <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap font-medium">
        {value} zł
      </td>
    </tr>
  );
}
