/**
 * quick-260927-n12: Denver-day bucketing and period-start helpers
 * for the persisted profit observations. No I/O, no imports from
 * src/db or src/ingestion (mirrors src/domain/promos/rankPromoHedges.ts's
 * pure-domain boundary). Every money value is a decimal.js Decimal or a
 * fixed 2-dp string -- CLAUDE.md forbids native float money math.
 */

/**
 * "YYYY-MM-DD" in America/Denver for the given instant, DST-safe because
 * Intl.DateTimeFormat resolves the real MST/MDT offset for that instant
 * (mirrors src/domain/promos/etTime.ts's "no new dependency" approach).
 * formatToParts is assembled explicitly rather than trusting locale output
 * order.
 */
const DENVER_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Denver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function denverDate(instant: Date): string {
  const parts = DENVER_DATE_FORMATTER.formatToParts(instant);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export interface PeriodStartDates {
  today: string;
  weekStart: string;
  monthStart: string;
}

/**
 * Rolling period starts derived from denverDate(now), using Date.UTC on the
 * DATE STRING (never local-time Date methods, which would reintroduce the
 * machine's own timezone). "Last 7 days" and "Last 30 days" both include
 * today: weekStart is today minus 6 days, monthStart is today minus 29 days
 * (Date.UTC normalizes day underflow across month/year boundaries).
 */
export function periodStartDates(now: Date): PeriodStartDates {
  const today = denverDate(now);
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);

  return { today, weekStart, monthStart };
}

/**
 * Add n (may be negative) calendar days to a "YYYY-MM-DD" string. Uses
 * Date.UTC on the date string so the machine's timezone never leaks in.
 */
export function addDays(date: string, n: number): string {
  const [year, month, day] = date.split("-").map((v) => parseInt(v, 10));
  return toDateString(new Date(Date.UTC(year, month - 1, day + n)));
}

function toDateString(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** One persisted per-promo, per-Denver-day best-observed-profit record. */
export interface ProfitObservation {
  promoId: number;
  bookKey: string;
  denverDate: string;
  maxGuaranteedProfit: string;
}
