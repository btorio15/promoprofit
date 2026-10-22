import { recordMemberProfitObservations } from "@/db/memberObservations";
import { computeMemberFeed } from "@/domain/promos/memberFeed";
import { buildMemberObservationEntries } from "@/domain/promos/memberObservationEntries";
import { denverDate } from "@/domain/promos/profitTotals";
import type { RankablePromo, RankOptions } from "@/domain/promos/rankPromoHedges";

type WholeFeed<P extends RankablePromo> = ReturnType<typeof computeMemberFeed<P>>;

/**
 * THE member recording rule, shared by the Dashboard (getOpportunities) and
 * the Promos tab (getPromos) so the grey line (STATS-02) gets the same
 * entries from either screen. Always ranks at "whole" precision so the
 * recorded best never depends on the precision the member is viewing
 * (WR-01). Never throws: any failure is logged and returns false.
 *
 * The caller must pass a userId it got from requireUser().
 */
export async function recordMemberFeedObservations<P extends RankablePromo>(args: {
  userId: number;
  now: Date;
  feedPromos: P[];
  rankOpts: RankOptions;
  userBookSet: ReadonlySet<string>;
  /** An already-computed whole-precision feed, to skip re-ranking. */
  wholeFeed?: WholeFeed<P>;
}): Promise<boolean> {
  try {
    const feed =
      args.wholeFeed ??
      computeMemberFeed({
        feedPromos: args.feedPromos,
        rankOpts: { ...args.rankOpts, precision: "whole" },
        userBookSet: args.userBookSet,
      });
    const entries = buildMemberObservationEntries({
      denverDate: denverDate(args.now),
      singles: feed.singles,
      chosenPairs: feed.chosenPairs,
      userBookSet: args.userBookSet,
    });
    return await recordMemberProfitObservations(args.userId, entries, args.now);
  } catch (err) {
    console.error("recordMemberFeedObservations: member " + args.userId + " failed", err);
    return false;
  }
}
