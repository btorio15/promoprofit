import Decimal from "decimal.js";
import { americanToDecimal } from "@/domain/hedge/americanOdds";
import {
  solveBoostBonusPair,
  solveBoostBoostPair,
  type BonusLegInput,
  type BoostLegInput,
  type PairResult,
} from "@/domain/hedge/pairMath";
import { decimalToAmericanDisplay, effectiveBoostedDecimal } from "@/domain/hedge/profitBoost";
import {
  candidatesFor,
  passesBaseMinOdds,
  type PromoOpportunity,
  type RankablePromo,
  type RankOptions,
} from "./rankPromoHedges";
import type { ResolvedSelection, SelectionQuote } from "./selection";
import type { PromoMarketType, PromoSide } from "./types";

/**
 * Pair discovery (D-08, D-09, D-18) and exact non-conflicting selection
 * (D-10). Pure, zero-I/O: two promos at two different member books, on
 * opposite outcomes of the same market, each leg with its own mechanics
 * (boost, caps, stake-not-returned bonus bet). Bonus + bonus is never a pair.
 * A pair is kept only when it beats hedging the two promos separately, and
 * the final choice gives every promo at most one pair via exact matching.
 * All money math is decimal.js.
 */

// Local clone: 40 digits for the pruning bounds, never touching global config.
const LocalDecimal = Decimal.clone({ precision: 40 });

export interface PairCandidate<P extends RankablePromo = RankablePromo> {
  /** For boost_bonus this is the boost; for boost_boost the lower promo id. */
  promoA: P;
  promoB: P;
  kind: "boost_boost" | "boost_bonus";
  selectionA: ResolvedSelection;
  selectionB: ResolvedSelection;
  marketKey: string;
  oddsAAmerican: number;
  oddsBAmerican: number;
  /** Each boost leg's own price before the boost; null for bonus legs / published-only boosts. */
  baseOddsAAmerican: number | null;
  baseOddsBAmerican: number | null;
  result: PairResult;
  separateProfitA: Decimal;
  separateProfitB: Decimal;
  /** pair profit minus the two promos hedged separately. */
  gain: Decimal;
}

const MARKET_ORDER: Record<PromoMarketType, number> = { moneyline: 0, spread: 1, total: 2 };
const SIDE_ORDER: Record<PromoSide, number> = { home: 0, away: 1, over: 2, under: 3 };
const OPPOSITE_SIDE: Record<PromoSide, PromoSide> = { home: "away", away: "home", over: "under", under: "over" };

/** Each promo's guaranteed profit from its single (rankPromoHedges) hedge. */
export function singleProfitMap(opportunities: PromoOpportunity[]): Map<number, Decimal> {
  const map = new Map<number, Decimal>();
  for (const opp of opportunities) {
    map.set(
      opp.promo.id,
      opp.result.kind === "boost" ? opp.result.boost.guaranteedProfit : opp.result.bonus.guaranteedProfit,
    );
  }
  return map;
}

/**
 * Key shared by both sides of one market: moneyline "ml"; spread = the HOME
 * team's signed point (home line L -> L, away line L -> -L); total = the line.
 */
export function marketKeyOf(selection: ResolvedSelection): string {
  let k: string;
  if (selection.marketType === "moneyline") {
    k = "ml";
  } else if (selection.marketType === "spread") {
    const line = selection.line ?? 0;
    k = String(selection.side === "home" ? line : line === 0 ? 0 : -line);
  } else {
    k = String(selection.line ?? 0);
  }
  return `${selection.eventId}|${selection.marketType}|${k}`;
}

/** The same market seen from the opposite side (quotes and points swapped). */
function flipSelection(sel: ResolvedSelection): ResolvedSelection {
  return {
    ...sel,
    side: OPPOSITE_SIDE[sel.side],
    line: sel.marketType === "spread" && sel.line !== null ? (sel.line === 0 ? 0 : -sel.line) : sel.line,
    sideSelection: sel.oppositeSelection,
    sidePoint: sel.oppositePoint,
    oppositeSelection: sel.sideSelection,
    oppositePoint: sel.sidePoint,
    promoSideQuotes: sel.oppositeSideQuotes,
    oppositeSideQuotes: sel.promoSideQuotes,
  };
}

interface LegOption<P extends RankablePromo> {
  promo: P;
  selection: ResolvedSelection;
  marketKey: string;
  side: PromoSide;
  oddsAmerican: number;
  baseOddsAmerican: number | null;
  /** decimal odds used for pruning */
  oddsDecimal: Decimal;
  boost: BoostLegInput | null;
  bonus: BonusLegInput | null;
}

function buildLegOption<P extends RankablePromo>(
  promo: P,
  selection: ResolvedSelection,
): LegOption<P> | null {
  const ownQuote: SelectionQuote | null = selection.promoSideQuotes.find((q) => q.bookKey === promo.bookKey) ?? null;
  const base = { promo, selection, marketKey: marketKeyOf(selection), side: selection.side };

  if (promo.promoType === "profit_boost") {
    if (promo.maxStake === null) return null; // D-18
    const isPinned = promo.pinned !== null;
    if (!isPinned && !ownQuote) return null;
    if (!passesBaseMinOdds(promo, ownQuote)) return null;

    const input: BoostLegInput = {
      boostedOddsAmerican: isPinned ? promo.boostedOddsAmerican : null,
      baseOddsAmerican: ownQuote?.oddsAmerican ?? (isPinned ? promo.baseOddsAmerican : null),
      boostPercent: promo.boostPercent !== null ? new Decimal(promo.boostPercent) : null,
      maxStake: new Decimal(promo.maxStake),
      winningsCap: promo.winningsCap
        ? { kind: promo.winningsCap.kind, amount: new Decimal(promo.winningsCap.amount) }
        : null,
      minOddsAmerican: promo.minOddsAmerican,
    };

    try {
      const { decimal } = effectiveBoostedDecimal(input);
      return {
        ...base,
        oddsAmerican: input.boostedOddsAmerican ?? decimalToAmericanDisplay(decimal),
        baseOddsAmerican: input.baseOddsAmerican,
        oddsDecimal: new LocalDecimal(decimal),
        boost: input,
        bonus: null,
      };
    } catch (err) {
      if (err instanceof RangeError) {
        console.warn(`pairPromos: promo ${promo.id} leg raised RangeError: ${err.message}`);
        return null;
      }
      throw err;
    }
  }

  if (!ownQuote || promo.bonusAmount === null) return null;
  return {
    ...base,
    oddsAmerican: ownQuote.oddsAmerican,
    baseOddsAmerican: null,
    oddsDecimal: new LocalDecimal(americanToDecimal(ownQuote.oddsAmerican)),
    boost: null,
    bonus: { bonusAmount: new Decimal(promo.bonusAmount), oddsAmerican: ownQuote.oddsAmerican },
  };
}

function legOptionsFor<P extends RankablePromo>(promo: P, opts: RankOptions): Map<string, LegOption<P>[]> {
  const byMarket = new Map<string, LegOption<P>[]>();
  const seen = new Set<string>();

  const add = (selection: ResolvedSelection) => {
    const key = `${marketKeyOf(selection)}|${selection.side}`;
    if (seen.has(key)) return;
    seen.add(key);
    const option = buildLegOption(promo, selection);
    if (!option) return;
    const list = byMarket.get(option.marketKey) ?? [];
    list.push(option);
    byMarket.set(option.marketKey, list);
  };

  for (const selection of candidatesFor(promo, opts)) {
    add(selection);
    // Unpinned promos may sit on either side of a market.
    if (promo.pinned === null) add(flipSelection(selection));
  }
  return byMarket;
}

function lineOfKey(marketKey: string): Decimal {
  const k = marketKey.split("|")[2];
  return new Decimal(k === "ml" ? 0 : k);
}

/** Better = higher profit, then commence asc, eventId, market, line, side, lower ids. */
function isBetterCandidate(a: PairCandidate, b: PairCandidate | null): boolean {
  if (!b) return true;
  const profit = a.result.guaranteedProfit.comparedTo(b.result.guaranteedProfit);
  if (profit !== 0) return profit > 0;
  const time = a.selectionA.commenceTime.getTime() - b.selectionA.commenceTime.getTime();
  if (time !== 0) return time < 0;
  if (a.selectionA.eventId !== b.selectionA.eventId) return a.selectionA.eventId < b.selectionA.eventId;
  const market = MARKET_ORDER[a.selectionA.marketType] - MARKET_ORDER[b.selectionA.marketType];
  if (market !== 0) return market < 0;
  const lineDiff = lineOfKey(a.marketKey).comparedTo(lineOfKey(b.marketKey));
  if (lineDiff !== 0) return lineDiff < 0;
  const side = SIDE_ORDER[a.selectionA.side] - SIDE_ORDER[b.selectionA.side];
  if (side !== 0) return side < 0;
  return a.promoA.id < b.promoA.id;
}

function commenceOf(c: PairCandidate): number {
  return c.selectionA.commenceTime.getTime();
}

/**
 * Every boost+boost and boost+bonus pair on opposite sides of one market at
 * two different member books, one (best) market per promo pair, kept only
 * when it strictly beats the two promos hedged separately (D-08).
 */
export function findPairCandidates<P extends RankablePromo>(
  promos: P[],
  singles: ReadonlyMap<number, Decimal>,
  opts: RankOptions & { memberBookKeys: ReadonlySet<string> },
): PairCandidate<P>[] {
  const eligible = promos
    .filter((p) => opts.memberBookKeys.has(p.bookKey)) // D-18
    .sort((x, y) => x.id - y.id);

  const options = new Map<number, Map<string, LegOption<P>[]>>();
  for (const promo of eligible) options.set(promo.id, legOptionsFor(promo, opts));

  const results: PairCandidate<P>[] = [];
  const zero = new Decimal(0);

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const lo = eligible[i];
      const hi = eligible[j];
      if (lo.bookKey === hi.bookKey) continue;
      const loBoost = lo.promoType === "profit_boost";
      const hiBoost = hi.promoType === "profit_boost";
      if (!loBoost && !hiBoost) continue; // D-09

      // boost_boost: lower id is A. boost_bonus: the boost is A.
      const [pa, pb] = loBoost ? [lo, hi] : [hi, lo];
      const singleA = singles.get(pa.id) ?? zero;
      const singleB = singles.get(pb.id) ?? zero;
      const singleSum = singleA.plus(singleB);
      const kind: PairCandidate["kind"] = loBoost && hiBoost ? "boost_boost" : "boost_bonus";

      const optsA = options.get(pa.id)!;
      const optsB = options.get(pb.id)!;

      let best: PairCandidate<P> | null = null;

      for (const [marketKey, listA] of optsA) {
        const listB = optsB.get(marketKey);
        if (!listB) continue;
        for (const legA of listA) {
          for (const legB of listB) {
            if (legA.side !== OPPOSITE_SIDE[legB.side]) continue;

            // Decimal-only prune before calling the solver.
            const boostA = legA.boost!;
            const one = new LocalDecimal(1);
            let bound: Decimal;
            if (kind === "boost_boost") {
              if (one.dividedBy(legA.oddsDecimal).plus(one.dividedBy(legB.oddsDecimal)).gte(1)) continue;
              const boostB = legB.boost!;
              bound = Decimal.min(
                new LocalDecimal(boostA.maxStake).times(legA.oddsDecimal.minus(1)),
                new LocalDecimal(boostB.maxStake).times(legB.oddsDecimal.minus(1)),
              );
            } else {
              const winIfBonus = new LocalDecimal(legB.bonus!.bonusAmount).times(legB.oddsDecimal.minus(1));
              bound = Decimal.min(winIfBonus, new LocalDecimal(boostA.maxStake).times(legA.oddsDecimal.minus(1)));
            }
            if (bound.lte(singleSum)) continue;

            let result: PairResult | null;
            try {
              result =
                kind === "boost_boost"
                  ? solveBoostBoostPair(boostA, legB.boost!, opts.precision)
                  : solveBoostBonusPair(boostA, legB.bonus!, opts.precision);
            } catch (err) {
              if (err instanceof RangeError) {
                console.warn(`pairPromos: pair ${pa.id}/${pb.id} raised RangeError: ${err.message}`);
                continue;
              }
              throw err;
            }
            if (!result) continue;
            if (!result.guaranteedProfit.gt(singleSum)) continue; // D-08 strict gate

            const candidate: PairCandidate<P> = {
              promoA: pa,
              promoB: pb,
              kind,
              selectionA: legA.selection,
              selectionB: legB.selection,
              marketKey,
              oddsAAmerican: legA.oddsAmerican,
              oddsBAmerican: legB.oddsAmerican,
              baseOddsAAmerican: legA.baseOddsAmerican,
              baseOddsBAmerican: legB.baseOddsAmerican,
              result,
              separateProfitA: singleA,
              separateProfitB: singleB,
              gain: result.guaranteedProfit.minus(singleSum),
            };
            if (isBetterCandidate(candidate, best)) best = candidate;
          }
        }
      }

      if (best) results.push(best);
    }
  }

  return sortPairs(results);
}

function sortPairs<P extends RankablePromo>(pairs: PairCandidate<P>[]): PairCandidate<P>[] {
  return [...pairs].sort((a, b) => {
    const profit = b.result.guaranteedProfit.comparedTo(a.result.guaranteedProfit);
    if (profit !== 0) return profit;
    const time = commenceOf(a) - commenceOf(b);
    if (time !== 0) return time;
    if (a.promoA.id !== b.promoA.id) return a.promoA.id - b.promoA.id;
    return a.promoB.id - b.promoB.id;
  });
}

const EXACT_COMPONENT_LIMIT = 20;

function pairIds(c: PairCandidate): [number, number] {
  return c.promoA.id < c.promoB.id ? [c.promoA.id, c.promoB.id] : [c.promoB.id, c.promoA.id];
}

/** Lexicographic compare of sorted [a,b] id lists. */
function compareIdLists(a: PairCandidate[], b: PairCandidate[]): number {
  const la = a.map(pairIds).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const lb = b.map(pairIds).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const n = Math.min(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i][0] !== lb[i][0]) return la[i][0] - lb[i][0];
    if (la[i][1] !== lb[i][1]) return la[i][1] - lb[i][1];
  }
  return la.length - lb.length;
}

interface Choice<P extends RankablePromo> {
  gain: Decimal;
  chosen: PairCandidate<P>[];
}

/** Greater gain, then fewer pairs, then lexicographically smaller id list. */
function isBetterChoice<P extends RankablePromo>(a: Choice<P>, b: Choice<P>): boolean {
  const gain = a.gain.comparedTo(b.gain);
  if (gain !== 0) return gain > 0;
  if (a.chosen.length !== b.chosen.length) return a.chosen.length < b.chosen.length;
  return compareIdLists(a.chosen, b.chosen) < 0;
}

function solveComponentExact<P extends RankablePromo>(
  nodes: number[],
  edges: PairCandidate<P>[],
): PairCandidate<P>[] {
  const index = new Map(nodes.map((id, i) => [id, i]));
  const neighbors: Array<Array<{ j: number; edge: PairCandidate<P> }>> = nodes.map(() => []);
  for (const edge of edges) {
    const i = index.get(edge.promoA.id)!;
    const j = index.get(edge.promoB.id)!;
    neighbors[i].push({ j, edge });
    neighbors[j].push({ j: i, edge });
  }
  for (const list of neighbors) list.sort((x, y) => x.j - y.j);

  const memo = new Map<number, Choice<P>>();
  const solve = (mask: number): Choice<P> => {
    if (mask === 0) return { gain: new Decimal(0), chosen: [] };
    const cached = memo.get(mask);
    if (cached) return cached;

    // Lowest unmatched node: leave single, or match with a neighbor.
    let i = 0;
    while (((mask >> i) & 1) === 0) i++;
    const without = mask & ~(1 << i);

    let best: Choice<P> = solve(without);
    for (const { j, edge } of neighbors[i]) {
      if (((without >> j) & 1) === 0) continue;
      const rest = solve(without & ~(1 << j));
      const option: Choice<P> = { gain: rest.gain.plus(edge.gain), chosen: [...rest.chosen, edge] };
      if (isBetterChoice(option, best)) best = option;
    }
    memo.set(mask, best);
    return best;
  };

  return solve((1 << nodes.length) - 1).chosen;
}

function solveComponentGreedy<P extends RankablePromo>(edges: PairCandidate<P>[]): PairCandidate<P>[] {
  const ordered = [...edges].sort((a, b) => {
    const gain = b.gain.comparedTo(a.gain);
    if (gain !== 0) return gain;
    const [a0, a1] = pairIds(a);
    const [b0, b1] = pairIds(b);
    return a0 - b0 || a1 - b1;
  });
  const used = new Set<number>();
  const chosen: PairCandidate<P>[] = [];
  for (const edge of ordered) {
    if (used.has(edge.promoA.id) || used.has(edge.promoB.id)) continue;
    used.add(edge.promoA.id);
    used.add(edge.promoB.id);
    chosen.push(edge);
  }
  return chosen;
}

/**
 * Chooses the set of pairs maximizing total gain with each promo in at most
 * one pair (D-10). Exact memoized bitmask DP per connected component of up
 * to 20 promos; larger components use a deterministic greedy-by-gain
 * fallback (reported through onFallback). Ties: fewer pairs, then the
 * lexicographically smaller sorted pair-id list.
 */
export function selectPairs<P extends RankablePromo>(
  candidates: PairCandidate<P>[],
  opts?: { onFallback?: (componentSize: number) => void },
): PairCandidate<P>[] {
  // Union-find over promo ids.
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  for (const c of candidates) {
    for (const id of [c.promoA.id, c.promoB.id]) if (!parent.has(id)) parent.set(id, id);
  }
  for (const c of candidates) {
    const ra = find(c.promoA.id);
    const rb = find(c.promoB.id);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  }

  const components = new Map<number, { nodes: Set<number>; edges: PairCandidate<P>[] }>();
  for (const c of candidates) {
    const root = find(c.promoA.id);
    const comp = components.get(root) ?? { nodes: new Set<number>(), edges: [] };
    comp.nodes.add(c.promoA.id);
    comp.nodes.add(c.promoB.id);
    comp.edges.push(c);
    components.set(root, comp);
  }

  const chosen: PairCandidate<P>[] = [];
  for (const root of [...components.keys()].sort((a, b) => a - b)) {
    const comp = components.get(root)!;
    const nodes = [...comp.nodes].sort((a, b) => a - b);
    if (nodes.length <= EXACT_COMPONENT_LIMIT) {
      chosen.push(...solveComponentExact(nodes, comp.edges));
    } else {
      opts?.onFallback?.(nodes.length);
      chosen.push(...solveComponentGreedy(comp.edges));
    }
  }

  return sortPairs(chosen);
}
