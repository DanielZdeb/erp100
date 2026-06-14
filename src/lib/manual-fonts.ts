/**
 * Zestaw nowoczesnych fontów dla instrukcji obsługi.
 *
 * Dobór: dobrze czytelne w technicznej dokumentacji, modern sans-serif,
 * pełne wsparcie polskich znaków (Latin Extended-A). Wzięte z Google Fonts —
 * ładowane przez CSS dla edytora (link w layout) i przez `Font.register` dla
 * react-pdf (TTF z CDN).
 *
 * Branże docelowe: meble, sport, akrobatyka, jogę, urządzenia treningowe.
 */

export type FontOption = {
  family: string;
  /** Pełna nazwa do display (np. "Manrope · nowoczesny"). */
  label: string;
  /** Opis branżowy — pojawia się jako tooltip / underline. */
  description: string;
  /** URL TTF Regular dla react-pdf. */
  regularUrl: string;
  /** URL TTF Bold dla react-pdf. */
  boldUrl: string;
};

/**
 * 5 starannie dobranych modern sans-serif fontów. Każdy ma pełen Latin Ext-A
 * (polskie znaki) i jest legalnie hostowany na jsdelivr (mirror Google Fonts).
 */
export const MANUAL_FONTS: FontOption[] = [
  {
    family: "Roboto",
    label: "Roboto",
    description: "Klasyczny, neutralny — bezpieczny wybór dla dowolnej branży",
    regularUrl:
      "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Regular.ttf",
    boldUrl:
      "https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/hinted/Roboto-Bold.ttf",
  },
  {
    family: "Manrope",
    label: "Manrope",
    description:
      "Geometryczny, nowoczesny — popularny w premium brandach mebli i fitnessu",
    regularUrl:
      "https://cdn.jsdelivr.net/gh/sharanda/manrope@master/desktop/Manrope-Regular.ttf",
    boldUrl:
      "https://cdn.jsdelivr.net/gh/sharanda/manrope@master/desktop/Manrope-Bold.ttf",
  },
  {
    family: "DM Sans",
    label: "DM Sans",
    description: "Przyjazny, czytelny — idealny do instrukcji konsumenckich",
    regularUrl:
      "https://cdn.jsdelivr.net/gh/googlefonts/dm-fonts@main/Sans/Exports/ttf/DMSans-Regular.ttf",
    boldUrl:
      "https://cdn.jsdelivr.net/gh/googlefonts/dm-fonts@main/Sans/Exports/ttf/DMSans-Bold.ttf",
  },
  {
    family: "Plus Jakarta Sans",
    label: "Plus Jakarta Sans",
    description: "Profesjonalny, klarowny — sport / akrobatyka / equipment",
    regularUrl:
      "https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans@master/fonts/ttf/PlusJakartaSans-Regular.ttf",
    boldUrl:
      "https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans@master/fonts/ttf/PlusJakartaSans-Bold.ttf",
  },
  {
    family: "Outfit",
    label: "Outfit",
    description: "Futurystyczny geometric — sport tech / urządzenia high-end",
    regularUrl:
      "https://cdn.jsdelivr.net/gh/Outfitio/Outfit-Fonts@main/fonts/ttf/Outfit-Regular.ttf",
    boldUrl:
      "https://cdn.jsdelivr.net/gh/Outfitio/Outfit-Fonts@main/fonts/ttf/Outfit-Bold.ttf",
  },
];

export const DEFAULT_FONT_FAMILY = "Roboto";

/** CSS URL z Google Fonts loadujący wszystkie 5 fontów dla edytora. */
export const MANUAL_FONTS_CSS_URL =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Roboto:wght@400;700",
    "family=Manrope:wght@400;700",
    "family=DM+Sans:wght@400;700",
    "family=Plus+Jakarta+Sans:wght@400;700",
    "family=Outfit:wght@400;700",
  ].join("&") +
  "&display=swap";

/** Quick-pick rozmiary fontu — od 4 do 72. User może też wpisać dowolną wartość
 *  w polu input obok dropdownu (range 4-200). */
export const FONT_SIZES = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72,
] as const;

/** Granice akceptowanych rozmiarów fontu w pt (zarówno UI custom input, jak Zod). */
export const FONT_SIZE_MIN = 4;
export const FONT_SIZE_MAX = 200;
