import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe konfiguracja Auth.js — bez Prisma i bcrypt.
 * Używana w middleware (Edge runtime).
 * Pełna logika z DB jest w ./auth.ts
 */
export const authConfig = {
  // Vercel / lokalny `npm start` puszcza request bez `trustHost`, Auth.js wtedy
  // odrzuca każdy host (UntrustedHost). Włączamy ufanie hostowi z requestu
  // (równoważne env `AUTH_TRUST_HOST=true`). Bezpieczne za reverse-proxy/Vercel.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [], // realne providery w auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublic =
        nextUrl.pathname === "/login" ||
        nextUrl.pathname === "/rejestracja" ||
        nextUrl.pathname.startsWith("/api/auth");

      if (isPublic) return true;
      if (!isLoggedIn) return false;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          role?: string;
          companyId?: string | null;
          id: string;
        };
        token.role = u.role;
        token.id = u.id;
        token.companyId = u.companyId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const t = token as { id?: string; role?: string; companyId?: string | null };
        const su = session.user as {
          id?: string;
          role?: string;
          companyId?: string | null;
        };
        su.id = t.id ?? "";
        su.role = t.role;
        su.companyId = t.companyId ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
