/**
 * Wybór widełek prowizji pośrednika dla danej wartości towaru w USD oraz
 * przeliczenie kwoty prowizji na PLN.
 */

/**
 * Domyślna tabela widełek z umowy ramowej Fullbax (Załącznik do umowy).
 * Współdzielona przez `server/broker-commission.ts` (UI seed) oraz
 * `server/order-costs.ts` (auto-apply przy otwieraniu zamówienia).
 */
export const FULLBAX_DEFAULT_TIERS = [
  { minValueUsd: 0, maxValueUsd: 25_000, ratePct: null, flatPln: 6000, individual: false, sortOrder: 0 },
  { minValueUsd: 25_000, maxValueUsd: 50_000, ratePct: 0.055, flatPln: null, individual: false, sortOrder: 1 },
  { minValueUsd: 50_000, maxValueUsd: 100_000, ratePct: 0.05, flatPln: null, individual: false, sortOrder: 2 },
  { minValueUsd: 100_000, maxValueUsd: 200_000, ratePct: 0.045, flatPln: null, individual: false, sortOrder: 3 },
  { minValueUsd: 200_000, maxValueUsd: 300_000, ratePct: 0.04, flatPln: null, individual: false, sortOrder: 4 },
  { minValueUsd: 300_000, maxValueUsd: 400_000, ratePct: 0.035, flatPln: null, individual: false, sortOrder: 5 },
  { minValueUsd: 400_000, maxValueUsd: 500_000, ratePct: 0.03, flatPln: null, individual: false, sortOrder: 6 },
  { minValueUsd: 500_000, maxValueUsd: 1_000_000, ratePct: 0.025, flatPln: null, individual: false, sortOrder: 7 },
  { minValueUsd: 1_000_000, maxValueUsd: null, ratePct: null, flatPln: null, individual: true, sortOrder: 8 },
] as const;

export type BrokerTier = {
  id: string;
  minValueUsd: number;
  maxValueUsd: number | null;
  ratePct: number | null; // 0..1
  flatPln: number | null;
  individual: boolean;
  brokerName: string;
};

export type BrokerCommissionResult = {
  tier: BrokerTier | null;
  /** Kwota prowizji w PLN. 0 gdy indywidualne (negocjowane). */
  amountPln: number;
  /** Kwota w USD (gdy wyliczona procentowo) — do informacji. */
  amountUsd: number | null;
  /** Czy bracket jest indywidualny (do negocjacji). */
  isIndividual: boolean;
};

/**
 * Znajduje pasujący przedział: minValueUsd <= goodsValueUsd < maxValueUsd
 * (max=null traktujemy jako nieskończoność).
 */
export function findBrokerTier(
  goodsValueUsd: number,
  tiers: BrokerTier[],
): BrokerTier | null {
  for (const t of tiers) {
    if (goodsValueUsd < t.minValueUsd) continue;
    if (t.maxValueUsd != null && goodsValueUsd >= t.maxValueUsd) continue;
    return t;
  }
  return null;
}

/**
 * Liczy kwotę prowizji w PLN dla danej wartości towaru w USD przy danym kursie USD→PLN.
 * Polityka:
 *   - flatPln (ryczałt) → zwraca dokładnie tę kwotę
 *   - ratePct → goodsValueUsd × ratePct × usdToPlnRate
 *   - individual → 0 (negocjowane indywidualnie poza systemem)
 */
export function computeBrokerCommissionPln(
  goodsValueUsd: number,
  usdToPlnRate: number,
  tiers: BrokerTier[],
): BrokerCommissionResult {
  if (goodsValueUsd <= 0) {
    return { tier: null, amountPln: 0, amountUsd: 0, isIndividual: false };
  }
  const tier = findBrokerTier(goodsValueUsd, tiers);
  if (!tier) {
    return { tier: null, amountPln: 0, amountUsd: 0, isIndividual: false };
  }
  if (tier.individual) {
    return { tier, amountPln: 0, amountUsd: null, isIndividual: true };
  }
  if (tier.flatPln != null) {
    return {
      tier,
      amountPln: tier.flatPln,
      amountUsd: null,
      isIndividual: false,
    };
  }
  if (tier.ratePct != null && usdToPlnRate > 0) {
    const amountUsd = goodsValueUsd * tier.ratePct;
    return {
      tier,
      amountPln: amountUsd * usdToPlnRate,
      amountUsd,
      isIndividual: false,
    };
  }
  return { tier, amountPln: 0, amountUsd: 0, isIndividual: false };
}
