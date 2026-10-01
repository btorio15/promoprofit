/**
 * Guarded "Search spreads & totals" fetch path (SC2, D-13, D-14, D-16).
 * Callable from the refreshSpreadsTotals server action only -- this module
 * never triggers itself automatically. It mirrors refresh.ts's lock -> gate
 * -> fetch-loop -> finally-credit-recording discipline exactly (same
 * refresh_lock row, same credit_usage ledger, same evaluateRefreshGate
 * thresholds), so the two fetch paths can never both bypass the shared
 * credit budget.
 *
 * Discretion choice (documented per the plan): this run ALSO writes an h2h
 * projection of every fetched event into cached_odds (the normal moneyline
 * cache), sharing this run's single timestamp and purge sequence. The user
 * just paid for the h2h market as part of the 3x request, so both tabs
 * benefit from one fetch and every market in the tab shares one "fetched at"
 * timestamp (D-14). This refines RESEARCH.md, which sketched cached_odds as
 * untouched by the extended refresh. WR-01 still holds: every in-season
 * sport's rows in both caches are written with this run's timestamp in the
 * same transaction as the purges, only after every fetch succeeded, so a
 * failed run changes neither cache. The reverse direction remains forbidden -- refresh.ts must
 * never import from this file or reference cached_extended_odds (D-16); this
 * plan does not modify refresh.ts.
 *
 * quick-261001-jbc: runPromoSportsRefresh is the second caller of the same
 * guarded body. It is scoped to the sports the member's active promos cover
 * (h2h+spreads+totals in one call per sport), reuses the alt-spread section
 * unchanged, commits via commitPromoSportsRefresh (other sports' cached rows
 * and fetched_at untouched) and records one credit_usage row.
 */
import { randomUUID } from "node:crypto";
import { fetchEventOdds, fetchSportOdds, listSports } from "./client";
import {
  CREDIT_BLOCK_THRESHOLD,
  effectiveRemaining,
  estimateRefreshCredits,
  evaluateRefreshGate,
  nextMonthlyReset,
} from "./quota";
import {
  ALT_SPREADS_MARKET,
  countUnmatchedAltOutcomes,
  mergeAltSpreads,
  selectAltSpreadTargets,
  NO_ALT_SPREAD_REQUESTS,
  type AltSpreadRequests,
} from "@/domain/promos/altSpreads";
import { REFRESH_LOCK_TTL_MS } from "./refresh";
import {
  commitPromoSportsRefresh,
  commitSpreadsTotalsRefresh,
  getLatestCreditUsage,
  recordCreditUsage,
  releaseRefreshLock,
  tryAcquireRefreshLock,
  type ExtendedSportOddsWrite,
} from "./store";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";
import type { OddsEvent } from "@/domain/odds/schemas";

const FETCH_WINDOW_DAYS = 7;
const MISSING_KEY_MESSAGE = "ODDS_API_KEY is not set";
const GENERIC_FAILURE_MESSAGE = "Couldn't search spreads & totals: the Odds API didn't respond.";
const PROMO_GENERIC_FAILURE_MESSAGE = "Couldn't refresh promo odds: the Odds API didn't respond.";
const NO_PROMOS_MESSAGE = "No active promos to refresh.";
const BUSY_MESSAGE = "Another odds refresh is already running. Try again in a minute.";

/** h2h + spreads + totals, per SC2/D-13 -- exactly 3x a normal (h2h-only) refresh's market count. */
export const EXTENDED_MARKETS = ["h2h", "spreads", "totals"] as const;

/**
 * Alternate-spread fetch report for games with a promo (single-game promos and line-pinned promos; quick 260930-gam/gyl).
 * unmatchedOutcomes counts alt outcomes whose name matched neither team of
 * their event (assumption A2) so a naming mismatch is visible, not silent.
 */
export interface AltLinesOutcome {
  fetched: number;
  skippedOverLimit: number;
  skippedForCredits: boolean;
  failed: number;
  unmatchedOutcomes: number;
}

export type ExtendedRefreshOutcome =
  | {
      status: "ok";
      fetchedAt: string;
      sportsFetched: string[];
      creditsSpent: number;
      remaining: number | null;
      altLines: AltLinesOutcome;
    }
  | { status: "confirm_required"; estimatedCredits: number; remaining: number | null; minutesSinceLastRefresh: number | null }
  | {
      status: "blocked";
      reason: "low_credits" | "insufficient_credits";
      remaining: number;
      estimatedCredits: number;
      resetsOn: string;
    }
  | { status: "busy"; message: string }
  | { status: "error"; message: string };

/**
 * quick-261001-jbc: the promo-sports refresh's outcome. The Arbitrage
 * reducer's ExtendedRefreshOutcome is deliberately NOT widened: this adds
 * sportKeys to confirm_required and a no_promos variant.
 */
export type PromoRefreshOutcome =
  | Exclude<ExtendedRefreshOutcome, { status: "confirm_required" }>
  | {
      status: "confirm_required";
      estimatedCredits: number;
      remaining: number | null;
      minutesSinceLastRefresh: number | null;
      sportKeys: string[];
    }
  | { status: "no_promos"; message: string };

/** Scope for a promo-sports run: only these sports, plus the alt-game quote. */
interface PromoScopeOptions {
  sportKeys: readonly string[];
  altGameEstimate: number;
}

function safeMessage(err: unknown, scoped = false): string {
  if (err instanceof Error && err.message === MISSING_KEY_MESSAGE) {
    return MISSING_KEY_MESSAGE;
  }
  // Same discipline as refresh.ts's safeMessage: never surface a raw error,
  // which could echo request state (T-01.1-15).
  return scoped ? PROMO_GENERIC_FAILURE_MESSAGE : GENERIC_FAILURE_MESSAGE;
}

/**
 * Pure: returns new event/bookmaker objects keeping only each bookmaker's
 * h2h market, dropping any bookmaker left with no markets. Never mutates
 * its input -- used to project the extended fetch's events into the normal
 * cached_odds shape without giving cached_odds a spreads/totals market it
 * was never designed to hold.
 */
export function toH2hOnlyEvents(events: OddsEvent[]): OddsEvent[] {
  return events.map((event) => ({
    ...event,
    bookmakers: event.bookmakers
      .map((bookmaker) => ({
        ...bookmaker,
        markets: bookmaker.markets.filter((m) => m.key === "h2h"),
      }))
      .filter((bookmaker) => bookmaker.markets.length > 0),
  }));
}

/**
 * Picks extra alt-spread game ids from the FRESH main lines (260930-hor league-wide
 * top-1 picks). Synchronous: all DB loading happens in the action before the lock.
 */
export type AltSpreadEventPicker = (fresh: {
  moneylineEvents: OddsEvent[];
  extendedEvents: OddsEvent[];
  now: Date;
}) => string[];

export interface SpreadsTotalsRefreshOptions {
  confirmed: boolean;
  now?: Date;
  triggeredByUserId?: number | null;
  altSpreads?: AltSpreadRequests;
  pickAltSpreadEventIds?: AltSpreadEventPicker;
}

/**
 * Serializes against Refresh odds and the odds:refresh CLI (same refresh_lock
 * row id=1, WR-03): the lock is taken before the gate is evaluated and held
 * until the credit row is written, exactly like runOddsRefresh.
 */
export async function runSpreadsTotalsRefresh(opts: SpreadsTotalsRefreshOptions): Promise<ExtendedRefreshOutcome> {
  // Unscoped runs never return no_promos or a sportKeys confirm, so the
  // narrowing to ExtendedRefreshOutcome is exact.
  return (await runLocked(opts)) as ExtendedRefreshOutcome;
}

/**
 * quick-261001-jbc: refreshes h2h+spreads+totals for ONLY `sportKeys` (those
 * in season), then the shared alt-spread shortcut, under the same refresh
 * lock and credit gate as the full search. Always requires a confirm.
 */
export async function runPromoSportsRefresh(
  opts: SpreadsTotalsRefreshOptions & PromoScopeOptions,
): Promise<PromoRefreshOutcome> {
  const { sportKeys, altGameEstimate, ...base } = opts;
  return (await runLocked(base, { sportKeys, altGameEstimate })) as PromoRefreshOutcome;
}

async function runLocked(
  opts: SpreadsTotalsRefreshOptions,
  scope?: PromoScopeOptions,
): Promise<ExtendedRefreshOutcome | PromoRefreshOutcome> {
  const holder = randomUUID();

  let acquired: boolean;
  try {
    acquired = await tryAcquireRefreshLock(holder, REFRESH_LOCK_TTL_MS);
  } catch (err) {
    return { status: "error", message: safeMessage(err, scope !== undefined) };
  }
  if (!acquired) {
    return { status: "busy", message: BUSY_MESSAGE };
  }

  try {
    return await runGuardedSpreadsTotalsRefresh(opts, scope);
  } finally {
    try {
      await releaseRefreshLock(holder);
    } catch {
      // Best-effort: the lock expires on its own after REFRESH_LOCK_TTL_MS.
    }
  }
}

async function runGuardedSpreadsTotalsRefresh(
  opts: SpreadsTotalsRefreshOptions,
  scope?: PromoScopeOptions,
): Promise<ExtendedRefreshOutcome | PromoRefreshOutcome> {
  const now = opts.now ?? new Date();
  const scoped = scope !== undefined;

  let latest;
  try {
    latest = await getLatestCreditUsage();
  } catch (err) {
    return { status: "error", message: safeMessage(err, scoped) };
  }

  let sports;
  try {
    sports = await listSports(); // 0 credits
  } catch (err) {
    return { status: "error", message: safeMessage(err, scoped) };
  }

  const inSeason = sports.filter((s) => s.active && SPORT_KEYS.includes(s.key));
  // D-01: a scoped run fetches only the promo sports that are in season.
  const targets = scope ? inSeason.filter((s) => scope.sportKeys.includes(s.key)) : inSeason;
  if (scope && targets.length === 0) {
    return { status: "no_promos", message: NO_PROMOS_MESSAGE };
  }
  const bookKeys = usableOddsBooks().map((b) => b.key); // D-15, never paid_only
  const mainEstimate = estimateRefreshCredits(targets.length, bookKeys.length, EXTENDED_MARKETS.length);
  // D-04 quote: the gate stays on the main fetch (alt is skippable, as in the
  // full search); the confirm dialog quotes main + an alt-game upper bound.
  const estimatedCredits = scope
    ? mainEstimate + scope.altGameEstimate * Math.ceil(bookKeys.length / 10)
    : mainEstimate;

  // A row from before the last monthly reset is last month's balance:
  // treat it as unknown so the low-credit block lifts on the 1st (CR-01).
  const priorRemaining = effectiveRemaining(latest, now);
  const priorUsed = priorRemaining === null ? null : (latest?.requestsUsed ?? null);

  const gate = evaluateRefreshGate({
    remaining: priorRemaining,
    lastRefreshAt: latest?.recordedAt ?? null,
    estimatedCredits: mainEstimate,
    now,
    confirmed: opts.confirmed,
  });

  if (gate.action === "block") {
    return {
      status: "blocked",
      reason: gate.reason,
      remaining: gate.remaining,
      estimatedCredits: gate.estimatedCredits,
      resetsOn: nextMonthlyReset(now).toISOString(),
    };
  }

  // D-14: every "Search spreads & totals" press always requires an explicit
  // confirm, regardless of the shared 15-minute window -- never proceed on
  // an unconfirmed call, and never spend credits without one.
  if (!opts.confirmed) {
    const minutesSinceLastRefresh = gate.action === "confirm" ? gate.minutesSinceLastRefresh : null;
    if (scope) {
      return {
        status: "confirm_required",
        estimatedCredits,
        remaining: priorRemaining,
        minutesSinceLastRefresh,
        sportKeys: targets.map((t) => t.key),
      };
    }
    return {
      status: "confirm_required",
      estimatedCredits,
      remaining: priorRemaining,
      minutesSinceLastRefresh,
    };
  }

  const commenceTimeFrom = now;
  const commenceTimeTo = new Date(now.getTime() + FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const sportsFetched: string[] = [];
  const pendingWrites: ExtendedSportOddsWrite[] = [];
  let lastRemaining: number | null = null;
  let lastUsed: number | null = null;
  let refreshCost = 0;
  let quotaCaptured = false;
  let refreshError: unknown = null;
  const altLines: AltLinesOutcome = {
    fetched: 0,
    skippedOverLimit: 0,
    skippedForCredits: false,
    failed: 0,
    unmatchedOutcomes: 0,
  };

  try {
    // Buffer every sport in memory first (01.1 review WR-01). Nothing is
    // written until the whole loop succeeds, so a failed search leaves BOTH
    // caches exactly as they were -- it can no longer hide not-yet-fetched
    // sports from the Arbitrage tab or the Bonus-bets finder.
    for (const sport of targets) {
      const { events, quota } = await fetchSportOdds(sport.key, {
        bookmakerKeys: bookKeys,
        commenceTimeFrom,
        commenceTimeTo,
        markets: EXTENDED_MARKETS,
      });

      // Capture the quota as soon as the fetch returns -- the credits are
      // spent at this point, even if the cache commit below fails (WR-02).
      quotaCaptured = true;
      if (quota.last !== null) refreshCost += quota.last;
      if (quota.remaining !== null) lastRemaining = quota.remaining;
      if (quota.used !== null) lastUsed = quota.used;

      pendingWrites.push({
        sportKey: sport.key,
        extendedEvents: events,
        h2hEvents: toH2hOnlyEvents(events),
      });
      sportsFetched.push(sport.key);
    }

    // Alternate spread lines for games with a promo (quick 260930-gam/gyl):
    // capped, sequential, and never able to fail the main refresh. Runs
    // after the main loop so the main spreads/totals are already buffered.
    // 260930-hor: league-wide promos add their top-1 main-line game via the
    // picker hook; a pick failure never fails the main refresh.
    const base = opts.altSpreads ?? NO_ALT_SPREAD_REQUESTS;
    let picked: string[] = [];
    if (opts.pickAltSpreadEventIds) {
      try {
        picked = opts.pickAltSpreadEventIds({
          moneylineEvents: pendingWrites.flatMap((w) => w.h2hEvents),
          extendedEvents: pendingWrites.flatMap((w) => w.extendedEvents),
          now,
        });
      } catch {
        picked = [];
      }
    }
    const requests: AltSpreadRequests = {
      pins: base.pins,
      scopedEventIds: [...new Set([...base.scopedEventIds, ...picked])],
    };
    if (requests.pins.length > 0 || requests.scopedEventIds.length > 0) {
      const { targets, skippedOverLimit } = selectAltSpreadTargets(
        requests,
        pendingWrites.flatMap((w) => w.extendedEvents),
        now,
      );
      altLines.skippedOverLimit = skippedOverLimit;

      const altCost = targets.length * Math.ceil(bookKeys.length / 10);
      const balance = lastRemaining ?? priorRemaining;
      if (targets.length > 0 && balance !== null && balance - altCost < CREDIT_BLOCK_THRESHOLD) {
        altLines.skippedForCredits = true;
      } else {
        for (const target of targets) {
          try {
            const { event: altEvent, quota } = await fetchEventOdds(target.sportKey, target.eventId, {
              bookmakerKeys: bookKeys,
              markets: [ALT_SPREADS_MARKET],
            });
            quotaCaptured = true;
            if (quota.last !== null) refreshCost += quota.last;
            if (quota.remaining !== null) lastRemaining = quota.remaining;
            if (quota.used !== null) lastUsed = quota.used;

            if (!altEvent) continue;
            const write = pendingWrites.find((w) => w.sportKey === target.sportKey);
            if (!write) continue;
            const idx = write.extendedEvents.findIndex((e) => e.id === target.eventId);
            if (idx === -1) continue;
            const merged = mergeAltSpreads(write.extendedEvents[idx], altEvent, bookKeys);
            altLines.unmatchedOutcomes += countUnmatchedAltOutcomes(merged);
            write.extendedEvents = write.extendedEvents.map((e, i) => (i === idx ? merged : e));
            altLines.fetched += 1;
          } catch {
            altLines.failed += 1;
          }
        }
      }
    }

    // One transaction: both caches' per-sport rows plus both caches'
    // purges (D-16: the ONLY call site that writes or purges
    // cached_extended_odds). All-or-nothing.
    // Scoped (promo) runs merge per sport and leave other sports' rows alone
    // (D-06); the full search replaces everything and purges older batches.
    if (scope) await commitPromoSportsRefresh(pendingWrites, now);
    else await commitSpreadsTotalsRefresh(pendingWrites, now);
  } catch (err) {
    refreshError = err;
  } finally {
    // Persist whatever was actually spent, even on a mid-way error -- the
    // shared credit meter must reflect real usage. Never invent a balance
    // (CR-01): carry the prior same-month balance forward less this run's
    // reported spend when no response carried x-requests-remaining; with no
    // known balance at all, skip the row rather than record a fake 0.
    const remainingToRecord =
      lastRemaining ?? (priorRemaining !== null ? Math.max(0, priorRemaining - refreshCost) : null);
    const usedToRecord = lastUsed ?? (priorUsed !== null ? priorUsed + refreshCost : 0);
    if (quotaCaptured && remainingToRecord !== null) {
      try {
        await recordCreditUsage({
          requestsRemaining: remainingToRecord,
          requestsUsed: usedToRecord,
          refreshCost,
          // The run's in-season sport count, not how many fetches
          // finished: status.ts derives every credit estimate from this,
          // and a partial run's count would under-state the next run's
          // cost (01.1 review WR-03). Equal to sports fetched on success.
          // A promo run records the FULL in-season count too (not its
          // narrower promo-sport count), or the next full refresh's
          // estimate would be understated (quick-261001-jbc).
          sportsFetched: inSeason.length,
          recordedAt: now,
          triggeredByUserId: opts.triggeredByUserId ?? null,
        });
      } catch {
        // Best-effort: a credit-recording failure must not mask the
        // original success/error outcome below.
      }
    }
  }

  if (refreshError) {
    return { status: "error", message: safeMessage(refreshError, scoped) };
  }

  return {
    status: "ok",
    fetchedAt: now.toISOString(),
    sportsFetched,
    creditsSpent: refreshCost,
    remaining: lastRemaining,
    altLines,
  };
}
