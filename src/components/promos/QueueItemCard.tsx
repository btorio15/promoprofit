"use client";

import { useState, useTransition } from "react";
import type { CorrectionOptions, QueueItemDTO } from "@/domain/promos/dto";
import { confirmPromoMatch, type PromoReviewResponse } from "@/app/actions/confirm-promo-match";
import { correctPromoMatch } from "@/app/actions/correct-promo-match";
import { enterPromoCaps } from "@/app/actions/enter-promo-caps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatAmerican, formatUsd } from "@/lib/format";
import { DismissPromoDialog } from "./DismissPromoDialog";
import { prefillSportDay } from "@/domain/promos/correctionOptions";
import {
  CorrectionScopeSelect,
  EVENT_PREFIX,
  DAY_PREFIX,
  ThroughDaySelect,
  dayEtDateFromValue,
  scopeInputFromValue,
} from "./CorrectionScopeSelect";

interface QueueItemCardProps {
  item: QueueItemDTO;
  /** Correct sub-panel dropdown data (Plan 09, T-03-09-06) -- only meaningful for match-kind items; ignored by caps-kind cards. */
  correctionOptions: CorrectionOptions;
  onChanged: () => void;
}

const INVALID_MESSAGE = "Something went wrong with that request. Try refreshing the page.";

type CapKey = "maxStake" | "maxWinnings" | "minOdds";

const CAP_FIELD_LABELS: Record<CapKey, string> = {
  maxStake: "Max stake",
  maxWinnings: "Max winnings",
  minOdds: "Min odds",
};

/**
 * One review-queue card, match or caps kind (D-13, D-14, D-18, PROMO-04;
 * 03-UI-SPEC.md "Queue item card"). Confirm/Dismiss/Correct/Enter-cap-
 * details each run in their own useTransition; an "ok" outcome calls
 * onChanged() (the parent re-fetches getPromos and the card disappears from
 * the queue); a stale/conflict/invalid outcome renders inline instead --
 * another member may have already acted on this exact card. The Correct
 * sub-panel's "selection" field error (a pin that no longer resolves) has no
 * dedicated input to attach to, so it renders in the same shared alert line
 * as stale/conflict; the Enter-cap-details sub-panel's field errors render
 * under each Input instead, since each maps to a specific field.
 */
export function QueueItemCard({ item, correctionOptions, onChanged }: QueueItemCardProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dismissOpen, setDismissOpen] = useState(false);

  const [correctOpen, setCorrectOpen] = useState(false);
  const [isCorrectPending, startCorrectTransition] = useTransition();
  const [eventValue, setEventValue] = useState<string | null>(null);
  const [marketValue, setMarketValue] = useState<string>("best");
  const [throughValue, setThroughValue] = useState<string | null>(null);

  const [capsOpen, setCapsOpen] = useState(false);
  const [isCapsPending, startCapsTransition] = useTransition();
  const [capValues, setCapValues] = useState<Partial<Record<CapKey, string>>>({});
  const [capFieldErrors, setCapFieldErrors] = useState<Partial<Record<CapKey, string | undefined>>>({});

  function handleOutcome(outcome: PromoReviewResponse) {
    if (outcome.status === "ok") {
      setMessage(null);
      onChanged();
      return;
    }
    if (outcome.status === "invalid") {
      setMessage(outcome.fieldErrors?.selection?.[0] ?? INVALID_MESSAGE);
      return;
    }
    setMessage(outcome.message);
  }

  function confirmMatch() {
    startTransition(async () => {
      const outcome = await confirmPromoMatch({ promoId: item.promoId });
      handleOutcome(outcome);
    });
  }

  const selectedEvent = eventValue?.startsWith(EVENT_PREFIX)
    ? correctionOptions.events.find((e) => e.eventId === eventValue.slice(EVENT_PREFIX.length))
    : undefined;
  const isSportDaySelected = eventValue?.startsWith(DAY_PREFIX) ?? false;
  const startEtDate = dayEtDateFromValue(eventValue);

  function toggleCorrect() {
    // Opening with nothing chosen yet: prefill the day pickers from the
    // promo's scraped window (presentational; the server re-validates).
    if (!correctOpen && eventValue === null && item.scrapedWindow) {
      const prefill = prefillSportDay(item.scrapedWindow, correctionOptions.sportDays, new Date());
      if (prefill) {
        setEventValue(`${DAY_PREFIX}${prefill.value}`);
        setThroughValue(prefill.throughEtDate);
      }
    }
    setCorrectOpen((open) => !open);
  }

  function saveMatch() {
    if (!eventValue) return;

    const scopeInput = scopeInputFromValue(eventValue, throughValue);
    const scope =
      scopeInput.kind === "event"
        ? {
            kind: "event" as const,
            eventId: scopeInput.eventId,
            pinned: selectedEvent?.markets.find((m) => m.value === marketValue)?.pinned ?? null,
          }
        : scopeInput;

    startCorrectTransition(async () => {
      const outcome = await correctPromoMatch({ promoId: item.promoId, scope });
      if (outcome.status === "ok") {
        setCorrectOpen(false);
        setEventValue(null);
        setThroughValue(null);
        setMarketValue("best");
      }
      handleOutcome(outcome);
    });
  }

  function saveCaps() {
    startCapsTransition(async () => {
      const payload: Record<string, unknown> = { promoId: item.promoId };
      for (const field of item.unparsedCapFields) {
        const value = capValues[field];
        if (!value) continue;
        if (field === "minOdds") {
          const parsedValue = Number.parseInt(value, 10);
          if (!Number.isNaN(parsedValue)) payload.minOddsAmerican = parsedValue;
        } else {
          payload[field] = value;
        }
      }

      const outcome = await enterPromoCaps(payload);

      if (outcome.status === "ok") {
        setCapsOpen(false);
        setCapValues({});
        setCapFieldErrors({});
        setMessage(null);
        onChanged();
        return;
      }

      if (outcome.status === "invalid" && outcome.fieldErrors && Object.keys(outcome.fieldErrors).length > 0) {
        setCapFieldErrors({
          maxStake: outcome.fieldErrors.maxStake?.[0],
          maxWinnings: outcome.fieldErrors.maxWinnings?.[0],
          minOdds: outcome.fieldErrors.minOdds?.[0],
        });
        return;
      }

      handleOutcome(outcome);
    });
  }

  const capRecapText =
    item.kind === "caps" && item.capRecap
      ? `Max stake: ${item.capRecap.maxStake ? formatUsd(item.capRecap.maxStake) : "not found"} · Max winnings: ${
          item.capRecap.maxWinnings ? formatUsd(item.capRecap.maxWinnings) : "not found"
        } · Min odds: ${item.capRecap.minOdds !== null ? formatAmerican(item.capRecap.minOdds) : "not found"}`
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary p-4">
      <div className="flex flex-col gap-1">
        <span className="text-base">
          {item.bookName} — <Badge variant="outline">{item.promoTypeLabel}</Badge> · {item.description}
        </span>

        {item.kind === "match" ? (
          <>
            <span className="text-sm text-muted-foreground">
              Needs review: couldn&apos;t confirm which game this is for.
            </span>
            {item.bestGuessLabel ? (
              <span className="text-sm text-muted-foreground">{item.bestGuessLabel}</span>
            ) : null}
          </>
        ) : (
          <>
            {item.matchedLabel ? <span className="text-sm text-muted-foreground">{item.matchedLabel}</span> : null}
            <span className="text-sm text-muted-foreground">
              Needs review: couldn&apos;t read the stake/winnings cap from the promo text.
            </span>
            {capRecapText ? <span className="text-sm text-muted-foreground">{capRecapText}</span> : null}
          </>
        )}
      </div>

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {item.kind === "match" && item.bestGuessLabel ? (
          <Button className="h-10" aria-label="Confirm this match" onClick={confirmMatch} disabled={isPending}>
            Confirm
          </Button>
        ) : null}
        {item.kind === "match" ? (
          <Button
            variant="outline"
            className="h-10"
            aria-label="Correct this match"
            onClick={toggleCorrect}
            disabled={isPending}
          >
            Correct
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-10"
            aria-label="Enter cap details"
            onClick={() => setCapsOpen((open) => !open)}
            disabled={isPending}
          >
            Enter cap details
          </Button>
        )}
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

      {correctOpen ? (
        <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          <div className={isSportDaySelected ? "grid gap-3 sm:grid-cols-2" : "flex flex-col gap-3"}>
            <CorrectionScopeSelect
              id={`correct-event-${item.promoId}`}
              value={eventValue}
              onValueChange={(value) => {
                setEventValue(value);
                setThroughValue(dayEtDateFromValue(value));
                setMarketValue("best");
              }}
              options={correctionOptions}
            />
            {startEtDate ? (
              <ThroughDaySelect
                id={`correct-through-${item.promoId}`}
                startEtDate={startEtDate}
                value={throughValue}
                onValueChange={setThroughValue}
              />
            ) : null}
          </div>

          {!isSportDaySelected ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`correct-market-${item.promoId}`}>Market / side</Label>
              <Select value={marketValue} onValueChange={(value) => setMarketValue(value ?? "best")}>
                <SelectTrigger
                  id={`correct-market-${item.promoId}`}
                  className="h-10 w-full"
                  disabled={!selectedEvent}
                >
                  <SelectValue placeholder="Best available (app picks)" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedEvent?.markets ?? []).map((market) => (
                    <SelectItem key={market.value} value={market.value}>
                      {market.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button className="h-10" disabled={!eventValue || isCorrectPending} onClick={saveMatch}>
              Save match
            </Button>
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => {
                setCorrectOpen(false);
                setEventValue(null);
                setThroughValue(null);
                setMarketValue("best");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {capsOpen ? (
        <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
          {item.unparsedCapFields.map((field) => (
            <div key={field} className="flex flex-col gap-2">
              <Label htmlFor={`cap-${field}-${item.promoId}`}>{CAP_FIELD_LABELS[field]}</Label>
              <Input
                id={`cap-${field}-${item.promoId}`}
                inputMode={field === "minOdds" ? "numeric" : "decimal"}
                placeholder={field === "minOdds" ? "-200" : "$0.00"}
                className="num h-10"
                value={capValues[field] ?? ""}
                onChange={(event) => {
                  const { value } = event.target;
                  setCapValues((prev) => ({ ...prev, [field]: value }));
                  setCapFieldErrors((prev) => ({ ...prev, [field]: undefined }));
                }}
              />
              {capFieldErrors[field] ? (
                <p className="text-sm text-destructive">{capFieldErrors[field]}</p>
              ) : null}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              className="h-10"
              disabled={item.unparsedCapFields.some((field) => !capValues[field]) || isCapsPending}
              onClick={saveCaps}
            >
              Save & activate
            </Button>
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => {
                setCapsOpen(false);
                setCapValues({});
                setCapFieldErrors({});
              }}
            >
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
