/**
 * Single guarded refresh path (ODDS-01, ODDS-02, ODDS-04, D-04, D-09, D-15).
 * Callable from the refreshOdds server action or `npm run odds:refresh` --
 * and only from there. This module never triggers itself automatically.
 */
import { fetchSportOdds, listSports } from "./client";
import { estimateRefreshCredits, evaluateRefreshGate, nextMonthlyReset } from "./quota";
import { getLatestCreditUsage, purgeStartedEvents, recordCreditUsage, replaceSportOdds } from "./store";
import { usableOddsBooks } from "@/config/books";
import { SPORT_KEYS } from "@/config/sports";

const FETCH_WINDOW_DAYS = 7;
const MISSING_KEY_MESSAGE = "ODDS_API_KEY is not set";
const GENERIC_FAILURE_MESSAGE = "Couldn't refresh odds: the Odds API didn't respond.";

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
  | { status: "error"; message: string };

function safeMessage(err: unknown): string {
  if (err instanceof Error && err.message === MISSING_KEY_MESSAGE) {
    return MISSING_KEY_MESSAGE;
  }
  // OddsApiError and network errors alike collapse to one fixed, key-free
  // message -- never surface a raw error (which could echo request state).
  return GENERIC_FAILURE_MESSAGE;
}

export async function runOddsRefresh(opts: { confirmed: boolean; now?: Date }): Promise<RefreshOutcome> {
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

  const gate = evaluateRefreshGate({
    remaining: latest?.requestsRemaining ?? null,
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
      });
      await replaceSportOdds(sport.key, events, now);

      sportsFetched.push(sport.key);
      quotaCaptured = true;
      if (quota.last !== null) refreshCost += quota.last;
      lastRemaining = quota.remaining;
      lastUsed = quota.used;
    }
    await purgeStartedEvents(now);
  } catch (err) {
    refreshError = err;
  } finally {
    // Persist whatever was actually spent, even on a mid-way error -- the
    // credit meter must reflect real usage, not just successful refreshes.
    if (quotaCaptured) {
      try {
        await recordCreditUsage({
          requestsRemaining: lastRemaining ?? 0,
          requestsUsed: lastUsed ?? 0,
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
