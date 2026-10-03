import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import { getSportLabel } from "@/config/sports";
import type { PairLegResult } from "@/domain/hedge/pairMath";
import type { PairCandidate } from "./pairPromos";
import { pricesAsOfFor, type PriceAgeContext } from "./priceAge";
import { capNoteFor, promoTitle, yourCapFor, type PresentablePromo } from "./promoRowDto";
import type { ResolvedSelection } from "./selection";

/**
 * Display DTO for a chosen promo pair (D-07). Pure: no src/db imports. Every
 * money value is a fixed 2-dp string derived from decimal.js; the "gain" over
 * hedging each promo separately is computed with Decimal, never floats.
 */
const BONUS_LEG_NOTE = "The bonus bet's stake isn't returned, so this leg only pays out its winnings.";

export interface PairLegDTO {
  promoId: number;
  bookKey: string;
  bookName: string;
  promoTypeLabel: "Boost" | "Bonus bet";
  promoTitle: string;
  selectionLabel: string;
  oddsAmerican: number;
  /** quick-261001-e1j: the book's price before the boost (boost legs only). */
  baseOddsAmerican?: number | null;
  /** quick-261001-e1j: "Your cap" edit data, boost legs with a known promo cap only. */
  yourCap?: { promoCap: string; override: string | null };
  stake: string;
  payout: string;
  capNote: string | null;
  bonusNote: string | null;
}

/** quick-261003-fxf: the ordinary (no promo) third bet that tops up one side of a boost + boost pair. */
export interface PairTopUpLegDTO {
  side: "A" | "B";
  bookKey: string;
  bookName: string;
  selectionLabel: string;
  oddsAmerican: number;
  stake: string;
  payout: string;
  note: string;
}

export interface PairRowDTO {
  rowKey: string;
  promoIdA: number;
  promoIdB: number;
  kind: "boost_boost" | "boost_bonus";
  pairTypeLabel: "Boost + Boost" | "Boost + Bonus bet";
  sportLabel: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  marketBadge: string;
  tieRisk: boolean;
  legA: PairLegDTO;
  legB: PairLegDTO;
  /** Optional third bet (boost + boost only); null/absent for a plain 2-bet pair. */
  legC?: PairTopUpLegDTO | null;
  totalStaked: string;
  netIfAWins: string;
  netIfBWins: string;
  guaranteedProfit: string;
  roiPct: string;
  rateLabel: "ROI";
  separateProfitA: string;
  separateProfitB: string;
  gain: string;
  worstCase: boolean;
  /** quick-261001-e1j: ISO time of the OLDER cache either leg's price came from. */
  pricesAsOf?: string | null;
}

function toLegDTO(
  promo: PresentablePromo,
  selection: ResolvedSelection,
  oddsAmerican: number,
  baseOddsAmerican: number | null,
  leg: PairLegResult,
  bookNames: Map<string, string>,
): PairLegDTO {
  const isBoost = promo.promoType === "profit_boost";
  return {
    promoId: promo.id,
    bookKey: promo.bookKey,
    bookName: bookNames.get(promo.bookKey) ?? promo.bookKey,
    promoTypeLabel: isBoost ? "Boost" : "Bonus bet",
    promoTitle: promoTitle(promo),
    selectionLabel: selectionLabel(selection.marketType, selection.sideSelection, selection.sidePoint),
    oddsAmerican,
    baseOddsAmerican: isBoost ? baseOddsAmerican : null,
    yourCap: yourCapFor(promo),
    stake: leg.stake.toFixed(2),
    payout: leg.payout.toFixed(2),
    capNote: isBoost && leg.capBound !== null ? capNoteFor(promo, leg.capBound, bookNames) : null,
    bonusNote: isBoost ? null : BONUS_LEG_NOTE,
  };
}

function toTopUpLegDTO<P extends PresentablePromo>(
  c: PairCandidate<P>,
  bookNames: Map<string, string>,
): PairTopUpLegDTO | null {
  const topUp = c.topUp ?? null;
  const leg = c.result.topUp?.leg;
  if (!topUp || !leg) return null;
  const label = selectionLabel(topUp.selection.marketType, topUp.selection.sideSelection, topUp.selection.sidePoint);
  return {
    side: topUp.side,
    bookKey: topUp.bookKey,
    bookName: bookNames.get(topUp.bookKey) ?? topUp.bookKey,
    selectionLabel: label,
    oddsAmerican: topUp.oddsAmerican,
    stake: leg.stake.toFixed(2),
    payout: leg.payout.toFixed(2),
    note: `Ordinary bet (no promo): tops up the ${label} side so the bigger boost can use its full cap.`,
  };
}

export function toPairRowDTO<P extends PresentablePromo>(
  c: PairCandidate<P>,
  bookNames: Map<string, string>,
  priceAge?: PriceAgeContext,
): PairRowDTO {
  const { result, selectionA } = c;
  return {
    rowKey: `pair-${c.promoA.id}-${c.promoB.id}`,
    promoIdA: c.promoA.id,
    promoIdB: c.promoB.id,
    kind: c.kind,
    pairTypeLabel: c.kind === "boost_boost" ? "Boost + Boost" : "Boost + Bonus bet",
    sportLabel: getSportLabel(selectionA.sportKey),
    commenceTime: selectionA.commenceTime.toISOString(),
    homeTeam: selectionA.homeTeam,
    awayTeam: selectionA.awayTeam,
    marketBadge: marketBadgeLabel(selectionA.marketType, selectionA.line),
    tieRisk: selectionA.tieRisk || c.selectionB.tieRisk,
    legA: toLegDTO(c.promoA, c.selectionA, c.oddsAAmerican, c.baseOddsAAmerican, result.legA, bookNames),
    legB: toLegDTO(c.promoB, c.selectionB, c.oddsBAmerican, c.baseOddsBAmerican, result.legB, bookNames),
    legC: toTopUpLegDTO(c, bookNames),
    totalStaked: result.totalStaked.toFixed(2),
    netIfAWins: result.netIfAWins.toFixed(2),
    netIfBWins: result.netIfBWins.toFixed(2),
    guaranteedProfit: result.guaranteedProfit.toFixed(2),
    roiPct: result.roiPct.toFixed(2),
    rateLabel: "ROI",
    separateProfitA: c.separateProfitA.toFixed(2),
    separateProfitB: c.separateProfitB.toFixed(2),
    gain: result.guaranteedProfit.minus(c.separateProfitA).minus(c.separateProfitB).toFixed(2),
    worstCase: !result.netIfAWins.equals(result.netIfBWins),
    pricesAsOf: priceAge ? pricesAsOfFor([c.selectionA, c.selectionB], priceAge) : null,
  };
}
