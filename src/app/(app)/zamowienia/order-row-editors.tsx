"use client";

import { useState, useTransition } from "react";
import { Container, Link2, Link2Off, Pencil, Plus, Trash2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

import {
  updateOrderMetaAction,
  replaceContainerLinksAction,
} from "@/server/orders";

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

type ContainerLink = {
  id: string;
  containerNumber: string;
  url: string;
};

export function TrackingCell({
  orderId,
  legacyTrackingUrl,
  containerLinks,
}: {
  orderId: string;
  legacyTrackingUrl: string | null;
  containerLinks: ContainerLink[];
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Stan edycji: kazdy rzad = {containerNumber, url}; nowo dodawane bez id
  const [rows, setRows] = useState<Array<{ containerNumber: string; url: string }>>([]);

  function openDialog() {
    const initial =
      containerLinks.length > 0
        ? containerLinks.map((l) => ({
            containerNumber: l.containerNumber,
            url: l.url,
          }))
        : legacyTrackingUrl
          ? [{ containerNumber: "", url: legacyTrackingUrl }]
          : [{ containerNumber: "", url: "" }];
    setRows(initial);
    setOpen(true);
  }

  function save() {
    startTransition(async () => {
      try {
        const valid = rows.filter(
          (r) => r.containerNumber.trim() && r.url.trim(),
        );
        await replaceContainerLinksAction(orderId, valid);
        toast.success(
          valid.length > 0
            ? `Zapisano ${valid.length} link${valid.length === 1 ? "" : "i"}`
            : "Usunięto wszystkie linki",
        );
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  const hasAny = containerLinks.length > 0 || !!legacyTrackingUrl;

  return (
    <>
      {containerLinks.length === 0 ? (
        <button
          type="button"
          onClick={openDialog}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors",
            hasAny
              ? "bg-emerald-100 text-emerald-800 ring-emerald-200 hover:bg-emerald-200"
              : "bg-muted text-muted-foreground ring-border hover:bg-background hover:text-foreground",
          )}
          title={
            legacyTrackingUrl
              ? "Stary, jeden link bez numeru kontenera — kliknij aby uzupełnić numery"
              : "Dodaj link śledzenia kontenera"
          }
        >
          {hasAny ? (
            <Link2 className="size-3" />
          ) : (
            <Link2Off className="size-3" />
          )}
          {legacyTrackingUrl ? "Link (bez nr)" : "Link śledzenia"}
        </button>
      ) : (
        <div className="flex flex-col items-stretch gap-1 max-w-[160px] mx-auto">
          {containerLinks.map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100 px-2 py-0.5 text-[10px] font-mono font-semibold tabular-nums truncate"
              title={`Otwórz ${l.url}`}
            >
              <Container className="size-3 shrink-0" />
              <span className="truncate">{l.containerNumber}</span>
            </a>
          ))}
          <button
            type="button"
            onClick={openDialog}
            className="inline-flex items-center justify-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 ring-1 ring-border ring-dashed"
          >
            <Pencil className="size-2.5" />
            edytuj
          </button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Linki śledzenia kontenerów</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_2fr_auto] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1">
              <span>Numer kontenera</span>
              <span>URL śledzenia</span>
              <span></span>
            </div>
            {rows.map((row, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[1fr_2fr_auto] gap-2 items-center"
              >
                <Input
                  value={row.containerNumber}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, i) =>
                        i === idx
                          ? { ...r, containerNumber: e.target.value }
                          : r,
                      ),
                    )
                  }
                  placeholder="MSKU1234567"
                  className="h-8 text-xs font-mono"
                />
                <Input
                  value={row.url}
                  onChange={(e) =>
                    setRows((rs) =>
                      rs.map((r, i) =>
                        i === idx ? { ...r, url: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="https://..."
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0 text-muted-foreground hover:text-red-600"
                  onClick={() =>
                    setRows((rs) => rs.filter((_, i) => i !== idx))
                  }
                  disabled={pending}
                  title="Usuń ten wiersz"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((rs) => [...rs, { containerNumber: "", url: "" }])
              }
              disabled={pending}
              className="w-full gap-1 text-xs"
            >
              <Plus className="size-3.5" />
              Dodaj kontener
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Wpisz numer kontenera + URL trackingu armatora. Puste wiersze są
              pomijane. Numery wyświetlają się w liście jako klikalne badges.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Anuluj
            </Button>
            <Button type="button" onClick={save} disabled={pending}>
              Zapisz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
