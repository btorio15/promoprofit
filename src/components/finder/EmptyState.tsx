export type EmptyStateVariant = "no-search" | "no-cached-odds" | "no-results";

const COPY: Record<EmptyStateVariant, { heading: string; body: string }> = {
  "no-search": {
    heading: "Enter a book and bonus amount to find your hedge",
    body: "Pick the book holding your bonus bet, enter the amount, and press Find hedges to see ranked conversion markets.",
  },
  "no-cached-odds": {
    heading: "No odds cached yet",
    body: "Press Refresh odds to pull current Colorado odds before searching — odds haven't been fetched yet.",
  },
  "no-results": {
    heading: "No qualifying markets right now",
    body: "No games in the selected sport are in season this week. Clear the sport filter or refresh odds.",
  },
};

interface EmptyStateProps {
  variant: EmptyStateVariant;
}

/** Verbatim UI-SPEC copy for the finder's three non-error empty states. */
export function EmptyState({ variant }: EmptyStateProps) {
  const { heading, body } = COPY[variant];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
      <h3 className="text-xl font-semibold">{heading}</h3>
      <p className="max-w-prose text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
