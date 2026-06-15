/**
 * Silnik kalkulacji belek dla zamówień materiałowych z PL.
 *
 * Fabryka sprzedaje materiał (tkaninę) w belkach o stałej długości.
 * Z każdej belki można pociąć kawałki o różnych długościach (4, 6, 7, 8 m).
 * Cięcia ŁĄCZONE w jednej belce — np. 7m + 7m + 8m + 6m = 28m z belki 98m.
 *
 * Minimum logistyczne fabryki: zwykle 5 belek per kolor — poniżej tego progu
 * fabryka nie realizuje zamówienia. UI ostrzega gdy zamawiamy mniej.
 *
 * Algorytm pakowania: First-Fit-Decreasing (FFD) — sortujemy żądane kawałki
 * malejąco po długości, wkładamy każdy do PIERWSZEJ belki w której się
 * mieści; jeśli żadna nie ma miejsca — otwieramy nową belkę. Wynik bliski
 * optymalnemu (różnica ≤ 11/9 ≈ 22% od optimum w najgorszym przypadku),
 * bardzo szybki i czytelny do tłumaczenia użytkownikowi.
 */

/** Domyślna długość belki w metrach (fabryczna). */
export const DEFAULT_BOLT_LENGTH_M = 98;
/** Minimum logistyczne — belek per kolor poniżej którego fabryka odmawia. */
export const DEFAULT_MIN_BOLTS_PER_COLOR = 6;

/** Pojedyncza pozycja materiału w zamówieniu po sparsowaniu. */
export type MaterialItem = {
  /** ID pozycji (z order item) — do referencji w UI. */
  itemId: string;
  /** Pełny SKU produktu (np. `AS-FABRIC-150-6M-BLACK`). */
  sku: string;
  /** Czytelna nazwa do tooltipu. */
  name: string;
  /** Długość pojedynczego kawałka w metrach. */
  lengthM: number;
  /** Klucz koloru z SKU (np. `BLACK`). Materiały o tym samym kluczu dzielą belki. */
  color: string;
  /** Ile sztuk tej długości i koloru zamówione. */
  quantity: number;
  /** URL grafiki produktu — pokazujemy jako miniaturę przy edycji ilości. */
  imageUrl?: string | null;
};

/** Cięcie w belce. */
export type BoltCut = {
  itemId: string;
  sku: string;
  lengthM: number;
};

/** Belka z listą cięć. */
export type Bolt = {
  /** Indeks (1-based) w obrębie koloru. */
  index: number;
  /** Łączna długość belki. */
  capacityM: number;
  /** Lista cięć (po kolei jak FFD je włożył). */
  cuts: BoltCut[];
  /** Suma długości cięć. */
  usedM: number;
  /** Pozostałe metry (odpad / wolne miejsce). */
  remainingM: number;
};

/** Pozycja w sugestii — ile sztuk danej długości. */
export type SuggestionPiece = { lengthM: number; count: number };

/** Sugestia zmian w zamówieniu — może zawierać DODANIE i/lub USUNIĘCIE
 *  cięć określonej długości. Np. „usuń 2× 4 m + dodaj 2× 6 m" to swap
 *  o delcie +4 m (zwiększa total) zwiększający szansę na perfekcyjne
 *  upakowanie belek. */
export type FillSuggestion = {
  /** Co usunąć z zamówienia. Pusta tablica gdy sugestia to czysty „add". */
  remove: SuggestionPiece[];
  /** Co dodać do zamówienia. Pusta tablica gdy sugestia to czysty „remove". */
  add: SuggestionPiece[];
  /** Delta metrów (add - remove). Pozytywna = zwiększa total. */
  netDeltaM: number;
  /** Łączna liczba przesuwanych sztuk — używane do sortowania (mniej = lepiej). */
  totalPiecesMoved: number;
};

/** Podsumowanie dla jednego koloru. */
export type ColorBoltSummary = {
  color: string;
  /** Wszystkie pozycje (różne długości) tego koloru. */
  items: MaterialItem[];
  /** Suma metrów żądanych dla tego koloru. */
  totalRequestedM: number;
  /** Belki potrzebne do realizacji (po FFD). */
  bolts: Bolt[];
  /** Liczba belek (= bolts.length). */
  boltsUsed: number;
  /** Sumaryczna pojemność (boltsUsed × capacityM). */
  totalCapacityM: number;
  /** Sumaryczny odpad (totalCapacityM - totalRequestedM). */
  totalWasteM: number;
  /** Procent wykorzystania (totalRequestedM / totalCapacityM). */
  utilizationPct: number;
  /** Czy spełnia minimum logistyczne (boltsUsed ≥ minBolts). */
  meetsMinimum: boolean;
  /** Ile belek brakuje do minimum (max(0, minBolts - boltsUsed)). */
  boltsShortOfMinimum: number;
  /** Ile metrów można jeszcze dosypać żeby napełnić nieużyte belki. */
  metersFreeInOpenBolts: number;
  /** Ile metrów można jeszcze dodać żeby osiągnąć minimum belek. */
  metersUntilMinimum: number;
  /** Top 3 sugestie cięć do DODANIA (`remove=[]`) żeby dopełnić belki bez odpadu. */
  suggestionsToAdd: FillSuggestion[];
  /** Top 3 sugestie cięć do USUNIĘCIA (`add=[]`) żeby zmieścić w mniej belek. */
  suggestionsToRemove: FillSuggestion[];
  /** Top 3 sugestie SWAP („usuń N× A + dodaj M× B") które gwarantują
   *  perfekcyjne wypełnienie aktualnej liczby belek. */
  suggestionsToSwap: FillSuggestion[];
};

export type BoltsAnalysis = {
  byColor: ColorBoltSummary[];
  totalBolts: number;
  totalRequestedM: number;
  totalCapacityM: number;
  totalWasteM: number;
  /** % wykorzystania całości. */
  utilizationPct: number;
  /** Ile kolorów nie spełnia minimum. */
  colorsBelowMinimum: number;
};

/** Wyciąga długość i kolor z SKU materiału.
 *
 * Format aktualny: `M-{PREFIX}-{WIDTH}-{LEN}M-{COLOR}`
 *  np. `M-AS-150-6M-BLACK` → lengthM=6, color="BLACK"
 *
 * Wspiera też legacy format `{PREFIX}-FABRIC-{WIDTH}-{LEN}M-{COLOR}` dla
 * zamówień sprzed rename'u SKU — żeby stare dane dalej parsowały się.
 *
 * Zwraca null gdy SKU nie pasuje (np. nie jest materiałem). */
export function parseMaterialSku(
  sku: string,
): { lengthM: number; color: string } | null {
  const m =
    sku.match(/^M-[A-Z]+-\d+-(\d+)M-(.+)$/i) ??
    sku.match(/^[A-Z]+-FABRIC-\d+-(\d+)M-(.+)$/i);
  if (!m) return null;
  const lengthM = Number(m[1]);
  const color = m[2].toUpperCase();
  if (!Number.isFinite(lengthM) || lengthM <= 0) return null;
  return { lengthM, color };
}

/**
 * Globalnie optymalne pakowanie cięć w belki — używa DP po stanach licznika.
 *
 * Greedy per-belka (poprzedni algorytm) dawał lokalne minima: pierwsze belki
 * były perfekcyjne, ale ostatnia często z dużym odpadem, bo dobre wzorce
 * zostały już zużyte. DP przeszukuje globalnie wszystkie SEKWENCJE wzorców,
 * żeby znaleźć minimum belek przy maksymalnym wykorzystaniu.
 *
 * Algorytm:
 *  1) Grupujemy cięcia po długości → licznik per długość (state = vector).
 *  2) Wstępnie generujemy WSZYSTKIE wzorce perfekcyjne (sum = capacityM).
 *  3) Memoizowana rekurencja: dla każdego stanu (licznika) próbujemy
 *     każdego pasującego wzorca perfekcyjnego + opcję „spakuj resztę w
 *     1 nie-perfekcyjną belkę". Zwracamy wybór z najmniejszą liczbą belek.
 *  4) Konwertujemy wzorce → konkretne belki z przypisanymi kawałkami.
 *
 * Złożoność: O(|states| × |patterns|). Dla typowych zamówień
 * (kilka długości, ~50 cięć każdej) — kilka milionów operacji, < 1 s.
 */
function packBoltsOptimal(
  pieces: { itemId: string; sku: string; lengthM: number }[],
  capacityM: number,
): Bolt[] {
  if (pieces.length === 0) return [];

  // Pula cięć per długość — do późniejszego rozdania konkretnym kawałkom.
  const pool = new Map<number, { itemId: string; sku: string; lengthM: number }[]>();
  for (const p of pieces) {
    const arr = pool.get(p.lengthM) ?? [];
    arr.push(p);
    pool.set(p.lengthM, arr);
  }
  const lengths = Array.from(pool.keys()).sort((a, b) => b - a);
  const counts = lengths.map((l) => pool.get(l)!.length);

  // Generowanie wszystkich wzorców perfekcyjnych (sum = capacityM) dla
  // dostępnych długości. Każdy wzorzec to wektor liczb równej długości
  // co `lengths`.
  const perfectPatterns: number[][] = [];
  (function genPatterns() {
    const cur = new Array(lengths.length).fill(0);
    function recurse(idx: number, remaining: number): void {
      if (remaining === 0) {
        perfectPatterns.push([...cur]);
        return;
      }
      if (idx >= lengths.length) return;
      const len = lengths[idx];
      const maxN = Math.floor(remaining / len);
      for (let n = 0; n <= maxN; n++) {
        cur[idx] = n;
        recurse(idx + 1, remaining - n * len);
      }
      cur[idx] = 0;
    }
    recurse(0, capacityM);
  })();

  // Memoizacja: dla danego stanu (licznika pozostałych) trzymamy optymalny
  // plan = lista wzorców. null = nie da się rozłożyć.
  type Plan = { patterns: number[][]; bolts: number };
  const memo = new Map<string, Plan>();

  function totalMetersOf(c: number[]): number {
    let s = 0;
    for (let i = 0; i < c.length; i++) s += c[i] * lengths[i];
    return s;
  }

  function patternFits(p: number[], c: number[]): boolean {
    for (let i = 0; i < p.length; i++) {
      if (p[i] > c[i]) return false;
    }
    return true;
  }

  // Timeout dla DP: dla większych zamówień DP eksploduje. Limit 800 ms
  // — jeśli przekroczymy, rzucamy `TIMEOUT_DP` i wracamy do greedy.
  const deadline = Date.now() + 800;
  const TIMEOUT = "TIMEOUT_DP";
  // Globalna granica gornym: minimalna liczba belek = ceil(total/capacity).
  // Branch-and-bound: jeśli częściowe rozwiązanie ma >= bestKnown belek, przycinamy.
  const totalAll = totalMetersOf(counts);
  const minBoltsLB = Math.ceil(totalAll / capacityM);
  let bestKnown = Number.POSITIVE_INFINITY;

  function dp(c: number[], depth: number): Plan {
    if (Date.now() > deadline) throw new Error(TIMEOUT);
    const key = c.join(",");
    const cached = memo.get(key);
    if (cached) return cached;

    const totalM = totalMetersOf(c);
    let best: Plan;
    if (totalM === 0) {
      best = { patterns: [], bolts: 0 };
    } else if (totalM <= capacityM + 1e-9) {
      best = { patterns: [[...c]], bolts: 1 };
    } else {
      // Dolny ogranicznik dla pozostałej części.
      const lb = Math.ceil(totalM / capacityM);
      if (depth + lb >= bestKnown) {
        // Już teraz wiemy, że ta gałąź nie przebije znanego minimum.
        best = { patterns: [], bolts: Number.POSITIVE_INFINITY };
      } else {
        best = { patterns: [], bolts: Number.POSITIVE_INFINITY };
        for (const pat of perfectPatterns) {
          if (!patternFits(pat, c)) continue;
          const newC = c.map((x, i) => x - pat[i]);
          const sub = dp(newC, depth + 1);
          if (sub.bolts + 1 < best.bolts) {
            best = { patterns: [pat, ...sub.patterns], bolts: sub.bolts + 1 };
            if (depth + best.bolts < bestKnown) {
              bestKnown = depth + best.bolts;
            }
            // Early-exit: znaleźliśmy rozwiązanie z minimum bolts (LB)
            if (depth + best.bolts === minBoltsLB) break;
          }
        }
        if (!Number.isFinite(best.bolts)) {
          // Fallback gdy brak wzorca perfekcyjnego
          const fallback = pickGreedyFill(c, lengths, capacityM);
          const newC = c.map((x, i) => x - fallback[i]);
          const sub = dp(newC, depth + 1);
          best = { patterns: [fallback, ...sub.patterns], bolts: sub.bolts + 1 };
        }
      }
    }
    memo.set(key, best);
    return best;
  }

  let plan: Plan;
  try {
    plan = dp(counts, 0);
  } catch (e) {
    if ((e as Error).message === TIMEOUT) {
      // Fallback do prostego greedy (per-belka heurystyka).
      plan = greedyPackPlan(counts, lengths, capacityM, perfectPatterns);
    } else {
      throw e;
    }
  }

  // Przelicz wzorce na konkretne belki z przypisanymi kawałkami.
  const bolts: Bolt[] = [];
  for (let i = 0; i < plan.patterns.length; i++) {
    const pat = plan.patterns[i];
    const cutsByLength: BoltCut[] = [];
    for (let j = 0; j < lengths.length; j++) {
      const n = pat[j];
      for (let k = 0; k < n; k++) {
        const piece = pool.get(lengths[j])!.pop()!;
        cutsByLength.push({
          itemId: piece.itemId,
          sku: piece.sku,
          lengthM: lengths[j],
        });
      }
    }
    // Hierarchia: cięcia od najmniejszych do największych — czytelnie
    // pokazuje strukturę belki (małe ⇒ duże).
    const cuts = [...cutsByLength].sort((a, b) => a.lengthM - b.lengthM);
    const usedM = round2(cuts.reduce((s, c) => s + c.lengthM, 0));
    bolts.push({
      index: i + 1,
      capacityM,
      cuts,
      usedM,
      remainingM: round2(capacityM - usedM),
    });
  }
  return bolts;
}

/** Fallback greedy — wybiera największą kombinację długości mieszczącą
 *  się ≤ capacityM, gdy DP nie znajduje wzorca perfekcyjnego. */
function pickGreedyFill(
  counts: number[],
  lengths: number[],
  capacityM: number,
): number[] {
  const result = new Array(counts.length).fill(0);
  let remaining = capacityM;
  for (let i = 0; i < lengths.length; i++) {
    const maxN = Math.min(counts[i], Math.floor(remaining / lengths[i]));
    result[i] = maxN;
    remaining -= maxN * lengths[i];
  }
  return result;
}

/** Plan pakowania greedy (per-belka best fit z wzorców perfekcyjnych) —
 *  używany jako fallback gdy DP przekroczy timeout. Szybki, bliski optimum
 *  ale nie gwarantuje minimum belek.
 *
 *  Dla każdej belki przeszukuje wzorce perfekcyjne pasujące do licznika
 *  (preferuje pasujące dokładnie do capacityM), gdy żaden nie pasuje
 *  → bierze największą kombinację mieszczącą się ≤ capacityM. */
function greedyPackPlan(
  initialCounts: number[],
  lengths: number[],
  capacityM: number,
  perfectPatterns: number[][],
): { patterns: number[][]; bolts: number } {
  const counts = [...initialCounts];
  const patterns: number[][] = [];
  const fits = (p: number[]) => p.every((n, i) => n <= counts[i]);
  while (true) {
    const total = counts.reduce((s, c, i) => s + c * lengths[i], 0);
    if (total === 0) break;
    if (total <= capacityM + 1e-9) {
      patterns.push([...counts]);
      break;
    }
    // Próbuj wzorzec perfekcyjny — pierwszy dopasowany.
    let used: number[] | null = null;
    for (const pat of perfectPatterns) {
      if (fits(pat)) {
        used = pat;
        break;
      }
    }
    if (!used) used = pickGreedyFill(counts, lengths, capacityM);
    patterns.push([...used]);
    for (let i = 0; i < counts.length; i++) counts[i] -= used[i];
    // Safety: brak postępu → przerwij.
    if (used.every((n) => n === 0)) break;
  }
  return { patterns, bolts: patterns.length };
}

/**
 * Przeplata cięcia tak, żeby długie i krótkie alternatywnie pojawiały się
 * w wizualizacji belki (zamiast wszystkich długich na początku). Dodatkowo
 * rotuje punkt startu o `rotateBy` pozycji — dzięki czemu kolejne belki
 * wyglądają inaczej (długie u góry/dołu wymieszane wzdłuż wszystkich belek).
 */
function interleaveAndRotate(
  cuts: BoltCut[],
  rotateBy: number,
): BoltCut[] {
  if (cuts.length <= 1) return cuts;
  const sorted = [...cuts].sort((a, b) => b.lengthM - a.lengthM);
  // Przeplot: bierzemy raz z lewej (najdłuższe), raz z prawej (najkrótsze)
  // — wynik to długie i krótkie naprzemiennie.
  const interleaved: BoltCut[] = [];
  let l = 0;
  let r = sorted.length - 1;
  let takeLeft = true;
  while (l <= r) {
    if (takeLeft) interleaved.push(sorted[l++]);
    else interleaved.push(sorted[r--]);
    takeLeft = !takeLeft;
  }
  // Rotacja: przesuwamy o `rotateBy mod len` — żeby kolejne belki nie
  // zaczynały się zawsze tym samym typem cięcia.
  const n = interleaved.length;
  const shift = ((rotateBy % n) + n) % n;
  return [...interleaved.slice(shift), ...interleaved.slice(0, shift)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Standardowe długości materiałowe (do generowania sugestii dosypania/odjęcia). */
const DEFAULT_AVAILABLE_LENGTHS_M = [8, 7, 6, 4];

/**
 * Helper: znajduje kombinacje sumujące się dokładnie do `targetM` z podanych
 * długości. Zwraca listę „pieces" — wsadowych do `SuggestionPiece[]`.
 * Niewykonalne (np. 1 m z {4, 6, 7, 8}) → pusta lista.
 */
function findSumCombos(
  targetM: number,
  availableLengths: number[] = DEFAULT_AVAILABLE_LENGTHS_M,
  maxCombos = 5,
): SuggestionPiece[][] {
  if (targetM <= 0.01) return [];
  const target = Math.round(targetM);
  if (target !== targetM && Math.abs(targetM - target) > 0.01) return [];
  const lengths = [...availableLengths].sort((a, b) => b - a);
  const all: SuggestionPiece[][] = [];
  function recurse(idx: number, remaining: number, current: number[]): void {
    if (remaining === 0) {
      const pieces = lengths
        .map((len, i) => ({ lengthM: len, count: current[i] ?? 0 }))
        .filter((p) => p.count > 0);
      if (pieces.length > 0) all.push(pieces);
      return;
    }
    if (idx >= lengths.length || remaining < 0) return;
    const len = lengths[idx];
    const maxN = Math.floor(remaining / len);
    for (let n = 0; n <= maxN; n++) {
      current[idx] = n;
      recurse(idx + 1, remaining - n * len, current);
      if (all.length >= maxCombos * 6) return;
    }
    current[idx] = 0;
  }
  recurse(0, target, []);
  all.sort((a, b) => {
    const sumA = a.reduce((s, p) => s + p.count, 0);
    const sumB = b.reduce((s, p) => s + p.count, 0);
    if (sumA !== sumB) return sumA - sumB;
    return a.length - b.length;
  });
  return all.slice(0, maxCombos);
}

function totalPiecesIn(pieces: SuggestionPiece[]): number {
  return pieces.reduce((s, p) => s + p.count, 0);
}

function sumMeters(pieces: SuggestionPiece[]): number {
  return pieces.reduce((s, p) => s + p.count * p.lengthM, 0);
}

/**
 * Sprawdza czy z aktualnej puli (po hipotetycznym swapie) wszystkie belki
 * można upakować PERFEKCYJNIE (suma = capacityM × boltsCount).
 *
 * Konwencja: zwraca true gdy
 *   - total = boltsCount × capacityM (warunek konieczny)
 *   - packBoltsOptimal daje wszystkie belki bez odpadu.
 */
function fitsPerfectly(
  countsByLength: Map<number, number>,
  capacityM: number,
  expectedBoltsCount: number,
): boolean {
  let totalM = 0;
  for (const [len, count] of countsByLength) totalM += len * count;
  if (Math.abs(totalM - expectedBoltsCount * capacityM) > 0.01) return false;
  // Symulujemy packing: tworzymy listę pieces (bez itemId — nie istotne tutaj).
  const pieces: { itemId: string; sku: string; lengthM: number }[] = [];
  for (const [len, count] of countsByLength) {
    for (let i = 0; i < count; i++) {
      pieces.push({ itemId: "sim", sku: "sim", lengthM: len });
    }
  }
  const packed = packBoltsOptimal(pieces, capacityM);
  if (packed.length !== expectedBoltsCount) return false;
  return packed.every((b) => b.remainingM <= 0.1);
}

/**
 * Sugestia DODANIA — kombinacje summujące się do `targetM` które
 * dodatkowo weryfikują, że po dodaniu wszystkie belki da się upakować
 * IDEALNIE (sum = expectedBolts × capacity). Bez weryfikacji algorytm
 * dawał sugestie matematycznie poprawne, ale nieprzepakowywalne
 * (np. „dodaj 4 m" gdy żaden wzorzec 98 m nie uwzględnia dostępnych pieces).
 */
function findAddOnlyCombos(
  targetM: number,
  currentCounts: Map<number, number>,
  capacityM: number,
  expectedBolts: number,
  availableLengths: number[] = DEFAULT_AVAILABLE_LENGTHS_M,
  maxCombos = 3,
): FillSuggestion[] {
  const candidates = findSumCombos(targetM, availableLengths, maxCombos * 8);
  const verified: FillSuggestion[] = [];
  for (const pieces of candidates) {
    const newCounts = new Map(currentCounts);
    for (const p of pieces) {
      newCounts.set(p.lengthM, (newCounts.get(p.lengthM) ?? 0) + p.count);
    }
    if (!fitsPerfectly(newCounts, capacityM, expectedBolts)) continue;
    verified.push({
      remove: [],
      add: pieces,
      netDeltaM: sumMeters(pieces),
      totalPiecesMoved: totalPiecesIn(pieces),
    });
    if (verified.length >= maxCombos) break;
  }
  return verified;
}

/** Sugestia USUNIĘCIA — kombinacje summujące się do `targetM` z cięć
 *  rzeczywiście dostępnych w zamówieniu, które po usunięciu zostawiają
 *  liczniki dające się upakować PERFEKCYJNIE w `expectedBolts` belek. */
function findRemoveOnlyCombos(
  targetM: number,
  currentCounts: Map<number, number>,
  capacityM: number,
  expectedBolts: number,
  maxCombos = 3,
): FillSuggestion[] {
  // Tylko długości faktycznie obecne w zamówieniu.
  const availableLengths = Array.from(currentCounts.keys())
    .filter((l) => (currentCounts.get(l) ?? 0) > 0)
    .sort((a, b) => b - a);
  const candidates = findSumCombos(targetM, availableLengths, maxCombos * 8);
  const verified: FillSuggestion[] = [];
  for (const pieces of candidates) {
    // Wszystkie sztuki w sugestii muszą być w zamówieniu.
    const allAvail = pieces.every(
      (p) => (currentCounts.get(p.lengthM) ?? 0) >= p.count,
    );
    if (!allAvail) continue;
    const newCounts = new Map(currentCounts);
    for (const p of pieces) {
      newCounts.set(p.lengthM, (newCounts.get(p.lengthM) ?? 0) - p.count);
    }
    if (!fitsPerfectly(newCounts, capacityM, expectedBolts)) continue;
    verified.push({
      remove: pieces,
      add: [],
      netDeltaM: -sumMeters(pieces),
      totalPiecesMoved: totalPiecesIn(pieces),
    });
    if (verified.length >= maxCombos) break;
  }
  return verified;
}

/**
 * Sugestie SWAP — usuń N× długości A + dodaj M× długości B (i ewentualnie C…)
 * tak żeby:
 *   • delta = waste (zamówienie wzrasta o waste m → wszystkie belki pełne)
 *   • po swapie WSZYSTKIE belki dają się upakować PERFEKCYJNIE (sprawdzane
 *     przez `fitsPerfectly`).
 *
 * Heurystyka:
 *   • iterujemy usunięcie 1 typu długości (1..k sztuk gdzie k = dostępne)
 *   • dla każdego usunięcia szukamy kombinacji dodań sumującej się do
 *     `waste + removedMeters` (zachowuje delta = waste).
 *   • odrzucamy trywialne (np. „usuń 1× 4m, dodaj 2× 4m" = po prostu „dodaj 1× 4m").
 *   • dla każdej kombinacji `fitsPerfectly` sprawdza czy daje rzeczywiście
 *     pełne upakowanie w `boltsUsed` belek.
 */
function findSwapCombos(
  waste: number,
  currentCounts: Map<number, number>,
  boltsUsed: number,
  capacityM: number,
  availableLengths: number[] = DEFAULT_AVAILABLE_LENGTHS_M,
  maxResults = 3,
): FillSuggestion[] {
  if (waste <= 0.01 || boltsUsed <= 0) return [];
  const results: FillSuggestion[] = [];
  const lengths = [...availableLengths].sort((a, b) => b - a);

  for (const removeLen of lengths) {
    const avail = currentCounts.get(removeLen) ?? 0;
    if (avail === 0) continue;
    // Maksymalna liczba do usunięcia — ograniczamy żeby nie eksplodować.
    const maxRemove = Math.min(avail, 20);
    for (let removeN = 1; removeN <= maxRemove; removeN++) {
      const removeM = removeN * removeLen;
      const targetAddM = waste + removeM;
      const addCandidates = findSumCombos(targetAddM, availableLengths, 5);
      for (const addPieces of addCandidates) {
        // Odrzuć trywialne: gdy add zawiera tylko removeLen (przepychanie
        // tej samej długości — równoważne czystemu dodaniu).
        const onlySameLength =
          addPieces.length === 1 && addPieces[0].lengthM === removeLen;
        if (onlySameLength) continue;
        // Sprawdź czy po swapie pakowanie jest perfekcyjne w boltsUsed belek.
        const newCounts = new Map(currentCounts);
        newCounts.set(removeLen, avail - removeN);
        for (const ap of addPieces) {
          newCounts.set(
            ap.lengthM,
            (newCounts.get(ap.lengthM) ?? 0) + ap.count,
          );
        }
        if (!fitsPerfectly(newCounts, capacityM, boltsUsed)) continue;
        const remove: SuggestionPiece[] = [
          { lengthM: removeLen, count: removeN },
        ];
        results.push({
          remove,
          add: addPieces,
          netDeltaM: round2(sumMeters(addPieces) - sumMeters(remove)),
          totalPiecesMoved: totalPiecesIn(remove) + totalPiecesIn(addPieces),
        });
        if (results.length >= maxResults * 8) break;
      }
      if (results.length >= maxResults * 8) break;
    }
  }
  // Sort: po totalPiecesMoved rosnąco (najmniej przesuwania = najlepiej).
  results.sort((a, b) => a.totalPiecesMoved - b.totalPiecesMoved);
  // Dedup: usuń duplikaty (ten sam remove + add).
  const seen = new Set<string>();
  const dedup: FillSuggestion[] = [];
  for (const r of results) {
    const key =
      r.remove.map((p) => `${p.lengthM}x${p.count}`).join("|") +
      "→" +
      r.add.map((p) => `${p.lengthM}x${p.count}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(r);
    if (dedup.length >= maxResults) break;
  }
  return dedup;
}

/** Główna kalkulacja belek dla listy pozycji zamówienia. */
export function analyzeBolts(
  items: MaterialItem[],
  options: {
    boltLengthM?: number;
    minBoltsPerColor?: number;
  } = {},
): BoltsAnalysis {
  const capacityM = options.boltLengthM ?? DEFAULT_BOLT_LENGTH_M;
  const minBolts = options.minBoltsPerColor ?? DEFAULT_MIN_BOLTS_PER_COLOR;

  // Grupuj po kolorze.
  const byColorMap = new Map<string, MaterialItem[]>();
  for (const it of items) {
    const arr = byColorMap.get(it.color) ?? [];
    arr.push(it);
    byColorMap.set(it.color, arr);
  }

  const byColor: ColorBoltSummary[] = [];
  for (const [color, colorItems] of byColorMap) {
    // Rozwijamy ilości do listy pojedynczych kawałków.
    const pieces: { itemId: string; sku: string; lengthM: number }[] = [];
    for (const it of colorItems) {
      for (let i = 0; i < it.quantity; i++) {
        pieces.push({
          itemId: it.itemId,
          sku: it.sku,
          lengthM: it.lengthM,
        });
      }
    }
    const totalRequestedM = round2(
      pieces.reduce((s, p) => s + p.lengthM, 0),
    );
    const packedBolts = packBoltsOptimal(pieces, capacityM);
    const boltsUsed = packedBolts.length;
    // Dopełniamy do minimum logistycznego pustymi belkami, żeby UI zawsze
    // pokazywało 5 belek per kolor — wizualnie informują że są wymagane.
    const bolts: Bolt[] = [...packedBolts];
    while (bolts.length < minBolts) {
      bolts.push({
        index: bolts.length + 1,
        capacityM,
        cuts: [],
        usedM: 0,
        remainingM: capacityM,
      });
    }
    const totalCapacityM = round2(boltsUsed * capacityM);
    const totalWasteM = round2(totalCapacityM - totalRequestedM);
    const utilizationPct =
      totalCapacityM > 0
        ? round2((totalRequestedM / totalCapacityM) * 100)
        : 0;
    const metersFreeInOpenBolts = round2(
      packedBolts.reduce((s, b) => s + b.remainingM, 0),
    );
    const meetsMinimum = boltsUsed >= minBolts;
    const boltsShortOfMinimum = Math.max(0, minBolts - boltsUsed);
    // Metry do dosypania żeby dopełnić minimum: brakujące belki × pełna pojemność
    // + miejsce w aktualnie otwartych belkach.
    const metersUntilMinimum = round2(
      metersFreeInOpenBolts + boltsShortOfMinimum * capacityM,
    );

    // Bieżąca pula cięć per długość — do wyliczenia sugestii swap.
    const currentCounts = new Map<number, number>();
    for (const it of colorItems) {
      currentCounts.set(
        it.lengthM,
        (currentCounts.get(it.lengthM) ?? 0) + it.quantity,
      );
    }

    // Sugestie ADD — żeby dopełnić belki BEZ ODPADU.
    // Cel = ile metrów do dodania. Po dodaniu liczba belek = boltsUsed (gdy
    // meetsMinimum) lub minBolts (gdy nie spełnia minimum).
    const expectedBoltsAfterAdd = meetsMinimum ? boltsUsed : minBolts;
    const goalAddM = meetsMinimum
      ? metersFreeInOpenBolts
      : metersUntilMinimum;
    const suggestionsToAdd = findAddOnlyCombos(
      goalAddM,
      currentCounts,
      capacityM,
      expectedBoltsAfterAdd,
    );

    // Sugestie REMOVE — usuwamy żeby zmieścić w boltsUsed - 1 belek.
    let suggestionsToRemove: FillSuggestion[] = [];
    if (boltsUsed > 1 && totalWasteM > 0.1) {
      const targetWithLessBolts = (boltsUsed - 1) * capacityM;
      const removeM = round2(totalRequestedM - targetWithLessBolts);
      if (removeM > 0) {
        suggestionsToRemove = findRemoveOnlyCombos(
          removeM,
          currentCounts,
          capacityM,
          boltsUsed - 1,
        );
      }
    }

    // Sugestie SWAP — gdy belki nie są pełne, próbujemy znaleźć swap który
    // GWARANTUJE perfekcyjne wypełnienie w aktualnej liczbie belek.
    // Wymaga: dostępu do currentCounts i symulacji packBoltsOptimal.
    let suggestionsToSwap: FillSuggestion[] = [];
    if (metersFreeInOpenBolts > 0.05 && boltsUsed > 0) {
      suggestionsToSwap = findSwapCombos(
        metersFreeInOpenBolts,
        currentCounts,
        boltsUsed,
        capacityM,
      );
    }

    byColor.push({
      color,
      items: colorItems,
      totalRequestedM,
      bolts,
      boltsUsed,
      totalCapacityM,
      totalWasteM,
      utilizationPct,
      meetsMinimum,
      boltsShortOfMinimum,
      metersFreeInOpenBolts,
      metersUntilMinimum,
      suggestionsToAdd,
      suggestionsToRemove,
      suggestionsToSwap,
    });
  }

  // Sortuj kolory alfabetycznie — stabilna kolejność, sekcje nie skaczą
  // gdy zmienia się liczba belek (np. po edycji ilości materiału).
  byColor.sort((a, b) => a.color.localeCompare(b.color));

  const totalBolts = byColor.reduce((s, c) => s + c.boltsUsed, 0);
  const totalRequestedM = round2(
    byColor.reduce((s, c) => s + c.totalRequestedM, 0),
  );
  const totalCapacityM = round2(
    byColor.reduce((s, c) => s + c.totalCapacityM, 0),
  );
  const totalWasteM = round2(totalCapacityM - totalRequestedM);
  const utilizationPct =
    totalCapacityM > 0
      ? round2((totalRequestedM / totalCapacityM) * 100)
      : 0;
  const colorsBelowMinimum = byColor.filter((c) => !c.meetsMinimum).length;

  return {
    byColor,
    totalBolts,
    totalRequestedM,
    totalCapacityM,
    totalWasteM,
    utilizationPct,
    colorsBelowMinimum,
  };
}

/** Mapowanie nazw kolorów (z SKU) na czytelne polskie nazwy + hex do podświetlenia. */
export const COLOR_PRESETS: Record<
  string,
  { label: string; hex: string; textOnBg: "light" | "dark" }
> = {
  BLACK: { label: "czarny", hex: "#1f2937", textOnBg: "light" },
  WHITE: { label: "biały", hex: "#f3f4f6", textOnBg: "dark" },
  PURPLE: { label: "fioletowy", hex: "#7c3aed", textOnBg: "light" },
  PINK: { label: "różowy", hex: "#ec4899", textOnBg: "light" },
  PASTELPINK: { label: "pastel róż", hex: "#fbcfe8", textOnBg: "dark" },
  GOLD: { label: "złoty", hex: "#ca8a04", textOnBg: "light" },
  GREEN: { label: "zielony", hex: "#16a34a", textOnBg: "light" },
  "D.GREEN": { label: "ciemnozielony", hex: "#14532d", textOnBg: "light" },
  GREY: { label: "szary", hex: "#9ca3af", textOnBg: "light" },
  DARKGREY: { label: "ciemnoszary", hex: "#4b5563", textOnBg: "light" },
  DARKBEIGE: { label: "ciemnobeżowy", hex: "#a47148", textOnBg: "light" },
  LIGHTBEIGE: { label: "jasny beż", hex: "#e8d8b8", textOnBg: "dark" },
  "R.BLUE": { label: "granatowy", hex: "#1e3a8a", textOnBg: "light" },
  "S.BLUE": { label: "jasnoniebieski", hex: "#7dd3fc", textOnBg: "dark" },
  PIST: { label: "pistacjowy", hex: "#a3e635", textOnBg: "dark" },
};

export function colorMeta(
  color: string,
): { label: string; hex: string; textOnBg: "light" | "dark" } {
  return (
    COLOR_PRESETS[color] ?? {
      label: color.toLowerCase(),
      hex: "#94a3b8",
      textOnBg: "light",
    }
  );
}

/** Status belki — używany do podświetlenia kropki na początku wiersza.
 *  • empty — belka w ogóle nie uzupełniona (0 m użyte) → czerwony.
 *  • full — belka DOKŁADNIE pełna (remainingM ≈ 0) → zielony.
 *  • partial — wszystko pomiędzy, nawet 1 m wolnego → pomarańczowy. */
export type BoltStatus = "empty" | "partial" | "full";

export function boltStatus(bolt: Bolt): BoltStatus {
  if (bolt.usedM <= 0.001) return "empty";
  // Zielona TYLKO gdy belka 100% wypełniona (mniej niż 0,1 m wolnego).
  if (bolt.remainingM <= 0.1) return "full";
  return "partial";
}
