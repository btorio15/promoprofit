"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  MARKETS_GROUP_HELPER,
  MARKET_AVAILABILITY_NOTE,
  groupBookOptions,
  type BookPickerOption,
} from "./bookPickerGroups";

export interface BookPickerProps {
  books: BookPickerOption[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

/**
 * Shared checkbox list for picking hedge venues (D-10, D-14), reused
 * verbatim by the onboarding step and the Settings page (D-11/D-12) so the
 * two flows can never drift onto different rows or copy. Sportsbooks render
 * first; when prediction-market venues are present they get their own opt-in
 * group with a CFTC availability note under a ticked row. Each row is a
 * full-width tappable Label wrapping its Checkbox.
 */
export function BookPicker({ books, selected, onChange, disabled }: BookPickerProps) {
  const { sportsbooks, markets } = groupBookOptions(books);

  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    onChange(next);
  }

  function renderRow(book: BookPickerOption, withNote: boolean) {
    const ticked = selected.has(book.key);
    const noteId = `book-${book.key}-note`;
    return (
      <div key={book.key} className="flex flex-col">
        <Label
          htmlFor={`book-${book.key}`}
          className="min-h-10 w-full cursor-pointer gap-2 font-normal"
        >
          <Checkbox
            id={`book-${book.key}`}
            checked={ticked}
            onCheckedChange={(checked) => toggle(book.key, checked === true)}
            disabled={disabled}
            aria-describedby={withNote && ticked ? noteId : undefined}
          />
          {book.displayName}
        </Label>
        {withNote && ticked ? (
          <p id={noteId} className="pl-6 text-xs text-muted-foreground">
            {MARKET_AVAILABILITY_NOTE}
          </p>
        ) : null}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="flex flex-col gap-4">{sportsbooks.map((b) => renderRow(b, false))}</div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-medium">Sportsbooks</h3>
        {sportsbooks.map((b) => renderRow(b, false))}
      </div>
      <Separator />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Prediction markets</h3>
          <p className="text-xs text-muted-foreground">{MARKETS_GROUP_HELPER}</p>
        </div>
        {markets.map((b) => renderRow(b, true))}
      </div>
    </div>
  );
}
