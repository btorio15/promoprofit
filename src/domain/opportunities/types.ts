import type { PromoRowDTO } from "@/domain/promos/dto";
import type { PairRowDTO } from "@/domain/promos/pairRowDto";
import type { ArbResultDTO } from "@/domain/arb/types";
import type { AvailableProfit } from "@/domain/promos/profitTotals";

/** D-13: the Opportunities sort switch. */
export type SortKey = "profit" | "roi";

/** What every feed item must expose so any source can be ranked the same way (D-06b). */
export interface RankKey {
  rowKey: string;
  /** Guaranteed profit, 2dp string. */
  profit: string;
  /** ROI or Conversion percent, 2dp string. */
  pct: string;
  pctLabel: "ROI" | "Conversion";
  commenceTime: string;
}

export type OpportunityItem<T> = RankKey & { data: T };

export type SourceId = "promos" | "pairs" | "arbs";

/** D-02: one member per source. */
export type OpportunitySourceDTO =
  | { id: "promos"; items: OpportunityItem<PromoRowDTO>[] }
  | { id: "pairs"; items: OpportunityItem<PairRowDTO>[] }
  | { id: "arbs"; items: OpportunityItem<ArbResultDTO>[] };

/** D-21: Best arbs are always ranked at a fixed $100 total stake, independent of the Arbitrage tab. */
export const OPPORTUNITIES_ARB_TOTAL_STAKE = "100.00";

export type OpportunitiesEmptyVariant = "no-odds" | "no-books" | "none-scraped" | "nothing-profitable";

export interface OpportunitiesTotals {
  totalProfit: string;
  totalExtracted: string;
  availableProfit: AvailableProfit;
}

export type OpportunitiesResponse =
  | { status: "invalid" }
  | {
      status: "ok";
      emptyVariant: OpportunitiesEmptyVariant | null;
      oddsFetchedAt: string | null;
      extendedOddsFetchedAt: string | null;
      totals: OpportunitiesTotals;
      sources: OpportunitySourceDTO[];
    };

export const SOURCE_ORDER: SourceId[] = ["promos", "pairs", "arbs"];

export const SOURCE_META: Record<
  SourceId,
  { title: string; seeAll: null | { label: string; tab: "promos" | "arbitrage" }; emptyCopy: string }
> = {
  promos: {
    title: "Best promos",
    seeAll: { label: "See all promos", tab: "promos" },
    emptyCopy: "No promo hedges right now.",
  },
  pairs: {
    title: "Best pairs",
    seeAll: null,
    emptyCopy:
      "No pairs right now. A pair only shows up when two promos on opposite sides beat hedging each one separately.",
  },
  arbs: {
    title: "Best arbs",
    seeAll: { label: "See all arbs", tab: "arbitrage" },
    emptyCopy: "No arbitrage bets at your books right now.",
  },
};
