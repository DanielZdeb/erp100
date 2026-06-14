/**
 * Dobór kuriera do pudełka wysyłkowego.
 *
 * Dla danego pudełka (W × H × D + waga) zwracamy listę CourierRate, których
 * limity wymiarowo-wagowe są spełnione. Logika ma odzwierciedlać typowe
 * ograniczenia kurierów:
 *  - max waga (kg)
 *  - max długość najdłuższego boku (cm)
 *  - max suma trzech wymiarów (cm) — np. limit "obwód + długość" upraszczany
 *    do `W + H + D`, co jest standardową heurystyką
 *
 * Ograniczenia null traktujemy jako "brak limitu" — rate przechodzi automatycznie
 * po tym kryterium.
 *
 * Założenie: pudełko ustawione tak jak w bibliotece (nie rotujemy).
 */

export interface BoxDimsForFit {
  widthCm: number;
  heightCm: number;
  depthCm: number;
  /** Waga PUDEŁKA pustego — używana tylko gdy nie podano wagi netto. */
  weightKg?: number | null;
}

export interface CourierRateForFit {
  id: string;
  courierId: string;
  courierName: string;
  serviceType: string;
  maxWeightKg: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  maxSumDimsCm: number | null;
  isPaczkomat: boolean;
  pricePln: number;
}

export interface CourierFitResult {
  rate: CourierRateForFit;
  /** Powód odrzucenia gdy fit=false. Null gdy fit=true. */
  reason: string | null;
}

/**
 * Dla pudełka zwraca dwie listy:
 *  - fitting: kuriery+usługi, które pomieszczą paczkę
 *  - rejected: ci sami, ale z powodem odrzucenia (do tooltipa diagnostycznego)
 *
 * Wagę paczki bierzemy z `parcelWeightKg` (waga TOWARU + opakowanie). Gdy nie
 * podano, używamy samej `box.weightKg` (waga pustego pudełka) jako konserwatywny
 * fallback — to da raczej zaniżony wynik dopuszczalności, więc lepiej zawsze
 * podawać sumaryczną wagę.
 */
export function classifyCouriers(
  box: BoxDimsForFit,
  rates: CourierRateForFit[],
  parcelWeightKg?: number | null,
): { fitting: CourierFitResult[]; rejected: CourierFitResult[] } {
  const effWeight = parcelWeightKg ?? box.weightKg ?? null;
  const sortedDims = [box.widthCm, box.heightCm, box.depthCm].sort(
    (a, b) => b - a,
  );
  const longest = sortedDims[0];
  const middle = sortedDims[1];
  const shortest = sortedDims[2];
  const sumDims = box.widthCm + box.heightCm + box.depthCm;

  const fitting: CourierFitResult[] = [];
  const rejected: CourierFitResult[] = [];

  for (const rate of rates) {
    const reasons: string[] = [];

    if (rate.maxWeightKg != null && effWeight != null) {
      if (effWeight > rate.maxWeightKg) {
        reasons.push(
          `waga ${effWeight} kg > limit ${rate.maxWeightKg} kg`,
        );
      }
    }

    // Limit max długości — porównujemy z najdłuższym bokiem pudełka
    if (rate.maxLengthCm != null && longest > rate.maxLengthCm) {
      reasons.push(
        `najdłuższy bok ${longest} cm > limit ${rate.maxLengthCm} cm`,
      );
    }

    // Limit szerokości — porównujemy ze środkowym wymiarem
    if (rate.maxWidthCm != null && middle > rate.maxWidthCm) {
      reasons.push(
        `średni bok ${middle} cm > limit ${rate.maxWidthCm} cm`,
      );
    }

    // Limit wysokości — porównujemy z najkrótszym
    if (rate.maxHeightCm != null && shortest > rate.maxHeightCm) {
      reasons.push(
        `najkrótszy bok ${shortest} cm > limit ${rate.maxHeightCm} cm`,
      );
    }

    // Limit sumy wymiarów — często stosowany przez kurierów (np. InPost 41 + 38 + 64)
    if (rate.maxSumDimsCm != null && sumDims > rate.maxSumDimsCm) {
      reasons.push(
        `suma wymiarów ${sumDims} cm > limit ${rate.maxSumDimsCm} cm`,
      );
    }

    if (reasons.length === 0) {
      fitting.push({ rate, reason: null });
    } else {
      rejected.push({ rate, reason: reasons.join(", ") });
    }
  }

  // Sortuj pasujące: paczkomaty na górę, potem po cenie rosnąco
  fitting.sort((a, b) => {
    if (a.rate.isPaczkomat !== b.rate.isPaczkomat) {
      return a.rate.isPaczkomat ? -1 : 1;
    }
    return a.rate.pricePln - b.rate.pricePln;
  });

  return { fitting, rejected };
}

/** Skrócona forma — zwraca tylko listę pasujących rates posortowaną. */
export function fittingCouriers(
  box: BoxDimsForFit,
  rates: CourierRateForFit[],
  parcelWeightKg?: number | null,
): CourierRateForFit[] {
  return classifyCouriers(box, rates, parcelWeightKg).fitting.map(
    (r) => r.rate,
  );
}

/**
 * Sprawdza CZY pudełko mieści się w limicie wymiarowym danej stawki
 * (BEZ kontroli wagi — żeby pokazać user'owi pełny cennik wagowy).
 * Zwraca null gdy wymiary pasują, albo string z powodem odrzucenia.
 */
export function checkDimensionalFit(
  box: BoxDimsForFit,
  rate: CourierRateForFit,
): string | null {
  const sortedDims = [box.widthCm, box.heightCm, box.depthCm].sort(
    (a, b) => b - a,
  );
  const longest = sortedDims[0];
  const middle = sortedDims[1];
  const shortest = sortedDims[2];
  const sumDims = box.widthCm + box.heightCm + box.depthCm;
  const reasons: string[] = [];

  if (rate.maxLengthCm != null && longest > rate.maxLengthCm) {
    reasons.push(`najdłuższy bok ${longest} cm > ${rate.maxLengthCm} cm`);
  }
  if (rate.maxWidthCm != null && middle > rate.maxWidthCm) {
    reasons.push(`średni bok ${middle} cm > ${rate.maxWidthCm} cm`);
  }
  if (rate.maxHeightCm != null && shortest > rate.maxHeightCm) {
    reasons.push(`najkrótszy bok ${shortest} cm > ${rate.maxHeightCm} cm`);
  }
  if (rate.maxSumDimsCm != null && sumDims > rate.maxSumDimsCm) {
    reasons.push(`suma wymiarów ${sumDims} cm > ${rate.maxSumDimsCm} cm`);
  }
  return reasons.length === 0 ? null : reasons.join(", ");
}

export interface CourierBracketPricing {
  courierId: string;
  courierName: string;
  /** Stawki które wymiarowo pasują, posortowane po maxWeightKg ASC (najtaniej do najdrożej). */
  brackets: CourierRateForFit[];
  /** Czy któraś stawka oznaczona paczkomatem. */
  hasPaczkomat: boolean;
}

/**
 * Grupuje stawki kurierów po `courierId`. Dla każdego kuriera zwraca listę
 * stawek wymiarowo pasujących do pudełka (ignorując wagę paczki), posortowanych
 * po `maxWeightKg` ASC. Dzięki temu w tooltipie pokazujemy "cennik wagowy".
 *
 * Stawki BEZ `maxWeightKg` traktujemy jako "brak limitu" — pokazujemy je
 * na końcu z etykietą "bez limitu wagi".
 */
export function groupByCourierWithWeightBrackets(
  box: BoxDimsForFit,
  rates: CourierRateForFit[],
): CourierBracketPricing[] {
  const byCourier = new Map<string, CourierBracketPricing>();

  for (const rate of rates) {
    const dimsFit = checkDimensionalFit(box, rate);
    if (dimsFit != null) continue; // wymiary nie pasują — pomijamy

    let entry = byCourier.get(rate.courierId);
    if (!entry) {
      entry = {
        courierId: rate.courierId,
        courierName: rate.courierName,
        brackets: [],
        hasPaczkomat: false,
      };
      byCourier.set(rate.courierId, entry);
    }
    entry.brackets.push(rate);
    if (rate.isPaczkomat) entry.hasPaczkomat = true;
  }

  for (const entry of byCourier.values()) {
    entry.brackets.sort((a, b) => {
      const aW = a.maxWeightKg ?? Number.POSITIVE_INFINITY;
      const bW = b.maxWeightKg ?? Number.POSITIVE_INFINITY;
      if (aW !== bW) return aW - bW;
      return a.pricePln - b.pricePln;
    });
  }

  return Array.from(byCourier.values()).sort((a, b) => {
    // Paczkomaty na górę, dalej alfabetycznie po nazwie
    if (a.hasPaczkomat !== b.hasPaczkomat) return a.hasPaczkomat ? -1 : 1;
    return a.courierName.localeCompare(b.courierName);
  });
}
