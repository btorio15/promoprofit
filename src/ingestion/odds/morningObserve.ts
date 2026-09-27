import { runOddsRefresh, type RefreshOutcome } from "./refresh";
import { recordCurrentProfitObservations } from "@/db/promoObservations";
import { isMorningObservationWindow } from "@/domain/promos/morningWindow";

/**
 * quick-260927-n12 (owner scope change B): the once-daily morning job run
 * by scripts/morning-odds-observe.ts (itself run as its own
 * scrape-promos.yml workflow step, gated to the 8am Denver run). Runs the
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
 * the whole day's number.
 */
export type MorningObserveResult =
  | { status: "skipped"; reason: "not-morning-window" | "missing-api-key" }
  | { status: "ran"; refreshOutcome: RefreshOutcome };

export async function runMorningObservation(opts: {
  now?: Date;
  force?: boolean;
  hasApiKey?: boolean;
}): Promise<MorningObserveResult> {
  const now = opts.now ?? new Date();
  const force = opts.force ?? false;
  const hasApiKey = opts.hasApiKey ?? Boolean(process.env.ODDS_API_KEY);

  if (!force && !isMorningObservationWindow(now)) {
    return { status: "skipped", reason: "not-morning-window" };
  }

  if (!hasApiKey) {
    return { status: "skipped", reason: "missing-api-key" };
  }

  const refreshOutcome = await runOddsRefresh({ confirmed: true, triggeredByUserId: null, now });
  await recordCurrentProfitObservations(now);

  return { status: "ran", refreshOutcome };
}
