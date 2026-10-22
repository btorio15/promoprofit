import Decimal from "decimal.js";
import { getActivePromos, type ActivePromo } from "./promos";
import { getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys } from "./queries";
import { recordProfitObservations } from "./promoTracking";
import { loadGameTimes, recordProfitSnapshots, type NewProfitSnapshot } from "./profitSnapshots";
import { rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import { stripMemberCaps } from "@/domain/promos/yourCap";
import { denverDate } from "@/domain/promos/profitTotals";
import { ANY_SPORT_KEY, denverHour } from "@/domain/stats/profitStats";
import type { OddsEvent } from "@/domain/odds/schemas";

/** Odds and book list a caller already loaded, so no second cache read is needed. */
export interface CachedOddsInput {
  moneylineEvents: OddsEvent[];
  extendedEvents: OddsEvent[];
  oddsFetchedAt: Date | null;
  everyUsableHedgeBookKeys: readonly string[];
}

interface CurrentProfitEntry {
  promoId: number;
  bookKey: string;
  denverDate: string;
  maxGuaranteedProfit: Decimal;
  /** Null for promos whose scope has no sport (the "any" scope). */
  sportKey: string | null;
}

/**
 * quick-260927-n12 (owner scope change B): computes and records today's
 * best-guaranteed-profit observation for every currently active,
 * profitable promo, ranked against EVERY usable hedge book (not any one
 * member's own books) so the recorded number is group-level and identical
 * no matter which caller triggers it (design decision in
 * .planning/quick/260927-n12.../260927-n12-PLAN.md). Lives in src/db (not
 * src/app/actions, not src/ingestion/promos) so it's callable from BOTH:
 *   - getPromos (src/app/actions/get-promos.ts), on every Promos-tab load,
 *     capturing manual mid-day refreshes;
 *   - getOpportunities (src/app/actions/get-opportunities.ts), on every
 *     Dashboard load, reusing the odds it already loaded;
 *   - the morning scheduled job (src/ingestion/odds/morningObserve.ts ->
 *     scripts/morning-odds-observe.ts), after its own moneyline refresh.
 * src/app must never import src/ingestion (boundary test), and this module
 * itself never imports src/ingestion -- only src/db and src/domain -- so
 * either caller can use it without crossing that boundary.
 *
 * No new Odds API calls: reads whatever is already cached (or uses the
 * `cached` input a caller already loaded). The whole call, reads and write,
 * never throws: any failure is caught and logged with console.error, so it
 * can never break the caller (the Dashboard, or the scheduled job).
 *
 * Always ranks at "whole" precision, whoever calls it (WR-01), and only
 * scraped promos: a viewer's private promos in `activePromos` are dropped
 * (WR-02).
 */
export async function recordCurrentProfitObservations(
  now: Date,
  opts: { activePromos?: ActivePromo[]; cached?: CachedOddsInput } = {},
): Promise<void> {
  try {
    const entries = await computeCurrentProfitEntries(now, opts);
    if (entries.length === 0) return;

    await recordProfitObservations(
      entries.map((entry) => ({
        promoId: entry.promoId,
        bookKey: entry.bookKey,
        denverDate: entry.denverDate,
        maxGuaranteedProfit: entry.maxGuaranteedProfit.toFixed(2),
      })),
      now,
    );
  } catch (err) {
    console.error("recordCurrentProfitObservations: failed to record observations", err);
  }
}

/**
 * Stats time series (see profitSnapshots in schema.ts). Called only from
 * the scheduled odds run, so each scrape-promos.yml run adds one snapshot per
 * profitable promo. Same ranking as recordCurrentProfitObservations, but the
 * row keeps capturedAt, the Denver hour and the game time. The whole call
 * (reads and write) never throws; a failure is logged only.
 */
export async function recordCurrentProfitSnapshots(now: Date): Promise<void> {
  try {
    const entries = await computeCurrentProfitEntries(now, {});
    // Any-sport promos are kept under ANY_SPORT_KEY rather than dropped.
    const withSport = entries.map((entry) => ({ ...entry, sportKey: entry.sportKey ?? ANY_SPORT_KEY }));
    if (withSport.length === 0) return;

    const gameTimes = await loadGameTimes(withSport.map((entry) => entry.promoId));
    const hour = denverHour(now);
    const rows: NewProfitSnapshot[] = withSport.map((entry) => ({
      promoId: entry.promoId,
      capturedAt: now,
      denverDate: entry.denverDate,
      denverHour: hour,
      sportKey: entry.sportKey,
      gameAt: gameTimes.get(entry.promoId) ?? null,
      bookKey: entry.bookKey,
      guaranteedProfit: entry.maxGuaranteedProfit.toFixed(2),
    }));
    await recordProfitSnapshots(rows);
  } catch (err) {
    console.error("recordCurrentProfitSnapshots: failed to record snapshots", err);
  }
}

/**
 * Shared ranking for both recorders: each active promo's best guaranteed
 * profit against every usable hedge book, profitable promos only. Returns no
 * entries when there is no active promo or no cached odds yet.
 */
async function computeCurrentProfitEntries(
  now: Date,
  opts: { activePromos?: ActivePromo[]; cached?: CachedOddsInput },
): Promise<CurrentProfitEntry[]> {
  // Site-wide Statistics must never contain a member's private promo, so
  // only scraped (group) promos are ranked, whatever list the caller passed.
  // This is the same visibility the scheduled job's getActivePromos(now) uses
  // (WR-02).
  const activePromos = (opts.activePromos ?? (await getActivePromos(now))).filter((promo) => promo.scraped);
  if (activePromos.length === 0) return [];

  let moneylineEvents: OddsEvent[];
  let extendedEvents: OddsEvent[];
  let oddsFetchedAt: Date | null;
  let everyUsableBookKeys: readonly string[];
  if (opts.cached) {
    moneylineEvents = opts.cached.moneylineEvents;
    extendedEvents = opts.cached.extendedEvents;
    oddsFetchedAt = opts.cached.oddsFetchedAt;
    everyUsableBookKeys = opts.cached.everyUsableHedgeBookKeys;
  } else {
    const [ml, ext] = await Promise.all([getCachedEvents(), getCachedExtendedEvents()]);
    moneylineEvents = ml.events;
    extendedEvents = ext.events;
    oddsFetchedAt = ml.fetchedAt;
    // No cached odds at all yet -- nothing to rank; skip the book read.
    everyUsableBookKeys = oddsFetchedAt === null ? [] : await getHedgeBookKeys();
  }
  // No cached odds at all yet -- nothing to rank, nothing to observe.
  if (oddsFetchedAt === null) return [];
  // Group-level observations must never reflect one member's "Your cap":
  // always rank at each promo's own max stake (quick-261001-dhn).
  const opportunities = rankPromoHedges(stripMemberCaps(activePromos), {
    moneylineEvents,
    extendedEvents,
    hedgeBookKeys: new Set(everyUsableBookKeys),
    // Group observations always rank at "whole" precision, the same as the
    // scheduled job, so the number never depends on the viewer's precision
    // setting (WR-01). There is deliberately no precision option.
    precision: "whole",
    now,
  });

  const todaysDenverDate = denverDate(now);
  // rankPromoHedges already returns at most one opportunity per promo (its
  // own best candidate) -- this map is a straight 1:1 projection, not a
  // dedupe step.
  return opportunities
    .map((opportunity) => {
      const guaranteedProfit =
        opportunity.result.kind === "boost"
          ? opportunity.result.boost.guaranteedProfit
          : opportunity.result.bonus.guaranteedProfit;
      const scope = opportunity.promo.scope;
      return {
        promoId: opportunity.promo.id,
        bookKey: opportunity.promo.bookKey,
        denverDate: todaysDenverDate,
        maxGuaranteedProfit: guaranteedProfit,
        sportKey: scope.kind === "any" ? null : scope.sportKey,
      };
    })
    .filter((entry) => entry.maxGuaranteedProfit.greaterThan(0));
}
