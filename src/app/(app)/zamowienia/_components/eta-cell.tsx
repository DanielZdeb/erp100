"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2, Pencil, Plug, X } from "lucide-react";

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
import {
  updateOrderEtaAction,
  fetchEtaFromMaerskAction,
} from "@/server/orders";

export function EtaCell({
  orderId,
  etaDate,
  etaSource,
  hasContainerNumbers,
}: {
  orderId: string;
  etaDate: Date | null;
  etaSource: string | null;
  hasContainerNumbers: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(
    etaDate ? etaDate.toISOString().slice(0, 10) : "",
  );

  const daysToEta = etaDate
    ? Math.floor((etaDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  function save() {
    startTransition(async () => {
      try {
        await updateOrderEtaAction(orderId, value || null);
        toast.success(value ? "Zapisano ETA" : "Usunięto ETA");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function fetchFromMaersk() {
    startTransition(async () => {
      const toastId = toast.loading("Pobieram ETA z Maersk...");
      try {
        const r = await fetchEtaFromMaerskAction(orderId);
        if (r.ok) {
          toast.success(
            `ETA: ${new Date(r.eta).toLocaleDateString("pl-PL")} (${r.containers} kontener${r.containers === 1 ? "" : "ów"})`,
            { id: toastId },
          );
          setOpen(false);
          router.refresh();
        } else {
          toast.error(r.error, { id: toastId });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd Maersk", {
          id: toastId,
        });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "group inline-flex flex-col items-center gap-0.5 rounded px-1.5 py-1 text-xs transition-colors",
          etaDate
            ? "hover:bg-emerald-50"
            : "text-muted-foreground hover:bg-muted/40",
        )}
        title={
          etaSource === "maersk"
            ? "ETA z Maersk Track & Trace"
            : etaSource === "manual"
              ? "ETA ustawione ręcznie"
              : "Dodaj ETA"
        }
      >
        {etaDate ? (
          <>
            <span className="font-semibold tabular-nums text-foreground">
              {etaDate.toLocaleDateString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </span>
            {daysToEta != null && (
              <span
                className={cn(
                  "text-[9px] font-medium",
                  daysToEta < 0
                    ? "text-rose-600"
                    : daysToEta <= 7
                      ? "text-amber-700"
                      : "text-emerald-700",
                )}
              >
                {daysToEta < 0
                  ? `${Math.abs(daysToEta)} dni temu`
                  : daysToEta === 0
                    ? "dzisiaj"
                    : `za ${daysToEta} dni`}
              </span>
            )}
            {etaSource === "maersk" && (
              <span className="text-[8px] text-sky-600 font-semibold uppercase">
                Maersk
              </span>
            )}
          </>
        ) : (
          <>
            <CalendarClock className="size-3.5" />
            <span className="text-[9px]">Dodaj ETA</span>
          </>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>ETA — szacowany przylot kontenera</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium" htmlFor="eta-date">
                Data ETA
              </label>
              <Input
                id="eta-date"
                type="date"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Wpisz ręcznie albo pobierz automatycznie z Maersk poniżej.
              </p>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Maersk Track & Trace
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={fetchFromMaersk}
                disabled={pending || !hasContainerNumbers}
                className="gap-1.5 w-full"
                title={
                  !hasContainerNumbers
                    ? "Dodaj numer kontenera w sekcji Link śledzenia"
                    : "Pobierz ETA z API Maersk dla wszystkich kontenerów"
                }
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plug className="size-3.5" />
                )}
                Pobierz z Maersk API
              </Button>
              {!hasContainerNumbers && (
                <p className="text-[10px] text-amber-700">
                  ⚠ Dodaj numer kontenera w sekcji „Link śledzenia" żeby
                  pobrać ETA z Maersk.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            {etaDate && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setValue("");
                  save();
                }}
                disabled={pending}
                className="mr-auto gap-1 text-amber-700"
              >
                <X className="size-3.5" />
                Usuń ETA
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
              <Pencil className="size-3.5" />
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
