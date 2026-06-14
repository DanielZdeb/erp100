"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Layers, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  deleteProductManualAction,
  duplicateProductManualAction,
} from "@/server/product-manuals";

import {
  AssignmentsEditDialog,
  type CategoryAssign,
  type CategoryOpt,
  type ProductOpt,
} from "./assignments-edit-dialog";

export function ManualRowActions({
  id,
  name,
  currentProductIds,
  currentCategoryAssigns,
  allProducts,
  allCategories,
}: {
  id: string;
  name: string;
  currentProductIds: string[];
  currentCategoryAssigns: CategoryAssign[];
  allProducts: ProductOpt[];
  allCategories: CategoryOpt[];
}) {
  const router = useRouter();
  const [copyOpen, setCopyOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [productIds, setProductIds] = useState<string[]>(currentProductIds);
  const [catAssigns, setCatAssigns] =
    useState<CategoryAssign[]>(currentCategoryAssigns);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();

  function openCopy() {
    setNewName(`${name} (kopia)`);
    setCopyOpen(true);
  }

  function submitCopy() {
    if (!newName.trim()) {
      toast.error("Podaj nazwę");
      return;
    }
    startTransition(async () => {
      try {
        const res = await duplicateProductManualAction(id, { newName });
        toast.success("Skopiowano — przechodzę do nowej kopii");
        setCopyOpen(false);
        router.push(`/produkty/instrukcje/${res.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  function remove() {
    if (!confirm(`Usunąć instrukcję „${name}"? Tej operacji nie da się cofnąć.`))
      return;
    startTransition(async () => {
      try {
        await deleteProductManualAction(id);
        toast.success("Usunięto instrukcję");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="size-7 rounded grid place-items-center text-slate-500 hover:bg-slate-100"
              aria-label="Opcje"
              disabled={pending}
            >
              <MoreVertical className="size-3.5" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setAssignOpen(true)}>
            <Layers className="size-3.5 mr-2" />
            Przypisz do produktów / kategorii
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openCopy}>
            <Copy className="size-3.5 mr-2" />
            Skopiuj instrukcję
          </DropdownMenuItem>
          <DropdownMenuItem onClick={remove} className="text-rose-600">
            <Trash2 className="size-3.5 mr-2" />
            Usuń
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AssignmentsEditDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        manualId={id}
        manualName={name}
        initialProductIds={productIds}
        initialCategoryAssigns={catAssigns}
        allProducts={allProducts}
        allCategories={allCategories}
        onSaved={(nextProductIds, nextCatAssigns) => {
          setProductIds(nextProductIds);
          setCatAssigns(nextCatAssigns);
          setAssignOpen(false);
          router.refresh();
        }}
      />

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Skopiuj instrukcję</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Nazwa nowej kopii</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nazwa instrukcji"
              autoFocus
              onKeyDown={(ev) => ev.key === "Enter" && submitCopy()}
            />
            <p className="text-[11px] text-muted-foreground">
              Kopia zawiera całą treść (strony, nagłówki, style) ale bez
              przypisań do produktów / kategorii — te uzupełnisz osobno.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCopyOpen(false)}
            >
              Anuluj
            </Button>
            <Button type="button" onClick={submitCopy} disabled={pending}>
              {pending ? "Kopiuję…" : "Skopiuj i otwórz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
