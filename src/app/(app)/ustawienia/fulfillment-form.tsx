"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Info, Layers, Package, Truck, Warehouse } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { setFulfillmentSettingsAction } from "@/server/system-settings";
import type {
  FulfillmentMode,
  FulfillmentSettings,
  WarehouseType,
} from "@/lib/fulfillment";

/**
 * Pełny formularz konfiguracji fulfillmentu — odpowiada Załącznikowi 2
 * umowy E-Packman. Pominięte usługi przewoźnicze (klient korzysta z
 * własnych umów DHL/InPost — patrz +1 zł dopłaty „własna umowa").
 */
export function FulfillmentForm({
  initial,
}: {
  initial: FulfillmentSettings;
}) {
  const [mode, setMode] = useState<FulfillmentMode>(initial.mode);
  const [warehouseType, setWarehouseType] = useState<WarehouseType>(
    initial.warehouseType,
  );
  const [openingSmall, setOpeningSmall] = useState(
    String(initial.openingSmallPln),
  );
  const [perSkuSmall, setPerSkuSmall] = useState(
    String(initial.perSkuSmallPln),
  );
  const [openingBulk, setOpeningBulk] = useState(
    String(initial.openingBulkPln),
  );
  const [perSkuBulk, setPerSkuBulk] = useState(String(initial.perSkuBulkPln));
  const [perPiece, setPerPiece] = useState(String(initial.perPiecePln));
  const [ownCarrier, setOwnCarrier] = useState(String(initial.ownCarrierPln));
  const [palletGround, setPalletGround] = useState(
    String(initial.palletGroundPln),
  );
  const [palletHighRack, setPalletHighRack] = useState(
    String(initial.palletHighRackPln),
  );
  const [pending, startTransition] = useTransition();

  const dirty =
    mode !== initial.mode ||
    warehouseType !== initial.warehouseType ||
    Number(openingSmall) !== initial.openingSmallPln ||
    Number(perSkuSmall) !== initial.perSkuSmallPln ||
    Number(openingBulk) !== initial.openingBulkPln ||
    Number(perSkuBulk) !== initial.perSkuBulkPln ||
    Number(perPiece) !== initial.perPiecePln ||
    Number(ownCarrier) !== initial.ownCarrierPln ||
    Number(palletGround) !== initial.palletGroundPln ||
    Number(palletHighRack) !== initial.palletHighRackPln;

  function save() {
    startTransition(async () => {
      try {
        await setFulfillmentSettingsAction({
          mode,
          warehouseType,
          openingSmallPln: openingSmall,
          perSkuSmallPln: perSkuSmall,
          openingBulkPln: openingBulk,
          perSkuBulkPln: perSkuBulk,
          perPiecePln: perPiece,
          ownCarrierPln: ownCarrier,
          palletGroundPln: palletGround,
          palletHighRackPln: palletHighRack,
        });
        toast.success("Zapisano ustawienia fulfillmentu");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-blue-50/60 border border-blue-200 text-blue-900 text-xs p-3 flex items-start gap-2">
        <Info className="size-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Stawki domyślne z umowy <strong>E-Packman sp. z o.o.</strong>{" "}
            (Załącznik 2 — Cennik z 20.03.2026). Usługi kurierskie z umowy
            fulfillmentowej są <strong>pomijane</strong> — używasz własnych
            kontraktów DHL i InPost; doliczana jest tylko dopłata{" "}
            <strong>+1 zł / zamówienie</strong> za „własną umowę kurierską".
          </p>
        </div>
      </div>

      {/* TRYB PAKOWANIA */}
      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <Package className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Tryb pakowania</h3>
        </header>
        <p className="text-xs text-muted-foreground -mt-1">
          Wybierz aktywny tryb — w wycenach per produkt liczona jest stawka{" "}
          <strong>tylko z aktywnego trybu</strong>. Drugi tryb jest zachowany
          jako odniesienie.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ModeTile
            active={mode === "MALE"}
            onClick={() => setMode("MALE")}
            title="Małe (≤25 szt/zam)"
            sub={`${Number(openingSmall || 0).toFixed(2)} zł + ${Number(perSkuSmall || 0).toFixed(2)} zł/SKU`}
          />
          <ModeTile
            active={mode === "HURTOWE"}
            onClick={() => setMode("HURTOWE")}
            title="Hurtowe (>25 szt/zam)"
            sub={`${Number(openingBulk || 0).toFixed(2)} zł + ${Number(perSkuBulk || 0).toFixed(2)} zł/SKU`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div
            className={cn(
              "space-y-2 p-3 rounded-md border",
              mode === "MALE"
                ? "bg-amber-50/40 border-amber-200"
                : "bg-muted/40 border-border",
            )}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Małe {mode === "MALE" && "· aktywne"}
            </div>
            <Field
              id="openingSmall"
              label="Otwarcie zamówienia (zł)"
              value={openingSmall}
              onChange={setOpeningSmall}
              hint="Cennik: 3,91 zł (0–5000 zam/mc)"
            />
            <Field
              id="perSkuSmall"
              label="Za 1 SKU (zł)"
              value={perSkuSmall}
              onChange={setPerSkuSmall}
              hint="Cennik: 0,50 zł (0–5000 zam/mc)"
            />
          </div>
          <div
            className={cn(
              "space-y-2 p-3 rounded-md border",
              mode === "HURTOWE"
                ? "bg-amber-50/40 border-amber-200"
                : "bg-muted/40 border-border",
            )}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Hurtowe {mode === "HURTOWE" && "· aktywne"}
            </div>
            <Field
              id="openingBulk"
              label="Otwarcie zamówienia (zł)"
              value={openingBulk}
              onChange={setOpeningBulk}
              hint="Cennik: 7,91 zł (0–5000 zam/mc)"
            />
            <Field
              id="perSkuBulk"
              label="Za 1 SKU (zł)"
              value={perSkuBulk}
              onChange={setPerSkuBulk}
              hint="Cennik: 1,50 zł (0–5000 zam/mc)"
            />
          </div>
        </div>
      </section>

      {/* OPŁATY WSPÓLNE */}
      <section className="space-y-3 pt-2 border-t">
        <header className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Opłaty wspólne</h3>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            id="perPiece"
            label="Za 1 sztukę w zamówieniu (zł)"
            value={perPiece}
            onChange={setPerPiece}
            hint="Cennik: 0,05 zł — każdy egzemplarz produktu."
          />
          <Field
            id="ownCarrier"
            label="Własna umowa kurierska (zł / zam.)"
            value={ownCarrier}
            onChange={setOwnCarrier}
            hint="Cennik: 1,00 zł / zamówienie (DHL/InPost z Twoich umów)."
            icon={<Truck className="size-3 text-muted-foreground" />}
          />
        </div>
      </section>

      {/* MAGAZYN */}
      <section className="space-y-3 pt-2 border-t">
        <header className="flex items-center gap-2">
          <Warehouse className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Magazyn</h3>
        </header>
        <p className="text-xs text-muted-foreground -mt-1">
          Stawka aktywna zależy od wybranego typu lokacji magazynowej, na której
          stoi większość Twoich palet. Per szt = stawka / „Sztuk na palecie"
          ustawionych w produkcie.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ModeTile
            active={warehouseType === "GROUND"}
            onClick={() => setWarehouseType("GROUND")}
            title="Ziemia / półka"
            sub={`${Number(palletGround || 0).toFixed(2)} zł / EPal / mc`}
          />
          <ModeTile
            active={warehouseType === "HIGH_RACK"}
            onClick={() => setWarehouseType("HIGH_RACK")}
            title="Regał wysokiego składu"
            sub={`${Number(palletHighRack || 0).toFixed(2)} zł / EPal / mc`}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <Field
            id="palletGround"
            label="Ziemia / regały półkowe (zł / EPal / mc)"
            value={palletGround}
            onChange={setPalletGround}
            hint="Cennik: 1,50 zł / EPal."
          />
          <Field
            id="palletHighRack"
            label="Regały wysokiego składu (zł / EPal / mc)"
            value={palletHighRack}
            onChange={setPalletHighRack}
            hint="Cennik: 1,00 zł / EPal."
          />
        </div>
      </section>

      <Button type="button" onClick={save} disabled={pending || !dirty}>
        {pending ? "Zapisuję…" : "Zapisz"}
      </Button>
    </div>
  );
}

function ModeTile({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-3 rounded-md border transition-colors",
        active
          ? "bg-amber-50 border-amber-300 ring-1 ring-amber-200"
          : "bg-background border-border hover:bg-muted",
      )}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">{sub}</div>
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  icon,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs flex items-center gap-1">
        {icon}
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>
      )}
    </div>
  );
}
