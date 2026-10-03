"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { unmarkPairDoneAction } from "@/app/actions/mark-pair-done";
import type { DonePromoDTO } from "@/domain/promos/dto";
import type { DonePairLegDTO } from "@/domain/promos/pairSnapshot";
import { formatAmerican, formatKickoff, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

interface DonePairRowProps {
  /** A Done row with kind "pair" (row.pair is set). */
  row: DonePromoDTO;
  onChanged: () => void;
}

function LegLine({ leg }: { leg: DonePairLegDTO }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-border pl-4 text-base">
      <span>{leg.bookName}</span>
      <Badge variant="outline">{leg.promoTypeLabel}</Badge>
      <span>
        {leg.selectionLabel} <span className="num">{formatAmerican(leg.oddsAmerican)}</span>
      </span>
      <span className="text-muted-foreground">
        - stake <span className="num text-foreground">{formatUsd(leg.stake)}</span>
      </span>
    </div>
  );
}

/**
 * Phase 4 Plan 08 (D-11): a marked pair as ONE Done entry, rendered only from
 * the saved pair snapshot (never live odds), with the paired profit once and
 * an Undo that restores both promos to Active. All promo text is React text.
 */
export function DonePairRow({ row, onChanged }: DonePairRowProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pair = row.pair;
  if (pair === null) return null;

  function undo() {
    startTransition(async () => {
      const call = await safeAction(() => unmarkPairDoneAction({ promoId: row.promoId }), "unmarkPairDoneAction");
      if (!call.ok) {
        setErrorMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      const outcome = call.value;
      if (outcome.status === "ok") {
        setErrorMessage(null);
        onChanged();
        return;
      }
      setErrorMessage("Couldn't save that. Check your connection and try again.");
    });
  }

  return (
    <div
      className="used-row-bg rounded-lg border border-border p-4"
      aria-label={`${pair.awayTeam} @ ${pair.homeTeam} (${pair.pairTypeLabel}) — marked done, ${formatUsd(row.profitExtracted)} extracted`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm text-muted-foreground">
            {pair.sportLabel} · {formatKickoff(pair.commenceTime)}
          </span>
          <span className="flex flex-wrap items-center gap-2 text-base">
            <span>
              {pair.awayTeam} @ {pair.homeTeam}
            </span>
            <Badge variant="outline">{pair.marketBadge}</Badge>
            <Badge variant="outline">{pair.pairTypeLabel}</Badge>
          </span>
          <LegLine leg={pair.legA} />
          <LegLine leg={pair.legB} />
          {pair.legC ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2 border-l-2 border-border pl-4 text-base">
              <span>{pair.legC.bookName}</span>
              <Badge variant="outline">Ordinary bet</Badge>
              <span>
                {pair.legC.selectionLabel} <span className="num">{formatAmerican(pair.legC.oddsAmerican)}</span>
              </span>
              <span className="text-muted-foreground">
                - stake <span className="num text-foreground">{formatUsd(pair.legC.stake)}</span>
              </span>
            </div>
          ) : null}
          <span className="text-sm text-muted-foreground">Marked done {formatKickoff(row.completedAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-xl font-semibold text-primary">{formatUsd(row.profitExtracted)}</span>
          <span className="relative inline-flex">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 gap-1.5"
              aria-label="Undo marking this pair done — both promos return to Active"
              disabled={isPending}
              onClick={(event) => {
                event.stopPropagation();
                undo();
              }}
            >
              <Undo2 className="size-4" aria-hidden="true" />
              Undo
            </Button>
            {errorMessage ? (
              <p role="alert" className="absolute top-full right-0 z-10 w-max max-w-xs text-sm text-destructive">
                {errorMessage}
              </p>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
