"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getPromos } from "@/app/actions/get-promos";
import type { GetPromosResponse } from "@/domain/promos/dto";
import { STORAGE_KEYS, usePersistentString } from "@/lib/persistentState";
import { Skeleton } from "@/components/ui/skeleton";
import { RiskAdvisory } from "@/components/RiskAdvisory";
import { ScrapeStatusPanel } from "./ScrapeStatusPanel";
import { PromosEmptyState } from "./PromosEmptyState";
import { PromoRow } from "./PromoRow";

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
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);
  const isFirstRecompute = useRef(true);

  function runGetPromos() {
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      const result = await getPromos({ precision });
      if (requestId !== requestIdRef.current) return; // stale response, out of order
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

      {showSkeleton ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : response?.status === "ok" && response.emptyVariant !== null ? (
        <PromosEmptyState variant={response.emptyVariant} />
      ) : response?.status === "ok" && response.rows.length > 0 ? (
        <>
          <RiskAdvisory />
          <div className="flex flex-col gap-2">
            {response.rows.map((row) => (
              <PromoRow key={row.rowKey} row={row} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
