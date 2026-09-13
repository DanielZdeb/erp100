import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// Subdomena welcome.acro4f.com serwuje TYLKO publiczny reader instrukcji.
// Kazda inna sciezka (login, produkty, api) → redirect na home publiczne.
const WELCOME_HOST = "welcome.acro4f.com";

// Wspierane jezyki na publicznych podstronach. Duplikat z lib/publiczne-content
// swiadomy — proxy leci w edge, unikamy niepotrzebnych zaleznosci.
const PUBLIC_LANGS = ["PL", "EN", "DE", "UA", "HU", "SK", "CS"] as const;
type PublicLang = (typeof PUBLIC_LANGS)[number];
const PUBLIC_LANG_SET: Set<string> = new Set(PUBLIC_LANGS);
const COOKIE_NAME = "acro4f_lang";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 rok

// Accept-Language locale prefix → nasz kod
const LOCALE_MAP: Record<string, PublicLang> = {
  pl: "PL",
  en: "EN",
  de: "DE",
  uk: "UA", // Accept-Language dla ukr = "uk"
  ua: "UA",
  hu: "HU",
  sk: "SK",
  cs: "CS",
  cz: "CS",
};

function detectLangFromHeader(acceptLang: string | null): PublicLang | null {
  if (!acceptLang) return null;
  // "pl-PL,pl;q=0.9,en;q=0.8" → posortowane po q (Accept-Language jest juz
  // w kolejnosci preferencji, wiec bierzemy pierwszy dopasowany)
  const langs = acceptLang.split(",").map((s) => {
    const [locale] = s.trim().split(";");
    return (locale ?? "").toLowerCase();
  });
  for (const l of langs) {
    if (!l) continue;
    const base = l.split("-")[0];
    if (base && LOCALE_MAP[base]) return LOCALE_MAP[base];
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function proxy(request: NextRequest, ev: any) {
  const host = (request.headers.get("host") ?? "").toLowerCase();

  if (host === WELCOME_HOST) {
    const url = request.nextUrl.clone();
    const { pathname } = url;

    // 1. Dozwolone bez auth: strony readera, statyki Next, uploads (obrazy).
    const isAllowed =
      pathname.startsWith("/publiczne") ||
      pathname.startsWith("/uploads") ||
      pathname.startsWith("/_next") ||
      pathname === "/favicon.ico";
    if (!isAllowed) {
      url.pathname = "/publiczne";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // 2. Auto-detekcja jezyka na publicznych stronach jesli brak jawnego ?lang.
    //    Kolejnosc: cookie (poprzedni wybor) > Accept-Language > brak (bez redir).
    if (pathname.startsWith("/publiczne") && !url.searchParams.has("lang")) {
      const cookieLang = request.cookies.get(COOKIE_NAME)?.value;
      const fromCookie =
        cookieLang && PUBLIC_LANG_SET.has(cookieLang) ? (cookieLang as PublicLang) : null;
      const fromHeader = fromCookie
        ? null
        : detectLangFromHeader(request.headers.get("accept-language"));
      const chosen = fromCookie ?? fromHeader;
      if (chosen) {
        url.searchParams.set("lang", chosen);
        return NextResponse.redirect(url);
      }
      // Zaden nie dopasowany — puszczamy dalej, default (PL) obsluza page.
    }

    // 3. Jesli w URL jest jawny ?lang=XX (uzytkownik wybral), zapisz do cookie.
    const explicitLang = url.searchParams.get("lang");
    if (explicitLang && PUBLIC_LANG_SET.has(explicitLang.toUpperCase())) {
      const response = NextResponse.next();
      response.cookies.set(COOKIE_NAME, explicitLang.toUpperCase(), {
        sameSite: "lax",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });
      return response;
    }

    return NextResponse.next();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (auth as any)(request, ev);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
