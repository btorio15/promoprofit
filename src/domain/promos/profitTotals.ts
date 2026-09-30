import Decimal from "decimal.js";

/**
 * quick-260927-n12: pure money-sum, Denver-day bucketing, and per-period
 * dedupe/max for the Promos tab's "Total profit available" headline and
 * today/week/month "profit available" numbers. No I/O, no imports from
 * src/db or src/ingestion (mirrors src/domain/promos/rankPromoHedges.ts's
 * pure-domain boundary). Every money value is a decimal.js Decimal or a
 * fixed 2-dp string -- CLAUDE.md forbids native float money math.
 */

/** One own-book row candidate for the headline total (owner decision 1). */
export interface OwnBookProfitRow {
  promoId: number;
  guaranteedProfit: string;
  hasPromoBook: boolean;
}

/**
 * Exact-cent sum of guaranteed profit across rows at the member's own
 * books, excluding any promoId the member has marked used. Empty input (or
 * an input where every row is excluded) returns "0.00".
 */
export function sumOwnBookProfit(rows: OwnBookProfitRow[], usedPromoIds: ReadonlySet<number>): string {
  let total = new Decimal(0);
  for (const row of rows) {
    if (!row.hasPromoBook) continue;
    if (usedPromoIds.has(row.promoId)) continue;
    total = total.plus(new Decimal(row.guaranteedProfit));
  }
  return total.toFixed(2);
}

/**
 * D-12: pair-aware "Total profit available". Each chosen pair contributes its
 * paired guaranteed profit once, in place of its two promos' single profits
 * (both singles are excluded). Done promos are excluded like sumOwnBookProfit.
 */
export function sumPortfolioProfit(
  singles: OwnBookProfitRow[],
  pairs: { promoIdA: number; promoIdB: number; guaranteedProfit: string }[],
  usedPromoIds: ReadonlySet<number>,
): string {
  const paired = new Set<number>();
  let total = new Decimal(0);
  for (const pair of pairs) {
    if (usedPromoIds.has(pair.promoIdA) || usedPromoIds.has(pair.promoIdB)) continue;
    paired.add(pair.promoIdA);
    paired.add(pair.promoIdB);
    total = total.plus(new Decimal(pair.guaranteedProfit));
  }
  for (const row of singles) {
    if (!row.hasPromoBook) continue;
    if (usedPromoIds.has(row.promoId)) continue;
    if (paired.has(row.promoId)) continue;
    total = total.plus(new Decimal(row.guaranteedProfit));
  }
  return total.toFixed(2);
}

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
 * Calendar-arithmetic period starts derived from denverDate(now), using
 * Date.UTC on the DATE STRING (never local-time Date methods, which would
 * reintroduce the machine's own timezone). Weeks start Monday: a Sunday
 * steps back 6 days; any other weekday steps back to its own Monday.
 */
export function periodStartDates(now: Date): PeriodStartDates {
  const today = denverDate(now);
  const [year, month, day] = today.split("-").map((n) => parseInt(n, 10));

  const asUtcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = asUtcDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

  const weekStartDate = new Date(Date.UTC(year, month - 1, day - daysSinceMonday));
  const weekStart = toDateString(weekStartDate);

  const monthStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;

  return { today, weekStart, monthStart };
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

export interface AvailableProfit {
  today: string;
  week: string;
  month: string;
}

/**
 * For each of today/week/month: filter observations to the member's own
 * books and to the period's date range (inclusive of the period start,
 * inclusive of today -- observations are never in the future in practice,
 * but the upper bound is enforced explicitly for clarity/safety), then per
 * promoId keep the MAX observed value within that filtered set (owner
 * decision 3 -- each promo counts at most once per period, at its highest
 * observed profit), then sum across promos. ISO "YYYY-MM-DD" strings sort
 * correctly with plain string comparison.
 *
 * quick-260930-fge: promos in `excludeFromToday` (the viewer's Done ids --
 * both halves of a Done pair, since each has its own completion row) are
 * dropped from the TODAY bucket only, matching how the headline total skips
 * Done promos. Week and month are unchanged.
 */
export function summarizeAvailableProfit(
  observations: ProfitObservation[],
  ownBookKeys: ReadonlySet<string>,
  now: Date,
  excludeFromToday: ReadonlySet<number>,
): AvailableProfit {
  const { today, weekStart, monthStart } = periodStartDates(now);

  const ownBookObservations = observations.filter((o) => ownBookKeys.has(o.bookKey) && o.denverDate <= today);

  return {
    today: sumMaxPerPromo(
      ownBookObservations.filter((o) => o.denverDate >= today && !excludeFromToday.has(o.promoId)),
    ),
    week: sumMaxPerPromo(ownBookObservations.filter((o) => o.denverDate >= weekStart)),
    month: sumMaxPerPromo(ownBookObservations.filter((o) => o.denverDate >= monthStart)),
  };
}

function sumMaxPerPromo(observations: ProfitObservation[]): string {
  const maxByPromo = new Map<number, Decimal>();
  for (const obs of observations) {
    const value = new Decimal(obs.maxGuaranteedProfit);
    const existing = maxByPromo.get(obs.promoId);
    if (existing === undefined || value.greaterThan(existing)) {
      maxByPromo.set(obs.promoId, value);
    }
  }

  let total = new Decimal(0);
  for (const value of maxByPromo.values()) {
    total = total.plus(value);
  }
  return total.toFixed(2);
}
