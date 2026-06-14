"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { cn } from "@/lib/utils";

export type PriceHistoryEntry = {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  createdAt: Date;
  quantity: number;
  /** cena zakupu USD/szt (z pozycji historycznej) — dla kind="purchase" */
  unitPriceUsd: number | null;
  usdToPlnRate: number | null;
  /** cena zakupu PLN netto/szt — gotowa wartość do wyświetlenia */
  purchasePerUnitPln: number | null;
  /** koszt logistyki PLN netto/szt (alokowany po CBM × cost/m³) */
  logisticsPerUnitPln: number | null;
  /** suma: zakup + logistyka PLN netto/szt */
  landedPerUnitPln: number | null;
};

export type PriceHistoryKind = "purchase" | "logistics" | "landed";

const KIND_CONFIG: Record<
  PriceHistoryKind,
  { title: string; valueLabel: string; valueOf: (h: PriceHistoryEntry) => number | null }
> = {
  purchase: {
    title: "Historia cen zakupu",
    valueLabel: "zł/szt",
    valueOf: (h) => h.purchasePerUnitPln,
  },
  logistics: {
    title: "Historia kosztów logistyki",
    valueLabel: "zł logistyki/szt",
    valueOf: (h) => h.logisticsPerUnitPln,
  },
  landed: {
    title: "Historia sumy (zakup + prowizja + cło + logistyka)",
    valueLabel: "zł landed/szt",
    valueOf: (h) => h.landedPerUnitPln,
  },
};

/**
 * Komórka z ceną — na hover pokazuje popover z historią ostatnich 10
 * zamówień. Trzy kolumny historii: zakup, logistyka, landed. Dla każdej
 * komórki przekazujemy `kind` żeby wybrać które dane pokazać.
 * Hover delay krótki (150ms) żeby nie strzelało popoverem przy
 * przejeżdżaniu myszą po tabeli.
 */
export function PriceCellWithHistory({
  history,
  children,
  align = "end",
  kind = "purchase",
  currentNetto,
  vatRate = 0.23,
  currentUnitPriceUsd,
  currentQty,
  currentSource = "Po ostatnim zamówieniu / kalkulacji",
}: {
  history: PriceHistoryEntry[];
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  kind?: PriceHistoryKind;
  /** Aktualna cena netto/szt — pokazana w wyróżnionym pierwszym wierszu. */
  currentNetto?: number | null;
  vatRate?: number;
  /** Cena USD/szt do pokazania w kolumnie $/szt (tylko purchase). */
  currentUnitPriceUsd?: number | null;
  /** Ilość — np. z ostatniego zamówienia. Gdy null, wyświetlamy "—". */
  currentQty?: number | null;
  /** Opis pochodzenia ceny pod tytułem „Aktualna cena". */
  currentSource?: string;
}) {
  const cfg = KIND_CONFIG[kind];
  const hasData = history.some((h) => cfg.valueOf(h) != null);
  const isEmpty = history.length === 0 || !hasData;
  const factor = 1 + vatRate;
  const currentBrutto =
    currentNetto != null ? currentNetto * factor : null;
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
          <PopoverPrimitive.Popup className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden min-w-[320px]">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="font-semibold text-[11px]">{cfg.title}</span>
              {!isEmpty && (
                <span className="text-[10px] text-muted-foreground">
                  ({history.length}
                  {history.length === 10 ? "+" : ""} ostatnich)
                </span>
              )}
            </div>
            <table className="w-full text-[10px]">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left font-medium px-1 py-1">Pozycja</th>
                  <th className="text-right font-medium px-1 py-1">Ilość</th>
                  {kind === "purchase" && (
                    <>
                      <th className="text-right font-medium px-1 py-1">$/szt</th>
                      <th className="text-right font-medium px-1 py-1">Kurs</th>
                    </>
                  )}
                  <th className="text-right font-medium px-1 py-1">Netto</th>
                  <th className="text-right font-medium px-1 py-1">Brutto</th>
                </tr>
              </thead>
              <tbody>
                {/* Aktualna cena — wyróżniona u góry (jak preferowana w wysyłce) */}
                {currentNetto != null && (
                  <tr className="bg-amber-50/60">
                    <td className="px-1 py-1.5">
                      <div className="font-medium flex items-center gap-1">
                        <Star className="size-2.5 fill-amber-400 text-amber-500 shrink-0" />
                        Aktualna cena
                      </div>
                      <div className="text-[9px] text-muted-foreground">
                        {currentSource}
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-right tabular-nums">
                      {currentQty != null ? (
                        currentQty
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {kind === "purchase" && (
                      <>
                        <td className="px-1 py-1.5 text-right tabular-nums">
                          {currentUnitPriceUsd != null ? (
                            currentUnitPriceUsd.toFixed(2)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-right tabular-nums">
                          {currentUnitPriceUsd != null && currentUnitPriceUsd > 0 ? (
                            <span className="text-slate-600">
                              {(currentNetto / currentUnitPriceUsd).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-1 py-1.5 text-right tabular-nums font-semibold">
                      {currentNetto.toFixed(2)}
                    </td>
                    <td className="px-1 py-1.5 text-right tabular-nums font-semibold text-amber-700">
                      {currentBrutto!.toFixed(2)}
                    </td>
                  </tr>
                )}
                {/* Historyczne pozycje — szare, klikalny link do zamówienia */}
                {isEmpty
                  ? currentNetto == null && (
                      <tr>
                        <td
                          colSpan={kind === "purchase" ? 6 : 4}
                          className="px-1 py-2 text-[11px] text-muted-foreground italic"
                        >
                          Brak historii — to pierwsze zamówienie z tym produktem.
                        </td>
                      </tr>
                    )
                  : history.map((h) => {
                      const value = cfg.valueOf(h);
                      const brutto = value != null ? value * factor : null;
                      const rate = h.usdToPlnRate;
                      return (
                        <tr
                          key={h.orderId + h.orderNumber}
                          className="hover:bg-muted/30"
                        >
                          <td className="px-1 py-1 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Link
                                href={`/zamowienia/${h.orderId}`}
                                className="hover:underline text-primary font-medium"
                              >
                                {h.orderNumber}
                              </Link>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded px-1 py-0 text-[8px] uppercase ring-1",
                                  statusBadge(h.orderStatus),
                                )}
                              >
                                {statusShort(h.orderStatus)}
                              </span>
                            </div>
                            <div className="text-[9px] text-muted-foreground tabular-nums">
                              {h.createdAt.toLocaleDateString("pl-PL")}
                            </div>
                          </td>
                          <td className="px-1 py-1 text-right tabular-nums">
                            {h.quantity}
                          </td>
                          {kind === "purchase" && (
                            <>
                              <td className="px-1 py-1 text-right tabular-nums">
                                {h.unitPriceUsd != null
                                  ? h.unitPriceUsd.toFixed(2)
                                  : "—"}
                              </td>
                              <td className="px-1 py-1 text-right tabular-nums text-slate-600">
                                {rate != null ? rate.toFixed(4) : "—"}
                              </td>
                            </>
                          )}
                          <td className="px-1 py-1 text-right tabular-nums font-medium">
                            {value != null ? value.toFixed(2) : "—"}
                          </td>
                          <td className="px-1 py-1 text-right tabular-nums text-muted-foreground">
                            {brutto != null ? brutto.toFixed(2) : "—"}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
            {currentNetto != null && (
              <div className="mt-1.5 pt-1.5 border-t flex items-center gap-3 text-[9px] text-muted-foreground">
                <span className="inline-flex items-center gap-0.5">
                  <Star className="size-2.5 fill-amber-400 text-amber-500" />
                  aktualna
                </span>
                <span className="opacity-60">
                  Historyczne — kliknij numer zamówienia żeby przejść
                </span>
              </div>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function statusShort(s: string): string {
  switch (s) {
    case "PLANOWANE":
      return "plan.";
    case "DOGADYWANE":
      return "dog.";
    case "PRODUKOWANE":
      return "prod.";
    case "WYPRODUKOWANE":
      return "wyp.";
    case "WYSLANE":
      return "wys.";
    case "ODEBRANE":
      return "ode.";
    case "W_MAGAZYNIE":
      return "mag.";
    default:
      return s.slice(0, 4).toLowerCase();
  }
}

function statusBadge(s: string): string {
  switch (s) {
    case "DOGADYWANE":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "PRODUKOWANE":
      return "bg-blue-100 text-blue-800 ring-blue-200";
    case "WYPRODUKOWANE":
      return "bg-cyan-100 text-cyan-800 ring-cyan-200";
    case "WYSLANE":
      return "bg-violet-100 text-violet-800 ring-violet-200";
    case "ODEBRANE":
      return "bg-indigo-100 text-indigo-800 ring-indigo-200";
    case "W_MAGAZYNIE":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}
