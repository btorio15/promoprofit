"use server";

import Decimal from "decimal.js";
import { requireUser } from "@/lib/session";
import { COLORADO_BOOKS } from "@/config/books";
import { SCRAPE_TARGET_BOOK_KEYS } from "@/config/scrapeTargets";
import { PromosInputSchema } from "@/domain/promos/promosInput";
import type {
  CorrectionOptions,
  GetPromosResponse,
  PromoRowDTO,
  PromosEmptyVariant,
  QueueItemDTO,
  ScrapeStatusLineDTO,
  UnprofitablePromoRowDTO,
} from "@/domain/promos/dto";
import { getActivePromos, getScrapeStatus, type ActivePromo } from "@/db/promos";
import { getReviewQueue, type QueueRow } from "@/db/promoReview";
import { getBonusBooks, getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys, getUserBookKeys } from "@/db/queries";
import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import { formatAmerican, formatUsd } from "@/lib/format";
import { getSportLabel } from "@/config/sports";
import { describePromo, formatBoostPercent, scopeGuessLabel } from "@/domain/promos/describe";
import { listCorrectionOptions } from "@/domain/promos/correctionOptions";
import {
  findUnprofitablePromos,
  rankPromoHedges,
  type PromoOpportunity,
  type UnprofitablePromo,
} from "@/domain/promos/rankPromoHedges";
import type { StakePrecision } from "@/domain/hedge/arbMath";
import type { OddsEvent } from "@/domain/odds/schemas";

const EMPTY_CORRECTION_OPTIONS: CorrectionOptions = { events: [], sportDays: [] };

/**
 * WR-07: promos at books the member has come first; promos at books they
 * don't have are kept (shown dimmed) but sorted after them. A stable
 * partition, so each group keeps its incoming (profit) order.
 */
function ownBooksFirst<T extends { hasPromoBook: boolean }>(rows: T[]): T[] {
  return [...rows.filter((row) => row.hasPromoBook), ...rows.filter((row) => !row.hasPromoBook)];
}

/**
 * Correct sub-panel dropdown data (T-03-09-06): built ONLY when the queue
 * actually has a match-kind item -- there's no correction UI to populate
 * otherwise, so skip the extra cache reads entirely on every other visit.
 * Reuses an already-fetched cache when the caller has one (the
 * activePromos-present branch below already fetched both caches for hedge
 * math); otherwise fetches them itself (the activePromos-empty branch never
 * would have otherwise).
 */
async function correctionOptionsFor(
  hasMatchItem: boolean,
  now: Date,
  cached?: { moneylineEvents: OddsEvent[]; extendedEvents: OddsEvent[] },
): Promise<CorrectionOptions> {
  if (!hasMatchItem) return EMPTY_CORRECTION_OPTIONS;

  const { moneylineEvents, extendedEvents } =
    cached ??
    (await (async () => {
      const [{ events: moneylineEvents }, { events: extendedEvents }] = await Promise.all([
        getCachedEvents(),
        getCachedExtendedEvents(),
      ]);
      return { moneylineEvents, extendedEvents };
    })());

  return listCorrectionOptions({ moneyline: moneylineEvents, extended: extendedEvents }, { now });
}

/**
 * Reads active promos (D-01, D-16, PROMO-04) and, when there's at least one
 * and cached odds exist, runs rankPromoHedges at the member's own hedge
 * books (D-05) to produce this tab's rows. requireUser() is the literal
 * first statement -- a logged-out call redirects before any DB read,
 * mirroring save-books.ts's "user id comes ONLY from the session"
 * discipline -- before PromosInputSchema.safeParse, before any of
 * getActivePromos/getScrapeStatus/getUserBookKeys/getHedgeBookKeys.
 */
export async function getPromos(input: unknown): Promise<GetPromosResponse> {
  const user = await requireUser();

  const parsed = PromosInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const { precision } = parsed.data;

  const targetBooks = COLORADO_BOOKS.filter((book) => SCRAPE_TARGET_BOOK_KEYS.includes(book.key)).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  const statusByBook = await getScrapeStatus(SCRAPE_TARGET_BOOK_KEYS);

  const scrapeStatus: ScrapeStatusLineDTO[] = targetBooks.map((book) => {
    const row = statusByBook.get(book.key) ?? { lastOkAt: null, lastStatus: null };
    return {
      bookKey: book.key,
      bookName: book.displayName,
      lastOkAt: row.lastOkAt ? row.lastOkAt.toISOString() : null,
      lastRunFailed: row.lastStatus === "failed",
    };
  });

  const hasAnyOkRun = scrapeStatus.some((line) => line.lastOkAt !== null);

  const now = new Date();
  const [activePromos, queueRows] = await Promise.all([getActivePromos(now), getReviewQueue(now)]);
  const queue = queueRows.map(toQueueItemDTO);
  const hasMatchItem = queueRows.some((row) => row.reviewReason === "match");

  if (activePromos.length === 0) {
    const emptyVariant: PromosEmptyVariant = hasAnyOkRun ? "no-active" : "none-scraped";
    const correctionOptions = await correctionOptionsFor(hasMatchItem, now);
    return { status: "ok", scrapeStatus, emptyVariant, rows: [], unprofitableRows: [], queue, correctionOptions };
  }

  const userBookSet = new Set(await getUserBookKeys(user.userId));

  const [hedgeBookKeys, bonusBooks, { events: moneylineEvents, fetchedAt: oddsFetchedAt }, { events: extendedEvents, fetchedAt: extendedOddsFetchedAt }] =
    await Promise.all([
      getHedgeBookKeys(userBookSet),
      getBonusBooks(),
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);

  const correctionOptions = await correctionOptionsFor(hasMatchItem, now, { moneylineEvents, extendedEvents });

  if (oddsFetchedAt === null && extendedOddsFetchedAt === null) {
    return { status: "ok", scrapeStatus, emptyVariant: "no-odds", rows: [], unprofitableRows: [], queue, correctionOptions };
  }

  const bookNames = new Map(bonusBooks.map((b) => [b.key, b.displayName]));
  const rankOpts = {
    moneylineEvents,
    extendedEvents,
    hedgeBookKeys: new Set(hedgeBookKeys),
    precision: precision as StakePrecision,
    now,
  };

  const opportunities = rankPromoHedges(activePromos, rankOpts);
  const unprofitable = findUnprofitablePromos(activePromos, rankOpts);
  const unprofitableRows = ownBooksFirst(
    unprofitable.map((entry) => toUnprofitablePromoRowDTO(entry, bookNames, userBookSet)),
  );

  if (opportunities.length === 0) {
    /**
     * D-05/D-18 analog to find-arbs.ts's booksExcludedAll: re-rank at every
     * usable book (not just the member's own) to tell "no rows anywhere"
     * (no-active) apart from "rows exist, but not at your books" (no-books).
     */
    const everyUsableBookKeys = await getHedgeBookKeys();
    const userHasEveryUsableBook = everyUsableBookKeys.every((key) => userBookSet.has(key));

    let emptyVariant: PromosEmptyVariant = "no-active";
    if (!userHasEveryUsableBook) {
      const everyUsableOpportunities = rankPromoHedges(activePromos, {
        ...rankOpts,
        hedgeBookKeys: new Set(everyUsableBookKeys),
      });
      if (everyUsableOpportunities.length > 0) {
        emptyVariant = "no-books";
      }
    }

    // quick-260927-edt: zero profitable rows still shows the greyed
    // unprofitable rows (instead of the "no-active" empty state) as long as
    // at least one is present -- "no-books" still wins over this.
    if (emptyVariant === "no-active" && unprofitableRows.length > 0) {
      return { status: "ok", scrapeStatus, emptyVariant: null, rows: [], unprofitableRows, queue, correctionOptions };
    }

    return { status: "ok", scrapeStatus, emptyVariant, rows: [], unprofitableRows: [], queue, correctionOptions };
  }

  const rows = ownBooksFirst(opportunities.map((opportunity) => toPromoRowDTO(opportunity, bookNames, userBookSet)));

  return { status: "ok", scrapeStatus, emptyVariant: null, rows, unprofitableRows, queue, correctionOptions };
}

/**
 * Maps one pending_review row to its queue-card DTO (03-UI-SPEC.md "Queue
 * item card"). kind mirrors review_reason: "match" rows only get a
 * bestGuessLabel (when a guess exists, D-10 -- presentational only, never
 * auto-activated); "caps" rows only get matchedLabel (the already-confirmed
 * scope) and capRecap (D-18 -- null fields render as "not found" in the UI).
 */
function toQueueItemDTO(row: QueueRow): QueueItemDTO {
  const bookName = COLORADO_BOOKS.find((b) => b.key === row.bookKey)?.displayName ?? row.bookKey;
  const promoTypeLabel: "Boost" | "Bonus bet" = row.promoType === "profit_boost" ? "Boost" : "Bonus bet";

  return {
    promoId: row.id,
    kind: row.reviewReason,
    bookName,
    promoTypeLabel,
    description: describePromo(row.parsed),
    bestGuessLabel:
      row.reviewReason === "match" && row.bestGuess ? `Best guess: ${scopeGuessLabel(row.bestGuess)}.` : null,
    matchedLabel: row.reviewReason === "caps" && row.scope ? scopeGuessLabel(row.scope) : null,
    capRecap:
      row.reviewReason === "caps"
        ? { maxStake: row.maxStake, maxWinnings: row.maxWinnings, minOdds: row.minOddsAmerican }
        : null,
    unparsedCapFields: row.unparsedCapFields,
  };
}

function capNoteFor(promo: ActivePromo, capBound: "max_stake" | "max_winnings", bookNames: Map<string, string>): string | null {
  const bookName = bookNames.get(promo.bookKey) ?? promo.bookKey;

  if (capBound === "max_stake" && promo.maxStake !== null) {
    return `Capped at ${bookName}'s ${formatUsd(promo.maxStake)} max stake — a smaller stake keeps guaranteed profit equal on both sides.`;
  }

  if (capBound === "max_winnings" && promo.winningsCap !== null) {
    return `Capped by ${bookName}'s ${formatUsd(promo.winningsCap.amount)} max winnings — a larger stake would add risk without adding profit.`;
  }

  return null;
}

function attributionLineFor(promo: ActivePromo): string | null {
  if (promo.attribution.length === 0) return null;
  return promo.attribution.map((a) => `${a.verb} ${a.displayName}`).join(" · ");
}

function toPromoRowDTO(
  opportunity: PromoOpportunity<ActivePromo>,
  bookNames: Map<string, string>,
  userBookSet: ReadonlySet<string>,
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
  };
}

/** "10% profit boost" / "Boosted to +150" / "$25.00 bonus bet" (03-UI-SPEC.md-style promo title). */
function unprofitablePromoTitle(promo: ActivePromo): string {
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

function toUnprofitablePromoRowDTO(
  entry: UnprofitablePromo<ActivePromo>,
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
    title: unprofitablePromoTitle(promo),
    scopeLabel: promo.scopeLabel,
    autoMatched: promo.autoMatched,
    bestGuaranteedProfit: bestGuaranteedProfit?.toFixed(2) ?? null,
    note: unprofitablePromoNote(bestGuaranteedProfit),
    hasPromoBook: userBookSet.has(promo.bookKey),
  };
}
