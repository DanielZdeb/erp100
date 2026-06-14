"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Crown, Loader2, Target } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

import { setPreferredShippingServicesAction } from "@/server/products";
import { priceAllServices } from "@/lib/courier-pricing";

import { CourierLogo } from "./courier-logos";

type ServiceMeta = {
  code: string;
  label: string;
  mode: string;
};

/** Cała lista usług w silniku — synchronizowana ręcznie z lib/courier-pricing.
 *  Eksport żeby ExcludedServicesPicker mógł użyć tej samej definicji. */
export const SHIPPING_SERVICES: Record<"INPOST" | "DHL", ServiceMeta[]> = {
  INPOST: [
    {
      code: "INPOST_PACZKOMAT_A",
      label: "Paczkomat 24/7 — Gabaryt A",
      mode: "Do paczkomatu · 8×38×64, do 25 kg",
    },
    {
      code: "INPOST_PACZKOMAT_B",
      label: "Paczkomat 24/7 — Gabaryt B",
      mode: "Do paczkomatu · 19×38×64, do 25 kg",
    },
    {
      code: "INPOST_PACZKOMAT_C",
      label: "Paczkomat 24/7 — Gabaryt C",
      mode: "Do paczkomatu · 41×38×64, do 25 kg",
    },
    {
      code: "INPOST_KURIER_STANDARD",
      label: "InPost Kurier Standard",
      // Dłużyca i NST są LICZONE automatycznie gdy spełniają warunki — nie
      // wpisujemy ich w label, bo mylą gdy paczka nie podlega (sugeruje że
      // każda paczka jest traktowana jako dłużyca). Reguły:
      //   - dłużyca: 1 najdłuższy bok > 120 cm → +100 zł
      //   - NST: suma boków > 200 cm → +22 zł (osobny niezależny próg)
      mode: "Do drzwi · do 50 kg (max 120 cm, suma 220 cm)",
    },
  ],
  DHL: [
    {
      code: "DHL_PARCEL_POLSKA",
      label: "DHL Parcel Polska",
      mode: "Od drzwi do drzwi (D+1) · do 31.5 kg",
    },
    {
      code: "DHL_PARCEL_PREMIUM",
      label: "DHL Parcel Premium",
      mode: "Od drzwi do drzwi z gwarancją (D+1)",
    },
    {
      code: "DHL_PARCEL_9",
      label: "DHL Parcel 9",
      mode: "Express do 9:00",
    },
    {
      code: "DHL_PARCEL_12",
      label: "DHL Parcel 12",
      mode: "Express do 12:00",
    },
    {
      code: "DHL_PARCEL_ECONOMY",
      label: "DHL Parcel Economy",
      mode: "Do punktu POP / Locker · 64×38×41, do 25 kg",
    },
    {
      code: "DHL_PARCEL_MAX_PACZKA",
      label: "DHL Parcel MAX Paczka",
      mode: "Od drzwi do drzwi · 31.5–50 kg, bez palety",
    },
    {
      code: "DHL_PARCEL_MAX_POLPALETA",
      label: "DHL Parcel MAX Półpaleta",
      mode: "Półpaleta (burta-burta) · do 200 kg",
    },
    {
      code: "DHL_PARCEL_MAX_PALETA",
      label: "DHL Parcel MAX Paleta",
      mode: "Pełna paleta (burta-burta) · do 1000 kg",
    },
  ],
};

export function PreferredServicesPicker({
  productId,
  initialCodes,
  productWeightKg,
  primaryBox,
}: {
  productId: string;
  initialCodes: string[];
  productWeightKg?: number | null;
  primaryBox?: {
    widthCm: number;
    heightCm: number;
    depthCm: number;
    weightKg: number | null;
  } | null;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialCodes),
  );
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync na revalidate parent
  useEffect(() => {
    setSelected(new Set(initialCodes));
  }, [initialCodes]);

  // Wycena per usługa dla primary boxa + waga produktu (1 szt./paczka).
  const priceMap = useMemo(() => {
    const m = new Map<
      string,
      { netto: number; brutto: number; applicable: boolean }
    >();
    if (!primaryBox) return m;
    const pkgWeight =
      (primaryBox.weightKg ?? 0) + (productWeightKg ?? 0);
    if (
      primaryBox.widthCm <= 0 ||
      primaryBox.heightCm <= 0 ||
      primaryBox.depthCm <= 0 ||
      pkgWeight <= 0
    ) {
      return m;
    }
    const services = priceAllServices(
      [
        {
          widthCm: primaryBox.widthCm,
          heightCm: primaryBox.heightCm,
          depthCm: primaryBox.depthCm,
          weightKg: pkgWeight,
        },
      ],
      {},
    );
    for (const s of services) {
      m.set(s.serviceCode, {
        netto: s.totalNetPln,
        brutto: s.totalGrossPln,
        applicable: s.applicable,
      });
    }
    return m;
  }, [primaryBox, productWeightKg]);

  // Top 3 najtańsze applicable — auto-rekomendacja
  const top3Codes = useMemo(() => {
    if (priceMap.size === 0) return new Set<string>();
    const arr: { code: string; netto: number }[] = [];
    priceMap.forEach((v, code) => {
      if (v.applicable) arr.push({ code, netto: v.netto });
    });
    arr.sort((a, b) => a.netto - b.netto);
    return new Set(arr.slice(0, 3).map((x) => x.code));
  }, [priceMap]);

  // AUTO-SELEKCJA: gdy user nie ma jeszcze ŻADNEJ preferencji + mamy primary
  // box (więc top3Codes jest policzone), zapisz automatycznie 3 najtańsze.
  // Stan flag `autoApplied` zapobiega re-aplikacji po toggle przez usera.
  const [autoApplied, setAutoApplied] = useState(false);
  useEffect(() => {
    if (autoApplied) return;
    if (initialCodes.length > 0) {
      // User już ma preferencje — nie ruszamy
      setAutoApplied(true);
      return;
    }
    if (top3Codes.size === 0) return; // brak danych do wyceny
    const codes = Array.from(top3Codes);
    setSelected(new Set(codes));
    setAutoApplied(true);
    startTransition(async () => {
      try {
        await setPreferredShippingServicesAction(productId, codes);
        setSavedAt(Date.now());
      } catch {
        /* silent fail — user może wybrać ręcznie */
      }
    });
  }, [autoApplied, initialCodes, top3Codes, productId]);

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelected(next);

    startTransition(async () => {
      try {
        await setPreferredShippingServicesAction(productId, Array.from(next));
        setSavedAt(Date.now());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
        // Rollback
        setSelected(new Set(initialCodes));
      }
    });
  }

  const showSaved = savedAt != null && Date.now() - savedAt < 3000;

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Preferowane usługi kurierskie</h3>
          <p className="text-[11px] text-muted-foreground">
            Zaznacz usługi, których standardowo używasz do wysyłki. Ceny są
            policzone dla 1 szt. produktu w primary box.{" "}
            <Target className="inline size-3 text-emerald-600" /> oznaczają{" "}
            <strong>top 3 najtańsze applicable</strong> dla tej paczki.
          </p>
        </div>
        <div className="shrink-0">
          {pending && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Zapisywanie…
            </span>
          )}
          {!pending && showSaved && (
            <span className="text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              <Check className="size-3" />
              Zapisano
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(["INPOST", "DHL"] as const).map((brand) => (
          <div key={brand} className="space-y-1.5">
            <div className="flex items-center gap-2 pb-1 border-b">
              <div className="size-7 rounded ring-1 ring-border bg-white overflow-hidden flex items-center justify-center">
                <CourierLogo brand={brand} className="w-full h-auto" />
              </div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                {brand === "INPOST" ? "InPost" : "DHL"}
              </span>
            </div>
            <ul className="space-y-1">
              {SHIPPING_SERVICES[brand].map((s) => {
                const isSelected = selected.has(s.code);
                const price = priceMap.get(s.code);
                const isTop3 = top3Codes.has(s.code);
                return (
                  <li key={s.code}>
                    <label
                      className={cn(
                        "flex items-start gap-2 p-2 rounded-md cursor-pointer transition-colors",
                        isSelected
                          ? "bg-amber-50/60 ring-1 ring-amber-200"
                          : isTop3
                            ? "bg-emerald-50/40 ring-1 ring-emerald-200"
                            : "hover:bg-muted",
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(s.code)}
                        disabled={pending}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate flex items-center gap-1">
                          {isTop3 && (
                            <Target
                              className="size-3 text-emerald-600 shrink-0"
                              aria-label="Top 3 najtańsze"
                            />
                          )}
                          {s.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {s.mode}
                        </div>
                      </div>
                      {price ? (
                        price.applicable ? (
                          <div className="text-right shrink-0">
                            <div className="text-xs font-bold tabular-nums">
                              {price.netto.toFixed(2)} zł
                            </div>
                            <div className="text-[9px] text-muted-foreground tabular-nums">
                              brutto {price.brutto.toFixed(2)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] text-rose-700 italic shrink-0">
                            nie pasuje
                          </span>
                        )
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="pt-2 border-t text-[11px] text-muted-foreground">
          Wybrano <strong>{selected.size}</strong> z{" "}
          {SHIPPING_SERVICES.INPOST.length + SHIPPING_SERVICES.DHL.length} usług.
        </div>
      )}
    </Card>
  );
}
