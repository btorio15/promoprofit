import { z } from "zod";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "./client";
import { promos } from "./schema";
import { ScrapedPromoSchema, type ScrapedPromo } from "@/domain/promos/scraped";
import { ScopeGuessSchema, type ScopeGuess } from "@/domain/promos/scope";
import type { statusAfterMatch } from "@/domain/promos/lifecycle";
import {
  CAP_FIELDS,
  PROMO_TYPES,
  REVIEW_REASONS,
  WINNINGS_CAP_KINDS,
  type CapField,
  type PromoSelection,
  type PromoType,
  type ReviewReason,
  type WinningsCapKind,
} from "@/domain/promos/types";

/**
 * This is the ONLY member-action write path for promos (D-12): every
 * confirm/dismiss/correct/cap-entry (Plans 07-09) writes through this
 * module's applyConfirmedMatch/applyDismissal (and their Plan 09 siblings),
 * each a single conditional UPDATE ... WHERE status = 'pending_review' so
 * two members racing the same queue card can never both succeed
 * (T-03-07-03).
 */

export interface QueueRow {
  id: number;
  bookKey: string;
  promoType: PromoType;
  reviewReason: ReviewReason;
  parsed: ScrapedPromo;
  bestGuess: ScopeGuess | null;
  flagged: boolean;
  /** The current matched scope (caps-kind rows only), built from the scope columns. Null while unmatched. */
  scope: ScopeGuess | null;
  maxStake: string | null;
  maxWinnings: string | null;
  /** The book's own winnings-cap semantics (Plan 09, D-18) -- set independently of whether maxWinnings itself parsed; null means "unknown," which enterPromoCaps refuses to guess (T-03-09-03). */
  maxWinningsKind: WinningsCapKind | null;
  minOddsAmerican: number | null;
  bonusAmount: string | null;
  unparsedCapFields: CapField[];
}

interface PendingPromoRow {
  id: number;
  bookKey: string;
  promoType: string;
  reviewReason: string | null;
  parsed: unknown;
  bestGuess: unknown;
  flaggedByUserId: number | null;
  scopeKind: string | null;
  eventId: string | null;
  sportKey: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  eventCommenceTime: Date | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  maxStake: string | null;
  maxWinnings: string | null;
  maxWinningsKind: string | null;
  minOddsAmerican: number | null;
  bonusAmount: string | null;
  unparsedCapFields: unknown;
}

const SELECT_COLUMNS = {
  id: promos.id,
  bookKey: promos.bookKey,
  promoType: promos.promoType,
  reviewReason: promos.reviewReason,
  parsed: promos.parsed,
  bestGuess: promos.bestGuess,
  flaggedByUserId: promos.flaggedByUserId,
  scopeKind: promos.scopeKind,
  eventId: promos.eventId,
  sportKey: promos.sportKey,
  homeTeam: promos.homeTeam,
  awayTeam: promos.awayTeam,
  eventCommenceTime: promos.eventCommenceTime,
  windowStart: promos.windowStart,
  windowEnd: promos.windowEnd,
  maxStake: promos.maxStake,
  maxWinnings: promos.maxWinnings,
  maxWinningsKind: promos.maxWinningsKind,
  minOddsAmerican: promos.minOddsAmerican,
  bonusAmount: promos.bonusAmount,
  unparsedCapFields: promos.unparsedCapFields,
} as const;

const CapFieldArraySchema = z.array(z.enum(CAP_FIELDS));

function scopeGuessFromColumns(row: PendingPromoRow): ScopeGuess | null {
  if (row.scopeKind === "event") {
    if (!row.eventId || !row.sportKey || !row.homeTeam || !row.awayTeam || !row.eventCommenceTime) return null;
    return {
      kind: "event",
      eventId: row.eventId,
      sportKey: row.sportKey,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      commenceTime: row.eventCommenceTime.toISOString(),
    };
  }

  if (row.scopeKind === "sport_window") {
    if (!row.sportKey || !row.windowStart || !row.windowEnd) return null;
    return {
      kind: "sport_window",
      sportKey: row.sportKey,
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
    };
  }

  return null;
}

/**
 * Drizzle `.set()` columns for a scope write, shared by applyConfirmedMatch
 * (Plan 07) and applyCorrectedMatch (Plan 09) -- both write the exact same
 * scope-column shape, just from a different source ScopeGuess.
 */
function scopeColumnsFrom(scope: ScopeGuess) {
  return scope.kind === "event"
    ? {
        scopeKind: "event" as const,
        sportKey: scope.sportKey,
        eventId: scope.eventId,
        eventCommenceTime: new Date(scope.commenceTime),
        homeTeam: scope.homeTeam,
        awayTeam: scope.awayTeam,
        windowStart: null,
        windowEnd: null,
      }
    : {
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

/**
 * Validates and shapes one pending_review promos row into a QueueRow, or
 * drops it with a console.warn when its stored data is inconsistent with
 * the schemas that govern it (mirrors db/promos.ts's
 * mapActivePromoRow/T-03-15-01) -- a single malformed row must never take
 * down the whole review queue. No date/expiry filtering here -- that's the
 * caller's concern (getReviewQueue's SQL WHERE + D-16 drop, below).
 */
function mapPendingPromoRow(row: PendingPromoRow): QueueRow | null {
  if (!(PROMO_TYPES as readonly string[]).includes(row.promoType)) {
    console.warn(`promoReview: dropping promo ${row.id}, unknown promo_type=${row.promoType}`);
    return null;
  }

  if (row.reviewReason === null || !(REVIEW_REASONS as readonly string[]).includes(row.reviewReason)) {
    console.warn(`promoReview: dropping promo ${row.id}, unknown review_reason=${row.reviewReason}`);
    return null;
  }

  const parsedResult = ScrapedPromoSchema.safeParse(row.parsed);
  if (!parsedResult.success) {
    console.warn(`promoReview: dropping promo ${row.id}, invalid parsed payload`);
    return null;
  }

  const bestGuessResult = ScopeGuessSchema.safeParse(row.bestGuess);
  const bestGuess = bestGuessResult.success ? bestGuessResult.data : null;

  const unparsedCapFieldsResult = CapFieldArraySchema.safeParse(row.unparsedCapFields);
  const unparsedCapFields = unparsedCapFieldsResult.success ? unparsedCapFieldsResult.data : [];

  const maxWinningsKind: WinningsCapKind | null =
    row.maxWinningsKind !== null && (WINNINGS_CAP_KINDS as readonly string[]).includes(row.maxWinningsKind)
      ? (row.maxWinningsKind as WinningsCapKind)
      : null;

  return {
    id: row.id,
    bookKey: row.bookKey,
    promoType: row.promoType as PromoType,
    reviewReason: row.reviewReason as ReviewReason,
    parsed: parsedResult.data,
    bestGuess,
    flagged: row.flaggedByUserId !== null,
    scope: scopeGuessFromColumns(row),
    maxStake: row.maxStake,
    maxWinnings: row.maxWinnings,
    maxWinningsKind,
    minOddsAmerican: row.minOddsAmerican,
    bonusAmount: row.bonusAmount,
    unparsedCapFields,
  };
}

/**
 * The full review queue (D-13, D-16, PROMO-04), ordered oldest-first
 * (first_seen_at asc). The SQL WHERE clause drops anything already past its
 * own expiry/commence/window-end columns; the JS-side check afterward also
 * drops rows whose *scraped* parsed.windowEnd/expiresAt has passed even
 * though the promo hasn't been matched yet (those DB columns stay null
 * until a reviewer confirms a scope) -- D-16 must hold for a promo's own
 * stated window regardless of match status.
 */
export async function getReviewQueue(now: Date): Promise<QueueRow[]> {
  const db = getDb();
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(promos)
    .where(
      and(
        eq(promos.status, "pending_review"),
        or(isNull(promos.expiresAt), gt(promos.expiresAt, now)),
        or(isNull(promos.eventCommenceTime), gt(promos.eventCommenceTime, now)),
        or(isNull(promos.windowEnd), gt(promos.windowEnd, now)),
      ),
    )
    .orderBy(asc(promos.firstSeenAt));

  const result: QueueRow[] = [];
  for (const row of rows) {
    const mapped = mapPendingPromoRow(row);
    if (!mapped) continue;

    if (mapped.parsed.windowEnd !== null && new Date(mapped.parsed.windowEnd).getTime() <= now.getTime()) continue;
    if (mapped.parsed.expiresAt !== null && new Date(mapped.parsed.expiresAt).getTime() <= now.getTime()) continue;

    result.push(mapped);
  }
  return result;
}

/** One pending_review row by id, for the confirm/dismiss/correct actions -- no expiry filtering (the actions apply their own staleness checks). */
export async function getPendingPromo(id: number): Promise<QueueRow | null> {
  const db = getDb();
  const rows = await db
    .select(SELECT_COLUMNS)
    .from(promos)
    .where(and(eq(promos.id, id), eq(promos.status, "pending_review")))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return mapPendingPromoRow(row);
}

/**
 * Writes a confirmed match scope (D-12) in one conditional UPDATE, gated on
 * status = 'pending_review' AND review_reason = 'match' so it can only ever
 * apply to a match-kind row still awaiting review -- a concurrent second
 * confirm/dismiss/correct on the same row affects zero rows (T-03-07-03).
 * Sets the scope columns from the (server-revalidated) scope, clears the
 * now-optional pinned market_type/line/side (the app picks the market
 * itself, Plan 04), applies `next`'s status/reviewReason/unparsedCapFields
 * (D-18 cap routing), and records attribution.
 */
export async function applyConfirmedMatch(args: {
  promoId: number;
  userId: number;
  scope: ScopeGuess;
  next: ReturnType<typeof statusAfterMatch>;
  now: Date;
}): Promise<boolean> {
  const { promoId, userId, scope, next, now } = args;
  const db = getDb();

  const rows = await db
    .update(promos)
    .set({
      ...scopeColumnsFrom(scope),
      marketType: null,
      line: null,
      side: null,
      status: next.status,
      reviewReason: next.reviewReason,
      unparsedCapFields: next.unparsedCapFields,
      confirmedByUserId: userId,
      reviewedAt: now,
      autoMatched: false,
    })
    .where(and(eq(promos.id, promoId), eq(promos.status, "pending_review"), eq(promos.reviewReason, "match")))
    .returning({ id: promos.id });

  return rows.length === 1;
}

/**
 * Dismisses a queued promo (D-14) in one conditional UPDATE, gated on
 * status = 'pending_review' so a dismissal can never apply twice or race
 * against a concurrent confirm/correct (T-03-07-03). A dismissed promo is
 * never re-queued by later scrapes (store.ts, Plan 06, matches on
 * dedupe_key regardless of status).
 */
export async function applyDismissal(args: { promoId: number; userId: number; now: Date }): Promise<boolean> {
  const { promoId, userId, now } = args;
  const db = getDb();

  const rows = await db
    .update(promos)
    .set({ status: "dismissed", dismissedByUserId: userId, reviewedAt: now })
    .where(and(eq(promos.id, promoId), eq(promos.status, "pending_review")))
    .returning({ id: promos.id });

  return rows.length === 1;
}

/**
 * Writes a member-corrected scope (D-14, T-03-09-02/05) in the same
 * conditional-UPDATE shape as applyConfirmedMatch, plus the optional pinned
 * market/side (null clears any prior pin -- "Best available" is a real,
 * writable choice, not just a UI default). Sets corrected_by_user_id
 * (distinct attribution from confirmed_by_user_id) and auto_matched false;
 * auto_match_blocked is left untouched (Plan 07/D-11's flag-back semantics
 * are orthogonal to a member actively correcting a match).
 */
export async function applyCorrectedMatch(args: {
  promoId: number;
  userId: number;
  scope: ScopeGuess;
  pinned: PromoSelection | null;
  next: ReturnType<typeof statusAfterMatch>;
  now: Date;
}): Promise<boolean> {
  const { promoId, userId, scope, pinned, next, now } = args;
  const db = getDb();

  const pinnedColumns = pinned
    ? { marketType: pinned.marketType, line: pinned.line, side: pinned.side }
    : { marketType: null, line: null, side: null };

  const rows = await db
    .update(promos)
    .set({
      ...scopeColumnsFrom(scope),
      ...pinnedColumns,
      status: next.status,
      reviewReason: next.reviewReason,
      unparsedCapFields: next.unparsedCapFields,
      correctedByUserId: userId,
      reviewedAt: now,
      autoMatched: false,
    })
    .where(and(eq(promos.id, promoId), eq(promos.status, "pending_review"), eq(promos.reviewReason, "match")))
    .returning({ id: promos.id });

  return rows.length === 1;
}

/**
 * Writes member-supplied cap fields (D-18, T-03-09-03) in one conditional
 * UPDATE gated on status = 'pending_review' AND review_reason = 'caps'.
 * Callers pass every cap column's FINAL value (the caller -- enterPromoCaps
 * -- is responsible for passing through the row's own already-known value
 * for any field not being newly entered, so this function never blindly
 * nulls out a cap the scraper already parsed correctly). Always activates
 * the promo (D-18: caps review has no other way out besides Dismiss) and
 * clears unparsed_cap_fields.
 */
export async function applyCapEntry(args: {
  promoId: number;
  userId: number;
  maxStake: string | null;
  maxWinnings: string | null;
  minOddsAmerican: number | null;
  now: Date;
}): Promise<boolean> {
  const { promoId, userId, maxStake, maxWinnings, minOddsAmerican, now } = args;
  const db = getDb();

  const rows = await db
    .update(promos)
    .set({
      maxStake,
      maxWinnings,
      minOddsAmerican,
      unparsedCapFields: [],
      status: "active",
      reviewReason: null,
      capEnteredByUserId: userId,
      reviewedAt: now,
    })
    .where(and(eq(promos.id, promoId), eq(promos.status, "pending_review"), eq(promos.reviewReason, "caps")))
    .returning({ id: promos.id });

  return rows.length === 1;
}
