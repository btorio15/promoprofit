"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { OddsStatus } from "@/ingestion/odds/status";
import { describeOddsAge } from "./oddsAge";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";

const AGE_TICK_MS = 60_000;

export interface OddsStatusBarProps {
  status: OddsStatus;
}

const LEVEL_INDICATOR_CLASS: Record<OddsStatus["level"], string> = {
  unknown: "bg-primary",
  normal: "bg-primary",
  warning: "bg-warning",
  blocked: "bg-destructive",
};

/**
 * Sticky odds-age + credit-meter status bar (ODDS-02/ODDS-03, D-11/D-12).
 * The 60s timer only recomputes the age label from the already-loaded
 * `status.oddsFetchedAt` timestamp -- it never fetches or calls an action
 * (ODDS-01: no polling, T-01-20).
 */
export function OddsStatusBar({ status }: OddsStatusBarProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), AGE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const fetchedAt = status.oddsFetchedAt ? new Date(status.oddsFetchedAt) : null;
  const age = describeOddsAge(fetchedAt, new Date());

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-secondary px-4 py-3">
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            {age.stale ? (
              <span className="inline-flex items-center gap-1.5 text-warning">
                <TriangleAlert className="size-4" aria-hidden="true" />
                {age.label} — <span className="font-semibold">Refresh before betting</span>
              </span>
            ) : (
              <span className="text-muted-foreground">{age.label}</span>
            )}
          </p>
        </div>

        {status.level === "unknown" ? (
          <p className="text-sm text-muted-foreground">
            Credit balance appears after the first refresh
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
    </div>
  );
}
