"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { addPaymentAction, deletePaymentAction } from "@/server/order-costs";
import { STATUS_LABEL, STATUS_ORDER, type OrderStatusT } from "@/lib/order-status";

const NO_STATUS = "__none__";

type Payment = {
  id: string;
  amountPln: number;
  status: OrderStatusT | null;
  paidAt: Date | null;
  description: string | null;
  reference: string | null;
  createdAt: Date;
};

export function PaymentsTab({
  orderId,
  payments,
  totalLanded,
}: {
  orderId: string;
  payments: Payment[];
  totalLanded: number;
}) {
  const [open, setOpen] = useState(false);
  const paidSum = payments.reduce((s, p) => s + p.amountPln, 0);
  const remaining = Math.max(0, totalLanded - paidSum);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiSmall label="Pełen koszt" value={fmtPln(totalLanded)} />
        <KpiSmall label="Zapłacono" value={fmtPln(paidSum)} accent="ok" />
        <KpiSmall
          label="Pozostało"
          value={fmtPln(remaining)}
          accent={remaining > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Dodaj płatność
        </Button>
      </div>

      {payments.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak płatności.
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Etap</TableHead>
                <TableHead className="text-right">Kwota</TableHead>
                <TableHead>Opis / referencja</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <PaymentRow key={p.id} payment={p} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AddPaymentDialog
        open={open}
        onClose={() => setOpen(false)}
        orderId={orderId}
      />
    </div>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  const [pending, startTransition] = useTransition();
  function del() {
    if (!confirm("Usunąć tę płatność?")) return;
    startTransition(async () => {
      try {
        await deletePaymentAction(payment.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }
  return (
    <TableRow>
      <TableCell>
        {payment.paidAt
          ? new Date(payment.paidAt).toLocaleDateString("pl-PL")
          : new Date(payment.createdAt).toLocaleDateString("pl-PL")}
      </TableCell>
      <TableCell>
        {payment.status ? (
          <Badge variant="secondary">{STATUS_LABEL[payment.status]}</Badge>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmtPln(payment.amountPln)}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <div>{payment.description ?? ""}</div>
        {payment.reference && <code className="text-[10px]">{payment.reference}</code>}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={del}
          disabled={pending}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function KpiSmall({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "ok" | "warn";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`text-lg font-semibold tabular-nums ${
            accent === "ok" ? "text-emerald-600" : accent === "warn" ? "text-amber-600" : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function AddPaymentDialog({
  open,
  onClose,
  orderId,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>(NO_STATUS);

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    payload.status = status === NO_STATUS ? "" : status;
    startTransition(async () => {
      try {
        await addPaymentAction(orderId, payload);
        toast.success("Dodano płatność");
        setStatus(NO_STATUS);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nowa płatność</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amountPln">Kwota (PLN)</Label>
              <Input
                id="amountPln"
                name="amountPln"
                type="number"
                step="0.01"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paidAt">Data zapłaty</Label>
              <Input id="paidAt" name="paidAt" type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Etap (opcjonalnie)</Label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? NO_STATUS)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_STATUS}>— bez etapu —</SelectItem>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Opis</Label>
            <Input id="description" name="description" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reference">Referencja (nr faktury, przelewu)</Label>
            <Input id="reference" name="reference" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Dodaję…" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fmtPln(n: number): string {
  // Suffix "netto" — wszystkie kwoty w zakładce Płatności są w netto
  // (konwencja systemowa: storage = netto, dopiski w UI dla jasności).
  return `${n.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} zł netto`;
}
