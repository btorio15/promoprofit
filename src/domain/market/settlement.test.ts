import { describe, expect, it } from "vitest";
import { SPORTS } from "@/config/sports";
import { settlementNoteFor } from "./settlement";

const KALSHI_POST =
  "If the game is postponed more than 48 hours, the book may void your bet but Kalshi settles the contract at a price it sets. You could get back less than you paid for the contract.";
const POLY_POST =
  "If the game is postponed, the book may void your bet while the contract stays open. You could lose the contract cost.";

describe("settlementNoteFor", () => {
  it("NFL kalshi", () => {
    expect(settlementNoteFor("americanfootball_nfl", "kalshi")).toBe(
      `If the game ends in a tie, the book refunds your bet but this Kalshi contract pays 50¢. ${KALSHI_POST}`,
    );
  });
  it("NFL polymarket", () => {
    expect(settlementNoteFor("americanfootball_nfl", "polymarket_us")).toBe(
      `If the game ends in a tie, the book refunds your bet but this Polymarket contract settles by that market's own rules. ${POLY_POST}`,
    );
  });
  const others = SPORTS.filter((s) => s.key !== "americanfootball_nfl").map((s) => s.key);
  it.each(others)("%s postponement only", (key) => {
    expect(settlementNoteFor(key, "kalshi")).toBe(KALSHI_POST);
    expect(settlementNoteFor(key, "polymarket_us")).toBe(POLY_POST);
  });
  const all = SPORTS.flatMap((s) =>
    (["kalshi", "polymarket_us"] as const).map((v) => [s.key, v] as const),
  );
  it.each(all)("%s x %s non-empty", (key, venue) => {
    expect(settlementNoteFor(key, venue).length).toBeGreaterThan(0);
  });
});
