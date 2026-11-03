import { describe, expect, it } from "vitest";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import type { ScrapedPromo } from "@/domain/promos/scraped";
import { planNoSweatBackfill, type AuditRow } from "./noSweatAudit";

const LONDON_TEXT =
  "MAX REWARD: $10\n2. Opt-In and receive a No Sweat Token for the London HOU Texans vs JAX Jaguars game on 10/18\n5. If your qualifying bet loses, receive your stake back in the form of a Bonus Bet";

function parsedFor(over: Partial<ScrapedPromo> = {}): ScrapedPromo {
  return {
    bookKey: "draftkings",
    externalId: "94",
    promoType: "bonus_bet",
    title: "NFL London No Sweat",
    rawText: LONDON_TEXT,
    sourceUrl: "https://example.com/promo",
    sportKeyHint: "americanfootball_nfl",
    scopeText: "HOU Texans vs JAX Jaguars",
    teamsText: ["HOU Texans", "JAX Jaguars"],
    windowStart: null,
    windowEnd: null,
    expiresAt: null,
    eligibleMarketTypes: ["moneyline", "spread", "total"],
    pinned: null,
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: "10.00",
    maxStake: null,
    maxWinnings: null,
    minOddsAmerican: null,
    unparsedCapFields: [],
    claimRequired: "opt_in",
    finePrintNote: null,
    ...over,
  };
}

function row(over: Partial<AuditRow> = {}, parsedOver: Partial<ScrapedPromo> = {}): AuditRow {
  const parsed = parsedFor(parsedOver);
  return {
    id: 94,
    bookKey: parsed.bookKey,
    promoType: parsed.promoType,
    status: "pending_review",
    addedByUserId: null,
    title: parsed.title,
    rawText: parsed.rawText,
    bonusAmount: parsed.bonusAmount,
    dedupeKey: promoDedupeKey(parsed),
    parsed,
    ...over,
  };
}

describe("planNoSweatBackfill", () => {
  it("retypes a mis-typed London no-sweat bonus bet", () => {
    const [a] = planNoSweatBackfill([row()]);
    expect(a.kind).toBe("retype");
    if (a.kind !== "retype") return;
    expect(a.refundCap).toBe("10.00");
    expect(a.newParsed.promoType).toBe("no_sweat");
    expect(a.newDedupeKey).not.toBe(row().dedupeKey);
  });

  it("expires the old row when the re-typed key already exists live", () => {
    const [plan] = planNoSweatBackfill([row()]);
    if (plan.kind !== "retype") throw new Error("expected retype");
    const existing = row({ id: 200, promoType: "no_sweat", status: "active", dedupeKey: plan.newDedupeKey });
    const actions = planNoSweatBackfill([row(), existing]);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ kind: "expire_duplicate", id: 94, duplicateOfDedupeKey: plan.newDedupeKey });
  });

  it("sends cash refunds to review", () => {
    const text = "No Sweat. If your qualifying bet loses, get your stake back in cash. MAX REWARD: $10";
    const [a] = planNoSweatBackfill([row({ rawText: text }, { rawText: text })]);
    expect(a).toMatchObject({ kind: "to_review", reason: "cash_refund" });
  });

  it("sends a cap mismatch or missing cap to review", () => {
    const [mismatch] = planNoSweatBackfill([row({ bonusAmount: "25.00" })]);
    expect(mismatch).toMatchObject({ kind: "to_review", reason: "cap_unclear" });
    const text = "No Sweat. If your qualifying bet loses, receive your stake back as a Bonus Bet";
    const [nocap] = planNoSweatBackfill([row({ rawText: text }, { rawText: text })]);
    expect(nocap).toMatchObject({ kind: "to_review", reason: "cap_unclear" });
  });

  it("only lists hand-added rows", () => {
    const [a] = planNoSweatBackfill([row({ addedByUserId: 3 })]);
    expect(a).toEqual({ kind: "list_only", id: 94, title: "NFL London No Sweat" });
  });

  it("ignores parlays, ordinary promos, no_sweat rows and non-live rows", () => {
    const parlay = "No Sweat Parlay. Build a parlay of 3+ legs. If your parlay loses, receive your stake back as a Bonus Bet. MAX REWARD: $10";
    const ordinary = "Bet $10 and get $50 in Bonus Bets";
    expect(
      planNoSweatBackfill([
        row({ id: 1, title: "Parlay No Sweat", rawText: parlay }),
        row({ id: 2, title: "Bet $10 Get $50", rawText: ordinary }),
        row({ id: 3, promoType: "no_sweat" }),
        row({ id: 4, status: "expired" }),
        row({ id: 5, status: "dismissed" }),
      ]),
    ).toEqual([]);
  });
});
