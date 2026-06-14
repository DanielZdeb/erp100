"use client";

import { useState, useTransition } from "react";
import { Package, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  setCourierRecommendationAction,
  removeCourierRecommendationAction,
} from "@/server/couriers";

type Courier = {
  id: string;
  name: string;
  active: boolean;
};

type Recommendation = {
  id: string;
  priority: number;
  notes: string | null;
  courier: { id: string; name: string };
};

export function CouriersTab({
  productId,
  recommendations,
  allCouriers,
}: {
  productId: string;
  recommendations: Recommendation[];
  allCouriers: Courier[];
}) {
  const [open, setOpen] = useState(false);
  const usedIds = new Set(recommendations.map((r) => r.courier.id));
  const available = allCouriers.filter((c) => !usedIds.has(c.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Rekomendowany kurier dla tego produktu — używane do podpowiedzi przy
          wysyłce.
        </p>
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={available.length === 0}
          className="gap-2"
        >
          <Plus className="size-4" />
          Dodaj rekomendację
        </Button>
      </div>

      {recommendations.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {allCouriers.length === 0
            ? "Nie masz jeszcze żadnych kurierów. Dodaj kurierów w sekcji Kurierzy."
            : "Brak rekomendacji. Dodaj pierwszą."}
        </Card>
      ) : (
        <div className="space-y-2">
          {recommendations
            .sort((a, b) => a.priority - b.priority)
            .map((r) => (
              <RecommendationRow
                key={r.id}
                productId={productId}
                rec={r}
              />
            ))}
        </div>
      )}

      <AddDialog
        open={open}
        onClose={() => setOpen(false)}
        productId={productId}
        availableCouriers={available}
        currentCount={recommendations.length}
      />
    </div>
  );
}

function RecommendationRow({
  productId,
  rec,
}: {
  productId: string;
  rec: Recommendation;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`Usunąć rekomendację: ${rec.courier.name}?`)) return;
    startTransition(async () => {
      try {
        await removeCourierRecommendationAction(productId, rec.courier.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card className="p-3 flex items-center gap-3">
      <Package className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{rec.courier.name}</span>
          {rec.priority === 0 && (
            <Badge>preferowany</Badge>
          )}
        </div>
        {rec.notes && (
          <p className="text-xs text-muted-foreground mt-0.5">{rec.notes}</p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={remove}
        disabled={pending}
        aria-label="Usuń"
      >
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </Card>
  );
}

function AddDialog({
  open,
  onClose,
  productId,
  availableCouriers,
  currentCount,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  availableCouriers: Courier[];
  currentCount: number;
}) {
  const [courierId, setCourierId] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    if (!courierId) {
      toast.error("Wybierz kuriera");
      return;
    }
    const priority = Number(formData.get("priority") ?? currentCount);
    const notes = formData.get("notes");

    startTransition(async () => {
      try {
        await setCourierRecommendationAction(
          productId,
          courierId,
          priority,
          typeof notes === "string" ? notes : undefined,
        );
        toast.success("Dodano");
        setCourierId("");
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
          <DialogTitle>Nowa rekomendacja kuriera</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Kurier</Label>
            <Select value={courierId} onValueChange={(v) => setCourierId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz kuriera" />
              </SelectTrigger>
              <SelectContent>
                {availableCouriers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priorytet (0 = preferowany)</Label>
            <Input
              id="priority"
              name="priority"
              type="number"
              step="1"
              min="0"
              defaultValue={currentCount}
            />
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
              {pending ? "Dodaję…" : "Dodaj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
