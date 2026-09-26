"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface BookPickerProps {
  books: { key: string; displayName: string }[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

/**
 * Shared 7-row checkbox list for picking Colorado sportsbooks (D-10),
 * reused verbatim by the onboarding step and the Settings page (D-11/D-12)
 * so the two flows can never drift onto different rows or copy. Each row is
 * a full-width tappable Label wrapping its Checkbox -- the whole row is the
 * tap target, matching the finder's existing "Limit hedge amount"
 * checkbox-row idiom (UI-SPEC).
 */
export function BookPicker({ books, selected, onChange, disabled }: BookPickerProps) {
  function toggle(key: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {books.map((book) => (
        <Label
          key={book.key}
          htmlFor={`book-${book.key}`}
          className="min-h-10 w-full cursor-pointer gap-2 font-normal"
        >
          <Checkbox
            id={`book-${book.key}`}
            checked={selected.has(book.key)}
            onCheckedChange={(checked) => toggle(book.key, checked === true)}
            disabled={disabled}
          />
          {book.displayName}
        </Label>
      ))}
    </div>
  );
}
