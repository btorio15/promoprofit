import type { StakePrecision } from "@/domain/hedge/arbMath";
import type { LowProfileSettings } from "./lowProfile";
import { toNoSweatRowDTO, type PresentableNoSweatPromo } from "./noSweatRowDto";
import type { NoSweatFeedEntry } from "./rankNoSweatFeed";
import type { TrackedNoSweatSnapshot } from "./noSweatSnapshot";

/**
 * Phase 9 (D-01, D-23, A-03): the Track snapshot. Pure. Built on the server
 * from the SAME feed entry the member saw (via toNoSweatRowDTO), so every
 * figure equals the row's figure. Settling later works from this snapshot
 * alone -- the promo itself may be inactive by then.
 */
export function buildTrackedSnapshot<P extends PresentableNoSweatPromo>(
  entry: NoSweatFeedEntry<P>,
  ctx: {
    bookNames: Map<string, string>;
    precision: StakePrecision;
    lowProfile: LowProfileSettings;
    oddsFetchedAt: Date | null;
    now: Date;
  },
): TrackedNoSweatSnapshot {
  const row = toNoSweatRowDTO(entry, ctx.bookNames);
  const { promo } = entry;
  const sel = entry.opportunity.selection;
  return {
    version: 2,
    kind: "no_sweat",
    stage: "tracked",
    recordedAt: ctx.now.toISOString(),
    precision: ctx.precision,
    oddsFetchedAt: ctx.oddsFetchedAt ? ctx.oddsFetchedAt.toISOString() : null,
    promo: {
      id: row.promoId,
      bookKey: row.bookKey,
      bookName: row.bookName,
      title: row.title,
      refundCap: row.refundCap,
      minOddsAmerican: promo.minOddsAmerican,
      expiresAt: row.expiresAt,
      scopeLabel: row.scopeLabel,
    },
    game: {
      eventId: sel.eventId,
      sportKey: sel.sportKey,
      commenceTime: row.commenceTime,
      homeTeam: row.homeTeam,
      awayTeam: row.awayTeam,
      marketType: sel.marketType,
      marketBadge: row.marketBadge,
      qualifyingSelectionLabel: row.qualifying.selectionLabel,
      hedgeSelectionLabel: row.hedge.selectionLabel,
      fromAlternate: row.fromAlternate,
    },
    qualifying: {
      bookKey: row.qualifying.bookKey,
      bookName: row.qualifying.bookName,
      oddsAmerican: row.qualifying.oddsAmerican,
      stake: row.qualifying.stake,
      winnings: row.qualifying.winnings,
    },
    hedge: {
      bookKey: row.hedge.bookKey,
      bookName: row.hedge.bookName,
      oddsAmerican: row.hedge.oddsAmerican,
      stake: row.hedge.stake,
      payout: row.hedge.payout,
    },
    estimate: {
      estimatedProfit: row.estimatedProfit,
      worstCaseProfit: row.worstCaseProfit,
      profitIfWin: row.profitIfWin,
      profitIfLose: row.profitIfLose,
      estRoiPct: row.estRoiPct,
    },
    conversion: {
      refundBookKey: row.bookKey,
      refundAmount: row.refundAmount,
      refundValue: row.refundValue,
      ratePct: row.ratePct,
      eventId: row.conversionEventId,
      hedgeBookKey: row.conversionHedgeBookKey,
    },
    lowProfile: { ...ctx.lowProfile },
    warnings: [...row.warnings],
  };
}
