"use client";

import { useState, useTransition } from "react";
import { Check, Link2, Link2Off, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { updateOrderMetaAction } from "@/server/orders";

export function OrderNumberCell({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(orderNumber);

  function save() {
    const next = value.trim();
    if (!next || next === orderNumber) {
      setEditing(false);
      setValue(orderNumber);
      return;
    }
    startTransition(async () => {
      try {
        await updateOrderMetaAction(orderId, { orderNumber: next });
        toast.success(`Numer: ${next}`);
        setEditing(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
        setValue(orderNumber);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(orderNumber);
              setEditing(false);
            }
          }}
          onBlur={save}
          className="h-7 w-28 text-xs font-medium"
          disabled={pending}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditing(true);
      }}
      className="inline-flex items-center gap-1 font-medium hover:underline group"
      title="Kliknij aby edytować numer"
    >
      <span>{orderNumber}</span>
      <Pencil className="size-3 opacity-0 group-hover:opacity-50 transition-opacity" />
    </button>
  );
}

export function TrackingCell({
  orderId,
  trackingUrl,
}: {
  orderId: string;
  trackingUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(trackingUrl ?? "");

  const hasLink = !!trackingUrl;

  function save(newValue: string | null) {
    startTransition(async () => {
      try {
        await updateOrderMetaAction(orderId, { trackingUrl: newValue });
        toast.success(newValue ? "Zapisano link" : "Usunięto link");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(trackingUrl ?? "");
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors",
          hasLink
            ? "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200"
            : "bg-muted text-muted-foreground ring-border hover:bg-background hover:text-foreground",
        )}
        title={hasLink ? "Link śledzenia ustawiony — kliknij aby edytować" : "Dodaj link śledzenia"}
      >
        {hasLink ? (
          <Check className="size-3" strokeWidth={3} />
        ) : (
          <Link2Off className="size-3" />
        )}
        Link śledzenia
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link śledzenia kontenera</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tracking-url">URL</Label>
            <Input
              id="tracking-url"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="https://www.maersk.com/tracking/..."
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Link nie wyświetla się publicznie — pokazujemy tylko czy jest
              uzupełniony. Klikając badge możesz otworzyć ten dialog z URL.
            </p>
            {hasLink && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Link2 className="size-3" />
                Otwórz w nowej karcie
              </a>
            )}
          </div>
          <DialogFooter className="gap-2">
            {hasLink && (
              <Button
                type="button"
                variant="outline"
                onClick={() => save(null)}
                disabled={pending}
                className="mr-auto gap-1"
              >
                <X className="size-3.5" />
                Usuń link
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
              onClick={() => save(value.trim() || null)}
              disabled={pending}
            >
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
