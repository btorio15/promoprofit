import type { ReactNode } from "react";
import type { PairLegDTO, PairRowDTO, PairTopUpLegDTO } from "@/domain/promos/pairRowDto";
import { formatAmerican, formatPct, formatUsd } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PairDetailsProps {
  row: PairRowDTO;
  /** Slot where Plan 07 places the Mark pair done control. */
  actions?: ReactNode;
}

function Step({ n, leg }: { n: number; leg: PairLegDTO }) {
  return (
    <li className="flex gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-sm text-muted-foreground">
        {n}
      </span>
      <span className="text-base">
        Bet <span className="num">{formatUsd(leg.stake)}</span> at {leg.bookName} on {leg.selectionLabel} at{" "}
        <span className="num">{formatAmerican(leg.oddsAmerican)}</span>.
      </span>
    </li>
  );
}

function TopUpStep({ n, leg }: { n: number; leg: PairTopUpLegDTO }) {
  return (
    <li className="flex gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-sm text-muted-foreground">
        {n}
      </span>
      <span className="text-base">
        Bet <span className="num">{formatUsd(leg.stake)}</span> at {leg.bookName} on {leg.selectionLabel} at{" "}
        <span className="num">{formatAmerican(leg.oddsAmerican)}</span> (ordinary bet, no promo).
      </span>
    </li>
  );
}

function TopUpRow({ leg }: { leg: PairTopUpLegDTO }) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground">+ ordinary bet at {leg.bookName}</TableCell>
      <TableCell className="num text-right">{formatUsd(leg.stake)}</TableCell>
      <TableCell className="num text-right">{formatUsd(leg.payout)}</TableCell>
      <TableCell className="text-right text-muted-foreground">included above</TableCell>
    </TableRow>
  );
}

/**
 * Expanded pair panel: profit restated at Display size, numbered steps for
 * both bets, a per-outcome payout table, cap and bonus-bet notes. Net profit
 * is shown for each outcome; a worst-case note appears only when the two
 * outcomes differ.
 */
export function PairDetails({ row, actions }: PairDetailsProps) {
  const notes = [row.legA, row.legB].flatMap((leg) => [leg.capNote, leg.bonusNote]).filter((n): n is string => n !== null);
  const legC = row.legC ?? null;
  if (legC) notes.push(legC.note);
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Guaranteed profit</span>
        <span className="num text-4xl font-semibold text-primary">{formatUsd(row.guaranteedProfit)}</span>
        <span className="text-sm text-muted-foreground">
          <span className="num">{formatPct(row.roiPct)}</span> {row.rateLabel} on{" "}
          <span className="num">{formatUsd(row.totalStaked)}</span> of your own cash
        </span>
        {notes.map((note) => (
          <span key={note} className="text-sm text-muted-foreground">
            {note}
          </span>
        ))}

        <ol className="mt-4 flex flex-col gap-2">
          <Step n={1} leg={row.legA} />
          <Step n={2} leg={row.legB} />
          {legC ? <TopUpStep n={3} leg={legC} /> : null}
        </ol>
        {actions ? <div className="mt-4">{actions}</div> : null}
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
              <TableCell>{row.legA.selectionLabel} wins</TableCell>
              <TableCell className="num text-right">{formatUsd(row.legA.stake)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.legA.payout)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.netIfAWins)}</TableCell>
            </TableRow>
            {legC?.side === "A" ? <TopUpRow leg={legC} /> : null}
            <TableRow>
              <TableCell>{row.legB.selectionLabel} wins</TableCell>
              <TableCell className="num text-right">{formatUsd(row.legB.stake)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.legB.payout)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.netIfBWins)}</TableCell>
            </TableRow>
            {legC?.side === "B" ? <TopUpRow leg={legC} /> : null}
          </TableBody>
        </Table>
        {row.worstCase ? (
          <p className="border-t border-border p-3 text-sm text-muted-foreground">
            The two outcomes differ slightly because of rounding or a cap, so your guaranteed profit is the lower
            figure.
          </p>
        ) : null}
      </div>
    </div>
  );
}
