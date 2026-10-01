import { describe, expect, it } from "vitest";
import { ACTION_FAILED_MESSAGE } from "@/lib/safeAction";
import { resolveSaveBooksOutcome } from "./saveBooksOutcome";

describe("resolveSaveBooksOutcome", () => {
  it("maps a thrown action to the retry message in both contexts", () => {
    for (const context of ["settings", "onboarding"] as const) {
      expect(resolveSaveBooksOutcome({ ok: false }, context)).toEqual({
        kind: "error",
        message: ACTION_FAILED_MESSAGE,
      });
    }
  });

  it("rewords the min-one-book message per context", () => {
    const call = {
      ok: true as const,
      value: { status: "invalid" as const, fieldErrors: { bookKeys: ["Select at least one book."] } },
    };
    expect(resolveSaveBooksOutcome(call, "settings")).toEqual({
      kind: "error",
      message: "Select at least one book to save.",
    });
    expect(resolveSaveBooksOutcome(call, "onboarding")).toEqual({
      kind: "error",
      message: "Select at least one book to continue.",
    });
  });

  it("passes through other server messages", () => {
    const call = {
      ok: true as const,
      value: { status: "invalid" as const, fieldErrors: { bookKeys: ["Some other message"] } },
    };
    expect(resolveSaveBooksOutcome(call, "settings")).toEqual({
      kind: "error",
      message: "Some other message",
    });
    expect(resolveSaveBooksOutcome(call, "onboarding")).toEqual({
      kind: "error",
      message: "Some other message",
    });
  });

  it("falls back when there are no bookKeys messages", () => {
    const call = { ok: true as const, value: { status: "invalid" as const, fieldErrors: {} } };
    expect(resolveSaveBooksOutcome(call, "settings")).toEqual({
      kind: "error",
      message: "Select at least one book to save.",
    });
    expect(resolveSaveBooksOutcome(call, "onboarding")).toEqual({
      kind: "error",
      message: "Select at least one book to continue.",
    });
  });

  it("returns saved keys on success", () => {
    expect(
      resolveSaveBooksOutcome({ ok: true, value: { status: "ok", bookKeys: ["a", "b"] } }, "settings"),
    ).toEqual({ kind: "saved", bookKeys: ["a", "b"] });
  });
});
