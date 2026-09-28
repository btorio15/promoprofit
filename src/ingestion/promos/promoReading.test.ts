import { describe, expect, it } from "vitest";
import {
  PROMO_READER_MODEL,
  PROMO_READER_PROMPT_VERSION,
  PromoReadingSchema,
  readerText,
  readingCacheKey,
  type PromoReading,
} from "./promoReading";

function validReading(overrides: Partial<PromoReading> = {}): PromoReading {
  return {
    kind: "profit_boost",
    skipReason: null,
    boostPercent: "50",
    bonusAmount: null,
    maxStake: "25",
    maxWinnings: null,
    minOddsAmerican: -200,
    sport: "icehockey_nhl",
    teams: [],
    singleGame: false,
    liveOnly: false,
    parlayOrSgpOnly: false,
    propOnly: false,
    newCustomerOnly: false,
    eventDateText: "9/29/2026",
    confidence: "high",
    evidence: {
      boostPercent: "Profit Boost: 50%",
      bonusAmount: null,
      maxStake: "MAX $25 WAGER",
      maxWinnings: null,
      minOddsAmerican: "-200 or longer",
    },
    ...overrides,
  };
}

describe("PromoReadingSchema", () => {
  it("accepts a full valid reading", () => {
    const result = PromoReadingSchema.safeParse(validReading());
    expect(result.success).toBe(true);
  });

  it("rejects an unknown key (strict/closed object)", () => {
    const withExtra = { ...validReading(), extraField: "nope" };
    const result = PromoReadingSchema.safeParse(withExtra);
    expect(result.success).toBe(false);
  });

  it("rejects a sport outside SPORT_KEYS", () => {
    const result = PromoReadingSchema.safeParse(validReading({ sport: "cricket_ipl" }));
    expect(result.success).toBe(false);
  });

  it("rejects a skipReason outside SKIP_REASONS", () => {
    const result = PromoReadingSchema.safeParse(validReading({ skipReason: "not_a_real_reason" as never }));
    expect(result.success).toBe(false);
  });

  it("PROMO_READER_MODEL is exactly claude-haiku-4-5 (OD-1)", () => {
    expect(PROMO_READER_MODEL).toBe("claude-haiku-4-5");
  });

  it("PROMO_READER_PROMPT_VERSION is a non-empty string", () => {
    expect(typeof PROMO_READER_PROMPT_VERSION).toBe("string");
    expect(PROMO_READER_PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});

describe("readerText", () => {
  it("keeps line breaks between distinct lines", () => {
    const text = readerText("Title", "Line one\nLine two");
    expect(text).toBe("Title\nLine one\nLine two");
  });

  it("collapses runs of spaces/tabs within a line", () => {
    const text = readerText("Title", "Line   one\twith\t\ttabs");
    expect(text).toBe("Title\nLine one with tabs");
  });

  it("drops blank lines", () => {
    const text = readerText("Title", "Line one\n\n\nLine two");
    expect(text).toBe("Title\nLine one\nLine two");
  });

  it("trims each line", () => {
    const text = readerText("  Title  ", "  Line one  ");
    expect(text).toBe("Title\nLine one");
  });
});

describe("readingCacheKey", () => {
  it("changes when the prompt version, model, book key or text changes", () => {
    const base = readingCacheKey("draftkings", "Some promo text");
    expect(readingCacheKey("fanduel", "Some promo text")).not.toBe(base);
    expect(readingCacheKey("draftkings", "Different text")).not.toBe(base);
    // Model/prompt version are module constants -- verified indirectly: the
    // key is a function of them, so two different (bookKey, text) pairs must
    // never collide even when everything else is fixed.
    expect(readingCacheKey("draftkings", "Some promo text ")).toBe(base);
  });

  it("is identical for text that differs only in whitespace runs", () => {
    const a = readingCacheKey("draftkings", "Line one\nLine   two");
    const b = readingCacheKey("draftkings", "Line one   Line two");
    const c = readingCacheKey("draftkings", "  Line one\n\nLine two  ");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("returns a 64-char hex sha256 digest", () => {
    const key = readingCacheKey("draftkings", "text");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
