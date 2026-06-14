"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";

import { createProductManualAction } from "@/server/product-manuals";

type ManualKind = "STANDARD" | "LEAFLET";

export function NewManualButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ManualKind>("STANDARD");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) {
      toast.error("Podaj nazwę instrukcji");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createProductManualAction({ name, kind });
        toast.success("Utworzono — przechodzę do edycji");
        setOpen(false);
        setName("");
        setKind("STANDARD");
        router.push(`/produkty/instrukcje/${res.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="size-4" />
        Nowa instrukcja
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nowa instrukcja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="manual-name">Nazwa</Label>
              <Input
                id="manual-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. Instrukcja mocowania szarf"
                autoFocus
                onKeyDown={(ev) => ev.key === "Enter" && submit()}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-slate-600">
                Typ instrukcji
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <KindCard
                  active={kind === "STANDARD"}
                  onClick={() => setKind("STANDARD")}
                  icon={BookOpen}
                  title="Standardowa"
                  description="Wielostronicowa: okładka + spis treści + treść + Ostatnia. Multi-język w sekcjach."
                />
                <KindCard
                  active={kind === "LEAFLET"}
                  onClick={() => setKind("LEAFLET")}
                  icon={FileText}
                  title="1-stronna (ulotka)"
                  description="Okładka + 1 strona treści per język. Bez spisu treści, wyrównania i Ostatniej."
                />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Po utworzeniu otworzymy edytor — możesz tam dodać treść,
              przypisać do produktów lub kategorii.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Anuluj
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Tworzę…" : "Utwórz i otwórz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KindCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-md ring-1 px-3 py-2.5 space-y-1 transition-all",
        active
          ? "ring-indigo-400 bg-indigo-50/50 shadow-sm"
          : "ring-slate-200 hover:bg-slate-50",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-sm font-semibold",
          active ? "text-indigo-700" : "text-slate-700",
        )}
      >
        <Icon className="size-3.5" />
        {title}
      </div>
      <div className="text-[10px] text-muted-foreground leading-tight">
        {description}
      </div>
    </button>
  );
}
