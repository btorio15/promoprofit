"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getPromos } from "@/app/actions/get-promos";
import type { GetPromosResponse } from "@/domain/promos/dto";
import { STORAGE_KEYS, usePersistentString } from "@/lib/persistentState";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RiskAdvisory } from "@/components/RiskAdvisory";
import { ScrapeStatusPanel } from "./ScrapeStatusPanel";
import { ReviewQueueSection } from "./ReviewQueueSection";
import { PromosEmptyState } from "./PromosEmptyState";
import { ProfitSummary } from "./ProfitSummary";
import { PromoRow } from "./PromoRow";
import { UnprofitablePromoRow } from "./UnprofitablePromoRow";

export interface PromosScreenProps {
  /** Reserved for Plan 04's "no-odds" empty-state gating; unused until that plan wires odds-dependent hedge math. */
  hasCachedOdds: boolean;
  /** Bumped by AppShell after a refresh (SC1/SC2 parity with the other two tabs). */
  recomputeKey: number;
}

/**
 * Promos tab panel (D-01, D-08). Precision is read-only here -- it follows
 * the Arbitrage tab's persisted setting (STORAGE_KEYS.arbPrecision, D-05)
 * rather than exposing its own toggle; Plan 04+ uses it for hedge math.
 * Fetches getPromos on mount, on precision change, and on recomputeKey
 * change, mirroring ArbForm.tsx's requestId stale-response guard.
 */
export function PromosScreen({ recomputeKey }: PromosScreenProps) {
  const [precisionStored] = usePersistentString(STORAGE_KEYS.arbPrecision, "whole");
  const precision: "whole" | "cents" = precisionStored === "cents" ? "cents" : "whole";

  const [response, setResponse] = useState<GetPromosResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const isFirstRecompute = useRef(true);

  function runGetPromos() {
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      // WR-10: a thrown getPromos (DB/network error) must never leave a
      // blank tab or silently keep stale rows the member might act on --
      // clear them and show an inline error with a retry.
      let result: GetPromosResponse;
      try {
        result = await getPromos({ precision });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error("getPromos failed:", err);
        setResponse(null);
        setLoadFailed(true);
        return;
      }
      if (requestId !== requestIdRef.current) return; // stale response, out of order
      setLoadFailed(false);
      setResponse(result);
    });
  }

  // Auto-fetch on mount and whenever precision changes (follows the
  // Arbitrage tab's persisted setting -- no submit step, no debounce needed
  // since there's no free-text input here).
  useEffect(() => {
    runGetPromos();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on precision itself
  }, [precision]);

  // recomputeKey fires after a refresh (never on initial mount, since the
  // first run is swallowed) -- silently re-run so this tab stays in sync
  // with the other two after odds change.
  useEffect(() => {
    if (isFirstRecompute.current) {
      isFirstRecompute.current = false;
      return;
    }
    runGetPromos();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only recomputeKey should re-trigger this
  }, [recomputeKey]);

  const showSkeleton = isPending && response === null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Promos</h1>
        <p className="text-sm text-muted-foreground">
          Active promo hedges from scraped Colorado sportsbook offers.
        </p>
      </header>

      {response?.status === "ok" ? <ScrapeStatusPanel scrapeStatus={response.scrapeStatus} /> : null}

      {/* quick-260927-n12: shown in EVERY "ok" state, including every
          empty-state variant, so the headline/period numbers never
          disappear just because the live feed is momentarily empty. */}
      {response?.status === "ok" ? (
        <ProfitSummary totalProfit={response.totalProfit} availableProfit={response.availableProfit} />
      ) : null}

      {response?.status === "ok" ? (
        <ReviewQueueSection
          queue={response.queue}
          correctionOptions={response.correctionOptions}
          onChanged={runGetPromos}
        />
      ) : null}

      {showSkeleton ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : loadFailed && !isPending ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Couldn&apos;t load promos. Try again in a moment.</span>
            <Button type="button" variant="secondary" size="sm" onClick={runGetPromos}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : response?.status === "ok" && response.emptyVariant !== null ? (
        <PromosEmptyState variant={response.emptyVariant} />
      ) : response?.status === "ok" && (response.rows.length > 0 || response.unprofitableRows.length > 0) ? (
        <>
          <RiskAdvisory />
          <div className="flex flex-col gap-2">
            {response.rows.map((row) => (
              <PromoRow key={row.rowKey} row={row} onChanged={runGetPromos} />
            ))}
            {response.unprofitableRows.map((row) => (
              <UnprofitablePromoRow key={row.rowKey} row={row} onChanged={runGetPromos} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
