"use client";

/**
 * Panel pakowania dla ZESTAW (compositionMode=ZESTAW).
 *
 * Dwa tryby:
 *  - SINGLE_CARTON — cały zestaw w 1 kartonie z biblioteki
 *  - INDIVIDUAL_PACKAGING — każdy komponent w swoim primary SHIPPING boxie;
 *    breakdown pokazuje ile paczek per komponent i sumaryczną cenę kartonów.
 */

import { useState, useTransition } from "react";
import { Package, Boxes } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  BundleComponentPackaging,
  BundlePackagingBreakdown,
} from "@/lib/bundle-packaging";
import type { BoxOption } from "../../../boxes-tab";
import { InlineBoxPicker } from "../../../../new-product-wizard";
import { setBundleShippingAction } from "@/server/bundles";

type Mode = "SINGLE_CARTON" | "INDIVIDUAL_PACKAGING";

type BundleBox = {
  id: string;
  name: string;
  internalCode: string | null;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  weightKg: number | null;
  purchasePricePln: number | null;
};

export function BundlePackagingPanel({
  product,
  breakdown,
  availableBoxes,
}: {
  product: {
    id: string;
    name: string;
    bundleShippingMode: Mode | null;
    bundleShippingBoxId: string | null;
    bundleShippingBox: BundleBox | null;
  };
  breakdown: BundlePackagingBreakdown;
  availableBoxes: BoxOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* LEWA: Wybór trybu + breakdown */}
      <section className="space-y-3">
        <h3 className="text-sm font-heading font-semibold">Tryb pakowania</h3>
        <div className="space-y-2.5">
          <ModeCardSummary
            active={product.bundleShippingMode === "SINGLE_CARTON"}
            icon={Package}
            title="Wysyłka zestawu w 1 kartonie"
            description="Cały zestaw zapakowany w jeden karton wysyłkowy z biblioteki."
            theme="indigo"
            badgeText={
              product.bundleShippingMode === "SINGLE_CARTON"
                ? "Wybrane"
                : null
            }
          >
            {product.bundleShippingMode === "SINGLE_CARTON" && (
              <div className="mt-2 rounded-md ring-1 ring-indigo-200 bg-white p-2 space-y-0.5">
                {product.bundleShippingBox ? (
                  <>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-indigo-900 truncate">
                        {product.bundleShippingBox.name}
                      </span>
                      {product.bundleShippingBox.internalCode && (
                        <span className="text-[9px] text-indigo-700/70 tabular-nums shrink-0">
                          {product.bundleShippingBox.internalCode}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-700 tabular-nums">
                      <span>
                        <span className="opacity-60">Wymiary:</span>{" "}
                        <span className="font-medium">
                          {product.bundleShippingBox.widthCm}×
                          {product.bundleShippingBox.heightCm}×
                          {product.bundleShippingBox.depthCm} cm
                        </span>
                      </span>
                      {product.bundleShippingBox.weightKg != null && (
                        <span>
                          <span className="opacity-60">Waga pud.:</span>{" "}
                          <span className="font-medium">
                            {product.bundleShippingBox.weightKg.toFixed(2)} kg
                          </span>
                        </span>
                      )}
                      {product.bundleShippingBox.purchasePricePln != null && (
                        <span>
                          <span className="opacity-60">Cena:</span>{" "}
                          <span className="font-medium text-emerald-700">
                            {product.bundleShippingBox.purchasePricePln.toFixed(2)} zł
                          </span>
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-rose-700 italic">
                    ⚠ Brak wybranego kartonu — kliknij „Edytuj pakowanie zestawu"
                  </div>
                )}
              </div>
            )}
          </ModeCardSummary>
          <ModeCardSummary
            active={product.bundleShippingMode === "INDIVIDUAL_PACKAGING"}
            icon={Boxes}
            title="Wysyłka składników (każdy w swoim pudełku)"
            description="Każdy komponent zestawu pakowany osobno w jego primary karton wysyłkowy. Suma paczek to suma boxów per komponent."
            theme="emerald"
            badgeText={
              product.bundleShippingMode === "INDIVIDUAL_PACKAGING"
                ? "Wybrane"
                : null
            }
          />
        </div>
        <div className="flex justify-center pt-2">
          <EditBundleButton
            product={product}
            availableBoxes={availableBoxes}
            open={editOpen}
            setOpen={setEditOpen}
          />
        </div>
      </section>

      {/* PRAWA: Breakdown paczek per komponent */}
      <section className="space-y-3">
        <h3 className="text-sm font-heading font-semibold">
          Paczki na 1 zestaw{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({breakdown.totalPackagesPerSet} łącznie)
          </span>
        </h3>
        {product.bundleShippingMode === "SINGLE_CARTON" ? (
          <div className="rounded-md ring-1 ring-indigo-200 bg-indigo-50/30 p-3 space-y-2">
            <div className="text-[11px] text-indigo-900">
              Sumaryczna paczka: <strong>1 karton</strong> — cały zestaw.
            </div>
            {product.bundleShippingBox ? (
              <table className="w-full text-[11px]">
                <tbody>
                  <tr>
                    <td className="py-0.5 text-indigo-700/70 w-24">Karton:</td>
                    <td className="py-0.5 font-semibold text-indigo-900">
                      {product.bundleShippingBox.name}
                      {product.bundleShippingBox.internalCode && (
                        <span className="ml-2 text-[9px] text-indigo-700/60 tabular-nums">
                          {product.bundleShippingBox.internalCode}
                        </span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-indigo-700/70">Wymiary:</td>
                    <td className="py-0.5 font-mono font-medium tabular-nums">
                      {product.bundleShippingBox.widthCm}×
                      {product.bundleShippingBox.heightCm}×
                      {product.bundleShippingBox.depthCm} cm
                    </td>
                  </tr>
                  {product.bundleShippingBox.weightKg != null && (
                    <tr>
                      <td className="py-0.5 text-indigo-700/70">
                        Waga pudełka:
                      </td>
                      <td className="py-0.5 font-mono font-medium tabular-nums">
                        {product.bundleShippingBox.weightKg.toFixed(2)} kg
                      </td>
                    </tr>
                  )}
                  {product.bundleShippingBox.purchasePricePln != null && (
                    <tr>
                      <td className="py-0.5 text-indigo-700/70">
                        Cena kartonu:
                      </td>
                      <td className="py-0.5 font-medium text-emerald-700 tabular-nums">
                        {product.bundleShippingBox.purchasePricePln.toFixed(2)}{" "}
                        zł
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <div className="text-[11px] text-rose-700 italic">
                ⚠ Brak wybranego kartonu — wybierz w edycji pakowania.
              </div>
            )}
          </div>
        ) : breakdown.components.length === 0 ? (
          <div className="rounded-md bg-slate-50 ring-1 ring-slate-200 p-3 text-xs text-muted-foreground italic">
            Zestaw nie ma jeszcze komponentów. Dodaj je w sekcji „Zestaw" w
            karcie produktu.
          </div>
        ) : (
          <BundleBreakdownTable breakdown={breakdown} />
        )}

        {(breakdown.componentsWithoutBox > 0 ||
          breakdown.componentsWithoutPrice > 0) &&
          product.bundleShippingMode === "INDIVIDUAL_PACKAGING" && (
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-900">
              ⚠{" "}
              {breakdown.componentsWithoutBox > 0 && (
                <span>
                  {breakdown.componentsWithoutBox} komponent(ów) bez przypiętego
                  primary SHIPPING boxa.{" "}
                </span>
              )}
              {breakdown.componentsWithoutPrice > 0 && (
                <span>
                  {breakdown.componentsWithoutPrice} kartonów bez ceny zakupu w
                  bibliotece.
                </span>
              )}
            </div>
          )}
      </section>
    </div>
  );
}

function ModeCardSummary({
  active,
  icon: Icon,
  title,
  description,
  theme,
  badgeText,
  children,
}: {
  active: boolean;
  icon: React.ElementType;
  title: string;
  description: string;
  theme: "indigo" | "emerald";
  badgeText: string | null;
  children?: React.ReactNode;
}) {
  const themeClasses = {
    indigo: {
      ring: active ? "ring-2 ring-indigo-400 bg-indigo-50/40" : "ring-1 ring-slate-200",
      iconBg: "bg-indigo-100 text-indigo-700",
      badge: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300",
    },
    emerald: {
      ring: active ? "ring-2 ring-emerald-400 bg-emerald-50/40" : "ring-1 ring-slate-200",
      iconBg: "bg-emerald-100 text-emerald-700",
      badge: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
    },
  }[theme];
  return (
    <div className={cn("rounded-md p-3 transition-all", themeClasses.ring)}>
      <div className="flex items-start gap-2">
        <div className={cn("size-9 rounded-md grid place-items-center shrink-0", themeClasses.iconBg)}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            {badgeText && (
              <span className={cn("text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded", themeClasses.badge)}>
                ✓ {badgeText}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            {description}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function EditBundleButton({
  product,
  availableBoxes,
  open,
  setOpen,
}: {
  product: {
    id: string;
    name: string;
    bundleShippingMode: Mode | null;
    bundleShippingBoxId: string | null;
  };
  availableBoxes: BoxOption[];
  open: boolean;
  setOpen: (b: boolean) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(
    product.bundleShippingMode ?? "INDIVIDUAL_PACKAGING",
  );
  const [boxId, setBoxId] = useState<string | null>(
    product.bundleShippingBoxId ?? null,
  );
  const [pending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      try {
        await setBundleShippingAction(product.id, {
          mode,
          shippingBoxId: mode === "SINGLE_CARTON" ? boxId : null,
        });
        toast.success("Zapisano pakowanie zestawu");
        router.refresh();
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-6"
      >
        Edytuj pakowanie zestawu
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="!max-w-[min(96vw,720px)]">
            <DialogHeader>
              <DialogTitle>Edytuj pakowanie zestawu</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("SINGLE_CARTON")}
                  className={cn(
                    "text-left rounded-md p-3 transition-all",
                    mode === "SINGLE_CARTON"
                      ? "ring-2 ring-indigo-400 bg-indigo-50"
                      : "ring-1 ring-slate-200 hover:ring-slate-300",
                  )}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Package className="size-4 text-indigo-600" />
                    1 karton
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    Cały zestaw w jednym kartonie z biblioteki.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("INDIVIDUAL_PACKAGING")}
                  className={cn(
                    "text-left rounded-md p-3 transition-all",
                    mode === "INDIVIDUAL_PACKAGING"
                      ? "ring-2 ring-emerald-400 bg-emerald-50"
                      : "ring-1 ring-slate-200 hover:ring-slate-300",
                  )}
                >
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <Boxes className="size-4 text-emerald-600" />
                    Każdy składnik osobno
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    Pakowanie z primary boxów każdego komponentu.
                  </div>
                </button>
              </div>
              {mode === "SINGLE_CARTON" && (
                <div className="rounded-md ring-1 ring-slate-200 bg-slate-50/40 p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wide font-semibold text-slate-600">
                    Karton wysyłkowy zestawu
                  </div>
                  <InlineBoxPicker
                    boxes={availableBoxes}
                    selectedId={boxId}
                    onSelect={setBoxId}
                    theme="indigo"
                    packagingFilter="BOX"
                    collectiveFilter={false}
                    quickAddType="BOX"
                    quickAddLabel="Dodaj nowy karton zestawu"
                    quickAddDefaultOrigin="POLAND"
                    quickAddDefaultPurposeText={product.name}
                  />
                </div>
              )}
              {mode === "INDIVIDUAL_PACKAGING" && (
                <div className="rounded-md ring-1 ring-emerald-200 bg-emerald-50/30 p-3 text-xs text-emerald-900">
                  Suma kartonów liczona automatycznie z komponentów. Karton i
                  „sztuk / karton" ustawia się na poziomie KAŻDEGO komponentu w
                  jego zakładce „Pakowanie".
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {pending ? "Zapisuję…" : "Zapisz"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}


// ─── Tabela breakdown z tooltipami ────────────────────────────────────

function BundleBreakdownTable({
  breakdown,
}: {
  breakdown: BundlePackagingBreakdown;
}) {
  const totalShipping = breakdown.components.reduce(
    (s, c) => s + (c.shippingCostTotal ?? 0),
    0,
  );
  const anyShippingMissing = breakdown.components.some(
    (c) => c.box && c.shippingCostTotal == null,
  );

  return (
    <div className="rounded-md ring-1 ring-emerald-200 bg-emerald-50/20 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-emerald-100/40 text-[10px] uppercase tracking-wide text-emerald-800">
          <tr>
            <th className="text-left px-1.5 py-1.5 font-semibold">Komponent</th>
            <th className="text-right px-1.5 py-1.5 font-semibold">Szt.</th>
            <th
              className="text-right px-1.5 py-1.5 font-semibold"
              title="Sztuk produktu w jednym kartonie"
            >
              Szt./pud.
            </th>
            <th className="text-right px-1.5 py-1.5 font-semibold">Paczek</th>
            <th
              className="text-right px-1.5 py-1.5 font-semibold"
              title="Łączny koszt kartonów (pudełko × liczba paczek)"
            >
              Opakow.
            </th>
            <th className="text-right px-1.5 py-1.5 font-semibold">Wysyłka</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.components.map((c) => (
            <tr
              key={c.componentId}
              className="border-t border-emerald-100 hover:bg-emerald-50/30"
            >
              <td className="px-1.5 py-1.5">
                <div className="font-medium text-emerald-900 truncate max-w-[130px]">
                  {c.componentName}
                </div>
                <div className="text-[9px] text-emerald-700/70 tabular-nums truncate max-w-[130px]">
                  {c.componentCode}
                  {c.box && (
                    <>
                      {" · "}
                      <span title={c.box.name}>
                        {c.box.widthCm}×{c.box.heightCm}×{c.box.depthCm}
                      </span>
                    </>
                  )}
                </div>
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums font-medium">
                {c.qtyPerSet}
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">
                {c.unitsPerBox}
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums font-semibold text-emerald-900">
                {c.packagesNeeded}
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                <PackagingCostCell c={c} />
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap">
                <ShippingCostCell c={c} />
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-emerald-300 bg-emerald-100/40 font-bold text-emerald-900">
            <td className="px-1.5 py-2 text-right" colSpan={3}>
              Suma na 1 zestaw
            </td>
            <td className="px-1.5 py-2 text-right tabular-nums">
              {breakdown.totalPackagesPerSet}
            </td>
            <td className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap">
              {breakdown.totalPackagingCostPerSet != null ? (
                `${breakdown.totalPackagingCostPerSet.toFixed(2)} zł`
              ) : (
                <span className="text-amber-700">— (braki cen)</span>
              )}
            </td>
            <td className="px-1.5 py-2 text-right tabular-nums whitespace-nowrap">
              {totalShipping > 0 ? (
                <>
                  {totalShipping.toFixed(2)} zł
                  {anyShippingMissing && (
                    <span className="ml-1 text-[9px] text-amber-700 font-normal italic">
                      (częśc.)
                    </span>
                  )}
                </>
              ) : (
                <span className="text-amber-700">—</span>
              )}
            </td>
          </tr>
          {/* Wielopak — wycena CAŁEGO zestawu jako jedna przesyłka.
              Pokazujemy zawsze gdy mamy quote, nawet jeśli równa sumie
              per-component (informacyjnie dla usera) — sygnalizuje że
              architektura widzi paczki razem i jest gotowa na rabat skali. */}
          {breakdown.bundleShippingQuote && (
            <tr className="border-t border-emerald-300/40 bg-emerald-50/40 text-[11px]">
              <td colSpan={3} className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-emerald-900">
                    Wielopak ({breakdown.bundleShippingQuote.packageCount}{" "}
                    paczek)
                  </span>
                  <span className="text-[10px] text-emerald-700/80">
                    {breakdown.bundleShippingQuote.serviceLabel}
                  </span>
                  <span className="text-[9px] text-emerald-700 bg-emerald-100 ring-1 ring-emerald-300 rounded px-1 py-0">
                    tylko wysyłka
                  </span>
                </div>
                <div className="text-[9px] text-emerald-700/60 italic mt-0.5">
                  Alternatywna wycena samej WYSYŁKI — wszystkie paczki jako
                  jedna przesyłka (jeden numer nadania). Nie dotyczy kosztu
                  opakowań. Bez rabatu skali z umowy — wgranie tabeli rabatów
                  obniży tę wartość.
                </div>
              </td>
              <td
                className="px-1.5 py-2 text-right text-emerald-700/40 italic"
                title="Liczba paczek juz jest w wierszu wyzej (suma)"
              >
                n/d
              </td>
              <td
                className="px-1.5 py-2 text-right text-emerald-700/40 italic"
                title="Wielopak dotyczy tylko wysylki — opakowania uzywaja sumy per-komponent z wiersza wyzej"
              >
                n/d
              </td>
              <td className="px-1.5 py-2 text-right tabular-nums font-semibold text-emerald-900 whitespace-nowrap">
                {breakdown.bundleShippingQuote.totalNetPln.toFixed(2)} zł
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PackagingCostCell({ c }: { c: BundleComponentPackaging }) {
  if (c.totalPackagingCost == null) {
    return (
      <span
        className="text-amber-700"
        title={
          !c.box
            ? "Brak primary SHIPPING box"
            : "Brak ceny zakupu kartonu w bibliotece"
        }
      >
        —
      </span>
    );
  }
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={150}
        nativeButton={false}
        render={
          <span
            className="cursor-help underline decoration-dotted decoration-emerald-700/40 underline-offset-2 text-emerald-900"
            tabIndex={0}
          >
            {c.totalPackagingCost.toFixed(2)} zł
          </span>
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align="end"
          side="bottom"
          sideOffset={6}
          className="isolate z-[200]"
        >
          <PopoverPrimitive.Popup className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden min-w-[260px]">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="font-semibold text-[11px]">
                Koszt opakowań — {c.componentCode}
              </span>
            </div>
            <table className="w-full text-[10px]">
              <tbody>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">Karton:</td>
                  <td className="px-1 py-0.5 font-medium">{c.box?.name}</td>
                </tr>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">
                    Cena/karton:
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums font-medium">
                    {c.pricePerCarton?.toFixed(2)} zł
                  </td>
                </tr>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">
                    Liczba paczek:
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums font-medium">
                    {c.packagesNeeded} ({c.qtyPerSet} szt ÷ {c.unitsPerBox})
                  </td>
                </tr>
                <tr className="bg-amber-50/60">
                  <td className="px-1 py-1 font-semibold">Razem:</td>
                  <td className="px-1 py-1 text-right tabular-nums font-semibold text-amber-700">
                    {c.pricePerCarton?.toFixed(2)} × {c.packagesNeeded} ={" "}
                    {c.totalPackagingCost.toFixed(2)} zł
                  </td>
                </tr>
              </tbody>
            </table>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function ShippingCostCell({ c }: { c: BundleComponentPackaging }) {
  if (!c.box) {
    return (
      <span className="text-amber-700" title="Brak przypiętego kartonu">
        —
      </span>
    );
  }
  if (!c.shippingQuote || c.shippingCostTotal == null) {
    return (
      <span
        className="text-amber-700"
        title="Brak wagi komponentu lub kartonu — wpisz dane"
      >
        —
      </span>
    );
  }
  const q = c.shippingQuote;
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={150}
        nativeButton={false}
        render={
          <span
            className="cursor-help underline decoration-dotted decoration-indigo-700/40 underline-offset-2 text-indigo-900"
            tabIndex={0}
          >
            {c.shippingCostTotal.toFixed(2)} zł
          </span>
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align="end"
          side="bottom"
          sideOffset={6}
          className="isolate z-[200]"
        >
          <PopoverPrimitive.Popup className="rounded-lg bg-popover p-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden min-w-[280px]">
            <div className="mb-1.5 flex items-baseline gap-2 px-1">
              <span className="font-semibold text-[11px]">
                Wysyłka — {c.componentCode}
              </span>
              <span
                className={cn(
                  "text-[9px] uppercase font-bold px-1 py-0.5 rounded",
                  q.cheapestBrand === "INPOST"
                    ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                    : "bg-rose-100 text-rose-800 ring-1 ring-rose-300",
                )}
              >
                {q.cheapestBrand}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground italic px-1 mb-1.5">
              {q.reason}
            </div>
            <table className="w-full text-[10px]">
              <tbody>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">Usługa:</td>
                  <td className="px-1 py-0.5 font-medium">
                    {q.cheapestServiceLabel}
                  </td>
                </tr>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">
                    Wymiary paczki:
                  </td>
                  <td className="px-1 py-0.5 tabular-nums">
                    {q.packageDims.w}×{q.packageDims.h}×{q.packageDims.d} cm
                  </td>
                </tr>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">
                    Waga paczki:
                  </td>
                  <td className="px-1 py-0.5 tabular-nums">
                    {q.packageDims.weightKg.toFixed(2)} kg
                  </td>
                </tr>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">
                    Cena / paczka:
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums font-medium">
                    {q.perPackageNetto.toFixed(2)} zł
                    <span className="ml-1 text-[9px] text-muted-foreground">
                      ({q.perPackageBrutto.toFixed(2)} brutto)
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="px-1 py-0.5 text-muted-foreground">
                    Liczba paczek:
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums font-medium">
                    {c.packagesNeeded}
                  </td>
                </tr>
                <tr className="bg-amber-50/60">
                  <td className="px-1 py-1 font-semibold">Razem:</td>
                  <td className="px-1 py-1 text-right tabular-nums font-semibold text-amber-700">
                    {q.perPackageNetto.toFixed(2)} × {c.packagesNeeded} ={" "}
                    {c.shippingCostTotal.toFixed(2)} zł
                  </td>
                </tr>
              </tbody>
            </table>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
