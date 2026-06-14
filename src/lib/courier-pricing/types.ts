/**
 * Modele do wyceny przesyłek kurierskich.
 *
 * Wszystkie ceny w PLN NETTO (do brutto: ×1.23). Wymiary w cm, waga w kg.
 */

export type CourierBrand = "INPOST" | "DHL";

export type PackageInput = {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  weightKg: number;
};

/** Opcje dodatkowe dla całej przesyłki (wielopaka). */
export type ShippingOptions = {
  /** Pobranie (COD) — wartość do pobrania od klienta w PLN. */
  codAmountPln?: number;
  /** Wartość przesyłki do ubezpieczenia (deklarowana) w PLN. */
  insuredValuePln?: number;
  /** Domyślnie true — opłata paliwowa zwykle jest doliczana. */
  fuelSurcharge?: boolean;
  /** Wymuszenie traktowania jako niestandardowa (NST). */
  forceNonStandard?: boolean;
};

export type PriceBreakdownLine = {
  label: string;
  pln: number;
};

export type PricedService = {
  brand: CourierBrand;
  /** Identyfikator usługi — stabilny string do zapamiętania wyboru. */
  serviceCode: string;
  /** User-friendly nazwa do wyświetlenia. */
  serviceLabel: string;
  /** Krótki opis (do/od drzwi, paczkomat, POP itp.). */
  deliveryMode: string;
  /** Czy wymiary/waga przesyłki mieszczą się w usłudze. */
  applicable: boolean;
  /** Powody braku zastosowania (warnings/info), gdy applicable=false. */
  reasons: string[];
  /** Cena podstawowa po negocjowanym rabacie (netto, bez paliwa, bez dodatków). */
  basePricePln: number;
  /** Opłata paliwowa (netto). */
  fuelSurchargePln: number;
  /** Sumaryczne dopłaty (COD, ubezpieczenie, NST, ponadgabaryt, dłużycowy). */
  surchargesPln: number;
  /** Łącznie netto = base + fuel + surcharges. */
  totalNetPln: number;
  /** Łącznie brutto (×1.23). */
  totalGrossPln: number;
  /** Szczegóły rozliczenia. */
  breakdown: PriceBreakdownLine[];
  /** Czy przesyłka jest wieloelementowa. */
  elementCount: number;
  /** Łączna waga rzeczywista przesyłki (suma elementów). */
  totalActualWeightKg: number;
  /** Łączna waga wolumetryczna (gdy stosowana, np. DHL: ΣLWH/4000). */
  totalDimWeightKg: number;
};

/** Rekomendacja — najtańsza opcja + alternatywy. */
export type Recommendation = {
  /** Najtańsza opcja spośród applicable=true. */
  cheapest: PricedService | null;
  /** Najszybsza spośród applicable (Paczkomat / Premium / 9/12). */
  fastest: PricedService | null;
  /** Wszystkie opcje (applicable + nieapplicable) posortowane: applicable cena rosnąco najpierw, potem nieapplicable. */
  all: PricedService[];
};

/** Pojedyncza pozycja w cenniku usługi — przedział wagowy + cena netto. */
export type WeightBracket = {
  /** Górny limit przedziału (kg, inclusive). */
  upToKg: number;
  /** Cena netto PLN. */
  pricePln: number;
};

/**
 * Wpis w katalogu usług kurierskich — używany przez "Pasuje do kurierów"
 * w bibliotece pudełek. Pochodzi z hardcoded'owanego cennika z umów
 * (`src/lib/courier-pricing/inpost.ts`, `dhl.ts`), nie z DB.
 */
export type CourierServiceCatalogEntry = {
  brand: CourierBrand;
  serviceCode: string;
  serviceLabel: string;
  /** Krótki opis (Paczkomat, Door-to-door, Express, MAX itp.). */
  deliveryMode: string;
  /** Twarde limity wymiarowe (orient. sortowane: shortest/mid/longest).
   *  Null = brak twardego limitu dla tego boku. */
  dimensionLimits: {
    /** Maksymalna wartość najkrótszego boku (cm). */
    minSideMaxCm: number | null;
    /** Maksymalna wartość średniego boku (cm). */
    midSideMaxCm: number | null;
    /** Maksymalna wartość najdłuższego boku (cm). */
    longestMaxCm: number | null;
  };
  /** Maksymalna waga przesyłki (kg). */
  maxWeightKg: number;
  /** Cennik wagowy (netto, bez paliwa). */
  brackets: WeightBracket[];
  /** Notatka o opłacie paliwowej. */
  fuelSurchargeNote: string;
  /** Dodatkowe notatki (NST, dłużycowy, COD, ubezpieczenie). */
  notes: string[];
};
