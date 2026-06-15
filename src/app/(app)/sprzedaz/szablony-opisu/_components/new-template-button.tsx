"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createDescriptionTemplateAction } from "@/server/description-templates";

export function NewDescriptionTemplateButton({
  variant = "default",
}: {
  variant?: "default" | "minimal";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) {
      toast.error("Podaj nazwę szablonu");
      return;
    }
    startTransition(async () => {
      try {
        const res = await createDescriptionTemplateAction({
          name: name.trim(),
        });
        toast.success("Utworzono szablon");
        setOpen(false);
        router.push(`/sprzedaz/szablony-opisu/${res.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć");
      }
    });
  }

  return (
    <>
      {variant === "minimal" ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Plus className="size-3.5" /> Nowy szablon
        </Button>
      ) : (
        <Button className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nowy szablon
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Nowy szablon opisu</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="tpl-name" className="text-sm">
            Nazwa szablonu
          </Label>
          <Input
            id="tpl-name"
            placeholder="np. Standard szarfa 6m"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <p className="text-[11px] text-slate-500">
            Sekcje (Hero front, Wymiary, Galeria...) dodasz w następnym kroku.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Tworzę..." : "Utwórz i edytuj"}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
