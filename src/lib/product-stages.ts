export const PRODUCT_STAGES = [
  "PRODUKCJA",
  "IMPORT",
  "DOKUMENTACJA",
  "WYSYLKA",
  "OPIS",
  "GRAFIKI",
] as const;

export type ProductStageT = (typeof PRODUCT_STAGES)[number];

export const STAGE_NUMBER: Record<ProductStageT, number> = {
  PRODUKCJA: 1,
  IMPORT: 2,
  DOKUMENTACJA: 3,
  WYSYLKA: 4,
  OPIS: 5,
  GRAFIKI: 6,
};

export const STAGE_LABEL: Record<ProductStageT, string> = {
  PRODUKCJA: "Produkcja",
  IMPORT: "Import",
  DOKUMENTACJA: "Dokumentacja",
  WYSYLKA: "Wysyłka",
  OPIS: "Opis",
  GRAFIKI: "Grafiki",
};

export const STAGE_TITLE: Record<ProductStageT, string> = {
  PRODUKCJA: "Wytyczne produkcyjne",
  IMPORT: "Wytyczne importowe",
  DOKUMENTACJA: "Dokumentacja",
  WYSYLKA: "Wysyłka do konsumenta",
  OPIS: "Opis produktu",
  GRAFIKI: "Grafiki produktowe",
};

export const STAGE_HINT: Record<ProductStageT, string> = {
  PRODUKCJA:
    "Metka z logo, jakie standardy mają być zachowane przy produkcji.",
  IMPORT:
    "W kartonach / luzem / w komponentach. Jak zabezpieczyć podczas transportu.",
  DOKUMENTACJA:
    "Kod GTIN (produkt) lub Code 128 (komponenty), instrukcje, certyfikaty.",
  WYSYLKA:
    "Czy w pudle z Chin, czy luzem (jeśli luzem — w jakim pudełku i ile to kosztuje).",
  OPIS: "Wymiary, waga, kolor, opis do sklepu / aukcji.",
  GRAFIKI: "Galeria zdjęć produktowych.",
};

export const STAGE_BADGE: Record<ProductStageT, string> = {
  PRODUKCJA: "bg-orange-100 text-orange-700 ring-orange-200",
  IMPORT: "bg-blue-100 text-blue-700 ring-blue-200",
  DOKUMENTACJA: "bg-purple-100 text-purple-700 ring-purple-200",
  WYSYLKA: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  OPIS: "bg-amber-100 text-amber-700 ring-amber-200",
  GRAFIKI: "bg-pink-100 text-pink-700 ring-pink-200",
};
