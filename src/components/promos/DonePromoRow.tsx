"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { correctSettledNoSweatAction } from "@/app/actions/track-no-sweat";
import { Button } from "@/components/ui/button";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";
import { parseSignedMoneyInput, toCorrection, outcomeChip, type CorrectionInput } from "@/components/opportunities/trackedCardView";
import { NoSweatCorrectionFields } from "./NoSweatCorrectionFields";
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
  if (row.kind === "no_sweat" && row.noSweat !== null) {
    return <DoneNoSweatRow row={row} onChanged={onChanged} addedActions={addedActions} />;
  }
  return <DoneHedgeOrPlainRow row={row} onChanged={onChanged} addedActions={addedActions} />;
}

/**
 * Phase 9 (A-04, A-09, D-06): a settled no-sweat, rendered from its stored
 * snapshot. The recorded figure is real money, so it may be green; a negative
 * total is plain foreground with a minus (never green, never red).
 */
function DoneNoSweatRow({ row, onChanged, addedActions }: DonePromoRowProps) {
  const ns = row.noSweat;
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState<CorrectionInput>({
    qualifyingStake: "",
    qualifyingOdds: "",
    hedgeStake: "",
    hedgeOdds: "",
  });
  const [actual, setActual] = useState("");
  const manageable = row.addedPromoStatus === "active" || row.addedPromoStatus === "expired";
  const negative = row.profitExtracted.startsWith("-");
  if (ns === null) return null;

  function save() {
    const correction = toCorrection(input);
    if (!correction) {
      setError("Check the amounts and odds. Odds must be +100 or longer, or −100 or shorter.");
      return;
    }
    const payload: Record<string, unknown> = { promoId: row.promoId, correction };
    if (ns!.outcome === "push" || ns!.outcome === "void") {
      const override = parseSignedMoneyInput(actual);
      if (actual.trim() !== "" && override === null) {
        setError("Enter a whole-cent amount, like 5 or -5.00.");
        return;
      }
      if (override !== null) payload.overrideProfit = override;
    }
    startTransition(async () => {
      const call = await safeAction(() => correctSettledNoSweatAction(payload), "correctSettledNoSweatAction");
      if (!call.ok) {
        setError(ACTION_FAILED_MESSAGE);
        return;
      }
      if (call.value.status === "ok") {
        setError(null);
        setOpen(false);
        onChanged();
        return;
      }
      setError("Couldn't update the amounts. Check them and try again.");
    });
  }

  return (
    <div
      className="used-row-bg rounded-lg border border-border p-4"
      aria-label={`${row.bookName} ${row.title}, no-sweat, ${ns.outcomeLabel}, ${formatUsd(row.profitExtracted)} recorded`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 text-base">
            <Badge variant="outline">No-sweat</Badge>
            <Badge variant="outline">{outcomeChip(ns.outcome)}</Badge>
            <span>{row.title}</span>
            <span className="text-sm text-muted-foreground">{row.bookName}</span>
          </span>
          {row.scopeLabel ? <span className="text-sm text-muted-foreground">Promo: {row.scopeLabel}</span> : null}
          <span className="text-sm text-muted-foreground">{ns.qualifyingSummary}</span>
          <span className="text-sm text-muted-foreground">{ns.hedgeSummary}</span>
          <span className="text-sm text-muted-foreground">Marked done {formatKickoff(row.completedAt)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`num text-xl font-semibold ${negative ? "text-foreground" : "text-primary"}`}>
            {formatUsd(row.profitExtracted)}
          </span>
          <MarkUsedButton mode="undo" promoId={row.promoId} onChanged={onChanged} />
        </div>
      </div>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger render={<Button type="button" variant="link" className="h-auto min-h-11 px-0" />}>
          Fix amounts
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 pt-2">
            <NoSweatCorrectionFields
              values={input}
              onChange={setInput}
              refundCap={ns.refund?.amount ?? "0.00"}
              previewOutcome={ns.outcome === "won" ? "won" : undefined}
              actualProfit={
                ns.outcome === "push" || ns.outcome === "void" ? { value: actual, onChange: setActual } : undefined
              }
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="min-h-11" disabled={isPending} onClick={save}>
                Recalculate profit
              </Button>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {addedActions && manageable ? (
        <div className="mt-3">
          <AddedPromoActions
            promoId={row.promoId}
            canExpire={row.addedPromoStatus === "active"}
            isDone
            onChanged={onChanged}
            onError={addedActions.onError}
          />
        </div>
      ) : null}
    </div>
  );
}

function DoneHedgeOrPlainRow({ row, onChanged, addedActions }: DonePromoRowProps) {
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
