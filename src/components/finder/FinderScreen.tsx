import { FinderForm } from "./FinderForm";

export interface FinderScreenProps {
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
  recomputeKey: number;
}

/**
 * Bonus bets tab panel: header + FinderForm only. The sticky status bar,
 * credit banner, and top-level tabs now live in AppShell, shared with the
 * Arbitrage tab (D-09) -- this component owns no page-shell chrome anymore.
 */
export function FinderScreen({ bonusBooks, hasCachedOdds, recomputeKey }: FinderScreenProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Bonus bet finder</h1>
        <p className="text-sm text-muted-foreground">
          Find the best market to convert a bonus bet, and the best Colorado
          book to hedge it at.
        </p>
      </header>
      <FinderForm
        bonusBooks={bonusBooks}
        hasCachedOdds={hasCachedOdds}
        recomputeKey={recomputeKey}
      />
    </div>
  );
}
