"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  addProductComponentAction,
  removeProductComponentAction,
  updateProductComponentAction,
} from "@/server/product-components";
import { cn } from "@/lib/utils";

type Component = {
  id: string;
  quantity: number;
  notes: string | null;
  component: {
    id: string;
    name: string;
    productCode: string;
    images: { url: string; alt: string | null }[];
  };
};

type ProductOption = {
  id: string;
  name: string;
  productCode: string;
};

export function ComponentsTab({
  productId,
  components,
  availableProducts,
}: {
  productId: string;
  components: Component[];
  availableProducts: ProductOption[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);

  const usedIds = new Set(components.map((c) => c.component.id));
  const candidates = availableProducts.filter(
    (p) => p.id !== productId && !usedIds.has(p.id),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Komponenty z których składa się ten produkt. Każdy komponent to też
          produkt w katalogu (z własnym kodem Code 128).
        </p>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="gap-2"
          disabled={candidates.length === 0}
        >
          <Plus className="size-4" />
          Dodaj komponent
        </Button>
      </div>

      {components.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground space-y-3">
          <div>Ten produkt nie ma jeszcze komponentów.</div>
          <Link
            href="/produkty/nowy"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
          >
            <Plus className="size-3" />
            Utwórz nowy produkt jako komponent
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {components.map((c) => (
            <ComponentCard
              key={c.id}
              component={c}
              onEdit={() => setEditing(c)}
            />
          ))}
        </div>
      )}

      <AddComponentDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        productId={productId}
        candidates={candidates}
      />
      <EditComponentDialog
        component={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function ComponentCard({
  component,
  onEdit,
}: {
  component: Component;
  onEdit: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onRemove() {
    if (!confirm(`Usunąć komponent: ${component.component.name}?`)) return;
    startTransition(async () => {
      try {
        await removeProductComponentAction(component.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card className="p-3 flex items-start gap-3">
      {component.component.images[0]?.url ? (
        <div className="relative size-14 rounded overflow-hidden bg-muted shrink-0">
          <Image
            src={component.component.images[0].url}
            alt={component.component.images[0].alt ?? component.component.name}
            fill
            sizes="56px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="size-14 rounded bg-muted shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <Link
          href={`/produkty/${component.component.id}`}
          className="font-medium text-sm hover:underline"
        >
          {component.component.name}
        </Link>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
          <code>{component.component.productCode}</code>
          <Badge variant="secondary" className="text-[10px]">
            × {component.quantity}
          </Badge>
        </div>
        {component.notes && (
          <p className="text-xs text-muted-foreground italic mt-1">
            {component.notes}
          </p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={pending}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </Card>
  );
}

function AddComponentDialog({
  open,
  onClose,
  productId,
  candidates,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  candidates: ProductOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [componentId, setComponentId] = useState("");

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    payload.componentId = componentId;
    if (!componentId) {
      toast.error("Wybierz produkt");
      return;
    }
    startTransition(async () => {
      try {
        await addProductComponentAction(productId, payload);
        toast.success("Dodano komponent");
        setComponentId("");
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
          <DialogTitle>Dodaj komponent</DialogTitle>
        </DialogHeader>
        <form action={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Komponent (produkt z katalogu)</Label>
            <Select
              value={componentId}
              onValueChange={(v) => setComponentId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Wybierz produkt z katalogu" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.productCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Brakuje produktu?{" "}
              <Link
                href="/produkty/nowy"
                className="underline"
                target="_blank"
              >
                Utwórz nowy
              </Link>{" "}
              i wróć tutaj.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Ilość (sztuk komponentu na 1 produkt)</Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              step="1"
              min="1"
              defaultValue="1"
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

function EditComponentDialog({
  component,
  onClose,
}: {
  component: Component | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={component !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {component && (
          <EditComponentForm
            key={component.id}
            component={component}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditComponentForm({
  component,
  onClose,
}: {
  component: Component;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    startTransition(async () => {
      try {
        await updateProductComponentAction(component.id, payload);
        toast.success("Zapisano");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edytuj: {component.component.name}</DialogTitle>
      </DialogHeader>
      <form action={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">Ilość</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="1"
            min="1"
            defaultValue={component.quantity}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notatki</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={component.notes ?? ""}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Zapisuję…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
