import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./withTimeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves with the value when fast", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("propagates the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });

  it("rejects when the promise hangs", async () => {
    vi.useFakeTimers();
    const r = expect(withTimeout(new Promise(() => {}), 30_000, "status check")).rejects.toThrow(
      "status check timed out after 30000ms",
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await r;
  });
});
