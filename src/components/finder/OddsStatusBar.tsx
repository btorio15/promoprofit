"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { refreshOdds } from "@/app/actions/refresh-odds";
import type { RefreshOutcome } from "@/ingestion/odds/refresh";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";
import type { OddsStatus } from "@/ingestion/odds/status";
import { describeExtendedOddsAge, describeOddsAge, withAttribution } from "./oddsAge";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SpreadsTotalsSearchBanners } from "@/components/arb/SpreadsTotalsSearchBanners";
import { PromoRefreshDialog } from "./PromoRefreshDialog";
import { isPromoRefreshDisabled } from "./promoRefresh";
import { usePromoRefresh } from "./usePromoRefresh";
import { RefreshConfirmDialog } from "./RefreshConfirmDialog";

const AGE_TICK_MS = 60_000;

export interface OddsStatusBarProps {
  status: OddsStatus;
  /** Called after a successful refresh so the finder recomputes (ODDS-04). */
  onRefreshed?: () => void;
  /**
   * Renders a second, tab-conditional line for the spreads/totals cache's
   * age -- only while the Arbitrage tab is active (D-16, SC3). Does not
   * change the moneyline age line, the Refresh odds button, or the credit
   * meter above.
   */
  showExtendedAge?: boolean;
}

const LEVEL_INDICATOR_CLASS: Record<OddsStatus["level"], string> = {
  unknown: "bg-primary",
  normal: "bg-primary",
  warning: "bg-warning",
  blocked: "bg-destructive",
};

interface ConfirmState {
  minutesSinceLastRefresh: number;
  estimatedCredits: number;
}

type RefreshBanner = { kind: "none" } | { kind: "blocked" | "error"; message: string };

/**
 * Sticky odds-age + credit-meter + Refresh odds status bar (ODDS-02/03/04,
 * D-10/D-11/D-12). The 60s age timer only recomputes a label from the
 * already-loaded status.oddsFetchedAt -- it never fetches or calls an
 * action (ODDS-01, T-01-20). The client-side disabled state on the button
 * is UX only; runOddsRefresh re-evaluates the gate server-side on every
 * call (T-01-18).
 */
export function OddsStatusBar({ status, onRefreshed, showExtendedAge = false }: OddsStatusBarProps) {
  const [, setTick] = useState(0);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [banner, setBanner] = useState<RefreshBanner>({ kind: "none" });
  // quick-261001-jbc: "Refresh promos" -- only the sports the member's active
  // promos cover (the Arbitrage tab keeps its own full search).
  const promoRefresh = usePromoRefresh({ onRefreshed: () => onRefreshed?.() });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), AGE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const fetchedAt = status.oddsFetchedAt ? new Date(status.oddsFetchedAt) : null;
  const age = describeOddsAge(fetchedAt, new Date());
  const extendedFetchedAt = status.extendedOddsFetchedAt
    ? new Date(status.extendedOddsFetchedAt)
    : null;
  const extendedAge = describeExtendedOddsAge(extendedFetchedAt, new Date());

  function handleOutcome(outcome: RefreshOutcome) {
    if (outcome.status === "ok") {
      setBanner({ kind: "none" });
      setConfirmState(null);
      router.refresh();
      onRefreshed?.();
      return;
    }

    if (outcome.status === "confirm_required") {
      setConfirmState({
        minutesSinceLastRefresh: outcome.minutesSinceLastRefresh,
        estimatedCredits: outcome.estimatedCredits,
      });
      return;
    }

    setConfirmState(null);

    if (outcome.status === "blocked") {
      setBanner({
        kind: "blocked",
        message:
          outcome.reason === "low_credits"
            ? `Only ${outcome.remaining} credits left — refresh is disabled until next month's reset (1st).`
            : `Refreshing needs about ${outcome.estimatedCredits} credits but only ${outcome.remaining} remain — refresh is disabled until next month's reset (1st).`,
      });
      return;
    }

    if (outcome.status === "busy") {
      // Another tab/user/CLI is mid-refresh (WR-03); the server lock
      // rejected this one before any credits were spent.
      setBanner({ kind: "error", message: outcome.message });
      return;
    }

    // A failed refresh may still have spent (and recorded) credits for the
    // sports fetched before the failure -- re-read the page so the credit
    // meter is current. The cache itself is unchanged (01.1 review WR-01).
    router.refresh();
    setBanner({
      kind: "error",
      message: `Couldn't refresh odds — the Odds API didn't respond. Try again, or keep using the odds cached ${age.minutes ?? 0} min ago below.`,
    });
  }

  function startRefresh() {
    setBanner({ kind: "none" });
    startTransition(async () => {
      const call = await safeAction(() => refreshOdds({ confirmed: false }), "refreshOdds");
      if (!call.ok) {
        setBanner({ kind: "error", message: ACTION_FAILED_MESSAGE });
        return;
      }
      handleOutcome(call.value);
    });
  }

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-secondary px-4 py-3">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm">
              {isPending ? (
                <span className="text-muted-foreground">Refreshing odds…</span>
              ) : age.stale ? (
                <span className="inline-flex items-center gap-1.5 text-warning">
                  <TriangleAlert className="size-4" aria-hidden="true" />
                  {withAttribution(age.label, "Refreshed by", status.oddsRefreshedBy)} —{" "}
                  <span className="font-semibold">Refresh before betting</span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {withAttribution(age.label, "Refreshed by", status.oddsRefreshedBy)}
                </span>
              )}
            </p>

            {showExtendedAge ? (
              <p className="text-sm">
                {extendedAge.stale ? (
                  <span className="inline-flex items-center gap-1.5 text-warning">
                    <TriangleAlert className="size-4" aria-hidden="true" />
                    {withAttribution(extendedAge.label, "Searched by", status.extendedSearchedBy)} —{" "}
                    <span className="font-semibold">may be phantom arbs, refresh before betting</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {withAttribution(extendedAge.label, "Searched by", status.extendedSearchedBy)}
                  </span>
                )}
              </p>
            ) : null}

            {status.level === "unknown" ? (
              <p className="text-sm text-muted-foreground">
                Credit balance appears after the next refresh
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                <Progress
                  value={status.total > 0 ? ((status.remaining ?? 0) / status.total) * 100 : 0}
                  aria-label="Odds API credits remaining this month"
                >
                  <ProgressTrack>
                    <ProgressIndicator className={LEVEL_INDICATOR_CLASS[status.level]} />
                  </ProgressTrack>
                </Progress>
                <p className="num text-sm text-muted-foreground">
                  {status.remaining} of {status.total} credits remaining this month
                </p>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={status.level === "blocked" || isPending || promoRefresh.pending}
              onClick={startRefresh}
            >
              <RefreshCw
                className={isPending ? "size-3.5 animate-spin" : "size-3.5"}
                aria-hidden="true"
              />
              {isPending ? "Refreshing…" : "Refresh odds"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={isPromoRefreshDisabled(status, promoRefresh.pending) || isPending}
              onClick={promoRefresh.startRefresh}
            >
              {promoRefresh.pending ? "Refreshing promos…" : "Refresh promos"}
            </Button>
          </div>
        </div>

        {banner.kind === "blocked" ? (
          <Alert variant="destructive">
            <AlertDescription className="num">{banner.message}</AlertDescription>
          </Alert>
        ) : null}

        {banner.kind === "error" ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{banner.message}</span>
              <Button type="button" variant="secondary" size="sm" onClick={startRefresh}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <SpreadsTotalsSearchBanners banner={promoRefresh.banner} onRetry={promoRefresh.startRefresh} />
      </div>

      <PromoRefreshDialog
        open={promoRefresh.confirmState !== null}
        sportKeys={promoRefresh.confirmState?.sportKeys ?? []}
        estimatedCredits={promoRefresh.confirmState?.estimatedCredits ?? 0}
        remaining={promoRefresh.confirmState?.remaining ?? null}
        onCancel={promoRefresh.cancelConfirm}
        onOutcome={promoRefresh.handleOutcome}
      />

      <RefreshConfirmDialog
        open={confirmState !== null}
        minutesSinceLastRefresh={confirmState?.minutesSinceLastRefresh ?? 0}
        estimatedCredits={confirmState?.estimatedCredits ?? 0}
        onCancel={() => setConfirmState(null)}
        onOutcome={handleOutcome}
      />
    </div>
  );
}
