import { describe, expect, it } from "vitest";
import { SaveBooksInputSchema } from "./bookSelection";

function messages(bookKeys: string[]): string[] {
  const r = SaveBooksInputSchema.safeParse({ bookKeys });
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("SaveBooksInputSchema (Phase 12)", () => {
  it("accepts a sportsbook plus a market", () => {
    const r = SaveBooksInputSchema.safeParse({ bookKeys: ["draftkings", "kalshi"] });
    expect(r.success).toBe(true);
  });

  it("rejects a market-only selection", () => {
    expect(messages(["kalshi"])).toContain("Select at least one sportsbook.");
  });

  it("rejects the global polymarket key", () => {
    expect(messages(["draftkings", "polymarket"])).toContain("Choose only books from the list.");
  });

  it("rejects an empty selection", () => {
    expect(messages([])).toContain("Select at least one book.");
  });
});
