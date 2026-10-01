import { getSportLabel } from "@/config/sports";
import type { PromoRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import type { OddsStatus } from "@/ingestion/odds/status";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";
import { describeAltLinesNotes, type SearchBanner } from "@/components/arb/spreadsTotalsSearch";

/**
 * quick-261001-jbc: the pure logic behind the status bar's "Refresh promos".
 * No import of the "use server" action: callers pass it in (same shape as
 * spreadsTotalsSearch.ts), so this stays testable without the DB or the
 * Odds API.
 */
export type PromoRefreshAction = (input: { confirmed: boolean }) => Promise<PromoRefreshOutcome>;

export interface PromoRefreshConfirmState {
  sportKeys: string[];
  estimatedCredits: number;
  remaining: number | null;
}

/**
 * "start" = the button press (unconfirmed: the server answers
 * confirm_required or no_promos); "confirm" = the dialog's action (the only
 * credit-spending call). A throwing action becomes the plain error outcome.
 */
export async function runPromoRefresh(
  action: PromoRefreshAction,
  step: "start" | "confirm",
): Promise<PromoRefreshOutcome> {
  const call = await safeAction(() => action({ confirmed: step === "confirm" }), "refreshPromos");
  return call.ok ? call.value : { status: "error", message: ACTION_FAILED_MESSAGE };
}

export interface PromoRefreshReduction {
  confirm: PromoRefreshConfirmState | null;
  banner: SearchBanner | null;
  /** router.refresh() so the credit meter / status bar re-read. */
  refreshPage: boolean;
  /** Tell AppShell to recompute Promos, Opportunities and Arbitrage in place. */
  recompute: boolean;
}

function joinLabels(sportKeys: readonly string[]): string {
  return sportKeys.map(getSportLabel).join(", ");
}

export function reducePromoRefreshOutcome(outcome: PromoRefreshOutcome): PromoRefreshReduction {
  if (outcome.status === "ok") {
    const headline = `Updated odds for ${joinLabels(outcome.sportsFetched)} (${outcome.creditsSpent} ${
      outcome.creditsSpent === 1 ? "credit" : "credits"
    }). Other sports keep their earlier prices.`;
    const notes = describeAltLinesNotes(outcome.altLines);
    return {
      confirm: null,
      banner: { kind: "info", message: [headline, ...notes].join(" ") },
      refreshPage: true,
      recompute: true,
    };
  }

  if (outcome.status === "confirm_required") {
    return {
      confirm: {
        sportKeys: outcome.sportKeys,
        estimatedCredits: outcome.estimatedCredits,
        remaining: outcome.remaining,
      },
      banner: null,
      refreshPage: false,
      recompute: false,
    };
  }

  if (outcome.status === "no_promos") {
    return {
      confirm: null,
      banner: { kind: "info", message: outcome.message },
      refreshPage: false,
      recompute: false,
    };
  }

  if (outcome.status === "blocked") {
    return {
      confirm: null,
      banner: {
        kind: "blocked",
        message: `Only ${outcome.remaining} credits left — not enough to refresh promo odds. It's disabled until next month's reset (1st).`,
      },
      refreshPage: false,
      recompute: false,
    };
  }

  // error/busy: an error can come after some sports were already fetched
  // (credits spent and recorded server-side), and busy means another
  // refresh is mid-flight -- re-read the page so the credit meter reflects
  // the real balance. The caches themselves are unchanged on error.
  return {
    confirm: null,
    banner: { kind: outcome.status, message: outcome.message },
    refreshPage: true,
    recompute: false,
  };
}

/** D-04 dialog line. The cost is an estimate ("about"), never a promise. */
export function describePromoRefreshConfirm(
  sportKeys: readonly string[],
  estimatedCredits: number,
  remaining: number | null,
): string {
  const head = `Refresh promos for ${joinLabels(sportKeys)} — about ${estimatedCredits} credits`;
  return remaining === null
    ? `${head}. Your credit balance appears after the first refresh.`
    : `${head} (${remaining} left).`;
}

export function isPromoRefreshDisabled(status: Pick<OddsStatus, "level">, pending: boolean): boolean {
  return status.level === "blocked" || pending;
}
