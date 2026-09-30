"use client";

import { useState, useTransition } from "react";
import type { CorrectionOptions, QueueItemDTO } from "@/domain/promos/dto";
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

const INVALID_MESSAGE = "Something went wrong with that request. Try refreshing the page.";

type BoostFieldKey = "boostPercent" | "maxStake" | "minOdds" | "maxWinnings";
type BonusFieldKey = "bonusAmount" | "minOdds";

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
  const [openPanel, setOpenPanel] = useState<"boost" | "bonus" | null>(null);
  const [draft, setDraft] = useState<ScopeDraft>(EMPTY_SCOPE_DRAFT);
  const [isPending, startTransition] = useTransition();

  const [boostValues, setBoostValues] = useState<Partial<Record<BoostFieldKey, string>>>({});
  const [boostErrors, setBoostErrors] = useState<Partial<Record<BoostFieldKey, string | undefined>>>({});
  const [bonusValues, setBonusValues] = useState<Partial<Record<BonusFieldKey, string>>>({});

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

  function handleOutcome(outcome: PromoReviewResponse) {
    if (outcome.status === "ok") {
      setMessage(null);
      resetPanels();
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
        <span className="text-sm text-muted-foreground">
          Needs a look: we couldn&apos;t tell what kind of promo this is.
        </span>
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

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

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
          handleOutcome(outcome);
        }}
      />
    </div>
  );
}
