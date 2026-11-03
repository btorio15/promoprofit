import type { NoSweatDoneSnapshot, TrackedNoSweatSnapshot } from "./noSweatSnapshot";

/** Shared test fixture for later plans. */
export function buildTrackedSnapshotFixture(overrides: Partial<TrackedNoSweatSnapshot> = {}): TrackedNoSweatSnapshot {
  return {
    version: 2,
    kind: "no_sweat",
    stage: "tracked",
    recordedAt: "2026-11-03T15:00:00.000Z",
    precision: "whole",
    oddsFetchedAt: "2026-11-03T14:55:00.000Z",
    promo: {
      id: 101,
      bookKey: "draftkings",
      bookName: "DraftKings",
      title: "No-sweat first bet",
      refundCap: "50.00",
      minOddsAmerican: -200,
      expiresAt: null,
      scopeLabel: null,
    },
    game: {
      eventId: "evt-1",
      sportKey: "americanfootball_nfl",
      commenceTime: "2026-11-08T18:00:00.000Z",
      homeTeam: "Denver Broncos",
      awayTeam: "Kansas City Chiefs",
      marketType: "moneyline",
      marketBadge: "Moneyline",
      qualifyingSelectionLabel: "Denver Broncos",
      hedgeSelectionLabel: "Kansas City Chiefs",
      fromAlternate: false,
    },
    qualifying: { bookKey: "draftkings", bookName: "DraftKings", oddsAmerican: 150, stake: "50.00", winnings: "75.00" },
    hedge: { bookKey: "fanduel", bookName: "FanDuel", oddsAmerican: -160, stake: "47.00", payout: "76.38" },
    estimate: {
      estimatedProfit: "12.50",
      worstCaseProfit: "-2.00",
      profitIfWin: "26.38",
      profitIfLose: "-2.00",
      estRoiPct: "12.50",
    },
    conversion: {
      refundBookKey: "draftkings",
      refundAmount: "50.00",
      refundValue: "35.00",
      ratePct: "70.00",
      eventId: "evt-1",
      hedgeBookKey: "fanduel",
    },
    lowProfile: { oddsCapEnabled: true, oddsCapAmerican: 300, mainLinesOnly: false, naturalStakes: false },
    warnings: [],
    ...overrides,
  };
}

export function buildDoneSnapshotFixture(overrides: Partial<NoSweatDoneSnapshot> = {}): NoSweatDoneSnapshot {
  return {
    version: 2,
    kind: "no_sweat",
    stage: "settled",
    tracked: buildTrackedSnapshotFixture(),
    outcome: "won",
    correction: null,
    refund: null,
    computedProfit: "26.38",
    profitSource: "computed",
    settledAt: "2026-11-08T23:00:00.000Z",
    ...overrides,
  };
}
