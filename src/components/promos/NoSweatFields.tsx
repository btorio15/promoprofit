"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AddPromoDraft, AddPromoFieldErrors } from "@/domain/promos/addPromoDraft";
import type { CorrectionOptions } from "@/domain/promos/dto";
import { PROMO_MARKET_TYPES, type PromoMarketType } from "@/domain/promos/types";
import { ExpiryField } from "./ExpiryField";
import { ScopePicker } from "./ScopePicker";

interface NoSweatFieldsProps {
  draft: AddPromoDraft;
  onDraftChange: (next: AddPromoDraft) => void;
  options: CorrectionOptions;
  fieldErrors: AddPromoFieldErrors;
  disabled?: boolean;
}

const ANY_MARKET = "any";
const MARKET_LABELS: Record<PromoMarketType, string> = {
  moneyline: "Moneyline",
  spread: "Spread",
  total: "Total",
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/**
 * Phase 9 (D-13, D-14): no-sweat fields for the Add/Edit promo form -- refund
 * cap, min odds, sport or league, Expires, and an optional Bet type. Client
 * checks are a convenience; the server re-validates (T-09-50).
 */
export function NoSweatFields({ draft, onDraftChange, options, fieldErrors, disabled }: NoSweatFieldsProps) {
  const capError = fieldErrors.refundCap?.[0];
  const oddsError = fieldErrors.minOddsAmerican?.[0];
  const scopeError = fieldErrors.scope?.[0];
  const marketError = fieldErrors.marketType?.[0];
  const [moreOpen, setMoreOpen] = useState(false);
  // Errors inside the collapsed section must never stay hidden.
  const open = moreOpen || Boolean(marketError);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-nosweat-cap">Most you get back</Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
            $
          </span>
          <Input
            id="add-nosweat-cap"
            name="refundCap"
            inputMode="decimal"
            autoComplete="off"
            className="num h-11 pl-7 text-base"
            value={draft.refundCap}
            onChange={(e) => onDraftChange({ ...draft, refundCap: e.target.value })}
            disabled={disabled}
            aria-invalid={capError ? true : undefined}
            aria-describedby={capError ? "add-nosweat-cap-error" : undefined}
          />
        </div>
        <p className="text-sm text-muted-foreground">The biggest refund the promo gives you.</p>
        <FieldError id="add-nosweat-cap-error" message={capError} />
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
        <p className="text-sm text-muted-foreground">Leave blank if the promo has no odds rule.</p>
        <FieldError id="add-min-odds-error" message={oddsError} />
      </div>

      <div className="flex flex-col gap-2">
        <ScopePicker
          idPrefix="add"
          label="Sport or league"
          draft={draft.scope}
          onDraftChange={(scope) => onDraftChange({ ...draft, scope })}
          options={options}
          disabled={disabled}
        />
        <p className="text-sm text-muted-foreground">Which games count.</p>
        <FieldError id="add-scope-error" message={scopeError} />
      </div>

      <ExpiryField
        idPrefix="add"
        etDate={draft.expiresEtDate}
        etTime={draft.expiresEtTime}
        onChange={(next) => onDraftChange({ ...draft, expiresEtDate: next.etDate, expiresEtTime: next.etTime })}
        helper="No-sweats usually end in 7 days."
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
            <Label htmlFor="add-market-type">Bet type</Label>
            <Select
              value={draft.marketType ?? ANY_MARKET}
              onValueChange={(v) =>
                onDraftChange({
                  ...draft,
                  marketType: (PROMO_MARKET_TYPES as readonly string[]).includes(v ?? "") ? (v as PromoMarketType) : null,
                })
              }
            >
              <SelectTrigger
                id="add-market-type"
                className="h-11 w-full"
                disabled={disabled}
                aria-invalid={marketError ? true : undefined}
              >
                <SelectValue>
                  {(value: string | null) =>
                    value && value in MARKET_LABELS ? MARKET_LABELS[value as PromoMarketType] : "Any"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_MARKET}>Any</SelectItem>
                {PROMO_MARKET_TYPES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MARKET_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Pick one if the promo only works on that kind of bet.
            </p>
            <FieldError id="add-market-type-error" message={marketError} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="text-sm text-muted-foreground">The refund is paid as a bonus bet.</p>
    </>
  );
}
