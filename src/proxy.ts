import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// Subdomena welcome.acro4f.com serwuje TYLKO publiczny reader instrukcji.
// Kazda inna sciezka (login, produkty, api) → redirect na liste instrukcji.
const WELCOME_HOST = "welcome.acro4f.com";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function proxy(request: NextRequest, ev: any) {
  const host = (request.headers.get("host") ?? "").toLowerCase();

  if (host === WELCOME_HOST) {
    const { pathname } = request.nextUrl;
    // Dozwolone bez auth: strony readera, statyki Next, uploads (obrazy).
    const isAllowed =
      pathname.startsWith("/publiczne") ||
      pathname.startsWith("/uploads") ||
      pathname.startsWith("/_next") ||
      pathname === "/favicon.ico";
    if (!isAllowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/publiczne/instrukcje";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (auth as any)(request, ev);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
