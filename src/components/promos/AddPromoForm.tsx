"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { addPromo } from "@/app/actions/add-promo";
import { getAddPromoFormOptions } from "@/app/actions/get-add-promo-options";
import type { AddPromoFormOptions } from "@/domain/promos/addedPromoInput";
import {
  bonusPayloadFromDraft,
  emptyBonusDraft,
  type AddPromoDraft,
  type AddPromoFieldErrors,
} from "@/domain/promos/addPromoDraft";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BonusBetFields } from "./BonusBetFields";

interface AddPromoFormProps {
  onSaved: (message: string) => void;
  onCancel: () => void;
}

const SUCCESS_MESSAGE = "Promo added. It's live in your Promos and Opportunities.";
const SAVE_FAILED = "Couldn't save that promo. Check your connection and try again. Nothing was added.";
const LOAD_FAILED = "Couldn't load your books. Check your connection and try again.";

/** Order of fields for "first invalid field takes focus"; ids match the field components. */
const FOCUS_ORDER: { field: keyof AddPromoFieldErrors; id: string }[] = [
  { field: "bookKey", id: "add-book" },
  { field: "bonusAmount", id: "add-bonus-amount" },
  { field: "expires", id: "add-expires-day" },
  { field: "scope", id: "add-search" },
  { field: "minOddsAmerican", id: "add-min-odds" },
];

/**
 * Inline "Add a promo" panel (D-02). Bonus bet only in this plan; the profit
 * boost type and the Type toggle arrive in Plan 06. Client checks are a
 * convenience: addPromo re-validates everything server-side (T-5-input), and
 * the Book list only ever contains the member's own books (D-08, T-5-08).
 */
export function AddPromoForm({ onSaved, onCancel }: AddPromoFormProps) {
  const [formOptions, setFormOptions] = useState<AddPromoFormOptions | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState<AddPromoDraft>(() => emptyBonusDraft(new Date()));
  const [fieldErrors, setFieldErrors] = useState<AddPromoFieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoading, startLoad] = useTransition();
  const [isSaving, startSave] = useTransition();
  const bookRef = useRef<HTMLButtonElement | null>(null);
  const focusedOnOpen = useRef(false);

  useEffect(() => {
    startLoad(async () => {
      try {
        const result = await getAddPromoFormOptions({});
        setFormOptions(result);
      } catch (err) {
        console.error("getAddPromoFormOptions failed:", err);
        setLoadFailed(true);
      }
    });
  }, []);

  // Focus the Book select once, when the form body first renders.
  const ready = formOptions?.status === "ok" && formOptions.books.length > 0;
  useEffect(() => {
    if (ready && !focusedOnOpen.current) {
      focusedOnOpen.current = true;
      bookRef.current?.focus();
    }
  }, [ready]);

  function focusFirstInvalid(errors: AddPromoFieldErrors) {
    const target = FOCUS_ORDER.find((entry) => errors[entry.field]?.length);
    if (!target) return;
    // Wait a tick so a just-opened "More details" section has rendered.
    setTimeout(() => document.getElementById(target.id)?.focus(), 0);
  }

  function handleSave() {
    setSaveError(null);
    const result = bonusPayloadFromDraft(draft);
    if ("fieldErrors" in result) {
      setFieldErrors(result.fieldErrors);
      focusFirstInvalid(result.fieldErrors);
      return;
    }
    setFieldErrors({});

    startSave(async () => {
      try {
        const outcome = await addPromo(result.payload);
        if (outcome.status === "ok") {
          onSaved(SUCCESS_MESSAGE);
          return;
        }
        if (outcome.status === "invalid") {
          setFieldErrors(outcome.fieldErrors);
          focusFirstInvalid(outcome.fieldErrors);
          return;
        }
        // stale / not_found: the chosen game is gone.
        const errors: AddPromoFieldErrors = { scope: [outcome.message] };
        setFieldErrors(errors);
        focusFirstInvalid(errors);
      } catch (err) {
        console.error("addPromo failed:", err);
        setSaveError(SAVE_FAILED);
      }
    });
  }

  if (loadFailed || formOptions?.status === "invalid") {
    return (
      <div className="rounded-lg border border-border bg-secondary p-4">
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{LOAD_FAILED}</span>
            <Button type="button" variant="secondary" size="sm" className="min-h-11" onClick={onCancel}>
              Close
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (formOptions === null || isLoading) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (formOptions.books.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-background p-6">
        <h2 className="text-xl font-semibold">Pick your sportsbooks first</h2>
        <p className="text-base text-muted-foreground">
          You can only add promos for books you have. Add your books in settings.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11" render={<Link href="/settings" />}>
            Manage your books
          </Button>
          <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const { books, options } = formOptions;
  const bookError = fieldErrors.bookKey?.[0];
  const formErrors = [...(fieldErrors.form ?? []), ...(fieldErrors.promoType ?? [])];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary p-4">
      <h2 className="text-xl font-semibold">Add a promo</h2>

      {saveError ? (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      ) : null}
      {formErrors.length > 0 ? (
        <Alert variant="destructive">
          <AlertDescription>{formErrors[0]}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="add-book">Book</Label>
        <Select value={draft.bookKey ?? undefined} onValueChange={(v) => setDraft({ ...draft, bookKey: v ?? null })}>
          <SelectTrigger
            id="add-book"
            ref={bookRef}
            className="h-11 w-full"
            disabled={isSaving}
            aria-invalid={bookError ? true : undefined}
            aria-describedby={bookError ? "add-book-error" : undefined}
          >
            <SelectValue placeholder="Pick a sportsbook">
              {(value: string | null) => books.find((b) => b.key === value)?.displayName ?? "Pick a sportsbook"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {books.map((b) => (
              <SelectItem key={b.key} value={b.key}>
                {b.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {bookError ? (
          <p id="add-book-error" role="alert" className="text-sm text-destructive">
            {bookError}
          </p>
        ) : null}
      </div>

      <BonusBetFields
        draft={draft}
        onDraftChange={setDraft}
        options={options}
        fieldErrors={fieldErrors}
        disabled={isSaving}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save promo"
          )}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
