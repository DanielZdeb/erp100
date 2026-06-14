"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { updateOrderHeaderAction } from "@/server/orders";
import { STATUS_LABEL, type OrderStatusT } from "@/lib/order-status";
import { CurrencyRateInput } from "@/components/currency-rate-input";
import {
  CONTAINER_LABEL,
  CONTAINER_M3,
  CONTAINER_SHORT_LABEL,
  type ContainerTypeT,
} from "@/lib/container-types";

type Order = {
  id: string;
  name: string | null;
  notes: string | null;
  cnyToPlnRate: number | null;
  usdToPlnRate: number | null;
  eurToPlnRate: number | null;
  vatRate: number | null;
  containerType: ContainerTypeT;
  containerSizeM3: number | null;
  estimatedProductionDays: number | null;
  orderedAt: Date | null;
  productionStartAt: Date | null;
  productionEndAt: Date | null;
  shippedAt: Date | null;
  arrivedPortAt: Date | null;
  arrivedWarehouseAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  createdBy: { id: string; name: string | null; email: string };
};

type StatusEntry = {
  id: string;
  changedAt: Date;
  fromStatus: OrderStatusT | null;
  toStatus: OrderStatusT;
  note: string | null;
  changedBy: { name: string | null; email: string } | null;
};

export function OverviewTab({
  order,
  statusHistory,
}: {
  order: Order;
  statusHistory: StatusEntry[];
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Nagłówek</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing(true)}
              className="gap-1"
            >
              <Pencil className="size-3" />
              Edytuj
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Def label="Nazwa" value={order.name ?? "—"} />
              <Def
                label="Utworzone"
                value={`${order.createdBy.name ?? order.createdBy.email}, ${fmtDate(order.createdAt)}`}
              />
              <Def
                label="Kurs juana"
                value={order.cnyToPlnRate ? `${order.cnyToPlnRate} → PLN` : "—"}
              />
              <Def
                label="Kurs dolara"
                value={order.usdToPlnRate ? `${order.usdToPlnRate} → PLN` : "—"}
              />
              <Def
                label="Kurs euro"
                value={order.eurToPlnRate ? `${order.eurToPlnRate} → PLN` : "—"}
              />
              <Def
                label="VAT"
                value={
                  order.vatRate != null
                    ? `${(order.vatRate * 100).toFixed(0)}%`
                    : "—"
                }
              />
              <Def
                label="Kontener"
                value={
                  order.containerSizeM3
                    ? `${CONTAINER_SHORT_LABEL[order.containerType]} · ${order.containerSizeM3} m³`
                    : "—"
                }
              />
              <Def
                label="Estymowana produkcja"
                value={
                  order.estimatedProductionDays
                    ? `${order.estimatedProductionDays} dni`
                    : "—"
                }
              />
            </dl>
            {order.notes && (
              <div className="text-sm whitespace-pre-wrap border-l-2 border-muted pl-3 text-muted-foreground">
                {order.notes}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daty etapów</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <DateRow label="Zamówione" date={order.orderedAt} />
              <DateRow label="Start produkcji" date={order.productionStartAt} />
              <DateRow label="Koniec produkcji" date={order.productionEndAt} />
              <DateRow label="Wysłane" date={order.shippedAt} />
              <DateRow label="W porcie" date={order.arrivedPortAt} />
              <DateRow label="Na magazynie" date={order.arrivedWarehouseAt} />
              <DateRow label="Zamknięte" date={order.closedAt} />
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historia statusów</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {statusHistory.map((entry) => (
              <li
                key={entry.id}
                className="flex gap-4 text-sm border-l-2 border-muted pl-4"
              >
                <div className="text-xs text-muted-foreground w-32 shrink-0">
                  {fmtDateTime(entry.changedAt)}
                </div>
                <div className="flex-1">
                  <div>
                    {entry.fromStatus && (
                      <>
                        <span className="text-muted-foreground">
                          {STATUS_LABEL[entry.fromStatus]}
                        </span>
                        <span className="mx-2 text-muted-foreground">→</span>
                      </>
                    )}
                    <span className="font-medium">
                      {STATUS_LABEL[entry.toStatus]}
                    </span>
                  </div>
                  {entry.note && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.note}
                    </div>
                  )}
                  {entry.changedBy && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.changedBy.name ?? entry.changedBy.email}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <HeaderEditDialog
        open={editing}
        onClose={() => setEditing(false)}
        order={order}
      />
    </div>
  );
}

function Def({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function DateRow({ label, date }: { label: string; date: Date | null }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {date ? fmtDate(date) : "—"}
      </span>
    </div>
  );
}

function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("pl-PL");
}

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HeaderEditDialog({
  open,
  onClose,
  order,
}: {
  open: boolean;
  onClose: () => void;
  order: Order;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    startTransition(async () => {
      try {
        await updateOrderHeaderAction(order.id, payload);
        toast.success("Zapisano");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edytuj nagłówek zamówienia</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nazwa">
              <Input name="name" defaultValue={order.name ?? ""} />
            </Field>
            <Field label="Kurs juana → PLN">
              <CurrencyRateInput
                currency="CNY"
                name="cnyToPlnRate"
                defaultValue={order.cnyToPlnRate ?? undefined}
              />
            </Field>
            <Field label="Kurs dolara → PLN">
              <CurrencyRateInput
                currency="USD"
                name="usdToPlnRate"
                defaultValue={order.usdToPlnRate ?? undefined}
              />
            </Field>
            <Field label="Kurs euro → PLN">
              <CurrencyRateInput
                currency="EUR"
                name="eurToPlnRate"
                defaultValue={order.eurToPlnRate ?? undefined}
              />
            </Field>
            <Field label="VAT (0–1)">
              <Input
                name="vatRate"
                type="number"
                step="0.01"
                defaultValue={order.vatRate ?? "0.23"}
              />
            </Field>
            <ContainerPicker
              defaultType={order.containerType}
              defaultSize={order.containerSizeM3 ?? 28}
            />
            <Field label="Estymowana produkcja (dni)">
              <Input
                name="estimatedProductionDays"
                type="number"
                step="1"
                defaultValue={order.estimatedProductionDays ?? ""}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Zamówione">
              <Input
                name="orderedAt"
                type="date"
                defaultValue={toDateInput(order.orderedAt)}
              />
            </Field>
            <Field label="Start produkcji">
              <Input
                name="productionStartAt"
                type="date"
                defaultValue={toDateInput(order.productionStartAt)}
              />
            </Field>
            <Field label="Koniec produkcji">
              <Input
                name="productionEndAt"
                type="date"
                defaultValue={toDateInput(order.productionEndAt)}
              />
            </Field>
            <Field label="Wysłane">
              <Input
                name="shippedAt"
                type="date"
                defaultValue={toDateInput(order.shippedAt)}
              />
            </Field>
            <Field label="W porcie">
              <Input
                name="arrivedPortAt"
                type="date"
                defaultValue={toDateInput(order.arrivedPortAt)}
              />
            </Field>
            <Field label="Na magazynie">
              <Input
                name="arrivedWarehouseAt"
                type="date"
                defaultValue={toDateInput(order.arrivedWarehouseAt)}
              />
            </Field>
          </div>

          <Field label="Notatki">
            <Textarea name="notes" rows={3} defaultValue={order.notes ?? ""} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisuję…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ContainerPicker({
  defaultType,
  defaultSize,
}: {
  defaultType: ContainerTypeT;
  defaultSize: number;
}) {
  const [type, setType] = useState<ContainerTypeT>(defaultType);
  const [size, setSize] = useState(String(defaultSize));

  function pick(t: "TWENTY_FT" | "FORTY_FT") {
    setType(t);
    const preset = CONTAINER_M3[t];
    if (preset != null) setSize(String(preset));
  }

  return (
    <>
      <Field label="Typ kontenera">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => pick("TWENTY_FT")}
            className={`flex flex-col items-start gap-0.5 rounded-md ring-1 px-3 py-2 text-left transition-colors ${
              type === "TWENTY_FT"
                ? "ring-2 ring-indigo-500 bg-indigo-50/70"
                : "ring-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="text-base font-bold tabular-nums">20&apos;</div>
            <div className="text-[10px] text-muted-foreground">28 m³</div>
          </button>
          <button
            type="button"
            onClick={() => pick("FORTY_FT")}
            className={`flex flex-col items-start gap-0.5 rounded-md ring-1 px-3 py-2 text-left transition-colors ${
              type === "FORTY_FT"
                ? "ring-2 ring-indigo-500 bg-indigo-50/70"
                : "ring-slate-200 bg-white hover:bg-slate-50"
            }`}
          >
            <div className="text-base font-bold tabular-nums">40&apos;</div>
            <div className="text-[10px] text-muted-foreground">68 m³</div>
          </button>
        </div>
        {type === "CUSTOM" && (
          <div className="text-[10px] text-amber-700 mt-1 italic">
            Wymiar niestandardowy — wpisz ręcznie poniżej.
          </div>
        )}
        <input type="hidden" name="containerType" value={type} />
      </Field>
      <Field label="Pojemność (m³)">
        <Input
          name="containerSizeM3"
          type="number"
          step="0.1"
          value={size}
          onChange={(e) => {
            setSize(e.target.value);
            // Ręczna edycja pola → przełączamy na CUSTOM (chyba że wartość pasuje
            // dokładnie do presetu 20'/40' — wtedy zostawiamy odpowiedni typ).
            const n = Number(e.target.value);
            if (n === CONTAINER_M3.TWENTY_FT) setType("TWENTY_FT");
            else if (n === CONTAINER_M3.FORTY_FT) setType("FORTY_FT");
            else if (type !== "CUSTOM") setType("CUSTOM");
          }}
        />
      </Field>
    </>
  );
}

function toDateInput(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
