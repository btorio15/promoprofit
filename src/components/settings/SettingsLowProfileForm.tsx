"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLowProfileAction } from "@/app/actions/set-low-profile";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LowProfileSettings } from "@/domain/promos/lowProfile";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

export interface SettingsLowProfileFormProps {
  initial: LowProfileSettings;
}

const SAVE_ERROR = "Couldn't save your Low-profile settings. Try again.";
const ODDS_ERROR = "Enter odds of +100 or longer, like 300.";

/**
 * Phase 9 (D-21): the "Low-profile" card on the Settings page. Explicit save;
 * the server re-validates everything (T-09-50).
 */
export function SettingsLowProfileForm({ initial }: SettingsLowProfileFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [oddsCapEnabled, setOddsCapEnabled] = useState(initial.oddsCapEnabled);
  const [oddsText, setOddsText] = useState(String(initial.oddsCapAmerican));
  const [mainLinesOnly, setMainLinesOnly] = useState(initial.mainLinesOnly);
  const [naturalStakes, setNaturalStakes] = useState(initial.naturalStakes);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    const trimmed = oddsText.trim().replace(/^\+/, "");
    const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
    const validOdds = Number.isInteger(parsed) && parsed >= 100;
    if (oddsCapEnabled && !validOdds) {
      setErrorMessage(ODDS_ERROR);
      return;
    }
    // When the cap is off, keep the last saved valid value so the row stays valid.
    const oddsCapAmerican = validOdds ? parsed : initial.oddsCapAmerican;
    setErrorMessage(null);
    startTransition(async () => {
      const call = await safeAction(
        () => setLowProfileAction({ oddsCapEnabled, oddsCapAmerican, mainLinesOnly, naturalStakes }),
        "setLowProfileAction",
      );
      if (!call.ok) {
        setErrorMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      if (call.value.status === "ok") {
        setSaved(true);
        router.refresh();
        return;
      }
      setErrorMessage(call.value.status === "invalid" ? call.value.message : SAVE_ERROR);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Low-profile</h2>
        <p className="text-sm text-muted-foreground">
          Settings that make a no-sweat bet look like a normal bet, so sportsbooks are less likely to limit your
          account. They only affect no-sweat suggestions.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex min-h-11 items-start gap-3">
          <Checkbox
            id="low-profile-odds-cap"
            checked={oddsCapEnabled}
            disabled={isPending}
            onCheckedChange={(checked) => setOddsCapEnabled(checked === true)}
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor="low-profile-odds-cap">Skip long odds</Label>
            <p className="text-sm text-muted-foreground">Don&apos;t suggest a bet longer than the odds below.</p>
          </div>
        </div>
        <div className={`flex flex-col gap-1 pl-7 ${oddsCapEnabled ? "" : "opacity-50"}`}>
          <Label htmlFor="low-profile-odds">Longest odds</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">+</span>
            <Input
              id="low-profile-odds"
              inputMode="numeric"
              autoComplete="off"
              className="h-11 w-28"
              value={oddsText}
              disabled={isPending || !oddsCapEnabled}
              aria-invalid={errorMessage === ODDS_ERROR}
              onChange={(event) => setOddsText(event.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">300 means +300.</p>
        </div>
      </div>

      <div className="flex min-h-11 items-start gap-3">
        <Checkbox
          id="low-profile-main-lines"
          checked={mainLinesOnly}
          disabled={isPending}
          onCheckedChange={(checked) => setMainLinesOnly(checked === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="low-profile-main-lines">Main lines only</Label>
          <p className="text-sm text-muted-foreground">
            Only suggest regular moneyline, spread and total bets, not alternate lines.
          </p>
        </div>
      </div>

      <div className="flex min-h-11 items-start gap-3">
        <Checkbox
          id="low-profile-natural-stakes"
          checked={naturalStakes}
          disabled={isPending}
          onCheckedChange={(checked) => setNaturalStakes(checked === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="low-profile-natural-stakes">Whole-dollar stakes</Label>
          <p className="text-sm text-muted-foreground">
            Round no-sweat bets to whole dollars so they look like a normal bet. This overrides your whole-dollar /
            cents choice for no-sweats only.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" className="min-h-11" disabled={isPending} onClick={save}>
          Save changes
        </Button>
        {saved && !errorMessage ? (
          <span role="status" className="text-sm text-muted-foreground">
            Saved
          </span>
        ) : null}
      </div>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
