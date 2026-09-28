import { describe, expect, it } from "vitest";
import { EVIDENCE_MAX_CHARS, guardReading, READER_NUMERIC_FIELDS, type ReaderNumericField } from "./verbatimGuard";
import type { PromoReading } from "./promoReading";

type ReadingOverrides = Partial<Omit<PromoReading, "evidence">> & {
  evidence?: Partial<PromoReading["evidence"]>;
};

function baseReading(overrides: ReadingOverrides = {}): PromoReading {
  const { evidence, ...rest } = overrides;
  return {
    kind: "profit_boost",
    skipReason: null,
    boostPercent: null,
    bonusAmount: null,
    maxStake: null,
    maxWinnings: null,
    minOddsAmerican: null,
    sport: null,
    teams: [],
    singleGame: false,
    liveOnly: false,
    parlayOrSgpOnly: false,
    propOnly: false,
    newCustomerOnly: false,
    eventDateText: null,
    confidence: "high",
    evidence: {
      boostPercent: null,
      bonusAmount: null,
      maxStake: null,
      maxWinnings: null,
      minOddsAmerican: null,
      ...evidence,
    },
    ...rest,
  };
}

const NHL_TEXT =
  "NHL 50% Profit Boost\nBOOSTED UP TO MAX $25 WAGER\nProfit Boost: 50% (Profit boost only applies to winnings)\nTotal bet odds must be -200 or longer.";

describe("guardReading -- kept", () => {
  it("keeps boostPercent '50' backed by 'Profit Boost: 50%', normalized to 2dp", () => {
    const reading = baseReading({ boostPercent: "50", evidence: { boostPercent: "Profit Boost: 50%" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.boostPercent).toBe("50.00");
    expect(guarded.droppedFields).not.toContain("boostPercent");
  });

  it("keeps maxStake '25' backed by 'MAX $25 WAGER', normalized to 2dp", () => {
    const reading = baseReading({ maxStake: "25", evidence: { maxStake: "MAX $25 WAGER" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.maxStake).toBe("25.00");
    expect(guarded.droppedFields).not.toContain("maxStake");
  });

  it("keeps minOddsAmerican -200 backed by '-200 or longer'", () => {
    const reading = baseReading({ minOddsAmerican: -200, evidence: { minOddsAmerican: "-200 or longer" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.minOddsAmerican).toBe(-200);
    expect(guarded.droppedFields).not.toContain("minOddsAmerican");
  });

  it("keeps maxWinnings '1000' backed by '$1,000'", () => {
    const text = "Win up to $1,000 in bonus bets total, restrictions apply.";
    const reading = baseReading({ maxWinnings: "1000", evidence: { maxWinnings: "$1,000" } });
    const guarded = guardReading(reading, text);
    expect(guarded.maxWinnings).toBe("1000.00");
    expect(guarded.droppedFields).not.toContain("maxWinnings");
  });

  it("evidence matching is case-insensitive and whitespace-normalized", () => {
    const text = "Profit  Boost:   50%   applies today";
    const reading = baseReading({ boostPercent: "50", evidence: { boostPercent: "profit boost: 50%" } });
    const guarded = guardReading(reading, text);
    expect(guarded.boostPercent).toBe("50.00");
  });
});

describe("guardReading -- dropped, basic", () => {
  it("drops maxStake '100' when its evidence is not in the text at all", () => {
    const reading = baseReading({ maxStake: "100", evidence: { maxStake: "max $100 wager" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
  });

  it("drops maxStake '25' when the number isn't in the cited evidence", () => {
    const reading = baseReading({ maxStake: "25", evidence: { maxStake: "Profit Boost: 50%" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
  });

  it("drops minOddsAmerican -200 when the evidence has the wrong sign", () => {
    const text = "Total bet odds must be 200 or longer.";
    const reading = baseReading({ minOddsAmerican: -200, evidence: { minOddsAmerican: "200" } });
    const guarded = guardReading(reading, text);
    expect(guarded.minOddsAmerican).toBeNull();
    expect(guarded.droppedFields).toContain("minOddsAmerican");
  });

  it("drops a field with null evidence", () => {
    const reading = baseReading({ maxStake: "25", evidence: { maxStake: null } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
  });

  it("drops a malformed non-numeric value ('fifty')", () => {
    const reading = baseReading({ boostPercent: "fifty", evidence: { boostPercent: "Profit Boost: fifty%" } });
    const guarded = guardReading(reading, "Profit Boost: fifty% today");
    expect(guarded.boostPercent).toBeNull();
    expect(guarded.droppedFields).toContain("boostPercent");
  });

  it("drops a malformed value with 3 decimal digits ('1.234')", () => {
    const reading = baseReading({ maxStake: "1.234", evidence: { maxStake: "MAX $1.234 WAGER" } });
    const guarded = guardReading(reading, "MAX $1.234 WAGER today");
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
  });

  it("drops minOddsAmerican 50 (below the |v| >= 100 threshold)", () => {
    const reading = baseReading({ minOddsAmerican: 50, evidence: { minOddsAmerican: "50 or longer" } });
    const guarded = guardReading(reading, "Total bet odds must be 50 or longer.");
    expect(guarded.minOddsAmerican).toBeNull();
    expect(guarded.droppedFields).toContain("minOddsAmerican");
  });
});

describe("guardReading -- dropped, mislabel and swap (the field-binding rules)", () => {
  it("drops maxStake '50' cited against 'Profit Boost: 50%' (no $ before the token)", () => {
    const reading = baseReading({ maxStake: "50", evidence: { maxStake: "Profit Boost: 50%" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
  });

  it("drops boostPercent '25' cited against 'MAX $25 WAGER' (no % and no boost)", () => {
    const reading = baseReading({ boostPercent: "25", evidence: { boostPercent: "MAX $25 WAGER" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.boostPercent).toBeNull();
    expect(guarded.droppedFields).toContain("boostPercent");
  });

  it("drops boostPercent '100' cited against 'up to 100%' when that evidence doesn't mention boost", () => {
    const text = "30% Profit Boost applies to your bet. Max winnings up to 100% of stake.";
    const reading = baseReading({ boostPercent: "100", evidence: { boostPercent: "up to 100%" } });
    const guarded = guardReading(reading, text);
    expect(guarded.boostPercent).toBeNull();
    expect(guarded.droppedFields).toContain("boostPercent");
  });

  it("drops maxStake '200' cited against '-200 or longer' (no $)", () => {
    const reading = baseReading({ maxStake: "200", evidence: { maxStake: "-200 or longer" } });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
  });

  it("drops minOddsAmerican 25 cited against '$25' (odds must be >= 100, and can't follow $)", () => {
    const reading = baseReading({ minOddsAmerican: 25, evidence: { minOddsAmerican: "$25" } });
    const guarded = guardReading(reading, "MAX $25 WAGER applies");
    expect(guarded.minOddsAmerican).toBeNull();
    expect(guarded.droppedFields).toContain("minOddsAmerican");
  });

  it("drops minOddsAmerican -25 cited against '$25' (odds must be >= 100, and can't follow $)", () => {
    const reading = baseReading({ minOddsAmerican: -25, evidence: { minOddsAmerican: "$25" } });
    const guarded = guardReading(reading, "MAX $25 WAGER applies");
    expect(guarded.minOddsAmerican).toBeNull();
    expect(guarded.droppedFields).toContain("minOddsAmerican");
  });

  it("drops minOddsAmerican whose token is followed by '%'", () => {
    const text = "Odds boosted by -200% for this game only.";
    const reading = baseReading({ minOddsAmerican: -200, evidence: { minOddsAmerican: "-200%" } });
    const guarded = guardReading(reading, text);
    expect(guarded.minOddsAmerican).toBeNull();
    expect(guarded.droppedFields).toContain("minOddsAmerican");
  });

  it("drops bonusAmount '50' cited against '50%' (no $)", () => {
    const text = "Get a 50% profit boost bonus offer today.";
    const reading = baseReading({ bonusAmount: "50", evidence: { bonusAmount: "50%" } });
    const guarded = guardReading(reading, text);
    expect(guarded.bonusAmount).toBeNull();
    expect(guarded.droppedFields).toContain("bonusAmount");
  });
});

describe("guardReading -- dropped, same occurrence", () => {
  it("drops both maxStake and maxWinnings when they cite the same '$25' occurrence", () => {
    const text = "Bet now, MAX $25 WAGER applies to this offer.";
    const reading = baseReading({
      maxStake: "25",
      maxWinnings: "25",
      evidence: { maxStake: "$25", maxWinnings: "$25" },
    });
    const guarded = guardReading(reading, text);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.maxWinnings).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
    expect(guarded.droppedFields).toContain("maxWinnings");
  });
});

describe("guardReading -- dropped, length", () => {
  it("drops a field whose evidence is over 80 chars even with a valid '$25' inside", () => {
    const padding = "x".repeat(90);
    const text = `MAX $25 WAGER ${padding}`;
    const longEvidence = `MAX $25 WAGER ${padding}`;
    expect(longEvidence.length).toBeGreaterThan(EVIDENCE_MAX_CHARS);
    const reading = baseReading({ maxStake: "25", evidence: { maxStake: longEvidence } });
    const guarded = guardReading(reading, text);
    expect(guarded.maxStake).toBeNull();
    expect(guarded.droppedFields).toContain("maxStake");
  });
});

describe("guardReading -- structural", () => {
  it("READER_NUMERIC_FIELDS has exactly the five expected fields", () => {
    expect(READER_NUMERIC_FIELDS).toEqual(["boostPercent", "bonusAmount", "maxStake", "maxWinnings", "minOddsAmerican"]);
  });

  it("passes through non-numeric fields unchanged", () => {
    const reading = baseReading({ kind: "profit_boost", sport: "icehockey_nhl", teams: ["A", "B"], confidence: "medium" });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.kind).toBe("profit_boost");
    expect(guarded.sport).toBe("icehockey_nhl");
    expect(guarded.teams).toEqual(["A", "B"]);
    expect(guarded.confidence).toBe("medium");
  });

  it("returns an empty droppedFields array when every non-null field is guard-backed", () => {
    const reading = baseReading({
      boostPercent: "50",
      maxStake: "25",
      minOddsAmerican: -200,
      evidence: {
        boostPercent: "Profit Boost: 50%",
        maxStake: "MAX $25 WAGER",
        minOddsAmerican: "-200 or longer",
      },
    });
    const guarded = guardReading(reading, NHL_TEXT);
    expect(guarded.droppedFields).toEqual([]);
  });

  it("leaves null fields null without adding them to droppedFields", () => {
    const reading = baseReading();
    const guarded = guardReading(reading, NHL_TEXT);
    const nullFields: ReaderNumericField[] = ["boostPercent", "bonusAmount", "maxStake", "maxWinnings", "minOddsAmerican"];
    for (const field of nullFields) {
      expect(guarded[field]).toBeNull();
    }
    expect(guarded.droppedFields).toEqual([]);
  });
});
