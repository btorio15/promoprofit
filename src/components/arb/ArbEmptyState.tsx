import Link from "next/link";
import { Button } from "@/components/ui/button";

export type ArbEmptyStateVariant = "no-arbs" | "no-cached-odds" | "no-books-covered";

// "no-arbs" needs an optional runtime sportLabel to render its per-sport
// override copy, and "no-books-covered" renders a "Manage your books" link
// -- both are handled by early-return branches below rather than a plain
// COPY entry (mirrors the finder's EmptyState pattern).
const COPY: Record<Exclude<ArbEmptyStateVariant, "no-books-covered">, { heading: string; body: string }> = {
  "no-arbs": {
    heading: "No arbs right now",
    body: "No two-way price gaps across your Colorado books at the moment. Try refreshing odds, or search spreads & totals for more markets.",
  },
  "no-cached-odds": {
    heading: "No odds cached yet",
    body: "Press Refresh odds to pull current Colorado odds before searching — odds haven't been fetched yet.",
  },
};

interface ArbEmptyStateProps {
  variant: ArbEmptyStateVariant;
  /**
   * Sport tab label: when a single sport's tab has zero arbs, name that
   * sport instead of showing the "no arbs at all" copy. Omit for the
   * verbatim "all" tab copy.
   */
  sportLabel?: string;
}

/** Verbatim UI-SPEC copy for the arbitrage tab's empty states. */
export function ArbEmptyState({ variant, sportLabel }: ArbEmptyStateProps) {
  if (variant === "no-arbs" && sportLabel) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
        <h3 className="text-xl font-semibold">No qualifying {sportLabel} arbs right now</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          Try another sport tab, or refresh odds to look for new games.
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
