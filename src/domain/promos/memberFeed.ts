import {
  rankPromoHedges,
  type PromoOpportunity,
  type RankablePromo,
  type RankOptions,
} from "./rankPromoHedges";
import { findPairCandidates, selectPairs, singleProfitMap, type PairCandidate } from "./pairPromos";

/**
 * The single source of the feed's singles + chosen-pairs composition (D-06).
 *
 * Used by getOpportunities, the member profit recorder, and the morning job.
 * Do not duplicate the pair rule anywhere else: every consumer must call this
 * so the recorded history can never disagree with the visible feed.
 *
 * Pure: no database access. `rankOpts.hedgeBookKeys` should be the member's own
 * hedge books and `feedPromos` the member-visible promos (Your cap applied).
 */
export function computeMemberFeed<P extends RankablePromo>(args: {
  feedPromos: P[];
  rankOpts: RankOptions;
  userBookSet: ReadonlySet<string>;
}): { singles: PromoOpportunity<P>[]; chosenPairs: PairCandidate<P>[] } {
  const { feedPromos, rankOpts, userBookSet } = args;
  const singles = rankPromoHedges(feedPromos, rankOpts);
  const chosenPairs = selectPairs(
    findPairCandidates(feedPromos, singleProfitMap(singles), {
      ...rankOpts,
      memberBookKeys: userBookSet,
    }),
  );
  return { singles, chosenPairs };
}
