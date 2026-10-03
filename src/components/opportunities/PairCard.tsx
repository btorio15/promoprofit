"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { PairLegDTO, PairRowDTO } from "@/domain/promos/pairRowDto";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PriceAgeNote } from "@/components/promos/PriceAgeNote";
import { YourCapField } from "@/components/promos/YourCapField";
import { MarkPairDoneButton } from "./MarkPairDoneButton";
import { PairDetails } from "./PairDetails";

export interface PairCardProps {
  row: PairRowDTO;
  precision: "whole" | "cents";
  onChanged: () => void;
  /** Slot for the expanded panel's actions (Plan 07 puts Mark pair done here). */
  actions?: ReactNode;
}

function LegLine({ leg, tieRisk, idPrefix, onChanged }: { leg: PairLegDTO; tieRisk: boolean; idPrefix: string; onChanged: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border-l-2 border-border pl-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-base">
        <span>{leg.bookName}</span>
        <Badge variant="outline">{leg.promoTypeLabel}</Badge>
        <span>
          {leg.selectionLabel}{" "}
          {leg.promoTypeLabel === "Boost" && leg.baseOddsAmerican != null ? (
            <>
              <span className="num">
                {formatAmerican(leg.baseOddsAmerican)} → {formatAmerican(leg.oddsAmerican)}
              </span>{" "}
              <span className="text-sm text-muted-foreground">boosted</span>
            </>
          ) : (
            <span className="num">{formatAmerican(leg.oddsAmerican)}</span>
          )}
        </span>
        <span className="text-muted-foreground">
          - stake <span className="num text-foreground">{formatUsd(leg.stake)}</span>
        </span>
        {tieRisk ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="outline" className="pointer-events-auto cursor-default">
                  Tie risk
                </Badge>
              }
            />
            <TooltipContent>
              Regular-season NFL games can end in a tie (&lt;1% historically). A tie voids both bets: profit becomes
              $0, no cash loss.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {leg.yourCap ? (
        <YourCapField
          key={leg.yourCap.override ?? "none"}
          idPrefix={idPrefix}
          promoId={leg.promoId}
          promoCap={leg.yourCap.promoCap}
          override={leg.yourCap.override}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  );
}

/**
 * Combined pair card (D-07): two promos on opposite sides of one market as a
 * single expandable card. Uses the PromoRow overlay-trigger idiom: an empty
 * full-card button sits behind pointer-events-none content so taps on the
 * card toggle it while tooltips can opt back in. All text is React text.
 */
export function PairCard({ row, precision, onChanged, actions }: PairCardProps) {
  const markDone = (
    <MarkPairDoneButton
      promoIdA={row.promoIdA}
      promoIdB={row.promoIdB}
      precision={precision}
      expectedGuaranteedProfit={row.guaranteedProfit}
      expectedStakeA={row.legA.stake}
      expectedStakeB={row.legB.stake}
      expectedStakeC={row.legC?.stake}
      onChanged={onChanged}
    />
  );
  return (
    <Collapsible className="group rounded-lg border border-border bg-secondary">
      <div className="relative">
        <CollapsibleTrigger
          aria-label={`Show stakes for ${row.awayTeam} @ ${row.homeTeam} (${row.pairTypeLabel})`}
          className="absolute inset-0 w-full rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="pointer-events-none relative flex min-h-11 w-full flex-col gap-3 p-4 text-left">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {row.sportLabel} · {formatKickoff(row.commenceTime)}
            </span>
            <Badge variant="outline">{row.marketBadge}</Badge>
            <Badge variant="outline">{row.pairTypeLabel}</Badge>
          </div>
          <PriceAgeNote pricesAsOf={row.pricesAsOf} />

          <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_120px_96px_20px] md:gap-4">
            <div className="flex flex-col gap-2 md:contents">
              <LegLine leg={row.legA} tieRisk={row.tieRisk} idPrefix={`pair-${row.rowKey}-cap`} onChanged={onChanged} />
              <LegLine leg={row.legB} tieRisk={false} idPrefix={`pair-${row.rowKey}-cap`} onChanged={onChanged} />
            </div>

            <span className="num text-xl font-semibold text-primary md:text-right">
              {formatUsd(row.guaranteedProfit)}
            </span>

            <span className="flex items-baseline gap-2 md:flex-col md:items-end md:gap-0">
              <span className="num text-base">{formatPct(row.roiPct)}</span>
              <span className="text-sm text-muted-foreground">{row.rateLabel}</span>
            </span>

            <ChevronDown className="hidden size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-open:rotate-180 md:block" />
          </div>

          {row.legC ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-border pl-4 text-base">
              <span>{row.legC.bookName}</span>
              <Badge variant="outline">Ordinary bet</Badge>
              <span>
                {row.legC.selectionLabel} <span className="num">{formatAmerican(row.legC.oddsAmerican)}</span>
              </span>
              <span className="text-muted-foreground">
                - stake <span className="num text-foreground">{formatUsd(row.legC.stake)}</span>
              </span>
            </div>
          ) : null}

          <p className="text-sm text-muted-foreground">
            vs.<span className="num">{formatUsd(row.separateProfitA)}</span> +{" "}
            <span className="num">{formatUsd(row.separateProfitB)}</span> hedging each separately
            <span className="text-foreground">
              {" "}
              · +<span className="num">{formatUsd(row.gain)}</span> more together
            </span>
          </p>
        </div>
      </div>
      <CollapsibleContent>
        <PairDetails
          row={row}
          actions={
            <>
              {markDone}
              {actions}
            </>
          }
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
