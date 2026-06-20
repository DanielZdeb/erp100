"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { recomputeOrderProductsAction } from "@/server/orders";

export function RecomputeProductsButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const toastId = toast.loading("Przeliczam ekonomikę produktów...");
      try {
        const r = await recomputeOrderProductsAction(orderId);
        if (r.ok) {
          toast.success(r.message, { id: toastId });
          router.refresh();
        } else {
          toast.warning(r.message, { id: toastId });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się", {
          id: toastId,
        });
      }
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={run}
      disabled={pending}
      className="gap-1.5 ring-1 ring-indigo-200 text-indigo-700 hover:bg-indigo-50"
      title="Wymuś ponowne policzenie ceny zakupu + logistyki + cła per pozycja na podstawie aktualnych danych (np. po update'cie cbmPerUnit komponentu)"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Calculator className="size-3.5" />
      )}
      Przelicz produkty
    </Button>
  );
}
