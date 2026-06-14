/**
 * Helper liczący pakowanie wysyłkowe dla ZESTAW (compositionMode=ZESTAW).
 *
 * Dwa tryby:
 *  - INDIVIDUAL_PACKAGING — każdy składnik w swoim kartonie wysyłkowym.
 *    Liczymy ile paczek per komponent (qty w zestawie / unitsPerBox), sumujemy
 *    koszty wszystkich kartonów. Np. zestaw stołowy = 1 blat + 1 nogi + 6 krzeseł,
 *    gdzie krzesła pakowane po 2 szt / karton → 1 + 1 + 3 = 5 paczek razem.
 *  - SINGLE_CARTON — cały zestaw w 1 kartonie z biblioteki (bundleShippingBox).
 *
 * Sztywno: dla SKU fulfillmentu zestaw to suma sztuk komponentów (6 krzeseł
 * to 6 SKU, nie 1). Patrz `bundleSkuCount`.
 */

export type BundleComponentInput = {
  componentId: string;
  componentName: string;
  componentCode: string;
  /** Ile sztuk tego komponentu wchodzi w 1 zestaw (ProductComponent.quantity). */
  qtyPerSet: number;
  /** Ile sztuk tego komponentu mieści się w jego primary SHIPPING boxie.
   *  Z `ProductShippingBox.unitsPerBox` lub fallback `Product.unitsPerShippingBox`.
   *  Null = brak pinniętego boxa wysyłkowego. */
  unitsPerBox: number | null;
  /** Dane przypiętego primary SHIPPING boxa (dla wyświetlania). */
  primaryBox: {
    id: string;
    name: string;
    widthCm: number;
    heightCm: number;
    depthCm: number;
    weightKg: number | null;
    purchasePricePln: number | null;
  } | null;
};

export type BundleComponentShippingQuote = {
  /** Najtańsza pasująca usługa kurierska dla 1 paczki tego komponentu. */
  cheapestServiceCode: string;
  cheapestServiceLabel: string;
  cheapestBrand: "INPOST" | "DHL";
  /** Cena netto / brutto za 1 paczkę. */
  perPackageNetto: number;
  perPackageBrutto: number;
  /** Powód wyboru (dla tooltipa). */
  reason: string;
  /** Wymiary użyte do wyceny. */
  packageDims: { w: number; h: number; d: number; weightKg: number };
} | null;

export type BundleComponentPackaging = {
  componentId: string;
  componentName: string;
  componentCode: string;
  qtyPerSet: number;
  /** Sztuk produktu w 1 kartonie. Gdy w bazie null/0 → fallback do 1 (czyli
   *  każda sztuka osobno). Tutaj NIGDY nie jest null — zawsze ≥ 1. */
  unitsPerBox: number;
  /** Liczba kartonów potrzebnych dla tego komponentu w 1 zestawie.
   *  ceil(qtyPerSet / unitsPerBox). Gdy unitsPerBox=null traktujemy jako 1/karton
   *  → packagesNeeded = qtyPerSet (każda sztuka osobno). */
  packagesNeeded: number;
  /** Cena 1 sztuki kartonu (z purchasePricePln) lub null gdy brak ceny w bibliotece. */
  pricePerCarton: number | null;
  /** Łączny koszt kartonów dla tego komponentu w 1 zestawie. Null gdy brak ceny. */
  totalPackagingCost: number | null;
  /** Dane primary SHIPPING boxa (do wyświetlania). */
  box: BundleComponentInput["primaryBox"];
  /** Wycena wysyłki najtańszą usługą — przekazywana z zewnątrz (page.tsx).
   *  Helper sam nie wycenia bo nie ma dostępu do silnika kurierów. */
  shippingQuote?: BundleComponentShippingQuote;
  /** Sumaryczny koszt wysyłki dla tego komponentu (packagesNeeded × perPackageNetto). */
  shippingCostTotal?: number | null;
};

export type BundlePackagingBreakdown = {
  /** Lista per-komponent z pakowania. */
  components: BundleComponentPackaging[];
  /** Suma WSZYSTKICH kartonów potrzebnych w 1 zestawie (sum packagesNeeded). */
  totalPackagesPerSet: number;
  /** Suma kosztu wszystkich kartonów per 1 zestaw. Null gdy któryś komponent
   *  nie ma ceny — wtedy całkowita też nieznana. */
  totalPackagingCostPerSet: number | null;
  /** Ile komponentów ma BRAK przypiętego boxa wysyłkowego. */
  componentsWithoutBox: number;
  /** Ile komponentów ma brak ceny w bibliotece (mamy box, nie mamy ceny). */
  componentsWithoutPrice: number;
  /** Wycena całego wielopaka 1 zestawu — silnik kuriera dostaje wszystkie
   *  paczki ze wszystkich komponentów RAZEM i zwraca najtańszą usługę dla
   *  takiej multi-pack przesyłki. Bez umownej tabeli rabatów = matematycznie
   *  równa sumie per-component, ale architektonicznie gotowe na rabat skali.
   *  Suma per-component zostaje (różnice mogą się pojawić gdy każdy komponent
   *  preferuje inną usługę solo, a wielopak wymusza jedną).
   *  Null = któryś komponent nie ma boxa / żadna usługa nie pasuje. */
  bundleShippingQuote?: {
    serviceCode: string;
    serviceLabel: string;
    brand: "INPOST" | "DHL";
    totalNetPln: number;
    totalGrossPln: number;
    packageCount: number;
    /** Powód wyboru / wyjaśnienie wielopaka. */
    reason: string;
  } | null;
};

/**
 * Liczy pakowanie dla ZESTAW w trybie INDIVIDUAL_PACKAGING.
 * Każdy komponent → ceil(qtyPerSet / unitsPerBox) kartonów × pricePerCarton.
 *
 * Edge cases:
 *  - unitsPerBox=null → packagesNeeded = qtyPerSet (jedna sztuka per karton — fallback)
 *  - pricePerCarton=null → totalPackagingCost dla tego komp = null + flag w summary
 *  - qtyPerSet=0 lub ujemne → packagesNeeded=0 (skip, ale w liście zostaje)
 */
export function computeBundleIndividualPackaging(
  components: BundleComponentInput[],
): BundlePackagingBreakdown {
  let totalPackages = 0;
  let totalCost: number | null = 0;
  let anyCostMissing = false;
  let componentsWithoutBox = 0;
  let componentsWithoutPrice = 0;

  const breakdown: BundleComponentPackaging[] = components.map((c) => {
    // Konwencja: gdy unitsPerBox nie jest ustawione (null lub 0), traktujemy
    // jako 1 sztuka / karton. Tak liczy calc i tak pokazujemy w UI — żeby user
    // nie widział nigdzie „—" gdy może po prostu nie podać liczby.
    const upb =
      c.unitsPerBox != null && c.unitsPerBox > 0 ? c.unitsPerBox : 1;
    const packagesNeeded =
      c.qtyPerSet <= 0 ? 0 : Math.ceil(c.qtyPerSet / upb);
    const pricePerCarton = c.primaryBox?.purchasePricePln ?? null;
    const totalPackagingCost =
      pricePerCarton != null ? pricePerCarton * packagesNeeded : null;

    if (!c.primaryBox) componentsWithoutBox++;
    else if (pricePerCarton == null) componentsWithoutPrice++;

    totalPackages += packagesNeeded;
    if (totalPackagingCost == null) {
      anyCostMissing = true;
    } else if (totalCost != null) {
      totalCost += totalPackagingCost;
    }

    return {
      componentId: c.componentId,
      componentName: c.componentName,
      componentCode: c.componentCode,
      qtyPerSet: c.qtyPerSet,
      // Zwracamy upb (z fallbackiem 1), nie surowe c.unitsPerBox — żeby UI też
      // pokazywało 1 zamiast „—".
      unitsPerBox: upb,
      packagesNeeded,
      pricePerCarton,
      totalPackagingCost,
      box: c.primaryBox,
    };
  });

  return {
    components: breakdown,
    totalPackagesPerSet: totalPackages,
    totalPackagingCostPerSet: anyCostMissing ? null : totalCost,
    componentsWithoutBox,
    componentsWithoutPrice,
  };
}

/**
 * Liczba SKU dla fulfillmentu — w zestawie liczymy SUMĘ sztuk komponentów.
 * Np. zestaw stołowy: 1 blat + 1 nogi + 6 krzeseł = 8 SKU dla magazynu.
 *
 * Dla nie-zestawów (CALOSCIOWY) skuCount=1 — produkt jest pojedynczym SKU.
 * Dla KOMPONENTOWY z slotami liczymy aktywne komponenty (analogicznie do listy
 * produktów: `components.length || 1`).
 */
export function bundleSkuCount(
  compositionMode: "CALOSCIOWY" | "ZESTAW" | "KOMPONENTOWY",
  components: { quantity: number }[],
): number {
  if (compositionMode === "ZESTAW") {
    const sum = components.reduce((s, c) => s + Math.max(0, c.quantity), 0);
    return Math.max(1, sum);
  }
  if (compositionMode === "KOMPONENTOWY") {
    return Math.max(1, components.length);
  }
  return 1;
}
