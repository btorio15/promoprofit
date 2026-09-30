"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AddPromoDraft, AddPromoFieldErrors } from "@/domain/promos/addPromoDraft";
import type { CorrectionOptions } from "@/domain/promos/dto";
import { ExpiryField } from "./ExpiryField";
import { ScopePicker } from "./ScopePicker";

interface BonusBetFieldsProps {
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

/** Bonus-bet fields: amount, Expires, and "More details (optional)" (Game(s), Min odds). */
export function BonusBetFields({ draft, onDraftChange, options, fieldErrors, disabled }: BonusBetFieldsProps) {
  const amountError = fieldErrors.bonusAmount?.[0];
  const oddsError = fieldErrors.minOddsAmerican?.[0];
  const scopeError = fieldErrors.scope?.[0];
  const [moreOpen, setMoreOpen] = useState(false);
  // Errors inside the collapsed section must never stay hidden.
  const open = moreOpen || Boolean(oddsError) || Boolean(scopeError);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-bonus-amount">Bonus amount</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
            $
          </span>
          <Input
            id="add-bonus-amount"
            name="bonusAmount"
            inputMode="decimal"
            autoComplete="off"
            className="num h-11 pl-7 text-base"
            value={draft.bonusAmount}
            onChange={(e) => onDraftChange({ ...draft, bonusAmount: e.target.value })}
            disabled={disabled}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? "add-bonus-amount-error" : undefined}
          />
        </div>
        <FieldError id="add-bonus-amount-error" message={amountError} />
      </div>

      <ExpiryField
        idPrefix="add"
        etDate={draft.expiresEtDate}
        etTime={draft.expiresEtTime}
        onChange={(next) => onDraftChange({ ...draft, expiresEtDate: next.etDate, expiresEtTime: next.etTime })}
        helper="Bonus bets usually expire in 7 days."
        error={fieldErrors.expires?.[0]}
        disabled={disabled}
      />

      <Collapsible className="flex flex-col gap-4" open={open} onOpenChange={setMoreOpen}>
        <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-sm">
          <span>More details (optional)</span>
          <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <ScopePicker
              idPrefix="add"
              label="Game(s)"
              draft={draft.scope}
              onDraftChange={(scope) => onDraftChange({ ...draft, scope })}
              options={options}
              disabled={disabled}
            />
            <p className="text-sm text-muted-foreground">
              Leave blank and we&apos;ll find the best game to use it on.
            </p>
            <FieldError id="add-scope-error" message={scopeError} />
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
              aria-invalid={oddsError ? true : undefined}
              aria-describedby={oddsError ? "add-min-odds-error" : undefined}
            />
            <FieldError id="add-min-odds-error" message={oddsError} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}
