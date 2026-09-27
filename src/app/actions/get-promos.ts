"use server";

import { requireUser } from "@/lib/session";
import { COLORADO_BOOKS } from "@/config/books";
import { SCRAPE_TARGET_BOOK_KEYS } from "@/config/scrapeTargets";
import { PromosInputSchema } from "@/domain/promos/promosInput";
import type { GetPromosResponse, PromoRowDTO, PromosEmptyVariant, ScrapeStatusLineDTO } from "@/domain/promos/dto";
import { getActivePromos, getScrapeStatus, type ActivePromo } from "@/db/promos";
import { getBonusBooks, getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys, getUserBookKeys } from "@/db/queries";
import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import { formatUsd } from "@/lib/format";
import { getSportLabel } from "@/config/sports";
import { rankPromoHedges, type PromoOpportunity } from "@/domain/promos/rankPromoHedges";
import type { StakePrecision } from "@/domain/hedge/arbMath";

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
  const activePromos = await getActivePromos(now);

  if (activePromos.length === 0) {
    const emptyVariant: PromosEmptyVariant = hasAnyOkRun ? "no-active" : "none-scraped";
    return { status: "ok", scrapeStatus, emptyVariant, rows: [] };
  }

  const userBookSet = new Set(await getUserBookKeys(user.userId));

  const [hedgeBookKeys, bonusBooks, { events: moneylineEvents, fetchedAt: oddsFetchedAt }, { events: extendedEvents, fetchedAt: extendedOddsFetchedAt }] =
    await Promise.all([
      getHedgeBookKeys(userBookSet),
      getBonusBooks(),
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);

  if (oddsFetchedAt === null && extendedOddsFetchedAt === null) {
    return { status: "ok", scrapeStatus, emptyVariant: "no-odds", rows: [] };
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

    return { status: "ok", scrapeStatus, emptyVariant, rows: [] };
  }

  const rows = opportunities.map((opportunity) => toPromoRowDTO(opportunity, bookNames));

  return { status: "ok", scrapeStatus, emptyVariant: null, rows };
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

function toPromoRowDTO(opportunity: PromoOpportunity<ActivePromo>, bookNames: Map<string, string>): PromoRowDTO {
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
  };
}
