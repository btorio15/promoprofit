import { describe, expect, it, vi } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

vi.mock("@/db/client", () => ({ getDb: vi.fn() }));

import { activePromoForFlagWhere, flagUpdateWhere, mapPendingPromoRow } from "./promoReview";
import { promos } from "./schema";
import { NO_SWEAT_CASH_MARKER } from "@/domain/promos/scraped";

const db = drizzle({ client: neon("postgresql://u:p@db.invalid/x"), schema });

describe("activePromoForFlagWhere (WR-05)", () => {
  it("scopes the flag lookup to promos visible to the viewer", () => {
    const { sql, params } = db.select({ id: promos.id }).from(promos).where(activePromoForFlagWhere(5, 7)).toSQL();
    expect(sql).toContain('"id" = $');
    expect(sql).toContain('"status" = $');
    // Scraped/group promos (no owner) or the viewer's own added promos only.
    expect(sql).toContain('"added_by_user_id" is null');
    expect(sql).toContain('"added_by_user_id" = $');
    expect(params).toEqual(expect.arrayContaining([5, "active", 7]));
  });
});

describe("flagUpdateWhere (quick-261002-dqn)", () => {
  it("gates the flag UPDATE on active + scraped, with no auto_matched requirement", () => {
    const { sql, params } = db
      .update(promos)
      .set({ status: "pending_review" })
      .where(flagUpdateWhere(5))
      .toSQL();
    expect(sql).toContain('"id" = $');
    expect(sql).toContain('"status" = $');
    expect(sql).toContain('"added_by_user_id" is null');
    expect(sql).not.toContain('"auto_matched"');
    expect(params).toEqual(expect.arrayContaining([5, "active"]));
  });
});

describe("mapPendingPromoRow readings and cashRefund (D-15, D-17)", () => {
  const parsed = {
    bookKey: "fanduel",
    externalId: null,
    promoType: "bonus_bet",
    title: "No sweat",
    rawText: "text",
    sourceUrl: "https://example.com",
    sportKeyHint: null,
    scopeText: "x",
    teamsText: [],
    windowStart: null,
    windowEnd: null,
    expiresAt: null,
    eligibleMarketTypes: ["moneyline"],
    pinned: null,
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: null,
    maxWinnings: null,
    winningsCapKind: null,
    minOddsAmerican: null,
    unparsedCapFields: [],
    claimRequired: null,
    finePrintNote: null,
  };
  const readings = {
    scraper: { promoType: "bonus_bet", amount: "25.00", minOddsAmerican: -200 },
    reader: { kind: "no_sweat", amount: "25.00", minOddsAmerican: -200, confidence: "medium", refundForm: "cash" },
  };
  const row = (over: Record<string, unknown>) => ({
    id: 1,
    bookKey: "fanduel",
    promoType: "bonus_bet",
    reviewReason: "classify",
    parsed,
    bestGuess: null,
    flaggedByUserId: null,
    scopeKind: null,
    eventId: null,
    sportKey: null,
    homeTeam: null,
    awayTeam: null,
    eventCommenceTime: null,
    windowStart: null,
    windowEnd: null,
    scopeGames: null,
    maxStake: null,
    maxWinnings: null,
    maxWinningsKind: null,
    minOddsAmerican: null,
    bonusAmount: null,
    unparsedCapFields: [],
    ...over,
  });

  it("exposes labelled readings and the cash flag", () => {
    const item = mapPendingPromoRow(row({ parsed: { ...parsed, reviewReadings: readings } }) as never);
    expect(item?.readings?.scraper.label).toBe("Bonus bet");
    expect(item?.readings?.reader.label).toBe("No-sweat");
    expect(item?.readings?.reader.refundForm).toBe("cash");
    expect(item?.cashRefund).toBe(true);
  });

  it("labels a not_usable reader and flags a no_sweat_cash skip from the summary line", () => {
    const r = { ...readings, reader: { ...readings.reader, kind: "not_usable", refundForm: null } };
    const item = mapPendingPromoRow(
      row({ parsed: { ...parsed, rawText: "[Promo reader check: no_sweat_cash] x", reviewReadings: r } }) as never,
    );
    expect(item?.readings?.reader.label).toBe("Not usable");
    expect(item?.cashRefund).toBe(true);
  });

  it("flags a reader-less no_sweat_cash classify draft from the cash marker (WR-02)", () => {
    const item = mapPendingPromoRow(
      row({ promoType: "no_sweat", parsed: { ...parsed, rawText: `${NO_SWEAT_CASH_MARKER}\nstake back in cash` } }) as never,
    );
    expect(item?.readings).toBeNull();
    expect(item?.cashRefund).toBe(true);
  });

  it("has null readings and no cash flag without reviewReadings; no_sweat items stay no_sweat", () => {
    const item = mapPendingPromoRow(row({ promoType: "no_sweat" }) as never);
    expect(item?.readings).toBeNull();
    expect(item?.cashRefund).toBe(false);
    expect(item?.promoType).toBe("no_sweat");
  });
});
