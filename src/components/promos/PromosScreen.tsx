"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getPromos } from "@/app/actions/get-promos";
import type { GetPromosResponse } from "@/domain/promos/dto";
import { STORAGE_KEYS, usePersistentString } from "@/lib/persistentState";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RiskAdvisory } from "@/components/RiskAdvisory";
import { SortSwitch } from "@/components/opportunities/SortSwitch";
import { sortByMeasure } from "@/domain/opportunities/pick";
import { parseSortMode } from "@/lib/sortPreference";
import type { PromoRowDTO } from "@/domain/promos/dto";
import { ReviewPanel } from "./ReviewPanel";
import { PromosEmptyState } from "./PromosEmptyState";
import { PromoRow } from "./PromoRow";
import { UnprofitablePromoRow } from "./UnprofitablePromoRow";
import { DonePromoRow } from "./DonePromoRow";

export interface PromosScreenProps {
  /** Reserved for Plan 04's "no-odds" empty-state gating; unused until that plan wires odds-dependent hedge math. */
  hasCachedOdds: boolean;
  /** Bumped by AppShell after a refresh (SC1/SC2 parity with the other two tabs). */
  recomputeKey: number;
  /** Bumped by AppShell after any Mark done / Undo on either tab. */
  promosVersion: number;
  /** Tells AppShell a promo changed so Opportunities refetches too. */
  onPromosChanged: () => void;
  /** Sub-tab lifted to AppShell so "See all promos" can land on Active. */
  view: PromosView;
  onViewChange: (view: PromosView) => void;
  /** Review queue size, for the "Promos (N)" top-level label. */
  onReviewCount: (n: number) => void;
}

export type PromosView = "active" | "done" | "review";

function rankPromoRows(rows: PromoRowDTO[], sort: "profit" | "roi"): PromoRowDTO[] {
  const key = (r: PromoRowDTO) => ({
    rowKey: r.rowKey,
    profit: r.guaranteedProfit,
    pct: r.ratePct,
    pctLabel: r.rateLabel,
    commenceTime: r.commenceTime,
  });
  // D-19: other-book promos stay dimmed and last.
  return [
    ...sortByMeasure(rows.filter((r) => r.hasPromoBook), sort, key),
    ...sortByMeasure(rows.filter((r) => !r.hasPromoBook), sort, key),
  ];
}

/**
 * Promos tab panel (D-01, D-08). Precision is read-only here -- it follows
 * the Arbitrage tab's persisted setting (STORAGE_KEYS.arbPrecision, D-05)
 * rather than exposing its own toggle; Plan 04+ uses it for hedge math.
 * Fetches getPromos on mount, on precision change, and on recomputeKey
 * change, mirroring ArbForm.tsx's requestId stale-response guard.
 */
export function PromosScreen({
  recomputeKey,
  promosVersion,
  onPromosChanged,
  view,
  onViewChange,
  onReviewCount,
}: PromosScreenProps) {
  const [precisionStored] = usePersistentString(STORAGE_KEYS.arbPrecision, "whole");
  const precision: "whole" | "cents" = precisionStored === "cents" ? "cents" : "whole";

  const [response, setResponse] = useState<GetPromosResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sortStored, setSortStored] = usePersistentString(STORAGE_KEYS.sortMode, "profit");
  const sort = parseSortMode(sortStored);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const isFirstRecompute = useRef(true);
  const isFirstVersion = useRef(true);

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

  // promosVersion fires after Mark done / Undo anywhere (never on mount).
  useEffect(() => {
    if (isFirstVersion.current) {
      isFirstVersion.current = false;
      return;
    }
    runGetPromos();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only promosVersion should re-trigger this
  }, [promosVersion]);

  const queueCount = response?.status === "ok" ? response.queue.length : null;
  useEffect(() => {
    if (queueCount !== null) onReviewCount(queueCount);
  }, [queueCount, onReviewCount]);

  // Any row mutation refreshes this tab and tells AppShell to refresh Opportunities.
  function handleChanged() {
    runGetPromos();
    onPromosChanged();
  }

  const showSkeleton = isPending && response === null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Promos</h1>
        <p className="text-sm text-muted-foreground">
          Active promo hedges from scraped Colorado sportsbook offers.
        </p>
      </header>

      <Tabs value={view} onValueChange={(v: string) => onViewChange(v === "done" ? "done" : v === "review" ? "review" : "active")}>
        <TabsList variant="line" aria-label="Show active, done or review promos">
          <TabsTrigger value="active" className="min-h-11">
            Active
          </TabsTrigger>
          <TabsTrigger value="done" className="min-h-11">
            Done
            {response?.status === "ok" ? (
              <>
                {" "}
                <span className="num text-muted-foreground">({response.doneRows.length})</span>
              </>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="review" className="min-h-11">
            Review
            {queueCount !== null && queueCount > 0 ? (
              <>
                {" "}
                <span className="num">({queueCount})</span>
              </>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="flex flex-col gap-8 pt-2">
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
              <SortSwitch value={sort} onChange={setSortStored} />
              <RiskAdvisory />
              <div className="flex flex-col gap-2">
                {rankPromoRows(response.rows, sort).map((row) => (
                  <PromoRow key={row.rowKey} row={row} precision={precision} onChanged={handleChanged} />
                ))}
                {response.unprofitableRows.map((row) => (
                  <UnprofitablePromoRow key={row.rowKey} row={row} precision={precision} onChanged={handleChanged} />
                ))}
              </div>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="done" className="pt-2">
          {response?.status === "ok" && response.doneRows.length > 0 ? (
            <div className="flex flex-col gap-2">
              {response.doneRows.map((row) => (
                <DonePromoRow key={row.rowKey} row={row} onChanged={handleChanged} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing marked done yet. Promos you mark done show here with the profit recorded at that moment.
            </p>
          )}
        </TabsContent>

        <TabsContent value="review" className="pt-2">
          {response?.status === "ok" ? (
            <ReviewPanel
              scrapeStatus={response.scrapeStatus}
              queue={response.queue}
              correctionOptions={response.correctionOptions}
              onChanged={handleChanged}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
