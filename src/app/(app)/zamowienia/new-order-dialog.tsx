"use client";

import * as React from "react";
import { ArrowLeft, Scissors, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FlagCN, FlagPL } from "@/components/icons/country-flags";
import { cn } from "@/lib/utils";

import { NewOrderForm } from "./nowy/new-order-form";
import type { ContainerTypeT } from "@/lib/container-types";

type Country = "CHINA" | "POLAND";
/**
 * Rodzaj zamówienia PL — różne moduły obsługują różne kategorie produktów.
 * Na razie aktywny tylko MATERIAL_SZARFY (rolety/szarfy: belki, krojenie,
 * szwalnia, PDF). Pozostałe to placeholdery na kolejne moduły.
 */
type PolandKind = "MATERIAL_SZARFY";

export function NewOrderDialog({
  defaultContainerType,
  triggerClassName,
  defaultCountry,
  children,
}: {
  defaultContainerType: ContainerTypeT;
  triggerClassName?: string;
  /** Gdy ustawione — pomijamy step wyboru kraju (otwiera od razu form). */
  defaultCountry?: Country;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [country, setCountry] = React.useState<Country | null>(
    defaultCountry ?? null,
  );
  // Krok dodatkowy dla PL: wybór modułu produktowego (na razie tylko
  // „Materiał na szarfy"). Reset razem z country przy zamknięciu dialogu.
  const [polandKind, setPolandKind] = React.useState<PolandKind | null>(
    null,
  );

  function close() {
    setOpen(false);
    setTimeout(() => {
      if (!defaultCountry) setCountry(null);
      setPolandKind(null);
    }, 150);
  }

  return (
    <>
      <Button
        type="button"
        variant="default"
        onClick={() => setOpen(true)}
        className={cn(buttonVariants(), "gap-2", triggerClassName)}
      >
        {children}
      </Button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="!max-w-[min(98vw,1100px)] sm:!max-w-[min(98vw,1100px)] max-h-[92vh] overflow-y-auto">
          {country == null ? (
            <CountryPicker onPick={setCountry} />
          ) : country === "POLAND" && polandKind == null ? (
            <PolandKindPicker
              onPick={setPolandKind}
              showCountryBack={!defaultCountry}
              onBackToCountry={() => setCountry(null)}
            />
          ) : (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {country === "POLAND" ? (
                    <button
                      type="button"
                      onClick={() => setPolandKind(null)}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ArrowLeft className="size-3" />
                      Zmień rodzaj
                    </button>
                  ) : !defaultCountry ? (
                    <button
                      type="button"
                      onClick={() => setCountry(null)}
                      className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <ArrowLeft className="size-3" />
                      Zmień kraj
                    </button>
                  ) : null}
                </div>
                <DialogTitle className="flex items-center gap-2">
                  {country === "POLAND" ? (
                    <>
                      <FlagPL className="size-5" />
                      Nowe zamówienie z Polski — Materiał na szarfy
                    </>
                  ) : (
                    <>
                      <FlagCN className="size-5" />
                      Nowe zamówienie z Chin
                    </>
                  )}
                </DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground -mt-1">
                {country === "POLAND"
                  ? "Produkcja w Polsce — bez cła i prowizji. W kosztach rozliczasz Cięcie i Krojenie (dzielone proporcjonalnie do liczby sztuk)."
                  : "Najpierw nagłówek — kursy walut, typ kontenera. Pozycje, koszty i kalkulacje dodasz po utworzeniu."}
              </p>
              <NewOrderForm
                defaultContainerType={defaultContainerType}
                country={country}
                hideCancel
                onSuccess={close}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CountryPicker({ onPick }: { onPick: (c: Country) => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Skąd zamówienie?</DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground -mt-1">
        Wybierz kraj produkcji. Wpływa na zestaw kosztów i sposób alokacji
        logistyki.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <CountryOption
          onClick={() => onPick("CHINA")}
          flag={<FlagCN className="size-9" />}
          accent="bg-cyan-50 ring-cyan-200 hover:bg-cyan-100/60"
          title="Zamówienie z Chin"
          description="Standard: cło + prowizja + transport kontenerem. Koszty dzielone po CBM."
        />
        <CountryOption
          onClick={() => onPick("POLAND")}
          flag={<FlagPL className="size-9" />}
          accent="bg-pink-50 ring-pink-200 hover:bg-pink-100/60"
          title="Zamówienie z Polski"
          description="Produkcja PL: cięcie + krojenie zamiast cła i prowizji. Koszty dzielone per szt."
        />
      </div>
    </>
  );
}

function CountryOption({
  onClick,
  flag,
  accent,
  title,
  description,
}: {
  onClick: () => void;
  flag: React.ReactNode;
  accent: string;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-xl ring-1 p-4 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400",
        accent,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{flag}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900 mb-1">
            {title}
          </div>
          <div className="text-xs text-slate-600 leading-relaxed">
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * Krok 2 dla PL: wybór modułu produktowego. Każdy moduł będzie miał własną
 * logikę kosztów, kalkulacji i PDF. Na razie aktywny tylko „Materiał na
 * szarfy" (rolety: belki 98 m, krojenie, szwalnia, PDF z okładką). Kolejne
 * moduły (np. „Maty", „Akcesoria") będą sukcesywnie odblokowywane.
 */
function PolandKindPicker({
  onPick,
  showCountryBack,
  onBackToCountry,
}: {
  onPick: (k: PolandKind) => void;
  showCountryBack: boolean;
  onBackToCountry: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          {showCountryBack && (
            <button
              type="button"
              onClick={onBackToCountry}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="size-3" />
              Zmień kraj
            </button>
          )}
        </div>
        <DialogTitle className="flex items-center gap-2">
          <FlagPL className="size-5" />
          Co produkujemy?
        </DialogTitle>
      </DialogHeader>
      <p className="text-xs text-muted-foreground -mt-1">
        Każdy moduł ma własny zestaw kalkulacji (belki, krojenie, szwalnia,
        PDF). Na razie aktywny jest moduł rolet i szarf — kolejne dojdą.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        <KindOption
          onClick={() => onPick("MATERIAL_SZARFY")}
          icon={<Scissors className="size-7 text-indigo-600" />}
          accent="bg-indigo-50 ring-indigo-200 hover:bg-indigo-100/60"
          title="Materiał na szarfy"
          description="Rolety i szarfy. Belki materiału (98 m, min 5/kolor), kalkulacja krojenia i szwalni per szt, PDF z okładką i rozkładem cięć."
          badge="Dostępne"
          badgeClass="bg-emerald-100 text-emerald-700"
        />
        <KindOption
          icon={<Sparkles className="size-7 text-slate-400" />}
          accent="bg-slate-50 ring-slate-200 opacity-60 cursor-not-allowed"
          title="Inne produkty"
          description="Moduł dla pozostałych produktów PL — w trakcie projektowania."
          badge="Wkrótce"
          badgeClass="bg-slate-200 text-slate-600"
          disabled
        />
      </div>
    </>
  );
}

function KindOption({
  onClick,
  icon,
  accent,
  title,
  description,
  badge,
  badgeClass,
  disabled,
}: {
  onClick?: () => void;
  icon: React.ReactNode;
  accent: string;
  title: string;
  description: string;
  badge: string;
  badgeClass: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-left rounded-xl ring-1 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400",
        !disabled && "hover:shadow-md",
        accent,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900">
              {title}
            </span>
            <span
              className={cn(
                "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold",
                badgeClass,
              )}
            >
              {badge}
            </span>
          </div>
          <div className="text-xs text-slate-600 leading-relaxed">
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}
