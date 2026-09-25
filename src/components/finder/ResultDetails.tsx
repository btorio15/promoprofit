import type { FinderResultDTO } from "@/domain/finder/types";
import { formatAmerican, formatPct, formatUsd } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ResultDetailsProps {
  result: FinderResultDTO;
}

/**
 * Expanded row panel (D-07): the guaranteed-profit headline restated at
 * Display size, the two bet steps, and a per-outcome payout table. Every
 * figure comes straight from the DTO's 2-dp strings — no client-side math.
 */
export function ResultDetails({ result }: ResultDetailsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Guaranteed profit</span>
        <span className="num text-4xl font-semibold text-primary">
          {formatUsd(result.guaranteedProfit)}
        </span>
        <span className="text-sm text-muted-foreground">
          <span className="num">{formatPct(result.conversionPct)}</span> conversion of your{" "}
          <span className="num">{formatUsd(result.bonusAmount)}</span> bonus
        </span>

        <ol className="mt-4 flex flex-col gap-2">
          <li className="flex gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-sm text-muted-foreground">
              A
            </span>
            <span className="text-base">
              Bet <span className="num">{formatUsd(result.bonusAmount)}</span> bonus at{" "}
              {result.bonus.bookName} on {result.bonus.team}{" "}
              <span className="num">{formatAmerican(result.bonus.oddsAmerican)}</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-sm text-muted-foreground">
              B
            </span>
            <span className="text-base">
              Bet <span className="num">{formatUsd(result.hedgeStake)}</span> at{" "}
              {result.hedge.bookName} on {result.hedge.team}{" "}
              <span className="num">{formatAmerican(result.hedge.oddsAmerican)}</span>
            </span>
          </li>
        </ol>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Outcome</TableHead>
              <TableHead className="text-right">Stake</TableHead>
              <TableHead className="text-right">Payout</TableHead>
              <TableHead className="text-right">Net profit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{result.bonus.team} win</TableCell>
              <TableCell className="num text-right">
                {formatUsd(result.bonusAmount)} bonus
              </TableCell>
              <TableCell className="num text-right">{formatUsd(result.bonusPayout)}</TableCell>
              <TableCell className="num text-right">
                {formatUsd(result.netIfBonusWins)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{result.hedge.team} win</TableCell>
              <TableCell className="num text-right">{formatUsd(result.hedgeStake)}</TableCell>
              <TableCell className="num text-right">{formatUsd(result.hedgePayout)}</TableCell>
              <TableCell className="num text-right">
                {formatUsd(result.netIfHedgeWins)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
