import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";

/**
 * Profit-boost (stake-returned) hedge solver with cap-aware stake
 * optimization (CALC-02, CALC-03). This is its own module -- it does NOT
 * share a "generic hedge" function or a "stake returned?" flag with
 * bonusBet.ts (see 03-RESEARCH.md Pitfall 3). A profit boost returns the
 * promo stake on both outcomes (unlike a bonus bet, which is stake-not-
 * returned), and the two engines' cap/kink math diverges enough that a
 * shared abstraction would obscure both.
 *
 * - D-02: the promo stake defaults to the maximum allowed by the caps --
 *   the max-stake cap, or the smaller max-winnings kink stake when that
 *   cap binds tighter than the max-stake cap.
 * - D-03: a book-published boosted price always wins over a boost % --
 *   the boost-% derivation is a fallback used only when no published
 *   price exists; a published price is never re-derived from boost %.
 * - D-17: a boost below its stated minimum odds, or whose best hedge
 *   yields zero/negative guaranteed profit, is not shown (returns null)
 *   instead of a $0-or-negative row.
 * - D-18: maxStake is required and this solver is never invoked without
 *   one. The max-winnings cap's wording convention (net_winnings vs.
 *   total_payout vs. boost_extra) comes from the book's own promo text,
 *   as recorded in 03-RECON.md, and is never guessed here -- callers must
 *   supply the correct WinningsCapKind.
 */

export type WinningsCapKind = "net_winnings" | "total_payout" | "boost_extra";

export interface WinningsCap {
  kind: WinningsCapKind;
  amount: Decimal;
}

export interface ProfitBoostInput {
  boostedOddsAmerican: number | null;
  baseOddsAmerican: number | null;
  boostPercent: Decimal | null;
  hedgeOddsAmerican: number;
  maxStake: Decimal;
  winningsCap: WinningsCap | null;
  minOddsAmerican: number | null;
  precision: StakePrecision;
}

export interface ProfitBoostResult {
  boostedDecimalOdds: Decimal;
  priceSource: "published" | "derived";
  promoStake: Decimal;
  hedgeStake: Decimal;
  totalStaked: Decimal;
  promoPayout: Decimal;
  hedgePayout: Decimal;
  netIfPromoWins: Decimal;
  netIfHedgeWins: Decimal;
  guaranteedProfit: Decimal;
  roiPct: Decimal;
  capBound: "max_stake" | "max_winnings";
}

// Local clone so this module never mutates the shared global Decimal config.
const LocalDecimal = Decimal.clone({ precision: 40 });

// American odds like -300 (1 + 1/3) or -275 (1 + 4/11) have no exact base-10
// representation, so every division/multiplication through them carries an
// unavoidable truncation of a few units in the ~38th-40th decimal place (see
// americanOdds.ts). Snapping to 20 decimal places with normal rounding
// erases that noise -- many orders of magnitude below a cent -- while
// leaving genuine sub-cent content (which needs a real floor/ceiling
// decision) untouched. Same discipline as bonusBet.ts/arbMath.ts.
function clean(value: Decimal): Decimal {
  return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
}

// Books pay whole cents; flooring is the conservative assumption everywhere
// a payout is computed.
function floorCents(value: Decimal): Decimal {
  return clean(value).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

function dedupe(values: Decimal[]): Decimal[] {
  return values.filter(
    (value, index) => values.findIndex((other) => other.equals(value)) === index,
  );
}

function clamp(value: Decimal, min: Decimal, max: Decimal): Decimal {
  if (value.lt(min)) return min;
  if (value.gt(max)) return max;
  return value;
}

/**
 * D-03: a book-published boosted price always wins over a boost %. If
 * boostedOddsAmerican is provided, it is used as-is (converted via the
 * existing americanToDecimal) and boostPercent is ignored entirely -- the
 * boosted price is never re-derived from boost % when the book already
 * published one, because the book's own rounding of that published price
 * is the number a real bet will settle against. Only when no published
 * price exists is the boosted price derived from boostPercent applied to
 * profit on the base odds.
 */
export function effectiveBoostedDecimal(
  input: Pick<ProfitBoostInput, "boostedOddsAmerican" | "baseOddsAmerican" | "boostPercent">,
): { decimal: Decimal; source: "published" | "derived" } {
  if (input.boostedOddsAmerican !== null) {
    return {
      decimal: new LocalDecimal(americanToDecimal(input.boostedOddsAmerican)),
      source: "published",
    };
  }

  if (input.baseOddsAmerican === null || input.boostPercent === null) {
    throw new RangeError(
      "baseOddsAmerican and boostPercent are both required when boostedOddsAmerican is not provided",
    );
  }

  const boostPercent = new LocalDecimal(input.boostPercent);
  if (boostPercent.lte(0)) {
    throw new RangeError(`boostPercent must be greater than 0, got ${boostPercent.toString()}`);
  }

  const baseDecimalOdds = new LocalDecimal(americanToDecimal(input.baseOddsAmerican));
  const decimal = clean(
    new LocalDecimal(1).plus(
      baseDecimalOdds.minus(1).times(new LocalDecimal(1).plus(boostPercent.dividedBy(100))),
    ),
  );

  return { decimal, source: "derived" };
}

/**
 * Display-only conversion from decimal odds back to American odds. The
 * math elsewhere in this module always uses the exact decimal -- this is
 * purely for rendering a boosted/base price the way a book would show it.
 * Uses conservative rounding (toward the worse price for the bettor) on
 * each side, then goes through parseInt on a fixed-point string (never
 * Math.round/floor/ceil or a native-float parse) to produce the integer.
 */
export function decimalToAmericanDisplay(decimalOdds: Decimal): number {
  const d = clean(new LocalDecimal(decimalOdds));

  if (d.gte(2)) {
    const positive = d.minus(1).times(100).toDecimalPlaces(0, Decimal.ROUND_DOWN);
    return parseInt(positive.toFixed(0), 10);
  }

  const negative = new LocalDecimal(100).dividedBy(d.minus(1)).toDecimalPlaces(0, Decimal.ROUND_UP);
  return parseInt(negative.negated().toFixed(0), 10);
}

interface Candidate {
  promoStake: Decimal;
  hedgeStake: Decimal;
  totalStaked: Decimal;
  promoPayout: Decimal;
  hedgePayout: Decimal;
  netIfPromoWins: Decimal;
  netIfHedgeWins: Decimal;
  guaranteedProfit: Decimal;
}

/**
 * Exact (pre-cent-floor) promo payout for a given stake, per the cap kind.
 * See "Boost Math" / "Boost Stake Optimization Under Caps" in 03-RESEARCH.md.
 */
function promoPayoutRaw(
  stake: Decimal,
  obEff: Decimal,
  baseDecimalOdds: Decimal | null,
  winningsCap: WinningsCap | null,
): Decimal {
  if (!winningsCap) {
    return stake.times(obEff);
  }

  if (winningsCap.kind === "net_winnings") {
    return stake.plus(Decimal.min(stake.times(obEff.minus(1)), winningsCap.amount));
  }

  if (winningsCap.kind === "total_payout") {
    return Decimal.min(stake.times(obEff), winningsCap.amount);
  }

  // boost_extra: validated at the top of calculateProfitBoostHedge that
  // baseDecimalOdds is not null whenever this cap kind is used.
  const baseOdds = baseDecimalOdds as Decimal;
  return stake
    .times(baseOdds)
    .plus(Decimal.min(stake.times(obEff.minus(baseOdds)), winningsCap.amount));
}

/** Kink stake S* where the winnings cap starts to bind, per cap kind. */
function kinkStake(
  obEff: Decimal,
  baseDecimalOdds: Decimal | null,
  winningsCap: WinningsCap,
): Decimal {
  if (winningsCap.kind === "net_winnings") {
    return winningsCap.amount.dividedBy(obEff.minus(1));
  }
  if (winningsCap.kind === "total_payout") {
    return winningsCap.amount.dividedBy(obEff);
  }
  const baseOdds = baseDecimalOdds as Decimal;
  return winningsCap.amount.dividedBy(obEff.minus(baseOdds));
}

export function calculateProfitBoostHedge(input: ProfitBoostInput): ProfitBoostResult | null {
  const maxStake = new LocalDecimal(input.maxStake);
  if (maxStake.lte(0)) {
    throw new RangeError(`maxStake must be greater than 0, got ${maxStake.toString()}`);
  }
  if (maxStake.decimalPlaces() > 2) {
    throw new RangeError(
      `maxStake must have at most 2 decimal places, got ${maxStake.toString()}`,
    );
  }

  const { decimal: boostedDecimalOdds, source: priceSource } = effectiveBoostedDecimal(input);

  const baseDecimalOdds =
    input.baseOddsAmerican !== null
      ? new LocalDecimal(americanToDecimal(input.baseOddsAmerican))
      : null;

  const winningsCapInput = input.winningsCap;
  let winningsCap: WinningsCap | null = null;
  if (winningsCapInput) {
    const capAmount = new LocalDecimal(winningsCapInput.amount);
    if (capAmount.lte(0)) {
      throw new RangeError(
        `winningsCap.amount must be greater than 0, got ${capAmount.toString()}`,
      );
    }
    if (winningsCapInput.kind === "boost_extra" && baseDecimalOdds === null) {
      throw new RangeError('winningsCap.kind "boost_extra" requires baseOddsAmerican');
    }
    winningsCap = { kind: winningsCapInput.kind, amount: capAmount };
  }

  const hedgeDecimalOdds = new LocalDecimal(americanToDecimal(input.hedgeOddsAmerican));

  // D-17: eligibility check, before any stake optimization.
  if (input.minOddsAmerican !== null) {
    const minDecimalOdds = new LocalDecimal(americanToDecimal(input.minOddsAmerican));
    if (boostedDecimalOdds.lt(minDecimalOdds)) {
      return null;
    }
  }

  const dp = input.precision === "whole" ? 0 : 2;
  const unit = dp === 0 ? new LocalDecimal(1) : new LocalDecimal("0.01");

  const flooredMaxStake = maxStake.toDecimalPlaces(dp, Decimal.ROUND_DOWN);

  let capBound: "max_stake" | "max_winnings" = "max_stake";
  const stakeCandidates: Decimal[] = [flooredMaxStake];

  if (winningsCap) {
    const sStar = clean(kinkStake(boostedDecimalOdds, baseDecimalOdds, winningsCap));

    if (sStar.lt(flooredMaxStake)) {
      capBound = "max_winnings";
      const sFloor = clamp(sStar.toDecimalPlaces(dp, Decimal.ROUND_DOWN), unit, flooredMaxStake);
      const sCeil = clamp(sStar.toDecimalPlaces(dp, Decimal.ROUND_UP), unit, flooredMaxStake);
      stakeCandidates.push(sFloor, sCeil);
    }
  }

  const uniqueStakes = dedupe(stakeCandidates).filter((stake) => stake.gt(0));

  let best: Candidate | null = null;

  for (const promoStake of uniqueStakes) {
    const promoPayout = floorCents(
      promoPayoutRaw(promoStake, boostedDecimalOdds, baseDecimalOdds, winningsCap),
    );

    const h0 = clean(promoPayout.dividedBy(hedgeDecimalOdds));
    const hFloor = h0.toDecimalPlaces(dp, Decimal.ROUND_DOWN);
    const hCeil = h0.toDecimalPlaces(dp, Decimal.ROUND_UP);
    const hedgeCandidates = dedupe(
      [hFloor.minus(unit), hFloor, hCeil, hCeil.plus(unit)].filter((h) => h.gt(0)),
    );

    for (const hedgeStake of hedgeCandidates) {
      const hedgePayout = floorCents(hedgeStake.times(hedgeDecimalOdds));
      const totalStaked = promoStake.plus(hedgeStake);
      const netIfPromoWins = promoPayout.minus(totalStaked);
      const netIfHedgeWins = hedgePayout.minus(totalStaked);
      const guaranteedProfit = Decimal.min(netIfPromoWins, netIfHedgeWins);

      const isBetter =
        best === null ||
        guaranteedProfit.gt(best.guaranteedProfit) ||
        (guaranteedProfit.equals(best.guaranteedProfit) && totalStaked.lt(best.totalStaked)) ||
        (guaranteedProfit.equals(best.guaranteedProfit) &&
          totalStaked.equals(best.totalStaked) &&
          hedgeStake.lt(best.hedgeStake));

      if (isBetter) {
        best = {
          promoStake,
          hedgeStake,
          totalStaked,
          promoPayout,
          hedgePayout,
          netIfPromoWins,
          netIfHedgeWins,
          guaranteedProfit,
        };
      }
    }
  }

  if (best === null || best.guaranteedProfit.lte(0)) {
    return null;
  }

  const roiPct = best.guaranteedProfit
    .dividedBy(best.totalStaked)
    .times(100)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  return {
    boostedDecimalOdds,
    priceSource,
    promoStake: best.promoStake,
    hedgeStake: best.hedgeStake,
    totalStaked: best.totalStaked,
    promoPayout: best.promoPayout,
    hedgePayout: best.hedgePayout,
    netIfPromoWins: best.netIfPromoWins,
    netIfHedgeWins: best.netIfHedgeWins,
    guaranteedProfit: best.guaranteedProfit,
    roiPct,
    capBound,
  };
}
