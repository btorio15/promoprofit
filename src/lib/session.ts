import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { SESSION_COOKIE_NAME } from "./sessionCookie";

// Re-exported so callers can import the cookie name from either module.
// Value is defined once in ./sessionCookie ("promoprofit_session") so
// src/proxy.ts can share it without pulling in next/headers/iron-session.
export { SESSION_COOKIE_NAME };

/** Shape sealed into the session cookie (D-06). */
export interface SessionData {
  userId: number;
  email: string;
  displayName: string;
}

export interface SessionUser {
  userId: number;
  email: string;
  displayName: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days (D-06)
const MIN_SESSION_SECRET_LENGTH = 32;

/**
 * Lazily builds sessionOptions so `next build`/Vitest never need
 * SESSION_SECRET at import time -- only when a session is actually read or
 * written (mirrors src/db/client.ts's getDb() lazy-throw pattern). Throws
 * loudly rather than sealing a cookie with a weak/missing secret (T-02-05,
 * T-02-07).
 */
function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error("SESSION_SECRET is not set");
  }

  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

async function getIronSessionInstance(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

/** The signed-in user, or null when no valid session exists (D-06). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getIronSessionInstance();
  if (session.userId === undefined || session.email === undefined || session.displayName === undefined) {
    return null;
  }
  return { userId: session.userId, email: session.email, displayName: session.displayName };
}

/**
 * The signed-in user, redirecting to /login when absent (D-20). Every
 * protected Server Component page calls this first.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Seals the given user into the session cookie (D-06). */
export async function startSession(user: SessionUser): Promise<void> {
  const session = await getIronSessionInstance();
  session.userId = user.userId;
  session.email = user.email;
  session.displayName = user.displayName;
  await session.save();
}

/** Clears the session cookie (logout). */
export async function endSession(): Promise<void> {
  const session = await getIronSessionInstance();
  session.destroy();
}
