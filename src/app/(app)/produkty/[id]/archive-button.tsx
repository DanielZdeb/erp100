"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { archiveProductAction } from "@/server/products";

export function ArchiveButton({
  id,
  archived,
}: {
  id: string;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      try {
        await archiveProductAction(id, !archived);
        toast.success(archived ? "Przywrócono produkt" : "Zarchiwizowano produkt");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      onClick={onClick}
      disabled={pending}
    >
      {archived ? (
        <>
          <ArchiveRestore className="size-4" />
          Przywróć
        </>
      ) : (
        <>
          <Archive className="size-4" />
          Archiwizuj
        </>
      )}
    </Button>
  );
}
