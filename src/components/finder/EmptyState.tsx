import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/format";

export type EmptyStateVariant =
  | "no-search"
  | "no-cached-odds"
  | "no-results"
  | "no-results-under-limit"
  | "no-books-covered";

// "no-results-under-limit" needs a runtime maxHedgeAmount to render its body
// copy, and "no-books-covered" renders a "Manage your books" link -- both
// are handled by early-return branches below rather than a static COPY
// entry.
const COPY: Record<
  Exclude<EmptyStateVariant, "no-results-under-limit" | "no-books-covered">,
  { heading: string; body: string }
> = {
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
  /**
   * Sport tab label (owner-requested scope change, 01-05): when a single
   * sport's tab has zero results, name that sport instead of showing the
   * "clear the sport filter" copy that no longer applies now that sport is
   * a results-view tab, not a search input. Omit (or "All") for the
   * verbatim UI-SPEC "no-results" copy.
   */
  sportLabel?: string;
  /**
   * Required for variant "no-results-under-limit" (D-18): the 2dp max
   * hedge amount string to interpolate into the body copy.
   */
  maxHedgeAmount?: string;
}

/** Verbatim UI-SPEC copy for the finder's non-error empty states. */
export function EmptyState({ variant, sportLabel, maxHedgeAmount }: EmptyStateProps) {
  if (variant === "no-results" && sportLabel) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
        <h3 className="text-xl font-semibold">No qualifying {sportLabel} markets right now</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          Try another sport tab, or refresh odds to look for new games.
        </p>
      </div>
    );
  }

  if (variant === "no-results-under-limit") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
        <h3 className="text-xl font-semibold">No hedges fit under your limit</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          Every result needs a hedge stake above your {formatUsd(maxHedgeAmount ?? "0.00")} limit.
          Raise the limit or uncheck it to see all results.
        </p>
      </div>
    );
  }

  if (variant === "no-books-covered") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
        <h3 className="text-xl font-semibold">No games at your books right now</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          None of the upcoming games are offered at the sportsbooks you&apos;ve selected. Add more books to see more opportunities.
        </p>
        <div>
          <Button variant="outline" nativeButton={false} render={<Link href="/settings" />}>
            Manage your books
          </Button>
        </div>
      </div>
    );
  }

  const { heading, body } = COPY[variant];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
      <h3 className="text-xl font-semibold">{heading}</h3>
      <p className="max-w-prose text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
