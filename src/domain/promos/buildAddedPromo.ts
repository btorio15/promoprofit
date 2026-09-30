import Decimal from "decimal.js";
import type { promos } from "@/db/schema";
import { getSportLabel } from "@/config/sports";
import type { AddPromoInput } from "./addedPromoInput";
import { etDayBounds, parseEtDateTime } from "./etTime";
import { promoTitle } from "./promoRowDto";
import type { ScopeGuess } from "./scope";
import { ScrapedPromoSchema, type ScrapedPromo } from "./scraped";
import { PROMO_MARKET_TYPES, type PromoMarketType, type PromoSide } from "./types";

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

export type AddedPin = {
  marketType: PromoMarketType;
  line: number | null;
  side: PromoSide;
  selectionText: string;
};

export function buildAddedPromoRow(args: {
  input: AddPromoInput;
  scope: ScopeGuess | { kind: "any" };
  bookName: string;
  now: Date;
  expiresAt: Date | null;
  userId: number;
  dedupeKey: string;
  /** Boost only: the server-resolved market/side pin (null = unpinned). */
  pinned?: AddedPin | null;
}): { ok: true; values: AddedPromoInsert } | { ok: false } {
  const { input, scope, now, expiresAt, userId, dedupeKey } = args;
  const pinned = input.promoType === "profit_boost" ? (args.pinned ?? null) : null;

  const minOddsAmerican = input.minOddsAmerican ?? null;
  const bonusAmount = input.promoType === "bonus_bet" ? new Decimal(input.bonusAmount).toFixed(2) : null;
  let boostPercent: string | null = null;
  let boostedOddsAmerican: number | null = null;
  let maxStake: string | null = null;
  let maxWinnings: { amount: string; kind: "total_payout" | "boost_extra" } | null = null;
  if (input.promoType === "profit_boost") {
    if (input.boost.mode === "percent") {
      boostPercent = new Decimal(input.boost.boostPercent).toFixed(2);
    } else {
      boostedOddsAmerican = input.boost.boostedOddsAmerican;
    }
    maxStake = new Decimal(input.maxStake).toFixed(2);
    if (input.maxWinnings) {
      maxWinnings = { amount: new Decimal(input.maxWinnings.amount).toFixed(2), kind: input.maxWinnings.kind };
    }
  }

  const title = promoTitle({
    promoType: input.promoType,
    boostPercent,
    boostedOddsAmerican,
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
    promoType: input.promoType,
    title,
    rawText: "",
    sourceUrl: "user-added",
    sportKeyHint,
    scopeText: scopeText.slice(0, 200),
    teamsText,
    windowStart,
    windowEnd,
    expiresAt: expiresAt !== null ? expiresAt.toISOString() : null,
    eligibleMarketTypes: pinned ? [pinned.marketType] : [...PROMO_MARKET_TYPES],
    pinned: pinned
      ? { selectionText: pinned.selectionText, marketType: pinned.marketType, line: pinned.line }
      : null,
    boostPercent,
    boostedOddsAmerican,
    baseOddsAmerican: null,
    bonusAmount,
    maxStake,
    maxWinnings,
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
      promoType: input.promoType,
      status: "active",
      autoMatched: false,
      ...scopeColumns(scope),
      marketType: pinned ? pinned.marketType : null,
      line: pinned ? pinned.line : null,
      side: pinned ? pinned.side : null,
      parsed: validated.data,
      boostPercent,
      boostedOddsAmerican,
      baseOddsAmerican: null,
      bonusAmount,
      maxStake,
      maxWinnings: maxWinnings ? maxWinnings.amount : null,
      maxWinningsKind: maxWinnings ? maxWinnings.kind : null,
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
