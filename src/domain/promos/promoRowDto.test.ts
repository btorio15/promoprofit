import { describe, expect, it } from "vitest";
import type { OddsEvent } from "@/domain/odds/schemas";
import { rankPromoHedges } from "./rankPromoHedges";
import { toPromoRowDTO, type PresentablePromo } from "./promoRowDto";

const NOW = new Date("2026-09-27T00:00:00Z");

const promo: PresentablePromo = {
  id: 1,
  bookKey: "fanduel",
  promoType: "bonus_bet",
  scope: { kind: "event", eventId: "mkt-1", sportKey: "americanfootball_nfl" },
  pinned: { eventId: "mkt-1", marketType: "moneyline", line: null, side: "home" },
  eligibleMarketTypes: ["moneyline"],
  boostPercent: null,
  boostedOddsAmerican: null,
  baseOddsAmerican: null,
  bonusAmount: "50.00",
  maxStake: null,
  winningsCap: null,
  minOddsAmerican: null,
  finePrintNote: null,
  claimHint: null,
  scopeLabel: "Celtics @ Lakers",
  autoMatched: false,
  attribution: [],
};

function eventWith(awayBook: number, awayKalshi: number): OddsEvent {
  const quote = (key: string, home: number, away: number) => ({
    key,
    title: key,
    markets: [
      {
        key: "h2h",
        outcomes: [
          { name: "Lakers", price: home },
          { name: "Celtics", price: away },
        ],
      },
    ],
  });
  return {
    id: "mkt-1",
    sport_key: "americanfootball_nfl",
    sport_title: "NFL",
    commence_time: new Date(NOW.getTime() + 24 * 3600 * 1000).toISOString(),
    home_team: "Lakers",
    away_team: "Celtics",
    bookmakers: [quote("fanduel", 150, -300), quote("betmgm", 120, awayBook), quote("kalshi", 130, awayKalshi)],
  };
}

function rank(event: OddsEvent, keys: string[]) {
  const [opp] = rankPromoHedges([promo], {
    moneylineEvents: [event],
    extendedEvents: [],
    hedgeBookKeys: new Set(keys),
    precision: "cents",
    now: NOW,
  });
  return opp;
}

const bookNames = new Map([
  ["fanduel", "FanDuel"],
  ["betmgm", "BetMGM"],
]);

describe("toPromoRowDTO market hedge (Phase 12)", () => {
  it("sportsbook hedge: hedgeMarket null, hedge unchanged", () => {
    const dto = toPromoRowDTO(rank(eventWith(-130, -156), ["fanduel", "betmgm", "kalshi"]), bookNames, new Set(["fanduel"]));
    expect(dto.hedgeMarket).toBeNull();
    expect(dto.hedge.bookKey).toBe("betmgm");
    expect(dto.hedge.bookName).toBe("BetMGM");
  });

  it("market hedge: leg DTO, Kalshi name fallback, outlay/contracts as stake/payout", () => {
    const dto = toPromoRowDTO(rank(eventWith(-200, -156), ["fanduel", "betmgm", "kalshi"]), bookNames, new Set(["fanduel"]));
    expect(dto.hedge.bookKey).toBe("kalshi");
    expect(dto.hedge.bookName).toBe("Kalshi");
    expect(dto.hedgeMarket).not.toBeNull();
    expect(dto.hedgeMarket?.venueName).toBe("Kalshi");
    expect(dto.hedgeStake).toBe(dto.hedgeMarket?.outlay);
    expect(dto.hedgePayout).toBe(`${dto.hedgeMarket?.contracts}.00`);
    expect(dto.guaranteedProfit).toBe("28.00");
  });
});
