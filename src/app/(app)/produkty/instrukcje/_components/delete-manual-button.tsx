"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteProductManualAction } from "@/server/product-manuals";

export function DeleteManualButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="size-7 rounded grid place-items-center text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-40"
      aria-label="Usuń instrukcję"
      title="Usuń instrukcję"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}
