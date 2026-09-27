import type { ScrapeStatusLineDTO } from "@/domain/promos/dto";

/**
 * Pure scrape-freshness helper (D-08). No I/O, no system clock read -- the
 * caller always supplies `now`, mirroring src/components/finder/oddsAge.ts's
 * describeOddsAge discipline. Copy is verbatim from
 * 03-UI-SPEC.md's Copywriting Contract.
 */
export interface ScrapeStatusDescription {
  label: string;
  warning: boolean;
}

/**
 * lastOkAt null -> "{Book} promos not scraped yet" (D-08's "never run"
 * state); otherwise "{Book} promos updated {N} min ago" under an hour, else
 * "{Book} promos updated {N}h ago" (floored hours). A failed latest run
 * appends " · last run failed" and sets warning true in either branch --
 * existing promos aren't wiped by a failed run, so this is a freshness
 * caveat, never destructive styling (03-UI-SPEC.md Color section).
 */
export function describeScrapeStatus(line: ScrapeStatusLineDTO, now: Date): ScrapeStatusDescription {
  const failedSuffix = line.lastRunFailed ? " · last run failed" : "";

  if (line.lastOkAt === null) {
    return {
      label: `${line.bookName} promos not scraped yet${failedSuffix}`,
      warning: line.lastRunFailed,
    };
  }

  const lastOkAtDate = new Date(line.lastOkAt);
  const minutes = Math.floor((now.getTime() - lastOkAtDate.getTime()) / 60_000);
  const ageLabel = minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)}h ago`;

  return {
    label: `${line.bookName} promos updated ${ageLabel}${failedSuffix}`,
    warning: line.lastRunFailed,
  };
}
