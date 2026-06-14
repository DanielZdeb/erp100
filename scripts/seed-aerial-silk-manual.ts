/**
 * Seeds the "Szarfa akrobatyczna AERIAL SILK" instruction for ACRO4F.
 *
 * Wzorowane na 7-stronicowej fizycznej instrukcji ACRO4F (folder instrukcje-acro):
 *  - str 1: okładka (auto: logo + auto-lista aktywnych języków pod podtytułem)
 *  - str 2: spis treści (auto z header rangów)
 *  - str 3: producent + certyfikaty + welcome message
 *  - str 4: zawartość zestawu (lista + miejsce na grafikę)
 *  - str 5: wiązanie szarfy (8 step thumbs + numerowana lista kroków)
 *  - str 6: mocowanie z hakiem (text+image, prawidłowa kolejność)
 *  - str 7: mocowanie z taśmą (text+image, prawidłowa kolejność)
 *  - str 8: zasady użytkowania (6 sekcji + pranie/suszenie/przechowywanie)
 *
 * Użycie:
 *   npm run seed-aerial-silk
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
const SLATE = "#0f172a"; // slate-900 — main text

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
const h1 = (text: string) => ({
  type: "heading",
  attrs: { level: 1 },
  content: [{ type: "text", text }],
});
const h2 = (text: string) => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
const h3 = (text: string) => ({
  type: "heading",
  attrs: { level: 3 },
  content: [{ type: "text", text }],
});

const bullet = (items: object[][]) => ({
  type: "bulletList",
  content: items.map((paras) => ({
    type: "listItem",
    content: paras.length === 1 ? [paras[0]] : paras,
  })),
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

// Body[1] (fizyczna str. 4) — Zawartość zestawu
const body1 = {
  type: "doc",
  content: [
    h2("ZESTAW - SZARFA AKROBATYCZNA AERIAL SILK"),
    p(t("Szarfa akrobatyczna - "), t("1 szt.", [bold])),
    p(t("Krętlik - "), t("1 szt.", [bold])),
    p(t("Ósemka - "), t("1 szt.", [bold])),
    p(t("Karabińczyk - "), t("2 szt.", [bold])),
    emptyP(),
    section(
      "imageOnly",
      [p(t("(miejsce na grafikę: zestaw szarfy + akcesoria)", [italic]))],
      80,
    ),
  ],
};

// Body[2] (fizyczna str. 5) — Wiązanie szarfy 8 step grid + lista
const body2 = {
  type: "doc",
  content: [
    h2("Wiązanie szarfy akrobatycznej"),
    section(
      "imageOnly",
      [
        p(
          t(
            "(miejsce na 8 numerowanych zdjęć kroków 1-8 — siatka 2 rzędy × 4 kolumny)",
            [italic],
          ),
        ),
      ],
      100,
    ),
    emptyP(),
    p(t("Zawiąż i zamontuj swoją szarfę według poniższej instrukcji:", [bold])),
    ordered([
      [p(t("Przygotuj ósemkę."))],
      [
        p(
          t("Przełóż środkowy punkt szarfy przez większy otwór "),
          t("„ósemki", [italic]),
          t("”."),
        ),
      ],
      [p(t("Przeciągnij ok. 40 cm szarfy przez otwór ósemki."))],
      [p(t("Przenieś pętlę w dół, pomiędzy rozsunięte końcówki szarfy."))],
      [
        p(
          t("Przeciągnij swoją pętlę jeszcze raz przez większy otwór "),
          t("„ósemki", [italic]),
          t("” od tyłu."),
        ),
      ],
      [p(t("Wyciągniętą pętlę przełóż na mniejszy otwór ósemki."))],
      [p(t("Zaciśnij pętlę szarfy we wszystkich kierunkach."))],
    ]),
  ],
};

// Body[3] (fizyczna str. 6) — Mocowanie z hakiem
const body3 = {
  type: "doc",
  content: [
    h2("MOCOWANIE SZARFY AKROBATYCZNEJ Z WYKORZYSTANIEM HAKA"),
    section(
      "imageRight",
      [
        p(
          t(
            "Na ACRO4F.COM możesz zakupić hak montażowy przeznaczony do mocowania szarf.",
          ),
        ),
        emptyP(),
        p(t("Do przymocowania haka potrzebna będzie nam wiertarka.")),
        p(
          t("Przed wywierceniem otworów w suficie należy "),
          t("upewnić się, czy nie ma tam kabli", [bold, color(ROSE)]),
          t(", aby uniknąć porażenia prądem. Oraz czy sufit jest stabilny i "),
          t("nie jest podwieszany", [bold, color(ROSE)]),
          t(
            ". Otwory należy wywiercić w suficie będącym elementem konstrukcyjnym.",
          ),
        ),
        emptyP(),
        p(t("Na hak montażowy przypadają 4 otwory.")),
        p(t("Śruby należy przykręcić odpowiednim kluczem.")),
      ],
      40,
    ),
    emptyP(),
    section(
      "imageLeft",
      [
        p(t("Prawidłowa kolejność:", [bold])),
        ordered([
          [p(t("Hak"))],
          [p(t("Karabinek"))],
          [p(t("Krętlik"))],
          [p(t("Karabinek"))],
          [p(t("Ósemka"))],
          [p(t("Szarfa."))],
        ]),
        emptyP(),
        p(
          t("Należy pamiętać, że podczas używania szarf "),
          t("karabinki muszą być w pozycji zablokowanej", [bold]),
          t("."),
        ),
      ],
      35,
    ),
  ],
};

// Body[4] (fizyczna str. 7) — Mocowanie z taśmą
const body4 = {
  type: "doc",
  content: [
    h2("MOCOWANIE SZARFY AKROBATYCZNEJ Z WYKORZYSTANIEM TAŚMY"),
    section(
      "imageRight",
      [
        p(
          t(
            "Do przymocowania szarfy tą metodą, będziemy potrzebowali tasiemki alpinistycznej.",
          ),
        ),
        p(
          t(
            "Metody tej możemy użyć np. na krokwiach, stabilnych stelażach, gałęziach itp.",
          ),
        ),
        p(
          t(
            "Tasiemkę należy przełożyć w połowie przez krokwie, a następnie 2 końce spiąć karabinkiem w pozycji zablokowanej.",
          ),
        ),
        p(
          t(
            "Jeżeli długość taśmy na to pozwala, zalecane jest okręcenie tasiemką punktu mocowania przed spięciem karabinkiem.",
          ),
        ),
      ],
      40,
    ),
    emptyP(),
    section(
      "imageLeft",
      [
        p(t("Prawidłowa kolejność:", [bold])),
        ordered([
          [p(t("Taśma"))],
          [p(t("Karabinek"))],
          [p(t("Krętlik"))],
          [p(t("Karabinek"))],
          [p(t("Ósemka"))],
          [p(t("Szarfa."))],
        ]),
        emptyP(),
        p(
          t("Należy pamiętać, że podczas używania szarf "),
          t("karabinki muszą być w pozycji zablokowanej", [bold]),
          t("."),
        ),
      ],
      35,
    ),
  ],
};

// Body[5] (fizyczna str. 8) — Zasady użytkowania
const body5 = {
  type: "doc",
  content: [
    p(t("1. Używaj tylko z odpowiednim osprzętem i do wagi 250 kg", [bold])),
    p(t("Upewnij się, że wszystkie elementy zestawu są odpowiednio zamontowane.")),
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
    p(t("Nie ćwicz samodzielnie, szczególnie na wysokości – zawsze miej kogoś w pobliżu.")),
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
      t("delikatny detergent (np. do tkanin sportowych lub dziecięcych)", [bold]),
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
        "Powiesić luźno, w cieniu lub w dobrze wentylowanym pomieszczeniu. Upewnić się, że szarfa jest całkowicie sucha przed ponownym użyciem lub przechowywaniem.",
      ),
    ),
    p(t("Przechowywanie: ", [bold]), t("Przechowuj w suchym, ciemnym miejscu")),
    p(
      t(
        "Unikaj kontaktu z ostrymi przedmiotami i rzepami (mogą zaciągnąć materiał).",
      ),
    ),
  ],
};

// ─── Header ranges — per body page header (fizyczne numery) ─────────────

const headerRanges = [
  {
    id: "hr-1",
    fromPage: 3,
    toPage: 3,
    lang: "PL",
    title: "Spis treści, producent",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "hr-2",
    fromPage: 4,
    toPage: 4,
    lang: "PL",
    title: "Zawartość zestawu",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "hr-3",
    fromPage: 5,
    toPage: 7,
    lang: "PL",
    title: "Wiązanie i mocowanie",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "hr-4",
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
  // Find ACRO4F company (slug zaczyna się od "acro" lub zawiera "acro4f")
  const company =
    (await db.company.findFirst({
      where: { OR: [{ slug: { contains: "acro" } }, { name: { contains: "ACRO" } }] },
      select: { id: true, name: true, logoColorUrl: true },
    })) ??
    (await db.company.findFirst({ select: { id: true, name: true, logoColorUrl: true } }));

  if (!company) {
    console.error("Nie znaleziono żadnej firmy w DB.");
    process.exit(1);
  }

  console.log(`Cel: ${company.name} (${company.id})`);
  console.log(`Logo firmy: ${company.logoColorUrl ?? "(brak — można dodać w Moje konto)"}`);

  const name = "Szarfa akrobatyczna AERIAL SILK";

  // Jeśli istnieje, zaktualizuj zamiast tworzyć nową — żeby skrypt był idempotentny.
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
    logoImageUrl: company.logoColorUrl,
    // Lista języków NIE w subtitle — generuje się auto z `activeLanguages`
    // pod podtytułem na okładce. Tu zostawiamy puste / lub np. nazwę produktu.
    coverSubtitle: "",
    logoHeightPt: 60,
    footerCustom: "ACRO4F.COM",
    headerRanges: headerRanges as unknown as object,
    manualJson: {
      pages: [
        { id: "body-0", content: body0 },
        { id: "body-1", content: body1 },
        { id: "body-2", content: body2 },
        { id: "body-3", content: body3 },
        { id: "body-4", content: body4 },
        { id: "body-5", content: body5 },
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
