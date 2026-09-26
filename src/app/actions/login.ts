"use server";

import { redirect } from "next/navigation";
import { LoginInputSchema } from "@/domain/auth/authInput";
import { clearFailedLogins, findUserByEmail, reserveLoginAttempt } from "@/lib/auth/accounts";
import { verifyAgainstDummyHash, verifyPassword } from "@/lib/auth/password";
import { startSession } from "@/lib/session";

export type LoginResponse =
  | { status: "invalid"; fieldErrors: Partial<Record<"email" | "password", string[]>> }
  | { status: "invalid_credentials" }
  | { status: "locked" };

/**
 * Login server action (D-05, T-02-09/T-02-G1, T-02-10). Never returns a
 * user's passwordHash. Unknown email and wrong password both return the
 * identical "invalid_credentials" outcome so the UI shows one generic
 * message (T-02-10) -- verifyAgainstDummyHash equalizes response timing for
 * the unknown-email path. For a known email, the attempt is reserved
 * atomically (reserveLoginAttempt) BEFORE verifyPassword ever runs (CR-01) --
 * this is not a pre-read lockedUntil check, so a locked account can never
 * reach verifyPassword even if its findUserByEmail snapshot is stale. On
 * success, redirect() runs outside any try/catch (it throws NEXT_REDIRECT).
 */
export async function login(input: unknown): Promise<LoginResponse> {
  const parsed = LoginInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"email" | "password", string[]>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "email" || key === "password") {
        (fieldErrors[key] ??= []).push(issue.message);
      }
    }
    return { status: "invalid", fieldErrors };
  }

  const { email, password } = parsed.data;
  const now = new Date();

  const user = await findUserByEmail(email);
  if (!user) {
    await verifyAgainstDummyHash(password);
    return { status: "invalid_credentials" };
  }

  const reserved = await reserveLoginAttempt(user.id, now);
  if (!reserved) {
    return { status: "locked" };
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);
  if (!passwordOk) {
    return { status: "invalid_credentials" };
  }

  await clearFailedLogins(user.id);
  await startSession({ userId: user.id, email: user.email, displayName: user.displayName });

  redirect("/");
}
