"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * "Odśwież ceny" — wymusza `router.refresh()` (re-fetch server components),
 * co ponownie odczytuje ceny z bazy. Strona /produkty jest force-dynamic,
 * więc nie ma tu Next-cache do invalidacji, ale F5/router.refresh() gwarantuje
 * że renderujemy się na najnowszym stanie DB (ImportOrder items, snapshoty).
 *
 * Cel: user ma pewność że widzi najnowsze dane, bez pełnego przeładowania
 * strony (window.location.reload = utrata scrolla, przewinięć w drawer'ach).
 */
export function RefreshPricesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      router.refresh();
      // router.refresh nie zwraca Promise — pokazujemy toast od razu.
      // Przy większych repo'ach re-render zajmie moment, ale user widzi
      // "Odświeżono" i wie że akcja poszła.
      toast.success("Odświeżono ceny", {
        description: "Wczytano najnowsze dane z bazy.",
      });
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      title="Wymuś ponowne wczytanie cen z bazy (ostatnie zamówienia importowe)"
    >
      <RefreshCw
        className={pending ? "size-4 animate-spin" : "size-4"}
      />
      Odśwież ceny
    </Button>
  );
}
