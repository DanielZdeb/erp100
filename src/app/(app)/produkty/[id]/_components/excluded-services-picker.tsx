"use client";

/**
 * Lista usług kurierskich wyłączonych z wyceny dla danego produktu.
 * Domyślnie nic nie zaznaczone = wszystkie usługi aktywne.
 * Zaznaczenie checkboxa wyklucza usługę z silnika kuriera — nie pojawi
 * się jako opcja w wycenach (perr-product i w pakowaniu zestawów).
 *
 * Różnica vs PreferredServicesPicker:
 *  - Preferowane → top-priorytetowe usługi (gwiazdka, banner „Twoja preferencja")
 *  - Wyłączone   → blacklist usług które silnik POMIJA całkowicie
 */

import { useEffect, useState, useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import {
  setExcludedShippingServicesAction,
  setExcludedShippingBrandsAction,
} from "@/server/products";
import { SHIPPING_SERVICES } from "./preferred-services-picker";
import { CourierLogo } from "./courier-logos";

export function ExcludedServicesPicker({
  productId,
  initialCodes,
  initialBrands = [],
}: {
  productId: string;
  initialCodes: string[];
  initialBrands?: string[];
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set(initialCodes));
  const [excludedBrands, setExcludedBrands] = useState<Set<string>>(
    new Set(initialBrands),
  );
  const [pending, startTransition] = useTransition();

  // Sync gdy parent revaliduje (np. po edycji w innym miejscu)
  useEffect(() => {
    setExcluded(new Set(initialCodes));
  }, [initialCodes]);
  useEffect(() => {
    setExcludedBrands(new Set(initialBrands));
  }, [initialBrands]);

  function toggle(code: string) {
    const next = new Set(excluded);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setExcluded(next);
    startTransition(async () => {
      try {
        await setExcludedShippingServicesAction(productId, Array.from(next));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  function toggleBrand(brand: "INPOST" | "DHL") {
    const next = new Set(excludedBrands);
    if (next.has(brand)) next.delete(brand);
    else next.add(brand);
    setExcludedBrands(next);
    startTransition(async () => {
      try {
        await setExcludedShippingBrandsAction(productId, Array.from(next));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  // Liczniki uwzględniają wyłączenia per-usługa I wyłączenia per-marka.
  // Marka wyłączona = wszystkie jej usługi wypadają, niezależnie od indywidualnych.
  const totalCount =
    SHIPPING_SERVICES.INPOST.length + SHIPPING_SERVICES.DHL.length;
  let excludedCount = 0;
  for (const brand of ["INPOST", "DHL"] as const) {
    if (excludedBrands.has(brand)) {
      excludedCount += SHIPPING_SERVICES[brand].length;
    } else {
      for (const s of SHIPPING_SERVICES[brand]) {
        if (excluded.has(s.code)) excludedCount++;
      }
    }
  }
  const activeCount = totalCount - excludedCount;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
            <Ban className="size-3.5 text-rose-600" />
            Wykluczone usługi kurierskie
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Zaznacz usługi, które nie mają być uwzględniane w wycenie wysyłki
            (np. brak umowy, niekompatybilność, zbyt drogie). Domyślnie
            wszystkie aktywne.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {pending && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Zapisywanie…
            </span>
          )}
          <div className="text-[10px] tabular-nums text-muted-foreground">
            <span className="text-emerald-700 font-semibold">
              {activeCount}
            </span>{" "}
            aktywnych ·{" "}
            <span className="text-rose-700 font-semibold">
              {excludedCount}
            </span>{" "}
            wyłączonych
          </div>
        </div>
      </div>

      {(["INPOST", "DHL"] as const).map((brand) => {
        const brandExcluded = excludedBrands.has(brand);
        return (
          <div
            key={brand}
            className={cn(
              "space-y-1.5",
              brandExcluded && "opacity-60",
            )}
          >
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <CourierLogo brand={brand} className="size-3.5" />
                {brand}
              </span>
              {/* Toggle „wyłącz całość marki" — gdy ON, wszystkie usługi
                  tej marki znikają z wyceny (silnik filtruje przez
                  excludedShippingBrands). Wygodniejsze niż markowanie
                  każdej usługi osobno. */}
              <label
                className={cn(
                  "ml-auto flex items-center gap-1.5 text-[10px] normal-case tracking-normal px-2 py-0.5 rounded-md cursor-pointer transition-colors",
                  brandExcluded
                    ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300 hover:bg-rose-200"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/60",
                )}
              >
                <Checkbox
                  checked={brandExcluded}
                  onCheckedChange={() => toggleBrand(brand)}
                  disabled={pending}
                  className="size-3"
                />
                <span>Wyłącz całą markę {brand}</span>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {SHIPPING_SERVICES[brand].map((s) => {
                const isExcluded = excluded.has(s.code) || brandExcluded;
                return (
                  <label
                    key={s.code}
                    className={cn(
                      "flex items-start gap-2 px-2 py-1.5 rounded-md transition-colors text-[11px]",
                      brandExcluded
                        ? "cursor-not-allowed bg-rose-50/40 ring-1 ring-rose-200/60"
                        : "cursor-pointer hover:bg-muted/40",
                      !brandExcluded && excluded.has(s.code)
                        ? "bg-rose-50/60 ring-1 ring-rose-200"
                        : !brandExcluded && "bg-muted/10",
                    )}
                  >
                    <Checkbox
                      checked={isExcluded}
                      onCheckedChange={() =>
                        !brandExcluded && toggle(s.code)
                      }
                      disabled={pending || brandExcluded}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          "font-medium leading-tight",
                          isExcluded &&
                            "line-through text-muted-foreground",
                        )}
                      >
                        {s.label}
                      </div>
                      <div className="text-[9px] text-muted-foreground leading-tight">
                        {s.mode}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
