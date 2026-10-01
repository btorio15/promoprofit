"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { describePriceAge } from "@/domain/promos/priceAge";

/** How often the client re-checks whether a row's prices have gone stale. */
const TICK_MS = 30_000;

/**
 * quick-261001-e1j: "Prices as of 9:43 AM" under a profitable row, turning
 * into an amber "Odds may have moved" note once the prices are over 15
 * minutes old. The clock is only read after mount (null on the server and
 * first client render, so there is no hydration mismatch) and re-ticks every
 * 30 seconds, so a row that was fresh when loaded flips to stale without a
 * refetch. All decisions live in describePriceAge; this only renders. It
 * never hides, dims or reorders the row (D-03).
 */
export function PriceAgeNote({
  pricesAsOf,
}: {
  pricesAsOf: string | null | undefined;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the clock only after mount to avoid a hydration mismatch
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;
  const age = describePriceAge(pricesAsOf ?? null, now);
  if (age === null) return null;

  if (!age.stale) {
    return <span className="text-sm text-muted-foreground">{age.label}</span>;
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-sm text-warning">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>{age.label} — </span>
      <span className="font-semibold">
        Odds may have moved — refresh before betting
      </span>
    </span>
  );
}
