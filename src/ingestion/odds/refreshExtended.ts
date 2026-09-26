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
 * sport's cached_odds rows are rewritten with this run's timestamp before
 * any purge runs. The reverse direction remains forbidden -- refresh.ts must
 * never import from this file or reference cached_extended_odds (D-16); this
 * plan does not modify refresh.ts.
 */
import { randomUUID } from "node:crypto";
import { fetchSportOdds, listSports } from "./client";
import { effectiveRemaining, estimateRefreshCredits, evaluateRefreshGate, nextMonthlyReset } from "./quota";
import { REFRESH_LOCK_TTL_MS } from "./refresh";
import {
  getLatestCreditUsage,
  purgeStartedEvents,
  purgeStartedExtendedEvents,
  purgeUnrefreshedEvents,
  purgeUnrefreshedExtendedEvents,
  recordCreditUsage,
  releaseRefreshLock,
  replaceExtendedSportOdds,
  replaceSportOdds,
  tryAcquireRefreshLock,
} from "./store";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";
import type { OddsEvent } from "@/domain/odds/schemas";

const FETCH_WINDOW_DAYS = 7;
const MISSING_KEY_MESSAGE = "ODDS_API_KEY is not set";
const GENERIC_FAILURE_MESSAGE = "Couldn't search spreads & totals: the Odds API didn't respond.";
const BUSY_MESSAGE = "Another odds refresh is already running. Try again in a minute.";

/** h2h + spreads + totals, per SC2/D-13 -- exactly 3x a normal (h2h-only) refresh's market count. */
export const EXTENDED_MARKETS = ["h2h", "spreads", "totals"] as const;

export type ExtendedRefreshOutcome =
  | { status: "ok"; fetchedAt: string; sportsFetched: string[]; creditsSpent: number; remaining: number | null }
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

function safeMessage(err: unknown): string {
  if (err instanceof Error && err.message === MISSING_KEY_MESSAGE) {
    return MISSING_KEY_MESSAGE;
  }
  // Same discipline as refresh.ts's safeMessage: never surface a raw error,
  // which could echo request state (T-01.1-15).
  return GENERIC_FAILURE_MESSAGE;
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
 * Serializes against Refresh odds and the odds:refresh CLI (same refresh_lock
 * row id=1, WR-03): the lock is taken before the gate is evaluated and held
 * until the credit row is written, exactly like runOddsRefresh.
 */
export async function runSpreadsTotalsRefresh(opts: { confirmed: boolean; now?: Date }): Promise<ExtendedRefreshOutcome> {
  const holder = randomUUID();

  let acquired: boolean;
  try {
    acquired = await tryAcquireRefreshLock(holder, REFRESH_LOCK_TTL_MS);
  } catch (err) {
    return { status: "error", message: safeMessage(err) };
  }
  if (!acquired) {
    return { status: "busy", message: BUSY_MESSAGE };
  }

  try {
    return await runGuardedSpreadsTotalsRefresh(opts);
  } finally {
    try {
      await releaseRefreshLock(holder);
    } catch {
      // Best-effort: the lock expires on its own after REFRESH_LOCK_TTL_MS.
    }
  }
}

async function runGuardedSpreadsTotalsRefresh(opts: { confirmed: boolean; now?: Date }): Promise<ExtendedRefreshOutcome> {
  const now = opts.now ?? new Date();

  let latest;
  try {
    latest = await getLatestCreditUsage();
  } catch (err) {
    return { status: "error", message: safeMessage(err) };
  }

  let sports;
  try {
    sports = await listSports(); // 0 credits
  } catch (err) {
    return { status: "error", message: safeMessage(err) };
  }

  const inSeason = sports.filter((s) => s.active && SPORT_KEYS.includes(s.key));
  const bookKeys = usableOddsBooks().map((b) => b.key); // D-15, never paid_only
  const estimatedCredits = estimateRefreshCredits(inSeason.length, bookKeys.length, EXTENDED_MARKETS.length);

  // A row from before the last monthly reset is last month's balance:
  // treat it as unknown so the low-credit block lifts on the 1st (CR-01).
  const priorRemaining = effectiveRemaining(latest, now);
  const priorUsed = priorRemaining === null ? null : (latest?.requestsUsed ?? null);

  const gate = evaluateRefreshGate({
    remaining: priorRemaining,
    lastRefreshAt: latest?.recordedAt ?? null,
    estimatedCredits,
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
    return {
      status: "confirm_required",
      estimatedCredits,
      remaining: priorRemaining,
      minutesSinceLastRefresh: gate.action === "confirm" ? gate.minutesSinceLastRefresh : null,
    };
  }

  const commenceTimeFrom = now;
  const commenceTimeTo = new Date(now.getTime() + FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const sportsFetched: string[] = [];
  let lastRemaining: number | null = null;
  let lastUsed: number | null = null;
  let refreshCost = 0;
  let quotaCaptured = false;
  let refreshError: unknown = null;

  try {
    for (const sport of inSeason) {
      const { events, quota } = await fetchSportOdds(sport.key, {
        bookmakerKeys: bookKeys,
        commenceTimeFrom,
        commenceTimeTo,
        markets: EXTENDED_MARKETS,
      });

      // Capture the quota as soon as the fetch returns -- the credits are
      // spent at this point, even if a cache write below fails (WR-02).
      quotaCaptured = true;
      if (quota.last !== null) refreshCost += quota.last;
      if (quota.remaining !== null) lastRemaining = quota.remaining;
      if (quota.used !== null) lastUsed = quota.used;

      await replaceExtendedSportOdds(sport.key, events, now);
      await replaceSportOdds(sport.key, toH2hOnlyEvents(events), now);
      sportsFetched.push(sport.key);
    }
    // Only reached when every in-season sport was written with this run's
    // timestamp: purge both caches now, extended-table purges first, then
    // the normal-cache purges the h2h projection just wrote (D-16: this is
    // the ONLY call site that purges cached_extended_odds).
    await purgeUnrefreshedExtendedEvents(now);
    await purgeStartedExtendedEvents(now);
    await purgeUnrefreshedEvents(now);
    await purgeStartedEvents(now);
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
          sportsFetched: sportsFetched.length,
          recordedAt: now,
        });
      } catch {
        // Best-effort: a credit-recording failure must not mask the
        // original success/error outcome below.
      }
    }
  }

  if (refreshError) {
    return { status: "error", message: safeMessage(refreshError) };
  }

  return {
    status: "ok",
    fetchedAt: now.toISOString(),
    sportsFetched,
    creditsSpent: refreshCost,
    remaining: lastRemaining,
  };
}
