"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Star, Truck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  calculateShipping,
  type CalcBoxLink,
  type CalcProduct,
  type CalcRate,
  type ShippingOption,
} from "@/lib/shipping-calc";

export function ShippingCalculator({
  product,
  productBoxes,
  rates,
}: {
  product: CalcProduct;
  productBoxes: CalcBoxLink[];
  rates: CalcRate[];
}) {
  const [qtyStr, setQtyStr] = useState("1");
  const qty = Math.max(1, Math.trunc(Number(qtyStr) || 1));

  const options = useMemo(
    () => calculateShipping(product, qty, productBoxes, rates),
    [product, qty, productBoxes, rates],
  );

  // Najtańsza globalna opcja
  const bestGlobal = useMemo(() => {
    let best: { opt: ShippingOption; total: number } | null = null;
    for (const opt of options) {
      if (opt.cheapest) {
        if (!best || opt.cheapest.totalPrice < best.total) {
          best = { opt, total: opt.cheapest.totalPrice };
        }
      }
    }
    return best;
  }, [options]);

  if (productBoxes.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        Aby liczyć wysyłkę — przypnij najpierw pudełko do tego produktu.
      </Card>
    );
  }

  if (rates.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground text-center">
        Brak cenników kurierów. Dodaj je w sekcji Kurierzy.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label htmlFor="ship-qty" className="text-xs">
            Ilość sztuk
          </Label>
          <Input
            id="ship-qty"
            type="number"
            min="1"
            step="1"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            className="h-8 w-28 tabular-nums"
          />
        </div>

        {bestGlobal && (
          <div className="flex-1 min-w-[200px] rounded-md bg-emerald-50 ring-1 ring-emerald-200 px-3 py-2 text-xs">
            <div className="text-emerald-700 font-semibold">
              Najtańsza opcja
            </div>
            <div className="text-sm font-medium text-emerald-900 mt-0.5">
              {bestGlobal.opt.boxName} ×{" "}
              {bestGlobal.opt.cheapest?.courierName} (
              {bestGlobal.opt.cheapest?.serviceType}) ={" "}
              <strong>{bestGlobal.total.toFixed(2)} zł</strong>
            </div>
            <div className="text-[10px] text-emerald-800/80 mt-0.5">
              {bestGlobal.opt.boxesNeeded} pudełek ×{" "}
              {bestGlobal.opt.cheapest?.pricePerBox.toFixed(2)} zł/szt
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {options.map((opt) => (
          <BoxOptionCard key={opt.boxId} opt={opt} />
        ))}
      </div>
    </div>
  );
}

function BoxOptionCard({ opt }: { opt: ShippingOption }) {
  const [showUnfit, setShowUnfit] = useState(false);
  const fittingOptions = opt.courierOptions.filter((c) => c.fits);
  const unfittingOptions = opt.courierOptions.filter((c) => !c.fits);

  return (
    <Card
      className={cn(
        "p-3 space-y-2",
        opt.isPrimary && "ring-2 ring-amber-400/60",
      )}
    >
      <div className="flex items-center gap-2 pb-2 border-b">
        {opt.isPrimary && <Star className="size-3.5 text-amber-500" />}
        <span className="font-medium text-sm">{opt.boxName}</span>
        {opt.internalCode && (
          <code className="text-[10px] text-muted-foreground">
            {opt.internalCode}
          </code>
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums">
          · {opt.boxDims.widthCm}×{opt.boxDims.heightCm}×{opt.boxDims.depthCm}{" "}
          cm · suma {opt.boxSumDimsCm} cm
        </span>
        <span className="ml-auto text-xs tabular-nums">
          <strong>{opt.boxesNeeded}</strong> pudełek ·{" "}
          {opt.perBoxWeightKg.toFixed(2)} kg/pudło
        </span>
      </div>

      {fittingOptions.length === 0 ? (
        <div className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 px-2 py-1.5 rounded">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>
            Żadna usługa kurierska nie obsługuje tego pudełka — sprawdź limity
            wymiarów/wagi w kurierach.
          </span>
        </div>
      ) : (
        <ul className="space-y-1">
          {fittingOptions.map((co) => (
            <CourierOptionRow key={co.rateId} co={co} boxesNeeded={opt.boxesNeeded} />
          ))}
        </ul>
      )}

      {unfittingOptions.length > 0 && (
        <details
          open={showUnfit}
          onToggle={(e) => setShowUnfit(e.currentTarget.open)}
          className="text-[11px]"
        >
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Pokaż {unfittingOptions.length} niepasujących
          </summary>
          <ul className="mt-1 space-y-1 pl-3">
            {unfittingOptions.map((co) => (
              <li
                key={co.rateId}
                className="flex items-start gap-1.5 text-amber-700"
              >
                <AlertCircle className="size-3 mt-0.5 shrink-0" />
                <span className="flex-1">
                  <span className="font-medium">{co.courierName}</span> ·{" "}
                  {co.serviceType}: {co.reasons.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function CourierOptionRow({
  co,
  boxesNeeded,
}: {
  co: { courierName: string; serviceType: string; isPaczkomat: boolean; pricePerBox: number; totalPrice: number };
  boxesNeeded: number;
}) {
  return (
    <li className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 text-xs">
      <Truck className="size-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">{co.courierName}</span>
        <span className="text-muted-foreground"> · {co.serviceType}</span>
        {co.isPaczkomat && (
          <span className="ml-1.5 inline-flex items-center text-[9px] rounded px-1 py-0.5 bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200">
            paczkomat
          </span>
        )}
      </div>
      <span className="tabular-nums text-muted-foreground">
        {co.pricePerBox.toFixed(2)} zł × {boxesNeeded}
      </span>
      <span className="tabular-nums font-semibold w-20 text-right">
        {co.totalPrice.toFixed(2)} zł
      </span>
    </li>
  );
}
