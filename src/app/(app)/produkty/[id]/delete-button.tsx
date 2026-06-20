"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { deleteProductAction } from "@/server/products";

export function DeleteProductButton({
  id,
  name,
  isComponent,
}: {
  id: string;
  name: string;
  isComponent: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Dwa kroki potwierdzenia: pierwszy klik = step 1 (ostrzezenie),
  // drugi klik = step 2 (zielone swiatlo). User nie musi nic wpisywac.
  const [step, setStep] = useState<1 | 2>(1);
  const [pending, startTransition] = useTransition();

  const noun = isComponent ? "komponent" : "produkt";

  function handleDelete() {
    if (step === 1) {
      setStep(2);
      return;
    }
    startTransition(async () => {
      try {
        await deleteProductAction(id);
        toast.success(
          isComponent ? "Usunięto komponent" : "Usunięto produkt",
        );
        router.push("/produkty");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
        Usuń
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setStep(1);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usuń {noun}</DialogTitle>
            <DialogDescription>
              Tej operacji <strong>nie da się cofnąć</strong>. Usunięte zostaną
              wszystkie dane tego {noun}a (grafiki, pliki, etapy, historia cen,
              powiązania z kategoriami i kurierami).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 ring-1 ring-border px-3 py-2 text-xs">
              <span className="text-muted-foreground">Produkt:</span>{" "}
              <span className="font-semibold">{name}</span>
            </div>
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900">
              Jeżeli {noun} pojawił się już w zamówieniu albo jest komponentem
              innego produktu — usunięcie zostanie odrzucone. W takim wypadku
              zarchiwizuj zamiast usuwać.
            </div>
            {step === 2 && (
              <div className="rounded-md bg-rose-50 ring-1 ring-rose-300 px-3 py-2 text-xs text-rose-900 font-medium">
                Na pewno usunąć? Kliknij jeszcze raz „Usuń" aby potwierdzić.
              </div>
            )}
          </div>

          <DialogFooter>
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
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending
                ? "Usuwam…"
                : step === 1
                  ? `Usuń ${noun}`
                  : "Potwierdzam — usuń"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
