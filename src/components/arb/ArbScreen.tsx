"use client";

import type { OddsStatus } from "@/ingestion/odds/status";
import { ArbForm } from "./ArbForm";

export interface ArbScreenProps {
  status: OddsStatus;
  hasCachedOdds: boolean;
  recomputeKey: number;
  onSearched: () => void;
}

/**
 * Arbitrage tab panel: header + ArbForm (SC1-SC3). Composed inside
 * AppShell's TabsContent alongside FinderScreen -- both panels share one
 * status bar/credit banner above the top-level tabs (D-09).
 */
export function ArbScreen({ status, hasCachedOdds, recomputeKey, onSearched }: ArbScreenProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Arbitrage</h1>
        <p className="text-sm text-muted-foreground">
          Cross-book sure bets from cached Colorado odds — no promos involved.
        </p>
      </header>
      <ArbForm
        status={status}
        hasCachedOdds={hasCachedOdds}
        recomputeKey={recomputeKey}
        onSearched={onSearched}
      />
    </div>
  );
}
