"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  addPriceHistoryAction,
  deletePriceHistoryAction,
} from "@/server/product-media";

type PriceEntry = {
  id: string;
  recordedAt: Date;
  factoryPriceUsd: number | null;
  factoryPriceCny: number | null;
  factoryPricePln: number | null;
  landedCostPln: number | null;
  cbmPerUnit: number | null;
  notes: string | null;
};

export function PriceHistoryTab({
  productId,
  entries,
}: {
  productId: string;
  entries: PriceEntry[];
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Historia cen — koszt fabryczny + koszt z transportem (po alokacji
          kosztów kontenera przez CBM). Nowe wpisy z zamówień importowych będą
          dodawane automatycznie.
        </p>
        <Button
          type="button"
          className="gap-2"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="size-4" />
          Dodaj wpis
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak wpisów cenowych.
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Cena fabryczna</TableHead>
                <TableHead className="text-right">Landed (PLN)</TableHead>
                <TableHead className="text-right">CBM/szt</TableHead>
                <TableHead>Notatki</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <PriceRow key={e.id} entry={e} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AddPriceDialog
        productId={productId}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}

function PriceRow({ entry }: { entry: PriceEntry }) {
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm("Usunąć ten wpis?")) return;
    startTransition(async () => {
      try {
        await deletePriceHistoryAction(entry.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        {new Date(entry.recordedAt).toLocaleDateString("pl-PL")}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <FactoryPrice entry={entry} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {entry.landedCostPln != null
          ? `${entry.landedCostPln.toFixed(2)} zł`
          : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {entry.cbmPerUnit != null ? entry.cbmPerUnit.toFixed(4) : "—"}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
        {entry.notes ?? "—"}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={pending}
          aria-label="Usuń"
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function FactoryPrice({ entry }: { entry: PriceEntry }) {
  if (entry.factoryPricePln != null) return <>{entry.factoryPricePln.toFixed(2)} zł</>;
  if (entry.factoryPriceUsd != null) return <>{entry.factoryPriceUsd.toFixed(2)} $</>;
  if (entry.factoryPriceCny != null) return <>¥ {entry.factoryPriceCny.toFixed(2)}</>;
  return <>—</>;
}

function AddPriceDialog({
  productId,
  open,
  onClose,
}: {
  productId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    startTransition(async () => {
      try {
        await addPriceHistoryAction(productId, payload);
        toast.success("Dodano wpis");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj wpis cenowy</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recordedAt">Data</Label>
            <Input
              id="recordedAt"
              name="recordedAt"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="factoryPriceCny" className="text-xs">
                Cena fabryczna ¥
              </Label>
              <Input
                id="factoryPriceCny"
                name="factoryPriceCny"
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factoryPriceUsd" className="text-xs">
                Cena fabryczna $
              </Label>
              <Input
                id="factoryPriceUsd"
                name="factoryPriceUsd"
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factoryPricePln" className="text-xs">
                Cena fabryczna zł
              </Label>
              <Input
                id="factoryPricePln"
                name="factoryPricePln"
                type="number"
                step="0.01"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="landedCostPln">Landed cost (PLN)</Label>
              <Input
                id="landedCostPln"
                name="landedCostPln"
                type="number"
                step="0.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cbmPerUnit">CBM / sztuka</Label>
              <Input
                id="cbmPerUnit"
                name="cbmPerUnit"
                type="number"
                step="0.0001"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notatki</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisuję…" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
