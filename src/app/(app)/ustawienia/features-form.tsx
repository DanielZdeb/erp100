"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setComponentsEnabledAction } from "@/server/company-settings";

export function FeaturesForm({
  initialComponentsEnabled,
}: {
  initialComponentsEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialComponentsEnabled);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setEnabled(next);
    startTransition(async () => {
      try {
        await setComponentsEnabledAction(next);
        toast.success(
          next ? "Komponenty/zestawy włączone" : "Komponenty/zestawy wyłączone",
        );
      } catch (e) {
        setEnabled(!next); // revert
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 cursor-pointer group">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={pending}
          onClick={() => toggle(!enabled)}
          className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
            enabled ? "bg-emerald-500" : "bg-slate-300"
          } ${pending ? "opacity-50" : ""}`}
        >
          <span
            className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0.5"
            } translate-y-0.5`}
          />
        </button>
        <div className="text-sm">
          <div className="font-medium">Komponenty (produkty wielo-częściowe)</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gdy włączone — produkty mogą być oznaczane jako komponenty oraz
            produkty z komponentów (KOMPONENTOWY) z slotami wariantów. Wyłącz
            dla firm które sprzedają tylko pojedyncze SKU. Zestawy
            (grupowanie istniejących produktów do sprzedaży) są zawsze
            dostępne.
          </p>
        </div>
      </label>
    </div>
  );
}
