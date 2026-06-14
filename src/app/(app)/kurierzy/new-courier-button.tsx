"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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

import { createCourierAction } from "@/server/couriers";

export function NewCourierButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries());
    startTransition(async () => {
      try {
        const r = await createCourierAction(payload);
        toast.success("Dodano kuriera");
        setOpen(false);
        router.push(`/kurierzy/${r.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <Button type="button" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nowy kurier
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nowy kurier</DialogTitle>
          </DialogHeader>
          <form action={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa</Label>
              <Input
                id="name"
                name="name"
                required
                autoFocus
                placeholder="np. InPost, DPD, GLS"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="active" name="active" defaultChecked />
              <Label htmlFor="active">Aktywny</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notatki</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Anuluj
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Dodaję…" : "Dodaj"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
