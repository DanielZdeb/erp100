/**
 * NBP — pobieranie aktualnych kursów średnich NBP (tabela A).
 * Endpoint: https://api.nbp.pl/api/exchangerates/rates/A/{CURRENCY}/?format=json
 *
 * Używane w formularzach gdzie wpisujemy kursy USD/CNY/EUR — komponent
 * `CurrencyRateInput` woła `fetchNbpRate()` przy mount i pokazuje
 * aktualny kurs jako sugestię + przycisk „użyj".
 */

export type NbpRate = {
  /** Kod waluty, np. „USD". */
  currency: string;
  /** Średni kurs NBP (PLN za 1 jednostkę waluty). */
  mid: number;
  /** Data tabeli NBP (YYYY-MM-DD). */
  effectiveDate: string;
  /** Numer tabeli NBP, np. „219/A/NBP/2026". */
  tableNo: string;
};

const SUPPORTED = ["USD", "CNY", "EUR", "GBP"] as const;
export type SupportedCurrency = (typeof SUPPORTED)[number];

/**
 * Cache na 4h — kursy NBP zmieniają się raz dziennie (publikacja ~12:00),
 * więc 4h to bezpieczny TTL zarówno dla SSR jak i dla użytkowników
 * pracujących cały dzień.
 */
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const cache = new Map<string, { value: NbpRate; expiresAt: number }>();

/**
 * Pobiera aktualny kurs NBP dla danej waluty. Cache in-memory.
 * Zwraca `null` jeśli API niedostępne (no throw — to tylko podpowiedź).
 */
export async function fetchNbpRate(
  currency: SupportedCurrency,
): Promise<NbpRate | null> {
  const now = Date.now();
  const cached = cache.get(currency);
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const res = await fetch(
      `https://api.nbp.pl/api/exchangerates/rates/A/${currency}/?format=json`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      currency: string;
      code: string;
      rates: { no: string; effectiveDate: string; mid: number }[];
    };
    const r = data.rates[0];
    if (!r) return null;
    const value: NbpRate = {
      currency: data.code,
      mid: r.mid,
      effectiveDate: r.effectiveDate,
      tableNo: r.no,
    };
    cache.set(currency, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch {
    return null;
  }
}
