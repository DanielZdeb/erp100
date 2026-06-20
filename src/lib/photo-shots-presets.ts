/**
 * Domyślne presety rzutów — sugestie z ikonami Lucide gdy user tworzy nowy
 * template. Każdy ma name, iconName i shotPrompt (po angielsku, dla AI).
 * User może wybrać które importować, edytować, dodawać własne.
 */

export type ShotPreset = {
  name: string;
  iconName: string;
  shotPrompt: string;
};

export const SHOT_PRESETS: ShotPreset[] = [
  {
    name: "Front",
    iconName: "Square",
    shotPrompt:
      "Front-facing view, product centered, neutral pose, balanced composition, no perspective distortion",
  },
  {
    name: "Bok",
    iconName: "RectangleHorizontal",
    shotPrompt:
      "Side profile view, full silhouette visible, parallel to camera, shows depth and thickness",
  },
  {
    name: "3/4 angle",
    iconName: "Box",
    shotPrompt:
      "3/4 angle view, slight perspective, dynamic feel, shows both front and side surfaces",
  },
  {
    name: "Z góry",
    iconName: "LayoutGrid",
    shotPrompt:
      "Top-down view, flat lay style, perfectly perpendicular to surface, all elements visible",
  },
  {
    name: "Z dołu",
    iconName: "ArrowUp",
    shotPrompt:
      "Low angle view from below, looking up at the product, hero shot feel",
  },
  {
    name: "Detail / makro",
    iconName: "Search",
    shotPrompt:
      "Close-up macro shot of texture, stitching, material details, sharp focus on craftsmanship",
  },
  {
    name: "W użyciu — osoba",
    iconName: "User",
    shotPrompt:
      "Athletic person using the product in a real-world scenario, action moment captured, natural pose, focus on the product in use",
  },
  {
    name: "Lifestyle dom",
    iconName: "Home",
    shotPrompt:
      "Product in cozy home interior context, warm natural lighting, hygge aesthetic, lived-in feel",
  },
  {
    name: "Lifestyle gym",
    iconName: "Dumbbell",
    shotPrompt:
      "Product in modern gym or training space, industrial vibe, mats and equipment in background slightly blurred",
  },
  {
    name: "Skala (z ręką)",
    iconName: "Hand",
    shotPrompt:
      "Product held in human hand for size reference, shows scale and proportion, fingers visible for context",
  },
  {
    name: "Z opakowaniem",
    iconName: "Package",
    shotPrompt:
      "Product next to or partially inside its packaging, showcases the unboxing moment, retail-ready feel",
  },
  {
    name: "Akcja / dynamiczne",
    iconName: "Zap",
    shotPrompt:
      "Dynamic action shot, motion blur on background, product captured mid-use, energetic mood",
  },
];

/** Mapping z PhotoQuality na Gemini model + spec — używane przez backend.
 *
 *  Dispatcher w `photo-gemini.ts` rozpoznaje model po prefiksie:
 *   - `imagen-*` → REST endpoint `:predict` (Imagen 4 API)
 *   - `gemini-*` → REST endpoint `:generateContent` (Gemini Image API,
 *     m.in. Nano Banana / Nano Banana Pro). */
export const QUALITY_SPEC: Record<
  "STANDARD" | "HIGH" | "ULTRA" | "NANO_BANANA_PRO",
  {
    model: string;
    /** Cena w USD per generated image — używana do estymaty kosztu */
    costPerImage: number;
    /** Krótki opis dla UI */
    label: string;
    description: string;
    /** Dla modeli Gemini Image — docelowa rozdzielczość. */
    imageSize?: "1K" | "2K" | "4K";
  }
> = {
  STANDARD: {
    model: "imagen-4.0-fast-generate-001",
    costPerImage: 0.03,
    label: "Standard",
    description: "Imagen 4 Fast — 1024px, szybki render (~5s), tanio ($0.03/szt)",
  },
  HIGH: {
    model: "imagen-4.0-generate-001",
    costPerImage: 0.12,
    label: "Wysoka",
    description:
      "Imagen 4 — 2K rozdzielczość, więcej detali, lepsze tekstury (~$0.12/szt)",
  },
  ULTRA: {
    model: "imagen-4.0-ultra-generate-001",
    costPerImage: 0.3,
    label: "Ultra",
    description:
      "Imagen 4 Ultra — najwyższa jakość, najlepiej dla katalogu / druku ($0.30/szt)",
  },
  // Nano Banana Pro = Gemini 3 Pro Image.
  // Silne strony: doskonały tekst na obrazku, multi-reference (6 obiektów +
  // 5 postaci), thinking mode, 14 aspect ratios, do 4K rozdzielczości,
  // konwersacyjna edycja istniejących zdjęć ("zmień kolor", "wymień tło").
  // 2K kosztuje $0.134, 4K — $0.24. Dla typowych produktówek 2K wystarcza
  // (dwukrotnie ostrzejsze niż Imagen Fast).
  NANO_BANANA_PRO: {
    // UWAGA: oficjalnie ten preset celuje w Gemini 3 Pro Image, ale w czerwcu
    // 2026 zarowno `gemini-3-pro-image` jak i `-preview` zwracaja
    // UND_ERR_HEADERS_TIMEOUT (>5 min bez response) — Google ma jakis problem
    // z dostepem do tego modelu na naszym koncie/regionie. Tymczasowo uzywamy
    // Gemini 2.5 Flash Image (Nano Banana), ktore odpowiada w ~6s i daje
    // wystarczajaca jakosc edycji (zmiana koloru, tla, drobne korekty).
    // Gdy Google naprawi dostep do Pro, mozna wrocic do "gemini-3-pro-image".
    model: "gemini-2.5-flash-image",
    costPerImage: 0.039,
    label: "Nano Banana (Flash)",
    description:
      "Gemini 2.5 Flash Image — szybkie generowanie/edycja w ~6s, dobra jakość ($0.039/szt). Pro tymczasowo niedostępny.",
  },
};
