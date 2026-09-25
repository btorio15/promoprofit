import type { FinderResultDTO } from "@/domain/finder/types";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";

interface ResultRowProps {
  result: FinderResultDTO;
}

/**
 * Compact result row (D-07): game/time, bonus side, hedge side,
 * guaranteed profit, conversion %. Mobile stacks inside a card; md+ lays
 * out on a fixed-column grid so figures line up down the results list.
 */
export function ResultRow({ result }: ResultRowProps) {
  return (
    <div className="rounded-lg border border-border bg-secondary">
      <div className="grid min-h-11 grid-cols-1 gap-3 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px] md:items-center md:gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base">
            {result.awayTeam} @ {result.homeTeam}
          </span>
          <span className="text-sm text-muted-foreground">
            {result.sportLabel} · {formatKickoff(result.commenceTime)}
          </span>
        </div>

        <div className="flex min-w-0 flex-col text-base">
          <span className="text-sm text-muted-foreground md:hidden">Bonus</span>
          <span className="flex flex-wrap items-center gap-2">
            {result.bonus.team} <span className="num">{formatAmerican(result.bonus.oddsAmerican)}</span>
          </span>
          <span className="text-sm text-muted-foreground">{result.bonus.bookName}</span>
        </div>

        <div className="flex min-w-0 flex-col text-base">
          <span className="text-sm text-muted-foreground md:hidden">Hedge</span>
          <span className="flex flex-wrap items-center gap-2">
            {result.hedge.team} <span className="num">{formatAmerican(result.hedge.oddsAmerican)}</span>
          </span>
          <span className="text-sm text-muted-foreground">{result.hedge.bookName}</span>
        </div>

        <span className="num text-xl font-semibold text-primary md:text-right">
          {formatUsd(result.guaranteedProfit)}
        </span>

        <span className="flex flex-col md:items-end">
          <span className="num text-base">{formatPct(result.conversionPct)}</span>
          <span className="text-sm text-muted-foreground">Conversion</span>
        </span>
      </div>
    </div>
  );
}
