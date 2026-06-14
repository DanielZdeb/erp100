/**
 * Buduje productManualJson dla rur pole dance ACRO4F na podstawie 7 zdjęć
 * w /instrukcje-acro. Strona 1 (okładka) i 2 (TOC) są wirtualne — system
 * generuje je automatycznie z headerRanges + activeLanguages. Wgrywamy
 * tylko body pages 3-8.
 *
 * Wgrywa do wszystkich 6 wariantów kolorystycznych RP-*.
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ── Helpery TipTap (skróty do tworzenia node'ów) ──────────────────────

function paragraph(...children: any[]) {
  return { type: "paragraph", content: children };
}
function text(t: string, marks?: any[]) {
  const n: any = { type: "text", text: t };
  if (marks?.length) n.marks = marks;
  return n;
}
function bold(t: string) {
  return text(t, [{ type: "bold" }]);
}
function h2(t: string) {
  return {
    type: "heading",
    attrs: { level: 2 },
    content: [text(t)],
  };
}
function h3(t: string) {
  return {
    type: "heading",
    attrs: { level: 3 },
    content: [text(t)],
  };
}
function bulletList(...items: any[][]) {
  return {
    type: "bulletList",
    content: items.map((it) => ({
      type: "listItem",
      content: [paragraph(...it)],
    })),
  };
}
function calloutWarning(...children: any[]) {
  return { type: "callout", content: children };
}

/** Komórka tabeli — content musi być array node'ów (paragraf). */
function td(t: string, opts?: { bold?: boolean; colwidth?: number[] }) {
  return {
    type: "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: opts?.colwidth ?? null },
    content: [paragraph(opts?.bold ? bold(t) : text(t))],
  };
}
function th(t: string, colwidth?: number[]) {
  return {
    type: "tableHeader",
    attrs: { colspan: 1, rowspan: 1, colwidth: colwidth ?? null },
    content: [paragraph(bold(t))],
  };
}
function row(...cells: any[]) {
  return { type: "tableRow", content: cells };
}
function table(rows: any[]) {
  return { type: "table", content: rows };
}

// ── Body pages ────────────────────────────────────────────────────────

// PDF page 3 (body[0]) — Zawartość zestawu
const PAGE_ZAWARTOSC = {
  type: "doc",
  content: [
    h2("ZESTAW - RURA DO POLE DANCE"),
    paragraph(text("Przedłużka 100 cm (do łożyska) - "), bold("1 szt.")),
    paragraph(text("Przedłużka 100 cm - "), bold("1 szt.")),
    paragraph(text("Przedłużka 26,5 cm - "), bold("1 szt.")),
    paragraph(text("Przedłużka 13,5 cm - "), bold("1 szt.")),
    paragraph(text("Osłona górna gwintu - "), bold("1 szt.")),
    paragraph(text("Łożysko górne - "), bold("1 szt.")),
    paragraph(text("Talerz górny - "), bold("1 szt.")),
    paragraph(text("Podstawa rury - "), bold("1 szt.")),
    paragraph(text("Zestaw narzędzi")),
  ],
};

// PDF page 4 (body[1]) — Możliwości montażu
const PAGE_MOZLIWOSCI = {
  type: "doc",
  content: [
    h2("Możliwości mocowania rury w części sufitowej"),
    paragraph(
      text(
        "Rurę można zamontować z wykorzystaniem łożyska przykręcanego na stałe lub talerza rozporowego.",
      ),
    ),
    paragraph(text("Zalecamy "), bold("zastosowanie łożyska"), text(" z uwagi na większą stabilność.")),
    h3("Cechy rury:"),
    bulletList(
      [text("Możliwość przełączenia między trybem statycznym, a obrotowym.")],
      [text("Materiał: wysokiej jakości chrom galwaniczny.")],
      [text("Można go stosować na praktycznie każdej podłodze, takiej jak płytki, drewno, dywan itp.")],
      [text("Podkładka silikonowa zapobiega ślizganiu się płyty podstawy.")],
    ),
    h3("PRZED MONTAŻEM:"),
    paragraph(
      text(
        "Upewnij się, że masz wystarczająco dużo miejsca, w którym chcesz umieścić rurę. Aby móc się całkowicie rozciągnąć, potrzebny jest okrąg o średnicy około 3 metrów. Podczas montażu rury przydatna może być drabina.",
      ),
    ),
    calloutWarning(
      paragraph(bold("Uwaga !")),
      paragraph(
        text(
          "Przed montażem należy maksymalnie dokręcić śrubę w talerzu podstawnym, aby uniknąć okręcania, podczas użytkowania rury.",
        ),
      ),
    ),
  ],
};

// PDF page 5 (body[2]) — Montaż krok 1 + TABELA przedłużek
const PAGE_KROK1 = {
  type: "doc",
  content: [
    h2("ZNAJDŹ STABILNY SUFIT"),
    paragraph(
      text(
        "Sufit posłuży jako podpora do montażu rury.",
      ),
    ),
    paragraph(
      bold("OPCJA 1:"),
      text(
        " Talerz rozporowy: Upewnij się, że sufit ma stabilny strop. Nie wolno montować rury w płycie kartonowo gipsowej.",
      ),
    ),
    paragraph(
      bold("OPCJA 2:"),
      text(
        " Łożysko przykręcane na stałe: Upewnij się, że sufit ma stabilny strop. Należy przewiercić sufit i zamontować kołki montażowe i mocno przykręcić. Przed wierceniem należy upewnić się, czy na suficie nie znajduje się elektryka.",
      ),
    ),
    h2("INSTRUKCJA SKŁADANIA:"),
    h3("KROK 1: WYSOKOŚĆ RURY I POMIESZCZENIA"),
    paragraph(
      text(
        "Wysokość rury wynosi 215 - 271 cm. Długość rury regulujemy za pomocą przedłużek 26,5cm i 13,5 cm można je stosować zarówno pojedynczo, jak i razem. Minimalna wysokość pomieszczenia wynosi 215 cm. Jeśli potrzebujesz dodatkowych przedłużek, bo masz wyższe pomieszczenie niż 271 cm, możesz zakupić przedłużkę na ACRO4F.COM.",
      ),
    ),
    paragraph(
      text("Zmierz odległość między podłogą, a sufitem i wybierz minimalną wysokość najbardziej zbliżoną pomiarowi."),
    ),
    paragraph(
      text("Następnie wystarczy wybrać przedłużkę pokazaną w poniższej tabeli i można rozpoczynać montaż."),
    ),
    table([
      row(
        th("Wysokość pomieszczenia (łożysko)", [180]),
        th("Wysokość pomieszczenia (talerz rozporowy)", [180]),
        th("Jakie przedłużki", [180]),
      ),
      row(
        td("215 – 230 cm"),
        td("220 – 232 cm"),
        td("100 cm, 100 cm"),
      ),
      row(
        td("228 – 243 cm"),
        td("233 – 245 cm"),
        td("100 cm, 100 cm, 13,5 cm"),
      ),
      row(
        td("247 – 256 cm"),
        td("246 – 259 cm"),
        td("100 cm, 100 cm, 26,5 cm"),
      ),
      row(
        td("255 – 269 cm"),
        td("260 – 271 cm"),
        td("100 cm, 100 cm, 13,5 cm, 26,5 cm"),
      ),
      row(
        td("Powyżej 269 cm"),
        td("Powyżej 271 cm"),
        td("Dodatkowe przedłużki"),
      ),
    ]),
  ],
};

// PDF page 6 (body[3]) — Krok 2 i 3
const PAGE_KROK23 = {
  type: "doc",
  content: [
    h3("KROK 2: PRZEDŁUŻKA"),
    paragraph(
      text(
        "Jeśli wymagane jest przedłużenie (patrz KROK 1), należy je zawsze przymocować do podstawy dolnej. Jeśli potrzebujesz obu przedłużeń, przymocuj najkrótsze do podstawy dolnej, a następnie dłuższe przedłużenie na górze pierwszego.",
      ),
    ),
    h3("KROK 3: SKŁADANIE RURY"),
    paragraph(
      text(
        "Zacznij od podstawy i do niej przykręć przedłużki, kieruj się ku górze. Pamiętaj, by zacząć od ",
      ),
      bold("krótkich przedłużek 13,5 cm (4) i 26,5cm (3)"),
      text(" (jeśli są wymagane). Następnie zamocuj "),
      bold("przedłużkę 100 cm (2)"),
      text(". Przedłużki dokręcaj ręką (mocno)."),
    ),
    paragraph(
      text(
        "Na ostatnią przedłużkę przykręcaną do łożyska (1) nałóż osłonę górnego gwintu (5). Następnie łożysko górne lub talerz rozporowy (6) nałóż na gwint przedłużki (1).",
      ),
    ),
    paragraph(
      text(
        "W ostatniej fazie należy za pomocą regulatora docisnąć rurę do talerza rozporowego lub łożyska tak aby talerz rozporowy przylegał do sufitu całą swoją powierzchnią.",
      ),
    ),
  ],
};

// PDF page 7 (body[4]) — Krok 4
const PAGE_KROK4 = {
  type: "doc",
  content: [
    h3("KROK 4: REGULACJA RURY"),
    paragraph(text("Dokręć regulator rury kluczem.")),
    paragraph(text("Regulację należy dokręcić tak aby rura była stabilna.")),
    calloutWarning(
      paragraph(
        text(
          "Podczas dokręcania regulatora należy pilnować żeby rura nie obracała się. W tym celu należy użyć klucza kontrującego w który wkładamy w otwór rury.",
        ),
      ),
    ),
    paragraph(text("Tryb obrotowy 360°", [{ type: "italic" }])),
  ],
};

// PDF page 8 (body[5]) — Konserwacja i użytkowanie
const PAGE_KONSERWACJA = {
  type: "doc",
  content: [
    h3("UŻYTKOWANIE I KONSERWACJA"),
    paragraph(
      text(
        "Ponieważ rura utrzymuje swoją pozycję przy nacisku od podłogi do sufitu, podczas ćwiczeń zostanie nieco poluzowana. Zaleca się sprawdzanie wytrzymałości rury co 20–30 minut podczas treningu i w razie potrzeby dokręcanie śrub w przypadku jakiegokolwiek ruchu.",
      ),
    ),
    h3("WARUNKI PRZECHOWYWANIA:"),
    bulletList(
      [text("Przechowywać w suchym i chłodnym miejscu.")],
      [text("Chronić przed nadmierną wilgocią.")],
      [text("Czyścić ściereczką z delikatnym detergentem, następnie wytrzeć do sucha.")],
    ),
    h3("OSTRZEŻENIA:"),
    bulletList(
      [text("Nie używać uszkodzonego produktu")],
      [text("Nie używać produktu z niedokręconymi śrubami")],
      [text("Produkt nie jest przeznaczony dla dzieci")],
    ),
    h3("CZYSZCZENIE RURY"),
    paragraph(
      text(
        "Podczas używania rury należy zawsze upewnić się, że jest czysta i sucha. Do czyszczenia i dezynfekcji rury należy używać płynów odtłuszczających, a drugiego do wycierania go do sucha.",
      ),
    ),
    h3("ZASTOSOWANIE"),
    paragraph(bold("Tryb obrotowy 360°")),
    paragraph(text("Odkręć dwie ukryte śruby tuż nad podstawą za pomocą klucza.")),
    paragraph(bold("Tryb statyczny")),
    paragraph(text("Dokręć te same dwie śruby na rurze, za pomocą klucza.")),
    calloutWarning(
      paragraph(bold("UWAGA !")),
      paragraph(
        text(
          "Przy treningu dla bezpieczeństwa zaleca się specjalnie przystosowanej magnezji pole dance ACRO4F.",
        ),
      ),
    ),
  ],
};

// ── Złóż dokument ─────────────────────────────────────────────────────

const BODY_PAGES = [
  { id: "page-zawartosc", content: PAGE_ZAWARTOSC },
  { id: "page-mozliwosci", content: PAGE_MOZLIWOSCI },
  { id: "page-krok1", content: PAGE_KROK1 },
  { id: "page-krok23", content: PAGE_KROK23 },
  { id: "page-krok4", content: PAGE_KROK4 },
  { id: "page-konserwacja", content: PAGE_KONSERWACJA },
];

const NOW = new Date().toISOString();

const MANUAL_JSON = {
  pages: BODY_PAGES.map((p) => ({
    ...p,
    lang: "PL" as const,
    sourceUpdatedAt: NOW,
  })),
  activeLanguages: ["PL"],
};

// HeaderRanges — pasują do tytułów z prawego górnego rogu w zdjęciach
// (fromPage / toPage to numery FIZYCZNYCH stron PDF — strona 1 = cover,
// 2 = TOC, 3 = pierwszy body[0]).
const HEADER_RANGES = [
  {
    id: "h-zawartosc",
    fromPage: 3,
    toPage: 3,
    lang: "PL",
    title: "Zawartość zestawu",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "h-mozliwosci",
    fromPage: 4,
    toPage: 4,
    lang: "PL",
    title: "Możliwości montażu",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "h-krok1",
    fromPage: 5,
    toPage: 5,
    lang: "PL",
    title: "Montaż krok 1",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "h-krok23",
    fromPage: 6,
    toPage: 6,
    lang: "PL",
    title: "Montaż krok 2, 3",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "h-krok4",
    fromPage: 7,
    toPage: 7,
    lang: "PL",
    title: "Montaż krok 4",
    rightText: null,
    rightImageUrl: null,
  },
  {
    id: "h-konserwacja",
    fromPage: 8,
    toPage: 8,
    lang: "PL",
    title: "Konserwacja i użytkowanie",
    rightText: null,
    rightImageUrl: null,
  },
];

async function main() {
  const targets = await db.product.findMany({
    where: { productCode: { startsWith: "RP-" } },
    select: { id: true, productCode: true, name: true },
  });
  console.log(`Znaleziono ${targets.length} rur RP-*`);
  for (const t of targets) {
    await db.product.update({
      where: { id: t.id },
      data: {
        productManualJson: MANUAL_JSON as Prisma.InputJsonValue,
        manualHeaderRanges: HEADER_RANGES as Prisma.InputJsonValue,
        manualTemplate: "CLEAN",
        manualPageSize: "A4",
        manualHeaderLang: "PL",
        manualHeaderTitle: null,
      },
    });
    console.log(`  ✓ ${t.productCode}  ${t.name}`);
  }
  console.log(`\nGotowe. Wgrano manual do ${targets.length} rur.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  db.$disconnect();
  process.exit(1);
});
