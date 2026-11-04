"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  correctionPreview,
  refundPreview,
  type CorrectionInput,
  type SettleOutcome,
} from "@/components/opportunities/trackedCardView";

interface NoSweatCorrectionFieldsProps {
  values: CorrectionInput;
  onChange: (next: CorrectionInput) => void;
  /** Promo refund cap, for the "You'd get back" line. */
  refundCap: string;
  /** Outcome the live "Profit would be" preview is for (omit for no preview). */
  previewOutcome?: SettleOutcome;
  /** "What you actually made": only for push / void (D-04). */
  actualProfit?: { value: string; onChange: (next: string) => void };
}

/**
 * Phase 9 (A-09): the four "what you actually bet" inputs plus the live,
 * display-only preview. The server validates and recomputes (T-09-48).
 */
export function NoSweatCorrectionFields({
  values,
  onChange,
  refundCap,
  previewOutcome,
  actualProfit,
}: NoSweatCorrectionFieldsProps) {
  const id = useId();
  const preview = previewOutcome ? correctionPreview(null, values, previewOutcome) : null;
  const refund = refundPreview(refundCap, values.qualifyingStake);

  function field(key: keyof CorrectionInput, label: string, kind: "money" | "odds") {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-${key}`}>{label}</Label>
        <Input
          id={`${id}-${key}`}
          className="num h-11"
          inputMode={kind === "money" ? "decimal" : "text"}
          autoComplete="off"
          value={values[key]}
          onChange={(e) => onChange({ ...values, [key]: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Change these if you didn&apos;t bet exactly what we showed. We&apos;ll work out the profit again.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("qualifyingStake", "What you bet", "money")}
        {field("qualifyingOdds", "Odds you got", "odds")}
        {field("hedgeStake", "Hedge amount", "money")}
        {field("hedgeOdds", "Hedge odds", "odds")}
      </div>
      {actualProfit ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-actual`}>What you actually made</Label>
          <Input
            id={`${id}-actual`}
            className="num h-11 sm:max-w-48"
            inputMode="decimal"
            autoComplete="off"
            value={actualProfit.value}
            onChange={(e) => actualProfit.onChange(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Only if a push or void didn&apos;t come out to $0.00.
          </p>
        </div>
      ) : null}
      {preview ? (
        <p className="num text-base" aria-live="polite">
          {preview}
        </p>
      ) : null}
      {refund ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {refund}
        </p>
      ) : null}
    </div>
  );
}
