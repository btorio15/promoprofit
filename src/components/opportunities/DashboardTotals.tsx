"use client";

import type { DashboardTotalsDTO } from "@/domain/promos/dashboardTotals";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProfitSeriesDTO } from "@/domain/promos/profitSeries";
import { TOTALS_LOAD_ERROR, buildTotalsView } from "./dashboardTotalsView";

const SHELL = "flex flex-col gap-3 rounded-lg border border-border bg-secondary p-3 sm:p-4";

const VALUE_CLASS = {
  extracted: "num text-lg font-semibold text-primary",
  available: "num text-lg font-semibold text-muted-foreground",
  muted: "text-sm font-normal text-muted-foreground",
} as const;

/**
 * Dashboard totals card (Phase 7, D-06..D-08). Thin: renders buildTotalsView.
 * Always visible (not tied to the graph's hide toggle) and also when the feed
 * is empty, including an error state when the load fails (07-REVIEW IN-04).
 */
export function DashboardTotals({
  loading,
  dashboard,
  loadFailed,
  seriesStatus,
}: {
  loading: boolean;
  dashboard: DashboardTotalsDTO | null;
  loadFailed: boolean;
  seriesStatus: ProfitSeriesDTO["status"] | null;
}) {
  if (loading) {
    return (
      <section aria-label="Your totals" aria-busy="true" className={SHELL}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-x-8">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="border-t border-border pt-3">
          <Skeleton className="h-5 w-3/4" />
        </div>
      </section>
    );
  }
  if (dashboard === null) {
    if (!loadFailed) return null;
    return (
      <section aria-label="Your totals" className={SHELL}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{TOTALS_LOAD_ERROR.heading}</span>
          <span className="text-sm text-muted-foreground">{TOTALS_LOAD_ERROR.body}</span>
        </div>
      </section>
    );
  }

  const view = buildTotalsView(dashboard, { seriesStatus: seriesStatus ?? undefined });
  const counts = view.counts;

  return (
    <section aria-label="Your totals" className={SHELL}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 sm:gap-x-8">
        {view.cells.map((cell) => (
          <div key={cell.label} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground sm:text-sm">{cell.label}</span>
            <span className={VALUE_CLASS[cell.tone]}>{cell.value}</span>
            {cell.caption !== null ? <span className="text-xs text-muted-foreground">{cell.caption}</span> : null}
          </div>
        ))}
      </div>
      <p className="flex flex-wrap gap-x-1 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
        {counts.empty ? (
          counts.text
        ) : (
          <>
            <span>{counts.lead}</span>
            {counts.average !== null ? (
              <span>
                {" · avg "}
                <span className="num text-foreground">{counts.average}</span>
                {" each"}
              </span>
            ) : null}
            {counts.best ? (
              <>
                <span>
                  {" · best "}
                  <span className="num text-foreground">{counts.best.profit}</span>
                  {" · "}
                </span>
                <span
                  className="min-w-0 max-w-full truncate"
                  title={counts.best.fullName}
                  aria-label={counts.best.fullName}
                >
                  {counts.best.label}
                  {counts.best.fullName.slice(counts.best.label.length)}
                </span>
              </>
            ) : null}
          </>
        )}
      </p>
    </section>
  );
}
