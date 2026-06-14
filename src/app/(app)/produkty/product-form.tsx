"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import { cbmFromBox, cbmFromBulk } from "@/lib/kalkulacje";
import {
  createProductAction,
  updateProductAction,
} from "@/server/products";
import { bulkAssignComponentToCategoriesAction } from "@/server/product-components";
import type { ProductStatusT } from "@/lib/product-status";
import type { ImportModeT } from "@/lib/container-types";
import {
  ComponentCategoryPicker,
  type CategoryNode as ComponentCategoryNode,
} from "./component-category-picker";
import {
  CategoryTreeSelect,
  type CategoryTreeNode,
} from "./category-tree-select";
import {
  BoxesTab,
  type BoxOption,
  type ProductBoxRow,
} from "./[id]/boxes-tab";
import { NetBruttoInput } from "./net-brutto-input";

type CompositionModeT = "CALOSCIOWY" | "KOMPONENTOWY" | "ZESTAW";

export type ProductFormValues = {
  name: string;
  productCode: string;
  eanCode: string | null;
  code128: string | null;
  categoryId: string | null;
  status: ProductStatusT;
  importMode: ImportModeT;
  compositionMode: CompositionModeT;
  color: string | null;

  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weightKg: number | null;

  // Karton importowy
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  boxDepthCm: number | null;
  boxWeightKg: number | null;
  unitsPerBox: number | null;

  // Luzem
  unitsPerContainer: number | null;
  referenceContainerM3: number | null;

  // Pudło wysyłkowe
  shippingBoxWidthCm: number | null;
  shippingBoxHeightCm: number | null;
  shippingBoxDepthCm: number | null;
  shippingBoxWeightKg: number | null;
  unitsPerShippingBox: number | null;
  unitsPerPallet: number | null;

  cbmPerUnit: number | null;
  customsDutyPct: number | null;
  defaultUnitPriceUsd: number | null;
  defaultUnitPriceCny: number | null;
  defaultSalePriceAllegroPln: number | null;
  defaultSalePriceSklepPln: number | null;
  defaultAllegroCommissionPct: number | null;
  importGuidelines: string | null;
  productionGuidelines: string | null;
  userManual: string | null;
  shopDescription: string | null;
  internalNotes: string | null;
  isComponent: boolean;
};

export function ProductForm({
  initial,
  productId,
  categories,
  componentCategoryOptions,
  initialAssignedCategoryIds,
  productBoxes,
  availableBoxes,
  defaultContainerM3,
  defaultIsComponent,
  onSuccess,
  hideCancel,
}: {
  initial?: ProductFormValues;
  productId?: string;
  /** Drzewo kategorii (z parentId + level) dla pickera Kategoria. */
  categories: CategoryTreeNode[];
  /** Drzewo kategorii do bulk-assign komponentu (z level + parentId + productCount). */
  componentCategoryOptions?: ComponentCategoryNode[];
  /** Kategorie do których ten produkt/komponent jest już przypisany (rules). */
  initialAssignedCategoryIds?: string[];
  /** Pudełka przypięte do tego produktu (tylko edit) — do inline BoxesTab. */
  productBoxes?: ProductBoxRow[];
  /** Wszystkie pudełka z katalogu (tylko edit) — do inline BoxesTab. */
  availableBoxes?: BoxOption[];
  /** Domyślna pojemność kontenera dla trybu LUZEM (z ustawień systemu). */
  defaultContainerM3?: number;
  /** Pre-fill dla "?type=component" przy tworzeniu nowego komponentu. */
  defaultIsComponent?: boolean;
  /** Gdy ustawione, zamiast `router.push` wołane po zapisie (modal context). */
  onSuccess?: (productId: string) => void;
  /** Ukryj przycisk Anuluj (modal ma własny X). */
  hideCancel?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.categoryId ?? null,
  );
  const [importMode, setImportMode] = useState<ImportModeT>(
    initial?.importMode ?? "KARTON",
  );
  const [compositionMode, setCompositionMode] = useState<CompositionModeT>(
    initial?.compositionMode ?? "CALOSCIOWY",
  );
  const [isComponent, setIsComponent] = useState<boolean>(
    initial?.isComponent ?? defaultIsComponent ?? false,
  );
  // Bulk-assign: kategorie do których ten komponent/produkt ma pasować.
  // Przy edycji wstępnie zaznaczone z istniejących reguł.
  const [bulkCategoryIds, setBulkCategoryIds] = useState<Set<string>>(
    () => new Set(initialAssignedCategoryIds ?? []),
  );
  const [bulkQuantity, setBulkQuantity] = useState<number>(1);

  // Karton
  const [boxW, setBoxW] = useState(numToStr(initial?.boxWidthCm));
  const [boxH, setBoxH] = useState(numToStr(initial?.boxHeightCm));
  const [boxD, setBoxD] = useState(numToStr(initial?.boxDepthCm));
  const [upb, setUpb] = useState(numToStr(initial?.unitsPerBox));

  // Luzem
  const [unitsPerContainer, setUnitsPerContainer] = useState(
    numToStr(initial?.unitsPerContainer),
  );
  const [refContainer, setRefContainer] = useState(
    numToStr(initial?.referenceContainerM3 ?? defaultContainerM3),
  );

  const [cbm, setCbm] = useState(numToStr(initial?.cbmPerUnit));

  const isEdit = !!productId;

  const computedCbm =
    importMode === "KARTON"
      ? cbmFromBox(
          parseOrNull(boxW),
          parseOrNull(boxH),
          parseOrNull(boxD),
          parseOrNull(upb),
        )
      : cbmFromBulk(
          parseOrNull(refContainer),
          parseOrNull(unitsPerContainer),
        );

  function onSubmit(formData: FormData) {
    const payload = Object.fromEntries(formData.entries()) as Record<string, string>;
    payload.categoryId = categoryId ?? "";
    payload.importMode = importMode;
    payload.compositionMode = compositionMode;
    payload.isComponent = isComponent ? "true" : "";

    // Walidacja: komponent musi mieć przypisanie do produktu lub kategorii
    if (isComponent && !isEdit && bulkCategoryIds.size === 0) {
      toast.error(
        "Komponent musi być przypisany do co najmniej jednej kategorii lub typu produktu.",
      );
      return;
    }

    startTransition(async () => {
      try {
        if (isEdit && productId) {
          await updateProductAction(productId, payload);
          // Sync reguł przypisania do kategorii — replace semantyka:
          // bulkAssign usuwa reguły nie w nowej liście, dodaje nowe.
          // Wołane tylko gdy picker był widoczny (componentCategoryOptions).
          if (componentCategoryOptions) {
            try {
              const r = await bulkAssignComponentToCategoriesAction(
                productId,
                Array.from(bulkCategoryIds),
                bulkQuantity,
              );
              if (r.created > 0) {
                toast.success(
                  `Zapisano zmiany i dopisano do ${r.created} dodatkowych produktów`,
                );
              } else {
                toast.success("Zapisano zmiany");
              }
            } catch (e) {
              toast.warning(
                `Zapisano produkt, ale aktualizacja reguł kategorii nie przeszła: ${e instanceof Error ? e.message : "nieznany błąd"}`,
              );
            }
          } else {
            toast.success("Zapisano zmiany");
          }
          if (onSuccess) {
            onSuccess(productId);
            router.refresh();
          } else {
            router.push(`/produkty/${productId}`);
            router.refresh();
          }
        } else {
          const result = await createProductAction(payload);
          let toastMsg = isComponent
            ? "Utworzono komponent"
            : "Utworzono produkt";
          // Bulk-assign po stworzeniu — wymagane dla komponentu, opcjonalne dla produktu
          if (bulkCategoryIds.size > 0) {
            try {
              const r = await bulkAssignComponentToCategoriesAction(
                result.id,
                Array.from(bulkCategoryIds),
                bulkQuantity,
              );
              if (r.created > 0) {
                toastMsg = isComponent
                  ? `Utworzono komponent i dopisano do ${r.created} produktów`
                  : `Utworzono produkt i dopisano go jako część ${r.created} innych produktów`;
              }
            } catch (e) {
              toast.warning(
                `Utworzono, ale bulk-assign nie przeszedł: ${e instanceof Error ? e.message : "nieznany błąd"}`,
              );
            }
          }
          toast.success(toastMsg);
          if (onSuccess) {
            onSuccess(result.id);
            router.refresh();
          } else {
            router.push(`/produkty/${result.id}`);
            router.refresh();
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-6 w-full">
      {/* Podstawowe */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Podstawowe dane</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Nazwa" required>
            <Input
              name="name"
              required
              defaultValue={initial?.name ?? ""}
              autoFocus={!isEdit}
            />
          </Field>
          <Field label="Kategoria">
            <CategoryTreeSelect
              value={categoryId}
              onChange={setCategoryId}
              categories={categories}
            />
          </Field>
          <Field label="Kod produktu" required>
            <Input
              name="productCode"
              required
              defaultValue={initial?.productCode ?? ""}
              placeholder="np. RURA-SR-200"
            />
          </Field>
          <Field label="Kod EAN">
            <Input
              name="eanCode"
              defaultValue={initial?.eanCode ?? ""}
              placeholder="13 cyfr"
            />
          </Field>
          <Field label="Code 128">
            <Input
              name="code128"
              defaultValue={initial?.code128 ?? ""}
              placeholder="alfanumeryczny"
            />
          </Field>
          <Field label="Typ wpisu">
            <Select
              value={isComponent ? "component" : "product"}
              onValueChange={(v) => setIsComponent(v === "component")}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v) =>
                    v === "component" ? "Komponent" : "Produkt do sprzedaży"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Produkt do sprzedaży</SelectItem>
                <SelectItem value="component">
                  Komponent (część innych produktów)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isComponent
                ? "Komponenty są podpinane do produktów z trybem 'Z komponentów'. Nie są zamawiane standalone."
                : "Pełen produkt do katalogu — może być całościowy albo złożony z komponentów."}
            </p>
          </Field>
          <Field label="Tryb kompozycji">
            <Select
              value={compositionMode}
              onValueChange={(v) =>
                setCompositionMode((v as CompositionModeT) ?? "CALOSCIOWY")
              }
              disabled={isComponent}
            >
              <SelectTrigger>
                <SelectValue>
                  {(v) =>
                    v === "KOMPONENTOWY" ? "Z komponentów" : "Całościowy"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CALOSCIOWY">Całościowy</SelectItem>
                <SelectItem value="KOMPONENTOWY">Z komponentów</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {isComponent
                ? "Komponenty są zawsze całościowe — to atom produktu."
                : compositionMode === "KOMPONENTOWY"
                  ? "Komponenty (z katalogu komponentów) dodasz po zapisaniu."
                  : "Produkt jest sprowadzany w całości jako jedna sztuka."}
            </p>
          </Field>
          <Field label="Kolor">
            <Input
              name="color"
              defaultValue={initial?.color ?? ""}
              placeholder="np. czarny, RAL 9005"
            />
          </Field>
        </CardContent>
      </Card>

      {/* Sekcje fizyczne — ukryte dla komponentów */}
      {!isComponent && (
        <>
      {/* Wymiary produktu */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Wymiary produktu</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Szerokość (cm)">
            <Input
              name="widthCm"
              type="number"
              step="0.1"
              defaultValue={numToStr(initial?.widthCm)}
            />
          </Field>
          <Field label="Wysokość (cm)">
            <Input
              name="heightCm"
              type="number"
              step="0.1"
              defaultValue={numToStr(initial?.heightCm)}
            />
          </Field>
          <Field label="Głębokość (cm)">
            <Input
              name="depthCm"
              type="number"
              step="0.1"
              defaultValue={numToStr(initial?.depthCm)}
            />
          </Field>
          <Field label="Waga (kg)">
            <Input
              name="weightKg"
              type="number"
              step="0.01"
              defaultValue={numToStr(initial?.weightKg)}
            />
          </Field>
        </CardContent>
      </Card>

      {/* Import z Chin — KARTON vs LUZEM */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import z Chin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <Field label="Tryb importu">
              <Select
                value={importMode}
                onValueChange={(v) =>
                  setImportMode((v as ImportModeT) ?? "KARTON")
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v) => (v === "LUZEM" ? "Luzem" : "W kartonach")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KARTON">W kartonach</SelectItem>
                  <SelectItem value="LUZEM">Luzem</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {importMode === "KARTON"
                  ? "Produkt sprowadzany w kartonach — podaj wymiary kartonu i liczbę sztuk w nim."
                  : "Produkt sprowadzany luzem — podaj ile sztuk wchodzi do kontenera referencyjnego."}
              </p>
            </Field>
          </div>

          {importMode === "KARTON" ? (
            <>
              <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-[11px] text-amber-900">
                ⚠ <strong>Wymiary kartonu są wymagane.</strong> Karton z Chin
                służy jednocześnie jako pudełko wysyłkowe do klienta — CBM
                w kontenerze i koszt wysyłki kurierem liczone są z tych
                samych wymiarów.
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Field label="Karton: szerokość (cm) *">
                  <Input
                    name="boxWidthCm"
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={boxW}
                    onChange={(e) => setBoxW(e.target.value)}
                  />
                </Field>
                <Field label="Karton: wysokość (cm) *">
                  <Input
                    name="boxHeightCm"
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={boxH}
                    onChange={(e) => setBoxH(e.target.value)}
                  />
                </Field>
                <Field label="Karton: głębokość (cm) *">
                  <Input
                    name="boxDepthCm"
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    value={boxD}
                    onChange={(e) => setBoxD(e.target.value)}
                  />
                </Field>
                <Field label="Karton: waga (kg) *">
                  <Input
                    name="boxWeightKg"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    defaultValue={numToStr(initial?.boxWeightKg)}
                  />
                </Field>
                <Field label="Sztuk w kartonie *">
                  <Input
                    name="unitsPerBox"
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={upb}
                    onChange={(e) => setUpb(e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md bg-indigo-50 ring-1 ring-indigo-200 px-3 py-2 text-[11px] text-indigo-900">
                ℹ️ <strong>Tryb „luzem":</strong> wpisz tylko ile sztuk
                wchodzi do kontenera 40&apos; (68&nbsp;m³) — CBM/szt zostanie
                wyliczony automatycznie. Pudełka wysyłkowe do klienta
                przypisz osobno z katalogu poniżej.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <Field label="Sztuk w kontenerze referencyjnym *">
                  <Input
                    name="unitsPerContainer"
                    type="number"
                    step="1"
                    min="1"
                    required
                    value={unitsPerContainer}
                    onChange={(e) => setUnitsPerContainer(e.target.value)}
                    placeholder="np. 5000"
                  />
                </Field>
              <Field label="Kontener referencyjny (m³)">
                <Select
                  value={refContainerSelectValue(refContainer)}
                  onValueChange={(v) => {
                    const x = String(v ?? "");
                    if (x === "20") setRefContainer("28");
                    else if (x === "40") setRefContainer("68");
                    // CUSTOM — zostawia bieżącą wartość
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20&apos; (28 m³)</SelectItem>
                    <SelectItem value="40">40&apos; (68 m³)</SelectItem>
                    <SelectItem value="custom">Niestandardowy</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pojemność (m³)">
                <Input
                  name="referenceContainerM3"
                  type="number"
                  step="0.1"
                  value={refContainer}
                  onChange={(e) => setRefContainer(e.target.value)}
                />
              </Field>
            </div>
            </>
          )}

          <div className="bg-muted/50 rounded-md p-3 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <Field label="CBM na sztukę (m³)">
              <Input
                name="cbmPerUnit"
                type="number"
                step="0.0001"
                value={cbm}
                onChange={(e) => setCbm(e.target.value)}
                placeholder={
                  computedCbm != null ? `auto: ${computedCbm.toFixed(4)}` : ""
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                {importMode === "KARTON"
                  ? "Wyliczane z wymiarów kartonu i sztuk w nim. Możesz nadpisać."
                  : "Wyliczane z pojemności kontenera referencyjnego / sztuk w kontenerze."}
              </p>
            </Field>
            {computedCbm != null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCbm(String(computedCbm))}
              >
                Użyj wyliczonego: {computedCbm.toFixed(4)} m³
              </Button>
            )}
          </div>

          <Field label="Cło importowe (%) — nadpisuje kategorię">
            <Input
              name="customsDutyPct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              defaultValue={
                initial?.customsDutyPct != null
                  ? (initial.customsDutyPct * 100).toFixed(1)
                  : ""
              }
              placeholder="np. 8.5 (puste = z kategorii)"
              className="w-40"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Stawka cła doliczana automatycznie do kosztu kontenera (% od
              wartości towaru). Puste = użyj z kategorii.
            </p>
          </Field>
        </CardContent>
      </Card>

      {/* Pudełka wysyłkowe — z katalogu */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pudełka wysyłkowe (do klienta)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEdit && productId ? (
            <BoxesTab
              productId={productId}
              productBoxes={productBoxes ?? []}
              availableBoxes={availableBoxes ?? []}
            />
          ) : (
            <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              Pudełka z katalogu (i liczbę sztuk na pudełko) przypniesz
              po utworzeniu produktu. Najpierw zapisz produkt.
            </div>
          )}
          <div className="border-t pt-4">
            <Field label="Sztuk na palecie (magazyn)">
              <Input
                name="unitsPerPallet"
                type="number"
                step="1"
                defaultValue={numToStr(initial?.unitsPerPallet)}
                className="w-32"
              />
            </Field>
            <p className="text-xs text-muted-foreground mt-1">
              Używane do auto-liczenia kosztu magazynowania per sztuka
              (z ustawień fulfillmentu).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Domyślne ceny — tylko dla produktów (nie komponentów) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domyślne ceny i koszty</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground -mt-2">
            Wartości auto-uzupełniają się gdy dodajesz ten produkt do nowego
            zamówienia. Można je nadpisać per-zamówienie bez wpływu na produkt.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cena zakupu USD / szt">
              <Input
                name="defaultUnitPriceUsd"
                type="number"
                step="0.01"
                min="0"
                defaultValue={initial?.defaultUnitPriceUsd ?? ""}
                placeholder="np. 12.50"
              />
            </Field>
            <Field label="Cena zakupu CNY / szt">
              <Input
                name="defaultUnitPriceCny"
                type="number"
                step="0.01"
                min="0"
                defaultValue={initial?.defaultUnitPriceCny ?? ""}
                placeholder="np. 88.00"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <NetBruttoInput
                name="defaultSalePriceAllegroPln"
                initialNetto={initial?.defaultSalePriceAllegroPln ?? null}
                placeholder="199.00"
                label="Cena sprzedaży Allegro"
              />
            </div>
            <Field label="Prowizja Allegro (%)">
              <Input
                name="defaultAllegroCommissionPct"
                type="number"
                step="0.1"
                min="0"
                max="100"
                defaultValue={
                  initial?.defaultAllegroCommissionPct != null
                    ? (initial.defaultAllegroCommissionPct * 100).toFixed(1)
                    : ""
                }
                placeholder="np. 12"
              />
            </Field>
          </div>
          <NetBruttoInput
            name="defaultSalePriceSklepPln"
            initialNetto={initial?.defaultSalePriceSklepPln ?? null}
            placeholder="189.00"
            label="Cena sprzedaży Sklep"
          />
        </CardContent>
      </Card>
        </>
      )}

      {/* Pasuje do (bulk-assign) — reguły kategorii. Widoczne też w edit. */}
      {componentCategoryOptions && (
        <Card
          className={
            isComponent && !isEdit && bulkCategoryIds.size === 0
              ? "ring-2 ring-amber-400/60"
              : undefined
          }
        >
          <CardHeader>
            <CardTitle className="text-base">
              {isComponent
                ? isEdit
                  ? "Pasuje do (reguły kategorii)"
                  : "Pasuje do (wymagane)"
                : "Należy też do zestawu (opcjonalnie)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {isComponent ? (
                isEdit ? (
                  <>
                    Edytuj listę kategorii — komponent będzie auto-dopinany do
                    każdego nowego produktu z tych kategorii (i wszystkich
                    pod-kategorii). Odznaczenie usuwa regułę dla danej
                    kategorii, ale <em>nie odpina</em> już istniejących
                    powiązań — to robisz manualnie z poziomu produktu.
                  </>
                ) : (
                  <>
                    <strong>Wymagane:</strong> wybierz produkt lub kategorię /
                    podkategorię / typ — komponent zostanie automatycznie
                    dopisany jako część każdego produktu w wybranych
                    kategoriach. Komponent <em>nie istnieje samodzielnie</em>,
                    zawsze należy do jakiegoś produktu.
                  </>
                )
              ) : (
                <>
                  Zaznacz jeśli ten produkt ma być też częścią zestawów
                  innych produktów (np. „Krzesło Typ E" w „Zestaw mebli —
                  salon"). Wybranie kategorii dopisze ten produkt jako
                  komponent do wszystkich produktów w tych kategoriach.
                </>
              )}
            </p>
            <ComponentCategoryPicker
              categories={componentCategoryOptions}
              selected={bulkCategoryIds}
              onChange={setBulkCategoryIds}
              quantityPerProduct={bulkQuantity}
              onQuantityChange={setBulkQuantity}
            />
            {isComponent && !isEdit && bulkCategoryIds.size === 0 && (
              <div className="text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded px-2 py-1.5">
                ⚠ Komponent musi być przypisany do co najmniej jednej
                kategorii lub typu produktu, żeby go zapisać.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Opisy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opisy i wytyczne</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Wytyczne importowe (logistyka, opakowania)">
            <Textarea
              name="importGuidelines"
              rows={3}
              defaultValue={initial?.importGuidelines ?? ""}
            />
          </Field>
          <Field label="Wytyczne produkcji (jakość, materiały)">
            <Textarea
              name="productionGuidelines"
              rows={3}
              defaultValue={initial?.productionGuidelines ?? ""}
            />
          </Field>
          <Field label="Instrukcja obsługi (dla klienta)">
            <Textarea
              name="userManual"
              rows={3}
              defaultValue={initial?.userManual ?? ""}
            />
          </Field>
          <Field label="Opis do sklepu (gotowy do wklejenia)">
            <Textarea
              name="shopDescription"
              rows={5}
              defaultValue={initial?.shopDescription ?? ""}
            />
          </Field>
          <Field label="Notatki wewnętrzne">
            <Textarea
              name="internalNotes"
              rows={2}
              defaultValue={initial?.internalNotes ?? ""}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 justify-end sticky bottom-0 bg-background/95 backdrop-blur py-4 -mx-6 px-6 border-t">
        {!hideCancel && (
          <Link
            href={isEdit && productId ? `/produkty/${productId}` : "/produkty"}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Anuluj
          </Link>
        )}
        <Button type="submit" disabled={pending}>
          {pending
            ? "Zapisuję…"
            : isEdit
              ? "Zapisz zmiany"
              : isComponent
                ? "Utwórz komponent"
                : "Utwórz produkt"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

function numToStr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return String(n);
}

function parseOrNull(s: string): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function refContainerSelectValue(s: string): string {
  if (s === "28") return "20";
  if (s === "68") return "40";
  return "custom";
}
