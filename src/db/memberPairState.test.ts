import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import type { ActivePromo } from "@/db/promos";

const { mockGetActivePromos, mockGetBonusBooks, mockGetCachedEvents, mockGetCachedExtendedEvents, mockGetHedgeBookKeys, mockGetUserBookKeys, mockGetPromoCompletions } =
  vi.hoisted(() => ({
    mockGetActivePromos: vi.fn(),
    mockGetBonusBooks: vi.fn(),
    mockGetCachedEvents: vi.fn(),
    mockGetCachedExtendedEvents: vi.fn(),
    mockGetHedgeBookKeys: vi.fn(),
    mockGetUserBookKeys: vi.fn(),
    mockGetPromoCompletions: vi.fn(),
  }));

vi.mock("@/db/promos", () => ({ getActivePromos: mockGetActivePromos }));
vi.mock("@/db/queries", () => ({
  getBonusBooks: mockGetBonusBooks,
  getCachedEvents: mockGetCachedEvents,
  getCachedExtendedEvents: mockGetCachedExtendedEvents,
  getHedgeBookKeys: mockGetHedgeBookKeys,
  getUserBookKeys: mockGetUserBookKeys,
}));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn().mockResolvedValue({ userId: 1, email: "a@example.com", displayName: "A" }) }));
vi.mock("@/db/promoObservations", () => ({ recordCurrentProfitObservations: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/promoTracking", () => ({
  getPromoCompletions: mockGetPromoCompletions,
  getProfitObservationsSince: vi.fn().mockResolvedValue([]),
}));

import { computeMemberPairState } from "./memberPairState";
import { getOpportunities } from "@/app/actions/get-opportunities";
import { DonePairSnapshotSchema, isSamePairDisplay } from "@/domain/promos/pairSnapshot";
import type { PairRowDTO } from "@/domain/promos/pairRowDto";

const NOW = new Date();
const plusHours = (h: number) => new Date(NOW.getTime() + h * 3600_000);

const EVENT: OddsEvent = {
  id: "nfl-pair",
  sport_key: "americanfootball_nfl",
  sport_title: "NFL",
  commence_time: plusHours(6).toISOString(),
  home_team: "DEN Broncos",
  away_team: "LA Rams",
  bookmakers: ["draftkings", "fanduel"].map((key) => ({
    key,
    title: key,
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "DEN Broncos", price: -110 },
          { name: "LA Rams", price: -110 },
        ],
      },
    ],
  })),
};

function boost(id: number, bookKey: string): ActivePromo {
  return {
    id,
    bookKey,
    promoType: "profit_boost",
    scope: {
      kind: "sport_window",
      sportKey: "americanfootball_nfl",
      windowStart: NOW,
      windowEnd: plusHours(48),
    },
    pinned: null,
    eligibleMarketTypes: ["moneyline"],
    boostPercent: "50.00",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "50.00",
    winningsCap: null,
    minOddsAmerican: null,
    finePrintNote: null,
    claimHint: null,
    scopeLabel: "Any NFL game",
    autoMatched: true,
    attribution: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActivePromos.mockResolvedValue([boost(1, "draftkings"), boost(2, "fanduel")]);
  mockGetBonusBooks.mockResolvedValue([
    { key: "draftkings", displayName: "DraftKings" },
    { key: "fanduel", displayName: "FanDuel" },
  ]);
  mockGetCachedEvents.mockResolvedValue({ events: [EVENT], fetchedAt: NOW });
  mockGetCachedExtendedEvents.mockResolvedValue({ events: [], fetchedAt: null });
  mockGetUserBookKeys.mockResolvedValue(["draftkings", "fanduel"]);
  mockGetHedgeBookKeys.mockImplementation(async (allowed?: ReadonlySet<string>) =>
    ["draftkings", "fanduel"].filter((k) => !allowed || allowed.has(k)),
  );
  mockGetPromoCompletions.mockResolvedValue([]);
});

const args = { userId: 1, promoIdA: 1, promoIdB: 2, precision: "cents" as const, now: NOW };

describe("computeMemberPairState", () => {
  it("returns the pair row the feed shows for (A, B)", async () => {
    const state = await computeMemberPairState(args);
    if (state.kind !== "pair") throw new Error("expected pair");
    expect(state.row).not.toBeNull();
    expect(state.row?.rowKey).toBe("pair-1-2");
    expect(state.termsA.id).toBe(1);
    expect(state.termsB.id).toBe(2);
  });

  it("is not_active when a promo is inactive or not at a member book", async () => {
    mockGetActivePromos.mockResolvedValue([boost(1, "draftkings")]);
    expect((await computeMemberPairState(args)).kind).toBe("not_active");
    mockGetActivePromos.mockResolvedValue([boost(1, "draftkings"), boost(2, "fanduel")]);
    mockGetUserBookKeys.mockResolvedValue(["draftkings"]);
    expect((await computeMemberPairState(args)).kind).toBe("not_active");
  });

  it("is not_active when one promo is already done alone", async () => {
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 1, completedAt: NOW, snapshot: null, profitExtracted: "0.00", promoBookKey: "draftkings", promoType: "profit_boost", promoParsed: null },
    ]);
    expect((await computeMemberPairState(args)).kind).toBe("not_active");
  });

  it("reports already_done_pair when the same pair was already marked", async () => {
    const live = await computeMemberPairState(args);
    if (live.kind !== "pair" || !live.row) throw new Error("expected pair");
    const { buildPairSnapshot } = await import("@/domain/promos/pairSnapshot");
    const built = buildPairSnapshot(
      { row: live.row, termsA: live.termsA, termsB: live.termsB },
      { now: NOW, precision: "cents", oddsFetchedAt: live.oddsFetchedAt },
    );
    expect(DonePairSnapshotSchema.safeParse(built.primary.snapshot).success).toBe(true);
    mockGetPromoCompletions.mockResolvedValue([
      { promoId: 1, completedAt: NOW, snapshot: built.primary.snapshot, profitExtracted: built.primary.profitExtracted, promoBookKey: "draftkings", promoType: "profit_boost", promoParsed: null },
      { promoId: 2, completedAt: NOW, snapshot: built.member.snapshot, profitExtracted: "0.00", promoBookKey: "fanduel", promoType: "profit_boost", promoParsed: null },
    ]);
    const again = await computeMemberPairState(args);
    expect(again).toEqual({ kind: "already_done_pair", profitExtracted: built.primary.profitExtracted });
  });

  it("D-11 parity: the server recompute equals the pair the Opportunities feed shows (profit and both stakes)", async () => {
    const feed = await getOpportunities({ precision: "cents" });
    if (feed.status !== "ok") throw new Error("expected ok feed");
    const pairsSource = feed.sources.find((src) => src.id === "pairs");
    const shown = pairsSource?.items.find((item) => item.rowKey === "pair-1-2")?.data as PairRowDTO | undefined;
    if (!shown) throw new Error("expected the feed to show pair-1-2");

    const state = await computeMemberPairState(args);
    if (state.kind !== "pair" || !state.row) throw new Error("expected pair");
    expect(state.row.guaranteedProfit).toBe(shown.guaranteedProfit);
    expect(state.row.legA.stake).toBe(shown.legA.stake);
    expect(state.row.legB.stake).toBe(shown.legB.stake);
    // The action's D-23 comparison treats them as the same pair.
    expect(
      isSamePairDisplay(
        { profit: shown.guaranteedProfit, stakeA: shown.legA.stake, stakeB: shown.legB.stake },
        state.row,
      ),
    ).toBe(true);
  });
});
