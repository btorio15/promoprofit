"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBookCapAction } from "@/app/actions/set-book-cap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_MAX_STAKE } from "@/domain/promos/yourCap";
import { formatUsd } from "@/lib/format";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

export interface SettingsBookCapsFormProps {
  books: { key: string; displayName: string }[];
  /** Saved max bets keyed by book key (plain object so it serializes). */
  caps: Record<string, string>;
}

interface BookCapRowProps {
  book: { key: string; displayName: string };
  saved: string | null;
}

function BookCapRow({ book, saved }: BookCapRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(saved ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function save(next: string | null) {
    startTransition(async () => {
      const call = await safeAction(() => setBookCapAction({ bookKey: book.key, maxStake: next }), "setBookCapAction");
      if (!call.ok) {
        setErrorMessage(ACTION_FAILED_MESSAGE);
        return;
      }
      if (call.value.status === "ok") {
        setErrorMessage(null);
        if (next === null) setValue("");
        router.refresh();
        return;
      }
      setErrorMessage(call.value.message);
    });
  }

  function saveTyped() {
    const trimmed = value.trim();
    save(trimmed === "" ? null : trimmed);
  }

  const inputId = `book-cap-${book.key}`;

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="min-w-28 text-sm">
          {book.displayName}
        </label>
        <Input
          id={inputId}
          aria-label={`Max bet for ${book.displayName}`}
          inputMode="decimal"
          autoComplete="off"
          className="min-h-10 w-24"
          placeholder={formatUsd(DEFAULT_MAX_STAKE).replace("$", "")}
          value={value}
          disabled={isPending}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              saveTyped();
            }
          }}
        />
        <Button type="button" variant="ghost" size="sm" className="min-h-10" disabled={isPending} onClick={saveTyped}>
          Save
        </Button>
        {saved !== null ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-10"
            disabled={isPending}
            onClick={() => save(null)}
          >
            Use {formatUsd(DEFAULT_MAX_STAKE)} default
          </Button>
        ) : null}
      </div>
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </li>
  );
}

/**
 * quick-261014-u6k: "Max bet per book" card on the Settings page. One row per
 * saved book; empty + Save (or the default button) clears the value so the
 * book goes back to the default max bet. The server validates everything.
 */
export function SettingsBookCapsForm({ books, caps }: SettingsBookCapsFormProps) {
  if (books.length === 0) {
    return <p className="text-sm text-muted-foreground">Pick your books above first.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {books.map((book) => (
        <BookCapRow key={`${book.key}:${caps[book.key] ?? "none"}`} book={book} saved={caps[book.key] ?? null} />
      ))}
    </ul>
  );
}
