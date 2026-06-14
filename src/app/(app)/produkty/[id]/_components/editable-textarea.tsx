"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { updateProductTextFieldAction } from "@/server/products";

type TextField =
  | "productionGuidelines"
  | "importGuidelines"
  | "userManual"
  | "shopDescription"
  | "internalNotes"
  | "factoryBoxNotes";

/**
 * Inline-edytowalny textarea — auto-save na blur. Wyświetla mały badge
 * ze statusem (Zapisano / Zapisywanie...).
 */
export function EditableTextarea({
  productId,
  field,
  initialValue,
  placeholder,
  rows = 6,
}: {
  productId: string;
  field: TextField;
  initialValue: string | null;
  placeholder?: string;
  rows?: number;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync gdy initialValue się zmieni (np. revalidate parent)
  useEffect(() => {
    setValue(initialValue ?? "");
  }, [initialValue]);

  function commit() {
    const next = value.trim();
    const original = (initialValue ?? "").trim();
    if (next === original) return;
    startTransition(async () => {
      try {
        await updateProductTextFieldAction(
          productId,
          field,
          next === "" ? null : next,
        );
        setSavedAt(Date.now());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  const showSaved = savedAt != null && Date.now() - savedAt < 3000;

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        rows={rows}
        className="resize-y font-mono text-xs"
      />
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {pending && (
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            Zapisywanie…
          </span>
        )}
        {!pending && showSaved && (
          <span
            className={cn(
              "text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
            )}
          >
            <Check className="size-3" />
            Zapisano
          </span>
        )}
      </div>
    </div>
  );
}
