import { describe, expect, it } from "vitest";
import { AddPromoInputSchema } from "./addedPromoInput";
import {
  DEFAULT_EXPIRY_TIME,
  EMPTY_BONUS_DRAFT,
  bonusPayloadFromDraft,
  emptyBonusDraft,
  expiryDayOptions,
  expiryTimeOptions,
  parseOddsText,
  parsePinValue,
  payloadFromDraft,
  switchPromoType,
  type AddPromoDraft,
} from "./addPromoDraft";

const NOW = new Date("2026-10-04T15:00:00Z"); // Sun, Oct 4 in ET

const complete: AddPromoDraft = {
  ...EMPTY_BONUS_DRAFT,
  bookKey: "draftkings",
  bonusAmount: "50",
  expiresEtDate: "2026-10-11",
};

describe("expiryDayOptions", () => {
  it("returns 30 days starting today in ET with day labels", () => {
    const days = expiryDayOptions(NOW);
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ etDate: "2026-10-04", label: "Sun, Oct 4" });
    expect(days[29].etDate).toBe("2026-11-02");
  });

  it("uses the ET date, not the UTC date, late in the evening", () => {
    const days = expiryDayOptions(new Date("2026-10-05T02:00:00Z")); // still Oct 4 in ET
    expect(days[0].etDate).toBe("2026-10-04");
  });

  it("crosses the fall-back DST boundary without skipping or repeating a day", () => {
    const days = expiryDayOptions(new Date("2026-10-30T15:00:00Z")).map((d) => d.etDate);
    expect(new Set(days).size).toBe(30);
    expect(days).toContain("2026-11-01");
    expect(days).toContain("2026-11-02");
  });
});

describe("expiryTimeOptions", () => {
  it("includes 11:59 PM as the default", () => {
    expect(expiryTimeOptions()).toContainEqual({ value: "23:59", label: "11:59 PM" });
    expect(DEFAULT_EXPIRY_TIME).toBe("23:59");
  });
  it("has half-hour steps with 12-hour labels", () => {
    const opts = expiryTimeOptions();
    expect(opts[0]).toEqual({ value: "00:00", label: "12:00 AM" });
    expect(opts).toContainEqual({ value: "12:30", label: "12:30 PM" });
  });
});

describe("emptyBonusDraft", () => {
  it("defaults expiry to 7 days out at end of day", () => {
    const draft = emptyBonusDraft(NOW);
    expect(draft.expiresEtDate).toBe("2026-10-11");
    expect(draft.expiresEtTime).toBe("23:59");
  });
});

describe("parseOddsText", () => {
  it("parses signed and unsigned integers", () => {
    expect(parseOddsText("+250")).toBe(250);
    expect(parseOddsText("-110")).toBe(-110);
    expect(parseOddsText(" 150 ")).toBe(150);
  });
  it("rejects junk", () => {
    expect(parseOddsText("abc")).toBeNull();
    expect(parseOddsText("2.5")).toBeNull();
    expect(parseOddsText("")).toBeNull();
  });
});

describe("bonusPayloadFromDraft", () => {
  it("flags an empty amount", () => {
    const r = bonusPayloadFromDraft({ ...complete, bonusAmount: "" });
    if (!("fieldErrors" in r)) throw new Error("expected errors");
    expect(r.fieldErrors.bonusAmount).toEqual(["Enter the bonus amount."]);
  });

  it("flags a missing book", () => {
    const r = bonusPayloadFromDraft({ ...complete, bookKey: null });
    if (!("fieldErrors" in r)) throw new Error("expected errors");
    expect(r.fieldErrors.bookKey).toEqual(["Pick a sportsbook."]);
  });

  it("parses min odds and rejects bad text", () => {
    const ok = bonusPayloadFromDraft({ ...complete, minOdds: "+250" });
    if (!("payload" in ok)) throw new Error("expected payload");
    expect(ok.payload.minOddsAmerican).toBe(250);
    const bad = bonusPayloadFromDraft({ ...complete, minOdds: "abc" });
    if (!("fieldErrors" in bad)) throw new Error("expected errors");
    expect(bad.fieldErrors.minOddsAmerican).toEqual(["Enter odds like +250 or -110."]);
  });

  it("sends scope null for an untouched scope and an event scope for a game", () => {
    const none = bonusPayloadFromDraft(complete);
    if (!("payload" in none)) throw new Error("expected payload");
    expect(none.payload.scope).toBeNull();
    const game = bonusPayloadFromDraft({
      ...complete,
      scope: { ...complete.scope, mode: "game", eventId: "evt1" },
    });
    if (!("payload" in game)) throw new Error("expected payload");
    expect(game.payload.scope).toEqual({ kind: "event", eventId: "evt1" });
  });

  it("produces a payload the server schema accepts", () => {
    const r = bonusPayloadFromDraft(complete);
    if (!("payload" in r)) throw new Error("expected payload");
    expect(AddPromoInputSchema.safeParse(r.payload).success).toBe(true);
  });

  it("surfaces server-schema messages for a bad amount", () => {
    const r = bonusPayloadFromDraft({ ...complete, bonusAmount: "-5" });
    if (!("fieldErrors" in r)) throw new Error("expected errors");
    expect(r.fieldErrors.bonusAmount).toEqual(["Enter a number greater than 0."]);
  });
});

const dayScope = {
  mode: "league" as const,
  eventId: null,
  sportKey: "americanfootball_nfl",
  fromEtDate: "2026-10-11",
  throughEtDate: null,
};
const gameScope = { ...EMPTY_BONUS_DRAFT.scope, mode: "game" as const, eventId: "evt-1" };

const completeBoost: AddPromoDraft = {
  ...EMPTY_BONUS_DRAFT,
  promoType: "profit_boost",
  bookKey: "draftkings",
  boostPercent: "50",
  maxStake: "25",
  scope: dayScope,
};

function errorsOf(draft: AddPromoDraft) {
  const r = payloadFromDraft(draft);
  if (!("fieldErrors" in r)) throw new Error("expected errors");
  return r.fieldErrors;
}

describe("switchPromoType", () => {
  it("bonus -> boost keeps book, scope and min odds and drops the bonus amount", () => {
    const draft: AddPromoDraft = { ...complete, scope: dayScope, minOdds: "-200" };
    const next = switchPromoType(draft, "profit_boost");
    expect(next.promoType).toBe("profit_boost");
    expect(next.bookKey).toBe("draftkings");
    expect(next.scope).toEqual(dayScope);
    expect(next.minOdds).toBe("-200");
    expect(next.bonusAmount).toBe("");
  });
});

describe("boostPayloadFromDraft", () => {
  it("reports every required field when empty", () => {
    const errors = errorsOf({ ...EMPTY_BONUS_DRAFT, promoType: "profit_boost", bookKey: "draftkings" });
    expect(errors.boostPercent).toEqual(["Enter a boost % or boosted odds."]);
    expect(errors.maxStake).toEqual(["Enter the max stake. Boosts can't be used without one."]);
    expect(errors.scope).toEqual(["Pick a game or a league and days."]);
  });

  it("odds mode: empty odds message, and a game without a pin asks for the exact bet", () => {
    expect(errorsOf({ ...completeBoost, boostMode: "odds" }).boostedOddsAmerican).toEqual([
      "Enter the boosted odds, like +250.",
    ]);
    expect(errorsOf({ ...completeBoost, boostMode: "odds", boostedOdds: "+250", scope: gameScope }).pinned).toEqual([
      "Pick the exact bet this price is for.",
    ]);
  });

  it("parses pin values, with ml meaning a null line", () => {
    expect(parsePinValue("spread|-3.5|home")).toEqual({ marketType: "spread", line: -3.5, side: "home" });
    expect(parsePinValue("moneyline|ml|away")).toEqual({ marketType: "moneyline", line: null, side: "away" });
    expect(parsePinValue("total|47.5|over")).toEqual({ marketType: "total", line: 47.5, side: "over" });
    expect(parsePinValue("best")).toBeNull();
    expect(parsePinValue("spread|-3|home")).toBeNull();
    expect(parsePinValue("spread|ml|home")).toBeNull();
  });

  it("puts the pin in the payload's event scope", () => {
    const r = payloadFromDraft({ ...completeBoost, scope: gameScope, pinValue: "spread|-3.5|home" });
    if (!("payload" in r) || r.payload.promoType !== "profit_boost") throw new Error("expected boost payload");
    expect(r.payload.scope).toEqual({
      kind: "event",
      eventId: "evt-1",
      pinned: { marketType: "spread", line: -3.5, side: "home" },
    });
  });

  it("moneyline pin has a null line", () => {
    const r = payloadFromDraft({
      ...completeBoost,
      boostMode: "odds",
      boostedOdds: "+250",
      scope: gameScope,
      pinValue: "moneyline|ml|away",
    });
    if (!("payload" in r) || r.payload.promoType !== "profit_boost") throw new Error("expected boost payload");
    expect(r.payload.scope).toMatchObject({ pinned: { marketType: "moneyline", line: null, side: "away" } });
  });

  it("default expiry sends no expires; a chosen one is sent", () => {
    const none = payloadFromDraft(completeBoost);
    if (!("payload" in none) || none.payload.promoType !== "profit_boost") throw new Error("expected payload");
    expect("expires" in none.payload && none.payload.expires !== undefined).toBe(false);
    const chosen = payloadFromDraft({ ...completeBoost, boostExpiresEtDate: "2026-10-12" });
    if (!("payload" in chosen) || chosen.payload.promoType !== "profit_boost") throw new Error("expected payload");
    expect(chosen.payload.expires).toEqual({ etDate: "2026-10-12", etTime: "23:59" });
  });

  it("a complete boost draft is accepted by the server schema, including a cap", () => {
    const r = payloadFromDraft({ ...completeBoost, maxWinnings: "100", maxWinningsKind: "boost_extra" });
    if (!("payload" in r)) throw new Error("expected payload");
    expect(AddPromoInputSchema.safeParse(r.payload).success).toBe(true);
  });
});
