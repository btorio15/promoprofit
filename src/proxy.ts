import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/sessionCookie";

/**
 * Next 16 network boundary (D-01, D-20, T-02-11). This is a presence-only
 * check -- defense in depth, not the authoritative gate. It can only see
 * whether the session cookie exists, not whether it's still valid
 * (expired/tampered cookies pass this check and are caught by
 * requireUser() in every protected page and server action instead).
 * Imports only @/lib/sessionCookie (a dependency-free constant module) --
 * never @/lib/session, which pulls in next/headers/iron-session and is
 * unnecessary here.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname.startsWith("/invite/")) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
