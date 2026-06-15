/**
 * Przelicznik USD -> PLN dla widokow kosztow AI (Claude, Nano Banana, Imagen).
 *
 * Trzymamy hardcoded staly kurs orientacyjny zamiast pobierac z NBP live —
 * koszty AI sa orientacyjne ("mniej wiecej"), nie ma sensu zalezec od kursu
 * w realnym czasie. Aktualizuj `USD_TO_PLN` raz na pol roku jak kurs ucieknie.
 */

export const USD_TO_PLN = 4.05;

/** Sformatuj USD jako $X.XXXX. */
export function formatUsd(usd: number, decimals = 4): string {
  return `$${usd.toFixed(decimals)}`;
}

/** Sformatuj USD jako PLN: 0.54 zl. */
export function formatPln(usd: number, decimals = 2): string {
  return `${(usd * USD_TO_PLN).toFixed(decimals)} zł`;
}

/** "$0.134 (~0.54 zł)" — zwykle laczone w jednym labelu */
export function formatUsdPln(
  usd: number,
  opts: { usdDecimals?: number; plnDecimals?: number } = {},
): string {
  const u = formatUsd(usd, opts.usdDecimals ?? (usd < 0.1 ? 4 : usd < 1 ? 3 : 2));
  const p = formatPln(usd, opts.plnDecimals ?? 2);
  return `${u} (~${p})`;
}
