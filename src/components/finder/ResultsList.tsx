import type { FindHedgesResponse } from "@/domain/finder/types";
import { formatUsd } from "@/lib/format";
import { EmptyState } from "./EmptyState";
import { ResultRow } from "./ResultRow";

interface ResultsListProps {
  response: Extract<FindHedgesResponse, { status: "ok" }>;
}

/**
 * Results heading, caption, desktop column header, and ranked rows
 * (D-06). Top 10 results, already ranked by guaranteed profit by the
 * findHedges server action.
 */
export function ResultsList({ response }: ResultsListProps) {
  const { results, bonusAmount, bonusBookName } = response;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Results</h2>
        <p className="text-sm text-muted-foreground">
          Top 10 for a <span className="num">{formatUsd(bonusAmount)}</span>{" "}
          {bonusBookName} bonus bet · ranked by guaranteed profit
        </p>
      </div>

      {results.length === 0 ? (
        <EmptyState variant="no-results" />
      ) : (
        <>
          <div
            className="hidden text-sm text-muted-foreground md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4 md:px-4"
            aria-hidden="true"
          >
            <span>Game</span>
            <span>Bonus side</span>
            <span>Hedge side</span>
            <span className="text-right">Guaranteed profit</span>
            <span className="text-right">Conversion</span>
            <span />
          </div>

          <div className="flex flex-col gap-2">
            {results.map((result) => (
              <ResultRow key={result.eventId} result={result} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
