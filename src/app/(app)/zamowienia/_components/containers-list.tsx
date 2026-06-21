"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  Container,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  Plug,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateContainerLinkAction,
  deleteContainerLinkAction,
  fetchEtaFromMaerskAction,
} from "@/server/orders";

type ContainerLink = {
  id: string;
  containerNumber: string;
  url: string;
  etaDate: Date | null;
  etaSource: string | null;
};

type Slot =
  | { kind: "existing"; link: ContainerLink }
  | { kind: "placeholder"; index: number };

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function ContainersList({
  orderId,
  containerLinks,
  containerCount,
}: {
  orderId: string;
  containerLinks: ContainerLink[];
  containerCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Slot | null>(null);
  const [pending, startTransition] = useTransition();

  // Sloty = istniejace linki + placeholdery do dopelnienia containerCount.
  const total = Math.max(containerCount, containerLinks.length);
  const slots: Slot[] = [];
  for (let i = 0; i < total; i++) {
    if (i < containerLinks.length) {
      slots.push({ kind: "existing", link: containerLinks[i] });
    } else {
      slots.push({ kind: "placeholder", index: i });
    }
  }

  return (
    <>
      <div className="flex flex-col items-stretch gap-0.5 max-w-[220px] mx-auto">
        {slots.map((slot, idx) => (
          <ContainerRow
            key={slot.kind === "existing" ? slot.link.id : `ph-${idx}`}
            slot={slot}
            onEdit={() => setEditing(slot)}
          />
        ))}
      </div>

      {editing && (
        <ContainerEditDialog
          orderId={orderId}
          slot={editing}
          open={true}
          onClose={() => setEditing(null)}
          pending={pending}
          startTransition={startTransition}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function ContainerRow({
  slot,
  onEdit,
}: {
  slot: Slot;
  onEdit: () => void;
}) {
  if (slot.kind === "placeholder") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onEdit();
        }}
        className="rounded ring-1 ring-dashed ring-border bg-muted/10 hover:bg-muted/40 px-1 py-0.5 text-[9px] text-muted-foreground/80 flex items-center justify-center gap-0.5"
        title="Dodaj kontener"
      >
        <Pencil className="size-2" />
        dodaj
      </button>
    );
  }

  const { link } = slot;
  const hasNumber = link.containerNumber.length > 0;
  const hasUrl = link.url.length > 0;
  const days = daysUntil(link.etaDate);
  const isPast = days != null && days < 0;
  const isUrgent = days != null && days >= 0 && days <= 7;

  return (
    <div className="rounded ring-1 ring-slate-200 bg-white px-1.5 py-1 flex items-center gap-1.5 group/row leading-tight">
      <Container className="size-3 text-slate-500 shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {hasUrl && hasNumber ? (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-emerald-700 font-mono text-[10px] font-semibold truncate hover:underline"
            title={`Otwórz ${link.url}`}
          >
            {link.containerNumber}
          </a>
        ) : hasNumber ? (
          <span
            className="text-slate-700 font-mono text-[10px] truncate"
            title="Brak URL"
          >
            {link.containerNumber}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">—</span>
        )}
        {link.etaDate ? (
          <span className="shrink-0 ml-auto flex items-baseline gap-1.5">
            <span
              className={cn(
                "tabular-nums text-sm font-bold leading-none",
                isPast
                  ? "text-rose-600"
                  : isUrgent
                    ? "text-amber-700"
                    : "text-emerald-700",
              )}
              title={`ETA: ${link.etaDate.toLocaleDateString("pl-PL")}`}
            >
              {link.etaDate.toLocaleDateString("pl-PL", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
            {days != null && (
              <span
                className={cn(
                  "tabular-nums text-[10px] font-bold px-1.5 py-0.5 rounded-full ring-1 leading-none whitespace-nowrap",
                  isPast
                    ? "bg-rose-100 text-rose-800 ring-rose-300"
                    : isUrgent
                      ? "bg-amber-100 text-amber-800 ring-amber-300"
                      : "bg-emerald-100 text-emerald-800 ring-emerald-300",
                )}
                title={
                  isPast
                    ? `Opóźnienie ${Math.abs(days)} dni`
                    : days === 0
                      ? "Dziś"
                      : `Za ${days} dni`
                }
              >
                {isPast
                  ? `↓ ${Math.abs(days)}d`
                  : days === 0
                    ? "dziś"
                    : `+${days}d`}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/60 italic shrink-0 ml-auto text-[10px]">
            brak ETA
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onEdit();
        }}
        className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 opacity-0 group-hover/row:opacity-100 transition-opacity"
        title="Edytuj kontener"
      >
        <Pencil className="size-3" />
      </button>
    </div>
  );
}

function ContainerEditDialog({
  orderId,
  slot,
  open,
  onClose,
  pending,
  startTransition,
  onSaved,
}: {
  orderId: string;
  slot: Slot;
  open: boolean;
  onClose: () => void;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  onSaved: () => void;
}) {
  const existing = slot.kind === "existing" ? slot.link : null;
  const [containerNumber, setContainerNumber] = useState(
    existing?.containerNumber ?? "",
  );
  const [url, setUrl] = useState(existing?.url ?? "");
  const [etaDate, setEtaDate] = useState(toDateInput(existing?.etaDate ?? null));

  function save() {
    startTransition(async () => {
      try {
        await updateContainerLinkAction(existing?.id ?? null, orderId, {
          containerNumber,
          url,
          etaDate: etaDate || null,
        });
        toast.success("Zapisano kontener");
        onSaved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function remove() {
    if (!existing) return;
    startTransition(async () => {
      try {
        await deleteContainerLinkAction(existing.id, orderId);
        toast.success("Usunięto kontener");
        onSaved();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function fetchMaersk() {
    startTransition(async () => {
      const toastId = toast.loading("Pobieram ETA z Maersk...");
      try {
        const r = await fetchEtaFromMaerskAction(orderId);
        if (r.ok) {
          const warn = r.errors
            ? ` (${r.errors.length} z błędem)`
            : "";
          toast.success(
            `ETA zaktualizowane dla ${r.containers} kontener${r.containers === 1 ? "a" : "ów"}${warn}`,
            { id: toastId },
          );
          onSaved();
        } else {
          toast.error(r.error, { id: toastId });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd Maersk", {
          id: toastId,
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {existing ? "Edytuj kontener" : "Dodaj kontener"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label
                htmlFor="cn-input"
                className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                Numer kontenera
              </label>
              <Input
                id="cn-input"
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
                placeholder="MSKU1234567"
                className="font-mono"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="eta-input"
                className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                ETA
              </label>
              <Input
                id="eta-input"
                type="date"
                value={etaDate}
                onChange={(e) => setEtaDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label
              htmlFor="url-input"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              Link śledzenia (URL)
            </label>
            <Input
              id="url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.maersk.com/tracking/..."
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchMaersk}
            disabled={pending || !containerNumber.trim()}
            className="gap-1.5 w-full"
            title={
              !containerNumber.trim()
                ? "Wpisz numer kontenera"
                : "Pobierz ETA z Maersk API"
            }
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plug className="size-3.5" />
            )}
            Pobierz ETA z Maersk API
          </Button>
        </div>
        <DialogFooter className="gap-2">
          {existing && (
            <Button
              type="button"
              variant="outline"
              onClick={remove}
              disabled={pending}
              className="mr-auto gap-1 text-rose-700"
            >
              <Trash2 className="size-3.5" />
              Usuń
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
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
  );
}
