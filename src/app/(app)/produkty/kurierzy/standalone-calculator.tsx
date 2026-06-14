"use client";

import { useState } from "react";
import {
  ChevronDown,
  Crown,
  Plus,
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

import { CourierLogo } from "../[id]/_components/courier-logos";

type Pkg = {
  id: string;
  widthCm: string;
  heightCm: string;
  depthCm: string;
  weightKg: string;
};

const PRESETS: { label: string; pkg: Omit<Pkg, "id"> }[] = [
  {
    label: "Koperta A4 0.5 kg",
    pkg: { widthCm: "30", heightCm: "22", depthCm: "3", weightKg: "0.5" },
  },
  {
    label: "Mała paczka 2 kg",
    pkg: { widthCm: "30", heightCm: "20", depthCm: "15", weightKg: "2" },
  },
  {
    label: "Średnia 5 kg",
    pkg: { widthCm: "40", heightCm: "30", depthCm: "20", weightKg: "5" },
  },
  {
    label: "Duża 10 kg",
    pkg: { widthCm: "60", heightCm: "40", depthCm: "30", weightKg: "10" },
  },
  {
    label: "Ciężka 25 kg",
    pkg: { widthCm: "80", heightCm: "60", depthCm: "40", weightKg: "25" },
  },
  {
    label: "Krzesło (60×54×54, 10kg)",
    pkg: { widthCm: "54", heightCm: "54", depthCm: "60", weightKg: "10" },
  },
];

export function StandaloneCourierCalculator() {
  const [packages, setPackages] = useState<Pkg[]>([
    { id: rid(), widthCm: "", heightCm: "", depthCm: "", weightKg: "" },
  ]);
  const [codAmount, setCodAmount] = useState("");
  const [insuredValue, setInsuredValue] = useState("");
  const [fuelOn, setFuelOn] = useState(true);

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

  function applyPreset(preset: Omit<Pkg, "id">) {
    setPackages([{ id: rid(), ...preset }]);
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
      {/* Presety */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Szybko:</span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p.pkg)}
            className="px-2 py-1 rounded-md ring-1 ring-border bg-card hover:bg-muted text-[11px]"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Paczki */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">
            Paczki w przesyłce ({packages.length})
          </h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addPackage}
            disabled={packages.length >= 15}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Dodaj paczkę
          </Button>
        </div>
        <div className="space-y-1.5">
          {packages.map((p, idx) => (
            <div
              key={p.id}
              className="grid grid-cols-[24px_1fr_1fr_1fr_1fr_auto] gap-2 items-center"
            >
              <span className="text-xs font-medium text-muted-foreground tabular-nums text-center">
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
        </div>
      </div>

      {/* Opcje */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t text-xs">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">
            COD (PLN)
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={codAmount}
            onChange={(e) => setCodAmount(e.target.value)}
            placeholder="brak"
            className="h-8 tabular-nums"
            inputMode="decimal"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-muted-foreground tracking-wide">
            Ubezp. wartość
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={insuredValue}
            onChange={(e) => setInsuredValue(e.target.value)}
            placeholder="brak"
            className="h-8 tabular-nums"
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
          <span className="text-xs">Opłata paliwowa</span>
        </label>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        <strong>Auto-wykrywanie NST per kurier:</strong>{" "}
        InPost — girth {">"} 150 cm lub bok {">"} 100 cm;{" "}
        DHL — krótszy/średni bok {">"} 60 cm (standard 120×60×60).{" "}
        Dłużycowy {">"} 120 cm.
      </p>

      {/* Wyniki */}
      {result && (
        <div className="space-y-3 pt-2 border-t">
          {result.cheapest && (
            <RecommendationBanner
              service={result.cheapest}
              label="Najtańsza"
              color="emerald"
              icon={Crown}
            />
          )}
          {result.fastest &&
            result.fastest.serviceCode !== result.cheapest?.serviceCode && (
              <RecommendationBanner
                service={result.fastest}
                label="Najszybsza"
                color="sky"
                icon={Zap}
              />
            )}
          <div className="space-y-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Wszystkie usługi ({allServices.length})
            </h3>
            <div className="space-y-1.5">
              {result.all.map((s) => (
                <ServiceCard key={s.serviceCode} service={s} />
              ))}
            </div>
          </div>
        </div>
      )}

      {parsed.length === 0 && (
        <Card className="p-6 text-center text-xs text-muted-foreground">
          Uzupełnij wymiary i wagę paczki (lub wybierz preset), aby zobaczyć
          wycenę.
        </Card>
      )}
    </div>
  );
}

// ─── Sub-components (zduplikowane z shipping-quote.tsx — celowo, żeby
//     standalone był 100% niezależny od kontekstu produktu) ───────────

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
}: {
  service: PricedService;
  label: string;
  color: "emerald" | "sky";
  icon: React.ElementType;
}) {
  const cls =
    color === "emerald"
      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
      : "bg-sky-50 border-sky-300 text-sky-900";
  return (
    <div className={cn("rounded-md border p-3 flex items-center gap-3", cls)}>
      <div className="size-9 rounded-md bg-white/70 ring-1 ring-current/20 flex items-center justify-center shrink-0">
        <Icon className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wide font-semibold">
          {label}
        </div>
        <div className="text-sm font-medium truncate">{service.serviceLabel}</div>
        <div className="text-[11px] opacity-80">{service.deliveryMode}</div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-bold tabular-nums">
          {service.totalNetPln.toFixed(2)} zł
        </div>
        <div className="text-[10px] opacity-70">
          brutto: {service.totalGrossPln.toFixed(2)} zł
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: PricedService }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-md ring-1 transition-colors",
        service.applicable
          ? "ring-border bg-card"
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
          <div className="text-sm font-medium truncate">
            {service.serviceLabel}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {service.deliveryMode}
            {service.elementCount > 1 && <> · {service.elementCount} elementów</>}
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
                {service.totalNetPln.toFixed(2)} zł
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">
                brutto: {service.totalGrossPln.toFixed(2)} zł
              </div>
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
                    Razem brutto (×1.23)
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

function parseNum(s: string): number {
  if (!s) return 0;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}
