// W UI używamy tylko 2 stanów: Aktywny / Nieaktywny.
// IMPORTOWANY i PLANOWANY z bazy mapują się na "Nieaktywny" przy odczycie,
// a przy zapisie z UI ustawiamy AKTYWNY lub PLANOWANY (jako domyślny "nieaktywny").

export const PRODUCT_STATUSES = [
  "AKTYWNY",
  "IMPORTOWANY",
  "PLANOWANY",
] as const;

export type ProductStatusT = (typeof PRODUCT_STATUSES)[number];

export function isActive(s: ProductStatusT): boolean {
  return s === "AKTYWNY";
}

export const PRODUCT_STATUS_LABEL: Record<ProductStatusT, string> = {
  AKTYWNY: "Aktywny",
  IMPORTOWANY: "Nieaktywny",
  PLANOWANY: "Nieaktywny",
};

export const PRODUCT_STATUS_SHORT: Record<ProductStatusT, string> = {
  AKTYWNY: "Aktywny",
  IMPORTOWANY: "Nieaktywny",
  PLANOWANY: "Nieaktywny",
};

export const PRODUCT_STATUS_BADGE: Record<ProductStatusT, string> = {
  AKTYWNY: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  IMPORTOWANY: "bg-slate-100 text-slate-700 ring-slate-200",
  PLANOWANY: "bg-slate-100 text-slate-700 ring-slate-200",
};
