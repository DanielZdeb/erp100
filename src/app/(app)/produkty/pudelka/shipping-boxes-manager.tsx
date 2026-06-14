"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Boxes,
  Factory,
  FileText,
  Layers,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  BoxAutoAssignDialog,
  type CategoryItem,
  type CategoryRule,
  type ProductItem,
  type ProductRule,
} from "./box-auto-assign-dialog";
import { BoxAssignmentsPopover } from "./box-assignments-popover";

type OriginT = "POLAND" | "CHINA_STANDARD";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import {
  clearMasterInnerBoxAction,
  createShippingBoxAction,
  deleteShippingBoxAction,
  removeShippingBoxPrintAction,
  setMasterInnerBoxAction,
  updateShippingBoxAction,
  uploadShippingBoxPrintAction,
} from "@/server/shipping-boxes";
import { BOX_KIND_META, getBoxKind } from "@/lib/box-kinds";
import { boxesPerEuroPallet } from "@/lib/kalkulacje";
import {
  checkServiceDimensionalFit,
  getCourierServiceCatalog,
  type CourierServiceCatalogEntry,
} from "@/lib/courier-pricing";

type PackagingT = "BOX" | "POLY_BAG";

type InnerBoxCandidate = {
  id: string;
  name: string;
  internalCode: string | null;
  packagingType: PackagingT;
  widthCm: number;
  heightCm: number;
  depthCm: number;
};

type BoxRow = {
  id: string;
  name: string;
  internalCode: string | null;
  packagingType: PackagingT;
  origin: OriginT;
  isCollective: boolean;
  widthCm: number;
  heightCm: number;
  depthCm: number;
  weightKg: number | null;
  cardboardLayers: number | null;
  purchasePricePln: number | null;
  printFileUrl: string | null;
  printFileName: string | null;
  purposeText: string | null;
  innerBoxId: string | null;
  innerBoxesPerMaster: number | null;
  innerBox: InnerBoxCandidate | null;
  notes: string | null;
  _count: { productBoxes: number };
  pinnedProducts: {
    linkId: string;
    id: string;
    name: string;
    productCode: string;
  }[];
};

type DialogState =
  | { open: false }
  | { open: true; mode: "create" }
  | { open: true; mode: "edit"; box: BoxRow };

export function ShippingBoxesManager({
  activeKind,
  counts,
  boxes,
  categories,
  products,
  categoryRules,
  productRules,
  innerBoxCandidates,
}: {
  activeKind: "single" | "collective";
  counts: {
    SINGLE: number;
    COLLECTIVE: number;
  };
  boxes: BoxRow[];
  categories: CategoryItem[];
  products: ProductItem[];
  categoryRules: CategoryRule[];
  productRules: ProductRule[];
  /** Lista pojedynczych CN BOX-ów — kandydaci na inner karton master'a. */
  innerBoxCandidates: InnerBoxCandidate[];
}) {
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [autoAssignBoxId, setAutoAssignBoxId] = useState<string | null>(null);
  const [masterInnerBoxId, setMasterInnerBoxId] = useState<string | null>(null);
  const autoAssignBox =
    autoAssignBoxId != null
      ? boxes.find((b) => b.id === autoAssignBoxId) ?? null
      : null;
  const masterInnerBox =
    masterInnerBoxId != null
      ? boxes.find((b) => b.id === masterInnerBoxId) ?? null
      : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <CategoryTabs activeKind={activeKind} counts={counts} />
        <Button
          onClick={() => setDialog({ open: true, mode: "create" })}
          className="gap-2"
        >
          <Plus className="size-4" />
          Nowe pudełko
        </Button>
      </div>

      <Card>
        {boxes.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            Brak pudełek w tej zakładce. Dodaj pierwsze — np. „Pudełko M 40×30×20"
            albo „Foliopak L 35×25×2".
          </div>
        ) : (
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow>
                <TableHead>Wymiary (cm)</TableHead>
                <TableHead>Przeznaczenie</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Opis</TableHead>
                <TableHead className="text-right">Waga (kg)</TableHead>
                <TableHead className="text-right whitespace-nowrap w-[60px]">
                  Cena
                </TableHead>
                <TableHead className="text-right">CBM</TableHead>
                <TableHead className="text-right">Paleta (szt)</TableHead>
                <TableHead>Nadruk</TableHead>
                <TableHead>Przypisania</TableHead>
                <TableHead className="w-[1%]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boxes.map((b) => {
                const boxCategoryRules = categoryRules.filter(
                  (r) => r.boxId === b.id,
                );
                const boxProductRules = productRules.filter(
                  (r) => r.boxId === b.id,
                );
                return (
                  <BoxRowView
                    key={b.id}
                    box={b}
                    categoryRules={boxCategoryRules}
                    productRules={boxProductRules}
                    allProducts={products}
                    onEdit={() =>
                      setDialog({ open: true, mode: "edit", box: b })
                    }
                    onAutoAssign={() => setAutoAssignBoxId(b.id)}
                    onSetMasterInner={() => setMasterInnerBoxId(b.id)}
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* key wymusza remount przy każdej zmianie edytowanego pudełka — bez tego
          stan komponentu (price, packagingType, origin...) nie odświeża się
          przy ponownym otwarciu dialogu z innym box.id i zapisuje stare dane. */}
      <BoxDialog
        key={
          dialog.open
            ? `${dialog.mode}-${dialog.mode === "edit" ? dialog.box.id : "new"}`
            : "closed"
        }
        dialog={dialog}
        defaultOrigin="POLAND"
        defaultIsCollective={activeKind === "collective"}
        onClose={() => setDialog({ open: false })}
      />

      <BoxAutoAssignDialog
        open={autoAssignBox != null}
        onOpenChange={(o) => !o && setAutoAssignBoxId(null)}
        box={autoAssignBox}
        categories={categories}
        products={products}
        categoryRules={categoryRules}
        productRules={productRules}
      />

      <MasterInnerBoxDialog
        open={masterInnerBox != null}
        onOpenChange={(o) => !o && setMasterInnerBoxId(null)}
        master={masterInnerBox}
        candidates={innerBoxCandidates}
      />
    </>
  );
}

function BoxRowView({
  box,
  categoryRules,
  productRules,
  allProducts,
  onEdit,
  onAutoAssign,
  onSetMasterInner,
}: {
  box: BoxRow;
  categoryRules: CategoryRule[];
  productRules: ProductRule[];
  allProducts: ProductItem[];
  onEdit: () => void;
  onAutoAssign: () => void;
  onSetMasterInner: () => void;
}) {
  const ruleCount = categoryRules.length + productRules.length;
  const [pending, startTransition] = useTransition();
  const isPolyBag = box.packagingType === "POLY_BAG";
  const cbm = (box.widthCm * box.heightCm * box.depthCm) / 1_000_000;
  const kind = getBoxKind({
    packagingType: box.packagingType,
    origin: box.origin,
    isCollective: box.isCollective,
  });
  const kindMeta = BOX_KIND_META[kind];
  const KindIcon = kindMeta.icon;
  // Paleta — auto-kalkulacja: euro 120×80, max 200 cm, +7 cm zwis na stronę
  const pallet = boxesPerEuroPallet(box.widthCm, box.heightCm, box.depthCm);

  function onDelete() {
    if (!confirm(`Usunąć pudełko "${box.name}"?`)) return;
    startTransition(async () => {
      try {
        await deleteShippingBoxAction(box.id);
        toast.success("Usunięto pudełko");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="tabular-nums">
        <span className="font-semibold text-slate-800 text-sm">
          {box.widthCm} × {box.heightCm} × {box.depthCm}
        </span>
        {!isPolyBag && box.cardboardLayers && (
          <span className="ml-1.5 inline-flex items-center px-1 py-0 rounded text-[9px] uppercase tracking-wide bg-orange-100 text-orange-800 ring-1 ring-orange-200">
            {box.cardboardLayers}-W
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm">
        {box.purposeText && box.purposeText.trim() !== "" ? (
          <span className="text-slate-800">{box.purposeText}</span>
        ) : (
          <span className="text-muted-foreground italic">—</span>
        )}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1",
            kindMeta.badgeClass,
          )}
        >
          <KindIcon className="size-3" />
          {kindMeta.label}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground max-w-[120px]">
        {box.internalCode ? (
          <span
            className="text-xs truncate inline-block max-w-full align-bottom"
            title={box.internalCode}
          >
            {box.internalCode.length > 10
              ? `${box.internalCode.slice(0, 10)}…`
              : box.internalCode}
          </span>
        ) : (
          <span className="text-muted-foreground italic text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {box.weightKg != null ? box.weightKg.toFixed(2) : "—"}
      </TableCell>
      <TableCell
        className={cn(
          "text-right tabular-nums w-[60px] whitespace-nowrap",
          box.purchasePricePln == null &&
            "bg-rose-50 text-rose-700 font-semibold",
        )}
        title={
          box.purchasePricePln == null
            ? "Brak ceny zakupu — uzupełnij w edycji pudełka"
            : undefined
        }
      >
        {box.purchasePricePln != null
          ? box.purchasePricePln.toFixed(2)
          : "BRAK"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {cbm.toFixed(4)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <PalletFitCell
          pallet={pallet}
          widthCm={box.widthCm}
          heightCm={box.heightCm}
          depthCm={box.depthCm}
        />
      </TableCell>
      <TableCell>
        <BoxPrintCell box={box} />
      </TableCell>
      <TableCell>
        {box.isCollective && box.origin === "CHINA_STANDARD" ? (
          <MasterInnerCell box={box} />
        ) : (
          <BoxAssignmentsPopover
            boxId={box.id}
            boxName={box.name}
            boxIsCollective={box.isCollective}
            boxOriginIsChina={box.origin === "CHINA_STANDARD"}
            categoryRules={categoryRules}
            productRules={productRules}
            pinnedProducts={box.pinnedProducts}
            allProducts={allProducts.map((p) => ({
              id: p.id,
              name: p.name,
              productCode: p.productCode,
            }))}
          />
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-1 justify-end items-center">
          {box.isCollective && box.origin === "CHINA_STANDARD" ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onSetMasterInner}
              aria-label="Przypisz prod. karton"
              title="Karton zbiorczy — wskaż pudełko produktu (prod. karton) i ile ich się mieści"
              className="relative"
            >
              <Link2 className="size-4 text-lime-700" />
              {box.innerBoxId && (
                <span className="absolute -top-0.5 -right-0.5 size-3.5 grid place-items-center text-[8px] font-bold rounded-full bg-lime-600 text-white">
                  ✓
                </span>
              )}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={onAutoAssign}
              aria-label="Auto-przypisz do kategorii/produktów"
              title="Auto-przypisz do kategorii lub produktów"
              className="relative"
            >
              <Layers className="size-4 text-amber-700" />
              {ruleCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 size-3.5 grid place-items-center text-[8px] font-bold rounded-full bg-amber-600 text-white">
                  {ruleCount}
                </span>
              )}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Edytuj">
            <Pencil className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            disabled={pending}
            aria-label="Usuń"
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function BoxDialog({
  dialog,
  defaultOrigin,
  defaultIsCollective,
  onClose,
}: {
  dialog: DialogState;
  defaultOrigin: OriginT;
  defaultIsCollective: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isEdit = dialog.open && dialog.mode === "edit";
  const editing = isEdit ? dialog.box : null;
  const [packagingType, setPackagingType] = useState<PackagingT>(
    editing?.packagingType ?? "BOX",
  );
  // Przy edycji bierzemy origin z pudełka; przy tworzeniu — z aktywnej zakładki.
  const initialOrigin: OriginT = editing?.origin ?? defaultOrigin;
  const [origin, setOrigin] = useState<OriginT>(initialOrigin);
  const [isCollective, setIsCollective] = useState<boolean>(
    editing?.isCollective ?? defaultIsCollective,
  );
  const [cardboardLayers, setCardboardLayers] = useState<string>(
    editing?.cardboardLayers ? String(editing.cardboardLayers) : "",
  );
  const [price, setPrice] = useState<string>(
    editing?.purchasePricePln != null
      ? String(editing.purchasePricePln)
      : initialOrigin === "CHINA_STANDARD"
        ? "0"
        : "",
  );
  const [printFile, setPrintFile] = useState<File | null>(null);
  const printInputRef = useRef<HTMLInputElement | null>(null);

  const isPoly = packagingType === "POLY_BAG";

  function changeOrigin(next: OriginT) {
    setOrigin(next);
    // Przy przełączeniu na Chiny — zasugeruj 0 zł (jeśli pole jest puste)
    if (next === "CHINA_STANDARD" && price.trim() === "") setPrice("0");
  }

  function changePackagingType(next: PackagingT) {
    setPackagingType(next);
    // Foliopak nigdy nie jest zbiorczy
    if (next === "POLY_BAG") setIsCollective(false);
  }

  function onSubmit(formData: FormData) {
    // Pole "Przeznaczenie" (UI) → mapuje się na `name` w bazie. Dla zachowania
    // kompatybilności z resztą UI (search, pickery) — kopiujemy też do `purposeText`.
    const purpose = formData.get("name") as string;
    const payload = {
      name: purpose,
      internalCode: formData.get("internalCode") as string,
      packagingType,
      origin,
      isCollective: isPoly ? false : isCollective,
      widthCm: formData.get("widthCm") as string,
      heightCm: formData.get("heightCm") as string,
      depthCm: formData.get("depthCm") as string,
      weightKg: formData.get("weightKg") as string,
      cardboardLayers: isPoly ? "" : cardboardLayers,
      purchasePricePln: price,
      purposeText: purpose,
      notes: formData.get("notes") as string,
    };

    startTransition(async () => {
      try {
        let boxId: string | null = null;
        if (isEdit && editing) {
          await updateShippingBoxAction(editing.id, payload);
          boxId = editing.id;
        } else {
          const result = await createShippingBoxAction(payload);
          if (typeof result === "object" && "id" in result) boxId = result.id;
        }
        if (printFile && boxId) {
          const fd = new FormData();
          fd.set("file", printFile);
          await uploadShippingBoxPrintAction(boxId, fd);
        }
        toast.success(isEdit ? "Zapisano zmiany" : "Utworzono pudełko");
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  function clearExistingPrint() {
    if (!editing) return;
    if (!confirm(`Usunąć nadruk z pudełka "${editing.name}"?`)) return;
    startTransition(async () => {
      try {
        await removeShippingBoxPrintAction(editing.id);
        toast.success("Usunięto nadruk");
        editing.printFileUrl = null;
        editing.printFileName = null;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  return (
    <Dialog open={dialog.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-[min(96vw,760px)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isEdit ? "Edytuj pudełko" : "Nowe pudełko"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Dane pudełka zapisywane w bibliotece — używane potem przy produktach i
          kalkulacji wysyłki.
        </p>

        <form action={onSubmit} className="space-y-3">
          {/* Wiersz 1: Przeznaczenie (mapuje się na `name` w bazie) */}
          <div className="space-y-1">
            <Label
              htmlFor="name"
              className="text-[10px] uppercase tracking-wide text-slate-600"
            >
              Przeznaczenie *
            </Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              autoFocus
              placeholder="np. Stoliki M, Krzesła JX, Akcesoria…"
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Do czego używasz tego pudełka — pojawi się w wyszukiwarce i pickerach.
            </p>
          </div>

          {/* Wiersz 2: Wymiary + Waga + Cena (5 kolumn) — kluczowe parametry */}
          <div className="grid grid-cols-5 gap-2">
            <div className="space-y-1">
              <Label
                htmlFor="widthCm"
                className="text-[10px] uppercase tracking-wide text-slate-600"
              >
                Szer. cm *
              </Label>
              <Input
                id="widthCm"
                name="widthCm"
                type="number"
                step="0.1"
                min="0"
                required
                defaultValue={editing?.widthCm ?? ""}
                className="font-mono h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="heightCm"
                className="text-[10px] uppercase tracking-wide text-slate-600"
              >
                Wys. cm *
              </Label>
              <Input
                id="heightCm"
                name="heightCm"
                type="number"
                step="0.1"
                min="0"
                required
                defaultValue={editing?.heightCm ?? ""}
                className="font-mono h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="depthCm"
                className="text-[10px] uppercase tracking-wide text-slate-600"
              >
                {isPoly ? "Grub. cm *" : "Głęb. cm *"}
              </Label>
              <Input
                id="depthCm"
                name="depthCm"
                type="number"
                step="0.1"
                min="0"
                required
                defaultValue={editing?.depthCm ?? ""}
                className="font-mono h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="weightKg"
                className="text-[10px] uppercase tracking-wide text-slate-600"
              >
                Waga kg
              </Label>
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                step="0.01"
                min="0"
                defaultValue={editing?.weightKg ?? ""}
                className="font-mono h-8 text-sm"
                placeholder="opt."
              />
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="purchasePricePln"
                className="text-[10px] uppercase tracking-wide text-slate-600 whitespace-nowrap flex items-center gap-1"
                title={
                  origin === "CHINA_STANDARD"
                    ? "Dla kartonów z Chin sugerujemy 0 zł"
                    : undefined
                }
              >
                Cena zakupu
                {origin === "CHINA_STANDARD" && (
                  <span className="text-[9px] text-rose-600 font-normal normal-case">
                    (sug. 0 zł)
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  id="purchasePricePln"
                  name="purchasePricePln"
                  type="number"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={origin === "CHINA_STANDARD" ? "0" : "np. 1.20"}
                  className="font-mono h-8 text-sm pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none">
                  zł
                </span>
              </div>
            </div>
          </div>

          {/* Wiersz 3: Typ + Pochodzenie + Rodzaj — pigułki, każde w 1/3 */}
          <div className={cn("grid gap-3", isPoly ? "grid-cols-2" : "grid-cols-3")}>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                Typ opakowania *
              </Label>
              <div className="inline-flex w-full rounded-md ring-1 ring-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => changePackagingType("BOX")}
                  className={cn(
                    "flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-all",
                    !isPoly
                      ? "bg-white shadow-sm ring-1 ring-slate-200 text-amber-700"
                      : "text-slate-600",
                  )}
                >
                  Pudełko
                </button>
                <button
                  type="button"
                  onClick={() => changePackagingType("POLY_BAG")}
                  className={cn(
                    "flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-all",
                    isPoly
                      ? "bg-white shadow-sm ring-1 ring-slate-200 text-rose-700"
                      : "text-slate-600",
                  )}
                >
                  Foliopak
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                Pochodzenie *
              </Label>
              <div className="inline-flex w-full rounded-md ring-1 ring-slate-200 p-0.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => changeOrigin("POLAND")}
                  className={cn(
                    "flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-all",
                    origin === "POLAND"
                      ? "bg-white shadow-sm ring-1 ring-slate-200 text-indigo-700"
                      : "text-slate-600",
                  )}
                >
                  🇵🇱 PL
                </button>
                <button
                  type="button"
                  onClick={() => changeOrigin("CHINA_STANDARD")}
                  className={cn(
                    "flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-all",
                    origin === "CHINA_STANDARD"
                      ? "bg-white shadow-sm ring-1 ring-slate-200 text-amber-700"
                      : "text-slate-600",
                  )}
                >
                  🇨🇳 Chiny
                </button>
              </div>
            </div>
            {!isPoly && (
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                  Rodzaj *
                </Label>
                <div className="inline-flex w-full rounded-md ring-1 ring-slate-200 p-0.5 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setIsCollective(false)}
                    className={cn(
                      "flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-all",
                      !isCollective
                        ? "bg-white shadow-sm ring-1 ring-slate-200 text-emerald-700"
                        : "text-slate-600",
                    )}
                  >
                    Pojedyncze
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCollective(true)}
                    className={cn(
                      "flex-1 px-2 py-1 rounded text-[11px] font-semibold transition-all",
                      isCollective
                        ? "bg-white shadow-sm ring-1 ring-slate-200 text-orange-700"
                        : "text-slate-600",
                    )}
                  >
                    Zbiorcze
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Wiersz 4: Opis + Liczba warstw kartonu */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label
                htmlFor="internalCode"
                className="text-[10px] uppercase tracking-wide text-slate-600"
              >
                Opis
              </Label>
              <Input
                id="internalCode"
                name="internalCode"
                defaultValue={editing?.internalCode ?? ""}
                placeholder="np. Karton zewnętrzny z kratami"
                className="h-8 text-sm"
              />
            </div>
            {!isPoly && (
              <div className="space-y-1">
                <Label
                  htmlFor="cardboardLayers"
                  className="text-[10px] uppercase tracking-wide text-slate-600"
                >
                  Liczba warstw kartonu
                </Label>
                <Select
                  value={cardboardLayers}
                  onValueChange={(v) => setCardboardLayers(v === "none" ? "" : v ?? "")}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="np. 3-warstwowy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— brak / nieznane —</SelectItem>
                    <SelectItem value="3">3-warstwowy (single wall)</SelectItem>
                    <SelectItem value="5">5-warstwowy (double wall)</SelectItem>
                    <SelectItem value="7">7-warstwowy (triple wall)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Wiersz 5: Nadruk (pełna szerokość) */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-600">
              Nadruk — projekt drukarski (PDF/grafika, opcjonalny)
            </Label>
            {editing?.printFileUrl && !printFile ? (
              <div className="flex items-center justify-between gap-2 rounded-md ring-1 ring-emerald-200 bg-emerald-50/50 px-2.5 py-1.5">
                <a
                  href={editing.printFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800 hover:underline truncate"
                >
                  <FileText className="size-3.5" />
                  {editing.printFileName ?? "Plik nadruku"}
                </a>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => printInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:underline"
                  >
                    <Upload className="size-3" /> Zmień
                  </button>
                  <button
                    type="button"
                    onClick={clearExistingPrint}
                    className="inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline"
                  >
                    <X className="size-3" /> Usuń
                  </button>
                </div>
              </div>
            ) : printFile ? (
              <div className="flex items-center justify-between gap-2 rounded-md ring-1 ring-indigo-200 bg-indigo-50/50 px-2.5 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-800 truncate">
                  <Paperclip className="size-3.5" />
                  {printFile.name}{" "}
                  <span className="text-[10px] text-indigo-600/70">
                    ({(printFile.size / 1024).toFixed(0)} kB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPrintFile(null);
                    if (printInputRef.current) printInputRef.current.value = "";
                  }}
                  className="text-[11px] text-rose-600 hover:underline shrink-0"
                >
                  Wyczyść
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => printInputRef.current?.click()}
                className="w-full px-3 py-1.5 rounded-md ring-1 ring-dashed ring-slate-300 text-xs text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1.5"
              >
                <Upload className="size-3.5" />
                Dodaj plik nadruku (PDF lub grafika)
              </button>
            )}
            <input
              ref={printInputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setPrintFile(f);
              }}
            />
          </div>

          {/* Wiersz 6: Notatki (pełna szerokość) */}
          <div className="space-y-1">
            <Label
              htmlFor="notes"
              className="text-[10px] uppercase tracking-wide text-slate-600"
            >
              Notatki (opcjonalne)
            </Label>
            <Textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={editing?.notes ?? ""}
              className="text-sm"
            />
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Zapisuję…" : isEdit ? "Zapisz" : "Utwórz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── CategoryTabs ────────────────────────────────────────────────────
// 4 zakładki: PL pojedyncze, PL zbiorcze, CHN importowe, CHN zbiorcze

function CategoryTabs({
  activeKind,
  counts,
}: {
  activeKind: "single" | "collective";
  counts: {
    SINGLE: number;
    COLLECTIVE: number;
  };
}) {
  const tabs: {
    kind: "single" | "collective";
    label: string;
    icon: typeof Factory;
    count: number;
    accentClass: string;
  }[] = [
    {
      kind: "single",
      label: "Wysyłkowe",
      icon: Factory,
      count: counts.SINGLE,
      accentClass: "data-[active=true]:bg-indigo-600",
    },
    {
      kind: "collective",
      label: "Zbiorcze",
      icon: Layers,
      count: counts.COLLECTIVE,
      accentClass: "data-[active=true]:bg-orange-600",
    },
  ];

  return (
    <div className="inline-flex rounded-lg ring-1 ring-border bg-card p-0.5 gap-0.5 flex-wrap">
      {tabs.map((t) => {
        const isActive = activeKind === t.kind;
        const href =
          t.kind === "collective"
            ? "/produkty/pudelka?kind=collective"
            : "/produkty/pudelka";
        const Icon = t.icon;
        return (
          <Link
            key={t.kind}
            href={href}
            data-active={isActive}
            className={
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors " +
              (isActive
                ? `${t.accentClass} text-white`
                : "text-muted-foreground hover:bg-muted")
            }
          >
            <Icon className="size-3.5" />
            {t.label}
            <span
              className={
                isActive
                  ? "ml-1 inline-flex items-center justify-center min-w-[20px] h-4 text-[10px] tabular-nums rounded-full bg-white/25 px-1"
                  : "ml-1 inline-flex items-center justify-center min-w-[20px] h-4 text-[10px] tabular-nums rounded-full bg-muted text-muted-foreground px-1"
              }
            >
              {t.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function MasterInnerCell({ box }: { box: BoxRow }) {
  if (!box.innerBox || !box.innerBoxesPerMaster) {
    return (
      <span className="text-[11px] text-muted-foreground italic">
        — brak inner
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-lime-800">
        <Boxes className="size-3" />
        {box.innerBox.name}
      </span>
      <span className="text-[10px] text-slate-500 tabular-nums">
        {box.innerBox.widthCm}×{box.innerBox.heightCm}×{box.innerBox.depthCm} cm
        · <strong className="text-lime-700">{box.innerBoxesPerMaster}</strong> szt/zbiorczy
      </span>
    </div>
  );
}

function PackagingBadge({ type }: { type: PackagingT }) {
  if (type === "POLY_BAG") {
    return (
      <span className="inline-flex items-center gap-1 px-1 py-0 rounded text-[9px] uppercase tracking-wide bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200">
        <Paperclip className="size-2.5" />
        Foliopak
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0 rounded text-[9px] uppercase tracking-wide bg-orange-100 text-orange-800 ring-1 ring-orange-200">
      <Boxes className="size-2.5" />
      Karton
    </span>
  );
}

function MasterInnerBoxDialog({
  open,
  onOpenChange,
  master,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  master: BoxRow | null;
  candidates: InnerBoxCandidate[];
}) {
  const [innerBoxId, setInnerBoxId] = useState<string>("");
  const [count, setCount] = useState<string>("");
  const [pending, startTransition] = useTransition();

  // Sync state z master'em przy otwarciu
  useEffect(() => {
    if (open && master) {
      setInnerBoxId(master.innerBoxId ?? "");
      setCount(master.innerBoxesPerMaster?.toString() ?? "");
    }
  }, [open, master]);

  const selectedInner =
    candidates.find((c) => c.id === innerBoxId) ?? master?.innerBox ?? null;

  function handleSave() {
    if (!master) return;
    if (!innerBoxId) {
      toast.error("Wybierz prod. karton");
      return;
    }
    const n = Number(count);
    if (!Number.isFinite(n) || n < 1) {
      toast.error("Podaj ile sztuk prod. mieści się w zbiorczym (>=1)");
      return;
    }
    startTransition(async () => {
      try {
        await setMasterInnerBoxAction(master.id, {
          innerBoxId,
          innerBoxesPerMaster: n,
        });
        toast.success("Zapisano powiązanie zbiorczy → prod.");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  function handleClear() {
    if (!master) return;
    if (!confirm("Usunąć powiązanie zbiorczy → prod.?")) return;
    startTransition(async () => {
      try {
        await clearMasterInnerBoxAction(master.id);
        toast.success("Usunięto powiązanie");
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się usunąć");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,600px)]">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Boxes className="size-4 text-lime-700" />
            Prod. karton w zbiorczym
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Karton zbiorczy <strong>{master?.name}</strong> zawiera N sztuk
          innego pudełka. Wybierz pudełko produktu (CN wysyłkowe / prod.
          karton), a system policzy ile sztuk produktu zmieści się w
          zbiorczym (przez factory box produktu).
        </p>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-600">
              Prod. karton / foliopak (CN) *
            </Label>
            {candidates.length === 0 ? (
              <div className="text-xs italic text-muted-foreground rounded-md ring-1 ring-dashed ring-slate-300 px-3 py-3 text-center">
                Brak kandydatów. Dodaj najpierw pudełko / foliopak: 🇨🇳 CN +
                Pojedyncze.
              </div>
            ) : (
              <Select
                value={innerBoxId}
                onValueChange={(v) => setInnerBoxId(v ?? "")}
              >
                <SelectTrigger className="h-9 text-sm">
                  {/* Render nazwy wybranego pudełka zamiast cuid. Radix Select
                      pokazuje children jako fallback gdy wybrane jest value. */}
                  {(() => {
                    const c = candidates.find((c) => c.id === innerBoxId);
                    return c ? (
                      <span className="truncate inline-flex items-center gap-1">
                        <PackagingBadge type={c.packagingType} />
                        <span className="font-medium">{c.name}</span>
                        {c.internalCode && (
                          <span className="text-[10px] text-muted-foreground">
                            ({c.internalCode})
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          · {c.widthCm}×{c.heightCm}×{c.depthCm} cm
                        </span>
                      </span>
                    ) : (
                      <SelectValue placeholder="Wybierz prod. karton / foliopak…" />
                    );
                  })()}
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-1">
                        <PackagingBadge type={c.packagingType} />
                        <span className="font-medium">{c.name}</span>
                        {c.internalCode && (
                          <span className="text-[10px] text-muted-foreground">
                            ({c.internalCode})
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          · {c.widthCm}×{c.heightCm}×{c.depthCm} cm
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedInner && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                  Ile sztuk prod. w zbiorczym *
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  placeholder="np. 24"
                  className="font-mono h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                  Wymiary prod. kartonu (referencja)
                </Label>
                <div className="font-mono text-xs bg-slate-100 ring-1 ring-slate-200 px-2.5 py-2 rounded-md h-9 flex items-center">
                  {selectedInner.widthCm}×{selectedInner.heightCm}×
                  {selectedInner.depthCm} cm
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-1 flex justify-between sm:justify-between">
          <div>
            {master?.innerBoxId && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleClear}
                disabled={pending}
                className="text-rose-600 hover:text-rose-700"
              >
                <Trash2 className="size-4" />
                Usuń powiązanie
              </Button>
            )}
          </div>
          <div className="flex gap-2">
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
              onClick={handleSave}
              disabled={pending || candidates.length === 0}
              className="gap-1.5"
            >
              <Link2 className="size-3.5" />
              {pending ? "Zapisuję…" : "Zapisz powiązanie"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PalletFitCell({
  pallet,
  widthCm,
  heightCm,
  depthCm,
}: {
  pallet: ReturnType<typeof boxesPerEuroPallet>;
  widthCm: number;
  heightCm: number;
  depthCm: number;
}) {
  if (pallet.total <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const perRow = Math.floor(pallet.effectiveLengthCm / widthCm);
  const perCol = Math.floor(pallet.effectiveWidthCm / depthCm);
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="inline-flex flex-col items-end leading-tight cursor-help border-b border-dotted border-slate-300">
          <span className="font-semibold text-slate-800">{pallet.total}</span>
          <span className="text-[9px] text-slate-500">
            {pallet.perLayer}×{pallet.layers}w
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="whitespace-normal w-72 text-left p-3 leading-relaxed font-normal"
      >
        <div className="space-y-2">
          <div>
            <div className="font-semibold text-[11px] mb-0.5">Euro-paleta</div>
            <div className="text-[10px] opacity-80">
              120 × 80 cm · max 200 cm wys.
              <br />+ 7 cm zwis na stronę → eff.{" "}
              <span className="tabular-nums font-semibold">
                {pallet.effectiveLengthCm} × {pallet.effectiveWidthCm} cm
              </span>
            </div>
          </div>

          <div className="border-t border-white/10 pt-2">
            <div className="font-semibold text-[11px] mb-0.5">Pudełko</div>
            <div className="text-[10px] opacity-80 tabular-nums">
              {widthCm} × {heightCm} × {depthCm} cm (W × H × D)
            </div>
          </div>

          <div className="border-t border-white/10 pt-2">
            <div className="font-semibold text-[11px] mb-0.5">Warstwa</div>
            <div className="text-[10px] opacity-80 tabular-nums space-y-0.5">
              <div>
                ⌊{pallet.effectiveLengthCm} / {widthCm}⌋ = <b>{perRow}</b> wzdłuż
              </div>
              <div>
                ⌊{pallet.effectiveWidthCm} / {depthCm}⌋ = <b>{perCol}</b> wszerz
              </div>
              <div className="text-emerald-300">
                = <b>{pallet.perLayer}</b> szt/warstwa
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-2">
            <div className="font-semibold text-[11px] mb-0.5">Wysokość</div>
            <div className="text-[10px] opacity-80 tabular-nums">
              ⌊200 / {heightCm}⌋ = <b>{pallet.layers}</b> warstw
            </div>
          </div>

          <div className="border-t border-white/10 pt-2 text-[11px]">
            Razem:{" "}
            <span className="tabular-nums">
              {pallet.perLayer} × {pallet.layers}
            </span>{" "}
            ={" "}
            <span className="font-bold text-emerald-300 text-sm tabular-nums">
              {pallet.total} szt
            </span>
          </div>

          <div className="text-[9px] opacity-60 italic pt-1">
            Pudełka nie są obracane — szerokość wzdłuż długości palety,
            głębokość wzdłuż szerokości.
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CourierFitCell({ box }: { box: BoxRow }) {
  const [open, setOpen] = useState(false);

  // Wysyłki do klienta robimy tylko PL wysyłkowymi (BOX/POLY_BAG). Master/CN
  // nie wysyłamy do klienta — relacja jest do innych pudełek.
  const isShippable = box.origin === "POLAND" && !box.isCollective;
  if (!isShippable) {
    return (
      <span className="text-[11px] text-muted-foreground italic">
        nie wysyłkowe
      </span>
    );
  }

  // Cennik usług bierzemy z hardcoded'owanych umów (InPost + DHL).
  // Filtrujemy tylko po wymiarach — wagę paczki wybiera user zależnie
  // od produktu w środku (przedział wagowy).
  const catalog = getCourierServiceCatalog();
  const dimsBox = {
    widthCm: box.widthCm,
    heightCm: box.heightCm,
    depthCm: box.depthCm,
  };
  type ServiceFit = {
    service: CourierServiceCatalogEntry;
    rejected: string | null;
  };
  const classified: ServiceFit[] = catalog.map((s) => ({
    service: s,
    rejected: checkServiceDimensionalFit(dimsBox, s),
  }));
  const fitting = classified.filter((c) => c.rejected == null);
  const rejected = classified.filter((c) => c.rejected != null);

  // Grupowanie po brandzie + wyliczenie min ceny do summary
  const byBrand = new Map<string, ServiceFit[]>();
  for (const f of fitting) {
    const list = byBrand.get(f.service.brand) ?? [];
    list.push(f);
    byBrand.set(f.service.brand, list);
  }
  const brands = Array.from(byBrand.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const allPrices = fitting.flatMap((f) =>
    f.service.brackets.map((b) => b.pricePln),
  );
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;

  if (fitting.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1 bg-rose-100 text-rose-800 ring-rose-200 hover:bg-rose-200 transition-colors"
      >
        żaden ({rejected.length}) → szczegóły
        <CourierFitDialog
          open={open}
          onOpenChange={setOpen}
          box={box}
          fitting={fitting}
          rejected={rejected}
          brands={brands}
        />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ring-1 bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100 transition-colors"
        title="Klik = pełny cennik z umów InPost + DHL"
      >
        <span className="tabular-nums">
          {fitting.length} {fitting.length === 1 ? "usługa" : "usług"}
        </span>
        {minPrice != null && (
          <span className="text-emerald-700/80 font-normal">
            od {minPrice.toFixed(2)} zł
          </span>
        )}
        <span className="opacity-50">›</span>
      </button>
      <CourierFitDialog
        open={open}
        onOpenChange={setOpen}
        box={box}
        fitting={fitting}
        rejected={rejected}
        brands={brands}
      />
    </>
  );
}

function CourierFitDialog({
  open,
  onOpenChange,
  box,
  fitting,
  rejected,
  brands,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  box: BoxRow;
  fitting: {
    service: CourierServiceCatalogEntry;
    rejected: string | null;
  }[];
  rejected: {
    service: CourierServiceCatalogEntry;
    rejected: string | null;
  }[];
  brands: [
    string,
    { service: CourierServiceCatalogEntry; rejected: string | null }[],
  ][];
}) {
  const [showRejected, setShowRejected] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,640px)] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Truck className="size-4 text-emerald-600" />
            Cennik usług kurierskich
          </DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Pudełko{" "}
          <strong className="tabular-nums">
            {box.widthCm}×{box.heightCm}×{box.depthCm} cm
          </strong>
          {box.weightKg != null && (
            <>
              {" "}· waga pustego{" "}
              <span className="tabular-nums">{box.weightKg} kg</span>
            </>
          )}
          . Cennik z umów: InPost #55161178, DHL #909575.
        </p>

        {fitting.length === 0 ? (
          <div className="rounded-md bg-rose-50 ring-1 ring-rose-200 px-3 py-2 text-sm text-rose-900">
            Pudełko nie mieści się w żadnej z usług wymiarowo.
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {brands.map(([brand, items]) => (
              <details
                key={brand}
                open
                className="rounded-md ring-1 ring-slate-200 bg-white"
              >
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold flex items-center gap-2 select-none hover:bg-slate-50">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1",
                      brand === "DHL"
                        ? "bg-amber-100 text-amber-800 ring-amber-200"
                        : "bg-emerald-100 text-emerald-800 ring-emerald-200",
                    )}
                  >
                    {brand}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {items.length} {items.length === 1 ? "usługa" : "usług"}
                  </span>
                </summary>
                <div className="border-t border-slate-200 divide-y divide-slate-100">
                  {items.map(({ service }) => (
                    <CourierServiceRow key={service.serviceCode} service={service} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}

        {rejected.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <button
              type="button"
              onClick={() => setShowRejected((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <span className={cn("transition-transform", showRejected && "rotate-90")}>
                ›
              </span>
              Nie pasuje wymiarowo ({rejected.length})
            </button>
            {showRejected && (
              <div className="mt-2 space-y-1 text-[11px] pl-3">
                {rejected.map((r) => (
                  <div key={r.service.serviceCode}>
                    <span className="font-semibold">
                      {r.service.brand} · {r.service.serviceLabel}:
                    </span>{" "}
                    <span className="text-rose-700">{r.rejected}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground italic pt-3 border-t mt-3">
          Cennik wagowy filtrowany wyłącznie po wymiarach pudełka. Wagę paczki
          (produkt + opakowanie) wybierasz przy konfiguracji przesyłki —
          system dobierze odpowiedni przedział wagowy.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function CourierServiceRow({
  service,
}: {
  service: CourierServiceCatalogEntry;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPaczkomat = service.serviceCode.includes("PACZKOMAT");

  return (
    <div className="px-3 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-left hover:bg-slate-50/50 rounded -mx-1 px-1 py-0.5"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {isPaczkomat && <span className="text-[10px]">📍</span>}
          <span className="text-sm font-medium truncate">
            {service.serviceLabel}
          </span>
          <span className="text-[10px] text-muted-foreground truncate">
            · {service.deliveryMode}
          </span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-emerald-700 font-semibold tabular-nums">
            od {service.brackets[0]?.pricePln.toFixed(2)} zł
          </span>
          <span
            className={cn(
              "text-[10px] text-muted-foreground transition-transform",
              expanded && "rotate-90",
            )}
          >
            ›
          </span>
        </span>
      </button>

      {expanded && (
        <div className="mt-2 pl-1 space-y-1.5">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left font-normal pb-0.5">Do wagi</th>
                <th className="text-right font-normal pb-0.5">Cena netto</th>
              </tr>
            </thead>
            <tbody>
              {service.brackets.map((b) => (
                <tr key={b.upToKg} className="border-t border-slate-100">
                  <td className="py-1 pr-2">
                    ≤ {b.upToKg.toFixed(b.upToKg % 1 === 0 ? 0 : 1)} kg
                  </td>
                  <td className="text-right py-1 pl-2 font-semibold text-emerald-700">
                    {b.pricePln.toFixed(2)} zł
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[10px] text-muted-foreground leading-snug">
            <strong className="text-slate-700">Paliwo:</strong>{" "}
            {service.fuelSurchargeNote}
          </div>
          {service.notes.length > 0 && (
            <ul className="text-[10px] text-muted-foreground leading-snug space-y-0.5">
              {service.notes.map((n, i) => (
                <li key={i}>· {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BoxNotesCell({ notes }: { notes: string | null }) {
  if (!notes || notes.trim() === "") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // Skróć preview do 200 znaków w tooltipie żeby duże notatki nie wybiły layoutu
  const preview = notes.length > 200 ? notes.slice(0, 200) + "…" : notes;
  return (
    <Tooltip>
      <TooltipTrigger>
        <span className="inline-flex items-center justify-center size-6 rounded ring-1 ring-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors cursor-help">
          <StickyNote className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="whitespace-pre-wrap max-w-xs text-left p-2.5 leading-snug font-normal text-xs"
      >
        <div className="font-semibold text-[10px] uppercase tracking-wide opacity-70 mb-1">
          Notatka
        </div>
        {preview}
      </TooltipContent>
    </Tooltip>
  );
}

function BoxPrintCell({ box }: { box: BoxRow }) {
  if (!box.printFileUrl) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const isPdf =
    box.printFileName?.toLowerCase().endsWith(".pdf") ||
    box.printFileUrl.toLowerCase().endsWith(".pdf");
  return (
    <a
      href={box.printFileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-200 transition-colors max-w-[10rem]"
      title={box.printFileName ?? "Plik nadruku"}
    >
      {isPdf ? <FileText className="size-3" /> : <Paperclip className="size-3" />}
      <span className="truncate">{box.printFileName ?? "Nadruk"}</span>
    </a>
  );
}
