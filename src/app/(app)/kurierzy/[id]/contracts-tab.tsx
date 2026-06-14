"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

import {
  addCourierContractAction,
  deleteCourierContractAction,
} from "@/server/couriers";

type Contract = {
  id: string;
  startsAt: Date;
  endsAt: Date | null;
  fileUrl: string | null;
  filename: string | null;
  notes: string | null;
};

export function ContractsTab({
  courierId,
  contracts,
}: {
  courierId: string;
  contracts: Contract[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Nowa umowa
        </Button>
      </div>

      {contracts.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          Brak umów. Dodaj pierwszą (z PDF).
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contracts.map((c) => (
            <ContractCard key={c.id} contract={c} />
          ))}
        </div>
      )}

      <NewContractDialog
        open={open}
        onClose={() => setOpen(false)}
        courierId={courierId}
      />
    </div>
  );
}

function ContractCard({ contract }: { contract: Contract }) {
  const [pending, startTransition] = useTransition();

  function del() {
    if (!confirm("Usunąć tę umowę?")) return;
    startTransition(async () => {
      try {
        await deleteCourierContractAction(contract.id);
        toast.success("Usunięto");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm">
          <div className="font-medium">
            {new Date(contract.startsAt).toLocaleDateString("pl-PL")}
            {" – "}
            {contract.endsAt
              ? new Date(contract.endsAt).toLocaleDateString("pl-PL")
              : "bezterminowo"}
          </div>
          {contract.notes && (
            <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
              {contract.notes}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={del}
          disabled={pending}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
      {contract.fileUrl && (
        <a
          href={contract.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonVariants({ variant: "outline", size: "sm" })} gap-2`}
        >
          <FileText className="size-3" />
          {contract.filename ?? "Pobierz PDF"}
          <Download className="size-3 ml-auto" />
        </a>
      )}
    </Card>
  );
}

function NewContractDialog({
  open,
  onClose,
  courierId,
}: {
  open: boolean;
  onClose: () => void;
  courierId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await addCourierContractAction(courierId, formData);
        toast.success("Dodano umowę");
        formRef.current?.reset();
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
          <DialogTitle>Nowa umowa</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startsAt">Od *</Label>
              <Input id="startsAt" name="startsAt" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endsAt">Do</Label>
              <Input id="endsAt" name="endsAt" type="date" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="file">Plik umowy (PDF)</Label>
            <Input id="file" name="file" type="file" accept=".pdf,application/pdf" />
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
