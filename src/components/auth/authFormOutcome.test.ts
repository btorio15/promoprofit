import { describe, expect, it } from "vitest";
import { ACTION_FAILED_MESSAGE } from "@/lib/safeAction";
import {
  resolveInviteOutcome,
  resolveLoginOutcome,
  resolveLogoutOutcome,
} from "./authFormOutcome";

describe("resolveLoginOutcome", () => {
  it("maps a thrown action to the retry message", () => {
    expect(resolveLoginOutcome({ ok: false })).toEqual({
      kind: "root-error",
      message: ACTION_FAILED_MESSAGE,
    });
  });

  it("keeps the generic credentials message", () => {
    expect(
      resolveLoginOutcome({ ok: true, value: { status: "invalid_credentials" } }),
    ).toEqual({ kind: "root-error", message: "Incorrect email or password." });
  });

  it("keeps the locked message", () => {
    expect(resolveLoginOutcome({ ok: true, value: { status: "locked" } })).toEqual({
      kind: "root-error",
      message: "Too many attempts — try again in a few minutes.",
    });
  });

  it("passes field errors through", () => {
    expect(
      resolveLoginOutcome({
        ok: true,
        value: { status: "invalid", fieldErrors: { email: ["Bad"] } },
      }),
    ).toEqual({ kind: "field-errors", fieldErrors: { email: ["Bad"] } });
  });
});

describe("resolveInviteOutcome", () => {
  it("maps a thrown action to the retry message", () => {
    expect(resolveInviteOutcome({ ok: false })).toEqual({
      kind: "root-error",
      message: ACTION_FAILED_MESSAGE,
    });
  });

  it("keeps the expired-link message", () => {
    expect(resolveInviteOutcome({ ok: true, value: { status: "invite_invalid" } })).toEqual({
      kind: "root-error",
      message:
        "This link has already been used or has expired. Ask the person who invited you for a new one.",
    });
  });

  it("passes field errors through", () => {
    expect(
      resolveInviteOutcome({
        ok: true,
        value: { status: "invalid", fieldErrors: { password: ["Short"] } },
      }),
    ).toEqual({ kind: "field-errors", fieldErrors: { password: ["Short"] } });
  });
});

describe("resolveLogoutOutcome", () => {
  it("returns the retry message on failure", () => {
    expect(resolveLogoutOutcome({ ok: false })).toBe(ACTION_FAILED_MESSAGE);
  });

  it("returns null on success", () => {
    expect(resolveLogoutOutcome({ ok: true, value: undefined })).toBeNull();
  });
});
