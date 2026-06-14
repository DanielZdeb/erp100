"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Coins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCompanyDefaultRatesAction } from "@/server/order-template-sections";

export function DefaultRatesForm({
  initialKrojenie,
  initialSzwalnia,
}: {
  initialKrojenie: number | null;
  initialSzwalnia: number | null;
}) {
  const [krojenie, setKrojenie] = useState(
    initialKrojenie != null ? String(initialKrojenie) : "",
  );
  const [szwalnia, setSzwalnia] = useState(
    initialSzwalnia != null ? String(initialSzwalnia) : "",
  );
  const [pending, startTransition] = useTransition();

  const dirty =
    krojenie !== (initialKrojenie != null ? String(initialKrojenie) : "") ||
    szwalnia !== (initialSzwalnia != null ? String(initialSzwalnia) : "");

  function save() {
    startTransition(async () => {
      try {
        await updateCompanyDefaultRatesAction({
          defaultKrojeniePerSztPln: krojenie || null,
          defaultSzwalniaPerSztPln: szwalnia || null,
        });
        toast.success("Zapisano domyślne stawki");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Coins className="size-4 text-emerald-700" />
        <h3 className="text-sm font-semibold text-emerald-900">
          Domyślne stawki — Krojenie + Szwalnia
        </h3>
      </div>
      <p className="text-xs text-emerald-800/80">
        Te stawki (PLN za sztukę) są auto-wypełniane w polu „Krojenie" /
        „Szwalnia" w zakładce Płatności nowego zamówienia PL. User może je
        zmienić w konkretnym zamówieniu — to są tylko wartości startowe.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white rounded-md p-3 ring-1 ring-emerald-100">
        <div className="space-y-1.5">
          <Label htmlFor="krojenie" className="text-xs font-medium">
            Krojenie (zł / szt)
          </Label>
          <div className="relative">
            <Input
              id="krojenie"
              type="number"
              step="0.01"
              min="0"
              value={krojenie}
              onChange={(e) => setKrojenie(e.target.value)}
              placeholder="0.00"
              className="text-sm tabular-nums pr-10"
              disabled={pending}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              zł/szt
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="szwalnia" className="text-xs font-medium">
            Szwalnia (zł / szt)
          </Label>
          <div className="relative">
            <Input
              id="szwalnia"
              type="number"
              step="0.01"
              min="0"
              value={szwalnia}
              onChange={(e) => setSzwalnia(e.target.value)}
              placeholder="0.00"
              className="text-sm tabular-nums pr-10"
              disabled={pending}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              zł/szt
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={save}
          disabled={!dirty || pending}
          variant={dirty ? "default" : "secondary"}
        >
          {pending ? "Zapisuję…" : dirty ? "Zapisz stawki" : "Zapisano"}
        </Button>
      </div>
    </div>
  );
}
