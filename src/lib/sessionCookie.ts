/**
 * Dependency-free session cookie name (D-06). Split out of session.ts so
 * src/proxy.ts (Next.js 16 network boundary, a future plan) can import just
 * this constant without pulling in next/headers or iron-session, which
 * proxy.ts's Edge-adjacent runtime constraints make undesirable.
 */
export const SESSION_COOKIE_NAME = "promoprofit_session";
