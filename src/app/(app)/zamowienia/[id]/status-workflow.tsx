"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Container as ContainerIcon,
  Lock,
  LockOpen,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  changeOrderStatusAction,
  closeOrderAction,
  deleteOrderAction,
  reopenOrderAction,
  updateOrderHeaderAction,
} from "@/server/orders";
import {
  ORDER_STATUSES,
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_SHORT,
  canDeleteOrder,
  type OrderStatusT,
} from "@/lib/order-status";
import {
  CONTAINER_M3,
  type ContainerTypeT,
} from "@/lib/container-types";

// ─── StatusActions ─────────────────────────────────────────────────
// Przyciski w prawym górnym rogu nagłówka: kontener, usuń, zamknij/otwórz.
// Rozdzielone od pipeline'a (StatusPipeline) bo w naglowku zajmuja osobne
// wiersze — actions w pasku z back-linkiem, pipeline na cala szerokosc nizej.

export function StatusActions({
  orderId,
  currentStatus,
  closedAt,
  closeBlockers,
  containerType,
  containerSizeM3,
  country = "CHINA",
}: {
  orderId: string;
  currentStatus: OrderStatusT;
  closedAt: Date | null;
  closeBlockers: string[];
  containerType: ContainerTypeT;
  containerSizeM3: number | null;
  country?: "CHINA" | "POLAND";
}) {
  const router = useRouter();
  const canDelete = canDeleteOrder(currentStatus) && !closedAt;
  const isClosed = !!closedAt;
  const canShowCloseButton = !isClosed && currentStatus === "W_MAGAZYNIE";
  const canClose = canShowCloseButton && closeBlockers.length === 0;
  const isPoland = country === "POLAND";

  const [containerDialogOpen, setContainerDialogOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleClose() {
    if (!canClose) {
      toast.error(
        "Nie można zamknąć:\n" +
          closeBlockers.map((r) => "· " + r).join("\n"),
      );
      return;
    }
    if (!confirm("Zamknąć zamówienie? Po zamknięciu edycja będzie zablokowana (można otworzyć ponownie).")) {
      return;
    }
    startTransition(async () => {
      try {
        await closeOrderAction(orderId);
        toast.success("Zamówienie zamknięte");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zamknąć");
      }
    });
  }

  function handleReopen() {
    if (
      !confirm(
        "Otworzyć zamówienie ponownie? Edycja zostanie odblokowana.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await reopenOrderAction(orderId);
        toast.success("Zamówienie otwarte do edycji");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się otworzyć");
      }
    });
  }

  function remove() {
    if (
      !confirm(
        "Na pewno usunąć to zamówienie? Tej operacji nie da się cofnąć.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteOrderAction(orderId);
        toast.success("Usunięto zamówienie");
        router.push(country === "POLAND" ? "/zamowienia/z-polski" : "/zamowienia");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {!isClosed && !isPoland && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setContainerDialogOpen(true)}
            aria-label="Edytuj kontener"
            title="Edytuj typ i pojemność kontenera"
            className="h-8 px-2.5 shrink-0 gap-1.5"
          >
            <ContainerIcon className="size-3.5" />
            <span className="text-xs font-semibold tabular-nums">
              {containerType === "TWENTY_FT"
                ? "20'"
                : containerType === "FORTY_FT"
                  ? "40'"
                  : `${containerSizeM3 ?? "?"} m³`}
            </span>
          </Button>
        )}

        {canShowCloseButton && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !canClose}
            onClick={handleClose}
            title={
              canClose
                ? "Zamknij zamówienie (zablokuj edycję)"
                : "Nie można zamknąć:\n" +
                  closeBlockers.map((r) => "· " + r).join("\n")
            }
            className={cn(
              "h-8 px-2.5 shrink-0 gap-1.5",
              canClose
                ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 ring-emerald-300"
                : "opacity-60 cursor-not-allowed",
            )}
          >
            <Lock className="size-3.5" />
            <span className="text-xs font-semibold">Zamknij</span>
          </Button>
        )}

        {isClosed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={handleReopen}
            title="Otwórz ponownie do edycji"
            className="h-8 px-2.5 shrink-0 gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 ring-amber-300"
          >
            <LockOpen className="size-3.5" />
            <span className="text-xs font-semibold">Otwórz do edycji</span>
          </Button>
        )}

        {canDelete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={remove}
            aria-label="Usuń zamówienie"
            className="h-8 w-8 p-0 shrink-0"
            title="Usuń zamówienie"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        )}
      </div>

      <ContainerEditDialog
        open={containerDialogOpen}
        onClose={() => setContainerDialogOpen(false)}
        orderId={orderId}
        currentType={containerType}
        currentSize={containerSizeM3 ?? CONTAINER_M3.TWENTY_FT ?? 28}
      />
    </>
  );
}

// ─── StatusPipeline ────────────────────────────────────────────────
// Wizualny pipeline 7 statusów (Planowane → ... → W magazynie). Klik na
// status otwiera dialog z notatką i zmienia status zamówienia. Renderowany
// na cala szerokosc pod naglowkiem dla maksymalnej czytelnosci.

export function StatusPipeline({
  orderId,
  currentStatus,
  closedAt,
}: {
  orderId: string;
  currentStatus: OrderStatusT;
  closedAt: Date | null;
}) {
  const router = useRouter();
  const currentIdx = ORDER_STATUSES.indexOf(currentStatus);
  const isClosed = !!closedAt;

  const [targetStatus, setTargetStatus] = useState<OrderStatusT | null>(null);
  const [pending, startTransition] = useTransition();

  function go(status: OrderStatusT, note?: string) {
    startTransition(async () => {
      try {
        await changeOrderStatusAction(orderId, status, note);
        toast.success(`Status: ${STATUS_LABEL[status]}`);
        setTargetStatus(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-0.5 bg-muted/40 rounded-lg p-1.5 ring-1 ring-border w-full",
          isClosed && "opacity-60",
        )}
      >
        {ORDER_STATUSES.map((s, i) => (
          <Fragment key={s}>
            {i > 0 && (
              <ChevronRight
                className={cn(
                  "size-3 shrink-0",
                  i <= currentIdx
                    ? "text-emerald-600"
                    : "text-muted-foreground/40",
                )}
              />
            )}
            <StepButton
              status={s}
              state={
                i < currentIdx
                  ? "done"
                  : i === currentIdx
                    ? "current"
                    : "future"
              }
              disabled={pending || i === currentIdx || isClosed}
              onClick={() => setTargetStatus(s)}
            />
          </Fragment>
        ))}
      </div>

      <Dialog
        open={targetStatus !== null}
        onOpenChange={(o) => !o && setTargetStatus(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Przejdź do statusu: {targetStatus ? STATUS_LABEL[targetStatus] : ""}
            </DialogTitle>
          </DialogHeader>
          <form
            action={(formData) => {
              const note = formData.get("note");
              if (targetStatus) {
                go(targetStatus, typeof note === "string" ? note : undefined);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="note">Notatka (opcjonalnie)</Label>
              <Textarea id="note" name="note" rows={3} />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setTargetStatus(null)}
              >
                Anuluj
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Zmieniam…" : "Zatwierdź"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContainerEditDialog({
  open,
  onClose,
  orderId,
  currentType,
  currentSize,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  currentType: ContainerTypeT;
  currentSize: number;
}) {
  const router = useRouter();
  const [type, setType] = useState<ContainerTypeT>(currentType);
  const [size, setSize] = useState(String(currentSize));
  const [pending, startTransition] = useTransition();

  function pick(t: "TWENTY_FT" | "FORTY_FT") {
    setType(t);
    const preset = CONTAINER_M3[t];
    if (preset != null) setSize(String(preset));
  }

  function save() {
    const sizeNum = Number(size);
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
      toast.error("Podaj poprawną pojemność (>0)");
      return;
    }
    startTransition(async () => {
      try {
        await updateOrderHeaderAction(orderId, {
          containerType: type,
          containerSizeM3: String(sizeNum),
        });
        toast.success(
          `Kontener: ${
            type === "TWENTY_FT" ? "20'" : type === "FORTY_FT" ? "40'" : "własny"
          } (${sizeNum} m³). Logistyka przeliczona.`,
        );
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
        else {
          setType(currentType);
          setSize(String(currentSize));
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ContainerIcon className="size-4 text-indigo-600" />
            Kontener zamówienia
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-sm">Typ kontenera</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => pick("TWENTY_FT")}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md ring-1 px-3 py-2.5 text-left transition-colors",
                  type === "TWENTY_FT"
                    ? "ring-2 ring-indigo-500 bg-indigo-50/70"
                    : "ring-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <div className="text-lg font-bold tabular-nums">20&apos;</div>
                <div className="text-[10px] text-muted-foreground">28 m³</div>
              </button>
              <button
                type="button"
                onClick={() => pick("FORTY_FT")}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-md ring-1 px-3 py-2.5 text-left transition-colors",
                  type === "FORTY_FT"
                    ? "ring-2 ring-indigo-500 bg-indigo-50/70"
                    : "ring-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <div className="text-lg font-bold tabular-nums">40&apos;</div>
                <div className="text-[10px] text-muted-foreground">68 m³</div>
              </button>
            </div>
            {type === "CUSTOM" && (
              <div className="text-[11px] text-amber-700 italic">
                Wymiar niestandardowy.
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Pojemność (m³)</Label>
            <Input
              type="number"
              step="0.1"
              value={size}
              onChange={(e) => {
                setSize(e.target.value);
                const n = Number(e.target.value);
                if (n === CONTAINER_M3.TWENTY_FT) setType("TWENTY_FT");
                else if (n === CONTAINER_M3.FORTY_FT) setType("FORTY_FT");
                else if (type !== "CUSTOM") setType("CUSTOM");
              }}
            />
            <p className="text-[10px] text-muted-foreground">
              Po zmianie automatycznie przeliczy się koszt logistyki na pozycje
              (cost/m³ × CBM).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Zapisuję…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepButton({
  status,
  state,
  disabled,
  onClick,
}: {
  status: OrderStatusT;
  state: "done" | "current" | "future";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = STATUS_ICON[status];
  const label = STATUS_SHORT[status];

  const stateClasses = {
    done: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 ring-emerald-200",
    current:
      "bg-primary text-primary-foreground ring-2 ring-primary shadow-sm cursor-default",
    future:
      "bg-transparent text-muted-foreground hover:bg-background hover:text-foreground ring-transparent",
  }[state];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={STATUS_LABEL[status]}
      aria-label={STATUS_LABEL[status]}
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ring-1 disabled:cursor-default whitespace-nowrap",
        stateClasses,
      )}
    >
      {state === "done" ? (
        <Check className="size-3.5" strokeWidth={3} />
      ) : (
        <Icon className="size-3.5" />
      )}
      <span>{label}</span>
    </button>
  );
}
