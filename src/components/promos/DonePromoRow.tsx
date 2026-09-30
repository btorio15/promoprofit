"use client";

import { ChevronDown } from "lucide-react";
import type { DonePromoDTO } from "@/domain/promos/dto";
import { formatAmerican, formatKickoff, formatPct, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AddedPromoActions } from "./AddedPromoActions";
import { MarkUsedButton } from "./MarkUsedButton";
import { PromoDetails } from "./PromoDetails";

interface DonePromoRowProps {
  row: DonePromoDTO;
  onChanged: () => void;
  /** Owner Expire/Delete for promos the member added (Done rows have no Edit). */
  addedActions?: { onError: (message: string) => void };
}

/**
 * quick-260929-igk: one Done-tab row, rendered ONLY from the saved snapshot
 * on the DTO -- never from live odds -- so later odds movement can't change
 * what a promo is recorded as having earned. Hedge snapshots reuse PromoRow's
 * overlay-trigger Collapsible layout (empty full-row trigger behind
 * pointer-events-none content; only Undo opts back in) and the same
 * PromoDetails panel. "No hedge" and legacy rows are plain, non-expandable
 * divs with the note they were saved with.
 */
export function DonePromoRow({ row, onChanged, addedActions }: DonePromoRowProps) {
  const done = row.row;
  const doneOn = `Marked done ${formatKickoff(row.completedAt)}`;
  const addedBadge = row.addedByYou ? <Badge variant="outline">Added by you</Badge> : null;
  const manageable = row.addedPromoStatus === "active" || row.addedPromoStatus === "expired";
  const actions =
    addedActions && manageable ? (
      <AddedPromoActions
        promoId={row.promoId}
        canExpire={row.addedPromoStatus === "active"}
        isDone
        onChanged={onChanged}
        onError={addedActions.onError}
      />
    ) : null;

  if (row.kind !== "hedge" || done === null) {
    return (
      <div
        className="used-row-bg rounded-lg border border-border p-4"
        aria-label={`${row.bookName} ${row.title} — marked done, ${formatUsd(row.profitExtracted)} extracted`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2 text-base">
              <Badge variant="outline">{row.promoTypeLabel}</Badge>
              <span>{row.title}</span>
              <span className="text-sm text-muted-foreground">{row.bookName}</span>
              {addedBadge}
            </span>
            {row.scopeLabel ? <span className="text-sm text-muted-foreground">Promo: {row.scopeLabel}</span> : null}
            {row.note ? <span className="text-sm text-muted-foreground">{row.note}</span> : null}
            <span className="text-sm text-muted-foreground">{doneOn}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="num text-xl font-semibold">{formatUsd(row.profitExtracted)}</span>
            <MarkUsedButton mode="undo" promoId={row.promoId} onChanged={onChanged} />
          </div>
        </div>
        {actions ? <div className="mt-3">{actions}</div> : null}
      </div>
    );
  }

  return (
    <Collapsible className="used-row-bg group rounded-lg border border-border">
      <div className="relative">
        <CollapsibleTrigger
          aria-label={`${done.awayTeam} @ ${done.homeTeam} — marked done, ${formatUsd(row.profitExtracted)} extracted`}
          className="absolute inset-0 w-full rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="pointer-events-none relative grid min-h-11 w-full grid-cols-1 items-center gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {done.sportLabel} · {formatKickoff(done.commenceTime)}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-base">
              <span className="truncate">
                {done.awayTeam} @ {done.homeTeam}
              </span>
              <Badge variant="outline">{done.marketBadge}</Badge>
              {addedBadge}
              <MarkUsedButton mode="undo" promoId={row.promoId} onChanged={onChanged} />
            </span>
            <span className="text-sm text-muted-foreground">Promo: {done.scopeLabel}</span>
            <span className="text-sm text-muted-foreground">{doneOn}</span>
          </div>

          <div className="flex min-w-0 flex-col text-base">
            <span className="text-sm text-muted-foreground md:hidden">Promo</span>
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{done.promoTypeLabel}</Badge>
              {done.promo.selectionLabel} <span className="num">{formatAmerican(done.promo.oddsAmerican)}</span>
            </span>
            <span className="text-sm text-muted-foreground">{done.promo.bookName}</span>
          </div>

          <div className="flex min-w-0 flex-col text-base">
            <span className="text-sm text-muted-foreground md:hidden">Hedge</span>
            <span className="flex flex-wrap items-center gap-2">
              {done.hedge.selectionLabel} <span className="num">{formatAmerican(done.hedge.oddsAmerican)}</span>
            </span>
            <span className="text-sm text-muted-foreground">{done.hedge.bookName}</span>
          </div>

          <span className="num text-xl font-semibold text-primary md:text-right">
            {formatUsd(row.profitExtracted)}
          </span>

          <span className="flex flex-col md:items-end">
            <span className="num text-base">{formatPct(done.ratePct)}</span>
            <span className="text-sm text-muted-foreground">{done.rateLabel}</span>
          </span>

          <ChevronDown className="size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-open:rotate-180" />
        </div>
      </div>
      <CollapsibleContent>
        <PromoDetails row={done} />
        {actions ? <div className="px-4 pb-4">{actions}</div> : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
