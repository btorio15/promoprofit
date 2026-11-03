"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CorrectionOptions, QueueItemDTO, QueueReadingsDTO } from "@/domain/promos/dto";
import { classifyPromo } from "@/app/actions/classify-promo";
import type { PromoReviewResponse } from "@/app/actions/confirm-promo-match";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { etDayLabel } from "@/domain/promos/etTime";
import {
  EMPTY_SCOPE_DRAFT,
  prefillScopeDraft,
  scopeInputFromDraft,
  type ScopeDraft,
} from "@/domain/promos/scopeDraft";
import { ScopePicker } from "./ScopePicker";
import { DismissPromoDialog } from "./DismissPromoDialog";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

interface ClassifyQueueCardProps {
  item: QueueItemDTO;
  correctionOptions: CorrectionOptions;
  onChanged: () => void;
}

const DONE_DISPLAY_MS = 2000;

type ReadingSide = QueueReadingsDTO["scraper"] | QueueReadingsDTO["reader"];

function signedOdds(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** "No-sweat, $25 refund, -200 or longer" / "Bonus bet, $25". Plain text only. */
function describeReading(reading: ReadingSide): string {
  if (!reading.label) return "Couldn't tell";
  if (reading.label === "Not usable") return "Not usable";
  const parts: string[] = [reading.label];
  if (reading.amount) {
    if (reading.label === "No-sweat") parts.push(`$${reading.amount} refund`);
    else if (reading.label === "Bonus bet") parts.push(`$${reading.amount}`);
    else parts.push(reading.amount);
  }
  if (reading.minOddsAmerican !== null) parts.push(`${signedOdds(reading.minOddsAmerican)} or longer`);
  return parts.join(", ");
}

/** The reading (scraper first) that called this a given type, or null. */
function readingFor(readings: QueueReadingsDTO | null, label: "No-sweat" | "Bonus bet"): ReadingSide | null {
  if (!readings) return null;
  if (readings.scraper.label === label) return readings.scraper;
  if (readings.reader.label === label) return readings.reader;
  return null;
}

type OneTapChoice = "no_sweat" | "bonus_bet" | "skip";
const DONE_LABELS: Record<OneTapChoice, string> = {
  no_sweat: "Saved as no-sweat",
  bonus_bet: "Saved as bonus bet",
  skip: "Skipped",
};

const INVALID_MESSAGE = "Something went wrong with that request. Try refreshing the page.";

type BoostFieldKey = "boostPercent" | "maxStake" | "minOdds" | "maxWinnings";
type BonusFieldKey = "bonusAmount" | "minOdds";
type NoSweatFieldKey = "refundCap" | "minOdds";

/**
 * "Needs a look" queue card for an uncertain scraped entry (quick-260928-it1,
 * 03-UI-SPEC.md-style queue-card conventions, T-it1-06 -- raw scraped text is
 * rendered as plain React text nodes only, never dangerouslySetInnerHTML).
 * Dismiss reuses the exact shared DismissPromoDialog/dismissPromo path every
 * other queue card uses; "It's a profit boost"/"It's a bonus bet" each toggle
 * an inline sub-panel that posts to classifyPromo. Follows QueueItemCard's
 * handleOutcome pattern: an "ok" outcome calls onChanged(); stale/conflict/
 * invalid renders inline (role="alert") since another member may have acted
 * on this exact card already.
 */
export function ClassifyQueueCard({ item, correctionOptions, onChanged }: ClassifyQueueCardProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState<"boost" | "bonus" | "nosweat" | null>(null);
  const [draft, setDraft] = useState<ScopeDraft>(EMPTY_SCOPE_DRAFT);
  const [isPending, startTransition] = useTransition();

  const [boostValues, setBoostValues] = useState<Partial<Record<BoostFieldKey, string>>>({});
  const [boostErrors, setBoostErrors] = useState<Partial<Record<BoostFieldKey, string | undefined>>>({});
  const [bonusValues, setBonusValues] = useState<Partial<Record<BonusFieldKey, string>>>({});
  const [noSweatValues, setNoSweatValues] = useState<Partial<Record<NoSweatFieldKey, string>>>({});
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  if (!item.classify) return null;
  // Captured once, non-null, so nested function declarations below don't
  // need to re-narrow item.classify themselves (TS doesn't carry the
  // enclosing narrowing into hoisted function bodies).
  const classify = item.classify;

  function resetPanels() {
    setOpenPanel(null);
    setDraft(EMPTY_SCOPE_DRAFT);
    setBoostValues({});
    setBoostErrors({});
    setBonusValues({});
    setNoSweatValues({});
  }

  /** Prefill league mode from the promo's scraped window (presentational; the server re-validates). */
  function applyScrapedWindowPrefill() {
    if (draft !== EMPTY_SCOPE_DRAFT || !item.scrapedWindow) return;
    const prefill = prefillScopeDraft(item.scrapedWindow, correctionOptions.sportDays, new Date());
    if (prefill) setDraft(prefill);
  }

  function scopeControls(idPrefix: string) {
    return (
      <ScopePicker
        idPrefix={`${idPrefix}-${item.promoId}`}
        draft={draft}
        onDraftChange={setDraft}
        options={correctionOptions}
        label="Game or league"
      />
    );
  }

  function openBoostPanel() {
    if (openPanel !== "boost") applyScrapedWindowPrefill();
    setOpenPanel((current) => (current === "boost" ? null : "boost"));
    setBoostValues({
      boostPercent: classify.suggested.boostPercent ?? "",
      maxStake: classify.suggested.maxStake ?? "",
      minOdds: classify.suggested.minOdds !== null ? String(classify.suggested.minOdds) : "",
      maxWinnings: classify.suggested.maxWinnings ?? "",
    });
  }

  function openBonusPanel() {
    if (openPanel !== "bonus") applyScrapedWindowPrefill();
    setOpenPanel((current) => (current === "bonus" ? null : "bonus"));
    setBonusValues({
      bonusAmount: classify.suggested.bonusAmount ?? "",
      minOdds: classify.suggested.minOdds !== null ? String(classify.suggested.minOdds) : "",
    });
  }

  function handleOutcome(outcome: PromoReviewResponse, choice?: OneTapChoice) {
    if (outcome.status === "ok") {
      setMessage(null);
      resetPanels();
      if (choice) {
        // Show the result for 2 seconds, then let the queue drop the card.
        setDoneMessage(DONE_LABELS[choice]);
        doneTimer.current = setTimeout(onChanged, DONE_DISPLAY_MS);
        return;
      }
      onChanged();
      return;
    }
    if (outcome.status === "invalid") {
      if (outcome.fieldErrors?.maxWinnings) {
        setBoostErrors((prev) => ({ ...prev, maxWinnings: outcome.fieldErrors?.maxWinnings?.[0] }));
        return;
      }
      setMessage(INVALID_MESSAGE);
      return;
    }
    setMessage(outcome.message);
  }

  /** Scope for a one-tap choice: the promo's scraped window when it has one, else "best game". */
  function oneTapScope() {
    const prefill = item.scrapedWindow
      ? prefillScopeDraft(item.scrapedWindow, correctionOptions.sportDays, new Date())
      : null;
    return scopeInputFromDraft(prefill ?? EMPTY_SCOPE_DRAFT);
  }

  const noSweatReading = readingFor(item.readings, "No-sweat");
  const bonusReading = readingFor(item.readings, "Bonus bet");
  // Cash-refund items may have no no-sweat label; the reader's amount is then the refund cap.
  const noSweatAmount =
    noSweatReading?.amount ?? (item.cashRefund ? (item.readings?.reader.amount ?? null) : null);
  const noSweatMinOdds = noSweatReading?.minOddsAmerican ?? item.readings?.reader.minOddsAmerican ?? null;
  const bonusAmount = bonusReading?.amount ?? classify.suggested.bonusAmount;
  const bonusMinOdds = bonusReading?.minOddsAmerican ?? classify.suggested.minOdds;

  function openNoSweatPanel(amount: string | null, minOdds: number | null) {
    if (openPanel !== "nosweat") applyScrapedWindowPrefill();
    setOpenPanel("nosweat");
    setNoSweatValues({ refundCap: amount ?? "", minOdds: minOdds !== null ? String(minOdds) : "" });
  }

  function submitNoSweat(refundCap: string, minOdds: number | null, scope: unknown, choice?: OneTapChoice) {
    const payload: Record<string, unknown> = {
      promoId: item.promoId,
      promoType: "no_sweat",
      refundCap,
      scope,
    };
    if (minOdds !== null) payload.minOddsAmerican = minOdds;
    startTransition(async () => {
      const call = await safeAction(() => classifyPromo(payload), "classifyPromo");
      if (!call.ok) {
        setMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      handleOutcome(call.value, choice);
    });
  }

  function chooseNoSweat() {
    if (!noSweatAmount) {
      openNoSweatPanel(null, noSweatMinOdds);
      return;
    }
    submitNoSweat(noSweatAmount, noSweatMinOdds, oneTapScope(), "no_sweat");
  }

  function chooseBonusBet() {
    if (!bonusAmount) {
      openBonusPanel();
      return;
    }
    const payload: Record<string, unknown> = {
      promoId: item.promoId,
      promoType: "bonus_bet",
      bonusAmount,
      scope: oneTapScope(),
    };
    if (bonusMinOdds !== null) payload.minOddsAmerican = bonusMinOdds;
    startTransition(async () => {
      const call = await safeAction(() => classifyPromo(payload), "classifyPromo");
      if (!call.ok) {
        setMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      handleOutcome(call.value, "bonus_bet");
    });
  }

  function saveNoSweatPanel() {
    if (!noSweatValues.refundCap) return;
    const parsedOdds = noSweatValues.minOdds ? Number.parseInt(noSweatValues.minOdds, 10) : Number.NaN;
    submitNoSweat(noSweatValues.refundCap, Number.isNaN(parsedOdds) ? null : parsedOdds, scopeInputFromDraft(draft));
  }

  function saveBoost() {
    if (!boostValues.boostPercent) return;

    const payload: Record<string, unknown> = {
      promoId: item.promoId,
      promoType: "profit_boost",
      boostPercent: boostValues.boostPercent,
    };
    if (boostValues.maxStake) payload.maxStake = boostValues.maxStake;
    if (boostValues.maxWinnings && classify.maxWinningsKindKnown) payload.maxWinnings = boostValues.maxWinnings;
    if (boostValues.minOdds) {
      const parsedOdds = Number.parseInt(boostValues.minOdds, 10);
      if (!Number.isNaN(parsedOdds)) payload.minOddsAmerican = parsedOdds;
    }
    payload.scope = scopeInputFromDraft(draft);

    startTransition(async () => {
      const call = await safeAction(() => classifyPromo(payload), "classifyPromo");
      if (!call.ok) {
        setMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      const outcome = call.value;
      handleOutcome(outcome);
    });
  }

  function saveBonus() {
    if (!bonusValues.bonusAmount) return;

    const payload: Record<string, unknown> = {
      promoId: item.promoId,
      promoType: "bonus_bet",
      bonusAmount: bonusValues.bonusAmount,
    };
    if (bonusValues.minOdds) {
      const parsedOdds = Number.parseInt(bonusValues.minOdds, 10);
      if (!Number.isNaN(parsedOdds)) payload.minOddsAmerican = parsedOdds;
    }
    payload.scope = scopeInputFromDraft(draft);

    startTransition(async () => {
      const call = await safeAction(() => classifyPromo(payload), "classifyPromo");
      if (!call.ok) {
        setMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      const outcome = call.value;
      handleOutcome(outcome);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary p-4">
      <div className="flex flex-col gap-1">
        <span className="text-base">
          {item.bookName} — {classify.title}
        </span>
        {item.cashRefund ? (
          <>
            <span className="text-base font-semibold">This refund may be cash</span>
            <span className="text-sm text-muted-foreground">We only price refunds paid as a bonus bet.</span>
          </>
        ) : item.readings ? (
          <span className="text-base font-semibold">Scraper and reader disagree</span>
        ) : (
          <span className="text-sm text-muted-foreground">
            Needs a look: we couldn&apos;t tell what kind of promo this is.
          </span>
        )}
        <span className="text-sm text-muted-foreground">{classify.excerpt}</span>
        {classify.sourceUrl ? (
          <a
            href={classify.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline"
          >
            View on {item.bookName}
          </a>
        ) : null}
        {classify.expiresAt ? (
          <span className="text-sm text-muted-foreground">Expires {etDayLabel(classify.expiresAt)}</span>
        ) : null}
      </div>

      {item.readings ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-3">
            <span className="text-sm text-muted-foreground">Scraper read</span>
            <span className="text-base">{describeReading(item.readings.scraper)}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-3">
            <span className="text-sm text-muted-foreground">Reader read</span>
            <span className="text-base">{describeReading(item.readings.reader)}</span>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      {doneMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          {doneMessage}
        </p>
      ) : item.cashRefund ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="min-h-11" onClick={chooseNoSweat} disabled={isPending}>
            It&apos;s a no-sweat (bonus bet refund)
          </Button>
          <Button variant="ghost" className="min-h-11" onClick={() => setDismissOpen(true)} disabled={isPending}>
            Skip
          </Button>
        </div>
      ) : item.readings ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <Button variant="outline" className="min-h-11" onClick={chooseNoSweat} disabled={isPending}>
            It&apos;s a no-sweat
          </Button>
          <Button variant="outline" className="min-h-11" onClick={chooseBonusBet} disabled={isPending}>
            It&apos;s a bonus bet
          </Button>
          <Button variant="ghost" className="min-h-11" onClick={() => setDismissOpen(true)} disabled={isPending}>
            Skip
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10" onClick={openBoostPanel} disabled={isPending}>
            It&apos;s a profit boost
          </Button>
          <Button variant="outline" className="h-10" onClick={openBonusPanel} disabled={isPending}>
            It&apos;s a bonus bet
          </Button>
          <Button
            variant="outline"
            className="h-10 text-destructive"
            aria-label="Dismiss this promo"
            onClick={() => setDismissOpen(true)}
            disabled={isPending}
          >
            Dismiss
          </Button>
        </div>
      )}

      {openPanel === "nosweat" ? (
        <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`classify-nosweat-cap-${item.promoId}`}>Most you get back</Label>
            <Input
              id={`classify-nosweat-cap-${item.promoId}`}
              inputMode="decimal"
              placeholder="$0.00"
              className="num h-10"
              value={noSweatValues.refundCap ?? ""}
              onChange={(e) => setNoSweatValues((prev) => ({ ...prev, refundCap: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`classify-nosweat-min-odds-${item.promoId}`}>Min odds</Label>
            <Input
              id={`classify-nosweat-min-odds-${item.promoId}`}
              inputMode="numeric"
              placeholder="-200"
              className="num h-10"
              value={noSweatValues.minOdds ?? ""}
              onChange={(e) => setNoSweatValues((prev) => ({ ...prev, minOdds: e.target.value }))}
            />
          </div>

          {scopeControls("classify-scope-nosweat")}

          <div className="flex flex-wrap gap-2">
            <Button className="h-10" disabled={!noSweatValues.refundCap || isPending} onClick={saveNoSweatPanel}>
              Save promo
            </Button>
            <Button variant="ghost" className="h-10" onClick={resetPanels}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {openPanel === "boost" ? (
        <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`classify-boost-percent-${item.promoId}`}>Boost %</Label>
            <Input
              id={`classify-boost-percent-${item.promoId}`}
              inputMode="decimal"
              placeholder="50"
              className="num h-10"
              value={boostValues.boostPercent ?? ""}
              onChange={(e) => setBoostValues((prev) => ({ ...prev, boostPercent: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`classify-max-stake-${item.promoId}`}>Max stake</Label>
            <Input
              id={`classify-max-stake-${item.promoId}`}
              inputMode="decimal"
              placeholder="$0.00"
              className="num h-10"
              value={boostValues.maxStake ?? ""}
              onChange={(e) => setBoostValues((prev) => ({ ...prev, maxStake: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`classify-min-odds-${item.promoId}`}>Min odds</Label>
            <Input
              id={`classify-min-odds-${item.promoId}`}
              inputMode="numeric"
              placeholder="-200"
              className="num h-10"
              value={boostValues.minOdds ?? ""}
              onChange={(e) => setBoostValues((prev) => ({ ...prev, minOdds: e.target.value }))}
            />
          </div>
          {classify.maxWinningsKindKnown ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`classify-max-winnings-${item.promoId}`}>Max winnings</Label>
              <Input
                id={`classify-max-winnings-${item.promoId}`}
                inputMode="decimal"
                placeholder="$0.00"
                className="num h-10"
                value={boostValues.maxWinnings ?? ""}
                onChange={(e) => {
                  setBoostValues((prev) => ({ ...prev, maxWinnings: e.target.value }));
                  setBoostErrors((prev) => ({ ...prev, maxWinnings: undefined }));
                }}
              />
              {boostErrors.maxWinnings ? (
                <p className="text-sm text-destructive">{boostErrors.maxWinnings}</p>
              ) : null}
            </div>
          ) : null}

          {scopeControls("classify-scope-boost")}

          <div className="flex flex-wrap gap-2">
            <Button className="h-10" disabled={!boostValues.boostPercent || isPending} onClick={saveBoost}>
              Save promo
            </Button>
            <Button variant="ghost" className="h-10" onClick={resetPanels}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {openPanel === "bonus" ? (
        <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={`classify-bonus-amount-${item.promoId}`}>Bonus bet amount</Label>
            <Input
              id={`classify-bonus-amount-${item.promoId}`}
              inputMode="decimal"
              placeholder="$0.00"
              className="num h-10"
              value={bonusValues.bonusAmount ?? ""}
              onChange={(e) => setBonusValues((prev) => ({ ...prev, bonusAmount: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`classify-bonus-min-odds-${item.promoId}`}>Min odds</Label>
            <Input
              id={`classify-bonus-min-odds-${item.promoId}`}
              inputMode="numeric"
              placeholder="-200"
              className="num h-10"
              value={bonusValues.minOdds ?? ""}
              onChange={(e) => setBonusValues((prev) => ({ ...prev, minOdds: e.target.value }))}
            />
          </div>

          {scopeControls("classify-scope-bonus")}

          <div className="flex flex-wrap gap-2">
            <Button className="h-10" disabled={!bonusValues.bonusAmount || isPending} onClick={saveBonus}>
              Save promo
            </Button>
            <Button variant="ghost" className="h-10" onClick={resetPanels}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <DismissPromoDialog
        open={dismissOpen}
        promoId={item.promoId}
        onCancel={() => setDismissOpen(false)}
        onOutcome={(outcome) => {
          setDismissOpen(false);
          handleOutcome(outcome, item.readings || item.cashRefund ? "skip" : undefined);
        }}
      />
    </div>
  );
}
