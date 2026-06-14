"use client";

/**
 * Dialog „Przypnij produkty do pudełka" — uruchamiany z poziomu
 * BoxAssignmentsPopover. User wyszukuje produkty, wybiera kilka,
 * ustawia per-każdy unitsPerBox + purpose, klika „Przypnij" — i akcja
 * assignBoxToProductAction wykonuje się dla każdego.
 *
 * Produkty już przypięte do tego pudełka są wyszarzane na liście
 * (defensywnie — backend i tak rzuci błąd przy duplikacie).
 *
 * Dla pudełek isCollective + CHINA_STANDARD (mastery z Chin) dialog
 * pokazuje ostrzeżenie — bezpośrednie pinowanie zablokowane przez backend,
 * trzeba użyć relacji master→inner.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Box, Check, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { assignBoxToProductAction } from "@/server/shipping-boxes";

export type AttachProduct = {
  id: string;
  name: string;
  productCode: string;
};

type SelectedItem = {
  productId: string;
  productName: string;
  productCode: string;
  unitsPerBox: string;
  purpose: "SHIPPING" | "FACTORY";
};

export function AttachProductDialog({
  open,
  onOpenChange,
  boxId,
  boxName,
  boxIsCollective,
  boxOriginIsChina,
  /** Wszystkie produkty firmy. */
  allProducts,
  /** ID produktów aktualnie pinniętych — dla wyłączenia ich z wyboru. */
  pinnedProductIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boxId: string;
  boxName: string;
  boxIsCollective: boolean;
  boxOriginIsChina: boolean;
  allProducts: AttachProduct[];
  pinnedProductIds: Set<string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [pending, startTransition] = useTransition();

  const blockedByCollective = boxIsCollective && boxOriginIsChina;

  // Filtruj produkty wg query (po nazwie + SKU, case-insensitive).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedIds = new Set(selected.map((s) => s.productId));
    return allProducts
      .filter((p) => {
        if (selectedIds.has(p.id)) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.productCode.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [allProducts, query, selected]);

  function addProduct(p: AttachProduct) {
    setSelected((prev) => [
      ...prev,
      {
        productId: p.id,
        productName: p.name,
        productCode: p.productCode,
        unitsPerBox: "1",
        purpose: "FACTORY",
      },
    ]);
    setQuery("");
  }

  function removeFromSelection(id: string) {
    setSelected((prev) => prev.filter((s) => s.productId !== id));
  }

  function patchSelection(id: string, patch: Partial<SelectedItem>) {
    setSelected((prev) =>
      prev.map((s) => (s.productId === id ? { ...s, ...patch } : s)),
    );
  }

  function handleSubmit() {
    if (selected.length === 0) return;
    startTransition(async () => {
      let ok = 0;
      let fail = 0;
      const errors: string[] = [];
      for (const s of selected) {
        const upb = Math.max(1, Math.trunc(Number(s.unitsPerBox) || 1));
        try {
          await assignBoxToProductAction(s.productId, {
            boxId,
            purpose: s.purpose,
            unitsPerBox: upb,
            isPrimary: false,
            notes: null,
          });
          ok++;
        } catch (e) {
          fail++;
          errors.push(
            `${s.productCode}: ${e instanceof Error ? e.message : "błąd"}`,
          );
        }
      }
      if (ok > 0) toast.success(`Przypięto ${ok} produkt(ów)`);
      if (fail > 0) {
        toast.error(`Błędy (${fail}):\n${errors.slice(0, 3).join("\n")}`);
      }
      router.refresh();
      if (fail === 0) {
        setSelected([]);
        setQuery("");
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="size-4" />
            Przypnij produkty
          </DialogTitle>
          <DialogDescription>
            Pudełko:{" "}
            <span className="font-semibold text-foreground">{boxName}</span>
          </DialogDescription>
        </DialogHeader>

        {blockedByCollective && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
            <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-[12px] text-amber-900 leading-snug">
              To karton <b>ZBIORCZY z Chin (master)</b>. Mastery nie są pinowane
              bezpośrednio do produktu — produkt podpinasz do kartonu
              importowego (inner), a ten masterse łączysz przez relację
              master → inner z liczbą inner-ów. Skorzystaj z opcji „Master →
              inner" przy tym kartonie.
            </div>
          </div>
        )}

        {!blockedByCollective && (
          <>
            <div className="space-y-2">
              <Label htmlFor="attach-q" className="text-xs">
                Znajdź produkt
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  id="attach-q"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="nazwa lub SKU…"
                  className="pl-7 h-8 text-xs"
                  autoFocus
                />
              </div>
              {query.trim() && (
                <div className="max-h-[180px] overflow-y-auto border rounded-md divide-y">
                  {filtered.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-muted-foreground italic">
                      Brak wyników.
                    </div>
                  ) : (
                    filtered.map((p) => {
                      const isPinned = pinnedProductIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={isPinned}
                          onClick={() => addProduct(p)}
                          className={cn(
                            "w-full text-left px-2 py-1.5 text-[11px] hover:bg-indigo-50 transition-colors flex items-baseline justify-between gap-2",
                            isPinned && "opacity-40 cursor-not-allowed",
                          )}
                        >
                          <span className="truncate flex-1">{p.name}</span>
                          <code className="text-[10px] text-muted-foreground shrink-0">
                            {p.productCode}
                          </code>
                          {isPinned && (
                            <span className="text-[9px] text-emerald-600 shrink-0 inline-flex items-center gap-0.5">
                              <Check className="size-2.5" />
                              już przypięty
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selected.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">
                  Wybrane do przypięcia ({selected.length})
                </Label>
                <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1">
                  {selected.map((s) => (
                    <div
                      key={s.productId}
                      className="flex items-center gap-2 p-2 rounded-md bg-slate-50 border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">
                          {s.productName}
                        </div>
                        <code className="text-[10px] text-muted-foreground">
                          {s.productCode}
                        </code>
                      </div>
                      <div className="flex items-center gap-1">
                        <Label
                          htmlFor={`upb-${s.productId}`}
                          className="text-[10px] text-muted-foreground"
                        >
                          szt./karton
                        </Label>
                        <Input
                          id={`upb-${s.productId}`}
                          type="number"
                          min="1"
                          step="1"
                          value={s.unitsPerBox}
                          onChange={(e) =>
                            patchSelection(s.productId, {
                              unitsPerBox: e.target.value,
                            })
                          }
                          className="h-7 w-16 text-xs tabular-nums"
                        />
                      </div>
                      <Select
                        value={s.purpose}
                        onValueChange={(v) => {
                          if (v === "SHIPPING" || v === "FACTORY") {
                            patchSelection(s.productId, { purpose: v });
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 w-[110px] text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FACTORY" className="text-[11px]">
                            Z Chin (FACTORY)
                          </SelectItem>
                          <SelectItem value="SHIPPING" className="text-[11px]">
                            Wysyłkowe (SHIPPING)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => removeFromSelection(s.productId)}
                        className="size-6 grid place-items-center rounded text-rose-600 hover:bg-rose-100"
                        aria-label="Usuń z wyboru"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Anuluj
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              pending || selected.length === 0 || blockedByCollective
            }
          >
            {pending
              ? "Przypinam…"
              : selected.length > 0
                ? `Przypnij ${selected.length} produkt(ów)`
                : "Przypnij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
