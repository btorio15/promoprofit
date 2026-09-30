import { and, eq, gt, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "./client";
import { promos, scrapeRuns, users } from "./schema";
import { ScrapedPromoSchema } from "@/domain/promos/scraped";
import {
  PROMO_MARKET_TYPES,
  PROMO_SIDES,
  PROMO_TYPES,
  WINNINGS_CAP_KINDS,
  type PromoMarketType,
  type PromoSelection,
  type PromoSide,
  type PromoType,
  type WinningsCapKind,
} from "@/domain/promos/types";
import type { PromoScope } from "@/domain/promos/scope";
import type { RankablePromo } from "@/domain/promos/rankPromoHedges";
import { getSportLabel } from "@/config/sports";
import { etDayLabel } from "@/domain/promos/etTime";

export interface ScrapeStatusRow {
  lastOkAt: Date | null;
  lastStatus: "ok" | "failed" | null;
}

/**
 * Per-book scrape freshness (D-08): for each of `bookKeys`, the most recent
 * OK run's ran_at and the latest run's own status (which may itself be a
 * failure even when an earlier run succeeded). Books with no scrape_runs
 * rows at all map to { lastOkAt: null, lastStatus: null } -- the
 * "never scraped" state getPromos turns into "not scraped yet".
 */
export async function getScrapeStatus(
  bookKeys: readonly string[],
): Promise<Map<string, ScrapeStatusRow>> {
  const result = new Map<string, ScrapeStatusRow>();
  for (const key of bookKeys) {
    result.set(key, { lastOkAt: null, lastStatus: null });
  }
  if (bookKeys.length === 0) return result;

  const db = getDb();
  const rows = await db
    .select({
      bookKey: scrapeRuns.bookKey,
      lastOkAt: sql<string | Date | null>`max(${scrapeRuns.ranAt}) filter (where ${scrapeRuns.status} = 'ok')`,
      lastStatus: sql<string | null>`(array_agg(${scrapeRuns.status} order by ${scrapeRuns.ranAt} desc))[1]`,
    })
    .from(scrapeRuns)
    .where(inArray(scrapeRuns.bookKey, [...bookKeys]))
    .groupBy(scrapeRuns.bookKey);

  for (const row of rows) {
    // neon-http returns raw sql`` aggregate values as strings, not Date
    // instances (mirrors src/db/queries.ts's getMaxFetchedAt normalization).
    const lastOkAt =
      row.lastOkAt === null ? null : row.lastOkAt instanceof Date ? row.lastOkAt : new Date(row.lastOkAt);
    const lastStatus = row.lastStatus === "ok" || row.lastStatus === "failed" ? row.lastStatus : null;
    result.set(row.bookKey, { lastOkAt, lastStatus });
  }

  return result;
}

/**
 * A promo whose scope is resolved and which reaches hedge math (D-01, D-16,
 * PROMO-04) -- the getPromos server action's rankPromoHedges input.
 * finePrintNote/claimHint/scopeLabel/autoMatched are presentational fields
 * the ranker itself never touches; attribution is empty for auto-matched
 * promos (no human to attribute, 03-UI-SPEC.md).
 */
export interface ActivePromo extends RankablePromo {
  finePrintNote: string | null;
  claimHint: string | null;
  scopeLabel: string;
  autoMatched: boolean;
  attribution: { verb: "Confirmed by" | "Corrected by" | "Cap entered by"; displayName: string }[];
  /** True when the viewer hand-added this promo (personal, D-01). */
  addedByYou: boolean;
}

const ET_DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ET_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

const ET_DAY_NUMBER_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  day: "numeric",
});

/**
 * "Any {sport} game · Sun, Sep 27" when the window sits inside a single ET
 * calendar day, or "Any {sport} game · Sep 25–27" when it spans more than
 * one (03-UI-SPEC.md "Promo row" Col 1, this plan's scopeLabel behavior).
 */
function sportWindowScopeLabel(sportKey: string, windowStart: Date, windowEnd: Date): string {
  const sportLabel = getSportLabel(sportKey);
  const startKey = ET_DAY_KEY_FORMATTER.format(windowStart);
  const endKey = ET_DAY_KEY_FORMATTER.format(windowEnd);

  if (startKey === endKey) {
    return `Any ${sportLabel} game · ${etDayLabel(windowStart.toISOString())}`;
  }

  return `Any ${sportLabel} game · ${ET_MONTH_DAY_FORMATTER.format(windowStart)}–${ET_DAY_NUMBER_FORMATTER.format(windowEnd)}`;
}

interface ActivePromoRow {
  id: number;
  bookKey: string;
  promoType: string;
  scopeKind: string | null;
  eventId: string | null;
  sportKey: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  marketType: string | null;
  line: number | null;
  side: string | null;
  parsed: unknown;
  boostPercent: string | null;
  boostedOddsAmerican: number | null;
  baseOddsAmerican: number | null;
  bonusAmount: string | null;
  maxStake: string | null;
  maxWinnings: string | null;
  maxWinningsKind: string | null;
  minOddsAmerican: number | null;
  finePrintNote: string | null;
  autoMatched: boolean;
  addedByUserId: number | null;
  confirmedByName: string | null;
  correctedByName: string | null;
  capEnteredByName: string | null;
}

/**
 * Validates and shapes one promos row into an ActivePromo, or drops it with
 * a console.warn when its stored data is inconsistent with the schemas that
 * govern it (T-03-15-01) -- this must never throw into the caller, since a
 * single malformed row must not take down the whole Promos tab.
 */
export function mapActivePromoRow(row: ActivePromoRow, viewerUserId?: number): ActivePromo | null {
  if (!(PROMO_TYPES as readonly string[]).includes(row.promoType)) {
    console.warn(`getActivePromos: dropping promo ${row.id}, unknown promo_type=${row.promoType}`);
    return null;
  }
  const promoType = row.promoType as PromoType;

  let scope: PromoScope;
  let scopeLabel: string;

  if (row.scopeKind === "event") {
    if (!row.eventId || !row.sportKey || !row.homeTeam || !row.awayTeam) {
      console.warn(`getActivePromos: dropping promo ${row.id}, incomplete event scope`);
      return null;
    }
    scope = { kind: "event", eventId: row.eventId, sportKey: row.sportKey };
    scopeLabel = `${row.awayTeam} @ ${row.homeTeam}`;
  } else if (row.scopeKind === "sport_window") {
    if (!row.sportKey || !row.windowStart || !row.windowEnd) {
      console.warn(`getActivePromos: dropping promo ${row.id}, incomplete sport_window scope`);
      return null;
    }
    scope = { kind: "sport_window", sportKey: row.sportKey, windowStart: row.windowStart, windowEnd: row.windowEnd };
    scopeLabel = sportWindowScopeLabel(row.sportKey, row.windowStart, row.windowEnd);
  } else if (row.scopeKind === "any") {
    scope = { kind: "any" };
    scopeLabel = "Any game";
  } else {
    console.warn(`getActivePromos: dropping promo ${row.id}, unknown scope_kind=${row.scopeKind}`);
    return null;
  }

  let pinned: PromoSelection | null = null;
  if (row.marketType !== null || row.side !== null || row.line !== null) {
    if (row.marketType === null || row.side === null || scope.kind !== "event") {
      console.warn(`getActivePromos: dropping promo ${row.id}, incomplete pinned selection`);
      return null;
    }
    if (!(PROMO_MARKET_TYPES as readonly string[]).includes(row.marketType)) {
      console.warn(`getActivePromos: dropping promo ${row.id}, unknown market_type=${row.marketType}`);
      return null;
    }
    if (!(PROMO_SIDES as readonly string[]).includes(row.side)) {
      console.warn(`getActivePromos: dropping promo ${row.id}, unknown side=${row.side}`);
      return null;
    }
    pinned = {
      eventId: scope.eventId,
      marketType: row.marketType as PromoMarketType,
      line: row.line,
      side: row.side as PromoSide,
    };
  }

  const parsedResult = ScrapedPromoSchema.safeParse(row.parsed);
  if (!parsedResult.success) {
    console.warn(`getActivePromos: dropping promo ${row.id}, invalid parsed payload`);
    return null;
  }
  const { eligibleMarketTypes, claimRequired } = parsedResult.data;

  let winningsCap: { kind: WinningsCapKind; amount: string } | null = null;
  if (row.maxWinnings !== null) {
    if (row.maxWinningsKind === null || !(WINNINGS_CAP_KINDS as readonly string[]).includes(row.maxWinningsKind)) {
      console.warn(`getActivePromos: dropping promo ${row.id}, max_winnings set without a valid kind`);
      return null;
    }
    winningsCap = { kind: row.maxWinningsKind as WinningsCapKind, amount: row.maxWinnings };
  }

  const attribution: ActivePromo["attribution"] = [];
  if (row.confirmedByName) attribution.push({ verb: "Confirmed by", displayName: row.confirmedByName });
  if (row.correctedByName) attribution.push({ verb: "Corrected by", displayName: row.correctedByName });
  if (row.capEnteredByName) attribution.push({ verb: "Cap entered by", displayName: row.capEnteredByName });

  return {
    id: row.id,
    bookKey: row.bookKey,
    promoType,
    scope,
    pinned,
    eligibleMarketTypes,
    boostPercent: row.boostPercent,
    boostedOddsAmerican: row.boostedOddsAmerican,
    baseOddsAmerican: row.baseOddsAmerican,
    bonusAmount: row.bonusAmount,
    maxStake: row.maxStake,
    winningsCap,
    minOddsAmerican: row.minOddsAmerican,
    finePrintNote: row.finePrintNote,
    claimHint: claimRequired !== null ? "Opt in / claim in the app first" : null,
    scopeLabel,
    autoMatched: row.autoMatched,
    attribution,
    addedByYou: viewerUserId !== undefined && row.addedByUserId === viewerUserId,
  };
}

/**
 * The single visibility rule for personal promos (D-01, T-5-visibility).
 * Secure by default: no viewer means scraped/group promos only.
 */
export function promoVisibilityCondition(viewerUserId?: number): SQL {
  if (viewerUserId === undefined) return isNull(promos.addedByUserId);
  return or(isNull(promos.addedByUserId), eq(promos.addedByUserId, viewerUserId)) as SQL;
}

/** WHERE clause for every promo currently hedgeable and visible to the viewer. */
export function activePromoWhere(now: Date, viewerUserId?: number): SQL {
  return and(
    eq(promos.status, "active"),
    sql`${promos.scopeKind} is not null`,
    or(isNull(promos.expiresAt), gt(promos.expiresAt, now)),
    or(
      and(eq(promos.scopeKind, "event"), sql`${promos.eventId} is not null`, gt(promos.eventCommenceTime, now)),
      and(eq(promos.scopeKind, "sport_window"), gt(promos.windowEnd, now)),
      and(eq(promos.scopeKind, "any"), sql`${promos.expiresAt} is not null`, gt(promos.expiresAt, now)),
    ),
    promoVisibilityCondition(viewerUserId),
  ) as SQL;
}

/**
 * Every promo currently hedgeable (D-01, D-16, PROMO-04): status='active',
 * a resolved scope, and not past its own expiry, its matched event's
 * commence_time (event scope) or its window's end (sport_window scope,
 * D-16). pending_review promos never reach this query -- they have no
 * resolved scope_kind until a reviewer or the auto-matcher sets one.
 */
export async function getActivePromos(now: Date, viewerUserId?: number): Promise<ActivePromo[]> {
  const confirmedByUsers = alias(users, "confirmed_by_users");
  const correctedByUsers = alias(users, "corrected_by_users");
  const capEnteredByUsers = alias(users, "cap_entered_by_users");

  const db = getDb();
  const rows = await db
    .select({
      id: promos.id,
      bookKey: promos.bookKey,
      promoType: promos.promoType,
      scopeKind: promos.scopeKind,
      eventId: promos.eventId,
      sportKey: promos.sportKey,
      homeTeam: promos.homeTeam,
      awayTeam: promos.awayTeam,
      windowStart: promos.windowStart,
      windowEnd: promos.windowEnd,
      marketType: promos.marketType,
      line: promos.line,
      side: promos.side,
      parsed: promos.parsed,
      boostPercent: promos.boostPercent,
      boostedOddsAmerican: promos.boostedOddsAmerican,
      baseOddsAmerican: promos.baseOddsAmerican,
      bonusAmount: promos.bonusAmount,
      maxStake: promos.maxStake,
      maxWinnings: promos.maxWinnings,
      maxWinningsKind: promos.maxWinningsKind,
      minOddsAmerican: promos.minOddsAmerican,
      finePrintNote: promos.finePrintNote,
      autoMatched: promos.autoMatched,
      addedByUserId: promos.addedByUserId,
      confirmedByName: confirmedByUsers.displayName,
      correctedByName: correctedByUsers.displayName,
      capEnteredByName: capEnteredByUsers.displayName,
    })
    .from(promos)
    .leftJoin(confirmedByUsers, eq(promos.confirmedByUserId, confirmedByUsers.id))
    .leftJoin(correctedByUsers, eq(promos.correctedByUserId, correctedByUsers.id))
    .leftJoin(capEnteredByUsers, eq(promos.capEnteredByUserId, capEnteredByUsers.id))
    .where(activePromoWhere(now, viewerUserId));

  const activePromos: ActivePromo[] = [];
  for (const row of rows) {
    const mapped = mapActivePromoRow(row, viewerUserId);
    if (mapped) activePromos.push(mapped);
  }
  return activePromos;
}
