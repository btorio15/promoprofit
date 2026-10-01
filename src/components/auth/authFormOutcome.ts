import { ACTION_FAILED_MESSAGE, type SafeActionResult } from "@/lib/safeAction";
import type { LoginResponse } from "@/app/actions/login";
import type { RedeemInviteResponse } from "@/app/actions/redeem-invite";

export const INCORRECT_CREDENTIALS_MESSAGE = "Incorrect email or password.";
export const LOCKED_MESSAGE = "Too many attempts — try again in a few minutes.";
export const INVITE_INVALID_MESSAGE =
  "This link has already been used or has expired. Ask the person who invited you for a new one.";

export type AuthFormOutcome =
  | { kind: "root-error"; message: string }
  | { kind: "field-errors"; fieldErrors: Record<string, string[] | undefined> };

/** Pure mapping of a safeAction(login) result to the login form's next UI state. */
export function resolveLoginOutcome(call: SafeActionResult<LoginResponse>): AuthFormOutcome {
  if (!call.ok) return { kind: "root-error", message: ACTION_FAILED_MESSAGE };
  const result = call.value;
  if (result.status === "invalid_credentials") {
    return { kind: "root-error", message: INCORRECT_CREDENTIALS_MESSAGE };
  }
  if (result.status === "locked") {
    return { kind: "root-error", message: LOCKED_MESSAGE };
  }
  return { kind: "field-errors", fieldErrors: result.fieldErrors };
}

/** Pure mapping of a safeAction(redeemInvite) result to the invite form's next UI state. */
export function resolveInviteOutcome(call: SafeActionResult<RedeemInviteResponse>): AuthFormOutcome {
  if (!call.ok) return { kind: "root-error", message: ACTION_FAILED_MESSAGE };
  const result = call.value;
  if (result.status === "invite_invalid") {
    return { kind: "root-error", message: INVITE_INVALID_MESSAGE };
  }
  return { kind: "field-errors", fieldErrors: result.fieldErrors };
}

/** Logout success is a thrown redirect, so only a failure yields a message. */
export function resolveLogoutOutcome(call: SafeActionResult<void>): string | null {
  return call.ok ? null : ACTION_FAILED_MESSAGE;
}
