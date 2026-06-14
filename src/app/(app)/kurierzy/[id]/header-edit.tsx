"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import {
  updateCourierAction,
  deleteCourierAction,
} from "@/server/couriers";

type Courier = {
  id: string;
  name: string;
  active: boolean;
  notes: string | null;
};

export function CourierHeaderEdit({ courier }: { courier: Courier }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    startTransition(async () => {
      try {
        await updateCourierAction(courier.id, payload);
        toast.success("Zapisano");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function onDelete() {
    if (!confirm(`Usunąć kuriera ${courier.name}?`)) return;
    startTransition(async () => {
      try {
        await deleteCourierAction(courier.id);
        toast.success("Usunięto");
        router.push("/kurierzy");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => setOpen(true)}
        >
          <Pencil className="size-4" />
          Edytuj
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={onDelete}
          disabled={pending}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edytuj kuriera</DialogTitle>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa</Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={courier.name}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="active" name="active" defaultChecked={courier.active} />
              <Label htmlFor="active">Aktywny</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notatki</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={courier.notes ?? ""} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Zapisuję…" : "Zapisz"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
