"use client";

import type { SyntheticEvent } from "react";
import { useState, useTransition } from "react";
import { setPromoCapAction } from "@/app/actions/set-promo-cap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/format";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

interface YourCapFieldProps {
  promoId: number;
  /** The promo's own max stake (the book's page). */
  promoCap: string;
  /** The member's override, or null when none is set. */
  override: string | null;
  onChanged: () => void;
}

/**
 * quick-261001-dhn: inline "Your cap" on a profit-boost row -- the member's
 * own account max stake. Saves instantly (no confirm dialog) and calls
 * onChanged, the existing in-place refetch of Promos + Opportunities. The
 * parent keys this component on the override so the input re-syncs after a
 * refetch. Numbers are sent as trimmed strings; the server validates.
 *
 * The row's content layer is pointer-events-none over an overlay trigger,
 * so the wrapper opts back in and stops click/pointer/key events so typing
 * or tapping never toggles the row's Collapsible.
 */
export function YourCapField({ promoId, promoCap, override, onChanged }: YourCapFieldProps) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(override ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function save(next: string | null) {
    startTransition(async () => {
      const call = await safeAction(() => setPromoCapAction({ promoId, maxStake: next }), "setPromoCapAction");
      if (!call.ok) {
        setErrorMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      if (call.value.status === "ok") {
        setErrorMessage(null);
        onChanged();
        return;
      }
      setErrorMessage(call.value.message);
    });
  }

  function saveTyped() {
    const trimmed = value.trim();
    save(trimmed === "" ? null : trimmed);
  }

  function stop(event: SyntheticEvent) {
    event.stopPropagation();
  }

  return (
    <div
      className="pointer-events-auto flex flex-col gap-1"
      onClick={stop}
      onPointerDown={stop}
      onKeyDown={stop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`your-cap-${promoId}`} className="text-sm text-muted-foreground">
          Your cap
        </label>
        <Input
          id={`your-cap-${promoId}`}
          aria-label="Your max stake for this boost"
          inputMode="decimal"
          autoComplete="off"
          className="min-h-10 w-24"
          placeholder={formatUsd(promoCap).replace("$", "")}
          value={value}
          disabled={isPending}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              saveTyped();
            }
          }}
        />
        <Button type="button" variant="ghost" size="sm" className="min-h-10" disabled={isPending} onClick={saveTyped}>
          Save
        </Button>
        {override !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-10"
            disabled={isPending}
            onClick={() => save(null)}
          >
            Use book&apos;s cap
          </Button>
        ) : null}
      </div>
      <span className="text-sm text-muted-foreground">
        {override === null
          ? `Book's cap: ${formatUsd(promoCap)}`
          : `Using your cap (book says ${formatUsd(promoCap)})`}
      </span>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
