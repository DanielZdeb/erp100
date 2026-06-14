"use client";

import { useState, useTransition } from "react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  addCourierRateAction,
  updateCourierRateAction,
  deleteCourierRateAction,
} from "@/server/couriers";

type Rate = {
  id: string;
  serviceType: string;
  pricePln: number;
  maxWeightKg: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  maxSumDimsCm: number | null;
  isPaczkomat: boolean;
  validFrom: Date | null;
  validTo: Date | null;
  notes: string | null;
};

export function RatesTab({
  courierId,
  rates,
}: {
  courierId: string;
  rates: Rate[];
}) {
  const [dialog, setDialog] = useState<{ open: true; rate: Rate | null } | { open: false }>({ open: false });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => setDialog({ open: true, rate: null })}
          className="gap-2"
        >
          <Plus className="size-4" />
          Nowa stawka
        </Button>
      </div>

      {rates.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak stawek. Dodaj pierwszą — np. &quot;Paczkomat 24/7&quot;.
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usługa</TableHead>
                <TableHead>Limity</TableHead>
                <TableHead className="text-right">Cena</TableHead>
                <TableHead>Okres ważności</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium flex items-center gap-2">
                      {r.serviceType}
                      {r.isPaczkomat && (
                        <Badge variant="secondary" className="gap-1">
                          <Package className="size-3" />
                          Paczkomat
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatLimits(r)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {r.pricePln.toFixed(2)} zł
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.validFrom
                      ? new Date(r.validFrom).toLocaleDateString("pl-PL")
                      : "—"}
                    {" – "}
                    {r.validTo
                      ? new Date(r.validTo).toLocaleDateString("pl-PL")
                      : "bezterminowo"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialog({ open: true, rate: r })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <DeleteButton rateId={r.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <RateDialog
        state={dialog}
        onClose={() => setDialog({ open: false })}
        courierId={courierId}
      />
    </div>
  );
}

function DeleteButton({ rateId }: { rateId: string }) {
  const [pending, startTransition] = useTransition();
  function del() {
    if (!confirm("Usunąć tę stawkę?")) return;
    startTransition(async () => {
      try {
        await deleteCourierRateAction(rateId);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={del}
      disabled={pending}
    >
      <Trash2 className="size-4 text-destructive" />
    </Button>
  );
}

function formatLimits(r: Rate): string {
  const parts: string[] = [];
  if (r.maxWeightKg) parts.push(`do ${r.maxWeightKg} kg`);
  if (r.maxLengthCm || r.maxWidthCm || r.maxHeightCm) {
    parts.push(
      `${r.maxLengthCm ?? "—"} × ${r.maxWidthCm ?? "—"} × ${r.maxHeightCm ?? "—"} cm`,
    );
  }
  if (r.maxSumDimsCm) parts.push(`suma ≤ ${r.maxSumDimsCm} cm`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function RateDialog({
  state,
  onClose,
  courierId,
}: {
  state: { open: true; rate: Rate | null } | { open: false };
  onClose: () => void;
  courierId: string;
}) {
  const [pending, startTransition] = useTransition();
  const open = state.open;
  const editing = state.open ? state.rate : null;

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    startTransition(async () => {
      try {
        if (editing) {
          await updateCourierRateAction(editing.id, payload);
          toast.success("Zapisano");
        } else {
          await addCourierRateAction(courierId, payload);
          toast.success("Dodano stawkę");
        }
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edytuj stawkę" : "Nowa stawka"}</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="serviceType">Nazwa usługi</Label>
              <Input
                id="serviceType"
                name="serviceType"
                required
                placeholder="Standard / Paczkomat 24/7 / Pobranie…"
                defaultValue={editing?.serviceType ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricePln">Cena (PLN)</Label>
              <Input
                id="pricePln"
                name="pricePln"
                type="number"
                step="0.01"
                required
                defaultValue={editing?.pricePln ?? ""}
              />
            </div>
            <div className="space-y-2 flex items-end">
              <div className="flex items-center gap-2 pb-1.5">
                <Checkbox
                  id="isPaczkomat"
                  name="isPaczkomat"
                  defaultChecked={editing?.isPaczkomat ?? false}
                />
                <Label htmlFor="isPaczkomat">Paczkomat</Label>
              </div>
            </div>
          </div>

          <fieldset className="space-y-2 border rounded-md p-3">
            <legend className="text-xs text-muted-foreground px-1">
              Limity wymiarów (opcjonalnie)
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label htmlFor="maxWeightKg" className="text-xs">
                  Waga kg
                </Label>
                <Input
                  id="maxWeightKg"
                  name="maxWeightKg"
                  type="number"
                  step="0.01"
                  defaultValue={editing?.maxWeightKg ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxLengthCm" className="text-xs">
                  L cm
                </Label>
                <Input
                  id="maxLengthCm"
                  name="maxLengthCm"
                  type="number"
                  step="0.1"
                  defaultValue={editing?.maxLengthCm ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxWidthCm" className="text-xs">
                  W cm
                </Label>
                <Input
                  id="maxWidthCm"
                  name="maxWidthCm"
                  type="number"
                  step="0.1"
                  defaultValue={editing?.maxWidthCm ?? ""}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxHeightCm" className="text-xs">
                  H cm
                </Label>
                <Input
                  id="maxHeightCm"
                  name="maxHeightCm"
                  type="number"
                  step="0.1"
                  defaultValue={editing?.maxHeightCm ?? ""}
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-2">
                <Label htmlFor="maxSumDimsCm" className="text-xs">
                  Suma wymiarów (cm)
                </Label>
                <Input
                  id="maxSumDimsCm"
                  name="maxSumDimsCm"
                  type="number"
                  step="0.1"
                  defaultValue={editing?.maxSumDimsCm ?? ""}
                />
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="validFrom">Ważne od</Label>
              <Input
                id="validFrom"
                name="validFrom"
                type="date"
                defaultValue={toInputDate(editing?.validFrom)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="validTo">Ważne do</Label>
              <Input
                id="validTo"
                name="validTo"
                type="date"
                defaultValue={toInputDate(editing?.validTo)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notatki</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisuję…" : editing ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toInputDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}
