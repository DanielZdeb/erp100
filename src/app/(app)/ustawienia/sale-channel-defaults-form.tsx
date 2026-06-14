"use client";

import { useState, useTransition } from "react";
import { Info, Megaphone, Percent, Truck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { setSaleChannelDefaultsAction } from "@/server/system-settings";
import type { SaleChannelDefaults } from "@/lib/sale-channel-defaults";

/**
 * Domyślne wartości dla kanałów sprzedaży (Allegro / Sklep).
 * Stosowane w tabeli produktów jako fallback gdy produkt ma `null`.
 *
 * Konwencja: prowizja jako % (0–100), pieniądze jako zł netto.
 */
export function SaleChannelDefaultsForm({
  initial,
}: {
  initial: SaleChannelDefaults;
}) {
  // Prowizja zapisywana jako ułamek (0,13) — w UI pokazujemy jako % (13)
  const toPctStr = (v: number | null) =>
    v == null ? "" : String(Math.round(v * 10000) / 100);
  const toNumStr = (v: number | null) => (v == null ? "" : String(v));

  const [allegroCommission, setAllegroCommission] = useState(
    toPctStr(initial.allegroCommissionPct),
  );
  const [allegroShipping, setAllegroShipping] = useState(
    toNumStr(initial.allegroCustomerShippingPln),
  );
  const [allegroAdCost, setAllegroAdCost] = useState(
    toNumStr(initial.allegroAdCostPln),
  );
  const [sklepCommission, setSklepCommission] = useState(
    toPctStr(initial.sklepCommissionPct),
  );
  const [sklepShipping, setSklepShipping] = useState(
    toNumStr(initial.sklepCustomerShippingPln),
  );
  const [sklepAdCost, setSklepAdCost] = useState(
    toNumStr(initial.sklepAdCostPln),
  );

  const [pending, startTransition] = useTransition();

  function save() {
    const pct = (s: string): number | null => {
      if (s === "") return null;
      const n = Number(s);
      return Number.isFinite(n) ? n / 100 : null;
    };
    startTransition(async () => {
      try {
        await setSaleChannelDefaultsAction({
          allegroCommissionPct: pct(allegroCommission),
          allegroCustomerShippingPln: allegroShipping || null,
          allegroAdCostPln: allegroAdCost || null,
          sklepCommissionPct: pct(sklepCommission),
          sklepCustomerShippingPln: sklepShipping || null,
          sklepAdCostPln: sklepAdCost || null,
        });
        toast.success("Zapisano domyślne wartości kanałów sprzedaży");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-blue-50/60 border border-blue-200 text-blue-900 text-xs p-3 flex items-start gap-2">
        <Info className="size-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            Te wartości są używane <strong>automatycznie</strong> w tabeli
            produktów gdy konkretny produkt nie ma swojego nadpisania. Edycja
            pola na karcie produktu zawsze nadpisuje wartość systemową.
          </p>
          <p>Puste pole = brak domyślnej (produkty muszą mieć własną wartość).</p>
        </div>
      </div>

      {/* ALLEGRO */}
      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-amber-100 text-amber-700 grid place-items-center">
            <span className="text-[10px] font-bold uppercase">A</span>
          </div>
          <h3 className="text-sm font-semibold">Allegro</h3>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-9">
          <Field
            id="allegroCommission"
            label="Prowizja (%)"
            icon={<Percent className="size-3" />}
            value={allegroCommission}
            onChange={setAllegroCommission}
            hint="np. 13 = 13%; stosowana do każdego produktu Allegro"
            step="0.1"
          />
          <Field
            id="allegroShipping"
            label="Wysyłka pokrywana przez klienta (zł)"
            icon={<Truck className="size-3" />}
            value={allegroShipping}
            onChange={setAllegroShipping}
            hint="netto; dodawana do przychodu w marżach Allegro"
          />
          <Field
            id="allegroAdCost"
            label="Koszt pozyskania klienta (zł)"
            icon={<Megaphone className="size-3" />}
            value={allegroAdCost}
            onChange={setAllegroAdCost}
            hint={'netto; odejmowana od zysku Allegro (pole „Inne")'}
          />
        </div>
      </section>

      {/* SKLEP */}
      <section className="space-y-3 pt-2 border-t">
        <header className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-emerald-100 text-emerald-700 grid place-items-center">
            <span className="text-[10px] font-bold uppercase">S</span>
          </div>
          <h3 className="text-sm font-semibold">Sklep</h3>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pl-9">
          <Field
            id="sklepCommission"
            label="Prowizja (%)"
            icon={<Percent className="size-3" />}
            value={sklepCommission}
            onChange={setSklepCommission}
            hint="np. 2.5 = 2,5%; np. opłata bramki płatniczej"
            step="0.1"
          />
          <Field
            id="sklepShipping"
            label="Wysyłka pokrywana przez klienta (zł)"
            icon={<Truck className="size-3" />}
            value={sklepShipping}
            onChange={setSklepShipping}
            hint="netto; dodawana do przychodu w marżach Sklep"
          />
          <Field
            id="sklepAdCost"
            label="Koszt pozyskania klienta (zł)"
            icon={<Megaphone className="size-3" />}
            value={sklepAdCost}
            onChange={setSklepAdCost}
            hint="netto; marketing/SEO/reklama; odejmowana od zysku"
          />
        </div>
      </section>

      <Button type="button" onClick={save} disabled={pending}>
        {pending ? "Zapisuję…" : "Zapisz domyślne wartości"}
      </Button>
    </div>
  );
}

function Field({
  id,
  label,
  icon,
  value,
  onChange,
  hint,
  step = "0.01",
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
      />
      {hint && (
        <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>
      )}
    </div>
  );
}
