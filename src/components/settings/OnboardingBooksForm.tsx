"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBooks } from "@/app/actions/save-books";
import { safeAction } from "@/lib/safeAction";
import { resolveSaveBooksOutcome } from "./saveBooksOutcome";
import { Button } from "@/components/ui/button";
import { BookPicker } from "./BookPicker";

export interface OnboardingBooksFormProps {
  books: { key: string; displayName: string }[];
}

/**
 * "Pick your books" onboarding step (D-08, D-09). Starts with nothing
 * checked -- the user must actively pick at least one book, never a
 * pre-ticked default. Continue is disabled until the selection is
 * non-empty; saveBooks re-validates server-side regardless (D-10), and its
 * generic "Select at least one book." message is reworded here to match
 * this screen's copy contract.
 */
export function OnboardingBooksForm({ books }: OnboardingBooksFormProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleContinue() {
    startTransition(async () => {
      const call = await safeAction(
        () => saveBooks({ bookKeys: Array.from(selected) }),
        "saveBooks",
      );
      const outcome = resolveSaveBooksOutcome(call, "onboarding");
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      router.push("/");
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
        }}
        disabled={isPending}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="h-10 w-full"
        disabled={selected.size === 0 || isPending}
        onClick={handleContinue}
      >
        Continue
      </Button>
    </div>
  );
}
