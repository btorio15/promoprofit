import type { AltLinesOutcome, ExtendedRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import type { OddsStatus } from "@/ingestion/odds/status";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

/**
 * quick-261001-e1j: the pure logic behind "Search spreads & totals" /
 * "Refresh spreads, totals & alt lines", shared by the Arbitrage tab and the
 * status bar (moved out of ArbForm unchanged). No import of the "use server"
 * action: callers pass it in, so this stays testable without the DB or the
 * Odds API.
 */
export type SpreadsTotalsAction = (input: { confirmed: boolean }) => Promise<ExtendedRefreshOutcome>;

export interface SearchConfirmState {
  estimatedCredits: number;
  remaining: number | null;
  minutesSinceLastRefresh: number | null;
}

export type SearchBanner = { kind: "blocked" | "busy" | "error" | "info"; message: string };

/**
 * "start" = the button press (unconfirmed: the server always answers
 * confirm_required); "confirm" = the dialog's "Search anyway" (the only
 * credit-spending call). A throwing action becomes the plain error outcome.
 */
export async function runSpreadsTotalsSearch(
  action: SpreadsTotalsAction,
  step: "start" | "confirm",
): Promise<ExtendedRefreshOutcome> {
  const call = await safeAction(() => action({ confirmed: step === "confirm" }), "refreshSpreadsTotals");
  return call.ok ? call.value : { status: "error", message: ACTION_FAILED_MESSAGE };
}

export interface SearchReduction {
  confirm: SearchConfirmState | null;
  banner: SearchBanner | null;
  /** router.refresh() so the credit meter / status bar re-read. */
  refreshPage: boolean;
  /** Tell AppShell to recompute Promos, Opportunities and Arbitrage in place. */
  recompute: boolean;
}

/**
 * quick-261001-jbc: the alt-lines notes shown after a successful refresh,
 * shared by the Arbitrage search and the status bar's "Refresh promos".
 */
export function describeAltLinesNotes(alt: AltLinesOutcome): string[] {
  const notes: string[] = [];
  if (alt.skippedOverLimit > 0) {
    notes.push(
      `Alternate lines were fetched for ${alt.fetched} ${alt.fetched === 1 ? "game" : "games"} with a promo; ${alt.skippedOverLimit} more ${alt.skippedOverLimit === 1 ? "was" : "were"} skipped (limit is 5 per search).`,
    );
  }
  if (alt.skippedForCredits) {
    notes.push("Alternate lines for promo games were skipped to save credits — your balance is low.");
  }
  if (alt.failed > 0) {
    notes.push(
      `Alternate lines couldn't be loaded for ${alt.failed} ${alt.failed === 1 ? "game" : "games"} with a promo.`,
    );
  }
  if (alt.unmatchedOutcomes > 0) {
    notes.push(
      `${alt.unmatchedOutcomes} alternate-line ${alt.unmatchedOutcomes === 1 ? "price" : "prices"} used team names we couldn't match, so they were ignored.`,
    );
  }
  return notes;
}

export function reduceSearchOutcome(outcome: ExtendedRefreshOutcome): SearchReduction {
  if (outcome.status === "ok") {
    const notes = describeAltLinesNotes(outcome.altLines);
    return {
      confirm: null,
      banner: notes.length > 0 ? { kind: "info", message: notes.join(" ") } : null,
      refreshPage: true,
      recompute: true,
    };
  }

  if (outcome.status === "confirm_required") {
    return {
      confirm: {
        estimatedCredits: outcome.estimatedCredits,
        remaining: outcome.remaining,
        minutesSinceLastRefresh: outcome.minutesSinceLastRefresh,
      },
      banner: null,
      refreshPage: false,
      recompute: false,
    };
  }

  if (outcome.status === "blocked") {
    return {
      confirm: null,
      banner: {
        kind: "blocked",
        message: `Only ${outcome.remaining} credits left — not enough for a spreads & totals search. It's disabled until next month's reset (1st).`,
      },
      refreshPage: false,
      recompute: false,
    };
  }

  // error/busy: an error can come after some sports were already fetched
  // (credits spent and recorded server-side), and busy means another
  // refresh is mid-flight -- re-read the page so the credit meter and
  // status bar reflect the real balance (01.1 review WR-01). The caches
  // themselves are unchanged on error.
  return {
    confirm: null,
    banner: { kind: outcome.status, message: outcome.message },
    refreshPage: true,
    recompute: false,
  };
}

export function isSearchDisabled(
  status: Pick<OddsStatus, "level" | "remaining" | "estimatedExtendedRefreshCredits">,
  pending: boolean,
): boolean {
  return (
    status.level === "blocked" ||
    (status.remaining !== null && status.remaining < status.estimatedExtendedRefreshCredits) ||
    pending
  );
}
