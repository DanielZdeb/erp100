/**
 * Seeds the "Hamak do jogi" instruction for ACRO4F.
 *
 * Wzorowane na 7-stronicowej fizycznej instrukcji ACRO4F (zdjęcia stron):
 *  - str 1: okładka (auto: logo + auto-lista aktywnych języków pod podtytułem)
 *  - str 2: spis treści (auto z header rangów)
 *  - str 3: producent + certyfikaty + welcome message
 *  - str 4: zawartość zestawu (lista + miejsce na grafikę + warianty AH-4/5/6 + kolory)
 *  - str 5: wiązanie hamaka (7 step thumbs + numerowana lista kroków)
 *  - str 6: mocowanie z hakiem montażowym (text+image + odległość 40-55 cm)
 *  - str 7: mocowanie z taśmą alpinistyczną (text+image)
 *  - str 8: zasady użytkowania (6 sekcji + pranie/suszenie/przechowywanie)
 *
 * Użycie:
 *   npx tsx scripts/seed-yoga-hammock-manual.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Brak DATABASE_URL w .env");
  process.exit(1);
}
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ─── Helpery do budowania TipTap JSON ──────────────────────────────────

const ROSE = "#be185d"; // rose-700 — tytuły sekcji
const BLUE = "#1e40af"; // blue-800 — wyróżnienia
// SLATE used implicitly by editor's default text color
// const SLATE = "#0f172a";

const t = (text: string, marks?: object[]) =>
  marks ? { type: "text", text, marks } : { type: "text", text };
const bold = { type: "bold" };
const italic = { type: "italic" };
const color = (hex: string) => ({
  type: "textStyle",
  attrs: { color: hex },
});

const p = (...content: object[]) => ({ type: "paragraph", content });
const emptyP = () => ({ type: "paragraph" });
const h2 = (text: string) => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});

const ordered = (items: object[][]) => ({
  type: "orderedList",
  content: items.map((paras) => ({
    type: "listItem",
    content: paras.length === 1 ? [paras[0]] : paras,
  })),
});

const callout = (...content: object[]) => ({
  type: "callout",
  content,
});

const section = (
  layout: "imageOnly" | "imageLeft" | "imageRight",
  content: object[],
  imageWidth?: number,
) => ({
  type: "sectionLayout",
  attrs: {
    layout,
    imageSrc: null,
    imageWidth: imageWidth ?? null,
    verticalCenter: false,
  },
  content,
});

// ─── Treść body[] ─────────────────────────────────────────────────────

// Body[0] (fizyczna str. 3) — Producent + certyfikaty + welcome
const body0 = {
  type: "doc",
  content: [
    p(t("Jesteśmy bardzo wdzięczni, że wybrałeś nasz produkt!", [bold, italic])),
    p(
      t(
        "Mamy nadzieję, że zakup przyniesie Ci nie tylko sportową satysfakcję, ale też chwile radości i lekkości w powietrzu. Jeśli będziesz mieć pytania – jesteśmy tu dla Ciebie!",
        [italic],
      ),
    ),
    emptyP(),
    callout(
      p(
        t("Produkty marki "),
        t("ACRO4F", [bold]),
        t(" posiadają "),
        t("certyfikaty Instytutu Badań i Certyfikacji", [bold, color(BLUE)]),
        t(
          ", który jest czynnym członkiem Komitetu Technicznego K2 ds. Sportu i Rekreacji i są produkowane zgodnie z normami:",
        ),
      ),
      p(
        t(
          "PN-EN ISO 13934-1 Tekstylia - Oznaczenie wytrzymałości na rozciąganie",
          [bold, color(BLUE)],
        ),
      ),
      p(
        t(
          "PN-EN 71-1 Bezpieczeństwo zabawek - Część 1: Właściwości mechaniczne i fizyczne",
          [bold, color(BLUE)],
        ),
      ),
      p(
        t("PN-EN 71-2 Bezpieczeństwo zabawek - Część 2: Łatwopalność", [
          bold,
          color(BLUE),
        ]),
      ),
    ),
    emptyP(),
    p(t("Producent, importer, właściciel marki:", [bold])),
    p(t("ACRO4F SP. Z O.O.")),
    p(t("ul. Stefana Batorego 18/108,")),
    p(t("02-591 Warszawa,")),
    p(t("Polska")),
    emptyP(),
    p(t("NIP: "), t("7011175385", [bold])),
    p(t("KRS: "), t("0001069642", [bold])),
    p(t("REGON: "), t("526980646", [bold])),
    p(t("contact@acro4f.com")),
  ],
};

// Body[1] (fizyczna str. 4) — Zawartość zestawu (hamak)
const body1 = {
  type: "doc",
  content: [
    h2("ZESTAW - HAMAK DO JOGI"),
    p(t("Hamak - "), t("1 szt.", [bold])),
    p(t("Taśma falowana - "), t("2 szt.", [bold])),
    p(t("Karabińczyk - "), t("2 szt.", [bold])),
    p(t("Mocowanie sufitowe + kotwy - "), t("2 szt.", [bold])),
    emptyP(),
    section(
      "imageOnly",
      [p(t("(miejsce na grafikę: hamak fioletowy + karabinki + mocowania)", [italic]))],
      80,
    ),
    emptyP(),
    p(t("Model:", [bold])),
    p(t("AH-4X2.8M", [bold])),
    p(t("AH-5X2.8M", [bold])),
    p(t("AH-6X2.8M", [bold])),
    emptyP(),
    p(
      t(
        "PURPLE, DARKGREY, GREY, PINK, PASTELPINK, GOLD, R.BLUE, CYAN,",
        [bold],
      ),
    ),
    p(t("BLACK, D.GREEN, S.BLUE, GREEN, WHITE", [bold])),
    emptyP(),
    p(t("Produkt nie jest zabawką.", [bold, color(ROSE)])),
  ],
};

// Body[2] (fizyczna str. 5) — Wiązanie hamaka 7 step grid + lista
const body2 = {
  type: "doc",
  content: [
    h2("Wiązanie i mocowanie hamaka"),
    section(
      "imageOnly",
      [
        p(
          t(
            "(miejsce na 7 numerowanych zdjęć kroków 1-7 — siatka 2-3 rzędy)",
            [italic],
          ),
        ),
      ],
      100,
    ),
    emptyP(),
    p(
      t("Zawiąż i zamontuj hamak według poniższej instrukcji:", [bold]),
    ),
    ordered([
      [
        p(
          t(
            "Owiń szarfę wokół nadgarstka zaczynając od wewnętrznej strony ręki, tak jak na rysunku. Koniec powinien wystawać ",
          ),
          t("40-50 cm", [bold]),
          t("."),
        ),
      ],
      [
        p(
          t(
            "Złap krótszy koniec jedną ręką, a dłuższą część hamaka drugą.",
          ),
        ),
      ],
      [
        p(
          t(
            "Wyciągnij dłuższą część hamaka przez pętlę zrobioną na nadgarstku, trzymając zaciśniętą dłoń.",
          ),
        ),
      ],
      [
        p(
          t("Na utworzoną pętlę zapnij karabinek. "),
          t("Nie zaciskaj.", [bold, color(ROSE)]),
        ),
      ],
      [
        p(
          t(
            "Przełóż dłoń przez pętlę i złap krótszy koniec tą samą ręką.",
          ),
        ),
      ],
      [
        p(
          t(
            "Trzymając krótszy koniec hamaka wyjmij rękę z pętli.",
          ),
        ),
      ],
      [
        p(
          t(
            "Zaciągnij krótszą i dłuższą część hamaka, żeby węzeł się zaciskał. Powtórz czynność na drugim końcu hamaka.",
          ),
        ),
      ],
    ]),
  ],
};

// Body[3] (fizyczna str. 6) — Mocowanie z hakami montażowymi
const body3 = {
  type: "doc",
  content: [
    h2("MOCOWANIE HAMAKA ZA POMOCĄ HAKÓW MONTAŻOWYCH"),
    section(
      "imageRight",
      [
        p(
          t(
            "Do przymocowania hamaka tą metodą, będziemy potrzebowali wiertarka.",
          ),
        ),
        emptyP(),
        p(
          t("Przed wywierceniem otworów w suficie należy upewnić "),
          t("się, czy nie ma tam kabli", [bold, color(ROSE)]),
          t(", aby uniknąć porażenia prądem. W suficie będącym elementem konstrukcyjnym Przypadają 4 otwory."),
        ),
        emptyP(),
        p(
          t(
            "Po wykonaniu 4 otworów należy przykręcić hak montażowy do sufitu za pomocą dostępnych w zestawie kotew.",
          ),
        ),
        emptyP(),
        p(
          t("Odległość między hakami powinna mieścić się w zakresie: "),
        ),
        p(t("40-55 cm.", [bold])),
        emptyP(),
        p(
          t(
            "Hamak montujemy bezpośrednio karabinkami do haków montażowych. ",
          ),
          t("Pamiętaj o zabezpieczeniu zamka karabinka.", [bold]),
        ),
      ],
      45,
    ),
  ],
};

// Body[4] (fizyczna str. 7) — Mocowanie z taśmą alpinistyczną
const body4 = {
  type: "doc",
  content: [
    h2("MOCOWANIE HAMAKA ZA POMOCĄ TAŚMĄ"),
    section(
      "imageRight",
      [
        p(
          t(
            "Do przymocowania hamaka tą metodą, będziemy potrzebowali tasiemki alpinistycznej.",
          ),
        ),
        p(
          t(
            "Metody tej możemy użyć np. na krokwiach, konstrukcjach stalowych, stabilnych stelażach, gałęziach itp.",
          ),
        ),
        emptyP(),
        p(
          t(
            "Tasiemkę należy przełożyć w połowie przez krokwie, a następnie 2 końce spiąć karabinkiem w pozycji zablokowanej. ",
          ),
        ),
        p(
          t(
            "Jeżeli długość taśmy na to pozwala, ",
          ),
          t(
            "zalecane jest okręcenie tasiemką punktu mocowania przed spięciem karabinkiem.",
            [bold],
          ),
        ),
        emptyP(),
        p(
          t(
            "Szarfę montujemy bezpośrednio karabinkami do tasiemek alpinistycznych. ",
          ),
          t("Pamiętaj o zabezpieczeniu zamka karabinka.", [bold]),
        ),
      ],
      45,
    ),
  ],
};

// Body[5] (fizyczna str. 8) — Zasady użytkowania (identyczne jak AERIAL SILK)
const body5 = {
  type: "doc",
  content: [
    p(t("1. Używaj tylko z odpowiednim osprzętem i do wagi 250 kg", [bold])),
    p(
      t("Upewnij się, że wszystkie elementy zestawu są odpowiednio zamontowane."),
    ),
    p(t("2. Bezpieczne miejsca montażu", [bold])),
    p(t("Punkt montażowy musi być stały, stabilny i przetestowany")),
    p(
      t(
        "(np. sufit betonowy, belka stalowa lub drewniana o odpowiedniej grubości).",
      ),
    ),
    p(
      t(
        "Nie montuj szarfy/hamaka do gipsu, drewnianych sufitów bez wzmacniania ani do drążków rozporowych.",
      ),
    ),
    p(
      t(
        "Zalecane: konsultacja z osobą doświadczoną lub montaż przez specjalistę.",
      ),
    ),
    p(t("3. Regularna kontrola sprzętu", [bold])),
    p(t("Przed KAŻDYM użyciem sprawdź:")),
    p(
      t(
        "Stan karabinków i mechanizmów blokujących, czy są zakręcone. Taśmy czy nie przetarły się o krawędzie. W razie jakichkolwiek uszkodzeń elementów mocujących – nie używaj zestawu!",
      ),
    ),
    p(t("4. Trenuj z asekuracją", [bold])),
    p(
      t(
        "Nie ćwicz samodzielnie, szczególnie na wysokości – zawsze miej kogoś w pobliżu.",
      ),
    ),
    p(t("Używaj mat asekuracyjnych lub materaca gimnastycznego.")),
    p(
      t(
        "Na początku ucz się pod okiem instruktora – niektóre pozycje mogą być niebezpieczne bez odpowiedniego przygotowania.",
      ),
    ),
    p(t("5. Nie używaj szarf/hamaka, jeśli:", [bold])),
    p(t("Masz urazy, zawroty głowy, zaburzenia równowagi.")),
    p(t("Jesteś po spożyciu alkoholu, leków wpływających na świadomość.")),
    p(t("Nie masz odpowiednich warunków lub nie czujesz się bezpiecznie.")),
    p(t("6. Jak prać materiał i przechowywać", [bold])),
    p(t("Pranie ręczne", [bold]), t(" zalecane")),
    p(t("Temperatura wody: "), t("max. 30°C", [bold])),
    p(
      t("Środek piorący: "),
      t(
        "delikatny detergent (np. do tkanin sportowych lub dziecięcych)",
        [bold],
      ),
    ),
    p(
      t("Nie używać: ", [color(ROSE), bold]),
      t("wybielaczy, płynów z chlorem, zmiękczaczy tkanin"),
    ),
    p(t("Płukanie: dokładne, w czystej wodzie")),
    p(t("Wirowanie: nie zalecane (może skręcać lub deformować tkaninę)")),
    p(
      t("Czego unikać? ", [bold]),
      t("Prania w pralce bębnowej. Suszenia w suszarce automatycznej"),
    ),
    p(t("Wystawiania na bezpośrednie słońce (może odbarwić tkaninę)")),
    p(t("Używania żelazka (nie prasować!)", [color(ROSE), bold])),
    p(t("Suszenie:", [bold])),
    p(
      t(
        "Powiesić luźno, w cieniu lub w dobrze wentylowanym pomieszczeniu. Upewnić się, że hamak jest całkowicie suchy przed ponownym użyciem lub przechowywaniem.",
      ),
    ),
    p(
      t("Przechowywanie: ", [bold]),
      t("Przechowuj w suchym, ciemnym miejscu"),
    ),
    p(
      t(
        "Unikaj kontaktu z ostrymi przedmiotami i rzepami (mogą zaciągnąć materiał).",
      ),
    ),
  ],
};

// ─── Header ranges — per body page header (fizyczne numery) ─────────────
// Strony fizyczne: 1=cover, 2=TOC, 3+=body. Wszystkie body to PL.

const headerRanges = [
  {
    id: "hr-yh-1",
    fromPage: 3,
    toPage: 3,
    lang: "PL",
    title: "Spis treści, producent",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "hr-yh-2",
    fromPage: 4,
    toPage: 4,
    lang: "PL",
    title: "Zawartość zestawu",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "hr-yh-3",
    fromPage: 5,
    toPage: 7,
    lang: "PL",
    title: "Wiązanie i mocowanie",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "hr-yh-4",
    fromPage: 8,
    toPage: 8,
    lang: "PL",
    title: "Zasady użytkowania",
    rightText: null,
    rightImageUrl: null,
  },
];

// ─── Run ──────────────────────────────────────────────────────────────

async function main() {
  // Znajdź firmę ACRO4F (po slug/name) lub pierwszą lepszą.
  // Pobieramy także logo + websiteUrl żeby auto-zaciągnąć do instrukcji.
  const company =
    (await db.company.findFirst({
      where: { OR: [{ slug: { contains: "acro" } }, { name: { contains: "ACRO" } }] },
      select: {
        id: true,
        name: true,
        logoColorUrl: true,
        websiteUrl: true,
      },
    })) ??
    (await db.company.findFirst({
      select: {
        id: true,
        name: true,
        logoColorUrl: true,
        websiteUrl: true,
      },
    }));

  if (!company) {
    console.error("Nie znaleziono żadnej firmy w DB.");
    process.exit(1);
  }

  console.log(`Cel: ${company.name} (${company.id})`);
  console.log(`Logo firmy: ${company.logoColorUrl ?? "(brak — można dodać w Moje konto)"}`);
  console.log(`Strona www:  ${company.websiteUrl ?? "(brak — można dodać w Moje konto)"}`);

  // Normalizacja strony www do formatu wyświetlanego w stopce (bez https://, bez końcowego /).
  // Jeśli firma nie ma websiteUrl — fallback na uppercase nazwę firmy.
  const footerWebsite = company.websiteUrl
    ? company.websiteUrl
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .replace(/\/$/, "")
        .toUpperCase()
    : company.name.toUpperCase();

  const name = "Hamak do jogi";

  // Idempotentny — jeśli istnieje, aktualizuje zamiast tworzyć duplikat.
  const existing = await db.productManual.findFirst({
    where: { companyId: company.id, name },
    select: { id: true },
  });

  const data = {
    companyId: company.id,
    name,
    pageSize: "A5" as const,
    fontFamily: "Roboto",
    bodyFontSize: 10,
    h1FontSize: 17,
    h2FontSize: 13,
    h3FontSize: 11,
    // Auto-zaciąga logo firmy i adres www z modelu Company
    logoImageUrl: company.logoColorUrl,
    coverSubtitle: "",
    logoHeightPt: 60,
    footerCustom: footerWebsite,
    headerRanges: headerRanges as unknown as object,
    manualJson: {
      activeLanguages: ["PL"],
      pages: [
        { id: "yh-body-0", lang: "PL", content: body0 },
        { id: "yh-body-1", lang: "PL", content: body1 },
        { id: "yh-body-2", lang: "PL", content: body2 },
        { id: "yh-body-3", lang: "PL", content: body3 },
        { id: "yh-body-4", lang: "PL", content: body4 },
        { id: "yh-body-5", lang: "PL", content: body5 },
      ],
    } as unknown as object,
  };

  if (existing) {
    await db.productManual.update({
      where: { id: existing.id },
      data,
    });
    console.log(`✓ Zaktualizowano istniejącą instrukcję: ${existing.id}`);
    console.log(`  URL: /produkty/instrukcje/${existing.id}`);
  } else {
    const created = await db.productManual.create({
      data,
      select: { id: true },
    });
    console.log(`✓ Utworzono nową instrukcję: ${created.id}`);
    console.log(`  URL: /produkty/instrukcje/${created.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
