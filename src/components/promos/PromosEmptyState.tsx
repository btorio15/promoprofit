import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PromosEmptyVariant } from "@/domain/promos/dto";

// "no-books" renders a "Manage your books" link -- handled by an early
// return below rather than a static COPY entry, mirroring
// src/components/finder/EmptyState.tsx's "no-books-covered" branch.
const COPY: Record<Exclude<PromosEmptyVariant, "no-books">, { heading: string; body: string }> = {
  "none-scraped": {
    heading: "No promos scraped yet",
    body: "The scheduled scraper hasn't completed a run yet. Check back after the next scheduled run, or ask the person who set this up to trigger one.",
  },
  "no-active": {
    heading: "No active promos right now",
    body: "None of the scraped promos currently qualify for a hedge. New ones appear automatically after the next scheduled scrape.",
  },
  "no-odds": {
    heading: "No odds cached yet",
    body: "Press Refresh odds to pull current Colorado odds before these promos can show a hedge.",
  },
};

interface PromosEmptyStateProps {
  variant: PromosEmptyVariant;
}

/** Verbatim UI-SPEC copy for the Promos tab's four empty states (03-UI-SPEC.md "Empty states"). */
export function PromosEmptyState({ variant }: PromosEmptyStateProps) {
  if (variant === "no-books") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
        <h3 className="text-xl font-semibold">No promos at your books right now</h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          None of the currently active promos are hedgeable at the sportsbooks you&apos;ve selected. Add
          more books to see more opportunities.
        </p>
        <div>
          <Button variant="outline" render={<Link href="/settings" />}>
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
