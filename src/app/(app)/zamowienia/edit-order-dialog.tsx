"use client";

/**
 * Modal edycji podstawowych danych zamówienia — używany na liście zamówień
 * (np. /zamowienia/z-polski). Edytuje: numer zamówienia, nazwę i notatki.
 * Status zmieniany jest workflow'em w widoku zamówienia (nie tutaj).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

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
import {
  updateOrderHeaderAction,
  updateOrderMetaAction,
} from "@/server/orders";

export type EditableOrder = {
  id: string;
  orderNumber: string;
  name: string | null;
  notes: string | null;
};

export function EditOrderRowButton({ order }: { order: EditableOrder }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7"
        onClick={() => setOpen(true)}
        title="Edytuj zamówienie"
      >
        <Pencil className="size-3.5 text-slate-600" />
      </Button>
      {open && (
        <EditOrderDialog
          order={order}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

function EditOrderDialog({
  order,
  open,
  onOpenChange,
}: {
  order: EditableOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState(order.orderNumber);
  const [name, setName] = useState(order.name ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [pending, startTransition] = useTransition();

  const orderNumberDirty = orderNumber.trim() !== order.orderNumber;
  const nameDirty = name.trim() !== (order.name ?? "");
  const notesDirty = notes !== (order.notes ?? "");
  const dirty = orderNumberDirty || nameDirty || notesDirty;

  function save() {
    if (!orderNumber.trim()) {
      toast.error("Numer nie może być pusty.");
      return;
    }
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      try {
        // Numer zamówienia ma osobną akcję (z unikalnością w obrębie firmy).
        if (orderNumberDirty) {
          await updateOrderMetaAction(order.id, {
            orderNumber: orderNumber.trim(),
          });
        }
        // Reszta przez updateOrderHeaderAction (nazwa, notatki).
        if (nameDirty || notesDirty) {
          await updateOrderHeaderAction(order.id, {
            name: name.trim() || null,
            notes: notes || null,
          });
        }
        toast.success("Zapisano zamówienie");
        router.refresh();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-md">
        <DialogHeader>
          <DialogTitle>Edytuj zamówienie</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="orderNumber" className="text-xs font-medium">
              Numer zamówienia
              <span className="text-rose-500 ml-0.5">*</span>
            </Label>
            <Input
              id="orderNumber"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              className="font-mono text-sm"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-medium">
              Nazwa zamówienia
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Wiosenna kolekcja 2026"
              className="text-sm"
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-medium">
              Notatki
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Wewnętrzne notatki dotyczące zamówienia"
              rows={3}
              className="text-sm"
              disabled={pending}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Status zamówienia zmieniasz workflow'em w widoku zamówienia
            (Planowane → Dogadywane → Produkowane …). Tutaj edytujesz tylko
            metadane.
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={pending || !orderNumber.trim()}
          >
            {pending ? "Zapisuję…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
