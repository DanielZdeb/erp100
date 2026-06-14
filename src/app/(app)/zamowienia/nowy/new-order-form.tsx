"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createOrderAction } from "@/server/orders";
import {
  CONTAINER_M3,
  CONTAINER_LABEL,
  type ContainerTypeT,
} from "@/lib/container-types";
import { CurrencyRateInput } from "@/components/currency-rate-input";

export function NewOrderForm({
  defaultContainerType,
  onSuccess,
  hideCancel,
  country = "CHINA",
}: {
  defaultContainerType: ContainerTypeT;
  /** Gdy ustawione, zamiast router.push po sukcesie wołane (modal context). */
  onSuccess?: (id: string) => void;
  /** Ukryj „Anuluj" — modal ma swój X. */
  hideCancel?: boolean;
  /** Kraj produkcji: CHINA (default) lub POLAND. PL pomija kontener morski. */
  country?: "CHINA" | "POLAND";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [containerType, setContainerType] =
    useState<ContainerTypeT>(defaultContainerType);
  const [containerSize, setContainerSize] = useState(
    String(CONTAINER_M3[defaultContainerType] ?? 28),
  );

  function onChangeContainerType(t: ContainerTypeT) {
    setContainerType(t);
    const preset = CONTAINER_M3[t];
    if (preset != null) setContainerSize(String(preset));
  }

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    payload.containerType = containerType;
    payload.containerSizeM3 = containerSize;
    payload.country = country;
    // PL nie używa walut Chińskich/USD/EUR i nie ma kontenera morskiego —
    // wpisujemy wszystko w PLN, kontener domyślny zostawiamy tylko po to,
    // żeby spełnić walidację schemy (kalkulacja go ignoruje w trybie QTY).
    if (country === "POLAND") {
      payload.cnyToPlnRate = "";
      payload.usdToPlnRate = "";
      payload.eurToPlnRate = "";
      payload.containerType = "TWENTY_FT";
      payload.containerSizeM3 = "28";
    }
    startTransition(async () => {
      try {
        const result = await createOrderAction(payload);
        toast.success(`Utworzono zamówienie ${result.orderNumber}`);
        // Po sukcesie → detail zamówienia. PL zamówienia żyją pod
        // /z-polski/{id} żeby sidebar podświetlił właściwą pozycję.
        const target =
          country === "POLAND"
            ? `/zamowienia/z-polski/${result.id}`
            : `/zamowienia/${result.id}`;
        if (onSuccess) {
          onSuccess(result.id);
        }
        router.push(target);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const isPoland = country === "POLAND";

  return (
    <form action={onSubmit} className="space-y-6 w-full">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nagłówek</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Nazwa robocza (opcjonalnie)</Label>
            <Input
              id="name"
              name="name"
              placeholder={
                isPoland
                  ? "np. Produkcja marzec 2026"
                  : "np. Kontener marzec 2026"
              }
              autoFocus
            />
          </div>

          {/* Waluty Chin/USD/EUR i kontener morski — tylko dla zamówień z Chin. */}
          {!isPoland && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cnyToPlnRate">Kurs juana → PLN</Label>
                <CurrencyRateInput
                  currency="CNY"
                  id="cnyToPlnRate"
                  name="cnyToPlnRate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="usdToPlnRate">Kurs dolara → PLN</Label>
                <CurrencyRateInput
                  currency="USD"
                  id="usdToPlnRate"
                  name="usdToPlnRate"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="eurToPlnRate">Kurs euro → PLN</Label>
                <CurrencyRateInput
                  currency="EUR"
                  id="eurToPlnRate"
                  name="eurToPlnRate"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="vatRate">VAT (0–1)</Label>
            <Input
              id="vatRate"
              name="vatRate"
              type="number"
              step="0.01"
              defaultValue="0.23"
            />
          </div>

          {!isPoland && (
            <>
              <div className="space-y-2">
                <Label>Typ kontenera</Label>
                <Select
                  value={containerType}
                  onValueChange={(v) =>
                    onChangeContainerType((v as ContainerTypeT) ?? "TWENTY_FT")
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v) =>
                        CONTAINER_LABEL[v as ContainerTypeT] ?? String(v ?? "")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TWENTY_FT">
                      {CONTAINER_LABEL.TWENTY_FT}
                    </SelectItem>
                    <SelectItem value="FORTY_FT">
                      {CONTAINER_LABEL.FORTY_FT}
                    </SelectItem>
                    <SelectItem value="CUSTOM">
                      {CONTAINER_LABEL.CUSTOM}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="containerSize">Pojemność (m³)</Label>
                <Input
                  id="containerSize"
                  type="number"
                  step="0.1"
                  value={containerSize}
                  onChange={(e) => {
                    setContainerSize(e.target.value);
                    if (containerType !== "CUSTOM") setContainerType("CUSTOM");
                  }}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="estimatedProductionDays">
              {isPoland
                ? "Estymowany czas produkcji (dni)"
                : "Estymowany czas produkcji (dni)"}
            </Label>
            <Input
              id="estimatedProductionDays"
              name="estimatedProductionDays"
              type="number"
              step="1"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">Notatki</Label>
            <Textarea id="notes" name="notes" rows={3} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 justify-end sticky bottom-0 bg-background/95 backdrop-blur py-4 -mx-6 px-6 border-t">
        {!hideCancel && (
          <Link
            href={isPoland ? "/zamowienia/z-polski" : "/zamowienia"}
            className={buttonVariants({ variant: "outline" })}
          >
            Anuluj
          </Link>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Tworzę…" : "Utwórz zamówienie"}
        </Button>
      </div>
    </form>
  );
}
