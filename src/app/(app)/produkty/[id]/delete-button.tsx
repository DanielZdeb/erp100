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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  const noun = isComponent ? "komponent" : "produkt";

  function handleDelete() {
    if (confirm.trim() !== name) {
      toast.error("Nazwa nie zgadza się — wpisz dokładnie nazwę produktu.");
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
          if (!o) setConfirm("");
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
            <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-xs text-amber-900">
              Jeżeli {noun} pojawił się już w zamówieniu albo jest komponentem
              innego produktu — usunięcie zostanie odrzucone. W takim wypadku
              zarchiwizuj zamiast usuwać.
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-name" className="text-xs">
                Wpisz dokładnie{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                  {name}
                </code>
                , aby potwierdzić
              </Label>
              <Input
                id="confirm-name"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={name}
                autoFocus
                autoComplete="off"
              />
            </div>
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
              disabled={pending || confirm.trim() !== name}
            >
              {pending ? "Usuwam…" : `Usuń ${noun}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
