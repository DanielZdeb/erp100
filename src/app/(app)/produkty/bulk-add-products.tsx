"use client";

import { useState, useTransition } from "react";
import { Mail, Package, Plus, RefreshCw, Rows3, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { cbmFromBox, cbmFromBulk } from "@/lib/kalkulacje";

import {
  createProductAction,
  generateCode128ForCategoryAction,
} from "@/server/products";
import { assignBoxToProductAction } from "@/server/shipping-boxes";

import {
  CategoryTreeSelect,
  type CategoryTreeNode,
} from "./category-tree-select";
import type { BoxOption } from "./[id]/boxes-tab";

type CompositionMode = "CALOSCIOWY" | "KOMPONENTOWY";
type ImportMode = "KARTON" | "LUZEM";
type PurchaseCurrency = "USD" | "CNY";

type WizardRates = {
  usd: number | null;
  cny: number | null;
  rateDate: string | null;
};

type PackagingKind = "SHIPPING_BOX" | "FOLIOPAK" | "FACTORY";

type RowState = {
  id: string; // local uid
  categoryId: string | null;
  productCode: string;
  name: string;
  code128: string;
  compositionMode: CompositionMode;
  // Pakowanie — jedna pozycja per wiersz (jeden z trzech typów + box ID)
  packagingKind: PackagingKind | null;
  packagingBoxId: string | null;
  weightKg: string;
  importMode: ImportMode;
  unitsPerBox: string;
  unitsPerContainer: string;
  customsDutyPct: string;
  purchaseCurrency: PurchaseCurrency;
  purchasePriceAmount: string;
  defaultSalePriceAllegroPln: string;
  defaultSalePriceShopPln: string;
};

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `r${uidCounter}_${Date.now()}`;
}

function makeEmptyRow(defaultContainerM3: number): RowState {
  void defaultContainerM3;
  return {
    id: uid(),
    categoryId: null,
    productCode: "",
    name: "",
    code128: "",
    compositionMode: "CALOSCIOWY",
    packagingKind: null,
    packagingBoxId: null,
    weightKg: "",
    importMode: "KARTON",
    unitsPerBox: "1",
    unitsPerContainer: "",
    customsDutyPct: "",
    purchaseCurrency: "USD",
    purchasePriceAmount: "",
    defaultSalePriceAllegroPln: "",
    defaultSalePriceShopPln: "",
  };
}

export function BulkAddProductsDialog({
  open,
  onOpenChange,
  categories,
  categoryDutyMap,
  availableBoxes,
  rates,
  defaultContainerM3,
  defaultIsComponent,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: CategoryTreeNode[];
  categoryDutyMap: Record<string, number | null>;
  availableBoxes: BoxOption[];
  rates: WizardRates;
  defaultContainerM3: number;
  defaultIsComponent: boolean;
  onCreated: () => void;
}) {
  const [rows, setRows] = useState<RowState[]>(() => [
    makeEmptyRow(defaultContainerM3),
    makeEmptyRow(defaultContainerM3),
    makeEmptyRow(defaultContainerM3),
  ]);
  const [pending, startTransition] = useTransition();
  const [autoGenPending, setAutoGenPending] = useState(false);

  function updateRow(id: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    setRows((prev) => [...prev, makeEmptyRow(defaultContainerM3)]);
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }

  function duplicateRow(id: string) {
    setRows((prev) => {
      const source = prev.find((r) => r.id === id);
      if (!source) return prev;
      const copy = { ...source, id: uid(), productCode: "", code128: "" };
      const idx = prev.findIndex((r) => r.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  }

  // Bulk auto-gen code128: sekwencyjnie żeby DB increment był spójny
  async function autoGenerateAllCode128() {
    setAutoGenPending(true);
    try {
      const rowsToFill = rows.filter(
        (r) => r.categoryId && !r.code128.trim(),
      );
      if (rowsToFill.length === 0) {
        toast.info("Brak wierszy do uzupełnienia (potrzebują kategorii i pustego code128)");
        return;
      }
      // Per-kategoria: pierwszy call do serwera dla bazowego numeru, reszta inkrementalnie
      const cache: Record<string, { prefix: string; nextNumber: number }> = {};
      const updates: { id: string; code: string }[] = [];
      for (const r of rowsToFill) {
        const catId = r.categoryId!;
        if (!cache[catId]) {
          const result = await generateCode128ForCategoryAction({
            categoryId: catId,
          });
          cache[catId] = {
            prefix: result.prefix,
            nextNumber: result.nextNumber,
          };
        } else {
          cache[catId].nextNumber += 1;
        }
        const { prefix, nextNumber } = cache[catId];
        updates.push({
          id: r.id,
          code: `${prefix}-${String(nextNumber).padStart(4, "0")}`,
        });
      }
      setRows((prev) =>
        prev.map((r) => {
          const u = updates.find((x) => x.id === r.id);
          return u ? { ...r, code128: u.code } : r;
        }),
      );
      toast.success(`Wygenerowano ${updates.length} kodów`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd generowania");
    } finally {
      setAutoGenPending(false);
    }
  }

  function validateRow(r: RowState, idx: number): string | null {
    if (!r.name.trim()) return `Wiersz ${idx + 1}: brak nazwy`;
    if (!r.categoryId) return `Wiersz ${idx + 1}: brak kategorii`;
    if (!r.productCode.trim()) return `Wiersz ${idx + 1}: brak SKU`;
    const w = Number(r.weightKg);
    if (!Number.isFinite(w) || w <= 0)
      return `Wiersz ${idx + 1}: nieprawidłowa waga`;
    if (!r.packagingBoxId || !r.packagingKind)
      return `Wiersz ${idx + 1}: brak pakowania (wybierz typ i pudełko)`;
    if (r.importMode === "KARTON") {
      if (r.packagingKind !== "FACTORY")
        return `Wiersz ${idx + 1}: KARTON wymaga "Karton z Chin" — albo zmień na LUZEM`;
      const u = Number(r.unitsPerBox);
      if (!Number.isFinite(u) || u <= 0)
        return `Wiersz ${idx + 1}: nieprawidłowa liczba szt/karton`;
    } else {
      const u = Number(r.unitsPerContainer);
      if (!Number.isFinite(u) || u <= 0)
        return `Wiersz ${idx + 1}: nieprawidłowa szt/kontener`;
    }
    return null;
  }

  async function handleSubmit() {
    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(rows[i], i);
      if (err) {
        toast.error(err);
        return;
      }
    }
    startTransition(async () => {
      try {
        let createdCount = 0;
        // Sekwencyjnie — DB validation dla unique productCode/code128 wymaga spójności
        for (const r of rows) {
          const pkgBox = availableBoxes.find((b) => b.id === r.packagingBoxId);
          const isFactory = r.packagingKind === "FACTORY";
          const unitsPerBoxNum = Number(r.unitsPerBox) || 1;
          const unitsPerContainerNum = Number(r.unitsPerContainer) || null;
          const dutyPct = r.customsDutyPct ? Number(r.customsDutyPct) / 100 : null;
          const cbmPerUnit =
            r.importMode === "KARTON"
              ? cbmFromBox(
                  pkgBox?.widthCm ?? null,
                  pkgBox?.heightCm ?? null,
                  pkgBox?.depthCm ?? null,
                  unitsPerBoxNum,
                )
              : cbmFromBulk(defaultContainerM3, unitsPerContainerNum);

          const payload = {
            name: r.name.trim(),
            productCode: r.productCode.trim(),
            eanCode: null,
            code128: r.code128.trim() || null,
            categoryId: r.categoryId,
            status: "PLANOWANY" as const,
            isComponent: defaultIsComponent,
            compositionMode: r.compositionMode,
            importMode: r.importMode,
            color: null,
            weightKg: Number(r.weightKg),
            boxWidthCm: r.importMode === "KARTON" ? pkgBox?.widthCm ?? null : null,
            boxHeightCm: r.importMode === "KARTON" ? pkgBox?.heightCm ?? null : null,
            boxDepthCm: r.importMode === "KARTON" ? pkgBox?.depthCm ?? null : null,
            boxWeightKg: r.importMode === "KARTON" ? 1 : null,
            unitsPerBox: r.importMode === "KARTON" ? unitsPerBoxNum : null,
            unitsPerContainer: r.importMode === "LUZEM" ? unitsPerContainerNum : null,
            referenceContainerM3: r.importMode === "LUZEM" ? defaultContainerM3 : null,
            cbmPerUnit,
            customsDutyPct: dutyPct,
            defaultUnitPriceUsd:
              r.purchaseCurrency === "USD" && r.purchasePriceAmount
                ? Number(r.purchasePriceAmount)
                : null,
            defaultUnitPriceCny:
              r.purchaseCurrency === "CNY" && r.purchasePriceAmount
                ? Number(r.purchasePriceAmount)
                : null,
            defaultSalePriceAllegroPln: r.defaultSalePriceAllegroPln
              ? Number(r.defaultSalePriceAllegroPln)
              : null,
            defaultSalePriceSklepPln: r.defaultSalePriceShopPln
              ? Number(r.defaultSalePriceShopPln)
              : null,
          };

          const created = await createProductAction(payload);
          const productId =
            typeof created === "object" && created && "id" in created
              ? (created as { id: string }).id
              : null;
          if (productId && r.packagingBoxId && r.packagingKind) {
            await assignBoxToProductAction(productId, {
              boxId: r.packagingBoxId,
              purpose: isFactory ? "FACTORY" : "SHIPPING",
              unitsPerBox: isFactory ? unitsPerBoxNum : 1,
              isPrimary: !isFactory, // SHIPPING (karton lub foliopak) jest primary
            }).catch(() => {});
          }
          createdCount++;
        }
        toast.success(`Utworzono ${createdCount} ${createdCount === 1 ? "produkt" : "produktów"}`);
        onCreated();
      } catch (e) {
        toast.error(
          e instanceof Error
            ? `Zapisano część, błąd: ${e.message}`
            : "Błąd zapisu",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(99vw,1600px)] sm:!max-w-[min(99vw,1600px)] max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Rows3 className="size-5 text-emerald-600" />
            Dodaj produkty hurtem ({rows.length}{" "}
            {rows.length === 1 ? "wiersz" : "wiersze"})
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-5 py-2 border-b bg-slate-50 flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Dodaj wiersz
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={autoGenerateAllCode128}
            disabled={autoGenPending}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("size-3.5", autoGenPending && "animate-spin")}
            />
            Wygeneruj wszystkie code128
          </Button>
          <div className="ml-auto text-[11px] text-muted-foreground">
            Kursy NBP: {rates.usd ? `USD ${rates.usd.toFixed(3)}` : "—"} ·{" "}
            {rates.cny ? `CNY ${rates.cny.toFixed(3)}` : "—"}
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10">
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
                <th className="px-1.5 py-2 font-semibold w-8 text-center">#</th>
                <th className="px-2 py-2 font-semibold min-w-[160px]">
                  Kategoria *
                </th>
                <th className="px-2 py-2 font-semibold min-w-[120px]">SKU *</th>
                <th className="px-2 py-2 font-semibold min-w-[160px]">
                  Nazwa *
                </th>
                <th className="px-2 py-2 font-semibold min-w-[110px]">
                  Code 128
                </th>
                <th className="px-2 py-2 font-semibold min-w-[100px]">Typ</th>
                <th className="px-2 py-2 font-semibold min-w-[170px]">
                  Pakowanie *
                </th>
                <th className="px-2 py-2 font-semibold min-w-[80px]">
                  Waga kg *
                </th>
                <th className="px-2 py-2 font-semibold min-w-[90px]">Import</th>
                <th className="px-2 py-2 font-semibold min-w-[80px]">
                  Szt/kart
                </th>
                <th className="px-2 py-2 font-semibold min-w-[80px]">
                  Szt/40'
                </th>
                <th className="px-2 py-2 font-semibold min-w-[70px]">Cło %</th>
                <th className="px-2 py-2 font-semibold min-w-[100px]">
                  Cena zakup
                </th>
                <th className="px-2 py-2 font-semibold min-w-[100px]">
                  Allegro PLN
                </th>
                <th className="px-2 py-2 font-semibold min-w-[100px]">
                  Sklep PLN
                </th>
                <th className="px-1 py-2 font-semibold w-12 sticky right-0 bg-slate-100"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const dutyAuto =
                  r.categoryId && categoryDutyMap[r.categoryId] != null
                    ? categoryDutyMap[r.categoryId]!
                    : null;
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-t border-slate-200",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                    )}
                  >
                    <td className="px-1.5 py-1 text-center tabular-nums text-slate-500 align-middle">
                      {idx + 1}
                    </td>
                    {/* Kategoria — tree picker w popoverze */}
                    <td className="px-1 py-1 align-middle">
                      <CategoryTreeSelect
                        value={r.categoryId}
                        categories={categories}
                        placeholder="— wybierz —"
                        onChange={(v) => {
                          const dutyAutoVal = v ? categoryDutyMap[v] : null;
                          updateRow(r.id, {
                            categoryId: v,
                            customsDutyPct:
                              !r.customsDutyPct && dutyAutoVal != null
                                ? (dutyAutoVal * 100).toString()
                                : r.customsDutyPct,
                          });
                        }}
                      />
                    </td>
                    {/* SKU */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        value={r.productCode}
                        onChange={(e) =>
                          updateRow(r.id, { productCode: e.target.value })
                        }
                        placeholder="np. STO-001"
                        className="h-8 text-xs font-mono"
                      />
                    </td>
                    {/* Nazwa */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        value={r.name}
                        onChange={(e) =>
                          updateRow(r.id, { name: e.target.value })
                        }
                        placeholder="Nazwa produktu"
                        className="h-8 text-xs"
                      />
                    </td>
                    {/* Code 128 */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        value={r.code128}
                        onChange={(e) =>
                          updateRow(r.id, { code128: e.target.value })
                        }
                        placeholder="auto"
                        className="h-8 text-xs font-mono"
                      />
                    </td>
                    {/* Typ */}
                    <td className="px-1 py-1 align-middle">
                      <Select
                        value={r.compositionMode}
                        onValueChange={(v) =>
                          updateRow(r.id, {
                            compositionMode: v as CompositionMode,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CALOSCIOWY">Całościowy</SelectItem>
                          <SelectItem value="KOMPONENTOWY">
                            Komponentowy
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    {/* Pakowanie — jedno z trzech (karton wysyłk. / foliopak / z Chin) */}
                    <td className="px-1 py-1 align-middle">
                      <PackagingCell
                        boxId={r.packagingBoxId}
                        kind={r.packagingKind}
                        availableBoxes={availableBoxes}
                        onChange={(boxId, kind) =>
                          updateRow(r.id, {
                            packagingBoxId: boxId,
                            packagingKind: kind,
                          })
                        }
                      />
                    </td>
                    {/* Waga */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        type="number"
                        step="0.001"
                        min={0}
                        value={r.weightKg}
                        onChange={(e) =>
                          updateRow(r.id, { weightKg: e.target.value })
                        }
                        placeholder="kg"
                        className="h-8 text-xs font-mono"
                      />
                    </td>
                    {/* Import */}
                    <td className="px-1 py-1 align-middle">
                      <Select
                        value={r.importMode}
                        onValueChange={(v) =>
                          updateRow(r.id, { importMode: v as ImportMode })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="KARTON">KARTON</SelectItem>
                          <SelectItem value="LUZEM">LUZEM</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    {/* Szt/karton */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        type="number"
                        min={1}
                        value={r.unitsPerBox}
                        onChange={(e) =>
                          updateRow(r.id, { unitsPerBox: e.target.value })
                        }
                        disabled={r.importMode !== "KARTON"}
                        className="h-8 text-xs font-mono disabled:opacity-40"
                      />
                    </td>
                    {/* Szt/kontener */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        type="number"
                        min={1}
                        value={r.unitsPerContainer}
                        onChange={(e) =>
                          updateRow(r.id, {
                            unitsPerContainer: e.target.value,
                          })
                        }
                        disabled={r.importMode !== "LUZEM"}
                        placeholder={r.importMode === "LUZEM" ? "" : "—"}
                        className="h-8 text-xs font-mono disabled:opacity-40"
                      />
                    </td>
                    {/* Cło */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        type="number"
                        step="0.1"
                        min={0}
                        value={r.customsDutyPct}
                        onChange={(e) =>
                          updateRow(r.id, { customsDutyPct: e.target.value })
                        }
                        placeholder={dutyAuto != null ? `auto ${(dutyAuto * 100).toFixed(1)}` : "—"}
                        className="h-8 text-xs font-mono"
                      />
                    </td>
                    {/* Cena zakupu (waluta + kwota) */}
                    <td className="px-1 py-1 align-middle">
                      <div className="flex gap-0.5">
                        <Select
                          value={r.purchaseCurrency}
                          onValueChange={(v) =>
                            updateRow(r.id, {
                              purchaseCurrency: v as PurchaseCurrency,
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-12 text-[10px] px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">$</SelectItem>
                            <SelectItem value="CNY">¥</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={r.purchasePriceAmount}
                          onChange={(e) =>
                            updateRow(r.id, {
                              purchasePriceAmount: e.target.value,
                            })
                          }
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </td>
                    {/* Allegro */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.defaultSalePriceAllegroPln}
                        onChange={(e) =>
                          updateRow(r.id, {
                            defaultSalePriceAllegroPln: e.target.value,
                          })
                        }
                        placeholder="netto"
                        className="h-8 text-xs font-mono"
                      />
                    </td>
                    {/* Sklep */}
                    <td className="px-1 py-1 align-middle">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={r.defaultSalePriceShopPln}
                        onChange={(e) =>
                          updateRow(r.id, {
                            defaultSalePriceShopPln: e.target.value,
                          })
                        }
                        placeholder="netto"
                        className="h-8 text-xs font-mono"
                      />
                    </td>
                    {/* Akcje */}
                    <td
                      className={cn(
                        "px-1 py-1 align-middle text-center sticky right-0",
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                      )}
                    >
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => duplicateRow(r.id)}
                          className="size-6 grid place-items-center rounded hover:bg-slate-200 text-slate-600"
                          title="Duplikuj wiersz"
                        >
                          <Plus className="size-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          disabled={rows.length === 1}
                          className="size-6 grid place-items-center rounded hover:bg-red-100 text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Usuń wiersz"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Anuluj
          </Button>
          <div className="text-xs text-muted-foreground">
            * pola wymagane: kategoria, SKU, nazwa, waga, pudełko, ilość/karton
          </div>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {pending
              ? "Tworzę..."
              : `Utwórz ${rows.length} ${rows.length === 1 ? "produkt" : "produktów"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pakowanie ─────────────────────────────────────────────────────

const PACKAGING_META: Record<
  PackagingKind,
  { label: string; shortLabel: string; icon: typeof Package; color: string }
> = {
  SHIPPING_BOX: {
    label: "Karton wysyłkowy",
    shortLabel: "Karton",
    icon: ShoppingBag,
    color: "text-indigo-700 bg-indigo-50 ring-indigo-200",
  },
  FOLIOPAK: {
    label: "Foliopak",
    shortLabel: "Foliopak",
    icon: Mail,
    color: "text-rose-700 bg-rose-50 ring-rose-200",
  },
  FACTORY: {
    label: "Karton z Chin",
    shortLabel: "Z Chin",
    icon: Package,
    color: "text-amber-700 bg-amber-50 ring-amber-200",
  },
};

function PackagingCell({
  boxId,
  kind,
  availableBoxes,
  onChange,
}: {
  boxId: string | null;
  kind: PackagingKind | null;
  availableBoxes: BoxOption[];
  onChange: (boxId: string | null, kind: PackagingKind | null) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const box = availableBoxes.find((b) => b.id === boxId);
  const meta = kind ? PACKAGING_META[kind] : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={cn(
          "h-8 w-full px-2 rounded-md ring-1 text-[11px] text-left transition-colors flex items-center gap-1.5",
          box && meta
            ? meta.color
            : "ring-slate-300 hover:bg-slate-50 text-slate-500",
        )}
      >
        {meta && <meta.icon className="size-3 shrink-0" />}
        <span className="flex-1 min-w-0 truncate">
          {box ? (
            <>
              <span className="font-semibold">{meta?.shortLabel}:</span>{" "}
              <span className="font-medium">{box.name}</span>
            </>
          ) : (
            "— wybierz pakowanie —"
          )}
        </span>
      </button>
      <PackagingModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        availableBoxes={availableBoxes}
        initialKind={kind}
        initialBoxId={boxId}
        onSelect={(b, k) => {
          onChange(b, k);
          setModalOpen(false);
        }}
      />
    </>
  );
}

function PackagingModal({
  open,
  onOpenChange,
  availableBoxes,
  initialKind,
  initialBoxId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBoxes: BoxOption[];
  initialKind: PackagingKind | null;
  initialBoxId: string | null;
  onSelect: (boxId: string | null, kind: PackagingKind | null) => void;
}) {
  const [tab, setTab] = useState<PackagingKind>(initialKind ?? "SHIPPING_BOX");
  const [query, setQuery] = useState("");

  // Reset state przy każdym otwarciu
  useState(() => {
    if (open) {
      setTab(initialKind ?? "SHIPPING_BOX");
      setQuery("");
    }
  });

  // Filtrowane boxy per kategoria
  const tabBoxes =
    tab === "SHIPPING_BOX"
      ? availableBoxes.filter((b) => b.packagingType === "BOX")
      : tab === "FOLIOPAK"
        ? availableBoxes.filter((b) => b.packagingType === "POLY_BAG")
        : availableBoxes;

  const filtered = tabBoxes.filter((b) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.internalCode?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,720px)] sm:!max-w-[min(96vw,720px)] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Wybierz pakowanie</DialogTitle>
        </DialogHeader>

        {/* Tabs: 3 typy pakowania */}
        <div className="flex gap-1 p-0.5 bg-slate-100 rounded-lg">
          {(["SHIPPING_BOX", "FOLIOPAK", "FACTORY"] as const).map((k) => {
            const meta = PACKAGING_META[k];
            const isActive = tab === k;
            const Icon = meta.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5",
                  isActive
                    ? cn(meta.color, "shadow-sm ring-1")
                    : "text-slate-600 hover:bg-white",
                )}
              >
                <Icon className="size-3.5" />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Wyszukiwarka */}
        <Input
          type="search"
          placeholder="Szukaj po nazwie lub kodzie…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {/* Lista pudełek */}
        <div className="flex-1 overflow-y-auto ring-1 ring-slate-200 rounded-md">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground italic p-6 text-center">
              {tabBoxes.length === 0
                ? `Brak pudełek typu "${PACKAGING_META[tab].label}" w bibliotece`
                : `Brak pasujących do „${query}"`}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0 z-10">
                <tr className="text-left text-slate-600 text-[10px] uppercase tracking-wide">
                  <th className="px-3 py-2 font-semibold w-8"></th>
                  <th className="px-2 py-2 font-semibold">Nazwa</th>
                  <th className="px-2 py-2 font-semibold w-24">Kod</th>
                  <th className="px-2 py-2 font-semibold w-32 text-right">
                    Wymiary
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => {
                  const isSelected =
                    initialBoxId === b.id && initialKind === tab;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelect(b.id, tab)}
                      className={cn(
                        "cursor-pointer transition-colors border-t border-slate-100",
                        isSelected
                          ? cn(PACKAGING_META[tab].color, "ring-1")
                          : i % 2 === 0
                            ? "bg-white hover:bg-slate-50"
                            : "bg-slate-50/50 hover:bg-slate-100/50",
                      )}
                    >
                      <td className="px-3 py-2 text-center">
                        {isSelected ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="size-3.5 rounded-full ring-1 ring-slate-300 inline-block" />
                        )}
                      </td>
                      <td className="px-2 py-2 font-medium">{b.name}</td>
                      <td className="px-2 py-2 font-mono text-[10px] text-slate-500">
                        {b.internalCode ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                        {b.widthCm}×{b.heightCm}×{b.depthCm} cm
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer z opcją "wyczyść" */}
        {initialBoxId && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSelect(null, null)}
            >
              Wyczyść wybór
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
