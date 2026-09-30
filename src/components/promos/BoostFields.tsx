"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AddPromoDraft, AddPromoFieldErrors } from "@/domain/promos/addPromoDraft";
import type { CorrectionOptions } from "@/domain/promos/dto";
import type { ScopeDraft } from "@/domain/promos/scopeDraft";
import { ExpiryField } from "./ExpiryField";
import { ScopePicker } from "./ScopePicker";

interface BoostFieldsProps {
  draft: AddPromoDraft;
  onDraftChange: (next: AddPromoDraft) => void;
  options: CorrectionOptions;
  fieldErrors: AddPromoFieldErrors;
  disabled?: boolean;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Profit-boost fields (D-05/D-06): Boost as toggle, the boost input, Game(s),
 * max stake, and "More details (optional)". A3: in Boosted odds mode the exact
 * market/side pin is required and lives in the main section; in Boost % mode
 * it stays optional under More details.
 */
export function BoostFields({ draft, onDraftChange, options, fieldErrors, disabled }: BoostFieldsProps) {
  const percentError = fieldErrors.boostPercent?.[0];
  const oddsError = fieldErrors.boostedOddsAmerican?.[0];
  const scopeError = fieldErrors.scope?.[0];
  const stakeError = fieldErrors.maxStake?.[0];
  const winningsError = fieldErrors.maxWinnings?.[0];
  const minOddsError = fieldErrors.minOddsAmerican?.[0];
  const pinError = fieldErrors.pinned?.[0];
  const expiresError = fieldErrors.expires?.[0];

  const oddsMode = draft.boostMode === "odds";
  const [moreOpen, setMoreOpen] = useState(false);
  // Errors inside the collapsed section must never stay hidden.
  const open =
    moreOpen ||
    Boolean(winningsError) ||
    Boolean(minOddsError) ||
    Boolean(expiresError) ||
    (!oddsMode && Boolean(pinError));

  const selectedEvent =
    draft.scope.mode === "game" && draft.scope.eventId
      ? (options.events.find((e) => e.eventId === draft.scope.eventId) ?? null)
      : null;
  const pickableMarkets = (selectedEvent?.markets ?? []).filter((m) => m.pinned !== null);
  const marketLabel = (value: string | null) =>
    value === null || value === "best"
      ? "Best available (app picks)"
      : (selectedEvent?.markets.find((m) => m.value === value)?.label ?? "Pick a bet");

  function changeScope(scope: ScopeDraft) {
    const sameGame = scope.mode === "game" && draft.scope.mode === "game" && scope.eventId === draft.scope.eventId;
    onDraftChange({ ...draft, scope, pinValue: sameGame ? draft.pinValue : null });
  }

  const pinSelect = (required: boolean) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="add-pin">Market / side</Label>
      <Select
        value={required ? (draft.pinValue ?? undefined) : (draft.pinValue ?? "best")}
        onValueChange={(v) => onDraftChange({ ...draft, pinValue: v === null || v === "best" ? null : v })}
      >
        <SelectTrigger
          id="add-pin"
          className="h-11 w-full"
          disabled={disabled || selectedEvent === null}
          aria-invalid={pinError ? true : undefined}
          aria-describedby={pinError ? "add-pin-error" : undefined}
        >
          <SelectValue placeholder={required ? "Pick a bet" : "Best available (app picks)"}>
            {(value: string | null) => marketLabel(value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {required ? null : <SelectItem value="best">Best available (app picks)</SelectItem>}
          {pickableMarkets.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {required ? (
        <p className="text-sm text-muted-foreground">Pick the exact bet this price is for.</p>
      ) : null}
      {selectedEvent === null ? (
        <p className="text-sm text-muted-foreground">Choose One game above first.</p>
      ) : null}
      <FieldError id="add-pin-error" message={pinError} />
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label>Boost as</Label>
        <ToggleGroup
          className="w-full"
          value={[draft.boostMode]}
          onValueChange={(values) => {
            const next = values[0];
            if (next === "percent" || next === "odds") onDraftChange({ ...draft, boostMode: next });
          }}
          disabled={disabled}
        >
          <ToggleGroupItem value="percent" className="min-h-11 flex-1 px-4">
            Boost %
          </ToggleGroupItem>
          <ToggleGroupItem value="odds" className="min-h-11 flex-1 px-4">
            Boosted odds
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {oddsMode ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-boosted-odds">Boosted odds</Label>
          <Input
            id="add-boosted-odds"
            name="boostedOdds"
            inputMode="text"
            autoComplete="off"
            placeholder="+250"
            className="num h-11 text-base"
            value={draft.boostedOdds}
            onChange={(e) => onDraftChange({ ...draft, boostedOdds: e.target.value })}
            disabled={disabled}
            aria-invalid={oddsError ? true : undefined}
            aria-describedby={oddsError ? "add-boosted-odds-error" : undefined}
          />
          <FieldError id="add-boosted-odds-error" message={oddsError} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-boost-percent">Boost %</Label>
          <div className="relative">
            <Input
              id="add-boost-percent"
              name="boostPercent"
              inputMode="decimal"
              autoComplete="off"
              placeholder="50"
              className="num h-11 pr-8 text-base"
              value={draft.boostPercent}
              onChange={(e) => onDraftChange({ ...draft, boostPercent: e.target.value })}
              disabled={disabled}
              aria-invalid={percentError ? true : undefined}
              aria-describedby={percentError ? "add-boost-percent-error" : undefined}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
              %
            </span>
          </div>
          <FieldError id="add-boost-percent-error" message={percentError} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <ScopePicker
          idPrefix="add"
          label="Game(s)"
          draft={draft.scope}
          onDraftChange={changeScope}
          options={options}
          disabled={disabled}
        />
        <FieldError id="add-scope-error" message={scopeError} />
      </div>

      {oddsMode ? pinSelect(true) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="add-max-stake">Max stake</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
            $
          </span>
          <Input
            id="add-max-stake"
            name="maxStake"
            inputMode="decimal"
            autoComplete="off"
            className="num h-11 pl-7 text-base"
            value={draft.maxStake}
            onChange={(e) => onDraftChange({ ...draft, maxStake: e.target.value })}
            disabled={disabled}
            aria-invalid={stakeError ? true : undefined}
            aria-describedby={stakeError ? "add-max-stake-error" : undefined}
          />
        </div>
        <p className="text-sm text-muted-foreground">Every boost needs a max stake so the math never guesses.</p>
        <FieldError id="add-max-stake-error" message={stakeError} />
      </div>

      <Collapsible className="flex flex-col gap-4" open={open} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-sm">
          <span>More details (optional)</span>
          <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="add-max-winnings">Max winnings</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                $
              </span>
              <Input
                id="add-max-winnings"
                name="maxWinnings"
                inputMode="decimal"
                autoComplete="off"
                className="num h-11 pl-7 text-base"
                value={draft.maxWinnings}
                onChange={(e) => onDraftChange({ ...draft, maxWinnings: e.target.value })}
                disabled={disabled}
                aria-invalid={winningsError ? true : undefined}
                aria-describedby={winningsError ? "add-max-winnings-error" : undefined}
              />
            </div>
            <ToggleGroup
              className="w-full"
              value={[draft.maxWinningsKind]}
              onValueChange={(values) => {
                const next = values[0];
                if (next === "total_payout" || next === "boost_extra") {
                  onDraftChange({ ...draft, maxWinningsKind: next });
                }
              }}
              disabled={disabled}
            >
              <ToggleGroupItem value="total_payout" className="min-h-11 flex-1 px-4">
                Total payout
              </ToggleGroupItem>
              <ToggleGroupItem value="boost_extra" className="min-h-11 flex-1 px-4">
                Extra winnings
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldError id="add-max-winnings-error" message={winningsError} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="add-min-odds">Min odds</Label>
            <Input
              id="add-min-odds"
              name="minOdds"
              inputMode="text"
              autoComplete="off"
              placeholder="-200"
              className="num h-11 text-base"
              value={draft.minOdds}
              onChange={(e) => onDraftChange({ ...draft, minOdds: e.target.value })}
              disabled={disabled}
              aria-invalid={minOddsError ? true : undefined}
              aria-describedby={minOddsError ? "add-min-odds-error" : undefined}
            />
            <FieldError id="add-min-odds-error" message={minOddsError} />
          </div>

          {oddsMode ? null : pinSelect(false)}

          <ExpiryField
            idPrefix="add"
            allowDefault
            etDate={draft.boostExpiresEtDate}
            etTime={draft.boostExpiresEtTime}
            onChange={(next) =>
              onDraftChange({ ...draft, boostExpiresEtDate: next.etDate, boostExpiresEtTime: next.etTime })
            }
            error={expiresError}
            disabled={disabled}
          />
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
