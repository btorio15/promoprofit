import { getActivePromos, type ActivePromo } from "./promos";
import { getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys } from "./queries";
import { recordProfitObservations } from "./promoTracking";
import { rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import { stripMemberCaps } from "@/domain/promos/yourCap";
import { denverDate } from "@/domain/promos/profitTotals";
import type { StakePrecision } from "@/domain/hedge/arbMath";

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
 *   - the morning scheduled job (src/ingestion/odds/morningObserve.ts ->
 *     scripts/morning-odds-observe.ts), after its own moneyline refresh.
 * src/app must never import src/ingestion (boundary test), and this module
 * itself never imports src/ingestion -- only src/db and src/domain -- so
 * either caller can use it without crossing that boundary.
 *
 * No new Odds API calls: reads whatever is already cached. A write failure
 * must never break the caller (getPromos' feed, or the scheduled job) --
 * the DB write itself is wrapped in try/catch + console.error.
 */
export async function recordCurrentProfitObservations(
  now: Date,
  opts: { activePromos?: ActivePromo[]; precision?: StakePrecision } = {},
): Promise<void> {
  const activePromos = opts.activePromos ?? (await getActivePromos(now));
  if (activePromos.length === 0) return;

  const [{ events: moneylineEvents, fetchedAt: oddsFetchedAt }, { events: extendedEvents }] = await Promise.all([
    getCachedEvents(),
    getCachedExtendedEvents(),
  ]);
  // No cached odds at all yet -- nothing to rank, nothing to observe.
  if (oddsFetchedAt === null) return;

  const everyUsableBookKeys = await getHedgeBookKeys();
  // Group-level observations must never reflect one member's "Your cap":
  // always rank at each promo's own max stake (quick-261001-dhn).
  const opportunities = rankPromoHedges(stripMemberCaps(activePromos), {
    moneylineEvents,
    extendedEvents,
    hedgeBookKeys: new Set(everyUsableBookKeys),
    precision: opts.precision ?? "whole",
    now,
  });

  const todaysDenverDate = denverDate(now);
  // rankPromoHedges already returns at most one opportunity per promo (its
  // own best candidate) -- this map is a straight 1:1 projection, not a
  // dedupe step.
  const entries = opportunities
    .map((opportunity) => {
      const guaranteedProfit =
        opportunity.result.kind === "boost"
          ? opportunity.result.boost.guaranteedProfit
          : opportunity.result.bonus.guaranteedProfit;
      return {
        promoId: opportunity.promo.id,
        bookKey: opportunity.promo.bookKey,
        denverDate: todaysDenverDate,
        maxGuaranteedProfit: guaranteedProfit,
      };
    })
    .filter((entry) => entry.maxGuaranteedProfit.greaterThan(0))
    .map((entry) => ({ ...entry, maxGuaranteedProfit: entry.maxGuaranteedProfit.toFixed(2) }));

  if (entries.length === 0) return;

  try {
    await recordProfitObservations(entries, now);
  } catch (err) {
    console.error("recordCurrentProfitObservations: failed to write observations", err);
  }
}
