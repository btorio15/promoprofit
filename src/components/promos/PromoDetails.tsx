import type { PromoRowDTO } from "@/domain/promos/dto";
import { formatAmerican, formatPct, formatUsd } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PromoDetailsProps {
  row: PromoRowDTO;
}

/**
 * Expanded row panel (D-02/CALC-03), copying
 * src/components/finder/ResultDetails.tsx's two-column layout: the
 * guaranteed-profit headline restated at Display size, a numbered A/B step
 * list (plus an "Opt in / claim first" step 0 when the promo requires it),
 * and a per-outcome payout table. The promo stake is always shown as text,
 * never an editable input (D-02).
 */
export function PromoDetails({ row }: PromoDetailsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 border-t border-border p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Guaranteed profit</span>
        <span className="num text-4xl font-semibold text-primary">{formatUsd(row.guaranteedProfit)}</span>
        <span className="text-sm text-muted-foreground">
          <span className="num">{formatPct(row.ratePct)}</span> {row.rateLabel}
        </span>
        {row.candidatesEvaluated > 1 ? (
          <span className="text-sm text-muted-foreground">
            Best of {row.candidatesEvaluated} eligible bets in this promo&apos;s scope.
          </span>
        ) : null}
        {row.capNote ? <span className="text-sm text-muted-foreground">{row.capNote}</span> : null}
        {row.addedByYou ? (
          <span className="text-sm text-muted-foreground">You added this promo.</span>
        ) : row.attribution ? (
          <span className="text-sm text-muted-foreground">{row.attribution}</span>
        ) : null}

        <ol className="mt-4 flex flex-col gap-2">
          {row.claimHint ? (
            <li className="flex gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-sm text-muted-foreground">
                0
              </span>
              <span className="text-base">
                Opt in / claim the promo in the {row.promo.bookName} app first.
              </span>
            </li>
          ) : null}
          <li className="flex gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-sm text-muted-foreground">
              A
            </span>
            <span className="text-base">
              Bet <span className="num">{formatUsd(row.promoStake)}</span> on {row.promo.selectionLabel} at{" "}
              {row.promo.bookName} (<span className="num">{formatAmerican(row.promo.oddsAmerican)}</span>)
            </span>
          </li>
          <li className="flex gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-sm text-muted-foreground">
              B
            </span>
            <span className="text-base">
              Bet <span className="num">{formatUsd(row.hedgeStake)}</span> on {row.hedge.selectionLabel} at{" "}
              {row.hedge.bookName} (<span className="num">{formatAmerican(row.hedge.oddsAmerican)}</span>)
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
              <TableCell>{row.promo.selectionLabel} wins</TableCell>
              <TableCell className="num text-right">{formatUsd(row.promoStake)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.promoPayout)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.netIfPromoWins)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{row.hedge.selectionLabel} wins</TableCell>
              <TableCell className="num text-right">{formatUsd(row.hedgeStake)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.hedgePayout)}</TableCell>
              <TableCell className="num text-right">{formatUsd(row.netIfHedgeWins)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
