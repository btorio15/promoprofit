"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { getOpportunities } from "@/app/actions/get-opportunities";
import { pickTop, TOP_N } from "@/domain/opportunities/pick";
import {
  SOURCE_META,
  SOURCE_ORDER,
  type OpportunitiesEmptyVariant,
  type OpportunitiesResponse,
} from "@/domain/opportunities/types";
import { STORAGE_KEYS, usePersistentString } from "@/lib/persistentState";
import { parseSortMode, sortCaption } from "@/lib/sortPreference";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RiskAdvisory } from "@/components/RiskAdvisory";
import { ProfitSummary } from "@/components/promos/ProfitSummary";
import { PromoRow } from "@/components/promos/PromoRow";
import { describeOddsAge, STALE_AFTER_MINUTES } from "@/components/finder/oddsAge";
import { OpportunitySection } from "./OpportunitySection";
import { SortSwitch } from "./SortSwitch";

export interface OpportunitiesScreenProps {
  hasCachedOdds: boolean;
  /** Bumped by AppShell after an odds refresh. */
  recomputeKey: number;
  /** Bumped by AppShell after any Mark done / Undo anywhere, so this screen refetches. */
  promosVersion: number;
  onPromosChanged: () => void;
  onNavigate: (tab: "promos" | "arbitrage") => void;
}

const EMPTY_COPY: Record<Exclude<OpportunitiesEmptyVariant, "no-books">, { heading: string; body: string }> = {
  "no-odds": {
    heading: "No odds cached yet",
    body: "Press Refresh odds to pull current Colorado odds before opportunities can show up.",
  },
  "none-scraped": {
    heading: "No promos scraped yet",
    body: "The scheduled scraper hasn't completed a run yet. Check back after the next scheduled run, or ask the person who set this up to trigger one.",
  },
  "nothing-profitable": {
    heading: "Nothing profitable right now",
    body: "None of the current promos or arbitrage bets at your books guarantee a profit at the latest odds. Check back after new promos appear or odds are refreshed.",
  },
};

function WholeScreenEmpty({ variant }: { variant: OpportunitiesEmptyVariant }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
      {variant === "no-books" ? (
        <>
          <h3 className="text-xl font-semibold">Nothing at your books right now</h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            There are opportunities right now, but none where both bets are at sportsbooks you&apos;ve selected. Add
            more books to see more opportunities.
          </p>
          <div>
            <Button variant="outline" nativeButton={false} render={<Link href="/settings" />}>
              Manage your books
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3 className="text-xl font-semibold">{EMPTY_COPY[variant].heading}</h3>
          <p className="max-w-prose text-sm text-muted-foreground">{EMPTY_COPY[variant].body}</p>
        </>
      )}
    </div>
  );
}

/**
 * Opportunities tab (D-01..D-04, D-13..D-17): the landing screen. Fetches
 * every source's full own-book list once; the Profit/ROI switch re-picks the
 * top 5 on the client without a refetch. Precision follows the Arbitrage
 * tab's persisted setting, same as PromosScreen.
 */
export function OpportunitiesScreen({
  recomputeKey,
  promosVersion,
  onPromosChanged,
  onNavigate,
}: OpportunitiesScreenProps) {
  const [precisionStored] = usePersistentString(STORAGE_KEYS.arbPrecision, "whole");
  const precision: "whole" | "cents" = precisionStored === "cents" ? "cents" : "whole";
  const [sortStored, setSortStored] = usePersistentString(STORAGE_KEYS.sortMode, "profit");
  const sort = parseSortMode(sortStored);

  const [response, setResponse] = useState<OpportunitiesResponse | null>(null);
  const [staleCheckedAt, setStaleCheckedAt] = useState<Date | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const isFirstRecompute = useRef(true);

  function runGetOpportunities() {
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      let result: OpportunitiesResponse;
      try {
        result = await getOpportunities({ precision });
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error("getOpportunities failed:", err);
        setResponse(null);
        setLoadFailed(true);
        return;
      }
      if (requestId !== requestIdRef.current) return;
      setLoadFailed(false);
      setStaleCheckedAt(new Date());
      setResponse(result);
    });
  }

  useEffect(() => {
    runGetOpportunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on precision itself
  }, [precision]);

  // Swallow the first run (mount already fetched); afterwards refetch after
  // an odds refresh or any Mark done / Undo elsewhere.
  useEffect(() => {
    if (isFirstRecompute.current) {
      isFirstRecompute.current = false;
      return;
    }
    runGetOpportunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only these counters should re-trigger this
  }, [recomputeKey, promosVersion]);

  const showSkeleton = isPending && response === null;
  const ok = response?.status === "ok" ? response : null;

  const oldestFetch = ok
    ? [ok.oddsFetchedAt, ok.extendedOddsFetchedAt]
        .filter((v): v is string => v !== null)
        .sort()[0] ?? null
    : null;
  const stale =
    oldestFetch !== null && staleCheckedAt !== null && describeOddsAge(new Date(oldestFetch), staleCheckedAt).stale;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Opportunities</h1>
        <p className="text-sm text-muted-foreground">The best money available right now at your books.</p>
      </header>

      {stale ? (
        <p className="flex items-center gap-2 text-sm text-warning">
          <TriangleAlert className="size-4" aria-hidden="true" />
          Odds are more than {STALE_AFTER_MINUTES / 60} hours old, so these numbers may have moved.
        </p>
      ) : null}

      {ok ? (
        <ProfitSummary
          totalProfit={ok.totals.totalProfit}
          totalExtracted={ok.totals.totalExtracted}
          availableProfit={ok.totals.availableProfit}
        />
      ) : null}

      <SortSwitch value={sort} onChange={setSortStored} />

      {showSkeleton ? (
        <div className="flex flex-col gap-8">
          <Skeleton className="h-24 w-full" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ))}
        </div>
      ) : loadFailed && !isPending ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="font-semibold">Couldn&apos;t load opportunities.</strong> Try again in a moment.
            </span>
            <Button type="button" variant="secondary" size="sm" onClick={runGetOpportunities}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : ok && ok.emptyVariant !== null ? (
        <WholeScreenEmpty variant={ok.emptyVariant} />
      ) : ok ? (
        <>
          <RiskAdvisory />
          {SOURCE_ORDER.map((id) => {
            const source = ok.sources.find((s) => s.id === id);
            if (!source) return null;
            const meta = SOURCE_META[id];
            const seeAll = meta.seeAll;
            switch (source.id) {
              case "promos": {
                const top = pickTop(source.items, sort, TOP_N);
                return (
                  <OpportunitySection
                    key={id}
                    title={meta.title}
                    caption={sortCaption(sort)}
                    seeAll={seeAll ? { label: seeAll.label, onClick: () => onNavigate(seeAll.tab) } : null}
                    emptyCopy={meta.emptyCopy}
                    isEmpty={top.length === 0}
                  >
                    {top.map((item) => (
                      <PromoRow
                        key={item.rowKey}
                        row={item.data}
                        precision={precision}
                        onChanged={onPromosChanged}
                      />
                    ))}
                  </OpportunitySection>
                );
              }
              default: {
                const unreachable: never = source.id;
                return unreachable;
              }
            }
          })}
        </>
      ) : null}
    </div>
  );
}
