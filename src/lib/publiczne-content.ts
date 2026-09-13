/**
 * Statyczne tłumaczenia UI + treść procedury zwrotu dla publicznego
 * readera welcome.acro4f.com. Wybór języka trzymany w cookie/query
 * (przekazywany między podstronami). 7 języków: PL, EN, DE, UA, HU, SK, CS.
 *
 * Do edycji tekstu procedury zwrotu — zmień `zwrot.steps` w konkretnym
 * języku (i pomyśl czy zmiana dotyczy też innych języków).
 */

export type Lang = "PL" | "EN" | "DE" | "UA" | "HU" | "SK" | "CS";

export const LANGS: Lang[] = ["PL", "EN", "DE", "UA", "HU", "SK", "CS"];

export const LANG_LABEL: Record<Lang, string> = {
  PL: "Polski",
  EN: "English",
  DE: "Deutsch",
  UA: "Українська",
  HU: "Magyar",
  SK: "Slovenčina",
  CS: "Čeština",
};

export const LANG_FLAG: Record<Lang, string> = {
  PL: "🇵🇱",
  EN: "🇬🇧",
  DE: "🇩🇪",
  UA: "🇺🇦",
  HU: "🇭🇺",
  SK: "🇸🇰",
  CS: "🇨🇿",
};

export function normalizeLang(input: string | undefined | null): Lang {
  const up = (input ?? "").toUpperCase();
  return (LANGS as string[]).includes(up) ? (up as Lang) : "PL";
}

type UI = {
  welcome: string;
  chooseLang: string;
  tiles: {
    manuals: { title: string; desc: string };
    returns: { title: string; desc: string };
  };
  back: string;
  brandFooter: string;
};

export const UI_TEXT: Record<Lang, UI> = {
  PL: {
    welcome: "Witaj w ACRO4F",
    chooseLang: "Wybierz język",
    tiles: {
      manuals: {
        title: "Instrukcje produktów",
        desc: "Interaktywne instrukcje montażu i użytkowania",
      },
      returns: {
        title: "Zwrot towaru",
        desc: "Procedura zwrotu krok po kroku",
      },
    },
    back: "Powrót",
    brandFooter: "ACRO4F Sp. z o.o. · Wszelkie prawa zastrzeżone",
  },
  EN: {
    welcome: "Welcome to ACRO4F",
    chooseLang: "Choose language",
    tiles: {
      manuals: {
        title: "Product manuals",
        desc: "Interactive assembly and use instructions",
      },
      returns: {
        title: "Return an item",
        desc: "Step-by-step return procedure",
      },
    },
    back: "Back",
    brandFooter: "ACRO4F Sp. z o.o. · All rights reserved",
  },
  DE: {
    welcome: "Willkommen bei ACRO4F",
    chooseLang: "Sprache wählen",
    tiles: {
      manuals: {
        title: "Produktanleitungen",
        desc: "Interaktive Montage- und Benutzungsanleitungen",
      },
      returns: {
        title: "Rücksendung",
        desc: "Schritt-für-Schritt-Rücksendeverfahren",
      },
    },
    back: "Zurück",
    brandFooter: "ACRO4F Sp. z o.o. · Alle Rechte vorbehalten",
  },
  UA: {
    welcome: "Ласкаво просимо в ACRO4F",
    chooseLang: "Оберіть мову",
    tiles: {
      manuals: {
        title: "Інструкції до продуктів",
        desc: "Інтерактивні інструкції зі складання та використання",
      },
      returns: {
        title: "Повернення товару",
        desc: "Покрокова процедура повернення",
      },
    },
    back: "Назад",
    brandFooter: "ACRO4F Sp. z o.o. · Усі права захищені",
  },
  HU: {
    welcome: "Üdvözöljük az ACRO4F-nél",
    chooseLang: "Válasszon nyelvet",
    tiles: {
      manuals: {
        title: "Termékútmutatók",
        desc: "Interaktív összeszerelési és használati útmutatók",
      },
      returns: {
        title: "Termékvisszaküldés",
        desc: "Visszaküldési eljárás lépésről lépésre",
      },
    },
    back: "Vissza",
    brandFooter: "ACRO4F Sp. z o.o. · Minden jog fenntartva",
  },
  SK: {
    welcome: "Vitajte v ACRO4F",
    chooseLang: "Vyberte jazyk",
    tiles: {
      manuals: {
        title: "Návody na produkty",
        desc: "Interaktívne návody na montáž a použitie",
      },
      returns: {
        title: "Vrátenie tovaru",
        desc: "Postup vrátenia krok za krokom",
      },
    },
    back: "Späť",
    brandFooter: "ACRO4F Sp. z o.o. · Všetky práva vyhradené",
  },
  CS: {
    welcome: "Vítejte v ACRO4F",
    chooseLang: "Vyberte jazyk",
    tiles: {
      manuals: {
        title: "Návody k produktům",
        desc: "Interaktivní návody k montáži a použití",
      },
      returns: {
        title: "Vrácení zboží",
        desc: "Postup vrácení krok za krokem",
      },
    },
    back: "Zpět",
    brandFooter: "ACRO4F Sp. z o.o. · Všechna práva vyhrazena",
  },
};

type ZwrotContent = {
  title: string;
  intro: string;
  timeLabel: string;
  timeValue: string;
  stepsHeading: string;
  steps: Array<{ title: string; body: string }>;
  addressHeading: string;
  addressLines: string[];
  emailHeading: string;
  emailValue: string;
  noticeHeading: string;
  noticeBody: string;
};

// Wspólny adres i mail — tego samego dla wszystkich języków.
const RETURN_ADDRESS = [
  "ACRO4F Sp. z o.o.",
  "ul. Stefana Batorego 18/108",
  "02-591 Warszawa, Polska",
];
const RETURN_EMAIL = "kontakt@acro4f.com";

export const ZWROT: Record<Lang, ZwrotContent> = {
  PL: {
    title: "Procedura zwrotu towaru",
    intro:
      "Masz prawo zwrócić towar bez podania przyczyny w ciągu 14 dni od otrzymania zamówienia. Poniżej opisujemy szczegółowo, jak to zrobić.",
    timeLabel: "Termin na zwrot",
    timeValue: "14 dni od otrzymania przesyłki",
    stepsHeading: "Krok po kroku",
    steps: [
      {
        title: "Sprawdź termin",
        body: "Upewnij się, że od momentu otrzymania paczki nie minęło więcej niż 14 dni.",
      },
      {
        title: "Zapakuj produkt",
        body: "Zapakuj produkt w oryginalne opakowanie, jeśli to możliwe. Produkt powinien być kompletny, nieuszkodzony i bez śladów użytkowania wykraczających poza zwykły test.",
      },
      {
        title: "Napisz do nas",
        body: "Wyślij e-mail na adres podany poniżej z numerem zamówienia i informacją, że dokonujesz zwrotu. Odeślemy potwierdzenie i szczegóły odsyłki.",
      },
      {
        title: "Wyślij paczkę",
        body: "Odeślij produkt na adres podany poniżej. Rekomendujemy paczkomat lub kuriera z potwierdzeniem nadania.",
      },
      {
        title: "Zwrot pieniędzy",
        body: "Pieniądze zwracamy w ciągu 14 dni od otrzymania i sprawdzenia przesyłki, tą samą metodą, jaką dokonano płatności.",
      },
    ],
    addressHeading: "Adres zwrotu",
    addressLines: RETURN_ADDRESS,
    emailHeading: "Kontakt",
    emailValue: RETURN_EMAIL,
    noticeHeading: "Ważne",
    noticeBody:
      "Koszt odesłania towaru ponosi Kupujący. Nie przyjmujemy przesyłek pobraniowych.",
  },
  EN: {
    title: "Return procedure",
    intro:
      "You have the right to return the product without giving a reason within 14 days of receiving your order. Below we describe how.",
    timeLabel: "Time limit",
    timeValue: "14 days from delivery",
    stepsHeading: "Step by step",
    steps: [
      {
        title: "Check the deadline",
        body: "Make sure no more than 14 days have passed since you received the package.",
      },
      {
        title: "Pack the product",
        body: "Repack the product in its original packaging if possible. It should be complete, undamaged and show no traces of use beyond a normal check.",
      },
      {
        title: "Contact us",
        body: "Send an email to the address below including your order number and a note that you are returning the item. We will confirm and send return details.",
      },
      {
        title: "Ship the parcel",
        body: "Send the product to the address below. We recommend a parcel locker or a courier with proof of shipment.",
      },
      {
        title: "Refund",
        body: "We refund within 14 days of receiving and inspecting the parcel, using the same payment method.",
      },
    ],
    addressHeading: "Return address",
    addressLines: RETURN_ADDRESS,
    emailHeading: "Contact",
    emailValue: RETURN_EMAIL,
    noticeHeading: "Important",
    noticeBody:
      "The return shipping cost is paid by the buyer. We do not accept cash-on-delivery parcels.",
  },
  DE: {
    title: "Rücksendeverfahren",
    intro:
      "Sie haben das Recht, die Ware innerhalb von 14 Tagen nach Erhalt der Bestellung ohne Angabe von Gründen zurückzusenden. Nachfolgend die genaue Anleitung.",
    timeLabel: "Frist",
    timeValue: "14 Tage ab Erhalt",
    stepsHeading: "Schritt für Schritt",
    steps: [
      {
        title: "Frist prüfen",
        body: "Vergewissern Sie sich, dass seit Erhalt der Sendung nicht mehr als 14 Tage vergangen sind.",
      },
      {
        title: "Produkt verpacken",
        body: "Verpacken Sie das Produkt möglichst in der Originalverpackung. Es soll vollständig, unbeschädigt und ohne Gebrauchsspuren über die übliche Prüfung hinaus sein.",
      },
      {
        title: "Uns kontaktieren",
        body: "Schreiben Sie an die unten angegebene E-Mail-Adresse mit Ihrer Bestellnummer und dem Hinweis auf die Rücksendung. Wir bestätigen und senden Details.",
      },
      {
        title: "Paket senden",
        body: "Senden Sie das Produkt an die unten angegebene Adresse. Wir empfehlen eine Paketstation oder einen Kurier mit Versandnachweis.",
      },
      {
        title: "Rückerstattung",
        body: "Wir erstatten innerhalb von 14 Tagen nach Erhalt und Prüfung der Sendung mit derselben Zahlungsmethode.",
      },
    ],
    addressHeading: "Rücksendeadresse",
    addressLines: RETURN_ADDRESS,
    emailHeading: "Kontakt",
    emailValue: RETURN_EMAIL,
    noticeHeading: "Wichtig",
    noticeBody:
      "Die Rücksendekosten trägt der Käufer. Nachnahmesendungen werden nicht angenommen.",
  },
  UA: {
    title: "Процедура повернення",
    intro:
      "Ви маєте право повернути товар без пояснення причин протягом 14 днів з моменту отримання замовлення. Нижче — детальна інструкція.",
    timeLabel: "Термін повернення",
    timeValue: "14 днів з дати отримання",
    stepsHeading: "Крок за кроком",
    steps: [
      {
        title: "Перевірте термін",
        body: "Переконайтеся, що з моменту отримання посилки не минуло більше 14 днів.",
      },
      {
        title: "Упакуйте товар",
        body: "Якщо можливо, використайте оригінальну упаковку. Товар має бути повним, неушкодженим і без слідів використання поза межами звичайної перевірки.",
      },
      {
        title: "Напишіть нам",
        body: "Надішліть e-mail на адресу нижче з номером замовлення та інформацією про повернення. Ми надішлемо підтвердження та деталі.",
      },
      {
        title: "Відправте посилку",
        body: "Надішліть товар на адресу нижче. Рекомендуємо поштомат або кур'єра з підтвердженням відправлення.",
      },
      {
        title: "Повернення коштів",
        body: "Кошти повертаємо протягом 14 днів після отримання та перевірки посилки, тим самим способом оплати.",
      },
    ],
    addressHeading: "Адреса для повернення",
    addressLines: RETURN_ADDRESS,
    emailHeading: "Контакт",
    emailValue: RETURN_EMAIL,
    noticeHeading: "Важливо",
    noticeBody:
      "Вартість повернення оплачує покупець. Ми не приймаємо посилки з післяплатою.",
  },
  HU: {
    title: "Visszaküldési eljárás",
    intro:
      "A rendelés kézhezvételétől számított 14 napon belül indoklás nélkül visszaküldheti a terméket. Az alábbiakban részletesen leírjuk a folyamatot.",
    timeLabel: "Határidő",
    timeValue: "14 nap a kézbesítéstől",
    stepsHeading: "Lépésről lépésre",
    steps: [
      {
        title: "Ellenőrizze a határidőt",
        body: "Győződjön meg róla, hogy a csomag átvétele óta nem telt el 14 napnál több.",
      },
      {
        title: "Csomagolja be a terméket",
        body: "Lehetőleg az eredeti csomagolásban küldje vissza. A termék legyen teljes, sértetlen és a szokásos ellenőrzésen túli használat nyomai nélkül.",
      },
      {
        title: "Vegye fel velünk a kapcsolatot",
        body: "Küldjön e-mailt az alábbi címre a rendelés számával és a visszaküldés jelzésével. Visszaigazolást és részleteket küldünk.",
      },
      {
        title: "Küldje el a csomagot",
        body: "Küldje el a terméket az alábbi címre. Ajánljuk csomagautomatát vagy futárt feladási igazolással.",
      },
      {
        title: "Visszatérítés",
        body: "A csomag átvétele és ellenőrzése után 14 napon belül visszatérítjük az összeget ugyanazon a fizetési módon.",
      },
    ],
    addressHeading: "Visszaküldési cím",
    addressLines: RETURN_ADDRESS,
    emailHeading: "Kapcsolat",
    emailValue: RETURN_EMAIL,
    noticeHeading: "Fontos",
    noticeBody:
      "A visszaküldés költségét a vevő állja. Utánvétes csomagokat nem fogadunk.",
  },
  SK: {
    title: "Postup vrátenia tovaru",
    intro:
      "Máte právo vrátiť tovar bez uvedenia dôvodu do 14 dní od prevzatia objednávky. Nižšie podrobne popisujeme, ako na to.",
    timeLabel: "Termín vrátenia",
    timeValue: "14 dní od prevzatia",
    stepsHeading: "Krok za krokom",
    steps: [
      {
        title: "Skontrolujte termín",
        body: "Uistite sa, že od prevzatia zásielky neprešlo viac ako 14 dní.",
      },
      {
        title: "Zabaľte produkt",
        body: "Ak je to možné, použite originálny obal. Produkt musí byť kompletný, nepoškodený a bez stôp používania nad rámec bežnej kontroly.",
      },
      {
        title: "Napíšte nám",
        body: "Pošlite e-mail na adresu nižšie s číslom objednávky a informáciou o vrátení. Zašleme potvrdenie a detaily.",
      },
      {
        title: "Odošlite balík",
        body: "Odošlite produkt na adresu nižšie. Odporúčame balíkomat alebo kuriéra s potvrdením podania.",
      },
      {
        title: "Vrátenie peňazí",
        body: "Peniaze vraciame do 14 dní od prevzatia a kontroly zásielky rovnakou platobnou metódou.",
      },
    ],
    addressHeading: "Adresa na vrátenie",
    addressLines: RETURN_ADDRESS,
    emailHeading: "Kontakt",
    emailValue: RETURN_EMAIL,
    noticeHeading: "Dôležité",
    noticeBody:
      "Náklady na vrátenie hradí kupujúci. Zásielky na dobierku neprijímame.",
  },
  CS: {
    title: "Postup vrácení zboží",
    intro:
      "Máte právo vrátit zboží bez udání důvodu do 14 dnů od převzetí objednávky. Níže je podrobný postup.",
    timeLabel: "Lhůta pro vrácení",
    timeValue: "14 dní od převzetí",
    stepsHeading: "Krok za krokem",
    steps: [
      {
        title: "Zkontrolujte lhůtu",
        body: "Ujistěte se, že od převzetí zásilky neuplynulo více než 14 dní.",
      },
      {
        title: "Zabalte produkt",
        body: "Použijte pokud možno originální obal. Produkt musí být kompletní, nepoškozený a bez stop používání nad rámec běžné kontroly.",
      },
      {
        title: "Napište nám",
        body: "Pošlete e-mail na adresu níže s číslem objednávky a informací o vrácení. Pošleme potvrzení a detaily.",
      },
      {
        title: "Odešlete balík",
        body: "Odešlete produkt na adresu níže. Doporučujeme balíkovnu nebo kurýra s potvrzením podání.",
      },
      {
        title: "Vrácení peněz",
        body: "Peníze vracíme do 14 dní od převzetí a kontroly zásilky stejnou platební metodou.",
      },
    ],
    addressHeading: "Adresa pro vrácení",
    addressLines: RETURN_ADDRESS,
    emailHeading: "Kontakt",
    emailValue: RETURN_EMAIL,
    noticeHeading: "Důležité",
    noticeBody:
      "Náklady na vrácení hradí kupující. Zásilky na dobírku nepřijímáme.",
  },
};
