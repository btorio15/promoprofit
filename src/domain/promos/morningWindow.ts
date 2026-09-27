/**
 * quick-260927-n12 (owner scope change B): pure Denver-hour gate for the
 * once-daily morning odds refresh + profit-observation recording.
 * .github/workflows/scrape-promos.yml runs the scraper three times a day
 * (8am/noon/5pm America/Denver, one cron schedule with `timezone:
 * "America/Denver"`) -- only the 8am run should also spend a moneyline
 * Odds API refresh and record observations; the noon/5pm runs must not.
 * DST-safe via Intl.DateTimeFormat (same technique as this file's sibling
 * profitTotals.ts's denverDate), never a hardcoded UTC offset. Pure, no I/O.
 */

const DENVER_HOUR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  hour: "numeric",
  hourCycle: "h23",
});

/** The America/Denver wall-clock hour (0-23) for the given instant. */
export function denverHour(instant: Date): number {
  const parts = DENVER_HOUR_FORMATTER.formatToParts(instant);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(hour, 10);
}

/**
 * True only before 10am Denver time -- the 8am cron run's window, with a
 * two-hour buffer for scheduling delay. The scraper's other scheduled runs
 * (noon, 5pm Denver) always fall outside this window and never match.
 */
export function isMorningObservationWindow(instant: Date): boolean {
  return denverHour(instant) < 10;
}
