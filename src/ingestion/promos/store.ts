/**
 * Server-only Postgres write path for the promo scraper (PROMO-03, PROMO-04;
 * D-08, D-10, D-11, D-14, D-16, D-18, D-19). This is the ONLY code path that
 * inserts/updates a `promos` row from a scrape, and the only writer of
 * `scrape_runs` -- member review actions (Plans 07-09) write through
 * src/db/promoReview.ts instead. Mirrors src/ingestion/odds/store.ts's
 * db.batch pattern for multi-statement atomicity (one transaction per call).
 *
 * decideScrapedWrite (lifecycle.ts) is the single source of truth for
 * skip/touch/write per row (Plan 08) -- this file's only job is loading the
 * existing row's state, calling it, and translating its decision into SQL.
 * It never applies its own status/scope rules inline.
 */
import { and, eq, inArray, isNull, notInArray, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db/client";
import { promos, scrapeRuns } from "@/db/schema";
import { decideScrapedWrite, type ExistingPromoState } from "@/domain/promos/lifecycle";
import type { MatchResult } from "@/domain/promos/matcher";
import type { ScopeGuess } from "@/domain/promos/scope";
import type { ScrapedPromo } from "@/domain/promos/scraped";
import type { CapField, PromoMarketType, PromoSelection, PromoSide, PromoStatus, PromoType, ReviewReason } from "@/domain/promos/types";

export interface PromoWrite {
  dedupeKey: string;
  parsed: ScrapedPromo;
  match: MatchResult;
}

export interface ScrapeRunRow {
  bookKey: string;
  ranAt: Date;
  status: "ok" | "failed";
  promosFound: number;
  promosKept: number;
  errorMessage: string | null;
}

export interface UpsertOutcome {
  inserted: number;
  refreshed: number;
  revived: number;
  skippedDismissed: number;
}

export interface PromoStore {
  recordScrapeRun(row: ScrapeRunRow): Promise<void>;
  upsertScrapedPromos(bookKey: string, writes: PromoWrite[], now: Date): Promise<UpsertOutcome>;
  expireMissingPromos(bookKey: string, seenDedupeKeys: readonly string[], now: Date): Promise<number>;
}

type Statement = BatchItem<"pg">;

/** One promo's structured/cap columns, derived from its validated parse. */
function structuredCapColumns(parsed: ScrapedPromo) {
  return {
    boostPercent: parsed.boostPercent,
    boostedOddsAmerican: parsed.boostedOddsAmerican,
    baseOddsAmerican: parsed.baseOddsAmerican,
    bonusAmount: parsed.bonusAmount,
    maxStake: parsed.maxStake,
    maxWinnings: parsed.maxWinnings?.amount ?? null,
    maxWinningsKind: parsed.maxWinnings?.kind ?? null,
    minOddsAmerican: parsed.minOddsAmerican,
    unparsedCapFields: parsed.unparsedCapFields,
    finePrintNote: parsed.finePrintNote,
    rawText: parsed.rawText,
    sourceUrl: parsed.sourceUrl,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  };
}

/** scope_kind/event_id/sport_key/event_commence_time/home_team/away_team/window_start/window_end from a ScopeGuess (null clears all). */
function scopeColumnsFrom(scope: ScopeGuess | null) {
  if (scope === null) {
    return {
      scopeKind: null,
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

/** market_type/line/side from a pinned PromoSelection (null clears all). */
function pinColumnsFrom(pinned: PromoSelection | null) {
  if (pinned === null) return { marketType: null, line: null, side: null };
  return { marketType: pinned.marketType, line: pinned.line, side: pinned.side };
}

interface ExistingPromoRow {
  id: number;
  status: string;
  reviewReason: string | null;
  autoMatchBlocked: boolean;
  scopeKind: string | null;
  sportKey: string | null;
  eventId: string | null;
  eventCommenceTime: Date | null;
  homeTeam: string | null;
  awayTeam: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  marketType: string | null;
  line: number | null;
  side: string | null;
  confirmedByUserId: number | null;
  correctedByUserId: number | null;
  capEnteredByUserId: number | null;
  dismissedByUserId: number | null;
  flaggedByUserId: number | null;
  promoType: string;
  maxStake: string | null;
  bonusAmount: string | null;
  unparsedCapFields: unknown;
}

function humanScopeFrom(row: ExistingPromoRow): ScopeGuess | null {
  if (row.scopeKind === "event") {
    if (row.eventId === null || row.sportKey === null || row.eventCommenceTime === null) return null;
    if (row.homeTeam === null || row.awayTeam === null) return null;
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
    if (row.sportKey === null || row.windowStart === null || row.windowEnd === null) return null;
    return {
      kind: "sport_window",
      sportKey: row.sportKey,
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
    };
  }
  return null;
}

function humanPinnedFrom(row: ExistingPromoRow): PromoSelection | null {
  if (row.marketType === null || row.side === null || row.eventId === null) return null;
  return {
    eventId: row.eventId,
    marketType: row.marketType as PromoMarketType,
    line: row.line,
    side: row.side as PromoSide,
  };
}

/** `column = value`, or `column IS NULL` when value is null. */
function eqOrNull<T>(column: Parameters<typeof eq>[0], value: T | null): SQL {
  return value === null ? isNull(column) : eq(column, value);
}

/**
 * CR-05: optimistic-concurrency WHERE for every scraper UPDATE. The decision
 * was computed from `row` as read at the start of the run; if a member
 * action (dismiss/confirm/correct/cap entry/flag -- every one of which
 * changes at least one of these columns) landed in between, the UPDATE
 * matches zero rows and the member's decision stands. The row is simply
 * re-evaluated on the next scrape.
 */
function unchangedSinceRead(row: ExistingPromoRow): SQL {
  return and(
    eq(promos.id, row.id),
    eq(promos.status, row.status),
    eqOrNull(promos.reviewReason, row.reviewReason),
    eq(promos.autoMatchBlocked, row.autoMatchBlocked),
    eqOrNull(promos.confirmedByUserId, row.confirmedByUserId),
    eqOrNull(promos.correctedByUserId, row.correctedByUserId),
    eqOrNull(promos.capEnteredByUserId, row.capEnteredByUserId),
    eqOrNull(promos.dismissedByUserId, row.dismissedByUserId),
    eqOrNull(promos.flaggedByUserId, row.flaggedByUserId),
  )!;
}

function existingStateFrom(row: ExistingPromoRow): ExistingPromoState {
  const isHuman = row.confirmedByUserId !== null || row.correctedByUserId !== null;
  return {
    status: row.status as PromoStatus,
    reviewReason: row.reviewReason as ReviewReason | null,
    autoMatchBlocked: row.autoMatchBlocked,
    humanScope: isHuman ? humanScopeFrom(row) : null,
    humanPinned: isHuman ? humanPinnedFrom(row) : null,
    promoType: row.promoType as PromoType,
    maxStake: row.maxStake,
    bonusAmount: row.bonusAmount,
    unparsedCapFields: (row.unparsedCapFields as CapField[] | null) ?? [],
    capsEnteredByMember: row.capEnteredByUserId !== null,
  };
}

/** One row per book per run (D-08). Never deletes or alters existing promos. */
export async function recordScrapeRun(row: ScrapeRunRow): Promise<void> {
  const db = getDb();
  await db.insert(scrapeRuns).values({
    bookKey: row.bookKey,
    ranAt: row.ranAt,
    status: row.status,
    promosFound: row.promosFound,
    promosKept: row.promosKept,
    errorMessage: row.errorMessage,
  });
}

/**
 * Applies decideScrapedWrite's decision to every write from one book's
 * scrape, in a single transaction (all-or-nothing, mirroring
 * odds/store.ts's commitOddsRefresh). Every UPDATE is conditional on the
 * row being unchanged since it was read (CR-05), so the outcome counts are
 * attempted writes -- a row a member acted on mid-run is skipped silently.
 */
export async function upsertScrapedPromos(
  bookKey: string,
  writes: PromoWrite[],
  now: Date,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = { inserted: 0, refreshed: 0, revived: 0, skippedDismissed: 0 };
  if (writes.length === 0) return outcome;

  const db = getDb();
  const existingRows = await db
    .select({
      id: promos.id,
      dedupeKey: promos.dedupeKey,
      status: promos.status,
      reviewReason: promos.reviewReason,
      autoMatchBlocked: promos.autoMatchBlocked,
      scopeKind: promos.scopeKind,
      sportKey: promos.sportKey,
      eventId: promos.eventId,
      eventCommenceTime: promos.eventCommenceTime,
      homeTeam: promos.homeTeam,
      awayTeam: promos.awayTeam,
      windowStart: promos.windowStart,
      windowEnd: promos.windowEnd,
      marketType: promos.marketType,
      line: promos.line,
      side: promos.side,
      confirmedByUserId: promos.confirmedByUserId,
      correctedByUserId: promos.correctedByUserId,
      capEnteredByUserId: promos.capEnteredByUserId,
      dismissedByUserId: promos.dismissedByUserId,
      flaggedByUserId: promos.flaggedByUserId,
      promoType: promos.promoType,
      maxStake: promos.maxStake,
      bonusAmount: promos.bonusAmount,
      unparsedCapFields: promos.unparsedCapFields,
    })
    .from(promos)
    .where(inArray(promos.dedupeKey, writes.map((w) => w.dedupeKey)));

  const existingByKey = new Map<string, ExistingPromoRow>(
    existingRows.map((row) => [row.dedupeKey, row]),
  );

  const statements: Statement[] = [];

  for (const write of writes) {
    const existingRow = existingByKey.get(write.dedupeKey) ?? null;
    const parsed = write.parsed;
    const existingState = existingRow ? existingStateFrom(existingRow) : null;
    const decision = decideScrapedWrite(existingState, parsed, write.match);

    if (decision.kind === "skip") {
      outcome.skippedDismissed++;
      continue;
    }

    if (decision.kind === "touch") {
      // existingRow is always non-null here (decideScrapedWrite only
      // returns "touch" for an existing row) -- narrow defensively.
      if (!existingRow) continue;
      statements.push(
        db
          .update(promos)
          .set({ lastSeenAt: now, expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null })
          .where(unchangedSinceRead(existingRow)),
      );
      outcome.refreshed++;
      continue;
    }

    if (decision.kind === "refresh") {
      if (!existingRow) continue;
      // CR-01: fresh caps AND the status re-derived from them, together --
      // never fresh (possibly nulled) caps on a row left active.
      statements.push(
        db
          .update(promos)
          .set({
            lastSeenAt: now,
            parsed,
            ...structuredCapColumns(parsed),
            status: decision.status,
            reviewReason: decision.reviewReason,
            unparsedCapFields: decision.unparsedCapFields,
          })
          .where(unchangedSinceRead(existingRow)),
      );
      outcome.refreshed++;
      continue;
    }

    // decision.kind === "write"
    const isExpiredHumanRevival = existingRow !== null && existingRow.status === "expired" && existingState!.humanScope !== null;

    if (existingRow === null) {
      statements.push(
        db.insert(promos).values({
          bookKey,
          dedupeKey: write.dedupeKey,
          promoType: parsed.promoType,
          status: decision.status,
          reviewReason: decision.reviewReason,
          autoMatched: decision.autoMatched,
          autoMatchBlocked: false,
          ...scopeColumnsFrom(decision.scope),
          ...pinColumnsFrom(decision.pinned),
          bestGuess: decision.bestGuess,
          parsed,
          ...structuredCapColumns(parsed),
          unparsedCapFields: decision.unparsedCapFields,
          firstSeenAt: now,
          lastSeenAt: now,
        }),
      );
      outcome.inserted++;
      continue;
    }

    if (isExpiredHumanRevival) {
      // D-19: revival keeps the human-confirmed/corrected scope and the
      // row's own prior known caps -- it never re-trusts a fresh re-scrape
      // of the same identity for those fields.
      statements.push(
        db
          .update(promos)
          .set({
            status: decision.status,
            reviewReason: decision.reviewReason,
            autoMatched: decision.autoMatched,
            ...scopeColumnsFrom(decision.scope),
            ...pinColumnsFrom(decision.pinned),
            bestGuess: decision.bestGuess,
            unparsedCapFields: decision.unparsedCapFields,
            lastSeenAt: now,
          })
          .where(unchangedSinceRead(existingRow)),
      );
      outcome.revived++;
      continue;
    }

    const wasExpired = existingRow.status === "expired";
    // CR-03: member-entered caps (capsFrom "existing") are never overwritten.
    const capColumns =
      decision.capsFrom === "parsed"
        ? { parsed, ...structuredCapColumns(parsed) }
        : { expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null };
    statements.push(
      db
        .update(promos)
        .set({
          status: decision.status,
          reviewReason: decision.reviewReason,
          autoMatched: decision.autoMatched,
          ...scopeColumnsFrom(decision.scope),
          ...pinColumnsFrom(decision.pinned),
          bestGuess: decision.bestGuess,
          ...capColumns,
          unparsedCapFields: decision.unparsedCapFields,
          lastSeenAt: now,
        })
        .where(unchangedSinceRead(existingRow)),
    );
    if (wasExpired) {
      outcome.revived++;
    } else {
      outcome.refreshed++;
    }
  }

  if (statements.length > 0) {
    const [first, ...rest] = statements;
    await db.batch([first, ...rest]);
  }

  return outcome;
}

/**
 * Expires every live (active/pending_review) row of this book NOT in
 * `seenDedupeKeys` (all of them, when `seenDedupeKeys` is empty). A failed
 * run must never call this (D-08) -- callers only reach this after a
 * successful parse.
 */
export async function expireMissingPromos(
  bookKey: string,
  seenDedupeKeys: readonly string[],
  now: Date,
): Promise<number> {
  void now; // expiry is a status flip, not a timestamped column on this table.
  const db = getDb();
  const liveStatusFilter = inArray(promos.status, ["active", "pending_review"]);
  const condition =
    seenDedupeKeys.length > 0
      ? and(eq(promos.bookKey, bookKey), liveStatusFilter, notInArray(promos.dedupeKey, [...seenDedupeKeys]))
      : and(eq(promos.bookKey, bookKey), liveStatusFilter);

  const result = await db.update(promos).set({ status: "expired" }).where(condition).returning({ id: promos.id });
  return result.length;
}

export const promoStore: PromoStore = {
  recordScrapeRun,
  upsertScrapedPromos,
  expireMissingPromos,
};
