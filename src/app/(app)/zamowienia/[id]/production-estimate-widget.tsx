"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2, Pencil, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateOrderProductionEstimateAction } from "@/server/orders";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dateValue, setDateValue] = useState(toDateInput(productionEndAt));
  const [daysValue, setDaysValue] = useState<string>(
    estimatedProductionDays != null ? String(estimatedProductionDays) : "",
  );

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

  function onDateChange(v: string) {
    setDateValue(v);
    if (v) {
      const target = new Date(v);
      if (!Number.isNaN(target.getTime())) {
        const days = daysUntil(target);
        if (days != null && days >= 0) setDaysValue(String(days));
      }
    } else {
      setDaysValue("");
    }
  }

  function save() {
    startTransition(async () => {
      try {
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
          toast.success("Wyczyszczono");
        }
        setOpen(false);
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
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  // Widok inline — kompaktowy badge z ołówkiem.
  const days = daysUntil(productionEndAt);
  const isPast = days != null && days < 0;
  const isUrgent = days != null && days >= 0 && days <= 7;
  const isSet = productionEndAt != null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDateValue(toDateInput(productionEndAt));
          setDaysValue(
            estimatedProductionDays != null
              ? String(estimatedProductionDays)
              : "",
          );
          setOpen(true);
        }}
        className={cn(
          "group inline-flex items-center gap-2 rounded-md px-2.5 py-1 ring-1 transition-colors text-xs",
          isSet
            ? isPast
              ? "bg-rose-50 ring-rose-300 text-rose-900 hover:bg-rose-100"
              : isUrgent
                ? "bg-amber-50 ring-amber-300 text-amber-900 hover:bg-amber-100"
                : "bg-indigo-50 ring-indigo-200 text-indigo-900 hover:bg-indigo-100"
            : "bg-muted/40 ring-border text-muted-foreground hover:bg-muted/60",
        )}
        title={
          isSet
            ? `Koniec produkcji: ${productionEndAt!.toLocaleDateString("pl-PL")}`
            : "Ustaw przewidywany czas produkcji"
        }
      >
        <CalendarClock className="size-3.5" />
        <span className="font-semibold uppercase tracking-wide text-[10px]">
          Produkcja:
        </span>
        {isSet ? (
          <>
            <span className="font-bold tabular-nums">
              {productionEndAt!.toLocaleDateString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })}
            </span>
            {days != null && (
              <span
                className={cn(
                  "tabular-nums text-[10px] font-semibold",
                  isPast
                    ? "text-rose-700"
                    : isUrgent
                      ? "text-amber-700"
                      : "text-emerald-700",
                )}
              >
                {isPast
                  ? `${Math.abs(days)}d temu`
                  : days === 0
                    ? "dzisiaj"
                    : `za ${days}d`}
              </span>
            )}
          </>
        ) : (
          <span className="italic">brak</span>
        )}
        <Pencil className="size-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-indigo-700" />
              Przewidywany czas produkcji
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Wpisz <strong>liczbę dni</strong> (od dzisiaj) <em>albo</em>{" "}
            <strong>datę zakończenia</strong> — drugie pole auto-przeliczy się.
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
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
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  dni
                </span>
              </div>
            </div>
            <div className="text-muted-foreground text-xs pb-2 text-center">
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
          </div>
          <DialogFooter className="gap-2">
            {(dateValue || daysValue) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clear}
                disabled={pending}
                className="mr-auto gap-1 text-muted-foreground"
              >
                <RotateCcw className="size-3.5" />
                Wyczyść
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={pending}
              className="gap-1.5"
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
