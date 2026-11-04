import Decimal from "decimal.js";
import type { OddsEvent } from "@/domain/odds/schemas";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import { floorCents } from "@/domain/hedge/profitBoost";
import { rankRefundOpportunities } from "@/domain/hedge/conversionRate";
import { getSportLabel } from "@/config/sports";
import type { NoSweatCorrection, RefundConversion, TrackedNoSweatSnapshot } from "./noSweatSnapshot";
import { effectiveBets, lostTotal, refundAmountFor, toRefundConversion } from "./noSweatSettle";

/**
 * Phase 9 (D-01, D-02, D-03, D-05, D-07): display data for one Tracking strip
 * card. Pure; works from the Track snapshot alone (A-03) so it survives
 * kickoff. Cached odds are used only to price the refund, which converts on a
 * different, future game, exactly like the finder (Low-profile does not apply).
 */

/** D-07: show the "still waiting on the result" reminder this long after kickoff. */
export const WAITING_REMINDER_AFTER_HOURS = 6;

const REFUND_OPTION_LIMIT = 3;

/** The slice of a tracked row this builder needs (structurally a TrackedNoSweatRow). */
export interface TrackedCardSource {
  promoId: number;
  state: "tracking" | "awaiting_refund";
  correction: NoSweatCorrection | null;
  snapshot: TrackedNoSweatSnapshot;
}

export type TrackedRefundOption = RefundConversion & {
  bonusBookName: string;
  hedgeBookName: string;
  /** Total for the whole no-sweat if the qualifying bet lost and this option is used. */
  allInTotal: string;
};

export interface TrackedNoSweatCardDTO {
  promoId: number;
  state: "tracking" | "awaiting_refund";
  sportLabel: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  bookName: string;
  title: string;
  pastKickoff: boolean;
  showWaitingReminder: boolean;
  qualifying: { selectionLabel: string; oddsAmerican: number; stake: string; bookName: string };
  hedge: { selectionLabel: string; oddsAmerican: number; stake: string; bookName: string };
  refundCap: string;
  refundAmount: string;
  correction: NoSweatCorrection | null;
  lostStake: string;
  hedgeWinningsOnFirstBet: string;
  refundOptions: TrackedRefundOption[];
  oddsFetchedAt: string | null;
}

export function buildTrackedCardDTO(
  row: TrackedCardSource,
  args: {
    now: Date;
    moneylineEvents: OddsEvent[];
    hedgeBookKeys: ReadonlySet<string>;
    bookNames: ReadonlyMap<string, string>;
    oddsFetchedAt?: Date | null;
  },
): TrackedNoSweatCardDTO {
  const { snapshot, correction } = row;
  const { now } = args;
  const nameOf = (key: string, fallback: string) => args.bookNames.get(key) ?? fallback;
  const commence = new Date(snapshot.game.commenceTime);
  const pastKickoff = now.getTime() >= commence.getTime();
  const reminderAt = commence.getTime() + WAITING_REMINDER_AFTER_HOURS * 60 * 60 * 1000;
  const showWaitingReminder = row.state === "tracking" && now.getTime() >= reminderAt;

  const bets = effectiveBets(snapshot, correction);
  const refundAmount = refundAmountFor(snapshot, correction);
  const hedgePayout = floorCents(bets.hedgeStake.times(americanToDecimal(bets.hedgeOddsAmerican)));

  let refundOptions: TrackedRefundOption[] = [];
  if (row.state === "awaiting_refund") {
    try {
      const amount = new Decimal(refundAmount);
      if (amount.gt(0)) {
        refundOptions = rankRefundOpportunities({
          events: args.moneylineEvents,
          now,
          refundBookKey: snapshot.promo.bookKey,
          amount,
          hedgeBookKeys: args.hedgeBookKeys,
          limit: REFUND_OPTION_LIMIT,
        }).map((opp) => {
          const conv = toRefundConversion(opp, refundAmount);
          return {
            ...conv,
            bonusBookName: nameOf(conv.refundBookKey, snapshot.promo.bookName),
            hedgeBookName: nameOf(conv.hedgeBookKey, conv.hedgeBookKey),
            allInTotal: lostTotal(snapshot, correction, conv.profit),
          };
        });
      }
    } catch (err) {
      console.warn(`buildTrackedCardDTO: could not price refund for promo ${row.promoId}`, err);
      refundOptions = [];
    }
  }

  return {
    promoId: row.promoId,
    state: row.state,
    sportLabel: getSportLabel(snapshot.game.sportKey),
    commenceTime: snapshot.game.commenceTime,
    homeTeam: snapshot.game.homeTeam,
    awayTeam: snapshot.game.awayTeam,
    bookName: nameOf(snapshot.promo.bookKey, snapshot.promo.bookName),
    title: snapshot.promo.title,
    pastKickoff,
    showWaitingReminder,
    qualifying: {
      selectionLabel: snapshot.game.qualifyingSelectionLabel,
      oddsAmerican: bets.qualifyingOddsAmerican,
      stake: bets.qualifyingStake.toFixed(2),
      bookName: nameOf(snapshot.qualifying.bookKey, snapshot.qualifying.bookName),
    },
    hedge: {
      selectionLabel: snapshot.game.hedgeSelectionLabel,
      oddsAmerican: bets.hedgeOddsAmerican,
      stake: bets.hedgeStake.toFixed(2),
      bookName: nameOf(snapshot.hedge.bookKey, snapshot.hedge.bookName),
    },
    refundCap: snapshot.promo.refundCap,
    refundAmount,
    correction,
    lostStake: bets.qualifyingStake.toFixed(2),
    hedgeWinningsOnFirstBet: hedgePayout.minus(bets.hedgeStake).toFixed(2),
    refundOptions,
    oddsFetchedAt: args.oddsFetchedAt ? args.oddsFetchedAt.toISOString() : snapshot.oddsFetchedAt,
  };
}
