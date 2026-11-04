"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, Hourglass, Undo2 } from "lucide-react";
import {
  completeRefundNoSweatAction,
  settleNoSweatAction,
  undoNoSweatOutcomeAction,
  untrackNoSweatAction,
} from "@/app/actions/track-no-sweat";
import { NoSweatRiskAdvisory } from "@/components/NoSweatRiskAdvisory";
import { NoSweatCorrectionFields } from "@/components/promos/NoSweatCorrectionFields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { TrackedNoSweatCardDTO, TrackedRefundOption } from "@/domain/promos/trackedCardDto";
import { formatAmerican, formatKickoff, formatUsd } from "@/lib/format";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";
import {
  PUSH_COPY,
  WAITING_COPY,
  awaitingHeading,
  parseSignedMoneyInput,
  statusLine,
  toCorrection,
  type CorrectionInput,
  type SettleOutcome,
} from "./trackedCardView";

const SAVE_FAILED = "Couldn't save that result. Try again.";
const ODDS_MOVED = "Odds moved. Showing the latest.";

interface TrackedNoSweatCardProps {
  card: TrackedNoSweatCardDTO;
  onChanged: () => void;
}

/** One transition + inline error per button (MarkUsedButton pattern). */
function useCardAction() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<T>(label: string, call: () => Promise<T>, handle: (value: T) => string | null) {
    startTransition(async () => {
      const result = await safeAction(call, label);
      if (!result.ok) {
        setError(ACTION_FAILED_MESSAGE);
        return;
      }
      setError(handle(result.value));
    });
  }
  return { isPending, error, run };
}

function initialInput(card: TrackedNoSweatCardDTO): CorrectionInput {
  return {
    qualifyingStake: card.qualifying.stake,
    qualifyingOdds: String(card.qualifying.oddsAmerican),
    hedgeStake: card.hedge.stake,
    hedgeOdds: String(card.hedge.oddsAmerican),
  };
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

function optionSummary(o: TrackedRefundOption): string {
  return `${o.bonusSelectionLabel} ${formatAmerican(o.bonusOddsAmerican)} at ${o.bonusBookName}, bonus bet ${formatUsd(o.amount)}, hedge ${formatUsd(o.hedgeStake)} at ${o.hedgeBookName}`;
}

export function TrackedNoSweatCard({ card, onChanged }: TrackedNoSweatCardProps) {
  const won = useCardAction();
  const lost = useCardAction();
  const push = useCardAction();
  const voided = useCardAction();
  const refund = useCardAction();
  const undo = useCardAction();
  const stop = useCardAction();

  const [panelOpen, setPanelOpen] = useState(false);
  const [input, setInput] = useState<CorrectionInput>(() => initialInput(card));
  const [actual, setActual] = useState("");
  // The member's amounts once "Recalculate profit" is pressed; sent with the chosen outcome.
  const [applied, setApplied] = useState<{ input: CorrectionInput; actual: string } | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<string | null>(null);
  const [stopOpen, setStopOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [oddsMoved, setOddsMoved] = useState(false);

  useEffect(() => {
    if (recorded === null) return;
    const timer = setTimeout(onChanged, 2000);
    return () => clearTimeout(timer);
  }, [recorded, onChanged]);

  const anyPending = won.isPending || lost.isPending || push.isPending || voided.isPending;

  function settle(outcome: Exclude<SettleOutcome, never>, action: ReturnType<typeof useCardAction>) {
    const correction = applied ? toCorrection(applied.input) : null;
    const override =
      applied && (outcome === "push" || outcome === "void") ? parseSignedMoneyInput(applied.actual) : null;
    const payload: Record<string, unknown> = { promoId: card.promoId, outcome };
    if (correction) payload.correction = correction;
    if (override !== null) payload.overrideProfit = override;
    action.run("settleNoSweatAction", () => settleNoSweatAction(payload), (res) => {
      if (res.status === "ok") {
        if (res.awaitingRefund) {
          onChanged();
        } else if (res.profitExtracted !== null) {
          const neg = res.profitExtracted.startsWith("-");
          const abs = formatUsd(neg ? res.profitExtracted.slice(1) : res.profitExtracted);
          setRecorded(`${neg ? "−" : "+"}${abs}`);
        }
        return null;
      }
      if (res.status === "unavailable") return res.message;
      return SAVE_FAILED;
    });
  }

  function recalc() {
    const correction = toCorrection(input);
    if (!correction) {
      setPanelError("Check the amounts and odds. Odds must be +100 or longer, or −100 or shorter.");
      return;
    }
    if (actual.trim() !== "" && parseSignedMoneyInput(actual) === null) {
      setPanelError("Enter a whole-cent amount, like 5 or -5.00.");
      return;
    }
    setPanelError(null);
    setApplied({ input, actual });
    setPanelOpen(false);
  }

  function keepOriginal() {
    setApplied(null);
    setPanelError(null);
    setInput(initialInput(card));
    setActual("");
    setPanelOpen(false);
  }

  const selected =
    card.refundOptions.find((o) => o.optionKey === selectedKey) ?? card.refundOptions[0] ?? null;

  function markDone() {
    if (!selected) return;
    refund.run(
      "completeRefundNoSweatAction",
      () =>
        completeRefundNoSweatAction({
          promoId: card.promoId,
          optionKey: selected.optionKey,
          expectedRefundProfit: selected.profit,
        }),
      (res) => {
        if (res.status === "ok") {
          const neg = res.profitExtracted.startsWith("-");
          setRecorded(`${neg ? "−" : "+"}${formatUsd(neg ? res.profitExtracted.slice(1) : res.profitExtracted)}`);
          return null;
        }
        if (res.status === "odds_changed") {
          setOddsMoved(true);
          setSelectedKey(null);
          onChanged();
          return null;
        }
        if (res.status === "unavailable") return res.message;
        return SAVE_FAILED;
      },
    );
  }

  function goBack() {
    undo.run("undoNoSweatOutcomeAction", () => undoNoSweatOutcomeAction({ promoId: card.promoId }), (res) => {
      if (res.status === "ok") {
        onChanged();
        return null;
      }
      return res.status === "unavailable" ? res.message : SAVE_FAILED;
    });
  }

  function stopTracking() {
    stop.run("untrackNoSweatAction", () => untrackNoSweatAction({ promoId: card.promoId }), (res) => {
      if (res.status === "ok") {
        setStopOpen(false);
        onChanged();
        return null;
      }
      return res.status === "unavailable" ? res.message : SAVE_FAILED;
    });
  }

  const outcomeButtons: { outcome: SettleOutcome; label: string; action: ReturnType<typeof useCardAction> }[] = [
    { outcome: "won", label: "Bet won", action: won },
    { outcome: "lost", label: "Bet lost", action: lost },
    { outcome: "push", label: "Push", action: push },
    { outcome: "void", label: "Game voided", action: voided },
  ];

  function renderOption(o: TrackedRefundOption) {
    const isSelected = selected?.optionKey === o.optionKey;
    return (
      <button
        key={o.optionKey}
        type="button"
        aria-pressed={isSelected}
        onClick={() => setSelectedKey(o.optionKey)}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
          isSelected ? "border-primary" : "border-border"
        }`}
      >
        <span className="min-w-0">{optionSummary(o)}</span>
        <span className="num shrink-0 font-semibold text-primary">+{formatUsd(o.profit)}</span>
      </button>
    );
  }

  const others = card.refundOptions.slice(1);

  return (
    <div className="rounded-lg border border-border bg-secondary p-4" aria-label={`${card.awayTeam} @ ${card.homeTeam}, tracking`}>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">
          {card.sportLabel} · {formatKickoff(card.commenceTime)}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-base">
          <span>
            {card.awayTeam} @ {card.homeTeam}
          </span>
          <Badge variant="outline">No-sweat</Badge>
          <span className="text-sm text-muted-foreground">{card.bookName}</span>
        </span>
        <NoSweatRiskAdvisory variant="compact" />
        <p className="text-sm">
          Bet <span className="num">{formatUsd(card.qualifying.stake)}</span> on {card.qualifying.selectionLabel}{" "}
          <span className="num">{formatAmerican(card.qualifying.oddsAmerican)}</span> at {card.qualifying.bookName}, hedge{" "}
          <span className="num">{formatUsd(card.hedge.stake)}</span> on {card.hedge.selectionLabel}{" "}
          <span className="num">{formatAmerican(card.hedge.oddsAmerican)}</span> at {card.hedge.bookName}.
        </p>
        {applied ? (
          <p className="text-sm text-muted-foreground">Using the amounts you entered.</p>
        ) : null}
      </div>

      {recorded !== null ? (
        <p className="mt-3 text-base" aria-live="polite">
          Recorded <span className="num font-semibold text-primary">{recorded}</span>
        </p>
      ) : card.state === "tracking" ? (
        !card.pastKickoff ? (
          <p className="mt-3 text-sm text-muted-foreground">{statusLine(card)}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {card.showWaitingReminder ? (
              <p className="flex items-start gap-1 text-sm text-warning">
                <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{WAITING_COPY}</span>
              </p>
            ) : null}
            <p className="text-base font-semibold">How did it go?</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {outcomeButtons.map(({ outcome, label, action }) => (
                <Button
                  key={outcome}
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={anyPending}
                  onClick={() => settle(outcome, action)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{PUSH_COPY}</p>
            {outcomeButtons.map(({ outcome, action }) => (
              <ErrorLine key={outcome} message={action.error} />
            ))}

            <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
              <CollapsibleTrigger render={<Button type="button" variant="link" className="h-auto min-h-11 gap-1 px-0" />}>
                I bet different amounts
                <ChevronDown className="size-4" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col gap-3 pt-2">
                  <NoSweatCorrectionFields
                    values={input}
                    onChange={setInput}
                    refundCap={card.refundCap}
                    previewOutcome="won"
                    actualProfit={{ value: actual, onChange: setActual }}
                  />
                  <ErrorLine message={panelError} />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" className="min-h-11" onClick={recalc}>
                      Recalculate profit
                    </Button>
                    <Button type="button" variant="ghost" className="min-h-11" onClick={keepOriginal}>
                      Keep original amounts
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-base font-semibold">{awaitingHeading(card)}</p>
          {oddsMoved ? <p className="text-sm text-muted-foreground">{ODDS_MOVED}</p> : null}
          {card.refundOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No odds to price your bonus bet right now. Refresh odds, then check back.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {renderOption(card.refundOptions[0])}
                {others.length > 0 ? (
                  <Collapsible>
                    <CollapsibleTrigger render={<Button type="button" variant="ghost" className="min-h-11 gap-1 px-2" />}>
                      Other ways to convert ({others.length})
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="flex flex-col gap-2 pt-2">{others.map(renderOption)}</div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>
                  Lost bet: <span className="num">−{formatUsd(card.lostStake)}</span>. Hedge on the first bet pays back{" "}
                  <span className="num">+{formatUsd(card.hedgeWinningsOnFirstBet)}</span>.
                </span>
                {selected ? (
                  <span className="text-base text-foreground">
                    All in, this one comes to <span className="num font-semibold">{formatUsd(selected.allInTotal)}</span>.
                  </span>
                ) : null}
              </div>
              <div>
                <Button type="button" className="min-h-11" disabled={refund.isPending} onClick={markDone}>
                  Mark done
                </Button>
              </div>
              <ErrorLine message={refund.error} />
            </>
          )}
        </div>
      )}

      {recorded === null ? (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {card.state === "awaiting_refund" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-10 gap-1.5"
              aria-label="Go back one step"
              disabled={undo.isPending}
              onClick={goBack}
            >
              <Undo2 className="size-4" aria-hidden="true" />
              Undo
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-10"
              disabled={stop.isPending}
              onClick={() => setStopOpen(true)}
            >
              Stop tracking
            </Button>
          )}
        </div>
      ) : null}
      <ErrorLine message={undo.error} />
      <ErrorLine message={stop.error} />

      <AlertDialog
        open={stopOpen}
        onOpenChange={(next) => {
          if (!next && !stop.isPending) setStopOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop tracking this bet?</AlertDialogTitle>
            <AlertDialogDescription>It goes back to the feed. Nothing is recorded.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost" onClick={() => setStopOpen(false)}>
              Keep tracking
            </AlertDialogCancel>
            <AlertDialogAction onClick={stopTracking} disabled={stop.isPending}>
              Stop tracking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
