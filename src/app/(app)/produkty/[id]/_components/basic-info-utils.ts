/**
 * Helpery do formularza "Podstawowe" — bez "use client".
 *
 * Trzymane osobno żeby server component mógł wywołać `productToBasicValues`
 * (`basic-info-form.tsx` ma "use client", więc wszystko z niego eksportowane
 * jest client-only i nie da się tego użyć z serwera).
 */

type CompositionMode = "CALOSCIOWY" | "KOMPONENTOWY" | "ZESTAW";

export interface BasicInfoFormValues {
  name: string;
  productCode: string;
  code128: string;
  eanCode: string;
  categoryId: string | null;
  compositionMode: CompositionMode;
  requiredComponentsTotal: string;
  weightKg: string;
  /** w UI 0..100, na zapis dzielimy przez 100 do 0..1. */
  customsDutyPct: string;
  /** Wolnotekstowy kolor (np. „Czarny", „Pastelowy róż"). */
  color: string;
  /** Kod fabryczny koloru (np. „RAL 6018", „Pantone 18-1664"). Drukowany
   *  w tabeli na PDF zamówienia fabrycznego. */
  colorCode: string;
}

/**
 * Konwertuje produkt z DB (cło w 0..1) na stan formularza w stringach
 * (cło w 0..100), zgodnie z konwencją wizarda.
 */
export function productToBasicValues(p: {
  name: string;
  productCode: string;
  code128: string | null;
  eanCode: string | null;
  categoryId: string | null;
  compositionMode: CompositionMode | string | null;
  requiredComponentsTotal: number | null;
  weightKg: number | null;
  customsDutyPct: number | null;
  color: string | null;
  colorCode: string | null;
}): BasicInfoFormValues {
  // ZESTAW zachowujemy w stanie formularza — UI pokazuje statyczny badge zamiast
  // selectora typu, ale wartość musi przejść przez form żeby zapis nie zniszczył
  // produktu-zestawu poprzez wymuszenie KOMPONENTOWY/CALOSCIOWY.
  const cm = p.compositionMode as CompositionMode | string | null;
  const compositionMode: CompositionMode =
    cm === "ZESTAW"
      ? "ZESTAW"
      : cm === "KOMPONENTOWY"
        ? "KOMPONENTOWY"
        : "CALOSCIOWY";
  return {
    name: p.name,
    productCode: p.productCode,
    code128: p.code128 ?? "",
    eanCode: p.eanCode ?? "",
    categoryId: p.categoryId,
    compositionMode,
    requiredComponentsTotal:
      p.requiredComponentsTotal != null
        ? p.requiredComponentsTotal.toString()
        : "",
    weightKg: p.weightKg != null ? p.weightKg.toString() : "",
    customsDutyPct:
      p.customsDutyPct != null ? (p.customsDutyPct * 100).toString() : "",
    color: p.color ?? "",
    colorCode: p.colorCode ?? "",
  };
}
