import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function proxy(request: NextRequest, ev: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (auth as any)(request, ev);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
