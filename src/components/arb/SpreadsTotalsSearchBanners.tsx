"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SearchBanner } from "./spreadsTotalsSearch";

/** The blocked / info / busy-or-error banners for the spreads & totals search (shared by ArbForm and the status bar). */
export function SpreadsTotalsSearchBanners({ banner, onRetry }: { banner: SearchBanner | null; onRetry: () => void }) {
  if (banner === null) return null;

  if (banner.kind === "blocked") {
    return (
      <Alert variant="destructive">
        <AlertDescription className="num">{banner.message}</AlertDescription>
      </Alert>
    );
  }

  if (banner.kind === "info") {
    return (
      <Alert>
        <AlertDescription className="num">{banner.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{banner.message}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}
