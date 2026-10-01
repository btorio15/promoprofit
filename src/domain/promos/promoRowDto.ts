import Decimal from "decimal.js";
import type { PromoRowDTO, UnprofitablePromoRowDTO } from "./dto";
import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import { formatAmerican, formatUsd } from "@/lib/format";
import { getSportLabel } from "@/config/sports";
import { formatBoostPercent } from "./describe";
import { pricesAsOfFor, type PriceAgeContext } from "./priceAge";
import type { PromoOpportunity, RankablePromo, UnprofitablePromo } from "./rankPromoHedges";

/**
 * quick-260929-igk: the promo-row mappers, moved out of the "use server"
 * get-promos.ts (a server-actions file may only export async functions) so
 * getPromos AND the mark-done recompute (src/db/memberPromoState.ts) share
 * one code path. Pure: no src/db imports (ActivePromo satisfies
 * PresentablePromo structurally).
 */
export interface PresentablePromo extends RankablePromo {
  finePrintNote: string | null;
  claimHint: string | null;
  scopeLabel: string;
  autoMatched: boolean;
  addedByYou?: boolean;
  /** quick-261001-dhn: the promo's own max stake / the viewer's override (see ActivePromo). */
  promoMaxStake?: string | null;
  capOverride?: string | null;
  attribution: { verb: "Confirmed by" | "Corrected by" | "Cap entered by"; displayName: string }[];
}

export function capNoteFor(promo: PresentablePromo, capBound: "max_stake" | "max_winnings", bookNames: Map<string, string>): string | null {
  const bookName = bookNames.get(promo.bookKey) ?? promo.bookKey;

  if (capBound === "max_stake" && promo.maxStake !== null) {
    if (promo.capOverride != null && promo.promoMaxStake != null) {
      return `Capped at your ${formatUsd(promo.capOverride)} max stake (${bookName}'s page says ${formatUsd(promo.promoMaxStake)}) — a smaller stake keeps guaranteed profit equal on both sides.`;
    }
    return `Capped at ${bookName}'s ${formatUsd(promo.maxStake)} max stake — a smaller stake keeps guaranteed profit equal on both sides.`;
  }

  if (capBound === "max_winnings" && promo.winningsCap !== null) {
    return `Capped by ${bookName}'s ${formatUsd(promo.winningsCap.amount)} max winnings — a larger stake would add risk without adding profit.`;
  }

  return null;
}

/** Promos-tab "Your cap" edit data; boosts whose own cap is known only. */
export function yourCapFor(promo: PresentablePromo): { promoCap: string; override: string | null } | undefined {
  if (promo.promoType !== "profit_boost" || typeof promo.promoMaxStake !== "string") return undefined;
  return { promoCap: promo.promoMaxStake, override: promo.capOverride ?? null };
}

function attributionLineFor(promo: PresentablePromo): string | null {
  if (promo.attribution.length === 0) return null;
  return promo.attribution.map((a) => `${a.verb} ${a.displayName}`).join(" · ");
}

export function toPromoRowDTO<P extends PresentablePromo>(
  opportunity: PromoOpportunity<P>,
  bookNames: Map<string, string>,
  userBookSet: ReadonlySet<string>,
  priceAge?: PriceAgeContext,
): PromoRowDTO {
  const { promo, selection, hedge, sameBook, candidatesEvaluated, promoOddsAmerican, promoOddsDerived, result } = opportunity;

  const marketBadge = marketBadgeLabel(selection.marketType, selection.line);
  const promoSelectionLabel = selectionLabel(selection.marketType, selection.sideSelection, selection.sidePoint);
  const hedgeSelectionLabel = selectionLabel(selection.marketType, selection.oppositeSelection, selection.oppositePoint);

  let promoStake: string;
  let hedgeStake: string;
  let totalStaked: string;
  let promoPayout: string;
  let hedgePayout: string;
  let netIfPromoWins: string;
  let netIfHedgeWins: string;
  let guaranteedProfit: string;
  let rateLabel: "ROI" | "Conversion";
  let ratePct: string;
  let capNote: string | null;

  if (result.kind === "boost") {
    const b = result.boost;
    promoStake = b.promoStake.toFixed(2);
    hedgeStake = b.hedgeStake.toFixed(2);
    totalStaked = b.totalStaked.toFixed(2);
    promoPayout = b.promoPayout.toFixed(2);
    hedgePayout = b.hedgePayout.toFixed(2);
    netIfPromoWins = b.netIfPromoWins.toFixed(2);
    netIfHedgeWins = b.netIfHedgeWins.toFixed(2);
    guaranteedProfit = b.guaranteedProfit.toFixed(2);
    rateLabel = "ROI";
    ratePct = b.roiPct.toFixed(2);
    capNote = capNoteFor(promo, b.capBound, bookNames);
  } else {
    const bo = result.bonus;
    promoStake = promo.bonusAmount ?? "0.00";
    hedgeStake = bo.hedgeStake.toFixed(2);
    totalStaked = hedgeStake;
    promoPayout = bo.bonusPayout.toFixed(2);
    hedgePayout = bo.hedgePayout.toFixed(2);
    netIfPromoWins = bo.netIfBonusWins.toFixed(2);
    netIfHedgeWins = bo.netIfHedgeWins.toFixed(2);
    guaranteedProfit = bo.guaranteedProfit.toFixed(2);
    rateLabel = "Conversion";
    ratePct = bo.conversionPct.toFixed(2);
    capNote = null;
  }

  return {
    rowKey: `promo-${promo.id}`,
    promoId: promo.id,
    promoType: promo.promoType,
    promoTypeLabel: promo.promoType === "profit_boost" ? "Boost" : "Bonus bet",
    sportLabel: getSportLabel(selection.sportKey),
    commenceTime: selection.commenceTime.toISOString(),
    homeTeam: selection.homeTeam,
    awayTeam: selection.awayTeam,
    marketBadge,
    scopeLabel: promo.scopeLabel,
    candidatesEvaluated,
    autoMatched: promo.autoMatched,
    addedByYou: promo.addedByYou === true,
    finePrintNote: promo.finePrintNote,
    claimHint: promo.claimHint,
    tieRisk: selection.tieRisk,
    sameBook,
    promo: {
      bookKey: promo.bookKey,
      bookName: bookNames.get(promo.bookKey) ?? promo.bookKey,
      selectionLabel: promoSelectionLabel,
      oddsAmerican: promoOddsAmerican,
      oddsDerived: promoOddsDerived,
      baseOddsAmerican: promo.promoType === "profit_boost" ? (opportunity.promoBaseOddsAmerican ?? null) : null,
    },
    hedge: {
      bookKey: hedge.bookKey,
      bookName: bookNames.get(hedge.bookKey) ?? hedge.bookKey,
      selectionLabel: hedgeSelectionLabel,
      oddsAmerican: hedge.oddsAmerican,
    },
    promoStake,
    hedgeStake,
    totalStaked,
    promoPayout,
    hedgePayout,
    netIfPromoWins,
    netIfHedgeWins,
    guaranteedProfit,
    rateLabel,
    ratePct,
    capNote,
    attribution: attributionLineFor(promo),
    worstCase: netIfPromoWins !== netIfHedgeWins,
    hasPromoBook: userBookSet.has(promo.bookKey),
    yourCap: yourCapFor(promo),
    pricesAsOf: priceAge ? pricesAsOfFor([selection], priceAge) : null,
  };
}

/** "10% profit boost" / "Boosted to +150" / "$25.00 bonus bet" (03-UI-SPEC.md-style promo title). */
export function promoTitle(
  promo: Pick<RankablePromo, "promoType" | "boostedOddsAmerican" | "boostPercent" | "bonusAmount">,
): string {
  if (promo.promoType === "profit_boost") {
    if (promo.boostedOddsAmerican !== null) {
      return `Boosted to ${formatAmerican(promo.boostedOddsAmerican)}`;
    }
    return `${formatBoostPercent(promo.boostPercent ?? "0.00")} profit boost`;
  }
  return `${formatUsd(promo.bonusAmount ?? "0.00")} bonus bet`;
}

/**
 * "No eligible bets right now" when nothing could be evaluated at all, else
 * "No profitable hedge right now (best: X)" where X is the exact best
 * guaranteed profit found -- the sign is built from Decimal's own
 * isNegative()/abs() (never string slicing of a float) so the U+2212 minus
 * used elsewhere in this app (formatAmerican) stays consistent here too.
 */
function unprofitablePromoNote(bestGuaranteedProfit: Decimal | null): string {
  if (bestGuaranteedProfit === null) {
    return "No eligible bets right now";
  }

  const formatted = bestGuaranteedProfit.isNegative()
    ? `−${formatUsd(bestGuaranteedProfit.abs().toFixed(2))}`
    : formatUsd(bestGuaranteedProfit.toFixed(2));

  return `No profitable hedge right now (best: ${formatted})`;
}

export function toUnprofitablePromoRowDTO<P extends PresentablePromo>(
  entry: UnprofitablePromo<P>,
  bookNames: Map<string, string>,
  userBookSet: ReadonlySet<string>,
): UnprofitablePromoRowDTO {
  const { promo, bestGuaranteedProfit } = entry;

  return {
    rowKey: `unprofitable-promo-${promo.id}`,
    promoId: promo.id,
    promoType: promo.promoType,
    promoTypeLabel: promo.promoType === "profit_boost" ? "Boost" : "Bonus bet",
    bookKey: promo.bookKey,
    bookName: bookNames.get(promo.bookKey) ?? promo.bookKey,
    title: promoTitle(promo),
    scopeLabel: promo.scopeLabel,
    autoMatched: promo.autoMatched,
    addedByYou: promo.addedByYou === true,
    bestGuaranteedProfit: bestGuaranteedProfit?.toFixed(2) ?? null,
    note: unprofitablePromoNote(bestGuaranteedProfit),
    hasPromoBook: userBookSet.has(promo.bookKey),
    yourCap: yourCapFor(promo),
  };
}
