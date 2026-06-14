"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Crown,
  Package,
  Plus,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  priceAllServices,
  recommend,
  type PackageInput,
  type PricedService,
} from "@/lib/courier-pricing";

import { CourierLogo } from "./courier-logos";

type PinnedBox = {
  id: string;
  name: string;
  packagingType: "BOX" | "POLY_BAG";
  widthCm: number;
  heightCm: number;
  depthCm: number;
  weightKg: number | null;
  unitsPerBox: number;
};

type Pkg = {
  id: string;
  widthCm: string;
  heightCm: string;
  depthCm: string;
  weightKg: string;
};

export function ShippingQuote({
  productWeightKg,
  pinnedBoxes,
  preferredServiceCodes = [],
}: {
  productWeightKg: number | null;
  pinnedBoxes: PinnedBox[];
  preferredServiceCodes?: string[];
}) {
  const preferredSet = useMemo(
    () => new Set(preferredServiceCodes),
    [preferredServiceCodes],
  );

  // Default qty = 1 produkt per paczka (typowa wysyłka B2C).
  // User może zmienić qty i wagę przeliczy się automatycznie.
  const [qtyInBox, setQtyInBox] = useState(1);

  function packageWeightFromBox(b: PinnedBox, qty: number): number {
    return (b.weightKg ?? 0) + (productWeightKg ?? 0) * qty;
  }

  // Domyślnie: 1 paczka z pierwszego primary boxa, qty=1
  const initial = useMemo<Pkg[]>(() => {
    if (pinnedBoxes.length > 0) {
      const b = pinnedBoxes[0];
      const totalWeight = packageWeightFromBox(b, 1);
      return [
        {
          id: rid(),
          widthCm: String(b.widthCm),
          heightCm: String(b.heightCm),
          depthCm: String(b.depthCm),
          weightKg: totalWeight > 0 ? totalWeight.toFixed(2) : "",
        },
      ];
    }
    return [
      {
        id: rid(),
        widthCm: "",
        heightCm: "",
        depthCm: "",
        weightKg: productWeightKg != null ? String(productWeightKg) : "",
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productWeightKg, pinnedBoxes]);

  const [packages, setPackages] = useState<Pkg[]>(initial);
  const [codAmount, setCodAmount] = useState("");
  const [insuredValue, setInsuredValue] = useState("");
  const [fuelOn, setFuelOn] = useState(true);
  const [priceMode, setPriceMode] = useState<"netto" | "brutto">("netto");

  // Parse packages
  const parsed: PackageInput[] = packages
    .map((p) => ({
      widthCm: parseNum(p.widthCm),
      heightCm: parseNum(p.heightCm),
      depthCm: parseNum(p.depthCm),
      weightKg: parseNum(p.weightKg),
    }))
    .filter(
      (p) =>
        p.widthCm > 0 && p.heightCm > 0 && p.depthCm > 0 && p.weightKg > 0,
    );

  const options = {
    codAmountPln: parseNum(codAmount) || undefined,
    insuredValuePln: parseNum(insuredValue) || undefined,
    fuelSurcharge: fuelOn,
    // forceNonStandard zostaje false — silnik sam wykrywa NST
  };

  const result = parsed.length > 0 ? recommend(parsed, options) : null;
  const allServices = parsed.length > 0 ? priceAllServices(parsed, options) : [];

  function fillFromBox(boxId: string) {
    const b = pinnedBoxes.find((x) => x.id === boxId);
    if (!b) return;
    const totalWeight = packageWeightFromBox(b, qtyInBox);
    setPackages([
      {
        id: rid(),
        widthCm: String(b.widthCm),
        heightCm: String(b.heightCm),
        depthCm: String(b.depthCm),
        weightKg: totalWeight > 0 ? totalWeight.toFixed(2) : "",
      },
    ]);
  }

  function addPackage() {
    if (packages.length >= 15) return;
    const last = packages[packages.length - 1];
    setPackages([
      ...packages,
      {
        id: rid(),
        widthCm: last?.widthCm ?? "",
        heightCm: last?.heightCm ?? "",
        depthCm: last?.depthCm ?? "",
        weightKg: last?.weightKg ?? "",
      },
    ]);
  }
  function removePackage(id: string) {
    setPackages(packages.filter((p) => p.id !== id));
  }
  function updatePackage(id: string, patch: Partial<Pkg>) {
    setPackages(packages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  return (
    <div className="space-y-4">
      {/* STEP 1: Quick-fill z pudełek + qty */}
      {pinnedBoxes.length > 0 && (
        <Card className="p-3 bg-slate-50/50">
          <div className="flex items-center justify-between gap-3 mb-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 inline-flex items-center gap-2">
              <span className="size-5 rounded bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">1</span>
              Punkt startowy
            </h3>
            <span className="text-[10px] text-slate-500">
              Wybierz pudełko + ile sztuk produktu w paczce
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="text-slate-600 font-medium">Ilość produktów w paczce:</span>
              <div className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setQtyInBox(Math.max(1, qtyInBox - 1))}
                  className="size-7 rounded-md ring-1 ring-slate-300 bg-white hover:bg-slate-100 font-bold"
                >
                  −
                </button>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={qtyInBox}
                  onChange={(e) =>
                    setQtyInBox(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="h-7 w-14 text-center tabular-nums font-bold"
                />
                <button
                  type="button"
                  onClick={() => setQtyInBox(qtyInBox + 1)}
                  className="size-7 rounded-md ring-1 ring-slate-300 bg-white hover:bg-slate-100 font-bold"
                >
                  +
                </button>
              </div>
              {productWeightKg != null && (
                <span className="text-[10px] text-slate-500 tabular-nums">
                  Produkt: {productWeightKg} kg/szt
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-600 font-medium">Szybko z pudełka:</span>
              {pinnedBoxes.map((b) => {
                const totalKg = packageWeightFromBox(b, qtyInBox);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => fillFromBox(b.id)}
                    className="px-2.5 py-1.5 rounded-md ring-1 ring-slate-300 bg-white hover:bg-slate-100 text-[11px] inline-flex flex-col items-start gap-0 transition-colors"
                    title={`${b.weightKg ?? 0} kg (puste) + ${qtyInBox} × ${productWeightKg ?? 0} kg = ${totalKg.toFixed(2)} kg`}
                  >
                    <span className="font-medium">
                      {b.name} ({b.widthCm}×{b.heightCm}×{b.depthCm})
                    </span>
                    <span className="text-[9px] text-slate-500 tabular-nums">
                      → {totalKg.toFixed(2)} kg
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2: Paczki */}
      <Card className="p-3 bg-indigo-50/40 border-indigo-200">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-900 inline-flex items-center gap-2 mb-2.5">
          <span className="size-5 rounded bg-indigo-200 text-indigo-800 flex items-center justify-center text-[10px] font-bold">2</span>
          <Package className="size-3.5" />
          Paczki w przesyłce
          <span className="text-indigo-600 font-bold">({packages.length})</span>
        </h3>
        <div className="space-y-1.5">
          {packages.map((p, idx) => (
            <div
              key={p.id}
              className="grid grid-cols-[28px_1fr_1fr_1fr_1fr_auto] gap-2 items-center bg-white rounded-md p-1.5 ring-1 ring-indigo-100"
            >
              <span className="text-xs font-bold text-indigo-700 tabular-nums text-center">
                #{idx + 1}
              </span>
              <DimInput
                label="szer"
                value={p.widthCm}
                onChange={(v) => updatePackage(p.id, { widthCm: v })}
              />
              <DimInput
                label="wys"
                value={p.heightCm}
                onChange={(v) => updatePackage(p.id, { heightCm: v })}
              />
              <DimInput
                label="głęb"
                value={p.depthCm}
                onChange={(v) => updatePackage(p.id, { depthCm: v })}
              />
              <DimInput
                label="kg"
                value={p.weightKg}
                onChange={(v) => updatePackage(p.id, { weightKg: v })}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => removePackage(p.id)}
                disabled={packages.length <= 1}
                className="size-7 p-0"
                aria-label="Usuń paczkę"
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addPackage}
            disabled={packages.length >= 15}
            className="gap-1.5 h-7 bg-white w-full mt-1 border-dashed"
          >
            <Plus className="size-3.5" />
            Dodaj paczkę
          </Button>
        </div>
      </Card>

      {/* STEP 3: Opcje */}
      <Card className="p-3 bg-cyan-50/40 border-cyan-200">
        <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-cyan-900 inline-flex items-center gap-2">
            <span className="size-5 rounded bg-cyan-200 text-cyan-800 flex items-center justify-center text-[10px] font-bold">3</span>
            <Settings2 className="size-3.5" />
            Opcje dodatkowe
          </h3>
          {/* Toggle Netto/Brutto */}
          <div className="inline-flex rounded-md ring-1 ring-cyan-300 bg-white p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setPriceMode("netto")}
              className={cn(
                "px-2.5 py-0.5 rounded transition-colors font-medium",
                priceMode === "netto"
                  ? "bg-cyan-600 text-white"
                  : "text-cyan-800 hover:bg-cyan-50",
              )}
            >
              Netto
            </button>
            <button
              type="button"
              onClick={() => setPriceMode("brutto")}
              className={cn(
                "px-2.5 py-0.5 rounded transition-colors font-medium",
                priceMode === "brutto"
                  ? "bg-cyan-600 text-white"
                  : "text-cyan-800 hover:bg-cyan-50",
              )}
            >
              Brutto
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-cyan-700 tracking-wide font-medium">
              COD (PLN)
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={codAmount}
              onChange={(e) => setCodAmount(e.target.value)}
              placeholder="brak"
              className="h-8 tabular-nums bg-white"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-cyan-700 tracking-wide font-medium">
              Ubezp. wartość
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={insuredValue}
              onChange={(e) => setInsuredValue(e.target.value)}
              placeholder="brak"
              className="h-8 tabular-nums bg-white"
              inputMode="decimal"
            />
          </div>
          <label className="flex items-end gap-2 cursor-pointer pb-1">
            <input
              type="checkbox"
              checked={fuelOn}
              onChange={(e) => setFuelOn(e.target.checked)}
              className="size-4"
            />
            <span className="text-xs font-medium">Opłata paliwowa</span>
          </label>
        </div>
        <p className="text-[10px] text-cyan-700/80 italic mt-2 pt-2 border-t border-cyan-200">
          <strong>Auto-wykrywanie NST per kurier:</strong> InPost — girth (2×szer+2×wys) {">"} 150 cm lub bok {">"} 100 cm; DHL — krótszy/średni bok {">"} 60 cm (DHL standard 120×60×60). Dłużycowy {">"} 120 cm. Waga przestrzenna DHL = LWH/4000.
        </p>
      </Card>

      {/* STEP 4: Wyniki — rekomendacja */}
      {result && (
        <Card className="p-3 bg-emerald-50/30 border-emerald-200">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-900 inline-flex items-center gap-2 mb-2.5">
            <span className="size-5 rounded bg-emerald-200 text-emerald-800 flex items-center justify-center text-[10px] font-bold">4</span>
            <Sparkles className="size-3.5" />
            Wyniki — rekomendacja
            <span className="text-[10px] text-emerald-700 font-normal normal-case tracking-normal ml-1">
              ({packages.length} {packages.length === 1 ? "paczka" : packages.length < 5 ? "paczki" : "paczek"})
            </span>
          </h3>
          <div className="space-y-2">
          {/* Najtańsza preferowana — gdy user ma preferencje i któraś z nich jest applicable + najtańsza spośród preferowanych */}
          {(() => {
            const preferredApplicable = result.all.filter(
              (s) => s.applicable && preferredSet.has(s.serviceCode),
            );
            if (preferredApplicable.length === 0) return null;
            const cheapestPreferred = preferredApplicable.reduce((acc, s) =>
              s.totalNetPln < acc.totalNetPln ? s : acc,
            );
            return (
              <RecommendationBanner
                service={cheapestPreferred}
                label="Twoja preferencja"
                color="amber"
                icon={Star}
                packageCount={packages.length}
                priceMode={priceMode}
              />
            );
          })()}

          {result.cheapest && (
            <RecommendationBanner
              service={result.cheapest}
              label="Najtańsza"
              color="emerald"
              icon={Crown}
              packageCount={packages.length}
              priceMode={priceMode}
            />
          )}
          {result.fastest &&
            result.fastest.serviceCode !== result.cheapest?.serviceCode && (
              <RecommendationBanner
                service={result.fastest}
                label="Najszybsza"
                color="sky"
                icon={Zap}
                packageCount={packages.length}
                priceMode={priceMode}
              />
            )}

          <details className="space-y-1.5">
            <summary className="text-xs font-medium uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground pt-1">
              Wszystkie usługi ({allServices.length}) — kliknij aby pokazać
            </summary>
            <div className="space-y-1.5 mt-2">
              {result.all.map((s) => (
                <ServiceCard
                  key={s.serviceCode}
                  service={s}
                  isPreferred={preferredSet.has(s.serviceCode)}
                  packageCount={packages.length}
                  priceMode={priceMode}
                />
              ))}
            </div>
          </details>
          </div>
        </Card>
      )}

      {parsed.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted-foreground">
          Uzupełnij wymiary i wagę paczki, aby zobaczyć wycenę.
        </Card>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function DimInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        step="0.1"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="h-8 text-xs text-right tabular-nums pr-9"
        inputMode="decimal"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
        {label}
      </span>
    </div>
  );
}

function RecommendationBanner({
  service,
  label,
  color,
  icon: Icon,
  packageCount,
  priceMode,
}: {
  service: PricedService;
  label: string;
  color: "emerald" | "sky" | "amber";
  icon: React.ElementType;
  packageCount: number;
  priceMode: "netto" | "brutto";
}) {
  const cls =
    color === "emerald"
      ? "bg-gradient-to-r from-emerald-50 to-emerald-100/40 border-emerald-300 text-emerald-900"
      : color === "sky"
        ? "bg-gradient-to-r from-sky-50 to-sky-100/40 border-sky-300 text-sky-900"
        : "bg-gradient-to-r from-amber-50 to-amber-100/40 border-amber-300 text-amber-900";
  const iconCls =
    color === "emerald"
      ? "bg-emerald-500 text-white"
      : color === "sky"
        ? "bg-sky-500 text-white"
        : "bg-amber-500 text-white";
  const main =
    priceMode === "brutto" ? service.totalGrossPln : service.totalNetPln;
  const secondary =
    priceMode === "brutto" ? service.totalNetPln : service.totalGrossPln;
  const secondaryLabel = priceMode === "brutto" ? "netto" : "brutto";
  const pricePerPkg = main / Math.max(1, packageCount);
  return (
    <div className={cn("rounded-lg border-2 p-3.5 flex items-center gap-3 shadow-sm", cls)}>
      <div className={cn("size-11 rounded-lg flex items-center justify-center shrink-0 shadow-md", iconCls)}>
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">
          {label}
        </div>
        <div className="text-base font-bold truncate leading-tight">{service.serviceLabel}</div>
        <div className="text-[11px] opacity-75">{service.deliveryMode}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-2xl font-extrabold tabular-nums leading-none">
          {main.toFixed(2)} zł
          <span className="text-[10px] font-normal opacity-70 ml-1">
            {priceMode}
          </span>
        </div>
        <div className="text-[10px] opacity-70 tabular-nums mt-0.5">
          {secondaryLabel}: {secondary.toFixed(2)} zł
        </div>
        {packageCount > 1 && (
          <div className="text-[10px] font-semibold mt-1 px-1.5 py-0.5 rounded bg-white/60 ring-1 ring-current/20 tabular-nums inline-block">
            ≈ {pricePerPkg.toFixed(2)} zł / paczkę
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceCard({
  service,
  isPreferred,
  packageCount,
  priceMode,
}: {
  service: PricedService;
  isPreferred: boolean;
  packageCount: number;
  priceMode: "netto" | "brutto";
}) {
  const [open, setOpen] = useState(false);
  const main =
    priceMode === "brutto" ? service.totalGrossPln : service.totalNetPln;
  const secondary =
    priceMode === "brutto" ? service.totalNetPln : service.totalGrossPln;
  const secondaryLabel = priceMode === "brutto" ? "netto" : "brutto";
  const pricePerPkg = main / Math.max(1, packageCount);

  return (
    <div
      className={cn(
        "rounded-md ring-1 transition-colors",
        service.applicable
          ? isPreferred
            ? "ring-amber-300 bg-amber-50/40"
            : "ring-border bg-card"
          : "ring-rose-200/60 bg-rose-50/30 opacity-70",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-3 text-left"
      >
        <div className="size-9 shrink-0 rounded ring-1 ring-border bg-white overflow-hidden flex items-center justify-center">
          <CourierLogo brand={service.brand} className="w-full h-auto" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            {isPreferred && (
              <Star
                className="size-3.5 fill-amber-400 text-amber-500 shrink-0"
                aria-label="Preferowana"
              />
            )}
            {service.serviceLabel}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {service.deliveryMode}
            {service.elementCount > 1 && (
              <> · {service.elementCount} elementów</>
            )}
            {service.totalDimWeightKg > 0 &&
              service.totalDimWeightKg > service.totalActualWeightKg && (
                <> · waga przestrzenna: {service.totalDimWeightKg.toFixed(2)} kg</>
              )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {service.applicable ? (
            <>
              <div className="text-sm font-bold tabular-nums">
                {main.toFixed(2)} zł
                <span className="text-[9px] font-normal text-muted-foreground ml-0.5">
                  {priceMode}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                {secondaryLabel}: {secondary.toFixed(2)} zł
              </div>
              {packageCount > 1 && (
                <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                  ≈ {pricePerPkg.toFixed(2)} zł/szt
                </div>
              )}
            </>
          ) : (
            <span className="text-[10px] text-rose-700 font-medium">
              Nie pasuje
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t text-xs space-y-1">
          {service.applicable ? (
            <table className="w-full">
              <tbody>
                {service.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td className="py-0.5 text-muted-foreground">{b.label}</td>
                    <td
                      className={cn(
                        "py-0.5 text-right tabular-nums",
                        b.pln < 0 && "text-emerald-700",
                      )}
                    >
                      {b.pln.toFixed(2)} zł
                    </td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1">Razem netto</td>
                  <td className="py-1 text-right tabular-nums">
                    {service.totalNetPln.toFixed(2)} zł
                  </td>
                </tr>
                <tr>
                  <td className="text-muted-foreground">
                    Razem brutto (×{(1.23).toFixed(2)})
                  </td>
                  <td className="text-right tabular-nums text-muted-foreground">
                    {service.totalGrossPln.toFixed(2)} zł
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <ul className="text-rose-700 space-y-0.5 list-disc list-inside">
              {service.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Utils ───────────────────────────────────────────────────────────

function parseNum(s: string): number {
  if (!s) return 0;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}
