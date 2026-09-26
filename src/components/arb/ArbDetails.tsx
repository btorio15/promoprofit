import type { ArbResultDTO } from "@/domain/arb/types";
import { formatAmerican, formatPct, formatUsd } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ArbDetailsProps {
  result: ArbResultDTO;
}

/**
 * Expanded arb row panel (D-02, D-10): the guaranteed-profit headline
 * restated at Display size, the Leg A / Leg B bet steps, and a
 * per-outcome payout table. Every figure comes straight from the DTO's
 * 2-dp strings — no client-side math. When whole-dollar rounding makes the
 * two outcomes' net profit differ, the headline shows the lower value with
 * a worst-case label; the table still shows both exact net-profit values.
 */
export function ArbDetails({ result }: ArbDetailsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">
          {result.worstCase ? "Guaranteed profit (worst case)" : "Guaranteed profit"}
        </span>
        <span className="num text-4xl font-semibold text-primary">
          {formatUsd(result.guaranteedProfit)}
        </span>
        <span className="text-sm text-muted-foreground">
          <span className="num">{formatPct(result.returnPct)}</span> return on{" "}
          <span className="num">{formatUsd(result.totalLaid)}</span> staked
        </span>

        <ol className="mt-4 flex flex-col gap-2">
          <li className="flex gap-2">
            <span className="flex h-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary px-2 text-sm text-muted-foreground">
              Leg A
            </span>
            <span className="text-base">
              Bet <span className="num">{formatUsd(result.stakeA)}</span> at{" "}
              {result.sideA.bookName} on {result.sideA.selection}{" "}
              <span className="num">{formatAmerican(result.sideA.oddsAmerican)}</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex h-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary px-2 text-sm text-muted-foreground">
              Leg B
            </span>
            <span className="text-base">
              Bet <span className="num">{formatUsd(result.stakeB)}</span> at{" "}
              {result.sideB.bookName} on {result.sideB.selection}{" "}
              <span className="num">{formatAmerican(result.sideB.oddsAmerican)}</span>
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
              <TableCell>{result.sideA.selection} wins</TableCell>
              <TableCell className="num text-right">{formatUsd(result.stakeA)}</TableCell>
              <TableCell className="num text-right">{formatUsd(result.payoutA)}</TableCell>
              <TableCell className="num text-right">{formatUsd(result.netIfAWins)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{result.sideB.selection} wins</TableCell>
              <TableCell className="num text-right">{formatUsd(result.stakeB)}</TableCell>
              <TableCell className="num text-right">{formatUsd(result.payoutB)}</TableCell>
              <TableCell className="num text-right">{formatUsd(result.netIfBWins)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
