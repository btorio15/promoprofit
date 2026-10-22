import { configuredOddsKeys, MISSING_KEY_MESSAGE } from "./oddsKeys";
import { runOddsRefresh, type RefreshOutcome } from "./refresh";
import { recordCurrentProfitObservations, recordCurrentProfitSnapshots } from "@/db/promoObservations";
import { listUserIds } from "@/db/queries";
import { loadMemberFeedContext } from "@/db/feedContext";
import { recordMemberFeedObservations } from "@/db/memberFeedRecording";
import { isMorningObservationWindow } from "@/domain/promos/morningWindow";

/**
 * quick-260927-n12 (owner scope change B): the observation job run
 * by scripts/morning-odds-observe.ts (its own step in scrape-promos.yml,
 * run on every scheduled run with --force, not only the 8am one). A failure
 * in a site-wide recorder never skips the member pass. Runs the
 * SAME guarded refresh path as the refreshOdds server action
 * (runOddsRefresh -- keeps the lock, the credit ledger, the low-credit
 * block) with moneyline only (never the 3x-cost spreads/totals extended
 * refresh, to stay inside the 500-credit monthly budget), then records
 * profit observations from whatever odds end up cached -- even when the
 * refresh itself was blocked/busy/errored, since recording still reads
 * from the shared cache the day's earlier scrape/refresh already
 * populated. Both branches (refresh succeeded vs. didn't) must still
 * record: a blocked/failed refresh is exactly why the morning job exists in
 * the first place, and skipping observations on a bad refresh would lose
 * the whole day's number. The same holds when no Odds API key is configured:
 * only the refresh is skipped (logged), the recorders still run (WR-04).
 *
 * Phase 6 D-18: after the group-level recording, a member pass records each
 * member's own feed into member_profit_observations. It reads cached odds
 * only (no extra credits) and applies each member's own books, private
 * promos and Your cap through the shared feed context, then records through
 * recordMemberFeedObservations, the same helper the Dashboard and the Promos
 * tab use. One member failing never stops the others.
 */
export type MorningObserveResult =
  | { status: "skipped"; reason: "not-morning-window" }
  | {
      status: "ran";
      refreshOutcome: RefreshOutcome;
      memberObservations: { recorded: number; failed: number };
    };

export async function recordAllMembersObservations(
  now: Date,
): Promise<{ recorded: number; failed: number }> {
  let ids: number[];
  try {
    ids = await listUserIds();
  } catch (err) {
    console.error("recordAllMembersObservations: could not list users", err);
    return { recorded: 0, failed: 0 };
  }
  let recorded = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      const ctx = await loadMemberFeedContext({ userId: id, precision: "whole", now });
      if (ctx.oddsFetchedAt === null && ctx.extendedOddsFetchedAt === null) continue;
      // THE shared member recording rule (same helper as the Dashboard and
      // the Promos tab), so the scheduled job can never drift from them (WR-03).
      const ok = await recordMemberFeedObservations({
        userId: id,
        now,
        feedPromos: ctx.feedPromos,
        rankOpts: ctx.rankOpts,
        userBookSet: ctx.userBookSet,
      });
      if (ok) {
        recorded++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error("recordAllMembersObservations: member " + id + " failed", err);
      failed++;
    }
  }
  return { recorded, failed };
}

export async function runMorningObservation(opts: {
  now?: Date;
  force?: boolean;
  hasApiKey?: boolean;
}): Promise<MorningObserveResult> {
  const now = opts.now ?? new Date();
  const force = opts.force ?? false;
  const hasApiKey = opts.hasApiKey ?? configuredOddsKeys().length > 0;

  if (!force && !isMorningObservationWindow(now)) {
    return { status: "skipped", reason: "not-morning-window" };
  }

  // WR-04: a missing key skips ONLY the refresh. Every recorder below reads
  // cached odds and needs no key, so the run still records for everyone.
  let refreshOutcome: RefreshOutcome;
  if (hasApiKey) {
    refreshOutcome = await runOddsRefresh({ confirmed: true, triggeredByUserId: null, now });
  } else {
    console.error(
      "runMorningObservation: no Odds API key configured (ODDS_API_KEY / ODDS_API_KEYS); " +
        "skipping the odds refresh and recording from cached odds only",
    );
    refreshOutcome = { status: "error", message: MISSING_KEY_MESSAGE };
  }
  // Each site-wide recorder is isolated so a failure in either can never
  // skip the member pass below (audit W1).
  try {
    await recordCurrentProfitObservations(now);
  } catch (err) {
    console.error("runMorningObservation: group observations failed", err);
  }
  // Stats time series: one snapshot per profitable promo for this run.
  try {
    await recordCurrentProfitSnapshots(now);
  } catch (err) {
    console.error("runMorningObservation: profit snapshots failed", err);
  }

  const memberObservations = await recordAllMembersObservations(now);

  return { status: "ran", refreshOutcome, memberObservations };
}
