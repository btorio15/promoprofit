import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  solveBonusBetMarketHedge,
  solveArbWithMarket,
  solveMarketHedgeForPayout,
  solveProfitBoostMarketHedge,
} from "./solveMarketHedge";
import type { MarketLeg } from "./marketLeg";
import {
  bruteForceMarketArb,
  bruteForceMarketBonus,
  bruteForceMarketBoost,
  mulberry32,
  pick,
  randInt,
  type OracleVenue,
} from "./solveMarketHedge.oracle";
import type { WinningsCap } from "../hedge/profitBoost";

const VENUES: OracleVenue[] = ["kalshi", "polymarket_us"];

function leg(venueKey: OracleVenue, priceCents: number): MarketLeg {
  return { venueKey, side: "yes", priceCents, availableContracts: null };
}

function cents(d: Decimal): number {
  return d.times(100).toNumber();
}

describe("solveMarketHedgeForPayout", () => {
  it("balances a $75.00 gross against a 61c Kalshi leg", () => {
    const r = solveMarketHedgeForPayout({
      bookWinsGross: new Decimal("75"),
      bookCashOutlay: new Decimal(0),
      leg: leg("kalshi", 61),
    });
    expect(r).not.toBeNull();
    expect(r!.fill.contracts).toBe(75);
    expect(r!.guaranteedProfit.toFixed(2)).toBe("28.00");
  });

  it("returns null when the leg cannot beat the gross (price 99, tiny gross)", () => {
    const r = solveMarketHedgeForPayout({
      bookWinsGross: new Decimal("0.50"),
      bookCashOutlay: new Decimal(0),
      leg: leg("kalshi", 99),
    });
    expect(r).toBeNull();
  });
});

describe("solveBonusBetMarketHedge", () => {
  it("worked example: $50 bonus at +150 against Kalshi YES 61c", () => {
    const r = solveBonusBetMarketHedge({
      bonusAmount: new Decimal(50),
      bonusOddsAmerican: 150,
      leg: leg("kalshi", 61),
    });
    expect(r).not.toBeNull();
    expect(r!.market.contracts).toBe(75);
    expect(r!.market.cost.toFixed(2)).toBe("45.75");
    expect(r!.market.fee.toFixed(2)).toBe("1.25");
    expect(r!.hedgeStake.toFixed(2)).toBe("47.00");
    expect(r!.bonusPayout.toFixed(2)).toBe("75.00");
    expect(r!.hedgePayout.toFixed(2)).toBe("75.00");
    expect(r!.netIfBonusWins.toFixed(2)).toBe("28.00");
    expect(r!.netIfHedgeWins.toFixed(2)).toBe("28.00");
    expect(r!.guaranteedProfit.toFixed(2)).toBe("28.00");
    expect(r!.conversionPct.toFixed(2)).toBe("56.00");
  });

  it("edge prices 1 and 99, integer and .99 gross match the oracle", () => {
    const cases: Array<[number, number]> = [
      [10, 100], // G exactly 10
      [11, -110], // G exactly 10
      [33, 200], // G = 66
      [7, 299], // fractional gross
      [13, -137], // fractional gross
    ];
    for (const venue of VENUES) {
      for (const price of [1, 2, 49, 50, 98, 99]) {
        for (const [bonus, odds] of cases) {
          const r = solveBonusBetMarketHedge({
            bonusAmount: new Decimal(bonus),
            bonusOddsAmerican: odds,
            leg: leg(venue, price),
          });
          const o = bruteForceMarketBonus({
            bonusCents: bonus * 100,
            bonusOddsAmerican: odds,
            venueKey: venue,
            priceCents: price,
          });
          if (o.profit.lte(0)) expect(r).toBeNull();
          else expect(r!.guaranteedProfit.toFixed(2)).toBe(o.profit.toFixed(2));
        }
      }
    }
  });

  it("equals the integer-cent oracle on 2,000 seeded cases (seed 1201)", () => {
    const rng = mulberry32(1201);
    for (let k = 0; k < 2000; k++) {
      const bonus = randInt(rng, 1, 500);
      const odds =
        rng() < 0.6 ? randInt(rng, 100, 600) : -randInt(rng, 110, 300);
      const venue = pick(rng, VENUES);
      const price = randInt(rng, 5, 95);
      const r = solveBonusBetMarketHedge({
        bonusAmount: new Decimal(bonus),
        bonusOddsAmerican: odds,
        leg: leg(venue, price),
      });
      const o = bruteForceMarketBonus({
        bonusCents: bonus * 100,
        bonusOddsAmerican: odds,
        venueKey: venue,
        priceCents: price,
      });
      const label = `${venue} ${price}c bonus ${bonus} @ ${odds}`;
      if (o.profit.lte(0)) {
        expect(r, label).toBeNull();
      } else {
        expect(r, label).not.toBeNull();
        expect(cents(r!.guaranteedProfit), label).toBe(cents(o.profit));
        // shown profit derives from the rounded buy plus fee (D-11)
        expect(
          cents(Decimal.min(r!.netIfBonusWins, r!.netIfHedgeWins)),
          label,
        ).toBe(cents(r!.guaranteedProfit));
        expect(r!.hedgeStake.toFixed(2), label).toBe(r!.market.outlay.toFixed(2));
        expect(r!.hedgePayout.toNumber(), label).toBe(r!.market.contracts);
      }
    }
  });
});

describe("solveProfitBoostMarketHedge", () => {
  it("returns null below the minimum-odds gate (D-17)", () => {
    const r = solveProfitBoostMarketHedge({
      boostedOddsAmerican: 100,
      baseOddsAmerican: null,
      boostPercent: null,
      maxStake: new Decimal(25),
      winningsCap: null,
      minOddsAmerican: 150,
      precision: "whole",
      leg: leg("kalshi", 40),
    });
    expect(r).toBeNull();
  });

  it("equals the integer-cent oracle on 1,000 seeded cases (seed 1202)", () => {
    const rng = mulberry32(1202);
    const kinds = [null, "net_winnings", "total_payout", "boost_extra"] as const;
    let compared = 0;
    let exact = 0;
    for (let k = 0; k < 1000; k++) {
      const base =
        rng() < 0.6 ? randInt(rng, 100, 400) : -randInt(rng, 110, 250);
      const boostPercent = randInt(rng, 10, 100);
      const maxStake = randInt(rng, 1, 50);
      const kind = pick(rng, kinds);
      const published =
        kind !== "boost_extra" && rng() < 0.3
          ? base > 0
            ? base + randInt(rng, 20, 200)
            : -randInt(rng, 105, 200)
          : null;
      // a published price must beat the base price for the cap kinds
      const usePublished = published !== null && (base > 0 ? published > base : true);
      const capAmount = randInt(rng, 3, 120);
      const precision = rng() < 0.5 ? ("whole" as const) : ("cents" as const);
      const venue = pick(rng, VENUES);
      const price = randInt(rng, 5, 95);

      const winningsCap: WinningsCap | null =
        kind === null ? null : { kind, amount: new Decimal(capAmount) };
      const r = solveProfitBoostMarketHedge({
        boostedOddsAmerican: usePublished ? published : null,
        baseOddsAmerican: base,
        boostPercent: usePublished ? null : new Decimal(boostPercent),
        maxStake: new Decimal(maxStake),
        winningsCap,
        minOddsAmerican: null,
        precision,
        leg: leg(venue, price),
      });
      const o = bruteForceMarketBoost({
        boostedOddsAmerican: usePublished ? published : null,
        baseOddsAmerican: base,
        boostPercent,
        maxStakeDollars: maxStake,
        cap: kind === null ? null : { kind, amountDollars: capAmount },
        precision,
        venueKey: venue,
        priceCents: price,
      });
      const label = `#${k} ${venue} ${price}c base ${base} +${boostPercent}% max ${maxStake} ${kind} ${capAmount} ${precision}`;
      // A derived (boost %) price goes through effectiveBoostedDecimal, which
      // snaps to 20dp like the sportsbook engine; when the exact payout lands
      // on a cent boundary the engine's floor is conservative by one cent.
      // A published price is exact, so it must match the oracle exactly.
      const tolerance = usePublished ? 0 : 1;
      if (o.profit.lte(0)) {
        expect(r, label).toBeNull();
      } else {
        if (r === null) {
          expect(tolerance, label).toBe(1);
          expect(cents(o.profit), label).toBe(1);
          continue;
        }
        const diff = cents(o.profit) - cents(r.guaranteedProfit);
        expect(diff, label).toBeGreaterThanOrEqual(0);
        expect(diff, label).toBeLessThanOrEqual(tolerance);
        if (diff === 0) exact++;
        expect(r!.totalStaked.toFixed(2), label).toBe(
          r!.promoStake.plus(r!.market.outlay).toFixed(2),
        );
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(100);
    expect(exact).toBeGreaterThan(compared * 0.9);
  });
});

describe("solveArbWithMarket", () => {
  it("returns null when the market is not an arb (1/d + p >= 1)", () => {
    const r = solveArbWithMarket({
      totalStake: new Decimal(100),
      bookOddsAmerican: -150,
      leg: leg("kalshi", 50),
      precision: "cents",
    });
    expect(r).toBeNull();
  });

  it("finds a positive arb with whole-dollar book stake inside the cap", () => {
    const r = solveArbWithMarket({
      totalStake: new Decimal(100),
      bookOddsAmerican: 300,
      leg: leg("kalshi", 50),
      precision: "whole",
    });
    expect(r).not.toBeNull();
    expect(r!.bookStake.decimalPlaces()).toBe(0);
    expect(r!.result.totalLaid.lte(100)).toBe(true);
    expect(r!.result.guaranteedProfit.gt(0)).toBe(true);
  });

  it("equals the full-grid oracle on 1,000 seeded cases (seed 1203)", () => {
    const rng = mulberry32(1203);
    let found = 0;
    for (let k = 0; k < 1000; k++) {
      const precision = rng() < 0.5 ? ("whole" as const) : ("cents" as const);
      const totalStake = precision === "whole" ? randInt(rng, 10, 120) : randInt(rng, 10, 15);
      const venue = pick(rng, VENUES);
      let odds = 0;
      let price = 0;
      for (let tries = 0; tries < 200; tries++) {
        odds = rng() < 0.7 ? randInt(rng, 100, 600) : -randInt(rng, 110, 300);
        price = randInt(rng, 5, 95);
        const num = odds > 0 ? odds + 100 : -odds + 100;
        const den = odds > 0 ? 100 : -odds;
        // 1/d + p/100 < 0.99, integers only
        if (100 * den + price * num < 99 * num) break;
      }
      const r = solveArbWithMarket({
        totalStake: new Decimal(totalStake),
        bookOddsAmerican: odds,
        leg: leg(venue, price),
        precision,
      });
      const o = bruteForceMarketArb({
        totalCents: totalStake * 100,
        unitCents: precision === "whole" ? 100 : 1,
        bookOddsAmerican: odds,
        venueKey: venue,
        priceCents: price,
      });
      const label = `#${k} ${venue} ${price}c book ${odds} total ${totalStake} ${precision}`;
      if (o.profit.lte(0)) {
        expect(r, label).toBeNull();
      } else {
        expect(r, label).not.toBeNull();
        found++;
        expect(cents(r!.result.guaranteedProfit), label).toBe(cents(o.profit));
        expect(r!.result.totalLaid.lte(totalStake), label).toBe(true);
        if (precision === "whole") expect(r!.bookStake.decimalPlaces(), label).toBe(0);
        expect(r!.result.totalLaid.toFixed(2), label).toBe(
          r!.bookStake.plus(r!.market.outlay).toFixed(2),
        );
      }
    }
    expect(found).toBeGreaterThan(200);
  });
});
