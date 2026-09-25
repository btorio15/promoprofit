/**
 * Pure odds-age helper (ODDS-03, D-12). No I/O, no system clock read — the
 * caller always supplies `now` so this stays deterministic and testable.
 */
export const STALE_AFTER_MINUTES = 120;

export interface OddsAgeDescription {
  minutes: number | null;
  stale: boolean;
  label: string;
}

/**
 * fetchedAt null -> "Odds not fetched yet" (never stale, nothing to warn
 * about). Otherwise minutes is the floored elapsed minutes since fetchedAt,
 * and stale is true once minutes exceeds STALE_AFTER_MINUTES (2 hours).
 */
export function describeOddsAge(fetchedAt: Date | null, now: Date): OddsAgeDescription {
  if (fetchedAt === null) {
    return { minutes: null, stale: false, label: "Odds not fetched yet" };
  }

  const minutes = Math.floor((now.getTime() - fetchedAt.getTime()) / 60_000);
  const stale = minutes > STALE_AFTER_MINUTES;
  return { minutes, stale, label: `Odds updated ${minutes} min ago` };
}
