"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { findArbs } from "@/app/actions/find-arbs";
import { refreshSpreadsTotals } from "@/app/actions/refresh-spreads-totals";
import { ArbInputSchema, type ArbInput } from "@/domain/arb/arbInput";
import type { FindArbsResponse } from "@/domain/arb/types";
import type { ExtendedRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import type { OddsStatus } from "@/ingestion/odds/status";
import { STORAGE_KEYS, usePersistentString } from "@/lib/persistentState";
import { RiskAdvisory } from "@/components/RiskAdvisory";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArbEmptyState } from "./ArbEmptyState";
import { ArbResultsList } from "./ArbResultsList";
import { SearchSpreadsTotalsDialog } from "./SearchSpreadsTotalsDialog";

const DEBOUNCE_MS = 300;

export interface ArbFormProps {
  status: OddsStatus;
  hasCachedOdds: boolean;
  /** Bumped by AppShell after a refresh or a successful spreads/totals search (SC1/SC2). */
  recomputeKey: number;
  /** Called after a successful "Search spreads & totals" so AppShell bumps recomputeKey for both tabs. */
  onSearched: () => void;
}

interface ConfirmState {
  estimatedCredits: number;
  remaining: number | null;
  minutesSinceLastRefresh: number | null;
}

type SearchBanner = { kind: "blocked" | "busy" | "error"; message: string };

/**
 * Total stake + precision controls, auto-computed moneyline/spread/total arbs
 * (SC1, no submit step), the account-risk advisory (SC3), and the guarded
 * "Search spreads & totals" action with its always-confirmed dialog (SC2,
 * D-13, D-14). Mirrors FinderForm's transition/skeleton idiom but there is
 * no react-hook-form here -- every control auto-fetches on change.
 */
export function ArbForm({ status, hasCachedOdds, recomputeKey, onSearched }: ArbFormProps) {
  const router = useRouter();

  const [totalStake, setTotalStake] = usePersistentString(
    STORAGE_KEYS.arbTotalStake,
    "200.00",
  );
  const [precisionStored, setPrecisionStored] = usePersistentString(
    STORAGE_KEYS.arbPrecision,
    "whole",
  );
  const precision: "whole" | "cents" = precisionStored === "cents" ? "cents" : "whole";

  const [response, setResponse] = useState<FindArbsResponse | null>(null);
  const [serverFieldError, setServerFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const isFirstRecompute = useRef(true);

  const validation = ArbInputSchema.safeParse({ totalStake, precision });
  const clientError = validation.success
    ? null
    : (validation.error.issues[0]?.message ?? "Enter a total stake greater than $0.");
  const fieldError = clientError ?? serverFieldError;

  function runFindArbs(input: ArbInput) {
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      const result = await findArbs(input);
      if (requestId !== requestIdRef.current) return; // stale response, out of order (T-01.1-26)
      if (result.status === "invalid") {
        setServerFieldError(
          result.fieldErrors.totalStake?.[0] ?? "Enter a total stake greater than $0.",
        );
        // Never keep showing stakes computed for a previous total next to
        // a field error (01.1 review WR-02b).
        setResponse(null);
        return;
      }
      setServerFieldError(null);
      setResponse(result);
    });
  }

  // Auto-compute on mount and on every valid change of totalStake/precision
  // (SC1, no submit step), debounced ~300ms so fast typing doesn't call
  // findArbs on every keystroke (T-01.1-26).
  useEffect(() => {
    if (!validation.success) {
      // Invalidate any in-flight request for the previous (valid) stake so
      // its late response can't overwrite the list while the field shows
      // an error (01.1 review WR-02a).
      requestIdRef.current += 1;
      return;
    }
    const timeoutId = window.setTimeout(() => {
      runFindArbs(validation.data);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on the raw inputs, not the derived validation object
  }, [totalStake, precision]);

  // recomputeKey fires after a refresh or a successful spreads/totals search
  // (never on initial mount, since the first run is swallowed) -- silently
  // re-run with the current controls so both tabs recompute together.
  useEffect(() => {
    if (isFirstRecompute.current) {
      isFirstRecompute.current = false;
      return;
    }
    if (!validation.success) return;
    runFindArbs(validation.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only recomputeKey should re-trigger this
  }, [recomputeKey]);

  // "Search spreads & totals" flow (SC2, D-13, D-14).
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [searchPending, startSearchTransition] = useTransition();
  const [searchBanner, setSearchBanner] = useState<SearchBanner | null>(null);

  function handleSearchOutcome(outcome: ExtendedRefreshOutcome) {
    if (outcome.status === "ok") {
      setSearchBanner(null);
      setConfirmState(null);
      router.refresh();
      onSearched();
      return;
    }

    if (outcome.status === "confirm_required") {
      setConfirmState({
        estimatedCredits: outcome.estimatedCredits,
        remaining: outcome.remaining,
        minutesSinceLastRefresh: outcome.minutesSinceLastRefresh,
      });
      return;
    }

    setConfirmState(null);

    if (outcome.status === "blocked") {
      setSearchBanner({
        kind: "blocked",
        message: `Only ${outcome.remaining} credits left — not enough for a spreads & totals search. It's disabled until next month's reset (1st).`,
      });
      return;
    }

    // error/busy: an error can come after some sports were already fetched
    // (credits spent and recorded server-side), and busy means another
    // refresh is mid-flight -- re-read the page so the credit meter and
    // status bar reflect the real balance instead of the pre-search one
    // (01.1 review WR-01). The caches themselves are unchanged on error.
    router.refresh();
    setSearchBanner({ kind: outcome.status, message: outcome.message });
  }

  function startSearch() {
    setSearchBanner(null);
    startSearchTransition(async () => {
      const outcome = await refreshSpreadsTotals({ confirmed: false });
      handleSearchOutcome(outcome);
    });
  }

  const searchDisabled =
    status.level === "blocked" ||
    (status.remaining !== null && status.remaining < status.estimatedExtendedRefreshCredits) ||
    searchPending;

  const hasOkResponse = response?.status === "ok";
  // Results only render for a stake that is currently valid on both the
  // client and the server. Otherwise the field error stands alone: no stale
  // rows for an old total, and no endless skeleton when a persisted stake is
  // invalid and so never triggers a request (01.1 review WR-02).
  const canShowResults = validation.success && serverFieldError === null;
  const showSkeleton = isPending && !hasOkResponse;

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-[1_1_180px]">
            <Label htmlFor="totalStake">Total stake</Label>
            <Input
              id="totalStake"
              inputMode="decimal"
              className="num h-10"
              placeholder="$0.00"
              value={totalStake}
              onChange={(event) => {
                // A server-side rejection applied to the previous value only.
                setServerFieldError(null);
                setTotalStake(event.target.value);
              }}
            />
            {fieldError ? <p className="text-sm text-destructive">{fieldError}</p> : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-[1_1_240px]">
            <Label>Stake precision</Label>
            <ToggleGroup
              value={[precision]}
              onValueChange={(values) => {
                const next = values[0];
                if (next === "whole" || next === "cents") setPrecisionStored(next);
              }}
            >
              <ToggleGroupItem value="whole">Whole dollars</ToggleGroupItem>
              <ToggleGroupItem value="cents">Exact cents</ToggleGroupItem>
            </ToggleGroup>
            <p className="text-sm text-muted-foreground">
              Whole-dollar stakes are the default — precise-cent bets can look like arbing to the
              books. Switch to exact cents for equal profit on both outcomes.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full md:w-auto"
            disabled={searchDisabled}
            onClick={startSearch}
          >
            {searchPending ? "Searching…" : "Search spreads & totals"}
          </Button>
        </div>

        <p className="num text-sm text-muted-foreground">
          Fetches moneylines, spreads, and totals for every in-season sport together — about{" "}
          {status.estimatedExtendedRefreshCredits} credits (~3× a normal refresh).
        </p>

        {status.level === "warning" ? (
          <Alert>
            <AlertDescription className="num text-warning">
              Only {status.remaining} credits remaining this month — searching spreads & totals
              uses about {status.estimatedExtendedRefreshCredits} credits (~3× a refresh).
            </AlertDescription>
          </Alert>
        ) : null}

        {status.level === "blocked" ||
        (status.remaining !== null && status.remaining < status.estimatedExtendedRefreshCredits) ? (
          <Alert variant="destructive">
            <AlertDescription className="num">
              Only {status.remaining} credits left — not enough for a spreads & totals search.
              It&apos;s disabled until next month&apos;s reset (1st).
            </AlertDescription>
          </Alert>
        ) : null}

        {searchBanner?.kind === "blocked" ? (
          <Alert variant="destructive">
            <AlertDescription className="num">{searchBanner.message}</AlertDescription>
          </Alert>
        ) : null}

        {searchBanner && searchBanner.kind !== "blocked" ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{searchBanner.message}</span>
              <Button type="button" variant="secondary" size="sm" onClick={startSearch}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </Card>

      <RiskAdvisory />

      {!canShowResults ? null : showSkeleton || (response === null && hasCachedOdds) ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : response === null ? (
        <ArbEmptyState variant="no-cached-odds" />
      ) : response.status === "no_cached_odds" ? (
        <ArbEmptyState variant="no-cached-odds" />
      ) : response.status === "ok" ? (
        <ArbResultsList response={response} />
      ) : null}

      <SearchSpreadsTotalsDialog
        open={confirmState !== null}
        estimatedCredits={confirmState?.estimatedCredits ?? 0}
        remaining={confirmState?.remaining ?? null}
        minutesSinceLastRefresh={confirmState?.minutesSinceLastRefresh ?? null}
        onCancel={() => setConfirmState(null)}
        onOutcome={handleSearchOutcome}
      />
    </div>
  );
}
