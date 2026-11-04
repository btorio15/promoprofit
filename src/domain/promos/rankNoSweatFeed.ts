import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import type { ConversionRateFor } from "@/domain/hedge/conversionRate";
import {
  LONG_ODDS_THRESHOLD_AMERICAN,
  toRankLowProfile,
  type LowProfileSettings,
  type LowProfileWarning,
} from "./lowProfile";
import {
  rankNoSweat,
  type NoSweatOpportunity,
  type NoSweatPromo,
} from "./rankNoSweat";

/**
 * Estimates-only no-sweat list ranker (Phase 9, FEED-03). Pure.
 *
 * A-01: this is called ONLY from the Opportunities path. It must never be
 * imported by computeMemberFeed or by any recorder / morning observer /
 * promo-observation writer: no-sweat figures are estimates and must never be
 * recorded as guaranteed profit.
 */

export interface NoSweatFeedEntry<P extends NoSweatPromo> {
  promo: P;
  opportunity: NoSweatOpportunity;
  filteredOut: number;
  warnings: LowProfileWarning[];
  estRoiPct: string;
}

/** Est. ROI = estimate / (qualifying stake + hedge stake) x 100, 2dp, ROUND_HALF_UP (A-10). */
export function estRoiPct(
  estimate: Decimal,
  qualifyingStake: Decimal,
  hedgeStake: Decimal,
): string {
  const outlay = qualifyingStake.plus(hedgeStake);
  if (outlay.lte(0)) return "0.00";
  return estimate.dividedBy(outlay).times(100).toFixed(2, Decimal.ROUND_HALF_UP);
}

/** D-22: warn when a protection is OFF and the chosen bet trips it. */
export function deriveLowProfileWarnings(
  opp: NoSweatOpportunity,
  settings: LowProfileSettings,
): LowProfileWarning[] {
  const warnings: LowProfileWarning[] = [];
  if (
    !settings.oddsCapEnabled &&
    americanToDecimal(opp.qualifying.oddsAmerican).gt(
      americanToDecimal(LONG_ODDS_THRESHOLD_AMERICAN),
    )
  ) {
    warnings.push("long_odds");
  }
  if (!settings.mainLinesOnly && opp.selection.fromAlternate === true) {
    warnings.push("alternate_line");
  }
  if (!settings.naturalStakes && !opp.solution.hedgeStake.mod(1).isZero()) {
    warnings.push("exact_cent_stake");
  }
  return warnings;
}

export interface RankNoSweatFeedResult<P extends NoSweatPromo> {
  ranked: NoSweatFeedEntry<P>[];
  notWorthIt: NoSweatFeedEntry<P>[];
  cantPrice: P[];
  lowProfileBlocked: { promo: P; filteredOut: number }[];
  noLine: P[];
  invalid: { promoId: P["id"]; reason: string }[];
}

function idCompare(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function rankNoSweatFeed<P extends NoSweatPromo>(args: {
  promos: P[];
  moneylineEvents: OddsEvent[];
  extendedEvents: OddsEvent[];
  now: Date;
  hedgeBookKeys: ReadonlySet<string>;
  precision: StakePrecision;
  lowProfile: LowProfileSettings;
  conversionRateFor: ConversionRateFor;
}): RankNoSweatFeedResult<P> {
  const out: RankNoSweatFeedResult<P> = {
    ranked: [],
    notWorthIt: [],
    cantPrice: [],
    lowProfileBlocked: [],
    noLine: [],
    invalid: [],
  };
  const rankLowProfile = toRankLowProfile(args.lowProfile);

  for (const promo of args.promos) {
    const r = rankNoSweat(promo, {
      moneylineEvents: args.moneylineEvents,
      extendedEvents: args.extendedEvents,
      now: args.now,
      hedgeBookKeys: args.hedgeBookKeys,
      precision: args.precision,
      conversionRateFor: args.conversionRateFor, // A-11: the SAME function for every promo
      lowProfile: rankLowProfile,
    });
    switch (r.kind) {
      case "invalid_promo":
        out.invalid.push({ promoId: promo.id, reason: r.reason });
        break;
      case "cant_price":
        out.cantPrice.push(promo);
        break;
      case "no_qualifying_line":
        if (r.filteredOut > 0) {
          out.lowProfileBlocked.push({ promo, filteredOut: r.filteredOut });
        } else {
          out.noLine.push(promo);
        }
        break;
      case "ok": {
        const sol = r.opportunity.solution;
        const entry: NoSweatFeedEntry<P> = {
          promo,
          opportunity: r.opportunity,
          filteredOut: r.filteredOut,
          warnings: deriveLowProfileWarnings(r.opportunity, args.lowProfile),
          estRoiPct: estRoiPct(
            sol.estimatedProfit,
            sol.qualifyingStake,
            sol.hedgeStake,
          ),
        };
        if (sol.estimatedProfit.gt(0)) out.ranked.push(entry);
        else out.notWorthIt.push(entry);
        break;
      }
    }
  }

  out.ranked.sort(
    (a, b) =>
      b.opportunity.solution.estimatedProfit.comparedTo(
        a.opportunity.solution.estimatedProfit,
      ) ||
      b.opportunity.solution.worstCaseProfit.comparedTo(
        a.opportunity.solution.worstCaseProfit,
      ) ||
      idCompare(a.promo.id, b.promo.id),
  );
  return out;
}
