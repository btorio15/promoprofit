/**
 * Server-only Postgres write path for the promo scraper (PROMO-03, PROMO-04;
 * D-08, D-14, D-16, D-18, D-19). This is the ONLY code path that
 * inserts/updates a `promos` row from a scrape, and the only writer of
 * `scrape_runs` -- member review actions (Plans 07-09) write through
 * src/db/promoReview.ts instead. Mirrors src/ingestion/odds/store.ts's
 * db.batch pattern for multi-statement atomicity (one transaction per call).
 *
 * Lifecycle rules implemented here (D-19, run per book, per scrape):
 * - A dedupe_key never seen before -> insert, pending_review/match (D-10):
 *   a fresh scrape can never itself activate a promo -- Plan 08's matcher or
 *   a reviewer does that.
 * - dismissed -> skipped entirely; a dismissed promo is never revived by a
 *   re-scrape (D-14).
 * - active/pending_review -> last_seen_at always advances; expires_at and
 *   every structured/cap column (plus the raw `parsed` payload) refresh from
 *   the new parse ONLY when the row has no cap_entered_by_user_id -- a
 *   member-entered cap is never silently overwritten by a re-scrape.
 *   Status and scope are untouched here; only Plans 07-09's review actions
 *   change those.
 * - expired -> revived. Since promoDedupeKey excludes match/scope fields
 *   (dedupe.ts), the reappearing promo may have a different scope than it
 *   did before it expired, so scope is only ever kept when a human
 *   confirmed/corrected it. Cap fields are deliberately NOT refreshed from
 *   the new parse on this path (unlike the active/pending_review branch
 *   above) -- reviving keeps the promo's prior known caps rather than
 *   trusting a possibly-different re-scrape of the same identity, matching
 *   D-19's "keeping a prior human-confirmed scope" framing.
 */
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db/client";
import { promos, scrapeRuns } from "@/db/schema";
import { statusAfterMatch } from "@/domain/promos/lifecycle";
import type { ScrapedPromo } from "@/domain/promos/scraped";
import type { CapField } from "@/domain/promos/types";

export interface PromoWrite {
  dedupeKey: string;
  parsed: ScrapedPromo;
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

interface ExistingPromoRow {
  id: number;
  status: string;
  scopeKind: string | null;
  confirmedByUserId: number | null;
  correctedByUserId: number | null;
  capEnteredByUserId: number | null;
  maxStake: string | null;
  bonusAmount: string | null;
  unparsedCapFields: unknown;
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
 * Applies the D-19 dedupe/lifecycle rule to every write from one book's
 * scrape, in a single transaction (all-or-nothing, mirroring
 * odds/store.ts's commitOddsRefresh).
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
      scopeKind: promos.scopeKind,
      confirmedByUserId: promos.confirmedByUserId,
      correctedByUserId: promos.correctedByUserId,
      capEnteredByUserId: promos.capEnteredByUserId,
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
    const existing = existingByKey.get(write.dedupeKey);
    const parsed = write.parsed;

    if (!existing) {
      statements.push(
        db.insert(promos).values({
          bookKey,
          dedupeKey: write.dedupeKey,
          promoType: parsed.promoType,
          status: "pending_review",
          reviewReason: "match",
          autoMatched: false,
          autoMatchBlocked: false,
          scopeKind: null,
          eventId: null,
          eventCommenceTime: null,
          homeTeam: null,
          awayTeam: null,
          marketType: null,
          line: null,
          side: null,
          windowStart: null,
          windowEnd: null,
          bestGuess: null,
          parsed,
          ...structuredCapColumns(parsed),
          firstSeenAt: now,
          lastSeenAt: now,
        }),
      );
      outcome.inserted++;
      continue;
    }

    if (existing.status === "dismissed") {
      outcome.skippedDismissed++;
      continue;
    }

    if (existing.status === "active" || existing.status === "pending_review") {
      const capLocked = existing.capEnteredByUserId !== null;
      statements.push(
        db
          .update(promos)
          .set(
            capLocked
              ? { lastSeenAt: now }
              : { lastSeenAt: now, parsed, ...structuredCapColumns(parsed) },
          )
          .where(eq(promos.id, existing.id)),
      );
      outcome.refreshed++;
      continue;
    }

    if (existing.status === "expired") {
      const hasHumanScope =
        existing.scopeKind !== null &&
        (existing.confirmedByUserId !== null || existing.correctedByUserId !== null);

      if (hasHumanScope) {
        const after = statusAfterMatch({
          promoType: parsed.promoType,
          maxStake: existing.maxStake,
          bonusAmount: existing.bonusAmount,
          unparsedCapFields: (existing.unparsedCapFields as CapField[] | null) ?? [],
        });
        statements.push(
          db
            .update(promos)
            .set({
              lastSeenAt: now,
              status: after.status,
              reviewReason: after.reviewReason,
              unparsedCapFields: after.unparsedCapFields,
            })
            .where(eq(promos.id, existing.id)),
        );
      } else {
        statements.push(
          db
            .update(promos)
            .set({
              lastSeenAt: now,
              status: "pending_review",
              reviewReason: "match",
              scopeKind: null,
              eventId: null,
              eventCommenceTime: null,
              homeTeam: null,
              awayTeam: null,
              marketType: null,
              line: null,
              side: null,
              windowStart: null,
              windowEnd: null,
              bestGuess: null,
            })
            .where(eq(promos.id, existing.id)),
        );
      }
      outcome.revived++;
      continue;
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
