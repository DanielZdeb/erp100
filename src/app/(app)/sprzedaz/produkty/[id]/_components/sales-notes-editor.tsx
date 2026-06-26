"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { updateProductSalesNotesAction } from "@/server/description-templates";

/**
 * Notatki sprzedażowe produktu — wolny tekst od operatora.
 * Trafia do każdego promptu AI w sales-card-editor jako kontekst.
 * Auto-save na blur (debounce niepotrzebny — pole rzadko edytowane).
 */
export function SalesNotesEditor({
  productId,
  initialNotes,
}: {
  productId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [savedValue, setSavedValue] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = value !== savedValue;

  function save() {
    if (!dirty || pending) return;
    const toSave = value;
    startTransition(async () => {
      try {
        await updateProductSalesNotesAction(productId, toSave);
        setSavedValue(toSave);
        toast.success("Notatki zapisane");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700 flex items-center gap-2">
          <StickyNote className="size-4 text-amber-600" />
          Notatki o produkcie
          <span className="text-[10px] font-normal normal-case text-slate-500">
            · dodawane do każdego promptu AI generującego opis
          </span>
        </h2>
        <div className="flex items-center gap-2 text-[11px]">
          {pending ? (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Loader2 className="size-3 animate-spin" />
              Zapis...
            </span>
          ) : dirty ? (
            <span className="text-amber-700 font-medium">
              Niezapisane zmiany
            </span>
          ) : initialNotes != null && initialNotes.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Check className="size-3" />
              Zapisane
            </span>
          ) : null}
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        placeholder={`Wpisz co warto wiedzieć o tym produkcie — AI weźmie to pod uwagę przy generowaniu opisu.\n\nNp.:\n- Materiał: tkanina velvet, łatwo czyszcząca się\n- Obciążenie do 120 kg\n- Wymiary siedziska: 45 x 42 cm\n- Atut: oparcie ergonomiczne, idealne do długiej pracy biurowej\n- Grupa docelowa: kuchnia, jadalnia, biuro w domu`}
        rows={8}
        className="text-sm leading-relaxed font-normal resize-y min-h-[160px]"
      />
      <p className="text-[10px] text-slate-500">
        Zmiany zapisują się automatycznie po wyjściu z pola.
      </p>
    </Card>
  );
}
