/**
 * Single guarded refresh path (ODDS-01, ODDS-02, ODDS-04, D-04, D-09, D-15).
 * Callable from the refreshOdds server action or `npm run odds:refresh` --
 * and only from there. This module never triggers itself automatically.
 */
import { fetchSportOdds, listSports } from "./client";
import { effectiveRemaining, estimateRefreshCredits, evaluateRefreshGate, nextMonthlyReset } from "./quota";
import { randomUUID } from "node:crypto";
import {
  commitOddsRefresh,
  getLatestCreditUsage,
  recordCreditUsage,
  releaseRefreshLock,
  tryAcquireRefreshLock,
  type SportOddsWrite,
} from "./store";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";

const FETCH_WINDOW_DAYS = 7;
const MISSING_KEY_MESSAGE = "ODDS_API_KEY is not set";
const GENERIC_FAILURE_MESSAGE = "Couldn't refresh odds: the Odds API didn't respond.";
const BUSY_MESSAGE = "Another odds refresh is already running. Try again in a minute.";
/**
 * Upper bound on how long one refresh may hold the server-side lock. A
 * crashed refresh frees the lock after this long; a normal refresh releases
 * it as soon as it finishes.
 */
export const REFRESH_LOCK_TTL_MS = 5 * 60_000;

export type RefreshOutcome =
  | { status: "ok"; fetchedAt: string; sportsFetched: string[]; creditsSpent: number; remaining: number | null }
  | { status: "confirm_required"; minutesSinceLastRefresh: number; estimatedCredits: number }
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
  // OddsApiError and network errors alike collapse to one fixed, key-free
  // message -- never surface a raw error (which could echo request state).
  return GENERIC_FAILURE_MESSAGE;
}

/**
 * Serializes refreshes server-side (WR-03): the gate reads the latest
 * credit_usage row and only writes a new one at the end, so two refreshes
 * started close together (two tabs, two users, UI + CLI) would both pass the
 * 15-minute confirm gate and both spend credits. The lock is taken BEFORE
 * the gate is evaluated and held until the credit row is written.
 */
export async function runOddsRefresh(opts: { confirmed: boolean; now?: Date }): Promise<RefreshOutcome> {
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
    return await runGuardedRefresh(opts);
  } finally {
    try {
      await releaseRefreshLock(holder);
    } catch {
      // Best-effort: the lock expires on its own after REFRESH_LOCK_TTL_MS.
    }
  }
}

async function runGuardedRefresh(opts: { confirmed: boolean; now?: Date }): Promise<RefreshOutcome> {
  const now = opts.now ?? new Date();

  let latest;
  try {
    latest = await getLatestCreditUsage();
  } catch (err) {
    return { status: "error", message: safeMessage(err) };
  }

  let sports;
  try {
    sports = await listSports(); // 0 credits (D-04)
  } catch (err) {
    return { status: "error", message: safeMessage(err) };
  }

  const inSeason = sports.filter((s) => s.active && SPORT_KEYS.includes(s.key));
  const bookKeys = usableOddsBooks().map((b) => b.key); // D-15, never paid_only
  const estimatedCredits = estimateRefreshCredits(inSeason.length, bookKeys.length);

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

  if (gate.action === "confirm") {
    return {
      status: "confirm_required",
      minutesSinceLastRefresh: gate.minutesSinceLastRefresh,
      estimatedCredits: gate.estimatedCredits,
    };
  }

  const commenceTimeFrom = now;
  const commenceTimeTo = new Date(now.getTime() + FETCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const sportsFetched: string[] = [];
  const pendingWrites: SportOddsWrite[] = [];
  let lastRemaining: number | null = null;
  let lastUsed: number | null = null;
  let refreshCost = 0;
  let quotaCaptured = false;
  let refreshError: unknown = null;

  try {
    // Buffer every sport in memory first (01.1 review WR-01). Nothing is
    // written until the whole loop succeeds, so a mid-loop failure leaves
    // the cache exactly as it was instead of moving some sports to this
    // run's timestamp and hiding the rest behind the latest-batch filter.
    for (const sport of inSeason) {
      const { events, quota } = await fetchSportOdds(sport.key, {
        bookmakerKeys: bookKeys,
        commenceTimeFrom,
        commenceTimeTo,
      });

      // Capture the quota as soon as the fetch returns -- the credits are
      // spent at this point, even if the cache commit below fails (WR-02).
      quotaCaptured = true;
      if (quota.last !== null) refreshCost += quota.last;
      // Keep the last value the API actually reported; a response missing
      // the header must not erase an earlier sport's reading.
      if (quota.remaining !== null) lastRemaining = quota.remaining;
      if (quota.used !== null) lastUsed = quota.used;

      pendingWrites.push({ sportKey: sport.key, events });
      sportsFetched.push(sport.key);
    }
    // One transaction: every in-season sport's rows plus the purges of rows
    // this run did not write (out-of-season sports, WR-01) and of started
    // events. All-or-nothing.
    await commitOddsRefresh(pendingWrites, now);
  } catch (err) {
    refreshError = err;
  } finally {
    // Persist whatever was actually spent, even on a mid-way error -- the
    // credit meter must reflect real usage, not just successful refreshes.
    // Never invent a balance (CR-01): if no response carried
    // x-requests-remaining, carry the prior same-month balance forward less
    // the credits this run reported spending. With no known balance at all,
    // skip the row rather than record a fake 0 that would block refresh.
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
