import Decimal from "decimal.js";
import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import { getSportLabel } from "@/config/sports";
import { formatUsd } from "@/lib/format";
import type { LowProfileWarning } from "./lowProfile";
import type { PromoRowDTO } from "./dto";
import { pricesAsOfFor, type PriceAgeContext } from "./priceAge";
import { attributionLineFor } from "./promoRowDto";
import type { NoSweatPromo } from "./rankNoSweat";
import type { NoSweatFeedEntry } from "./rankNoSweatFeed";

/**
 * Phase 9 (FEED-03): display-ready rows for no-sweat promos in the
 * Opportunities feed. Pure: no src/db imports. Every row is an ESTIMATE
 * (estimated: true, pctLabel "Est. ROI") because the refund's cash value is
 * an estimate (D-08, D-09); it is never a guaranteed profit.
 */

/** The presentation fields a promo needs beyond what the line search uses. */
export type PresentableNoSweatPromo = NoSweatPromo & {
  id: number;
  title: string;
  scopeLabel: string | null;
  addedByYou: boolean;
  introOffer?: boolean;
  finePrintNote: string | null;
  claimHint: string | null;
  expiresAt: Date | null;
  attribution: { verb: "Confirmed by" | "Corrected by" | "Cap entered by"; displayName: string }[];
};

export interface NoSweatRowDTO {
  kind: "no_sweat";
  estimated: true;
  rowKey: string;
  promoId: number;
  bookKey: string;
  bookName: string;
  title: string;
  scopeLabel: string | null;
  addedByYou: boolean;
  /** quick-261104-prg: shown under "Intro offers" instead of with promos. */
  introOffer: boolean;
  finePrintNote: string | null;
  claimHint: string | null;
  attribution: PromoRowDTO["attribution"];
  expiresAt: string | null;
  sportLabel: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  marketBadge: string;
  fromAlternate: boolean;
  tieRisk: boolean;
  sameBook: boolean;
  qualifying: {
    bookKey: string;
    bookName: string;
    selectionLabel: string;
    oddsAmerican: number;
    stake: string;
    winnings: string;
  };
  hedge: {
    bookKey: string;
    bookName: string;
    selectionLabel: string;
    oddsAmerican: number;
    stake: string;
    payout: string;
  };
  refundCap: string;
  refundAmount: string;
  refundValue: string;
  ratePct: string;
  conversionEventId: string;
  conversionHedgeBookKey: string;
  estimatedProfit: string;
  worstCaseProfit: string;
  profitIfWin: string;
  profitIfLose: string;
  estRoiPct: string;
  pctLabel: "Est. ROI";
  warnings: LowProfileWarning[];
  filteredOut: number;
  pricesAsOf: PromoRowDTO["pricesAsOf"];
}

export interface NoSweatNoteRowDTO {
  kind: "no_sweat_note";
  note: "cant_price" | "not_worth_it" | "low_profile_blocked";
  rowKey: string;
  promoId: number;
  bookKey: string;
  bookName: string;
  title: string;
  scopeLabel: string | null;
  refundCap: string;
  expiresAt: string | null;
  addedByYou: boolean;
  introOffer?: boolean;
  filteredOut: number;
}

function titleFor(promo: Pick<PresentableNoSweatPromo, "title" | "refundCap">): string {
  const t = promo.title.trim();
  return t.length > 0 ? t : `No-sweat up to ${formatUsd(promo.refundCap.toFixed(2))}`;
}

/** The older of two ISO times; null when either is unknown. */
function olderOf(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a || !b) return null;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

export function toNoSweatRowDTO<P extends PresentableNoSweatPromo>(
  entry: NoSweatFeedEntry<P>,
  bookNames: Map<string, string>,
  priceAge?: PriceAgeContext,
): NoSweatRowDTO {
  const { promo, opportunity: o } = entry;
  const sel = o.selection;
  const sol = o.solution;
  const nameOf = (key: string) => bookNames.get(key) ?? key;

  let pricesAsOf: string | null = null;
  if (priceAge) {
    const qualifyingAt = pricesAsOfFor([sel], priceAge);
    // A-11: the refund-conversion game's prices feed the estimate too.
    const conversionAt = pricesAsOfFor(
      [{ eventId: o.conversion.eventId, marketType: "moneyline" }],
      priceAge,
    );
    pricesAsOf = olderOf(qualifyingAt, conversionAt);
  }

  return {
    kind: "no_sweat",
    estimated: true,
    rowKey: `nosweat-${promo.id}`,
    promoId: promo.id,
    bookKey: promo.bookKey,
    bookName: nameOf(promo.bookKey),
    title: titleFor(promo),
    scopeLabel: promo.scopeLabel,
    addedByYou: promo.addedByYou,
    introOffer: promo.introOffer === true,
    finePrintNote: promo.finePrintNote,
    claimHint: promo.claimHint,
    attribution: attributionLineFor(promo),
    expiresAt: promo.expiresAt ? promo.expiresAt.toISOString() : null,
    sportLabel: getSportLabel(sel.sportKey),
    commenceTime: sel.commenceTime.toISOString(),
    homeTeam: sel.homeTeam,
    awayTeam: sel.awayTeam,
    marketBadge: marketBadgeLabel(sel.marketType, sel.line),
    fromAlternate: sel.fromAlternate === true,
    tieRisk: o.tieRisk,
    sameBook: o.sameBook,
    qualifying: {
      bookKey: o.qualifying.bookKey,
      bookName: nameOf(o.qualifying.bookKey),
      selectionLabel: selectionLabel(sel.marketType, sel.sideSelection, sel.sidePoint),
      oddsAmerican: o.qualifying.oddsAmerican,
      stake: sol.qualifyingStake.toFixed(2),
      winnings: sol.qualifyingWinnings.toFixed(2),
    },
    hedge: {
      bookKey: o.hedge.bookKey,
      bookName: nameOf(o.hedge.bookKey),
      selectionLabel: selectionLabel(sel.marketType, sel.oppositeSelection, sel.oppositePoint),
      oddsAmerican: o.hedge.oddsAmerican,
      stake: sol.hedgeStake.toFixed(2),
      payout: sol.hedgePayout.toFixed(2),
    },
    refundCap: promo.refundCap.toFixed(2),
    refundAmount: sol.refundAmount.toFixed(2),
    refundValue: sol.refundValue.toFixed(2),
    ratePct: o.conversion.pct.toFixed(2),
    conversionEventId: o.conversion.eventId,
    conversionHedgeBookKey: o.conversion.hedgeBookKey,
    estimatedProfit: sol.estimatedProfit.toFixed(2),
    worstCaseProfit: sol.worstCaseProfit.toFixed(2),
    profitIfWin: sol.profitIfWin.toFixed(2),
    profitIfLose: sol.profitIfLose.toFixed(2),
    estRoiPct: entry.estRoiPct,
    pctLabel: "Est. ROI",
    warnings: entry.warnings,
    filteredOut: entry.filteredOut,
    pricesAsOf,
  };
}

export function toNoSweatNoteRowDTO(
  promo: PresentableNoSweatPromo,
  note: NoSweatNoteRowDTO["note"],
  bookNames: Map<string, string>,
  filteredOut = 0,
): NoSweatNoteRowDTO {
  return {
    kind: "no_sweat_note",
    note,
    rowKey: `nosweat-${note}-${promo.id}`,
    promoId: promo.id,
    bookKey: promo.bookKey,
    bookName: bookNames.get(promo.bookKey) ?? promo.bookKey,
    title: titleFor(promo),
    scopeLabel: promo.scopeLabel,
    refundCap: promo.refundCap.toFixed(2),
    expiresAt: promo.expiresAt ? promo.expiresAt.toISOString() : null,
    addedByYou: promo.addedByYou,
    introOffer: promo.introOffer === true,
    filteredOut,
  };
}

function spokenMoney(value: string): string {
  const d = new Decimal(value).abs();
  const dollars = d.floor();
  const cents = d.minus(dollars).times(100).round();
  const dollarWord = dollars.eq(1) ? "dollar" : "dollars";
  const centWord = cents.eq(1) ? "cent" : "cents";
  return `${dollars.toFixed(0)} ${dollarWord} ${cents.toFixed(0)} ${centWord}`;
}

function spokenSigned(value: string): string {
  return `${new Decimal(value).isNegative() ? "minus" : "plus"} ${spokenMoney(value)}`;
}

function spokenPercent(pct: string): string {
  const d = new Decimal(pct);
  return d.isInteger() ? d.toFixed(0) : d.toFixed(2);
}

/** Spoken form for screen readers, per UI-SPEC. */
export function noSweatAriaLabel(
  dto: Pick<NoSweatRowDTO, "estimatedProfit" | "ratePct">,
): string {
  return `Estimate ${spokenSigned(dto.estimatedProfit)} at ${spokenPercent(dto.ratePct)} percent.`;
}
