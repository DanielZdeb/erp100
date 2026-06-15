/**
 * Biblioteka gotowych promptow dla szablonow opisow produktow.
 *
 *  - IMAGE_PROMPTS: pod Nano Banana Pro (lifestyle, packshot, detal materialu itd.)
 *  - TEXT_PROMPTS:  pod Claude (akapity opisowe po polsku - hero, korzysci, specyfikacja itd.)
 *
 * Wybranie z biblioteki nadpisuje aktualna zawartosc pola promptu - operator moze
 * potem dalej edytowac recznie. Biblioteka jest punktem startowym, nie kontraktem.
 */

export type PromptKind = "IMAGE" | "TEXT";

export interface PromptTemplate {
  id: string;
  label: string;
  body: string;
  kind: PromptKind;
  group: string;
}

export const IMAGE_PROMPTS: PromptTemplate[] = [
  {
    id: "img-packshot-white",
    label: "Packshot - białe tło",
    kind: "IMAGE",
    group: "Packshot",
    body: `Studyjny packshot produktu na czystym białym tle (#FFFFFF).
Miękkie rozproszone światło, brak twardych cieni, tylko delikatny cień pod produktem.
Centralne kadrowanie, produkt zajmuje ~70% kadru. Ostry detal, neutralne kolory.
Brak ludzi, brak rekwizytów, brak tekstu w obrazie.`,
  },
  {
    id: "img-packshot-dark",
    label: "Packshot - ciemne / moody tło",
    kind: "IMAGE",
    group: "Packshot",
    body: `Dramatyczne studyjne ujęcie produktu na ciemnym (#0E1116) gradientowym tle.
Boczne kontrowe światło uwypuklające krawędzie i fakturę.
Premium / editorial mood, lekka winieta. Produkt w centrum kadru,
kolory nasycone ale nie przepalone. Brak ludzi i tekstu.`,
  },
  {
    id: "img-detail-material",
    label: "Detal materiału / makro tekstury",
    kind: "IMAGE",
    group: "Detal",
    body: `Bardzo bliskie ujęcie (makro) faktury i materiału produktu - widoczne tkanie,
ziarno, połysk, mikrodetal. Naturalne światło dzienne z lewej, miękkie.
Bardzo płytka głębia ostrości, ostry punkt centralny. Realistyczna kolorystyka,
bez efektów cyfrowych.`,
  },
  {
    id: "img-detail-mechanism",
    label: "Detal mechanizmu / funkcja",
    kind: "IMAGE",
    group: "Detal",
    body: `Bliski kadr na kluczowy element funkcjonalny produktu (zamek, suwak, zatrzask,
łącznik, pokrętło itp.). Boczne światło uwypuklające geometrię.
Czyste tło neutralne, brak rozpraszaczy. Ostry detal mechaniczny,
akcent na precyzję wykonania.`,
  },
  {
    id: "img-side-profile",
    label: "Profil techniczny / boczny rzut",
    kind: "IMAGE",
    group: "Techniczne",
    body: `Czysty boczny rzut produktu, kąt 90°, perspektywa ortograficzna jak w karcie
katalogowej. Białe tło, równomierne światło z góry, brak cieni rzucanych.
Produkt poziomo, idealnie wycentrowany. Styl dokumentacyjny.`,
  },
  {
    id: "img-top-down-flat-lay",
    label: "Top-down / flat lay",
    kind: "IMAGE",
    group: "Techniczne",
    body: `Ujęcie z góry (90° w dół) na produkt ułożony płasko. Tło: jednolite jasne
(pastel lub off-white). Równomierne miękkie światło bez ostrych cieni.
Symetryczna kompozycja, produkt zajmuje ~60% kadru.`,
  },
  {
    id: "img-in-hand",
    label: "W dłoni - skala / ergonomia",
    kind: "IMAGE",
    group: "Skala",
    body: `Produkt trzymany w dłoni dorosłej osoby - pokazana skala i ergonomia.
Kadr po nadgarstek, neutralne tło studyjne (jasne szarości). Naturalne
światło dzienne. Skin tone realistyczny, paznokcie czyste i krótkie.
Bez biżuterii, bez ubrań w kadrze.`,
  },
  {
    id: "img-scale-everyday",
    label: "Skala obok przedmiotu codziennego",
    kind: "IMAGE",
    group: "Skala",
    body: `Produkt położony obok znanego przedmiotu codziennego (linijka 30 cm,
smartfon, kubek) dla porównania wielkości. Białe tło, ujęcie top-down,
obiekty na tej samej wysokości. Cel: jasne porównanie skali.`,
  },
  {
    id: "img-lifestyle-indoor",
    label: "Lifestyle - w pomieszczeniu (kontekst użycia)",
    kind: "IMAGE",
    group: "Lifestyle",
    body: `Produkt w realistycznym kontekście użycia w jasnym wnętrzu (loft,
minimalistyczne biurko, kuchnia, salon). Naturalne światło dzienne z okna,
rozmyte tło (bokeh). Produkt jest fokusem kadru, scena pomaga zrozumieć
jak / gdzie się go używa. Brak ludzi w kadrze.`,
  },
  {
    id: "img-lifestyle-outdoor",
    label: "Lifestyle - outdoor / plener",
    kind: "IMAGE",
    group: "Lifestyle",
    body: `Produkt w plenerze - naturalne otoczenie pasujące do kategorii (las,
góry, plaża, park miejski). Złota godzina, miękkie ciepłe światło.
Produkt fokusowy, tło rozmyte. Realistyczna kolorystyka, brak efektów HDR.`,
  },
  {
    id: "img-action",
    label: "Action shot / w trakcie używania",
    kind: "IMAGE",
    group: "Lifestyle",
    body: `Produkt w trakcie aktywnego użytkowania - dłonie / fragment osoby
w akcji. Lekkie rozmycie ruchu na elementach drugoplanowych, ostry produkt.
Realistyczne studio scenariusza, naturalne światło. Pokazuje konkretną
korzyść w działaniu.`,
  },
  {
    id: "img-exploded-view",
    label: "Eksplozja / komponenty rozłożone",
    kind: "IMAGE",
    group: "Techniczne",
    body: `Widok eksplozji (exploded view) - komponenty produktu rozłożone w przestrzeni
z lekkim dystansem między częściami, jak w instrukcji montażu. Białe / jasne
tło studyjne, izometryczna perspektywa lub lekkie 3/4. Subtelne cienie.
Czytelność elementów priorytetem.`,
  },
  {
    id: "img-packaging",
    label: "Opakowanie / unboxing",
    kind: "IMAGE",
    group: "Packaging",
    body: `Produkt w oryginalnym opakowaniu (pudełko / etui / worek) - częściowo otwartym,
z produktem widocznym wewnątrz lub obok. Studyjne białe tło, miękkie światło.
Pokazuje jakość prezentacji i moment unboxingu.`,
  },
  {
    id: "img-set-contents",
    label: "Zawartość zestawu (co w pudełku)",
    kind: "IMAGE",
    group: "Packaging",
    body: `Wszystkie elementy zestawu rozłożone płasko na jednolitym tle - produkt
główny + akcesoria + instrukcja. Ujęcie top-down, symetria. Białe / szare
tło studyjne. Cel: jednym spojrzeniem widać co kupujący dostaje.`,
  },
  {
    id: "img-comparison",
    label: "Porównanie wariantów / kolorów",
    kind: "IMAGE",
    group: "Porównanie",
    body: `Wszystkie warianty produktu ustawione w jednej linii / siatce, identyczne
ujęcie i światło dla każdego. Białe tło, równe odstępy. Cel: pokazać
wybór kolorów / rozmiarów. Brak tekstu, brak strzałek.`,
  },
  {
    id: "img-detail-color",
    label: "Detal koloru / wykończenia",
    kind: "IMAGE",
    group: "Detal",
    body: `Bliski kadr eksponujący kolor i wykończenie powierzchni produktu.
Boczne miękkie światło ujawniające subtelne refleksy i odcień.
Czyste tło, brak dominujących barw poza produktem. Realistyczna kolorystyka.`,
  },
  {
    id: "img-hero-cinematic",
    label: "Hero cinematic - kampania",
    kind: "IMAGE",
    group: "Lifestyle",
    body: `Editorial / cinematic kadr produktu jako bohatera kampanii. Dramatyczne
kontrowe światło, lekka mgła / kurz świetlny, głęboki cień. Aspekt szeroki,
produkt nieco z boku, dużo negatywnej przestrzeni. Mood premium, intrygujący.`,
  },
  {
    id: "img-detail-stitching",
    label: "Detal szwów / połączeń",
    kind: "IMAGE",
    group: "Detal",
    body: `Makro detal szwów, połączeń, krawędzi montażowych produktu. Ostre
boczne światło uwypuklające jakość wykonania. Czyste neutralne tło,
płytka głębia ostrości. Cel: dowód jakości rzemiosła.`,
  },
];

export const TEXT_PROMPTS: PromptTemplate[] = [
  {
    id: "txt-hero-paragraph",
    label: "Hero - akapit otwierający (3-4 zdania)",
    kind: "TEXT",
    group: "Hero",
    body: `Napisz akapit otwierający opisu produktu (3-4 zdania) po polsku.
Pierwsze zdanie musi mocno chwytać uwagę i obiecywać konkretną korzyść
dla klienta. Kolejne dopowiadają kontekst i wyróżnik. Bez ogólników
(typu: wysoka jakość, najlepszy na rynku). Ton: pewny, rzeczowy, ciepły.
Bez emoji, bez wykrzykników.`,
  },
  {
    id: "txt-hero-headline",
    label: "Hero - krótki nagłówek + jedno zdanie",
    kind: "TEXT",
    group: "Hero",
    body: `Wymyśl mocny nagłówek (max 7 słów) opisujący główną obietnicę produktu,
a pod nim jedno zdanie rozwijające. Język polski, ton aspiracyjny ale
konkretny. Format: pierwsza linia = nagłówek, druga linia = zdanie.
Bez emoji.`,
  },
  {
    id: "txt-benefits-bullets",
    label: "Lista korzyści (3-5 bulletów)",
    kind: "TEXT",
    group: "Korzyści",
    body: `Wymień 3-5 najważniejszych korzyści produktu dla użytkownika końcowego.
Każdy bullet zaczynaj od mocnego czasownika lub korzyści (nie cechy).
Format: każdy punkt w nowej linii, zaczynaj od myślnika.
Max 12 słów na punkt. Po polsku, konkretnie, bez marketingowych ogólników.`,
  },
  {
    id: "txt-material-spec",
    label: "Materiał / specyfikacja techniczna",
    kind: "TEXT",
    group: "Specyfikacja",
    body: `Opisz materiał i kluczowe parametry techniczne produktu (skład, gramatura,
wymiary, waga). Format: pary "Parametr: wartość", każda w nowej linii.
Wartości realistyczne, polski. Tylko dane konkretne, bez marketingu.`,
  },
  {
    id: "txt-how-to-use",
    label: "Jak używać / instrukcja krok po kroku",
    kind: "TEXT",
    group: "Użycie",
    body: `Napisz instrukcję użycia produktu w 4-6 krótkich krokach. Format:
ponumerowana lista (1., 2., ...), każdy krok 1 zdanie maksimum.
Ton: spokojny, prowadzący. Po polsku. Bez ostrzeżeń prawnych i ogólników.`,
  },
  {
    id: "txt-target-audience",
    label: "Dla kogo - 3 grupy odbiorców",
    kind: "TEXT",
    group: "Audytorium",
    body: `Opisz 3 konkretne grupy odbiorców dla których produkt jest idealny.
Każdą grupę zacznij od "Dla osób, które..." i dodaj
1 zdanie uzasadnienia (jaką konkretną sytuację rozwiązuje).
Po polsku, 3 akapity oddzielone pustą linią.`,
  },
  {
    id: "txt-care",
    label: "Pielęgnacja i konserwacja",
    kind: "TEXT",
    group: "Użycie",
    body: `Krótkie instrukcje pielęgnacji i konserwacji produktu (2-4 punkty).
Format: bullety zaczynane od myślnika. Konkrety: czym czyścić, czego unikać,
jak przechowywać. Polski, rzeczowy ton, bez prawniczych zastrzeżeń.`,
  },
  {
    id: "txt-box-contents",
    label: "Zawartość pudełka / co dostajesz",
    kind: "TEXT",
    group: "Zestaw",
    body: `Lista tego, co kupujący znajdzie w pudełku. Format: bullety z myślnikiem,
każda pozycja: nazwa elementu + ilość w nawiasie. Max 8 pozycji. Polski.`,
  },
  {
    id: "txt-variants",
    label: "Porównanie wariantów / wersji",
    kind: "TEXT",
    group: "Porównanie",
    body: `Krótkie porównanie dostępnych wariantów / wersji produktu (2-4 warianty).
Dla każdego: nazwa wariantu + 1 zdanie różnicy + dla kogo. Polski,
rzeczowy ton. Pomaga klientowi wybrać.`,
  },
  {
    id: "txt-faq",
    label: "FAQ - 3 najczęstsze pytania",
    kind: "TEXT",
    group: "FAQ",
    body: `Napisz 3 najczęstsze pytania klientów + krótkie odpowiedzi (1-2 zdania).
Format: **Pytanie?** w nowej linii, odpowiedź w kolejnej. Pytania
konkretne i realistyczne (np. trwałość, rozmiar, pielęgnacja, gwarancja). Polski.`,
  },
  {
    id: "txt-brand-story",
    label: "Brand story / dlaczego powstał produkt",
    kind: "TEXT",
    group: "Marka",
    body: `Krótka historia (3-4 zdania) dlaczego ten produkt powstał - jaki problem
rozwiązuje, co zainspirowało twórców. Ton autentyczny, ludzki, bez korpo-mowy.
Pierwsza osoba liczby mnogiej (zrobiliśmy). Polski.`,
  },
  {
    id: "txt-usp",
    label: "USP - co nas wyróżnia",
    kind: "TEXT",
    group: "Pozycjonowanie",
    body: `Opisz 2-3 konkretne wyróżniki produktu na tle konkurencji. Każdy wyróżnik
= jedno zdanie, zaczynaj od tego co konkretnie ROBI, nie od cechy.
Bez słów: najlepszy, unikalny, rewolucyjny. Polski.`,
  },
  {
    id: "txt-sustainability",
    label: "Ekologia / zrównoważony rozwój",
    kind: "TEXT",
    group: "Marka",
    body: `Krótki akapit (2-3 zdania) o aspekcie ekologicznym lub zrównoważonym
produkcie / pakowaniu. Tylko konkretne fakty, bez greenwashingu.
Jeśli brak konkretów - napisz neutralne zdanie o tym że dążymy do
lepszych praktyk. Polski.`,
  },
  {
    id: "txt-warranty",
    label: "Gwarancja i wsparcie",
    kind: "TEXT",
    group: "Wsparcie",
    body: `2 zdania o gwarancji i wsparciu posprzedażowym. Ton spokojny,
budujący zaufanie. Wspomnij: okres gwarancji (zostaw placeholder
[XX miesięcy] jeśli nieznany), jak się skontaktować, co robimy
w razie problemu. Polski.`,
  },
  {
    id: "txt-safety",
    label: "Bezpieczeństwo / certyfikaty",
    kind: "TEXT",
    group: "Specyfikacja",
    body: `Krótkie informacje o bezpieczeństwie i certyfikatach produktu. Format:
bullety. Pomijaj certyfikaty których nie znasz, używaj placeholderów
[CERTYFIKAT_XX] jeśli nieznane. Bez prawniczego żargonu. Polski.`,
  },
  {
    id: "txt-cta",
    label: "Wezwanie do akcji + obietnica",
    kind: "TEXT",
    group: "CTA",
    body: `Napisz krótkie (1-2 zdania) zamknięcie opisu produktu - wezwanie do
zakupu + obietnica korzyści. Bez "kup teraz", bez wykrzykników, bez
emoji. Ton: spokojnie pewny. Polski.`,
  },
  {
    id: "txt-testimonial",
    label: "Cytat / testimonial (mock)",
    kind: "TEXT",
    group: "Społeczny dowód",
    body: `Napisz 1 wiarygodny cytat opinii zadowolonego klienta (2-3 zdania) wraz
z imieniem i miastem w stylu "- Anna K., Wrocław". Treść konkretna,
odnosząca się do realnego użycia produktu, bez przesady. Polski.`,
  },
  {
    id: "txt-tech-table",
    label: "Tabela parametrów technicznych",
    kind: "TEXT",
    group: "Specyfikacja",
    body: `Wygeneruj tabelę parametrów technicznych w formacie markdown:
| Parametr | Wartość |
| --- | --- |
Wymień 6-10 kluczowych parametrów. Wartości realistyczne, polski.`,
  },
];

export function getPromptsByKind(kind: PromptKind): PromptTemplate[] {
  return kind === "IMAGE" ? IMAGE_PROMPTS : TEXT_PROMPTS;
}
