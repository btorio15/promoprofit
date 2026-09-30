import { afterEach, describe, expect, it, vi } from "vitest";
import { safeAction } from "./safeAction";

afterEach(() => vi.restoreAllMocks());

describe("safeAction", () => {
  it("wraps a resolved value", async () => {
    await expect(safeAction(() => Promise.resolve(5), "x")).resolves.toEqual({ ok: true, value: 5 });
  });

  it("swallows a rejection, logging once with the label", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      safeAction(() => Promise.reject(new Error("fetch failed")), "myLabel"),
    ).resolves.toEqual({ ok: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("myLabel");
  });

  it("rethrows Next redirect / not-found control-flow errors", async () => {
    for (const digest of ["NEXT_REDIRECT;replace;/login;307;", "NEXT_HTTP_ERROR_FALLBACK;404"]) {
      const err = Object.assign(new Error("ctl"), { digest });
      await expect(safeAction(() => Promise.reject(err), "x")).rejects.toBe(err);
    }
  });
});
