"use server";

import { redirect } from "next/navigation";
import { InviteRedemptionInputSchema } from "@/domain/auth/authInput";
import { hashInviteToken } from "@/lib/auth/inviteToken";
import { hashPassword } from "@/lib/auth/password";
import { redeemInviteAndCreateUser } from "@/lib/auth/accounts";
import { startSession } from "@/lib/session";

export type RedeemInviteResponse =
  | { status: "invalid"; fieldErrors: Partial<Record<"displayName" | "email" | "password", string[]>> }
  | { status: "invite_invalid" };

/**
 * Redeems an invite and creates the account (D-01, D-04). This is the ONLY
 * caller of redeemInviteAndCreateUser -- there is no other signup path in
 * the app. On success, seals a session and redirects to /onboarding/books
 * (D-08) outside any try/catch (redirect() throws NEXT_REDIRECT).
 */
export async function redeemInvite(input: unknown): Promise<RedeemInviteResponse> {
  const parsed = InviteRedemptionInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<"displayName" | "email" | "password", string[]>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "displayName" || key === "email" || key === "password") {
        (fieldErrors[key] ??= []).push(issue.message);
      }
    }
    return { status: "invalid", fieldErrors };
  }

  const { token, email, displayName, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  const result = await redeemInviteAndCreateUser({
    tokenHash: hashInviteToken(token),
    email,
    displayName,
    passwordHash,
    now: new Date(),
  });

  if (result.status === "invite_invalid") {
    return { status: "invite_invalid" };
  }

  if (result.status === "email_taken") {
    return {
      status: "invalid",
      fieldErrors: { email: ["An account with this email already exists."] },
    };
  }

  await startSession({
    userId: result.user.id,
    email: result.user.email,
    displayName: result.user.displayName,
  });

  redirect("/onboarding/books");
}
