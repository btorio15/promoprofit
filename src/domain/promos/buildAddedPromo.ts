import Decimal from "decimal.js";
import type { promos } from "@/db/schema";
import { getSportLabel } from "@/config/sports";
import type { AddPromoInput } from "./addedPromoInput";
import { etDayBounds, parseEtDateTime } from "./etTime";
import { promoTitle } from "./promoRowDto";
import type { ScopeGuess } from "./scope";
import { ScrapedPromoSchema, type ScrapedPromo } from "./scraped";
import { PROMO_MARKET_TYPES } from "./types";

/**
 * Phase 5: pure builder from a validated member input + server-resolved scope
 * to the promos insert values. Kept free of db access so the row can be
 * round-trip tested against mapActivePromoRow. Money is Decimal -> toFixed(2)
 * only (never a native float).
 */

export type AddedPromoInsert = typeof promos.$inferInsert & { addedByUserId: number };

/** "2026-10-04" + "23:59" (ET wall clock) -> UTC ISO instant, or null for an impossible date/time. */
export function etExpiryInstant(etDate: string, etTime: string): string | null {
  if (etDayBounds(etDate) === null) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(etDate);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(etTime);
  if (!dateMatch || !timeMatch) return null;

  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);
  const hour24 = parseInt(timeMatch[1], 10);
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return parseEtDateTime(`${month}/${day}/${dateMatch[1]} at ${hour12}:${timeMatch[2]} ${meridiem} ET`);
}

function scopeColumns(scope: ScopeGuess | { kind: "any" }) {
  if (scope.kind === "any") {
    return {
      scopeKind: "any" as const,
      sportKey: null,
      eventId: null,
      eventCommenceTime: null,
      homeTeam: null,
      awayTeam: null,
      windowStart: null,
      windowEnd: null,
    };
  }
  if (scope.kind === "event") {
    return {
      scopeKind: "event" as const,
      sportKey: scope.sportKey,
      eventId: scope.eventId,
      eventCommenceTime: new Date(scope.commenceTime),
      homeTeam: scope.homeTeam,
      awayTeam: scope.awayTeam,
      windowStart: null,
      windowEnd: null,
    };
  }
  return {
    scopeKind: "sport_window" as const,
    sportKey: scope.sportKey,
    eventId: null,
    eventCommenceTime: null,
    homeTeam: null,
    awayTeam: null,
    windowStart: new Date(scope.windowStart),
    windowEnd: new Date(scope.windowEnd),
  };
}

export function buildAddedPromoRow(args: {
  input: AddPromoInput;
  scope: ScopeGuess | { kind: "any" };
  bookName: string;
  now: Date;
  expiresAt: Date | null;
  userId: number;
  dedupeKey: string;
}): { ok: true; values: AddedPromoInsert } | { ok: false } {
  const { input, scope, now, expiresAt, userId, dedupeKey } = args;

  const bonusAmount = new Decimal(input.bonusAmount).toFixed(2);
  const minOddsAmerican = input.minOddsAmerican ?? null;

  const title = promoTitle({
    promoType: "bonus_bet",
    boostPercent: null,
    boostedOddsAmerican: null,
    bonusAmount,
  });

  let scopeText: string;
  let teamsText: string[];
  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let sportKeyHint: string | null = null;
  if (scope.kind === "any") {
    scopeText = "Any game";
    teamsText = [];
  } else if (scope.kind === "event") {
    scopeText = `${scope.awayTeam} @ ${scope.homeTeam}`;
    teamsText = [scope.awayTeam, scope.homeTeam];
    sportKeyHint = scope.sportKey;
  } else {
    scopeText = `Any ${getSportLabel(scope.sportKey)} game`;
    teamsText = [];
    windowStart = scope.windowStart;
    windowEnd = scope.windowEnd;
    sportKeyHint = scope.sportKey;
  }

  const parsed: ScrapedPromo = {
    bookKey: input.bookKey,
    externalId: null,
    promoType: "bonus_bet",
    title,
    rawText: "",
    sourceUrl: "user-added",
    sportKeyHint,
    scopeText: scopeText.slice(0, 200),
    teamsText,
    windowStart,
    windowEnd,
    expiresAt: expiresAt !== null ? expiresAt.toISOString() : null,
    eligibleMarketTypes: [...PROMO_MARKET_TYPES],
    pinned: null,
    boostPercent: null,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount,
    maxStake: null,
    maxWinnings: null,
    minOddsAmerican,
    unparsedCapFields: [],
    claimRequired: null,
    finePrintNote: null,
  };

  // mapActivePromoRow drops rows whose parsed payload fails this schema, so an
  // unparseable added promo would silently vanish -- refuse to build it.
  const validated = ScrapedPromoSchema.safeParse(parsed);
  if (!validated.success) return { ok: false };

  return {
    ok: true,
    values: {
      bookKey: input.bookKey,
      dedupeKey,
      promoType: "bonus_bet",
      status: "active",
      autoMatched: false,
      ...scopeColumns(scope),
      marketType: null,
      line: null,
      side: null,
      parsed: validated.data,
      boostPercent: null,
      boostedOddsAmerican: null,
      baseOddsAmerican: null,
      bonusAmount,
      maxStake: null,
      maxWinnings: null,
      maxWinningsKind: null,
      minOddsAmerican,
      unparsedCapFields: [],
      finePrintNote: null,
      rawText: "",
      sourceUrl: "user-added",
      expiresAt,
      firstSeenAt: now,
      lastSeenAt: now,
      addedByUserId: userId,
    },
  };
}
