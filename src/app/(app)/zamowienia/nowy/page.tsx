import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewOrderForm } from "./new-order-form";
import { getDefaultContainerType } from "@/server/system-settings";

export const dynamic = "force-dynamic";

export default async function NowyOrderPage() {
  const defaultContainerType = await getDefaultContainerType();
  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/zamowienia"
          className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          Zamówienia
        </Link>
        <h1 className="text-3xl font-heading font-bold tracking-tight mt-1">
          Nowe zamówienie
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Najpierw nagłówek — kursy walut, typ kontenera. Pozycje, koszty i
          kalkulacje dodasz po utworzeniu.
        </p>
      </div>
      <NewOrderForm defaultContainerType={defaultContainerType} />
    </div>
  );
}
