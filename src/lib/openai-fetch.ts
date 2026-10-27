/**
 * Prosty wrapper na fetch() z timeoutem dla wywolan OpenAI API.
 * Reponses API moze dlugo generowac (web_search + duzy prompt), dajemy
 * 4 min domyslnie. Nie retry — kazdy retry kosztuje tokens.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 240_000,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}
