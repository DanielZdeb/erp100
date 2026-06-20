"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { updateOrderProductionEstimateAction } from "@/server/orders";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  const iso = new Date(d).toISOString();
  return iso.slice(0, 10);
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = d.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function ProductionEstimateWidget({
  orderId,
  productionEndAt,
  estimatedProductionDays,
}: {
  orderId: string;
  productionEndAt: Date | null;
  estimatedProductionDays: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dateValue, setDateValue] = useState(toDateInput(productionEndAt));
  const [daysValue, setDaysValue] = useState<string>(
    estimatedProductionDays != null ? String(estimatedProductionDays) : "",
  );

  // Live: gdy uzytkownik zmienia DNI -> auto-przelicz datę = today + days
  function onDaysChange(v: string) {
    setDaysValue(v);
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newDate = new Date(today.getTime() + n * 24 * 60 * 60 * 1000);
      setDateValue(toDateInput(newDate));
    } else if (v === "") {
      setDateValue("");
    }
  }

  // Live: gdy zmienia DATĘ -> przelicz dni od dziś
  function onDateChange(v: string) {
    setDateValue(v);
    if (v) {
      const target = new Date(v);
      if (!Number.isNaN(target.getTime())) {
        const days = daysUntil(target);
        if (days != null && days >= 0) {
          setDaysValue(String(days));
        }
      }
    } else {
      setDaysValue("");
    }
  }

  function save() {
    startTransition(async () => {
      try {
        // Wybor mode na podstawie ostatniej edycji — preferujemy 'date' bo
        // jest precyzyjna; 'days' tylko gdy data pusta.
        if (dateValue) {
          await updateOrderProductionEstimateAction(orderId, "date", dateValue);
          toast.success("Zapisano koniec produkcji");
        } else if (daysValue) {
          await updateOrderProductionEstimateAction(
            orderId,
            "days",
            Number(daysValue),
          );
          toast.success("Zapisano czas produkcji");
        } else {
          await updateOrderProductionEstimateAction(orderId, "clear", null);
          toast.success("Wyczyszczono czas produkcji");
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function clear() {
    setDateValue("");
    setDaysValue("");
    startTransition(async () => {
      try {
        await updateOrderProductionEstimateAction(orderId, "clear", null);
        toast.success("Wyczyszczono");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const currentDays = dateValue
    ? daysUntil(new Date(dateValue))
    : daysValue
      ? Number(daysValue)
      : null;
  const isPast = currentDays != null && currentDays < 0;
  const isUrgent = currentDays != null && currentDays >= 0 && currentDays <= 7;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock className="size-4 text-indigo-700" />
        <h3 className="text-sm font-heading font-semibold text-indigo-900 uppercase tracking-wide">
          Przewidywany czas produkcji
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Wpisz <strong>liczbę dni</strong> (od dzisiaj) <em>albo</em>{" "}
        <strong>datę zakończenia</strong> — drugie pole auto-przeliczy się.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
        <div className="space-y-1">
          <label htmlFor="prod-days" className="text-[11px] font-medium">
            Liczba dni produkcji
          </label>
          <div className="relative">
            <Input
              id="prod-days"
              type="number"
              min={0}
              step={1}
              value={daysValue}
              onChange={(e) => onDaysChange(e.target.value)}
              placeholder="np. 45"
              className="pr-12"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              dni
            </span>
          </div>
        </div>

        <div className="text-muted-foreground text-xs pb-2 text-center hidden sm:block">
          =
        </div>

        <div className="space-y-1">
          <label htmlFor="prod-date" className="text-[11px] font-medium">
            Data zakończenia
          </label>
          <Input
            id="prod-date"
            type="date"
            value={dateValue}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          {(dateValue || daysValue) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clear}
              disabled={pending}
              className="gap-1.5 text-muted-foreground"
              title="Wyczyść"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
          <Button
            type="button"
            onClick={save}
            disabled={pending}
            className="gap-1.5"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Zapisz
          </Button>
        </div>
      </div>

      {currentDays != null && (
        <div
          className={cn(
            "mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold",
            isPast
              ? "bg-rose-100 text-rose-800 ring-1 ring-rose-300"
              : isUrgent
                ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
          )}
        >
          {isPast ? (
            <>⚠ Opóźnienie: {Math.abs(currentDays)} dni temu</>
          ) : currentDays === 0 ? (
            <>📅 Dziś koniec produkcji</>
          ) : (
            <>📅 Pozostało {currentDays} dni do końca produkcji</>
          )}
        </div>
      )}
    </Card>
  );
}
