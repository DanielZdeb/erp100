"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateProductManualAction } from "@/server/product-manuals";

export function RenameInput({
  initialName,
  manualId,
}: {
  initialName: string;
  manualId: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();

  function commit() {
    if (name === initialName || !name.trim()) return;
    startTransition(async () => {
      try {
        await updateProductManualAction(manualId, { name });
        toast.success("Zmieniono nazwę");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
        setName(initialName);
      }
    });
  }

  return (
    <input
      type="text"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(ev) => ev.key === "Enter" && (ev.currentTarget.blur(), null)}
      disabled={pending}
      className="bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none px-1 -mx-1 transition-colors"
      placeholder="Nazwa instrukcji"
    />
  );
}
