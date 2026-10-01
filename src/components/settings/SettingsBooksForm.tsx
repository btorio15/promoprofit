"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { saveBooks } from "@/app/actions/save-books";
import { safeAction } from "@/lib/safeAction";
import { resolveSaveBooksOutcome } from "./saveBooksOutcome";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BookPicker } from "./BookPicker";

export interface SettingsBooksFormProps {
  books: { key: string; displayName: string }[];
  initialKeys: string[];
}

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

/**
 * "My books" editing form on the Settings page (D-11, D-12). Starts
 * pre-checked with the user's persisted selection. "Save changes" is
 * disabled while the selection is empty, a save is in flight, or the
 * selection exactly matches what's already saved (no-op guard). Any
 * checkbox change clears a prior save confirmation, per UI-SPEC.
 *
 * The save-success confirmation includes a link back to / (owner gap
 * closure) so a successful save always leaves an obvious next step, with
 * no auto-redirect -- the inline confirmation must stay visible per
 * UI-SPEC.
 */
export function SettingsBooksForm({ books, initialKeys }: SettingsBooksFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(initialKeys));
  const [lastSaved, setLastSaved] = useState<Set<string>>(new Set(initialKeys));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isUnchanged = sameKeys(selected, lastSaved);

  function handleSave() {
    startTransition(async () => {
      const call = await safeAction(
        () => saveBooks({ bookKeys: Array.from(selected) }),
        "saveBooks",
      );
      const outcome = resolveSaveBooksOutcome(call, "settings");
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setError(null);
      setSaved(true);
      setLastSaved(new Set(outcome.bookKeys));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <BookPicker
        books={books}
        selected={selected}
        onChange={(next) => {
          setSelected(next);
          if (error) setError(null);
          if (saved) setSaved(false);
        }}
        disabled={isPending}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="h-10"
        disabled={selected.size === 0 || isPending || isUnchanged}
        onClick={handleSave}
      >
        Save changes
      </Button>
      {saved ? (
        <Alert>
          <AlertDescription>
            Your books were updated.{" "}
            <Link href="/" className="underline underline-offset-4">
              Back to PromoProfit
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
