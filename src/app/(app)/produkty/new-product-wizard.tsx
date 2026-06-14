"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Check,
  ChevronDown,
  Component,
  FileText,
  Layers,
  Mail,
  Package,
  Paperclip,
  Plus,
  Rows3,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { cbmFromBox, cbmFromBulk, cbmFromMasterBox } from "@/lib/kalkulacje";
import { BOX_KIND_META, getBoxKind } from "@/lib/box-kinds";

import { createProductAction } from "@/server/products";
import { uploadProductImageAction } from "@/server/product-media";
import {
  assignBoxToProductAction,
  createShippingBoxAction,
  uploadShippingBoxPrintAction,
} from "@/server/shipping-boxes";

import {
  CategoryTreeSelect,
  type CategoryTreeNode,
} from "./category-tree-select";
import {
  ComponentCategoryPicker,
  type CategoryNode as ComponentCategoryNode,
} from "./component-category-picker";
import type { BoxOption } from "./[id]/boxes-tab";
import {
  collectDescendantsClient as _collectDescendantsClient,
  resolvePoolClient as _resolvePoolClient,
  VariantPoolModal,
} from "./_components/variant-pool-modal";
import { LibraryDrillPicker } from "./_components/library-drill-picker";
import { BulkAddProductsDialog } from "./bulk-add-products";
import {
  addProductComponentAction,
  bulkAssignComponentToCategoriesAction,
} from "@/server/product-components";

type CompositionMode = "CALOSCIOWY" | "KOMPONENTOWY";
type ImportMode = "KARTON" | "LUZEM";
type PurchaseCurrency = "USD" | "CNY";

type WizardRates = {
  /** Kurs średni NBP USD→PLN (null gdy API niedostępne). */
  usd: number | null;
  /** Kurs średni NBP CNY→PLN (null gdy API niedostępne). */
  cny: number | null;
  /** Data tabeli NBP (YYYY-MM-DD), do wyświetlenia źródła. */
  rateDate: string | null;
};

export type ExistingComponent = {
  id: string;
  name: string;
  productCode: string;
  code128: string | null;
  categoryId: string | null;
  /** true gdy to komponent, false gdy zwykły produkt użyty jako komponent. */
  isComponent: boolean;
  /** URL głównej grafiki produktu (primary image) lub null jeśli brak. */
  primaryImageUrl?: string | null;
};

export type ComponentRule = {
  componentId: string;
  categoryId: string;
  quantity: number;
};

type SelectedComponentEntry = {
  componentId: string;
  name: string;
  quantity: number;
  /** Pula wariantów slotu — kategorie. */
  poolCategoryIds: string[];
  /** Pula wariantów slotu — konkretne produkty. */
  poolProductIds: string[];
  /** Czy slot dopuszcza warianty (default true). */
  allowVariants: boolean;
};

type FormState = {
  // Step 1
  name: string;
  categoryId: string | null;
  productCode: string;
  code128: string;
  compositionMode: CompositionMode;
  /** Wymagana liczba komponentów do skompletowania (tylko dla KOMPONENTOWY). */
  requiredComponentsTotal: string;
  // Step 2 — produkty: tryb wysyłki, komponenty: pasuje-do
  // PAKOWANIE WYSYŁKOWE: tryb określa którego pudełka używamy do wysyłki
  //  - "BOX" → shippingBoxId (karton produkowany w PL, rigid)
  //  - "FOLIOPAK" → foliopakId (poly bag produkowany w PL)
  //  - "SAME_AS_IMPORT" → wysyłamy w tym samym kartonie co przychodzi z Chin
  shippingMode: "BOX" | "FOLIOPAK" | "SAME_AS_IMPORT" | null;
  shippingBoxId: string | null;
  foliopakId: string | null;
  weightKg: string;
  // Step 3 — IMPORT z Chin
  // factoryBoxId = karton z Chin (osobny lub = shippingBox dla SAME_AS_IMPORT)
  factoryBoxId: string | null;
  /**
   * Pod-tryb importu zależny od shippingMode:
   *  SAME_AS_IMPORT → "SINGLE" (pojedyncze kartony) | "MASTER" (w zbiorczym pudle)
   *  BOX/FOLIOPAK → "FACTORY_CARTON" (luzem w kartonach z Chin) | "BULK_CONTAINER" (luzem w kontenerze)
   */
  importSubMode:
    | "SINGLE"
    | "MASTER"
    | "FACTORY_CARTON"
    | "BULK_CONTAINER"
    | null;
  // Komponent-only: kategorie do których pasuje + ilość komponentu na produkt
  fitsCategoryIds: Set<string>;
  quantityPerProduct: string;
  /** Komponent: DODATKOWE kategorie (poza główną Step 1) do których pasuje. */
  extraFitsCategoryIds: Set<string>;
  /** Komponent: konkretne produkty do których ma być przypięty (poza regułami). */
  extraFitsProductIds: Set<string>;
  // Step 3 — import
  importMode: ImportMode;
  unitsPerBox: string;
  unitsPerContainer: string;
  referenceContainerM3: string;
  customsDutyPct: string;
  customsDutyAuto: number | null;
  // Komponent-only: inline wymiary KARTON (brak factoryBox)
  boxWidthCm: string;
  boxHeightCm: string;
  boxDepthCm: string;
  // Master karton (opcjonalny, dla produktu KARTON) — duże pudło zawierające
  // N inner kartonów. Jeżeli wszystkie 5 pól wypełnione, calc CBM/szt
  // używa master_volume / (innerBoxesPerMaster × unitsPerBox).
  //
  // masterBoxId — referencja do wybranego z biblioteki (kartony zbiorcze z CN).
  // Wymiary/waga są auto-kopiowane z wybranego pudełka i zapisywane na
  // produkcie przez masterBox*Cm fields.
  masterBoxId: string | null;
  masterBoxWidthCm: string;
  masterBoxHeightCm: string;
  masterBoxDepthCm: string;
  masterBoxWeightKg: string;
  innerBoxesPerMaster: string;
  // Step 4 — komponenty (tylko gdy produkt + KOMPONENTOWY)
  selectedComponents: SelectedComponentEntry[];
  // Step 5 (lub 4 jeśli nie KOMPONENTOWY) — ceny
  purchaseCurrency: PurchaseCurrency;
  purchasePriceAmount: string;
  /** Jednostka ceny fabrycznej: „SZT" lub „METER".
   *  - SZT — cena za sztukę (typowa);
   *  - METER — cena za metr bieżący × długość produktu = cena za sztukę. */
  purchasePriceUnit: "SZT" | "METER";
  /** Długość produktu w metrach (tylko gdy purchasePriceUnit = METER). */
  purchaseProductLengthM: string;
  /**
   * Step 1 — kraj produkcji. PL → fabryka w Polsce (etykiety „Jak wysyłany
   * z fabryki", master boxy filtrowane do POLAND). CN → fabryka w Chinach
   * (etykiety „Jak importowany z Chin", master boxy CHINA_STANDARD).
   * Wpływa na nazewnictwo i filtry w kroku 3 (Import).
   */
  productionCountry: "PL" | "CN";
  /** Step 1 — grafiki produktu wybrane lokalnie, uploadowane po utworzeniu. */
  imageFiles: File[];
};

const INITIAL: FormState = {
  name: "",
  categoryId: null,
  productCode: "",
  code128: "",
  compositionMode: "CALOSCIOWY",
  requiredComponentsTotal: "",
  shippingMode: null,
  factoryBoxId: null,
  shippingBoxId: null,
  foliopakId: null,
  weightKg: "",
  importSubMode: null,
  fitsCategoryIds: new Set<string>(),
  quantityPerProduct: "1",
  extraFitsCategoryIds: new Set<string>(),
  extraFitsProductIds: new Set<string>(),
  boxWidthCm: "",
  boxHeightCm: "",
  boxDepthCm: "",
  masterBoxId: null,
  masterBoxWidthCm: "",
  masterBoxHeightCm: "",
  masterBoxDepthCm: "",
  masterBoxWeightKg: "",
  innerBoxesPerMaster: "",
  importMode: "KARTON",
  unitsPerBox: "1",
  unitsPerContainer: "",
  referenceContainerM3: "68",
  customsDutyPct: "",
  customsDutyAuto: null,
  selectedComponents: [],
  purchaseCurrency: "USD",
  purchasePriceAmount: "",
  purchasePriceUnit: "SZT",
  purchaseProductLengthM: "",
  productionCountry: "CN",
  imageFiles: [],
};

// Ceny zostały scalone do kroku „Podstawowe" — wpisujesz cenę fabryczną
// (z togglem za szt./za m) w tym samym formularzu co nazwę/kategorię/wagę.
const STEPS_PRODUCT = [
  { id: 1, label: "Podstawowe", icon: Sparkles },
  { id: 2, label: "Pakowanie", icon: Package },
  { id: 3, label: "Import", icon: Box },
] as const;

const STEPS_PRODUCT_COMPONENTOWY = [
  { id: 1, label: "Podstawowe", icon: Sparkles },
  { id: 2, label: "Pakowanie", icon: Package },
  { id: 3, label: "Import", icon: Box },
  { id: 4, label: "Komponenty", icon: Component },
] as const;

const STEPS_COMPONENT = [
  { id: 1, label: "Podstawowe", icon: Sparkles },
  { id: 2, label: "Import", icon: Box },
] as const;

export function NewProductWizardDialog({
  categories,
  componentCategoryOptions,
  existingComponents,
  componentRules,
  categoryDutyMap,
  availableBoxes,
  rates,
  defaultContainerM3 = 68,
  defaultIsComponent = false,
  triggerClassName,
}: {
  categories: CategoryTreeNode[];
  /** Kategorie z liczbą produktów — używane przez ComponentCategoryPicker (komponenty). */
  componentCategoryOptions?: ComponentCategoryNode[];
  /** Wszystkie istniejące komponenty (do wyboru w KOMPONENTOWY step "Komponenty"). */
  existingComponents?: ExistingComponent[];
  /** Reguły kategoria→komponent (sugestie dla wybranej kategorii produktu). */
  componentRules?: ComponentRule[];
  /** Mapa kategoria → domyślna stawka cła (z `category.customsDutyPct`). */
  categoryDutyMap: Record<string, number | null>;
  availableBoxes: BoxOption[];
  /** Kursy NBP USD/CNY z momentu renderu strony. */
  rates: WizardRates;
  defaultContainerM3?: number;
  defaultIsComponent?: boolean;
  triggerClassName?: string;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      {/* Split button — duży, czytelny, ikona + label + chevron dropdown */}
      <div
        className={cn(
          "inline-flex h-11 rounded-lg shadow-sm overflow-hidden ring-1 transition-shadow hover:shadow-md",
          defaultIsComponent
            ? "bg-white ring-violet-300 hover:ring-violet-400"
            : "bg-indigo-600 ring-indigo-700 hover:ring-indigo-800",
          triggerClassName,
        )}
      >
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className={cn(
            "inline-flex items-center gap-2.5 px-4 h-full font-semibold text-sm transition-colors",
            defaultIsComponent
              ? "text-violet-700 hover:bg-violet-50"
              : "text-white hover:bg-indigo-700",
          )}
        >
          {defaultIsComponent ? (
            <Component className="size-5" />
          ) : (
            <Package className="size-5" />
          )}
          {defaultIsComponent ? "Nowy komponent" : "Nowy produkt"}
        </button>
        <div
          className={cn(
            "w-px",
            defaultIsComponent ? "bg-violet-200" : "bg-indigo-500/40",
          )}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              "inline-flex items-center justify-center px-2.5 h-full cursor-pointer transition-colors",
              defaultIsComponent
                ? "text-violet-700 hover:bg-violet-50"
                : "text-white hover:bg-indigo-700",
            )}
            aria-label="Więcej opcji dodawania"
          >
            <ChevronDown className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-1">
            <DropdownMenuItem
              onClick={() => setWizardOpen(true)}
              className="gap-3 py-2.5 cursor-pointer"
            >
              <div
                className={cn(
                  "size-9 rounded-md grid place-items-center shrink-0",
                  defaultIsComponent
                    ? "bg-violet-100 text-violet-600"
                    : "bg-indigo-100 text-indigo-600",
                )}
              >
                <Sparkles className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">
                  Jeden {defaultIsComponent ? "komponent" : "produkt"}
                </div>
                <div className="text-[11px] text-muted-foreground leading-tight">
                  Wizard krok po kroku — 4 ekrany
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setBulkOpen(true)}
              className="gap-3 py-2.5 cursor-pointer"
            >
              <div className="size-9 rounded-md grid place-items-center shrink-0 bg-emerald-100 text-emerald-600">
                <Rows3 className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Kilka na raz</div>
                <div className="text-[11px] text-muted-foreground leading-tight">
                  Tabela hurtowego dodawania (3+ wierszy)
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Wizard — pojedynczy produkt */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="!max-w-[min(96vw,840px)] sm:!max-w-[min(96vw,840px)] max-h-[92vh] overflow-y-auto p-0">
          <WizardBody
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            existingComponents={existingComponents}
            componentRules={componentRules}
            categoryDutyMap={categoryDutyMap}
            availableBoxes={availableBoxes}
            rates={rates}
            defaultContainerM3={defaultContainerM3}
            defaultIsComponent={defaultIsComponent}
            onClose={() => setWizardOpen(false)}
            onCreated={() => {
              setWizardOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Bulk add — tabela */}
      <BulkAddProductsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        categories={categories}
        categoryDutyMap={categoryDutyMap}
        availableBoxes={availableBoxes}
        rates={rates}
        defaultContainerM3={defaultContainerM3}
        defaultIsComponent={defaultIsComponent}
        onCreated={() => {
          setBulkOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

function WizardBody({
  categories,
  componentCategoryOptions,
  existingComponents,
  componentRules,
  categoryDutyMap,
  availableBoxes,
  rates,
  defaultContainerM3,
  defaultIsComponent,
  onClose,
  onCreated,
}: {
  categories: CategoryTreeNode[];
  componentCategoryOptions?: ComponentCategoryNode[];
  existingComponents?: ExistingComponent[];
  componentRules?: ComponentRule[];
  categoryDutyMap: Record<string, number | null>;
  availableBoxes: BoxOption[];
  rates: WizardRates;
  defaultContainerM3: number;
  defaultIsComponent: boolean;
  onClose: () => void;
  /** Wywoływane po utworzeniu produktu/komponentu. Otrzymuje encję
   *  z `id`, `name` itd. dla inline-use (np. dolinkowanie do listy). */
  onCreated: (created: ExistingComponent) => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    ...INITIAL,
    referenceContainerM3: String(defaultContainerM3),
  });
  const [pending, startTransition] = useTransition();

  // Helper do aktualizacji jednego pola form
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((s) => ({ ...s, [key]: value }));
  }

  // Wybór wariantu stepów — 5 jeśli produkt KOMPONENTOWY (extra "Komponenty")
  const isProductKomponentowy =
    !defaultIsComponent && form.compositionMode === "KOMPONENTOWY";
  const steps = defaultIsComponent
    ? STEPS_COMPONENT
    : isProductKomponentowy
      ? STEPS_PRODUCT_COMPONENTOWY
      : STEPS_PRODUCT;
  const maxStep = steps.length;

  // Po zmianie kategorii — auto-wczytuj stawkę cła
  useEffect(() => {
    if (form.categoryId) {
      const duty = categoryDutyMap[form.categoryId] ?? null;
      setForm((s) => ({
        ...s,
        customsDutyAuto: duty,
        // Jeśli user nie nadpisał manualnie, pre-fill auto
        customsDutyPct:
          s.customsDutyPct === "" && duty != null
            ? (duty * 100).toString()
            : s.customsDutyPct,
      }));
    }
  }, [form.categoryId, categoryDutyMap]);

  // Walidacja per krok — różna dla produktu i komponentu
  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!form.name.trim())
        return defaultIsComponent
          ? "Podaj nazwę komponentu"
          : "Podaj nazwę produktu";
      if (defaultIsComponent && form.extraFitsCategoryIds.size === 0)
        return "Wybierz przynajmniej jedną kategorię";
      if (!form.categoryId) return "Wybierz kategorię";
      if (!defaultIsComponent && !form.productCode.trim())
        return "Podaj kod produktu (SKU)";
      // Liczba komponentów (requiredComponentsTotal) walidowana w Kroku 4
      // dla KOMPONENTOWY — nie w Step 1.
      // Waga wymagana dla produktu I komponentu (w Step 1)
      const w = Number(form.weightKg);
      if (!Number.isFinite(w) || w <= 0)
        return defaultIsComponent
          ? "Podaj wagę komponentu (kg/szt, >0)"
          : "Podaj wagę produktu (kg/szt, >0)";
      // Cena z fabryki — wcześniej osobny krok „Ceny", teraz scalone tutaj.
      const priceErr = validatePrices();
      if (priceErr) return priceErr;
      return null;
    }
    // ── KOMPONENT: 2 kroki (Podstawowe → Import) ──
    if (defaultIsComponent) {
      if (s === 2) {
        // Komponent Step 2 = Import (KARTON z biblioteki lub LUZEM)
        if (form.importMode === "KARTON") {
          if (!form.factoryBoxId)
            return "Wybierz karton zbiorczy z Chin z biblioteki";
          const n = Number(form.unitsPerBox);
          if (!Number.isFinite(n) || n <= 0)
            return "Podaj liczbę sztuk w kartonie (>0)";
        } else {
          const n = Number(form.unitsPerContainer);
          if (!Number.isFinite(n) || n <= 0)
            return "Podaj ile sztuk mieści się w kontenerze 40' (>0)";
        }
        return null;
      }
      return null; // Step 3 (Ceny) — wszystko opcjonalne
    }

    // ── PRODUKT ──
    if (s === 2) {
      if (!form.shippingMode)
        return "Wybierz tryb pakowania wysyłkowego";
      if (form.shippingMode === "BOX" && !form.shippingBoxId)
        return "Wybierz karton produkowany w Polsce z biblioteki";
      if (form.shippingMode === "FOLIOPAK" && !form.foliopakId)
        return "Wybierz foliopak z biblioteki";
      if (form.shippingMode === "SAME_AS_IMPORT" && !form.factoryBoxId)
        return "Wybierz karton z Chin (jest też wysyłkowy)";
      return null;
    }
    if (s === 4 && isProductKomponentowy) {
      // Produkt KOMPONENTOWY:
      // 1) deklarowana liczba komponentów (>0, int)
      // 2) min. 1 dodany komponent
      // 3) suma sztuk musi = deklarowana liczba
      const required = Number(form.requiredComponentsTotal);
      if (!Number.isFinite(required) || required <= 0 || !Number.isInteger(required))
        return "Podaj liczbę komponentów do skompletowania (>0, liczba całkowita)";
      if (form.selectedComponents.length === 0)
        return "Dodaj przynajmniej jeden komponent";
      const totalQty = form.selectedComponents.reduce(
        (sum, c) => sum + c.quantity,
        0,
      );
      if (totalQty !== required)
        return `Suma sztuk komponentów (${totalQty}) musi się równać deklarowanej liczbie (${required})`;
      return null;
    }
    if (s === 3) {
      // Produkt Step 3: walidacja zależnie od shippingMode + importSubMode
      if (form.shippingMode === "SAME_AS_IMPORT") {
        if (!form.factoryBoxId)
          return "Wybierz pudełko z Chin (jest też wysyłkowe)";
        const n = Number(form.unitsPerBox);
        if (!Number.isFinite(n) || n <= 0)
          return "Podaj liczbę sztuk w kartonie (>0)";
        if (form.importSubMode === "MASTER") {
          const w = Number(form.masterBoxWidthCm);
          const h = Number(form.masterBoxHeightCm);
          const d = Number(form.masterBoxDepthCm);
          const inner = Number(form.innerBoxesPerMaster);
          if (!w || !h || !d || w <= 0 || h <= 0 || d <= 0)
            return "Master karton wymaga wszystkich wymiarów (szer/wys/głęb)";
          if (!inner || inner <= 0)
            return "Podaj liczbę inner kartonów w master karatonie";
        }
      } else if (
        form.shippingMode === "BOX" ||
        form.shippingMode === "FOLIOPAK"
      ) {
        if (form.importSubMode === "FACTORY_CARTON") {
          if (!form.factoryBoxId)
            return "Wybierz karton z Chin z biblioteki";
          const n = Number(form.unitsPerBox);
          if (!Number.isFinite(n) || n <= 0)
            return "Podaj liczbę sztuk w kartonie (>0)";
        } else if (form.importSubMode === "BULK_CONTAINER") {
          const n = Number(form.unitsPerContainer);
          if (!Number.isFinite(n) || n <= 0)
            return "Podaj ile sztuk mieści się w kontenerze (>0)";
          const r = Number(form.referenceContainerM3);
          if (!Number.isFinite(r) || r <= 0)
            return "Podaj CBM odniesienia (>0)";
        }
      }
      return null;
    }
    return null;
  }

  // Walidacja Ceny — wspólna dla produktu i komponentu (zawsze ostatni krok).
  function validatePrices(): string | null {
    const amt = Number(form.purchasePriceAmount);
    if (!Number.isFinite(amt) || amt <= 0)
      return "Podaj cenę z fabryki (>0) — to podstawowa cena dopóki nie zostanie nadpisana w zamówieniu";
    if (form.purchasePriceUnit === "METER") {
      const m = Number(form.purchaseProductLengthM);
      if (!Number.isFinite(m) || m <= 0)
        return "Podaj długość produktu w metrach (>0) — używamy do wyliczenia ceny za sztukę";
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }
    setStep((s) => Math.min(maxStep, s + 1));
  }
  function goPrev() {
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    // Walidacja każdego kroku przed submit (Step 1 zawiera walidację ceny).
    for (let i = 1; i <= maxStep; i++) {
      const err = validateStep(i);
      if (err) {
        toast.error(`Krok ${i}: ${err}`);
        setStep(i);
        return;
      }
    }
    startTransition(async () => {
      try {
        const factoryBox = availableBoxes.find(
          (b) => b.id === form.factoryBoxId,
        );

        const unitsPerBoxNum = Number(form.unitsPerBox) || 1;
        const unitsPerContainerNum = Number(form.unitsPerContainer) || null;
        const refContainerM3Num =
          Number(form.referenceContainerM3) || defaultContainerM3;
        const dutyPct = form.customsDutyPct
          ? Number(form.customsDutyPct) / 100
          : null;

        // Dla komponentu: SKU auto z code128 jeśli pusty, inaczej code128 jako kod
        const productCode = defaultIsComponent
          ? form.productCode.trim() ||
            form.code128.trim() ||
            `KMP-${Date.now().toString(36).toUpperCase()}`
          : form.productCode.trim();

        // KARTON wymiary: zawsze z factoryBox (zarówno produkt jak i komponent)
        const kartonW = factoryBox?.widthCm ?? null;
        const kartonH = factoryBox?.heightCm ?? null;
        const kartonD = factoryBox?.depthCm ?? null;

        // Mapuj shippingMode + importSubMode na DB importMode (PRODUKT) lub
        // użyj form.importMode (KOMPONENT).
        // Dla produktu:
        //   SAME_AS_IMPORT (SINGLE/MASTER) → KARTON
        //   BOX/FOLIOPAK + FACTORY_CARTON → KARTON
        //   BOX/FOLIOPAK + BULK_CONTAINER → LUZEM
        const dbImportMode: "KARTON" | "LUZEM" = defaultIsComponent
          ? form.importMode
          : form.importSubMode === "BULK_CONTAINER"
            ? "LUZEM"
            : "KARTON";

        // CBM/szt: master ma priorytet, inaczej fallback
        const masterCbm = cbmFromMasterBox(
          Number(form.masterBoxWidthCm) || null,
          Number(form.masterBoxHeightCm) || null,
          Number(form.masterBoxDepthCm) || null,
          Number(form.innerBoxesPerMaster) || null,
          unitsPerBoxNum,
        );
        const cbmPerUnit =
          dbImportMode === "KARTON"
            ? masterCbm ??
              cbmFromBox(kartonW, kartonH, kartonD, unitsPerBoxNum)
            : cbmFromBulk(refContainerM3Num, unitsPerContainerNum);

        const payload = {
          name: form.name.trim(),
          productCode,
          eanCode: null,
          code128: form.code128.trim() || null,
          categoryId: form.categoryId,
          status: "PLANOWANY" as const,
          isComponent: defaultIsComponent,
          compositionMode: form.compositionMode,
          requiredComponentsTotal:
            !defaultIsComponent && form.compositionMode === "KOMPONENTOWY"
              ? Number(form.requiredComponentsTotal) || null
              : null,
          importMode: dbImportMode,
          color: null,
          // Komponent: waga 0 (nie obowiązkowa w wizardzie komponentu)
          weightKg: Number(form.weightKg),
          boxWidthCm: dbImportMode === "KARTON" ? kartonW : null,
          boxHeightCm: dbImportMode === "KARTON" ? kartonH : null,
          boxDepthCm: dbImportMode === "KARTON" ? kartonD : null,
          boxWeightKg: dbImportMode === "KARTON" ? 1 : null,
          unitsPerBox:
            dbImportMode === "KARTON" ? unitsPerBoxNum : null,
          // Master karton (opcjonalny) — przekazujemy gdy KARTON + komplet pól
          masterBoxWidthCm:
            dbImportMode === "KARTON" && Number(form.masterBoxWidthCm) > 0
              ? Number(form.masterBoxWidthCm)
              : null,
          masterBoxHeightCm:
            dbImportMode === "KARTON" && Number(form.masterBoxHeightCm) > 0
              ? Number(form.masterBoxHeightCm)
              : null,
          masterBoxDepthCm:
            dbImportMode === "KARTON" && Number(form.masterBoxDepthCm) > 0
              ? Number(form.masterBoxDepthCm)
              : null,
          masterBoxWeightKg:
            dbImportMode === "KARTON" && Number(form.masterBoxWeightKg) > 0
              ? Number(form.masterBoxWeightKg)
              : null,
          innerBoxesPerMaster:
            dbImportMode === "KARTON" && Number(form.innerBoxesPerMaster) > 0
              ? Number(form.innerBoxesPerMaster)
              : null,
          unitsPerContainer:
            dbImportMode === "LUZEM" ? unitsPerContainerNum : null,
          referenceContainerM3:
            dbImportMode === "LUZEM" ? refContainerM3Num : null,
          cbmPerUnit,
          // Cło tylko dla importu z Chin. PL produkcja → null.
          customsDutyPct: form.productionCountry === "PL" ? null : dutyPct,
          // Cena fabryczna: gdy „za metr" — mnożymy przez długość produktu.
          // Końcowa wartość zapisywana w bazie to ZAWSZE cena za 1 sztukę.
          // CN: USD lub CNY. PL: PLN (bez kursu).
          defaultUnitPriceUsd:
            form.productionCountry !== "PL" &&
            form.purchaseCurrency === "USD" &&
            form.purchasePriceAmount
              ? Number(form.purchasePriceAmount) *
                (form.purchasePriceUnit === "METER"
                  ? Number(form.purchaseProductLengthM) || 0
                  : 1)
              : null,
          defaultUnitPriceCny:
            form.productionCountry !== "PL" &&
            form.purchaseCurrency === "CNY" &&
            form.purchasePriceAmount
              ? Number(form.purchasePriceAmount) *
                (form.purchasePriceUnit === "METER"
                  ? Number(form.purchaseProductLengthM) || 0
                  : 1)
              : null,
          defaultUnitPricePln:
            form.productionCountry === "PL" && form.purchasePriceAmount
              ? Number(form.purchasePriceAmount) *
                (form.purchasePriceUnit === "METER"
                  ? Number(form.purchaseProductLengthM) || 0
                  : 1)
              : null,
          // Zapisz cenę-za-metr + długość gdy unit=METER, żeby później dało
          // się ponownie wyliczyć cenę przy zmianie długości.
          defaultPricePerMeterPln:
            form.productionCountry === "PL" &&
            form.purchasePriceUnit === "METER" &&
            form.purchasePriceAmount
              ? Number(form.purchasePriceAmount)
              : null,
          lengthM:
            form.purchasePriceUnit === "METER" && form.purchaseProductLengthM
              ? Number(form.purchaseProductLengthM)
              : null,
          // Ceny sprzedaży (Allegro/Sklep/Empik itp.) uzupełniane są w karcie
          // produktu — nie w wizardzie.
          defaultSalePriceAllegroPln: null,
          defaultSalePriceSklepPln: null,
        };

        const created = await createProductAction(payload);
        const productId =
          typeof created === "object" && created && "id" in created
            ? (created as { id: string }).id
            : null;

        if (productId) {
          // Upload grafiki — kolejno, żeby nie zalać Vercel Blob równolegle.
          // Pierwsza wrzucona staje się primary (logika po stronie serwera).
          if (form.imageFiles.length > 0) {
            for (const file of form.imageFiles) {
              const fd = new FormData();
              fd.append("file", file);
              await uploadProductImageAction(productId, fd).catch((e) => {
                toast.error(
                  `Nie udało się wgrać ${file.name}: ${
                    e instanceof Error ? e.message : "błąd"
                  }`,
                );
              });
            }
          }
        }
        if (productId) {
          if (defaultIsComponent) {
            // Komponent: zaznaczone kategorie idą jako reguły. Server expanduje
            // wgłąb drzewa kategorii i auto-linkuje produkty.
            const allCategoryIds = Array.from(form.extraFitsCategoryIds);
            if (allCategoryIds.length > 0) {
              await bulkAssignComponentToCategoriesAction(
                productId,
                allCategoryIds,
                1,
              ).catch(() => {});
            }
          } else {
            // Produkt KOMPONENTOWY: dolinkuj komponenty (rules sam ensureComponentLinksForProduct,
            // ale tutaj user mógł dodać ręcznie lub zmienić ilości — robimy jawne add)
            if (isProductKomponentowy && form.selectedComponents.length > 0) {
              for (const sc of form.selectedComponents) {
                await addProductComponentAction(productId, {
                  componentId: sc.componentId,
                  quantity: sc.quantity,
                  allowVariants: sc.allowVariants,
                  poolCategoryIds: sc.poolCategoryIds,
                  poolProductIds: sc.poolProductIds,
                }).catch(() => {
                  /* duplikaty z rules — ok, pomiń */
                });
              }
            }
            // Produkt: przypnij pudełka
            //  - Karton importowy (factoryBox) — zawsze FACTORY purpose
            //  - Wysyłkowe: zależy od shippingMode:
            //    - BOX → shippingBoxId SHIPPING + primary
            //    - FOLIOPAK → foliopakId SHIPPING + primary
            //    - SAME_AS_IMPORT → factoryBoxId też jako SHIPPING + primary
            const assignTasks: Promise<unknown>[] = [];
            if (form.factoryBoxId) {
              assignTasks.push(
                assignBoxToProductAction(productId, {
                  boxId: form.factoryBoxId,
                  purpose: "FACTORY",
                  unitsPerBox: unitsPerBoxNum,
                  isPrimary: false,
                }).catch(() => {}),
              );
            }
            const shippingBoxId =
              form.shippingMode === "BOX"
                ? form.shippingBoxId
                : form.shippingMode === "FOLIOPAK"
                  ? form.foliopakId
                  : form.shippingMode === "SAME_AS_IMPORT"
                    ? form.factoryBoxId
                    : null;
            if (shippingBoxId) {
              assignTasks.push(
                assignBoxToProductAction(productId, {
                  boxId: shippingBoxId,
                  purpose: "SHIPPING",
                  unitsPerBox: 1,
                  isPrimary: true,
                }).catch(() => {}),
              );
            }
            await Promise.all(assignTasks);
          }
        }

        toast.success(
          defaultIsComponent ? "Komponent utworzony" : "Produkt utworzony",
        );
        onCreated({
          id: productId ?? "",
          name: payload.name,
          productCode: payload.productCode,
          code128: payload.code128 ?? null,
          categoryId: payload.categoryId ?? null,
          isComponent: defaultIsComponent,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  return (
    <div className="flex flex-col">
      {/* Header z paskiem kroków */}
      <div className="px-6 pt-5 pb-3 border-b bg-gradient-to-br from-slate-50 to-white">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="size-5 text-indigo-600" />
          <h2 className="text-lg font-heading font-semibold tracking-tight">
            {defaultIsComponent ? "Nowy komponent" : "Nowy produkt"}
          </h2>
        </div>
        <StepIndicator currentStep={step} onJump={setStep} steps={steps} />
      </div>

      {/* Treść kroku */}
      <div className="px-6 py-5 min-h-[360px]">
        {step === 1 && (
          <Step1Basic
            form={form}
            update={update}
            categories={categories}
            isComponent={defaultIsComponent}
            existingProductsForExtraFit={existingComponents}
            rates={rates}
          />
        )}
        {/* Po scaleniu Cen do Podstawowych:
            Komponent: 2 kroki (Podstawowe → Import)
            Produkt CALOSCIOWY: 3 kroki (Podstawowe → Pakowanie → Import)
            Produkt KOMPONENTOWY: 4 kroki (… → Komponenty) */}
        {step === 2 &&
          (defaultIsComponent ? (
            <Step3Import
              form={form}
              update={update}
              availableBoxes={availableBoxes}
              isComponent={true}
            />
          ) : (
            <Step2Packaging
              form={form}
              update={update}
              availableBoxes={availableBoxes}
            />
          ))}
        {step === 3 && !defaultIsComponent && (
          <Step3Import
            form={form}
            update={update}
            availableBoxes={availableBoxes}
            isComponent={false}
          />
        )}
        {step === 4 && !defaultIsComponent && isProductKomponentowy && (
          <Step4ProductComponents
            form={form}
            update={update}
            existingComponents={existingComponents ?? []}
            componentRules={componentRules ?? []}
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            categoryDutyMap={categoryDutyMap}
            availableBoxes={availableBoxes}
            rates={rates}
            defaultContainerM3={defaultContainerM3}
          />
        )}
      </div>

      {/* Footer z nawigacją */}
      <div className="px-6 py-3 border-t bg-slate-50 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={step === 1 ? onClose : goPrev}
          disabled={pending}
        >
          {step === 1 ? "Anuluj" : "Wstecz"}
        </Button>
        <div className="text-xs text-muted-foreground">
          Krok {step}/{maxStep}
        </div>
        {step < maxStep ? (
          <Button type="button" onClick={goNext} disabled={pending}>
            Dalej
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {pending ? "Zapisuję…" : "Utwórz produkt"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
  onJump,
  steps,
}: {
  currentStep: number;
  onJump: (s: number) => void;
  steps:
    | typeof STEPS_PRODUCT
    | typeof STEPS_PRODUCT_COMPONENTOWY
    | typeof STEPS_COMPONENT;
}) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const isDone = currentStep > s.id;
        const isCurrent = currentStep === s.id;
        const Icon = s.icon;
        return (
          <div key={s.id} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => isDone && onJump(s.id)}
              disabled={!isDone}
              className={cn(
                "flex flex-col items-center gap-1 flex-1 py-1 rounded-lg transition-colors",
                isCurrent && "text-indigo-700",
                isDone && "text-emerald-700 hover:bg-emerald-50 cursor-pointer",
                !isCurrent && !isDone && "text-slate-400",
              )}
            >
              <div
                className={cn(
                  "size-7 rounded-full grid place-items-center ring-2 transition-all",
                  isCurrent && "bg-indigo-100 ring-indigo-400 scale-110",
                  isDone && "bg-emerald-100 ring-emerald-400",
                  !isCurrent && !isDone && "bg-slate-100 ring-slate-300",
                )}
              >
                {isDone ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : (
                  <Icon className="size-3.5" />
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wide font-semibold">
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 transition-colors",
                  isDone ? "bg-emerald-400" : "bg-slate-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Podstawowe ────────────────────────────────────────────

/**
 * Picker grafik dla wizardu — trzyma pliki w stanie lokalnym (FormState),
 * pokazuje thumbnaile z możliwością usunięcia. Upload do serwera odbywa się
 * dopiero po `createProductAction` (potrzeba productId).
 */
function ProductImagesPicker({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Pamiętamy obiektowe URL-e dla każdego pliku — generujemy raz, revoke przy zmianie.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  function onPick(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const arr = Array.from(picked).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) {
      toast.error("Wybierz pliki graficzne (JPG/PNG/WEBP)");
      return;
    }
    onChange([...files, ...arr]);
  }

  function removeAt(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">
        Grafiki produktu{" "}
        <span className="text-[10px] text-muted-foreground font-normal">
          (opcjonalne, pierwsza będzie główna)
        </span>
      </Label>
      <div className="flex flex-wrap items-start gap-2">
        {previews.map((url, idx) => (
          <div
            key={url}
            className="relative size-20 rounded-md overflow-hidden ring-1 ring-slate-200 bg-slate-50 group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={files[idx]?.name ?? `Grafika ${idx + 1}`}
              className="size-full object-cover"
            />
            {idx === 0 && (
              <span className="absolute left-1 top-1 bg-emerald-600 text-white text-[8px] uppercase tracking-wide font-bold px-1 rounded">
                Główna
              </span>
            )}
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="absolute right-1 top-1 size-5 rounded-full bg-rose-600 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Usuń grafikę"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="size-20 rounded-md ring-1 ring-dashed ring-slate-300 bg-slate-50/50 hover:bg-slate-100 grid place-items-center gap-1 text-slate-500 transition-colors"
        >
          <Upload className="size-4" />
          <span className="text-[10px]">Dodaj</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function Step1Basic({
  form,
  update,
  categories,
  isComponent,
  existingProductsForExtraFit,
  rates,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  categories: CategoryTreeNode[];
  isComponent: boolean;
  /** Lista istniejących produktów (nie komponentów) do multi-przypięcia komponentu. */
  existingProductsForExtraFit?: ExistingComponent[];
  /** Kursy NBP do konwersji ceny fabrycznej na PLN. */
  rates: WizardRates;
}) {
  return (
    <div className="space-y-4">
      {isComponent && (
        <div className="rounded-lg ring-1 ring-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900">
          <strong>Komponent:</strong> część sprzedawana wewnątrz produktów
          złożonych. Komponenty mają uproszczone dane — tylko nazwa i
          kategoria. CODE-128 / EAN można dodać później w karcie produktu.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="wiz-name" className="text-sm">
            Nazwa {isComponent ? "komponentu" : "produktu"}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <Input
            id="wiz-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder={
              isComponent ? "np. Noga V1 stalowa" : "np. Stolik kawowy okrągły"
            }
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">
            {isComponent ? "Kategorie" : "Kategoria"}{" "}
            <span className="text-red-500">*</span>
          </Label>
          {isComponent ? (
            <ComponentCategoryMultiPicker
              form={form}
              update={update}
              categories={categories}
            />
          ) : (
            <ProductCategoryPicker
              value={form.categoryId}
              onChange={(id) => update("categoryId", id)}
              categories={categories}
            />
          )}
          {isComponent && (
            <p className="text-[10px] text-violet-700/90 leading-snug">
              💡 Komponent <strong>auto-pasuje</strong> do każdego produktu w
              zaznaczonych kategoriach (i ich pod-kategoriach). Możesz wybrać
              wiele kategorii naraz.
            </p>
          )}
        </div>


      </div>

      {/* Wiersz: Kod produktu (SKU) + Waga — wspólna linia */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {!isComponent ? (
          <div className="space-y-1.5">
            <Label htmlFor="wiz-code" className="text-sm">
              Kod produktu (SKU) <span className="text-red-500">*</span>
            </Label>
            <Input
              id="wiz-code"
              value={form.productCode}
              onChange={(e) => update("productCode", e.target.value)}
              placeholder="np. STO-001-OAK"
              className="font-mono"
            />
          </div>
        ) : (
          <div />
        )}
        <div className="space-y-1.5">
          <Label htmlFor="wiz-weight" className="text-sm">
            Waga {isComponent ? "komponentu" : "produktu"}{" "}
            <span className="text-red-500">*</span>{" "}
            <span className="text-[10px] text-muted-foreground font-normal">
              (kg/szt)
            </span>
          </Label>
          <div className="relative">
            <Input
              id="wiz-weight"
              type="number"
              step="0.001"
              min={0}
              value={form.weightKg}
              onChange={(e) => update("weightKg", e.target.value)}
              placeholder="np. 2.5"
              className="font-mono pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
              kg
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Używana w kalkulacji kosztów wysyłki kurierem.
          </p>
        </div>
      </div>

      {/* Kraj produkcji — radio z flagami */}
      {!isComponent && (
        <div className="space-y-1.5">
          <Label className="text-sm">Kraj produkcji</Label>
          <div className="flex items-center gap-5">
            <CountryRadio
              checked={form.productionCountry === "CN"}
              onChange={() => update("productionCountry", "CN")}
              flag="🇨🇳"
              label="Chiny"
            />
            <CountryRadio
              checked={form.productionCountry === "PL"}
              onChange={() => update("productionCountry", "PL")}
              flag="🇵🇱"
              label="Polska"
            />
          </div>
        </div>
      )}

      {/* Cena z fabryki (lewa) + Stawka cła (prawa, tylko CN) — wiersz pod
          krajem produkcji. Dla PL prawa kolumna jest pusta. */}
      {!isComponent && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <PriceFromFactorySection
            form={form}
            update={update}
            rates={rates}
          />
          {form.productionCountry !== "PL" ? (
            <div className="space-y-1.5">
              <Label htmlFor="wiz-duty" className="text-sm">
                Stawka cła (%)
              </Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    id="wiz-duty"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={form.customsDutyPct}
                    onChange={(e) =>
                      update("customsDutyPct", e.target.value)
                    }
                    placeholder={
                      form.customsDutyAuto != null
                        ? `auto: ${(form.customsDutyAuto * 100).toFixed(1)}`
                        : "np. 8.5"
                    }
                    className="font-mono pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                    %
                  </span>
                </div>
                {form.customsDutyAuto != null && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      update(
                        "customsDutyPct",
                        (form.customsDutyAuto! * 100).toString(),
                      )
                    }
                    className="gap-1 text-xs whitespace-nowrap"
                  >
                    <Settings2 className="size-3" />
                    Z kat. ({(form.customsDutyAuto * 100).toFixed(1)}%)
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Auto-uzupełniane z kategorii. Możesz nadpisać.
              </p>
            </div>
          ) : (
            <div />
          )}
        </div>
      )}

      {/* Komponent — sekcja cena z fabryki na pełną szerokość (bez cła) */}
      {isComponent && (
        <PriceFromFactorySection
          form={form}
          update={update}
          rates={rates}
        />
      )}

      {/* Typ produktu — tylko dla produktów (komponent ma swój typ z definicji) */}
      {!isComponent && (
        <div className="space-y-2">
          <Label className="text-sm">Typ produktu</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {/* Lewa kolumna: Całościowy */}
            <TypeCard
              active={form.compositionMode === "CALOSCIOWY"}
              onClick={() => update("compositionMode", "CALOSCIOWY")}
              icon={Layers}
              title="Całościowy"
              description="Sprowadzany i sprzedawany w całości jako jeden gotowy produkt"
              theme="emerald"
            />
            {/* Prawa kolumna: Komponentowy + (gdy aktywny) panel z liczbą komponentów */}
            <div className="space-y-2">
              <TypeCard
                active={form.compositionMode === "KOMPONENTOWY"}
                onClick={() => update("compositionMode", "KOMPONENTOWY")}
                icon={Component}
                title="Komponentowy"
                description="Składa się z komponentów, które mogą być sprowadzane osobno"
                theme="violet"
              />
              {form.compositionMode === "KOMPONENTOWY" && (
                <div className="rounded-md bg-violet-50/50 ring-1 ring-violet-200 px-3 py-2 text-[11px] text-violet-800/90 leading-snug">
                  💡 Liczbę komponentów (np. „4 sztuki: blat + 3 nogi") podasz
                  w kroku <strong>Komponenty</strong>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grafiki produktu — na końcu kroku */}
      {!isComponent && (
        <ProductImagesPicker
          files={form.imageFiles}
          onChange={(files) => update("imageFiles", files)}
        />
      )}
    </div>
  );
}

function CountryRadio({
  checked,
  onChange,
  flag,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  flag: string;
  label: string;
}) {
  return (
    <label
      className="inline-flex items-center gap-2 cursor-pointer select-none text-sm"
      onClick={onChange}
    >
      <span
        className={cn(
          "size-4 rounded-full ring-1 grid place-items-center transition-colors",
          checked ? "ring-indigo-500" : "ring-slate-300 hover:ring-slate-400",
        )}
      >
        {checked && <span className="size-2 rounded-full bg-indigo-500" />}
      </span>
      <span className="text-lg leading-none">{flag}</span>
      <span className={cn("font-medium", checked && "text-indigo-700")}>
        {label}
      </span>
    </label>
  );
}

function TypeCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Layers;
  title: string;
  description: string;
  theme: "emerald" | "violet" | "amber";
}) {
  const themeClasses = {
    emerald: {
      activeRing: "ring-emerald-400 bg-emerald-50",
      activeIcon: "text-emerald-600 bg-emerald-100",
      activeTitle: "text-emerald-900",
    },
    violet: {
      activeRing: "ring-violet-400 bg-violet-50",
      activeIcon: "text-violet-600 bg-violet-100",
      activeTitle: "text-violet-900",
    },
    amber: {
      activeRing: "ring-amber-400 bg-amber-50",
      activeIcon: "text-amber-600 bg-amber-100",
      activeTitle: "text-amber-900",
    },
  }[theme];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg ring-1 text-left transition-all",
        active
          ? cn(themeClasses.activeRing, "ring-2 shadow-md")
          : "ring-slate-200 hover:ring-slate-300 hover:bg-slate-50",
      )}
    >
      <div
        className={cn(
          "size-10 rounded-md grid place-items-center shrink-0 transition-colors",
          active ? themeClasses.activeIcon : "bg-slate-100 text-slate-500",
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("font-semibold text-sm", active && themeClasses.activeTitle)}>
          {title}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
          {description}
        </div>
      </div>
      {active && <Check className="size-4 text-emerald-600 shrink-0" />}
    </button>
  );
}

// ─── Multi-select picker kategorii dla komponentu (Step 1) ─────────
// Jeden przycisk otwiera 3-kolumnowy modal z checkboxami. Wynik (Set<string>)
// trafia do `form.extraFitsCategoryIds`. Submit komponentu używa pierwszej
// kategorii jako `categoryId` (taxonomic placement) + wszystkich jako reguł.

function ComponentCategoryMultiPicker({
  form,
  update,
  categories,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  categories: CategoryTreeNode[];
}) {
  const [open, setOpen] = useState(false);
  const [pickerStaging, setPickerStaging] = useState<Set<string>>(new Set());
  const [pickerL1, setPickerL1] = useState<string | null>(null);
  const [pickerL2, setPickerL2] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPickerStaging(new Set(form.extraFitsCategoryIds));
      setPickerL1(null);
      setPickerL2(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function togglePickerStaging(id: string) {
    setPickerStaging((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commitStaging() {
    update("extraFitsCategoryIds", new Set(pickerStaging));
    // categoryId = pierwsza z zaznaczonych (taxonomic placement Product.categoryId)
    const firstId = Array.from(pickerStaging)[0] ?? null;
    update("categoryId", firstId);
    setOpen(false);
  }

  function removeCategory(id: string) {
    const next = new Set(form.extraFitsCategoryIds);
    next.delete(id);
    update("extraFitsCategoryIds", next);
    // Jeśli usunięto główną, przesuń categoryId na nową pierwszą
    if (form.categoryId === id) {
      update("categoryId", Array.from(next)[0] ?? null);
    }
  }

  const selectedList = Array.from(form.extraFitsCategoryIds)
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is CategoryTreeNode => !!c);

  const lvl1 = categories.filter((c) => c.level === 1);
  const lvl2 = pickerL1
    ? categories.filter((c) => c.parentId === pickerL1)
    : [];
  const lvl3 = pickerL2
    ? categories.filter((c) => c.parentId === pickerL2)
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full px-3 py-2 rounded-md ring-1 text-sm text-left transition-colors",
          selectedList.length > 0
            ? "ring-violet-300 bg-violet-50/40 hover:bg-violet-50"
            : "ring-slate-300 bg-white hover:bg-slate-50",
        )}
      >
        {selectedList.length === 0 ? (
          <span className="text-slate-500">
            Wybierz kategorię… (możesz zaznaczyć wiele)
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5 items-center">
            {selectedList.map((c, i) => (
              <span
                key={c.id}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1",
                  i === 0
                    ? "bg-violet-200 text-violet-900 ring-violet-300"
                    : "bg-violet-100 text-violet-800 ring-violet-200",
                )}
              >
                {c.name}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCategory(c.id);
                  }}
                  className="size-3.5 grid place-items-center rounded-full hover:bg-violet-300 cursor-pointer"
                >
                  ×
                </span>
              </span>
            ))}
            <span className="text-[10px] text-violet-700 ml-auto">
              ({selectedList.length}) · klik aby edytować
            </span>
          </div>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[min(96vw,1100px)] sm:!max-w-[min(96vw,1100px)] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              Wybierz kategorie (komponent pasuje do produktów w zaznaczonych)
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-[400px] flex border rounded-lg overflow-hidden divide-x divide-slate-200">
            <PickerColumn
              title="Kategoria główna"
              items={lvl1}
              staging={pickerStaging}
              onToggle={togglePickerStaging}
              activeId={pickerL1}
              onActivate={(id) => {
                setPickerL1(id);
                setPickerL2(null);
              }}
              levelLabel="Główna"
              levelColor="bg-violet-100 text-violet-800 ring-violet-200"
              emptyLabel="Brak kategorii"
            />
            <PickerColumn
              title="Podkategoria"
              items={lvl2}
              staging={pickerStaging}
              onToggle={togglePickerStaging}
              activeId={pickerL2}
              onActivate={(id) => setPickerL2(id)}
              levelLabel="Podkategoria"
              levelColor="bg-sky-100 text-sky-800 ring-sky-200"
              emptyLabel={
                pickerL1 ? "Brak podkategorii" : "← Wybierz kategorię główną"
              }
            />
            <PickerColumn
              title="Typ produktu"
              items={lvl3}
              staging={pickerStaging}
              onToggle={togglePickerStaging}
              activeId={null}
              onActivate={() => {}}
              levelLabel="Typ"
              levelColor="bg-emerald-100 text-emerald-800 ring-emerald-200"
              emptyLabel={pickerL2 ? "Brak typów" : "← Wybierz podkategorię"}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t">
            <div className="text-xs">
              {pickerStaging.size === 0 ? (
                <span className="text-slate-500 italic">
                  Brak zaznaczonych
                </span>
              ) : (
                <span className="text-slate-700">
                  Zaznaczonych:{" "}
                  <strong className="text-violet-700 tabular-nums">
                    {pickerStaging.size}
                  </strong>{" "}
                  kategorii
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={commitStaging}
                disabled={pickerStaging.size === 0}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                Zapisz wybór ({pickerStaging.size})
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Single-select picker kategorii dla produktu (3-kol z modal) ───
// Wygląd taki sam jak ComponentCategoryMultiPicker, ale tylko JEDNA kategoria
// może być zaznaczona (radio behavior). Zaznaczenie nowej deselektuje
// poprzednią.

export function ProductCategoryPicker({
  value,
  onChange,
  categories,
  modalTitle = "Wybierz kategorię produktu",
  emptyLabel = "Wybierz kategorię…",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  categories: CategoryTreeNode[];
  modalTitle?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [staging, setStaging] = useState<string | null>(value);
  const [pickerL1, setPickerL1] = useState<string | null>(null);
  const [pickerL2, setPickerL2] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStaging(value);
      setPickerL1(null);
      setPickerL2(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function commit() {
    onChange(staging);
    setOpen(false);
  }

  const selected = value ? categories.find((c) => c.id === value) : null;

  const lvl1 = categories.filter((c) => c.level === 1);
  const lvl2 = pickerL1
    ? categories.filter((c) => c.parentId === pickerL1)
    : [];
  const lvl3 = pickerL2
    ? categories.filter((c) => c.parentId === pickerL2)
    : [];

  // Single-select: zaznaczanie zastępuje poprzedni wybór
  function toggleStaging(id: string) {
    setStaging((prev) => (prev === id ? null : id));
  }

  // Set z 0 lub 1 elementem do PickerColumn (kompatybilność API)
  const stagingSet = new Set<string>(staging ? [staging] : []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full px-3 py-2 rounded-md ring-1 text-sm text-left transition-colors",
          value
            ? "ring-emerald-300 bg-emerald-50/40 hover:bg-emerald-50"
            : "ring-slate-300 bg-white hover:bg-slate-50",
        )}
      >
        {selected ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-900 font-medium">{selected.name}</span>
            <span className="text-[10px] text-emerald-700">klik aby zmienić</span>
          </div>
        ) : (
          <span className="text-slate-500">{emptyLabel}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!max-w-[min(96vw,1100px)] sm:!max-w-[min(96vw,1100px)] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">{modalTitle}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-[400px] flex border rounded-lg overflow-hidden divide-x divide-slate-200">
            <PickerColumn
              title="Kategoria główna"
              items={lvl1}
              staging={stagingSet}
              onToggle={toggleStaging}
              activeId={pickerL1}
              onActivate={(id) => {
                setPickerL1(id);
                setPickerL2(null);
              }}
              levelLabel="Główna"
              levelColor="bg-violet-100 text-violet-800 ring-violet-200"
              emptyLabel="Brak kategorii"
            />
            <PickerColumn
              title="Podkategoria"
              items={lvl2}
              staging={stagingSet}
              onToggle={toggleStaging}
              activeId={pickerL2}
              onActivate={(id) => setPickerL2(id)}
              levelLabel="Podkategoria"
              levelColor="bg-sky-100 text-sky-800 ring-sky-200"
              emptyLabel={
                pickerL1 ? "Brak podkategorii" : "← Wybierz kategorię główną"
              }
            />
            <PickerColumn
              title="Typ produktu"
              items={lvl3}
              staging={stagingSet}
              onToggle={toggleStaging}
              activeId={null}
              onActivate={() => {}}
              levelLabel="Typ"
              levelColor="bg-emerald-100 text-emerald-800 ring-emerald-200"
              emptyLabel={pickerL2 ? "Brak typów" : "← Wybierz podkategorię"}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t">
            <div className="text-xs">
              {staging ? (
                <span className="text-slate-700">
                  Wybrano:{" "}
                  <strong className="text-emerald-700">
                    {categories.find((c) => c.id === staging)?.name}
                  </strong>
                </span>
              ) : (
                <span className="text-slate-500 italic">Brak wyboru</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={commit}
                disabled={!staging}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Zapisz wybór
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Multi-target picker dla komponentu (Step 1 opcjonalne) ────────

function ComponentExtraTargetsPicker({
  form,
  update,
  categories,
  existingProducts,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  categories: CategoryTreeNode[];
  existingProducts: ExistingComponent[];
}) {
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [prodPickerOpen, setProdPickerOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  // Wybrane w 3-kolumnowym pickerze (kopia robocza, commit przy OK)
  const [pickerStaging, setPickerStaging] = useState<Set<string>>(new Set());
  // Nawigacja po 3 kolumnach: aktualnie aktywna kategoria główna / podkategoria
  const [pickerL1, setPickerL1] = useState<string | null>(null);
  const [pickerL2, setPickerL2] = useState<string | null>(null);

  // Reset stagingu przy każdym otwarciu modalu (init z aktualnie wybranych)
  useEffect(() => {
    if (catPickerOpen) {
      setPickerStaging(new Set(form.extraFitsCategoryIds));
      setPickerL1(null);
      setPickerL2(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catPickerOpen]);

  function removeCategory(id: string) {
    const next = new Set(form.extraFitsCategoryIds);
    next.delete(id);
    update("extraFitsCategoryIds", next);
  }
  function togglePickerStaging(id: string) {
    setPickerStaging((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function commitStaging() {
    update("extraFitsCategoryIds", new Set(pickerStaging));
    setCatPickerOpen(false);
  }
  // Pomocnicze: kategorie per poziom
  const lvl1 = categories.filter((c) => c.level === 1);
  const lvl2 = pickerL1
    ? categories.filter((c) => c.parentId === pickerL1)
    : [];
  const lvl3 = pickerL2
    ? categories.filter((c) => c.parentId === pickerL2)
    : [];
  function addProduct(id: string) {
    const next = new Set(form.extraFitsProductIds);
    next.add(id);
    update("extraFitsProductIds", next);
  }
  function removeProduct(id: string) {
    const next = new Set(form.extraFitsProductIds);
    next.delete(id);
    update("extraFitsProductIds", next);
  }

  const selectedCats = Array.from(form.extraFitsCategoryIds)
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is CategoryTreeNode => !!c);
  const selectedProds = Array.from(form.extraFitsProductIds)
    .map((id) => existingProducts.find((p) => p.id === id))
    .filter((p): p is ExistingComponent => !!p);

  const filteredProducts = existingProducts.filter((p) => {
    if (form.extraFitsProductIds.has(p.id)) return false;
    if (!productQuery.trim()) return true;
    const q = productQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.productCode.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3">
      {/* Kategorie — chipy + dodaj */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
          Dodatkowe kategorie ({selectedCats.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selectedCats.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-violet-100 text-violet-800 text-[11px] font-medium ring-1 ring-violet-200"
            >
              {c.name}
              <button
                type="button"
                onClick={() => removeCategory(c.id)}
                className="size-3.5 grid place-items-center rounded-full hover:bg-violet-200"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setCatPickerOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full ring-1 ring-dashed ring-slate-300 text-[11px] text-slate-600 hover:bg-violet-50 hover:ring-violet-300"
          >
            <Plus className="size-3" />
            Dodaj kategorię
          </button>
        </div>
      </div>

      {/* Produkty — chipy + dodaj */}
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
          Konkretne produkty ({selectedProds.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selectedProds.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-medium ring-1 ring-indigo-200"
            >
              <Package className="size-2.5" />
              {p.name}
              <button
                type="button"
                onClick={() => removeProduct(p.id)}
                className="size-3.5 grid place-items-center rounded-full hover:bg-indigo-200"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              setProductQuery("");
              setProdPickerOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full ring-1 ring-dashed ring-slate-300 text-[11px] text-slate-600 hover:bg-indigo-50 hover:ring-indigo-300"
          >
            <Plus className="size-3" />
            Dodaj produkt
          </button>
        </div>
      </div>

      {/* Mini-info */}
      <p className="text-[10px] text-slate-500 leading-snug">
        Komponent pasuje też do tych dodatkowych kategorii (auto-link do
        produktów w nich) oraz konkretnych produktów. Można pominąć — gdy
        wystarcza główna kategoria z Step 1.
      </p>

      {/* Modal kategorii — 3-kolumnowy picker z checkboxami (multi-select) */}
      <Dialog open={catPickerOpen} onOpenChange={setCatPickerOpen}>
        <DialogContent className="!max-w-[min(96vw,1100px)] sm:!max-w-[min(96vw,1100px)] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              Dodaj kategorie (komponent będzie też pasował do produktów w
              zaznaczonych)
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-[400px] flex border rounded-lg overflow-hidden divide-x divide-slate-200">
            {/* Kolumna 1: Główna */}
            <PickerColumn
              title="Kategoria główna"
              items={lvl1}
              staging={pickerStaging}
              onToggle={togglePickerStaging}
              activeId={pickerL1}
              onActivate={(id) => {
                setPickerL1(id);
                setPickerL2(null);
              }}
              levelLabel="Główna"
              levelColor="bg-violet-100 text-violet-800 ring-violet-200"
              emptyLabel="Brak kategorii"
            />
            {/* Kolumna 2: Podkategoria */}
            <PickerColumn
              title="Podkategoria"
              items={lvl2}
              staging={pickerStaging}
              onToggle={togglePickerStaging}
              activeId={pickerL2}
              onActivate={(id) => setPickerL2(id)}
              levelLabel="Podkategoria"
              levelColor="bg-sky-100 text-sky-800 ring-sky-200"
              emptyLabel={
                pickerL1 ? "Brak podkategorii" : "← Wybierz kategorię główną"
              }
            />
            {/* Kolumna 3: Typ */}
            <PickerColumn
              title="Typ produktu"
              items={lvl3}
              staging={pickerStaging}
              onToggle={togglePickerStaging}
              activeId={null}
              onActivate={() => {}}
              levelLabel="Typ"
              levelColor="bg-emerald-100 text-emerald-800 ring-emerald-200"
              emptyLabel={
                pickerL2 ? "Brak typów" : "← Wybierz podkategorię"
              }
            />
          </div>

          {/* Stopka z licznikiem + akcje */}
          <div className="flex items-center justify-between gap-2 pt-3 border-t">
            <div className="text-xs">
              {pickerStaging.size === 0 ? (
                <span className="text-slate-500 italic">
                  Brak zaznaczonych — odznacz wszystkie żeby wyczyścić
                </span>
              ) : (
                <span className="text-slate-700">
                  Zaznaczonych:{" "}
                  <strong className="text-violet-700 tabular-nums">
                    {pickerStaging.size}
                  </strong>{" "}
                  kategorii
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCatPickerOpen(false)}
              >
                Anuluj
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={commitStaging}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                Zapisz wybór
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal produktów */}
      <Dialog open={prodPickerOpen} onOpenChange={setProdPickerOpen}>
        <DialogContent className="!max-w-[min(96vw,640px)] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              Dodaj konkretne produkty
            </DialogTitle>
          </DialogHeader>
          <Input
            type="search"
            placeholder="Szukaj po nazwie lub SKU…"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            autoFocus
          />
          <div className="flex-1 overflow-y-auto ring-1 ring-slate-200 rounded-md">
            {filteredProducts.length === 0 ? (
              <div className="text-xs text-muted-foreground italic p-6 text-center">
                {existingProducts.length === 0
                  ? "Brak produktów w bibliotece."
                  : "Brak pasujących produktów."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 text-[10px] uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Nazwa</th>
                    <th className="px-3 py-2 text-left font-semibold w-32">
                      Kod
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p, i) => (
                    <tr
                      key={p.id}
                      onClick={() => {
                        addProduct(p.id);
                        setProductQuery("");
                      }}
                      className={cn(
                        "cursor-pointer border-t border-slate-100 hover:bg-indigo-50 transition-colors",
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                      )}
                    >
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {p.productCode}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setProdPickerOpen(false)}
            >
              Zamknij
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Kolumna 3-kolumnowego pickera kategorii (z checkboxami multi-select)
function PickerColumn({
  title,
  items,
  staging,
  onToggle,
  activeId,
  onActivate,
  levelLabel,
  levelColor,
  emptyLabel,
}: {
  title: string;
  items: CategoryTreeNode[];
  staging: Set<string>;
  onToggle: (id: string) => void;
  activeId: string | null;
  onActivate: (id: string) => void;
  levelLabel: string;
  levelColor: string;
  emptyLabel: string;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-white">
      <div className="px-3 py-2 border-b bg-slate-50/80 text-[10px] uppercase tracking-wide font-semibold text-slate-600">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="flex-1 grid place-items-center p-4 text-xs text-muted-foreground italic text-center">
          {emptyLabel}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {items.map((c) => {
            const checked = staging.has(c.id);
            const isActive = activeId === c.id;
            return (
              <li key={c.id} className="px-2.5 py-1.5">
                <div
                  className={cn(
                    "group flex items-center gap-2 px-1.5 py-1 rounded transition-colors",
                    isActive && "bg-violet-50 ring-1 ring-violet-200",
                    !isActive && "hover:bg-slate-50",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(c.id)}
                    className="shrink-0"
                    id={`pcat-${c.id}`}
                  />
                  <button
                    type="button"
                    onClick={() => onActivate(c.id)}
                    className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                  >
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ring-1",
                        levelColor,
                      )}
                    >
                      {levelLabel}
                    </span>
                    <span
                      className={cn(
                        "text-sm truncate",
                        checked && "text-violet-900 font-semibold",
                      )}
                    >
                      {c.name}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Step 2 (komponent): Pasuje do ──────────────────────────────────

function Step2ComponentFitsTo({
  form,
  update,
  componentCategoryOptions,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  componentCategoryOptions: ComponentCategoryNode[];
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg ring-1 ring-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900">
        Komponent zostanie automatycznie dopisany do każdego produktu z
        wybranych kategorii (oraz ich pod-kategorii). Reguły są live — nowe
        produkty w tych kategoriach też dostaną komponent.
      </div>
      <ComponentCategoryPicker
        categories={componentCategoryOptions}
        selected={form.fitsCategoryIds}
        onChange={(next) => update("fitsCategoryIds", next)}
        quantityPerProduct={Number(form.quantityPerProduct) || 1}
        onQuantityChange={(n) =>
          update("quantityPerProduct", String(Math.max(1, n)))
        }
      />
    </div>
  );
}

// ─── Step 2 (produkt): Pakowanie ───────────────────────────────────

function Step2Packaging({
  form,
  update,
  availableBoxes,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  availableBoxes: BoxOption[];
}) {
  const rigidBoxes = availableBoxes.filter((b) => b.packagingType === "BOX");
  const foliopaki = availableBoxes.filter(
    (b) => b.packagingType === "POLY_BAG",
  );

  const isShippingBox = form.shippingMode === "BOX";
  const isShippingFoliopak = form.shippingMode === "FOLIOPAK";
  const isSameAsImport = form.shippingMode === "SAME_AS_IMPORT";

  function setShippingMode(mode: FormState["shippingMode"]) {
    update("shippingMode", mode);
    // Czyść pola innych trybów
    if (mode !== "BOX") update("shippingBoxId", null);
    if (mode !== "FOLIOPAK") update("foliopakId", null);
    // Auto-default importSubMode na podstawie shipping mode
    if (mode === "SAME_AS_IMPORT") {
      update("importSubMode", "SINGLE");
    } else if (mode === "BOX" || mode === "FOLIOPAK") {
      update("importSubMode", "FACTORY_CARTON");
    }
  }

  return (
    <div className="space-y-5">
      {/* ── SEKCJA A: PAKOWANIE WYSYŁKOWE ───────────────────────── */}
      <div className="rounded-lg ring-1 ring-indigo-200 bg-gradient-to-br from-indigo-50/60 to-sky-50/60 p-3.5 space-y-1">
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <Truck className="size-4" />
          Pakowanie wysyłkowe (do klienta końcowego)
        </div>
        <p className="text-[11px] text-indigo-800/80 leading-snug">
          Wymiary + waga tej paczki zostaną użyte przez kalkulator kurierski
          (InPost, DPD, DHL). Wybierz JEDNĄ z trzech opcji.
        </p>
      </div>

      {/* 3 tryby wysyłki — mutex (sticky cards z radio-like UX) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ShippingModeCard
          active={isShippingBox}
          onClick={() => setShippingMode("BOX")}
          icon={ShoppingBag}
          title="Produkowany w Polsce (karton)"
          description="Sztywny karton produkowany w PL — produkt przyjeżdża z Chin osobno (luzem lub w innym kartonie) i jest przepakowywany na magazynie"
          theme="indigo"
        >
          {isShippingBox && (
            <InlineBoxPicker
              boxes={availableBoxes}
              packagingFilter="BOX"
              originFilter="POLAND"
              collectiveFilter={false}
              selectedId={form.shippingBoxId}
              onSelect={(id) => update("shippingBoxId", id)}
              theme="indigo"
              quickAddType="BOX"
              quickAddLabel="Dodaj nowy karton polski wysyłkowy"
              quickAddDefaultOrigin="POLAND"
              quickAddDefaultIsCollective={false}
              quickAddDefaultPurposeText={form.name}
            />
          )}
        </ShippingModeCard>

        <ShippingModeCard
          active={isShippingFoliopak}
          onClick={() => setShippingMode("FOLIOPAK")}
          icon={Mail}
          title="Foliopak (PL)"
          description="Woreczek pocztowy produkowany w PL — produkt przyjeżdża z Chin osobno i jest przepakowywany"
          theme="rose"
        >
          {isShippingFoliopak && (
            <InlineBoxPicker
              boxes={availableBoxes}
              packagingFilter="POLY_BAG"
              originFilter="POLAND"
              collectiveFilter={false}
              selectedId={form.foliopakId}
              onSelect={(id) => update("foliopakId", id)}
              theme="rose"
              quickAddType="POLY_BAG"
              quickAddLabel="Dodaj nowy foliopak (PL)"
              quickAddDefaultOrigin="POLAND"
              quickAddDefaultIsCollective={false}
              quickAddDefaultPurposeText={form.name}
            />
          )}
        </ShippingModeCard>

        <ShippingModeCard
          active={isSameAsImport}
          onClick={() => setShippingMode("SAME_AS_IMPORT")}
          icon={Package}
          title="Ten sam co importowy"
          description="Wysyłka w tym samym kartonie który przyszedł z Chin — bez przepakowywania"
          theme="amber"
        >
          {isSameAsImport && (
            <InlineBoxPicker
              boxes={availableBoxes}
              originFilter="CHINA_STANDARD"
              collectiveFilter={false}
              selectedId={form.factoryBoxId}
              onSelect={(id) => update("factoryBoxId", id)}
              theme="amber"
              quickAddType="BOX"
              quickAddLabel="Dodaj nowy karton chiński importowy"
              quickAddDefaultOrigin="CHINA_STANDARD"
              quickAddDefaultIsCollective={false}
              quickAddDefaultPurposeText={form.name}
            />
          )}
        </ShippingModeCard>
      </div>

    </div>
  );
}

function ShippingModeCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
  theme,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Truck;
  title: string;
  description: string;
  theme: "indigo" | "rose" | "amber";
  children?: React.ReactNode;
}) {
  const themeClasses = {
    indigo: {
      ringActive: "ring-2 ring-indigo-400 bg-indigo-50/70",
      iconBg: "bg-indigo-100 text-indigo-600",
      titleActive: "text-indigo-900",
    },
    rose: {
      ringActive: "ring-2 ring-rose-400 bg-rose-50/70",
      iconBg: "bg-rose-100 text-rose-600",
      titleActive: "text-rose-900",
    },
    amber: {
      ringActive: "ring-2 ring-amber-400 bg-amber-50/70",
      iconBg: "bg-amber-100 text-amber-600",
      titleActive: "text-amber-900",
    },
  }[theme];

  return (
    <div
      className={cn(
        "rounded-lg ring-1 transition-all flex flex-col h-full overflow-hidden",
        active ? themeClasses.ringActive : "ring-slate-200 bg-white",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="p-2.5 text-left flex items-start gap-2 hover:bg-slate-50/50 transition-colors"
      >
        <div
          className={cn(
            "size-7 rounded-md grid place-items-center shrink-0",
            themeClasses.iconBg,
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-xs font-semibold leading-tight",
              active && themeClasses.titleActive,
            )}
          >
            {title}{" "}
            {active && (
              <Check className="size-3 inline text-emerald-600 ml-0.5" />
            )}
          </div>
          <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">
            {description}
          </p>
        </div>
      </button>
      {active && children && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-slate-200/60 bg-white/60">
          {children}
        </div>
      )}
    </div>
  );
}

function BoxPicker({
  label,
  description,
  icon: Icon,
  theme,
  boxes,
  emptyLabel,
  selectedId,
  onSelect,
}: {
  label: string;
  description: string;
  icon: typeof Package;
  theme: "indigo" | "amber" | "rose";
  boxes: BoxOption[];
  emptyLabel?: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const themeClasses = {
    indigo: {
      iconBg: "bg-indigo-100 text-indigo-600",
      ringSelected: "ring-2 ring-indigo-400 bg-indigo-50",
      titleSelected: "text-indigo-900",
      buttonAccent: "text-indigo-700 hover:bg-indigo-50",
    },
    amber: {
      iconBg: "bg-amber-100 text-amber-600",
      ringSelected: "ring-2 ring-amber-400 bg-amber-50",
      titleSelected: "text-amber-900",
      buttonAccent: "text-amber-700 hover:bg-amber-50",
    },
    rose: {
      iconBg: "bg-rose-100 text-rose-600",
      ringSelected: "ring-2 ring-rose-400 bg-rose-50",
      titleSelected: "text-rose-900",
      buttonAccent: "text-rose-700 hover:bg-rose-50",
    },
  }[theme];

  const selectedBox = boxes.find((b) => b.id === selectedId);

  return (
    <>
      <div
        className={cn(
          "p-2.5 rounded-lg ring-1 transition-all flex flex-col h-full",
          selectedBox
            ? themeClasses.ringSelected
            : "ring-slate-200 bg-slate-50/50",
        )}
      >
        <div className="flex items-start gap-2 mb-2">
          <div
            className={cn(
              "size-7 rounded-md grid place-items-center shrink-0",
              themeClasses.iconBg,
            )}
          >
            <Icon className="size-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <Label className="text-xs font-semibold leading-tight">
              {label}
            </Label>
            <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">
              {description}
            </p>
          </div>
        </div>

        {/* Preview wybranego pudełka */}
        {selectedBox ? (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 p-2 rounded-md bg-white ring-1 ring-slate-200">
              <div
                className={cn(
                  "text-[11px] font-semibold truncate",
                  themeClasses.titleSelected,
                )}
              >
                {selectedBox.name}
              </div>
              {selectedBox.internalCode && (
                <div className="text-[9px] font-mono text-muted-foreground truncate">
                  {selectedBox.internalCode}
                </div>
              )}
              <div className="text-[9px] text-slate-500 tabular-nums mt-0.5">
                {selectedBox.widthCm}×{selectedBox.heightCm}×
                {selectedBox.depthCm} cm
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className={cn(
                  "flex-1 text-[10px] px-2 py-1 rounded transition-colors font-medium",
                  themeClasses.buttonAccent,
                )}
              >
                Zmień
              </button>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="text-[10px] px-2 py-1 rounded text-slate-500 hover:bg-slate-100"
                title="Usuń wybór"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className={cn(
              "flex-1 min-h-[60px] w-full px-2 py-2 rounded-md ring-1 ring-dashed ring-slate-300 text-[11px] text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 font-medium",
              themeClasses.buttonAccent,
            )}
          >
            <Package className="size-3.5" />
            Wybierz
          </button>
        )}
      </div>

      {/* Modal wyboru pudełek */}
      <BoxPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={label}
        boxes={boxes}
        emptyLabel={emptyLabel}
        selectedId={selectedId}
        theme={theme}
        onSelect={(id) => {
          onSelect(id);
          setPickerOpen(false);
        }}
      />
    </>
  );
}

// ─── InlineBoxPicker — preview w kafelku + modal z listą + quick-add ──

export function InlineBoxPicker({
  boxes,
  selectedId,
  onSelect,
  theme,
  /** Filtr — które pudełka pokazać (BOX, POLY_BAG lub null = wszystkie) */
  packagingFilter,
  /** Nazwa typu pudełka do quick-add (BOX dla kartonów, POLY_BAG dla foliopaków) */
  quickAddType,
  /** Etykieta przycisku "Dodaj nowy" — np. "+ Dodaj nowy karton" */
  quickAddLabel,
  /** Domyślne pochodzenie nowego pudełka przy quick-add */
  quickAddDefaultOrigin = "POLAND",
  /** Domyślnie zbiorcze przy quick-add (dla pickerów master kartonów) */
  quickAddDefaultIsCollective = false,
  /** Domyślne „Przeznaczenie" — np. nazwa produktu z kontekstu wizard'a. */
  quickAddDefaultPurposeText = "",
  /** Filtr origin: POLAND lub CHINA_STANDARD (null = oba) */
  originFilter,
  /** Filtr po isCollective: true = tylko zbiorcze, false = tylko pojedyncze, null = oba */
  collectiveFilter,
}: {
  boxes: BoxOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: "indigo" | "rose" | "amber";
  packagingFilter?: "BOX" | "POLY_BAG";
  quickAddType: "BOX" | "POLY_BAG";
  quickAddLabel: string;
  quickAddDefaultOrigin?: "POLAND" | "CHINA_STANDARD";
  quickAddDefaultIsCollective?: boolean;
  quickAddDefaultPurposeText?: string;
  originFilter?: "POLAND" | "CHINA_STANDARD";
  collectiveFilter?: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  // Lokalna lista świeżo utworzonych pudełek — żeby preview pokazał wybrany
  // box natychmiast po quick-add, zanim router.refresh() przepropaguje
  const [extraBoxes, setExtraBoxes] = useState<BoxOption[]>([]);
  const allBoxes = [
    ...boxes,
    ...extraBoxes.filter((eb) => !boxes.some((b) => b.id === eb.id)),
  ];
  const selectedBox = allBoxes.find((b) => b.id === selectedId) ?? null;

  const changeBtnClasses = {
    indigo: "text-indigo-700 hover:bg-indigo-100/60",
    rose: "text-rose-700 hover:bg-rose-100/60",
    amber: "text-amber-700 hover:bg-amber-100/60",
  }[theme];

  return (
    <>
      {selectedBox ? (
        (() => {
          const kind = getBoxKind({
            packagingType: selectedBox.packagingType,
            origin: selectedBox.origin,
            isCollective: selectedBox.isCollective,
          });
          const kindMeta = BOX_KIND_META[kind];
          const KindIcon = kindMeta.icon;
          return (
            <div className="rounded-md bg-white/60 ring-1 ring-slate-200/80 px-3 py-2 transition-all">
              <div className="space-y-1.5">
                {/* Wymiary */}
                <div className="flex items-baseline gap-2">
                  <Check
                    className="size-3.5 text-emerald-600 shrink-0 translate-y-0.5"
                    strokeWidth={3}
                  />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium w-28 shrink-0">
                    Wymiary (cm)
                  </span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums flex items-center gap-1.5">
                    {selectedBox.widthCm} × {selectedBox.heightCm} ×{" "}
                    {selectedBox.depthCm}
                    {selectedBox.packagingType === "BOX" &&
                      selectedBox.cardboardLayers && (
                        <span className="inline-flex items-center px-1 py-0 rounded text-[9px] uppercase tracking-wide bg-orange-100 text-orange-800 ring-1 ring-orange-200">
                          {selectedBox.cardboardLayers}-W
                        </span>
                      )}
                  </span>
                </div>
                {/* Przeznaczenie */}
                <div className="flex items-baseline gap-2">
                  <span className="size-3.5 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium w-28 shrink-0">
                    Przeznaczenie
                  </span>
                  <span
                    className={cn(
                      "text-xs truncate",
                      selectedBox.purposeText && selectedBox.purposeText.trim() !== ""
                        ? "text-slate-700 italic"
                        : "text-slate-400 italic",
                    )}
                  >
                    {selectedBox.purposeText && selectedBox.purposeText.trim() !== ""
                      ? selectedBox.purposeText
                      : "—"}
                  </span>
                </div>
                {/* Typ */}
                <div className="flex items-baseline gap-2">
                  <span className="size-3.5 shrink-0" />
                  <span className="text-[10px] uppercase tracking-wide text-slate-500 font-medium w-28 shrink-0">
                    Typ
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ring-1",
                      kindMeta.badgeClass,
                    )}
                  >
                    <KindIcon className="size-3" />
                    {kindMeta.label}
                  </span>
                </div>
                {/* Zmień */}
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className={cn(
                      "text-[11px] font-medium transition-colors hover:underline",
                      changeBtnClasses,
                    )}
                  >
                    Zmień
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="w-full px-3 py-2.5 rounded-md ring-1 ring-dashed ring-slate-300 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Package className="size-3.5" />
          Otwórz listę pudełek…
        </button>
      )}

      <InlineBoxPickerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        boxes={allBoxes}
        packagingFilter={packagingFilter}
        originFilter={originFilter}
        collectiveFilter={collectiveFilter}
        selectedId={selectedId}
        theme={theme}
        quickAddType={quickAddType}
        quickAddLabel={quickAddLabel}
        quickAddDefaultOrigin={quickAddDefaultOrigin}
        quickAddDefaultIsCollective={quickAddDefaultIsCollective}
        quickAddDefaultPurposeText={quickAddDefaultPurposeText}
        onSelect={(id) => {
          onSelect(id);
          setModalOpen(false);
        }}
        onBoxCreated={(newBox) => {
          setExtraBoxes((prev) => [...prev, newBox]);
        }}
      />
    </>
  );
}

function InlineBoxPickerModal({
  open,
  onOpenChange,
  boxes,
  packagingFilter,
  originFilter,
  collectiveFilter,
  selectedId,
  theme,
  quickAddType,
  quickAddLabel,
  quickAddDefaultOrigin = "POLAND",
  quickAddDefaultIsCollective = false,
  quickAddDefaultPurposeText = "",
  onSelect,
  onBoxCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxes: BoxOption[];
  packagingFilter?: "BOX" | "POLY_BAG";
  originFilter?: "POLAND" | "CHINA_STANDARD";
  collectiveFilter?: boolean;
  selectedId: string | null;
  theme: "indigo" | "rose" | "amber";
  quickAddType: "BOX" | "POLY_BAG";
  quickAddLabel: string;
  quickAddDefaultOrigin?: "POLAND" | "CHINA_STANDARD";
  quickAddDefaultIsCollective?: boolean;
  quickAddDefaultPurposeText?: string;
  onSelect: (id: string) => void;
  onBoxCreated?: (newBox: BoxOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const filtered = boxes
    .filter((b) =>
      packagingFilter ? b.packagingType === packagingFilter : true,
    )
    .filter((b) => (originFilter ? b.origin === originFilter : true))
    .filter((b) =>
      collectiveFilter === undefined
        ? true
        : !!b.isCollective === collectiveFilter,
    )
    .filter((b) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        b.name.toLowerCase().includes(q) ||
        (b.internalCode?.toLowerCase().includes(q) ?? false)
      );
    });

  const themeClasses = {
    indigo: {
      rowActive: "bg-indigo-100/70 ring-1 ring-indigo-300",
      rowTitle: "text-indigo-900",
      addBtn: "ring-indigo-300 text-indigo-700 hover:bg-indigo-50",
    },
    rose: {
      rowActive: "bg-rose-100/70 ring-1 ring-rose-300",
      rowTitle: "text-rose-900",
      addBtn: "ring-rose-300 text-rose-700 hover:bg-rose-50",
    },
    amber: {
      rowActive: "bg-amber-100/70 ring-1 ring-amber-300",
      rowTitle: "text-amber-900",
      addBtn: "ring-amber-300 text-amber-700 hover:bg-amber-50",
    },
  }[theme];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,720px)] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            Wybierz pudełko z biblioteki
          </DialogTitle>
        </DialogHeader>

        <Input
          type="search"
          placeholder="Szukaj po nazwie lub kodzie…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="flex-1 overflow-y-auto ring-1 ring-slate-200 rounded-md">
          {filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground italic p-6 text-center">
              {boxes.length === 0
                ? "Brak pudełek w bibliotece. Użyj przycisku poniżej."
                : query
                  ? `Brak pasujących do: ${query}`
                  : "Brak pudełek tego typu"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 text-[10px] uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold w-40">
                    Typ
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Nazwa</th>
                  <th className="px-3 py-2 text-left font-semibold w-24">
                    Kod
                  </th>
                  <th className="px-3 py-2 text-right font-semibold w-32">
                    Wymiary
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => {
                  const isSelected = selectedId === b.id;
                  const kind = getBoxKind({
                    packagingType: b.packagingType,
                    origin: b.origin,
                    isCollective: b.isCollective,
                  });
                  const meta = BOX_KIND_META[kind];
                  const KindIcon = meta.icon;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelect(b.id)}
                      className={cn(
                        "cursor-pointer border-t border-slate-100 transition-colors",
                        isSelected
                          ? themeClasses.rowActive
                          : i % 2 === 0
                            ? "bg-white hover:bg-slate-50"
                            : "bg-slate-50/40 hover:bg-slate-100/50",
                      )}
                    >
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded ring-1 px-1.5 py-0.5 text-[10px] font-semibold",
                            meta.badgeClass,
                          )}
                        >
                          <KindIcon className="size-3" />
                          {meta.label}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 font-medium",
                          isSelected && themeClasses.rowTitle,
                        )}
                      >
                        {b.name}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {b.internalCode ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                        {b.widthCm}×{b.heightCm}×{b.depthCm} cm
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <button
          type="button"
          onClick={() => setQuickAddOpen(true)}
          className={cn(
            "w-full px-3 py-2 rounded-md ring-1 border-dashed text-xs flex items-center justify-center gap-1.5 transition-colors",
            themeClasses.addBtn,
          )}
        >
          <Plus className="size-3.5" />
          {quickAddLabel}
        </button>

        <QuickAddBoxDialog
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          packagingType={quickAddType}
          defaultOrigin={quickAddDefaultOrigin}
          defaultIsCollective={quickAddDefaultIsCollective}
          defaultPurposeText={quickAddDefaultPurposeText}
          onCreated={(newBox) => {
            setQuickAddOpen(false);
            onBoxCreated?.(newBox);
            onSelect(newBox.id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function QuickAddBoxDialog({
  open,
  onOpenChange,
  packagingType,
  defaultOrigin = "POLAND",
  defaultIsCollective = false,
  defaultPurposeText = "",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packagingType: "BOX" | "POLY_BAG";
  /** Domyślne pochodzenie — zależy od kontekstu (PL dla wysyłkowych, CHN dla importowych) */
  defaultOrigin?: "POLAND" | "CHINA_STANDARD";
  /** Domyślnie zbiorcze? — dla picker'a master kartonów */
  defaultIsCollective?: boolean;
  /** Domyślne „Przeznaczenie" — auto-fill gdy dodajemy pudełko z kontekstu
   *  produktu (np. nazwa produktu). User może edytować przed zapisem. */
  defaultPurposeText?: string;
  /** Zwraca pełny obiekt nowego pudełka — żeby preview działał od razu,
   *  bez czekania na router.refresh() */
  onCreated: (newBox: BoxOption) => void;
}) {
  const [name, setName] = useState("");
  const [purposeText, setPurposeText] = useState(defaultPurposeText);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [depth, setDepth] = useState("");
  const [weight, setWeight] = useState("");
  const [origin, setOrigin] = useState<"POLAND" | "CHINA_STANDARD">(
    defaultOrigin,
  );
  const [isCollective, setIsCollective] = useState(defaultIsCollective);
  const [pricePln, setPricePln] = useState("");
  const [printFile, setPrintFile] = useState<File | null>(null);
  const printInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setName("");
      setPurposeText(defaultPurposeText);
      setWidth("");
      setHeight("");
      setDepth("");
      setWeight("");
      setOrigin(defaultOrigin);
      // Foliopak nie ma odmiany zbiorczej
      setIsCollective(packagingType === "POLY_BAG" ? false : defaultIsCollective);
      // Chińskie domyślnie 0 zł (sugestia — można zmienić)
      setPricePln(defaultOrigin === "CHINA_STANDARD" ? "0" : "");
      setPrintFile(null);
    }
  }, [open, defaultOrigin, defaultIsCollective, packagingType, defaultPurposeText]);

  const isPoly = packagingType === "POLY_BAG";
  const isChina = origin === "CHINA_STANDARD";

  function changeOrigin(next: "POLAND" | "CHINA_STANDARD") {
    setOrigin(next);
    // Przy przełączeniu na Chiny — zasugeruj 0 zł (user może zmienić)
    if (next === "CHINA_STANDARD" && pricePln.trim() === "") setPricePln("0");
  }

  function handleCreate() {
    if (!name.trim()) {
      toast.error("Podaj nazwę");
      return;
    }
    const w = Number(width);
    const h = Number(height);
    const d = Number(depth);
    if (!w || w <= 0 || !h || h <= 0 || !d || d <= 0) {
      toast.error("Podaj wymiary (>0)");
      return;
    }
    startTransition(async () => {
      try {
        const finalIsCollective = isPoly ? false : isCollective;
        const priceNum =
          pricePln.trim() === "" ? null : Number(pricePln);
        const result = await createShippingBoxAction({
          name: name.trim(),
          packagingType,
          // Foliopak nigdy nie jest zbiorczy — serwer też to wymusza, ale dopilnujmy w UI
          isCollective: finalIsCollective,
          origin,
          widthCm: w,
          heightCm: h,
          depthCm: d,
          weightKg: weight ? Number(weight) : null,
          purchasePricePln: priceNum,
          purposeText: purposeText.trim() || null,
        });
        if (typeof result === "object" && "id" in result && result.id) {
          if (printFile) {
            const fd = new FormData();
            fd.set("file", printFile);
            await uploadShippingBoxPrintAction(result.id, fd).catch((e) => {
              toast.error(
                e instanceof Error
                  ? `Pudełko OK, ale nie udało się wysłać nadruku: ${e.message}`
                  : "Pudełko OK, ale nadruk nie został wysłany",
              );
            });
          }
          toast.success(
            isPoly ? "Foliopak utworzony" : "Pudełko utworzone",
          );
          router.refresh();
          // Konstruujemy BoxOption z formularza — żeby InlineBoxPicker mógł
          // pokazać preview natychmiast, zanim router.refresh() dotrze do parenta
          onCreated({
            id: result.id,
            name: name.trim(),
            internalCode: null,
            packagingType,
            origin,
            isCollective: finalIsCollective,
            widthCm: w,
            heightCm: h,
            depthCm: d,
            cardboardLayers: null,
            purchasePricePln: priceNum,
          });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Błąd zapisu");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,500px)]">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Plus className="size-4 text-emerald-600" />
            Szybko dodaj nowe{" "}
            {isPoly ? "foliopak" : "pudełko"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Minimum do biblioteki. Notatki/warstwy uzupełnisz w sekcji{" "}
          <strong>Pudełka</strong>.
        </p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="qab-name" className="text-sm">
              Nazwa <span className="text-red-500">*</span>
            </Label>
            <Input
              id="qab-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isPoly ? "np. Foliopak M (260×350)" : "np. Karton 30×20×10"
              }
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qab-purpose" className="text-sm">
              Przeznaczenie
            </Label>
            <Input
              id="qab-purpose"
              value={purposeText}
              onChange={(e) => setPurposeText(e.target.value)}
              placeholder='np. nazwa produktu albo „Hamaki do jogi 4,5,6 m"'
            />
          </div>

          {/* Pochodzenie + zbiorcze (zbiorczego nie ma dla foliopaka) */}
          <div className={cn("grid gap-2", isPoly ? "grid-cols-1" : "grid-cols-2")}>
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
                      ? "bg-white shadow-sm ring-1 ring-slate-200 text-rose-700"
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

          {/* Cena zakupu — dla Chin sugerujemy 0 zł, ale można zmienić */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-600">
              Cena zakupu PLN{" "}
              {isChina && (
                <span className="text-rose-600 normal-case">
                  (sugerowane 0 zł — wliczone w import)
                </span>
              )}
            </Label>
            <div className="relative max-w-[180px]">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={pricePln}
                onChange={(e) => setPricePln(e.target.value)}
                placeholder={isChina ? "0" : "np. 1.50"}
                className="font-mono h-8 text-sm pr-10"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                zł
              </span>
            </div>
          </div>
          <div className="grid gap-2 grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                Szer. cm *
              </Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="font-mono h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                Wys. cm *
              </Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="font-mono h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                {isPoly ? "Grub. cm *" : "Głęb. cm *"}
              </Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                className="font-mono h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                Waga kg
              </Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="font-mono h-8 text-sm"
                placeholder="opt."
              />
            </div>
          </div>

          {/* Plik nadruku — opcjonalny */}
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-slate-600">
              Plik nadruku (PDF lub grafika) — opcjonalny
            </Label>
            {printFile ? (
              <div className="flex items-center justify-between gap-2 rounded-md ring-1 ring-indigo-200 bg-indigo-50/50 px-2.5 py-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-800 truncate">
                  <Paperclip className="size-3.5" />
                  {printFile.name}
                  <span className="text-[10px] text-indigo-600/70">
                    ({(printFile.size / 1024).toFixed(0)} kB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPrintFile(null);
                    if (printInputRef.current)
                      printInputRef.current.value = "";
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
                Dodaj plik nadruku
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
        </div>
        <div className="flex justify-end gap-2 pt-2">
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
            onClick={handleCreate}
            disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
          >
            <Plus className="size-3.5" />
            {pending ? "Tworzę..." : "Utwórz i wybierz"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BoxPickerModal({
  open,
  onOpenChange,
  title,
  boxes,
  emptyLabel,
  selectedId,
  theme,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  boxes: BoxOption[];
  emptyLabel?: string;
  selectedId: string | null;
  theme: "indigo" | "amber" | "rose";
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const themeClasses = {
    indigo: {
      ringSelected: "ring-2 ring-indigo-400 bg-indigo-50",
      titleSelected: "text-indigo-900",
    },
    amber: {
      ringSelected: "ring-2 ring-amber-400 bg-amber-50",
      titleSelected: "text-amber-900",
    },
    rose: {
      ringSelected: "ring-2 ring-rose-400 bg-rose-50",
      titleSelected: "text-rose-900",
    },
  }[theme];

  const filtered = boxes.filter((b) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.internalCode?.toLowerCase().includes(q) ?? false)
    );
  });

  // Reset query when modal closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[min(96vw,720px)] sm:!max-w-[min(96vw,720px)] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <Input
            type="search"
            placeholder="Szukaj po nazwie lub kodzie…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          {boxes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic p-6 ring-1 ring-dashed ring-slate-200 rounded-md text-center">
              {emptyLabel ?? "Brak pudełek w bibliotece"}. Dodaj w sekcji
              „Pudełka" przed tworzeniem produktu.
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-muted-foreground italic p-6 text-center">
              Brak pudełek pasujących do „{query}".
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto ring-1 ring-slate-200 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-slate-100 sticky top-0 z-10">
                  <tr className="text-left text-slate-600 text-[10px] uppercase tracking-wide">
                    <th className="px-3 py-2 font-semibold w-8"></th>
                    <th className="px-2 py-2 font-semibold">Nazwa</th>
                    <th className="px-2 py-2 font-semibold w-28">Kod</th>
                    <th className="px-2 py-2 font-semibold w-32 text-right">
                      Wymiary
                    </th>
                    <th className="px-2 py-2 font-semibold w-20">Typ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => {
                    const isSelected = selectedId === b.id;
                    return (
                      <tr
                        key={b.id}
                        onClick={() => onSelect(b.id)}
                        className={cn(
                          "cursor-pointer transition-colors border-t border-slate-100",
                          isSelected
                            ? themeClasses.ringSelected
                            : i % 2 === 0
                              ? "bg-white hover:bg-slate-50"
                              : "bg-slate-50/50 hover:bg-slate-100/50",
                        )}
                      >
                        <td className="px-3 py-2 text-center">
                          {isSelected ? (
                            <Check className="size-4 inline-block text-emerald-600" />
                          ) : (
                            <span className="size-3.5 rounded-full ring-1 ring-slate-300 inline-block" />
                          )}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 font-medium",
                            isSelected && themeClasses.titleSelected,
                          )}
                        >
                          {b.name}
                        </td>
                        <td className="px-2 py-2 font-mono text-[10px] text-slate-500">
                          {b.internalCode ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                          {b.widthCm}×{b.heightCm}×{b.depthCm} cm
                        </td>
                        <td className="px-2 py-2 text-[10px]">
                          {b.packagingType === "POLY_BAG" ? (
                            <span className="inline-flex items-center rounded bg-rose-100 text-rose-700 px-1.5 py-0.5 font-semibold">
                              Foliopak
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded bg-slate-200 text-slate-700 px-1.5 py-0.5 font-semibold">
                              Karton
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step 3: Import ────────────────────────────────────────────────

function Step3Import({
  form,
  update,
  availableBoxes,
  isComponent,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  availableBoxes: BoxOption[];
  isComponent: boolean;
}) {
  // Dla PRODUKTU: nowy flow z pod-trybami zależnymi od shippingMode
  if (!isComponent) {
    return (
      <Step3ImportProduct
        form={form}
        update={update}
        availableBoxes={availableBoxes}
      />
    );
  }
  const factoryBox = availableBoxes.find((b) => b.id === form.factoryBoxId);
  const unitsPerBox = Number(form.unitsPerBox) || 1;
  const unitsPerContainer = Number(form.unitsPerContainer) || 0;
  const refM3 = Number(form.referenceContainerM3) || 68;

  // Auto wyliczenie CBM dla podpowiedzi — komponenty i produkty teraz oba używają factoryBox
  const cbmKarton = factoryBox
    ? cbmFromBox(
        factoryBox.widthCm,
        factoryBox.heightCm,
        factoryBox.depthCm,
        unitsPerBox,
      )
    : null;
  const cbmLuzem =
    refM3 > 0 && unitsPerContainer > 0 ? refM3 / unitsPerContainer : null;

  // Komponent: nowy flow w stylu produkt Step 3 — SectionStep + PackingModeCard
  if (isComponent) {
    return (
      <div className="space-y-5">
        {/* Banner kontekstu */}
        <div className="rounded-md ring-1 ring-violet-200 bg-violet-50/40 px-3 py-2 text-[11px] text-violet-900 leading-snug">
          <strong>Komponent</strong> jest częścią towaru. Kalkulacja importu
          (CBM, koszty kontenera) wlicza się w produkt którego ten komponent
          stanowi część.
        </div>

        {/* Sekcja 1: wybór trybu importu */}
        <SectionStep number="1" title="Jak importowany komponent?">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <PackingModeCard
              active={form.importMode === "KARTON"}
              onClick={() => update("importMode", "KARTON")}
              title="W kartonie z Chin"
              description="Komponent przyjeżdża w kartonie. Podajesz wymiary kartonu + ile szt w kartonie."
              theme="emerald"
            />
            <PackingModeCard
              active={form.importMode === "LUZEM"}
              onClick={() => update("importMode", "LUZEM")}
              title="Luzem w kontenerze"
              description="Bez kartonu — produkt układany luzem w kontenerze (kalkulator szt/CBM)."
              theme="violet"
            />
          </div>
        </SectionStep>

        {/* Sekcja 2A: KARTON — wybór z biblioteki + szt */}
        {form.importMode === "KARTON" && (
          <SectionStep number="2" title="Karton zbiorczy z Chin">
            <p className="text-[11px] text-slate-600 leading-snug mb-2">
              💡 Wybierz karton zbiorczy (master) który przychodzi z Chin
              i wpisz ile sztuk komponentu się w nim mieści.
            </p>
            <div className="rounded-md ring-1 ring-emerald-200/60 bg-emerald-50/30 p-2.5 space-y-3">
              <InlineBoxPicker
                boxes={availableBoxes}
                originFilter="CHINA_STANDARD"
                collectiveFilter={true}
                selectedId={form.factoryBoxId}
                onSelect={(id) => update("factoryBoxId", id)}
                theme="amber"
                quickAddType="BOX"
                quickAddLabel="Dodaj nowy karton zbiorczy z Chin"
                quickAddDefaultOrigin="CHINA_STANDARD"
                quickAddDefaultIsCollective={true}
                quickAddDefaultPurposeText={form.name}
              />
              {factoryBox && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-600">
                      Sztuk w kartonie <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.unitsPerBox}
                      onChange={(e) => update("unitsPerBox", e.target.value)}
                      className="font-mono h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-slate-600">
                      CBM / sztuka (auto)
                    </Label>
                    <div className="font-mono text-sm bg-white ring-1 ring-slate-200 px-2.5 py-1.5 rounded-md h-8 flex items-center">
                      {cbmKarton?.toFixed(4) ?? "—"} m³
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionStep>
        )}

        {/* Sekcja 2B: LUZEM — kalkulator CBM */}
        {form.importMode === "LUZEM" && (
          <SectionStep number="2" title="Kontener (kalkulator CBM)">
            <p className="text-[11px] text-slate-600 leading-snug mb-2">
              💡 Podaj dowolny CBM odniesienia + ile sztuk się w nim mieści —
              CBM/szt wyliczy się automatycznie.
            </p>
            <div className="rounded-md ring-1 ring-violet-200/60 bg-violet-50/30 p-2.5 space-y-3">
              <div className="flex justify-end gap-1 mb-1">
                <button
                  type="button"
                  onClick={() => update("referenceContainerM3", "28")}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ring-1 transition-colors ${
                    form.referenceContainerM3 === "28"
                      ? "bg-violet-600 text-white ring-violet-600"
                      : "bg-white text-violet-700 ring-violet-300 hover:bg-violet-100"
                  }`}
                >
                  20&apos; (28 m³)
                </button>
                <button
                  type="button"
                  onClick={() => update("referenceContainerM3", "68")}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ring-1 transition-colors ${
                    form.referenceContainerM3 === "68"
                      ? "bg-violet-600 text-white ring-violet-600"
                      : "bg-white text-violet-700 ring-violet-300 hover:bg-violet-100"
                  }`}
                >
                  40&apos; (68 m³)
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600">
                    CBM odniesienia <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      value={form.referenceContainerM3}
                      onChange={(e) =>
                        update("referenceContainerM3", e.target.value)
                      }
                      className="font-mono h-8 text-sm pr-10"
                      placeholder="np. 68"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                      m³
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    40' = 68 m³ · 20' = 28 m³
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600">
                    Sztuk w tym CBM <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.unitsPerContainer}
                    onChange={(e) => update("unitsPerContainer", e.target.value)}
                    className="font-mono h-8 text-sm"
                    placeholder="np. 1500"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600">
                    CBM / sztuka (auto)
                  </Label>
                  <div className="font-mono text-sm bg-white ring-1 ring-slate-200 px-2.5 py-1.5 rounded-md h-8 flex items-center">
                    {cbmLuzem?.toFixed(4) ?? "—"} m³
                  </div>
                </div>
              </div>
            </div>
          </SectionStep>
        )}
      </div>
    );
  }

  // STARY KOMPONENTOWY FLOW (dead — zachowuję dla TS, niżej jest produkt branch)
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm">Sposób importu z Chin</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <TypeCard
            active={form.importMode === "KARTON"}
            onClick={() => update("importMode", "KARTON")}
            icon={Package}
            title="W pudełku (karton)"
            description="Produkt przychodzi w kartonach. Wymiary kartonu = z pudełka wybranego w kroku 2."
            theme="emerald"
          />
          <TypeCard
            active={form.importMode === "LUZEM"}
            onClick={() => update("importMode", "LUZEM")}
            icon={Layers}
            title="Luzem"
            description="Bez kartonu. Podajesz ile sztuk mieści się w kontenerze 40' — z tego liczone CBM/szt."
            theme="violet"
          />
        </div>
      </div>

      {form.importMode === "KARTON" ? (
        <div className="space-y-3 rounded-lg ring-1 ring-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <Package className="size-4" />
            Karton importowy
          </div>
          {factoryBox ? (
            <div className="space-y-2">
              <div className="text-xs text-slate-700">
                <strong>{factoryBox.name}</strong>{" "}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {factoryBox.internalCode ?? ""}
                </span>
              </div>
              <div className="text-[11px] tabular-nums text-slate-600">
                Wymiary: {factoryBox.widthCm}×{factoryBox.heightCm}×
                {factoryBox.depthCm} cm
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-units-per-box" className="text-xs">
                    Sztuk w kartonie <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="wiz-units-per-box"
                    type="number"
                    min={1}
                    value={form.unitsPerBox}
                    onChange={(e) => update("unitsPerBox", e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CBM / sztuka (auto)</Label>
                  <div className="font-mono text-sm bg-white ring-1 ring-slate-200 px-3 py-1.5 rounded-md">
                    {cbmKarton ? cbmKarton.toFixed(4) : "—"} m³
                  </div>
                </div>
              </div>

              {/* Master karton — opcjonalny zewnętrzny */}
              <MasterCartonSection form={form} update={update} />
            </div>
          ) : (
            <div className="text-xs text-orange-700 bg-orange-50 ring-1 ring-orange-200 rounded-md p-2.5">
              ⚠ Wróć do kroku 2 i wybierz pudełko z Chin — wymiary kartonu
              importowego są z niego dziedziczone.
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg ring-1 ring-violet-200 bg-violet-50/40 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
            <Layers className="size-4" />
            Luzem (bez kartonu)
          </div>
          <p className="text-[11px] text-violet-800/80 leading-snug -mt-1">
            Podaj dowolny CBM odniesienia i ile sztuk się w nim mieści — CBM
            na sztukę wyliczy się automatycznie (np. 68 m³ to pełny kontener
            40', 28 m³ to 20').
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wiz-ref-m3" className="text-xs">
                CBM odniesienia <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="wiz-ref-m3"
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.referenceContainerM3}
                  onChange={(e) =>
                    update("referenceContainerM3", e.target.value)
                  }
                  className="font-mono pr-10"
                  placeholder="np. 68"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                  m³
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                40' = 68 m³ · 20' = 28 m³ · własne = dowolne
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-units-container" className="text-xs">
                Sztuk w tym CBM <span className="text-red-500">*</span>
              </Label>
              <Input
                id="wiz-units-container"
                type="number"
                min={1}
                value={form.unitsPerContainer}
                onChange={(e) => update("unitsPerContainer", e.target.value)}
                className="font-mono"
                placeholder="np. 1500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CBM / sztuka (auto)</Label>
              <div className="font-mono text-sm bg-white ring-1 ring-slate-200 px-3 py-1.5 rounded-md">
                {cbmLuzem ? cbmLuzem.toFixed(4) : "—"} m³
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="wiz-duty" className="text-sm">
          Stawka cła (%)
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="wiz-duty"
            type="number"
            step="0.1"
            min={0}
            max={100}
            value={form.customsDutyPct}
            onChange={(e) => update("customsDutyPct", e.target.value)}
            placeholder={
              form.customsDutyAuto != null
                ? `auto: ${(form.customsDutyAuto * 100).toFixed(1)}`
                : "np. 8.5"
            }
            className="font-mono max-w-[160px]"
          />
          {form.customsDutyAuto != null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                update(
                  "customsDutyPct",
                  (form.customsDutyAuto! * 100).toString(),
                )
              }
              className="gap-1.5 text-xs"
            >
              <Settings2 className="size-3" />
              Wstaw z kategorii ({(form.customsDutyAuto * 100).toFixed(1)}%)
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Auto-uzupełniane z kategorii. Możesz nadpisać dla tego produktu.
        </p>
      </div>
    </div>
  );
}

// ─── Step 4: Ceny ──────────────────────────────────────────────────

// ─── Karta wyboru sposobu pakowania z SVG ilustracją ──────────────

function PackingModeCard({
  active,
  onClick,
  title,
  description,
  theme,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
  theme: "emerald" | "violet" | "amber";
}) {
  const themeClasses = {
    emerald: {
      ringActive: "ring-2 ring-emerald-400 bg-emerald-50/70",
      titleActive: "text-emerald-900",
    },
    violet: {
      ringActive: "ring-2 ring-violet-400 bg-violet-50/70",
      titleActive: "text-violet-900",
    },
    amber: {
      ringActive: "ring-2 ring-amber-400 bg-amber-50/70",
      titleActive: "text-amber-900",
    },
  }[theme];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg ring-1 text-left transition-all p-3 flex items-start gap-2",
        active
          ? themeClasses.ringActive
          : "ring-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm font-semibold leading-tight flex items-center gap-1.5",
            active && themeClasses.titleActive,
          )}
        >
          {title}
          {active && <Check className="size-3.5 text-emerald-600 shrink-0" />}
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
          {description}
        </p>
      </div>
    </button>
  );
}


// ─── Step 3 dla PRODUKTU: 4 pod-tryby zależnie od shippingMode ─────

function Step3ImportProduct({
  form,
  update,
  availableBoxes,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  availableBoxes: BoxOption[];
}) {
  const isSameAsImport = form.shippingMode === "SAME_AS_IMPORT";
  const isShippingPL =
    form.shippingMode === "BOX" || form.shippingMode === "FOLIOPAK";

  // Auto-init sub-mode jeśli nie ma
  useEffect(() => {
    if (!form.importSubMode) {
      if (isSameAsImport) update("importSubMode", "SINGLE");
      else if (isShippingPL) update("importSubMode", "FACTORY_CARTON");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.shippingMode]);

  // Dla SAME_AS_IMPORT — factoryBox jest też wysyłkowy (auto-link)
  // Dla BOX/FOLIOPAK — factoryBox to osobny karton importowy (jeśli FACTORY_CARTON)
  const factoryBox = availableBoxes.find((b) => b.id === form.factoryBoxId);
  const unitsPerBox = Number(form.unitsPerBox) || 1;
  const refM3 = Number(form.referenceContainerM3) || 68;
  const unitsPerContainer = Number(form.unitsPerContainer) || 0;
  const cbmBulk =
    unitsPerContainer > 0 ? refM3 / unitsPerContainer : null;

  return (
    <div className="space-y-5">
      {/* Banner kontekstu */}
      <div className="rounded-md ring-1 ring-slate-200 bg-slate-50/60 px-3 py-2 text-xs flex items-center gap-2">
        <span className="text-slate-500 uppercase font-semibold text-[10px] shrink-0">
          ⮐ Wysyłka:
        </span>
        <span className="font-medium text-slate-800">
          {form.shippingMode === "BOX" && "Produkowany w PL (karton)"}
          {form.shippingMode === "FOLIOPAK" && "Foliopak (PL)"}
          {form.shippingMode === "SAME_AS_IMPORT" &&
            "Ten sam co importowy (bez przepakowywania)"}
        </span>
      </div>

      {/* SAME_AS_IMPORT → KARTON, sub: SINGLE | MASTER */}
      {isSameAsImport && (
        <SameAsImportSubModes
          form={form}
          update={update}
          availableBoxes={availableBoxes}
          factoryBox={factoryBox}
          unitsPerBox={unitsPerBox}
        />
      )}

      {/* BOX/FOLIOPAK → KARTON (factory) lub LUZEM (container) */}
      {isShippingPL && (
        <ShippingPLSubModes
          form={form}
          update={update}
          availableBoxes={availableBoxes}
          factoryBox={factoryBox}
          unitsPerBox={unitsPerBox}
          refM3={refM3}
          unitsPerContainer={unitsPerContainer}
          cbmBulk={cbmBulk}
        />
      )}

    </div>
  );
}

// Pomocniczy wrapper sekcji z numerem i tytułem — używa się w Step 3/4
function SectionStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="size-5 rounded-full bg-slate-800 text-white text-[10px] font-bold grid place-items-center shrink-0">
          {number}
        </span>
        <Label className="text-sm font-semibold text-slate-800">{title}</Label>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function SameAsImportSubModes({
  form,
  update,
  availableBoxes,
  factoryBox,
  unitsPerBox,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  availableBoxes: BoxOption[];
  factoryBox: BoxOption | undefined;
  unitsPerBox: number;
}) {
  const isSingle = form.importSubMode === "SINGLE";
  const isMaster = form.importSubMode === "MASTER";

  // CBM podpowiedź
  const cbmSingle = factoryBox
    ? cbmFromBox(
        factoryBox.widthCm,
        factoryBox.heightCm,
        factoryBox.depthCm,
        unitsPerBox,
      )
    : null;
  const cbmMaster = factoryBox
    ? cbmFromMasterBox(
        Number(form.masterBoxWidthCm) || null,
        Number(form.masterBoxHeightCm) || null,
        Number(form.masterBoxDepthCm) || null,
        Number(form.innerBoxesPerMaster) || null,
        unitsPerBox,
      )
    : null;

  return (
    <div className="space-y-3">
      <SectionStep number="1" title="Jak importowane z Chin?">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <PackingModeCard
            active={isSingle}
            onClick={() => update("importSubMode", "SINGLE")}
            title="Pojedyncze kartony"
            description="Każdy karton z N sztukami produktu przyjeżdża osobno (kontener wypełniony pojedynczymi kartonami)"
            theme="emerald"
          />
          <PackingModeCard
            active={isMaster}
            onClick={() => update("importSubMode", "MASTER")}
            title="W zbiorczym kartonie"
            description="N kartonów produktu spakowanych w jeszcze większe pudło (zbiorczy karton) dla transportu"
            theme="amber"
          />
        </div>
      </SectionStep>

      {/* Sekcja 2: Karton z Chin (auto-przypisany z Step 2) + szt */}
      <SectionStep
        number="2"
        title={
          isMaster
            ? "Karton z N sztukami produktu (z Step 2)"
            : "Karton z Chin (z Step 2)"
        }
      >
        {isMaster && (
          <p className="text-[11px] text-slate-600 leading-snug mb-2">
            💡 Ten karton (z N sztukami produktu) jest pakowany w karton
            zbiorczy w sekcji 3.
          </p>
        )}
        {factoryBox ? (
          <div className="rounded-md ring-1 ring-amber-200/60 bg-amber-50/30 p-2.5 space-y-3">
            <div className="rounded-md bg-white/60 ring-1 ring-slate-200/80 px-2.5 py-1.5 flex items-center gap-2">
              <Check className="size-3.5 text-emerald-600 shrink-0" strokeWidth={3} />
              <div className="min-w-0 flex-1 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-slate-800 tabular-nums">
                  {factoryBox.widthCm}×{factoryBox.heightCm}×{factoryBox.depthCm}
                  <span className="text-[10px] text-slate-500 font-normal ml-0.5">cm</span>
                </span>
                <span className="text-[10px] text-slate-500 truncate flex-1 min-w-0">
                  {factoryBox.name}
                </span>
                {isMaster && (
                  <span className="text-[9px] uppercase tracking-wide font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded shrink-0">
                    PROD.
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label htmlFor="wiz-units-per-box" className="text-[11px] text-slate-600">
                  Sztuk w 1 kartonie <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="wiz-units-per-box"
                  type="number"
                  min={1}
                  value={form.unitsPerBox}
                  onChange={(e) => update("unitsPerBox", e.target.value)}
                  className="font-mono h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">CBM / sztuka (auto)</Label>
                <div className="font-mono text-sm bg-white ring-1 ring-slate-200 px-2.5 py-1.5 rounded-md h-8 flex items-center">
                  {(isMaster ? cbmMaster : cbmSingle)?.toFixed(4) ?? "—"} m³
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-orange-700 bg-orange-50 ring-1 ring-orange-200 rounded-md p-2">
            ⚠ Wróć do kroku 2 i wybierz karton z Chin
          </div>
        )}
      </SectionStep>

      {/* Sekcja 3: Karton zbiorczy (tylko gdy MASTER sub-mode) — wybór z biblioteki */}
      {isMaster && (
        <SectionStep
          number="3"
          title={
            form.productionCountry === "PL"
              ? "Wielkość kartonu zbiorczego"
              : "Karton zbiorczy"
          }
        >
          <p className="text-[11px] text-slate-600 leading-snug mb-2">
            {form.productionCountry === "PL"
              ? "Wybierz karton zbiorczy z biblioteki PL i podaj ile prod. kartonów (z sekcji 2) się w nim mieści."
              : "Wybierz karton zbiorczy z biblioteki (kartony z Chin, oznaczone jako zbiorcze) i podaj ile prod. kartonów (z sekcji 2) się w nim mieści."}
          </p>
          <div className="rounded-md ring-1 ring-orange-200/60 bg-orange-50/30 p-2.5 space-y-3">
            <InlineBoxPicker
              boxes={availableBoxes}
              originFilter={
                form.productionCountry === "PL"
                  ? "POLAND"
                  : "CHINA_STANDARD"
              }
              collectiveFilter={true}
              selectedId={form.masterBoxId}
              onSelect={(id) => {
                update("masterBoxId", id);
                // Auto-kopiuj wymiary wybranego pudełka do form fields
                const picked = availableBoxes.find((b) => b.id === id);
                if (picked) {
                  update("masterBoxWidthCm", String(picked.widthCm));
                  update("masterBoxHeightCm", String(picked.heightCm));
                  update("masterBoxDepthCm", String(picked.depthCm));
                  // Auto-fill ile prod. kartonów w zbiorczym — pole konfigurowane
                  // w karcie pudełek (master → inner). Nie nadpisuj jeśli user
                  // już ręcznie wpisał własną wartość.
                  if (
                    picked.innerBoxesPerMaster != null &&
                    picked.innerBoxesPerMaster > 0 &&
                    !form.innerBoxesPerMaster
                  ) {
                    update(
                      "innerBoxesPerMaster",
                      String(picked.innerBoxesPerMaster),
                    );
                  }
                }
              }}
              theme="amber"
              quickAddType="BOX"
              quickAddLabel={
                form.productionCountry === "PL"
                  ? "Dodaj nowy karton zbiorczy PL"
                  : "Dodaj nowy karton zbiorczy z Chin"
              }
              quickAddDefaultOrigin={
                form.productionCountry === "PL"
                  ? "POLAND"
                  : "CHINA_STANDARD"
              }
              quickAddDefaultIsCollective={true}
              quickAddDefaultPurposeText={form.name}
            />
            <div className="space-y-1 max-w-[260px]">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                Ile prod. kartonów w zbiorczym *
              </Label>
              <Input
                type="number"
                min={1}
                step="1"
                value={form.innerBoxesPerMaster}
                onChange={(e) =>
                  update("innerBoxesPerMaster", e.target.value)
                }
                className="font-mono h-8 text-sm bg-white"
                placeholder="np. 10"
              />
              {Number(form.innerBoxesPerMaster) > 0 &&
                Number(form.unitsPerBox) > 0 && (
                  <p className="text-[10px] text-orange-700 mt-1">
                    → Razem w 1 zbiorczym:{" "}
                    <strong>
                      {Number(form.innerBoxesPerMaster) *
                        Number(form.unitsPerBox)}{" "}
                      szt produktu
                    </strong>{" "}
                    ({form.innerBoxesPerMaster} prod. × {form.unitsPerBox}{" "}
                    szt/prod.)
                  </p>
                )}
            </div>
          </div>
        </SectionStep>
      )}
    </div>
  );
}

function ShippingPLSubModes({
  form,
  update,
  availableBoxes,
  factoryBox,
  unitsPerBox,
  refM3,
  unitsPerContainer,
  cbmBulk,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  availableBoxes: BoxOption[];
  factoryBox: BoxOption | undefined;
  unitsPerBox: number;
  refM3: number;
  unitsPerContainer: number;
  cbmBulk: number | null;
}) {
  const isFactoryCarton = form.importSubMode === "FACTORY_CARTON";
  const isBulkContainer = form.importSubMode === "BULK_CONTAINER";

  const cbmKarton = factoryBox
    ? cbmFromBox(
        factoryBox.widthCm,
        factoryBox.heightCm,
        factoryBox.depthCm,
        unitsPerBox,
      )
    : null;

  // Kraj produkcji wpływa na etykiety i filtry pudełek w kroku 3.
  const isPL = form.productionCountry === "PL";
  const originFilter: "POLAND" | "CHINA_STANDARD" = isPL
    ? "POLAND"
    : "CHINA_STANDARD";

  return (
    <div className="space-y-3">
      {/* Sekcja 1: wybór trybu importu */}
      <SectionStep
        number="1"
        title={isPL ? "Jak wysyłany z fabryki" : "Jak importowany z Chin?"}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <PackingModeCard
            active={isFactoryCarton}
            onClick={() => update("importSubMode", "FACTORY_CARTON")}
            title={isPL ? "W kartonach" : "Luzem w kartonach z Chin"}
            description={
              isPL
                ? "Produkt jedzie w kartonach z fabryki, do przepakowywania na miejscu"
                : "Produkt jedzie luzem (wiele sztuk) w fabrycznych kartonach z Chin, przepakowywany w PL"
            }
            theme="emerald"
          />
          <PackingModeCard
            active={isBulkContainer}
            onClick={() => update("importSubMode", "BULK_CONTAINER")}
            title={isPL ? "Luzem" : "Luzem w kontenerze"}
            description={
              isPL
                ? "Np. w aucie lub na palecie, bez opakowania"
                : "Bez kartonu — produkt układany luzem w kontenerze (kalkulator szt/40')"
            }
            theme="violet"
          />
        </div>
      </SectionStep>

      {/* Sekcja 2A: FACTORY_CARTON — wybór kartonu zbiorczego + szt */}
      {isFactoryCarton && (
        <SectionStep
          number="2"
          title={isPL ? "Wielkość kartonu zbiorczego" : "Karton zbiorczy z Chin"}
        >
          <p className="text-[11px] text-slate-600 leading-snug mb-2">
            💡{" "}
            {isPL
              ? "Wybierz karton zbiorczy z biblioteki PL, w który fabryka pakuje produkt, oraz ile sztuk się w nim mieści."
              : "Wybierz karton zbiorczy (master) który przychodzi z Chin i wpisz ile sztuk się w nim mieści."}
          </p>
          <div className="rounded-md ring-1 ring-emerald-200/60 bg-emerald-50/30 p-2.5 space-y-3">
            <InlineBoxPicker
              boxes={availableBoxes}
              originFilter={originFilter}
              collectiveFilter={true}
              selectedId={form.factoryBoxId}
              onSelect={(id) => update("factoryBoxId", id)}
              theme="amber"
              quickAddType="BOX"
              quickAddLabel={
                isPL
                  ? "Dodaj nowy karton zbiorczy PL"
                  : "Dodaj nowy karton zbiorczy z Chin"
              }
              quickAddDefaultOrigin={originFilter}
              quickAddDefaultIsCollective={true}
              quickAddDefaultPurposeText={form.name}
            />
            {factoryBox && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="wiz-units-per-box-2" className="text-[11px] text-slate-600">
                    Sztuk w kartonie <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="wiz-units-per-box-2"
                    type="number"
                    min={1}
                    value={form.unitsPerBox}
                    onChange={(e) => update("unitsPerBox", e.target.value)}
                    className="font-mono h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-600">CBM / sztuka (auto)</Label>
                  <div className="font-mono text-sm bg-white ring-1 ring-slate-200 px-2.5 py-1.5 rounded-md h-8 flex items-center">
                    {cbmKarton?.toFixed(4) ?? "—"} m³
                  </div>
                </div>
              </div>
            )}
          </div>
        </SectionStep>
      )}

      {/* Sekcja 2B: BULK_CONTAINER (LUZEM) */}
      {isBulkContainer && (
        <SectionStep number="2" title="Kontener (kalkulator CBM)">
          <p className="text-[11px] text-slate-600 leading-snug mb-2">
            💡 Podaj dowolny CBM odniesienia + ile sztuk się w nim mieści — CBM/szt
            wyliczy się automatycznie.
          </p>
          <div className="rounded-md ring-1 ring-violet-200/60 bg-violet-50/30 p-2.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">
                  CBM odniesienia <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.referenceContainerM3}
                    onChange={(e) =>
                      update("referenceContainerM3", e.target.value)
                    }
                    className="font-mono h-8 text-sm pr-10"
                    placeholder="np. 68"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                    m³
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground">
                  40' = 68 m³ · 20' = 28 m³
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">
                  Sztuk w tym CBM <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={form.unitsPerContainer}
                  onChange={(e) => update("unitsPerContainer", e.target.value)}
                  className="font-mono h-8 text-sm"
                  placeholder="np. 1500"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-600">CBM / sztuka (auto)</Label>
                <div className="font-mono text-sm bg-white ring-1 ring-slate-200 px-2.5 py-1.5 rounded-md h-8 flex items-center">
                  {cbmBulk?.toFixed(4) ?? "—"} m³
                </div>
              </div>
            </div>
          </div>
        </SectionStep>
      )}
    </div>
  );
}

function CustomsDutySection({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="wiz-duty" className="text-sm">
        Stawka cła (%)
      </Label>
      <div className="flex items-center gap-3">
        <Input
          id="wiz-duty"
          type="number"
          step="0.1"
          min={0}
          max={100}
          value={form.customsDutyPct}
          onChange={(e) => update("customsDutyPct", e.target.value)}
          placeholder={
            form.customsDutyAuto != null
              ? `auto: ${(form.customsDutyAuto * 100).toFixed(1)}`
              : "np. 8.5"
          }
          className="font-mono max-w-[160px]"
        />
        {form.customsDutyAuto != null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              update("customsDutyPct", (form.customsDutyAuto! * 100).toString())
            }
            className="gap-1.5 text-xs"
          >
            <Settings2 className="size-3" />
            Z kategorii ({(form.customsDutyAuto * 100).toFixed(1)}%)
          </Button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Auto-uzupełniane z kategorii. Możesz nadpisać dla tego produktu.
      </p>
    </div>
  );
}

// ─── Step 4 (produkt KOMPONENTOWY): Komponenty ─────────────────────

function Step4ProductComponents({
  form,
  update,
  existingComponents,
  componentRules,
  categories,
  // Propsy do inline-uruchomienia pełnego wizard'a komponentu
  componentCategoryOptions,
  categoryDutyMap,
  availableBoxes,
  rates,
  defaultContainerM3,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  existingComponents: ExistingComponent[];
  componentRules: ComponentRule[];
  categories: CategoryTreeNode[];
  componentCategoryOptions?: ComponentCategoryNode[];
  categoryDutyMap: Record<string, number | null>;
  availableBoxes: BoxOption[];
  rates: WizardRates;
  defaultContainerM3: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Wszystkie kategorie-przodkowie wybranej kategorii produktu — reguły
  // dziedziczone wgłąb drzewa, więc komponent dopisany do "Biurka elektryczne"
  // dotyczy też podkategorii "Biurka elektryczne dębowe / 140×80" itp.
  const ancestorCatIds = new Set<string>();
  if (form.categoryId) {
    let cur: string | null = form.categoryId;
    const safety = 20;
    let depth = 0;
    while (cur && depth < safety) {
      ancestorCatIds.add(cur);
      const node = categories.find((c) => c.id === cur);
      cur = node?.parentId ?? null;
      depth++;
    }
  }
  // Sugerowane komponenty = te z reguł kategorii produktu (przodkowie też)
  const suggestedComponents: { component: ExistingComponent; quantity: number }[] =
    [];
  if (form.categoryId) {
    const seen = new Set<string>();
    for (const rule of componentRules) {
      if (!ancestorCatIds.has(rule.categoryId)) continue;
      if (seen.has(rule.componentId)) continue;
      const cmp = existingComponents.find((c) => c.id === rule.componentId);
      if (!cmp) continue;
      seen.add(rule.componentId);
      suggestedComponents.push({ component: cmp, quantity: rule.quantity });
    }
  }

  const selectedIds = new Set(form.selectedComponents.map((sc) => sc.componentId));
  const totalQty = form.selectedComponents.reduce((s, sc) => s + sc.quantity, 0);
  const required = Number(form.requiredComponentsTotal) || 0;
  const isComplete = required > 0 && totalQty === required;

  function addComponent(component: ExistingComponent, quantity: number = 1) {
    if (selectedIds.has(component.id)) {
      toast.info("Komponent już dodany — zmień ilość w liście poniżej");
      return;
    }
    update("selectedComponents", [
      ...form.selectedComponents,
      {
        componentId: component.id,
        name: component.name,
        quantity: Math.max(1, quantity),
        poolCategoryIds: [],
        poolProductIds: [],
        allowVariants: true,
      },
    ]);
  }

  function updateComponentQty(componentId: string, qty: number) {
    update(
      "selectedComponents",
      form.selectedComponents.map((sc) =>
        sc.componentId === componentId
          ? { ...sc, quantity: Math.max(1, qty) }
          : sc,
      ),
    );
  }

  function removeComponent(componentId: string) {
    update(
      "selectedComponents",
      form.selectedComponents.filter((sc) => sc.componentId !== componentId),
    );
  }

  function updateComponentPool(
    componentId: string,
    pool: {
      allowVariants: boolean;
      poolCategoryIds: string[];
      poolProductIds: string[];
    },
  ) {
    update(
      "selectedComponents",
      form.selectedComponents.map((sc) =>
        sc.componentId === componentId ? { ...sc, ...pool } : sc,
      ),
    );
  }

  return (
    <div className="space-y-4">
      {/* Liczba komponentów wymaganych — input */}
      <div className="rounded-lg ring-2 ring-violet-300 bg-gradient-to-br from-violet-50 to-white p-3 space-y-2 shadow-sm">
        <Label
          htmlFor="wiz-req-components-step4"
          className="text-sm font-semibold text-violet-900 flex items-center gap-1.5"
        >
          <Component className="size-4 text-violet-700" />
          Ile komponentów składa się na 1 produkt?{" "}
          <span className="text-red-500">*</span>
        </Label>
        <div className="relative max-w-[200px]">
          <Input
            id="wiz-req-components-step4"
            type="number"
            min={1}
            step="1"
            value={form.requiredComponentsTotal}
            onChange={(e) =>
              update("requiredComponentsTotal", e.target.value)
            }
            placeholder="np. 4"
            className="font-mono text-base font-bold tabular-nums pr-12 h-11 bg-white ring-violet-200 focus-visible:ring-violet-500 text-violet-900"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-violet-600 font-medium pointer-events-none">
            szt
          </span>
        </div>
        <p className="text-[10px] text-violet-800/80 leading-snug">
          Łączna liczba sztuk komponentów potrzebnych do skompletowania
          jednego gotowego egzemplarza (np. stół 4-nogi = 4: blat + 3 nogi).
          Wpływa na pasek postępu poniżej.
        </p>
      </div>

      {/* Pasek postępu */}
      <div
        className={cn(
          "rounded-lg ring-1 p-3 transition-colors",
          isComplete
            ? "ring-emerald-300 bg-emerald-50/60"
            : "ring-violet-200 bg-violet-50/40",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <strong>
              Dodaj komponenty żeby skompletować {required || "?"} szt
            </strong>{" "}
            wymaganych dla 1 egzemplarza produktu.
          </div>
          <div
            className={cn(
              "text-lg font-bold tabular-nums shrink-0",
              isComplete ? "text-emerald-700" : "text-violet-700",
            )}
          >
            {totalQty}/{required || "?"}
            {isComplete && <Check className="size-5 inline-block ml-1" />}
          </div>
        </div>
        {required > 0 && (
          <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden ring-1 ring-slate-200">
            <div
              className={cn(
                "h-full transition-all",
                isComplete
                  ? "bg-emerald-500"
                  : totalQty > required
                    ? "bg-orange-500"
                    : "bg-violet-500",
              )}
              style={{
                width: `${Math.min(100, (totalQty / required) * 100)}%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Sugerowane komponenty (z reguł kategorii) */}
      {suggestedComponents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide font-bold text-slate-600">
            <Sparkles className="size-3.5 text-amber-500" />
            Sugerowane (z reguł kategorii)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestedComponents.map(({ component, quantity }) => {
              const isAdded = selectedIds.has(component.id);
              return (
                <button
                  key={component.id}
                  type="button"
                  onClick={() => !isAdded && addComponent(component, quantity)}
                  disabled={isAdded}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs ring-1 transition-colors",
                    isAdded
                      ? "bg-emerald-100 text-emerald-700 ring-emerald-200 cursor-default"
                      : "bg-white text-slate-700 ring-slate-300 hover:bg-amber-50 hover:ring-amber-300 cursor-pointer",
                  )}
                >
                  {isAdded ? (
                    <Check className="size-3" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  <span className="font-medium">{component.name}</span>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    ×{quantity}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista dodanych komponentów */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-wide font-bold text-slate-600">
            Dodane komponenty ({form.selectedComponents.length})
          </div>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              <span className="text-xs">
                Z biblioteki (komponenty + produkty)
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuickAddOpen(true)}
              className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50"
            >
              <Sparkles className="size-3.5" />
              <span className="text-xs">Utwórz nowy komponent</span>
            </Button>
          </div>
        </div>

        {form.selectedComponents.length === 0 ? (
          <div className="text-center text-xs text-slate-500 italic p-6 ring-1 ring-dashed ring-slate-200 rounded-md">
            Brak komponentów. Dodaj z sugerowanych ↑ lub kliknij „Z biblioteki"/
            „Utwórz nowy".
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {form.selectedComponents.map((sc) => {
              const meta = existingComponents.find(
                (c) => c.id === sc.componentId,
              );
              const isComponentType = meta?.isComponent ?? true;
              return (
                <div
                  key={sc.componentId}
                  className={cn(
                    "relative rounded-lg ring-1 transition-shadow hover:shadow-md bg-white overflow-hidden",
                    isComponentType
                      ? "ring-violet-200"
                      : "ring-indigo-200",
                  )}
                >
                  {/* Górny pasek z typem */}
                  <div
                    className={cn(
                      "absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] uppercase font-bold tracking-wide ring-1",
                      isComponentType
                        ? "bg-violet-100 text-violet-800 ring-violet-200"
                        : "bg-indigo-100 text-indigo-800 ring-indigo-200",
                    )}
                  >
                    {isComponentType ? (
                      <Component className="size-2.5" />
                    ) : (
                      <Package className="size-2.5" />
                    )}
                    {isComponentType ? "Komp." : "Prod."}
                  </div>

                  {/* Przycisk usuń (prawy góry) */}
                  <button
                    type="button"
                    onClick={() => removeComponent(sc.componentId)}
                    className="absolute top-1 right-1 z-10 size-6 grid place-items-center rounded bg-white/80 hover:bg-red-100 text-red-600 ring-1 ring-slate-200"
                    title="Usuń"
                  >
                    <Trash2 className="size-3" />
                  </button>

                  {/* Grafika lub placeholder ikony */}
                  <div
                    className={cn(
                      "aspect-square w-full grid place-items-center overflow-hidden",
                      isComponentType
                        ? "bg-gradient-to-br from-violet-50 to-violet-100/60"
                        : "bg-gradient-to-br from-indigo-50 to-indigo-100/60",
                    )}
                  >
                    {meta?.primaryImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={meta.primaryImageUrl}
                        alt={sc.name}
                        className="w-full h-full object-cover"
                      />
                    ) : isComponentType ? (
                      <Component className="size-12 text-violet-300" />
                    ) : (
                      <Package className="size-12 text-indigo-300" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 space-y-1.5">
                    <div className="text-xs font-semibold text-slate-900 leading-tight line-clamp-2 min-h-[2.2em]">
                      {sc.name}
                    </div>
                    {meta?.productCode && (
                      <div className="text-[9px] font-mono text-slate-500 truncate">
                        {meta.productCode}
                      </div>
                    )}
                    {/* Pula wariantów — chip + edit */}
                    <WizardSlotPoolChip
                      sc={sc}
                      defaultCategoryId={meta?.categoryId ?? null}
                      categories={categories}
                      existingComponents={existingComponents}
                      onUpdate={(value) => updateComponentPool(sc.componentId, value)}
                    />
                    <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                        Sztuk:
                      </span>
                      <Input
                        type="number"
                        min={1}
                        value={sc.quantity}
                        onChange={(e) =>
                          updateComponentQty(
                            sc.componentId,
                            Number(e.target.value),
                          )
                        }
                        className="h-7 flex-1 text-center font-mono text-sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Picker istniejących komponentów */}
      <LibraryDrillPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Wybierz z biblioteki (komponent lub produkt)"
        items={existingComponents}
        excludedIds={selectedIds}
        categoryTree={categories}
        onPick={(c) => {
          addComponent(c, 1);
          setPickerOpen(false);
        }}
      />

      {/* Pełny wizard tworzenia komponentu (inline) — te same 4 kroki co
          wizard komponentu z głównej strony, otwarty wewnątrz wizarda produktu */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="!max-w-[min(96vw,840px)] sm:!max-w-[min(96vw,840px)] max-h-[92vh] overflow-y-auto p-0">
          <WizardBody
            categories={categories}
            componentCategoryOptions={componentCategoryOptions}
            existingComponents={existingComponents}
            componentRules={componentRules}
            categoryDutyMap={categoryDutyMap}
            availableBoxes={availableBoxes}
            rates={rates}
            defaultContainerM3={defaultContainerM3}
            defaultIsComponent={true}
            onClose={() => setQuickAddOpen(false)}
            onCreated={(created) => {
              setQuickAddOpen(false);
              addComponent(created, 1);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WizardSlotPoolChip({
  sc,
  defaultCategoryId,
  categories,
  existingComponents,
  onUpdate,
}: {
  sc: SelectedComponentEntry;
  defaultCategoryId: string | null;
  categories: CategoryTreeNode[];
  existingComponents: ExistingComponent[];
  onUpdate: (value: {
    allowVariants: boolean;
    poolCategoryIds: string[];
    poolProductIds: string[];
  }) => void;
}) {
  const [open, setOpen] = useState(false);

  // Liczymy variant count client-side dla labela na chipie
  const pool = _resolvePoolClient({
    allowVariants: sc.allowVariants,
    poolCategoryIds: sc.poolCategoryIds,
    poolProductIds: sc.poolProductIds,
    componentId: sc.componentId,
    defaultCategoryId,
    library: existingComponents.map((c) => ({
      id: c.id,
      name: c.name,
      productCode: c.productCode,
      code128: c.code128,
      categoryId: c.categoryId,
    })),
    categoryTree: categories,
  });
  const variantCount = pool.size;

  const defaultCategoryName = defaultCategoryId
    ? categories.find((c) => c.id === defaultCategoryId)?.name ?? null
    : null;

  const sourcesLabel = (() => {
    if (!sc.allowVariants) return "Tylko ten produkt";
    const parts: string[] = [];
    if (sc.poolCategoryIds.length > 0) parts.push(`${sc.poolCategoryIds.length} kat.`);
    if (sc.poolProductIds.length > 0) parts.push(`${sc.poolProductIds.length} prod.`);
    if (parts.length === 0 && defaultCategoryName) {
      parts.push(`Auto: ${defaultCategoryName}`);
    }
    return `${parts.join(" + ")} · ${variantCount} ${variantCount === 1 ? "wariant" : "wariantów"}`;
  })();

  const tone = !sc.allowVariants
    ? "bg-slate-100 text-slate-700 ring-slate-200"
    : variantCount > 1
      ? "bg-violet-100 text-violet-800 ring-violet-200"
      : "bg-amber-100 text-amber-800 ring-amber-200";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ring-1 max-w-full w-full hover:brightness-95 transition-all",
          tone,
        )}
        title="Konfiguruj pulę wariantów slotu"
      >
        <Layers className="size-2.5 shrink-0" />
        <span className="truncate flex-1 text-left">{sourcesLabel}</span>
        <Settings2 className="size-2.5 shrink-0 opacity-70" />
      </button>

      <VariantPoolModal
        open={open}
        onOpenChange={setOpen}
        slotName={sc.name}
        componentId={sc.componentId}
        defaultCategoryId={defaultCategoryId}
        initialValue={{
          allowVariants: sc.allowVariants,
          poolCategoryIds: sc.poolCategoryIds,
          poolProductIds: sc.poolProductIds,
        }}
        categoryTree={categories}
        library={existingComponents.map((c) => ({
          id: c.id,
          name: c.name,
          productCode: c.productCode,
          code128: c.code128,
          categoryId: c.categoryId,
        }))}
        onSave={(value) => {
          onUpdate(value);
          setOpen(false);
        }}
      />
    </>
  );
}

// ─── Master karton (opcjonalny duży karton zewnętrzny) ─────────────

function MasterCartonSection({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  const [enabled, setEnabled] = useState(
    !!form.masterBoxWidthCm ||
      !!form.masterBoxHeightCm ||
      !!form.innerBoxesPerMaster,
  );

  // Disable = zeruj pola
  function handleToggle(next: boolean) {
    setEnabled(next);
    if (!next) {
      update("masterBoxWidthCm", "");
      update("masterBoxHeightCm", "");
      update("masterBoxDepthCm", "");
      update("masterBoxWeightKg", "");
      update("innerBoxesPerMaster", "");
    }
  }

  // Auto CBM master karton / szt (opcjonalna podpowiedź)
  const masterW = Number(form.masterBoxWidthCm) || 0;
  const masterH = Number(form.masterBoxHeightCm) || 0;
  const masterD = Number(form.masterBoxDepthCm) || 0;
  const innerPerMaster = Number(form.innerBoxesPerMaster) || 0;
  const unitsPerInner = Number(form.unitsPerBox) || 0;
  const masterVolume =
    masterW && masterH && masterD ? (masterW * masterH * masterD) / 1e6 : null;
  const totalUnits = innerPerMaster * unitsPerInner;
  const cbmPerUnitMaster =
    masterVolume && totalUnits > 0 ? masterVolume / totalUnits : null;

  return (
    <div className="mt-3 rounded-md ring-1 ring-slate-200 bg-white">
      <button
        type="button"
        onClick={() => handleToggle(!enabled)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-slate-50 transition-colors"
      >
        <div
          className={cn(
            "size-4 rounded grid place-items-center transition-colors shrink-0",
            enabled
              ? "bg-emerald-500 text-white"
              : "bg-slate-200 text-slate-400",
          )}
        >
          {enabled && <Check className="size-3" strokeWidth={3} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
            <Box className="size-3.5 text-emerald-600" />
            Karton zbiorczy (duże pudło z wieloma prod. kartonami){" "}
            <span className="text-[10px] font-normal text-muted-foreground">
              opcjonalne
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Gdy z Chin przychodzi duże pudło zawierające N mniejszych kartonów
            tego produktu (np. zbiorczy = 60×40×30 cm zawiera 10× prod.). CBM/szt
            liczone jest wtedy z kartonu zbiorczego.
          </p>
        </div>
      </button>

      {enabled && (
        <div className="px-3 pb-3 space-y-3">
          {/* Wymiary master kartonu */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ["masterBoxWidthCm", "Szer. cm"],
                ["masterBoxHeightCm", "Wys. cm"],
                ["masterBoxDepthCm", "Głęb. cm"],
                ["masterBoxWeightKg", "Waga kg"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                  {label} <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={form[key]}
                  onChange={(e) => update(key, e.target.value)}
                  className="font-mono h-8 text-sm"
                  placeholder="np. 60"
                />
              </div>
            ))}
          </div>

          {/* Inner per master + auto CBM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                Prod. kartonów w zbiorczym <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                step="1"
                value={form.innerBoxesPerMaster}
                onChange={(e) =>
                  update("innerBoxesPerMaster", e.target.value)
                }
                className="font-mono h-8 text-sm"
                placeholder="np. 10"
              />
              <p className="text-[9px] text-muted-foreground">
                Ile prod. kartonów mieści się w 1 kartonie zbiorczym
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-slate-600">
                CBM/szt ze zbiorczego (auto)
              </Label>
              <div className="font-mono text-sm bg-emerald-50 ring-1 ring-emerald-200 px-3 py-1.5 rounded-md h-8 flex items-center">
                {cbmPerUnitMaster ? (
                  <>
                    <strong className="text-emerald-700">
                      {cbmPerUnitMaster.toFixed(4)}
                    </strong>{" "}
                    <span className="text-[10px] text-slate-500 ml-1">m³</span>
                  </>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              {totalUnits > 0 && masterVolume && (
                <p className="text-[9px] text-emerald-700">
                  {masterVolume.toFixed(3)} m³ ÷ {totalUnits} szt ({innerPerMaster}{" "}
                  prod. × {unitsPerInner} szt/prod.)
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Sekcja ceny z fabryki — pierwotnie osobny krok „Ceny" wizarda, teraz
 * wbudowana w „Podstawowe". Zachowana jako samodzielny komponent żeby
 * łatwo było reusować (np. w edycji produktu) bez duplikowania logiki.
 */
function PriceFromFactorySection({
  form,
  update,
  rates,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  rates: WizardRates;
}) {
  const amount = Number(form.purchasePriceAmount) || 0;
  const meters = Number(form.purchaseProductLengthM) || 0;
  const isPoland = form.productionCountry === "PL";
  const currentRate = isPoland
    ? 1
    : form.purchaseCurrency === "USD"
      ? rates.usd
      : rates.cny;
  // Cena za sztukę: SZT → amount, METER → amount × długość.
  const pricePerUnitFx =
    form.purchasePriceUnit === "METER" ? amount * meters : amount;
  const pricePerUnitPln = currentRate ? pricePerUnitFx * currentRate : null;
  const unitSymbol = isPoland
    ? "zł"
    : form.purchaseCurrency === "USD"
      ? "$"
      : "¥";

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label className="text-sm">
            Cena z fabryki netto <span className="text-red-500">*</span>
          </Label>

          {/* Toggle waluty — tylko dla importu z Chin. PL = stała PLN. */}
          {!isPoland && (
            <div className="inline-flex rounded-lg ring-1 ring-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => update("purchaseCurrency", "USD")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                  form.purchaseCurrency === "USD"
                    ? "bg-white shadow-sm ring-1 ring-slate-200 text-indigo-700"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                $ USD
              </button>
              <button
                type="button"
                onClick={() => update("purchaseCurrency", "CNY")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                  form.purchaseCurrency === "CNY"
                    ? "bg-white shadow-sm ring-1 ring-slate-200 text-rose-700"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                ¥ CNY (Juan)
              </button>
            </div>
          )}

          {/* Toggle jednostki (szt / m) */}
          <div
            className={cn(
              "inline-flex rounded-lg ring-1 ring-slate-200 p-0.5 bg-slate-50",
              !isPoland && "ml-2",
            )}
          >
            <button
              type="button"
              onClick={() => update("purchasePriceUnit", "SZT")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                form.purchasePriceUnit === "SZT"
                  ? "bg-white shadow-sm ring-1 ring-slate-200 text-emerald-700"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              za szt.
            </button>
            <button
              type="button"
              onClick={() => update("purchasePriceUnit", "METER")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                form.purchasePriceUnit === "METER"
                  ? "bg-white shadow-sm ring-1 ring-slate-200 text-amber-700"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              za m
            </button>
          </div>

          {/* Pole ceny + opcjonalnie metry */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Input
                id="wiz-purchase-amount"
                type="number"
                step="0.01"
                min={0}
                value={form.purchasePriceAmount}
                onChange={(e) =>
                  update("purchasePriceAmount", e.target.value)
                }
                placeholder={
                  isPoland
                    ? "np. 89.90"
                    : form.purchaseCurrency === "USD"
                      ? "np. 25.50"
                      : "np. 180.00"
                }
                className={cn(
                  "font-mono max-w-[200px] pr-12",
                  isPoland ? "pl-3" : "pl-7",
                )}
              />
              {!isPoland && (
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">
                  {unitSymbol}
                </span>
              )}
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none uppercase tracking-wide font-semibold">
                {isPoland ? "zł" : ""}
                /{form.purchasePriceUnit === "METER" ? "m" : "szt"}
              </span>
            </div>

            {form.purchasePriceUnit === "METER" && (
              <>
                <span className="text-slate-400">×</span>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.purchaseProductLengthM}
                    onChange={(e) =>
                      update("purchaseProductLengthM", e.target.value)
                    }
                    placeholder="np. 3.0"
                    className="font-mono max-w-[120px] pr-7"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 pointer-events-none font-semibold">
                    m
                  </span>
                </div>
              </>
            )}

            <span className="text-slate-400">=</span>
            {amount > 0 &&
            (form.purchasePriceUnit === "SZT" || meters > 0) ? (
              <span
                className="font-mono font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md ring-1 ring-amber-200"
                title="Końcowa cena za 1 sztukę"
              >
                {isPoland ? "" : unitSymbol}
                {pricePerUnitFx.toFixed(2)}
                {isPoland ? " zł" : ""}{" "}
                <span className="text-[10px] uppercase opacity-70">/szt</span>
              </span>
            ) : (
              <span className="text-slate-400 italic text-xs">
                {form.purchasePriceUnit === "METER"
                  ? "Podaj cenę za metr i długość"
                  : "Podaj cenę za sztukę"}
              </span>
            )}
          </div>

          {/* Konwersja na PLN i kurs — tylko dla CN, PL jest już w PLN */}
          {!isPoland && (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="text-slate-400">→</span>
              {pricePerUnitPln != null && pricePerUnitFx > 0 ? (
                <span className="font-mono font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md ring-1 ring-emerald-200">
                  {pricePerUnitPln.toFixed(2)} zł{" "}
                  <span className="text-[10px] uppercase opacity-70">
                    /szt
                  </span>
                </span>
              ) : currentRate ? (
                <span className="text-slate-400 italic text-xs">
                  Wprowadź kwotę
                </span>
              ) : (
                <span className="text-orange-600 italic text-xs">
                  Kurs NBP niedostępny — kwota zapisana bez przeliczenia
                </span>
              )}
            </div>
          )}

          {!isPoland && currentRate && (
            <p className="text-[10px] text-muted-foreground">
              Kurs NBP{" "}
              {rates.rateDate
                ? `z ${new Date(rates.rateDate).toLocaleDateString("pl-PL")}`
                : "(tabela A)"}
              : 1 {form.purchaseCurrency} = {currentRate.toFixed(4)} zł
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
