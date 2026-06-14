"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Crown, Star } from "lucide-react";

import { cn } from "@/lib/utils";

import { CourierLogo } from "../[id]/_components/courier-logos";

type Service = {
  brand: "INPOST" | "DHL";
  serviceCode: string;
  serviceLabel: string;
  deliveryMode: string;
  totalNetPln: number;
  totalGrossPln: number;
};

/**
 * Komórka z ceną wysyłki — na hover pokazuje popover ze wszystkimi
 * applicable usługami (logo + cena netto/brutto + tryb dostawy).
 * Zaznacza najtańszą (👑) i preferowane (⭐).
 */
export function ShippingQuotePopover({
  applicable,
  cheapest,
  preferredCodes,
  children,
  align = "end",
}: {
  applicable: Service[];
  cheapest: Service | null;
  preferredCodes: string[];
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  if (applicable.length === 0) {
    return <>{children}</>;
  }
  const preferredSet = new Set(preferredCodes);
  // Pokazuj TYLKO preferowane (gdy są). Fallback: top 3 najtańsze applicable.
  const displayed = preferredSet.size > 0
    ? applicable.filter((s) => preferredSet.has(s.serviceCode))
    : applicable.slice(0, 3);
  const hiddenCount = applicable.length - displayed.length;
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
          <PopoverPrimitive.Popup className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden min-w-[320px]">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="font-semibold text-[11px]">
                Wysyłka — {preferredSet.size > 0 ? "Twoje preferowane" : "Top najtańsze"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({displayed.length}{hiddenCount > 0 ? ` z ${applicable.length}` : ""})
              </span>
            </div>
            <table className="w-full text-[10px]">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left font-medium px-1 py-1 w-[28px]"></th>
                  <th className="text-left font-medium px-1 py-1">Usługa</th>
                  <th className="text-right font-medium px-1 py-1">Netto</th>
                  <th className="text-right font-medium px-1 py-1">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((s) => {
                  const isCheapest = s.serviceCode === cheapest?.serviceCode;
                  const isPreferred = preferredSet.has(s.serviceCode);
                  return (
                    <tr
                      key={s.serviceCode}
                      className={cn(
                        "hover:bg-muted/30",
                        isPreferred && "bg-amber-50/60",
                      )}
                    >
                      <td className="px-1 py-1">
                        <div className="size-6 rounded ring-1 ring-border bg-white overflow-hidden flex items-center justify-center">
                          <CourierLogo
                            brand={s.brand}
                            className="w-full h-auto"
                          />
                        </div>
                      </td>
                      <td className="px-1 py-1">
                        <div className="font-medium flex items-center gap-1">
                          {isPreferred && (
                            <Star className="size-2.5 fill-amber-400 text-amber-500 shrink-0" />
                          )}
                          {isCheapest && !isPreferred && (
                            <Crown className="size-2.5 text-emerald-600 shrink-0" />
                          )}
                          {s.serviceLabel}
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate">
                          {s.deliveryMode}
                        </div>
                      </td>
                      <td className="px-1 py-1 text-right tabular-nums font-medium">
                        {s.totalNetPln.toFixed(2)}
                      </td>
                      <td className="px-1 py-1 text-right tabular-nums text-muted-foreground">
                        {s.totalGrossPln.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hiddenCount > 0 && (
              <div className="mt-1 text-[9px] text-muted-foreground italic px-1">
                Ukryto {hiddenCount} pozostał{hiddenCount === 1 ? "ą usługę" : hiddenCount < 5 ? "e usługi" : "ych usług"} (filtrowanie po preferencjach)
              </div>
            )}
            <div className="mt-1.5 pt-1.5 border-t flex items-center gap-3 text-[9px] text-muted-foreground">
              <span className="inline-flex items-center gap-0.5">
                <Star className="size-2.5 fill-amber-400 text-amber-500" />
                preferowane
              </span>
              <span className="inline-flex items-center gap-0.5">
                <Crown className="size-2.5 text-emerald-600" />
                najtańsze
              </span>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
