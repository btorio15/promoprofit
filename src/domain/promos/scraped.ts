import { z } from "zod";
import { SPORT_KEYS } from "@/config/sports";
import { isHalfPoint } from "@/domain/hedge/spreadsTotalsFilter";
import {
  CAP_FIELDS,
  PROMO_MARKET_TYPES,
  PROMO_TYPES,
  WINNINGS_CAP_KINDS,
  type CapField,
  type PromoMarketType,
  type PromoType,
  type WinningsCapKind,
} from "./types";

/**
 * Scope-based ScrapedPromo contract (PROMO-03/PROMO-04). This replaces the
 * earlier single-market design because recon (03-RECON.md Design
 * Implication 1) showed real promos are game-wide or sport+date-wide, not
 * tied to one pre-specified market -- the app chooses the market/side
 * itself (Plan 04). Every scraped candidate is validated against
 * ScrapedPromoSchema before it can become a promos row.
 *
 * Recon's D-09 decision is `render: "http"` for all three target books
 * (Bally Bet, DraftKings, FanDuel) -- plain fetch against a JSON API, no
 * browser rendering, no stealth. This contract intentionally has no
 * browser-mode field and no cookie/credential field (T-03-05-04): the app
 * never logs in.
 */

export const SKIP_REASONS = [
  "parlay",
  "sgp",
  "live_only",
  "futures",
  "outright",
  "prop",
  "new_customer",
  "deposit",
  "not_a_promo",
  "unsupported_sport",
  "not_half_point",
  "unrecognized",
  "schema_invalid",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface ScrapedPromo {
  bookKey: string;
  /** Book's own id: Bally promotionIdentifier, DK promotionId, FD promoCode. */
  externalId: string | null;
  promoType: PromoType;
  title: string;
  rawText: string;
  sourceUrl: string;
  /** In SPORT_KEYS or null (unsupported sports are skipped, never stored). */
  sportKeyHint: string | null;
  /** As shown: "LA Rams vs. DEN Broncos" / "all NFL games on 9/27/2026". */
  scopeText: string;
  /** [] = sport-wide; exactly 2 = one named game (order as shown, home/away unknown). */
  teamsText: string[];
  /** ISO; the event-start window the promo covers. */
  windowStart: string | null;
  windowEnd: string | null;
  /** ISO; stated promo expiry. */
  expiresAt: string | null;
  /** Non-empty; "any wager" = all three. */
  eligibleMarketTypes: PromoMarketType[];
  /** Only set when the book names one market/side. */
  pinned: { selectionText: string; marketType: PromoMarketType; line: number | null } | null;
  /** "50.00" = +50% on profit. */
  boostPercent: string | null;
  /** Published prices, pinned promos only. */
  boostedOddsAmerican: number | null;
  baseOddsAmerican: number | null;
  bonusAmount: string | null;
  maxStake: string | null;
  maxWinnings: { amount: string; kind: WinningsCapKind } | null;
  minOddsAmerican: number | null;
  /** D-18. */
  unparsedCapFields: CapField[];
  /** Design Implication 4. */
  claimRequired: "opt_in" | "claim_token" | null;
  /** <= 160 chars. */
  finePrintNote: string | null;
}

export interface SkippedEntry {
  reason: SkipReason;
  externalId: string | null;
  title: string;
}

export interface ParseResult {
  found: number;
  candidates: ScrapedPromo[];
  skipped: SkippedEntry[];
}

export interface HttpRequestSpec {
  method: "GET" | "POST";
  url: string;
  headers: Readonly<Record<string, string>>;
  body: string | null;
}

export interface DetailPlan {
  entryKey: string;
  request: HttpRequestSpec;
}

export interface BookScraper {
  bookKey: string;
  render: "http";
  stealth: false;
  sourceFormat: "json";
  /** <= 6 (polite cadence, Design Implication 7). */
  maxDetailRequests: number;
  listRequest: HttpRequestSpec;
  /** Pure; only entries that survive the title-level exclusion filter; length <= maxDetailRequests. */
  planDetails(listBody: string): DetailPlan[];
  parse(
    input: { listBody: string; detailBodies: Readonly<Record<string, string>> },
    ctx: { now: Date; sourceUrl: string },
  ): ParseResult;
}

const MONEY_STRING_RE = /^\d{1,6}\.\d{2}$/;

const MoneyStringSchema = z.string().regex(MONEY_STRING_RE, "must be a 2dp decimal string");

const AmericanOddsSchema = z
  .number()
  .int()
  .refine((v) => Math.abs(v) >= 100, {
    message: "American odds must have |value| >= 100",
  });

const IsoDateTimeSchema = z.iso.datetime({ offset: true });

const PinnedSchema = z.strictObject({
  selectionText: z.string().min(1),
  marketType: z.enum(PROMO_MARKET_TYPES),
  line: z.number().nullable(),
});

const MaxWinningsSchema = z.strictObject({
  amount: MoneyStringSchema,
  kind: z.enum(WINNINGS_CAP_KINDS),
});

export const ScrapedPromoSchema = z
  .strictObject({
    bookKey: z.string().min(1),
    externalId: z.string().max(200).nullable(),
    promoType: z.enum(PROMO_TYPES),
    title: z.string().min(1).max(200),
    rawText: z.string().max(2000),
    sourceUrl: z.string().min(1),
    sportKeyHint: z.string().nullable(),
    scopeText: z.string().max(200),
    teamsText: z.array(z.string().min(1)),
    windowStart: IsoDateTimeSchema.nullable(),
    windowEnd: IsoDateTimeSchema.nullable(),
    expiresAt: IsoDateTimeSchema.nullable(),
    eligibleMarketTypes: z.array(z.enum(PROMO_MARKET_TYPES)).min(1),
    pinned: PinnedSchema.nullable(),
    boostPercent: MoneyStringSchema.nullable(),
    boostedOddsAmerican: AmericanOddsSchema.nullable(),
    baseOddsAmerican: AmericanOddsSchema.nullable(),
    bonusAmount: MoneyStringSchema.nullable(),
    maxStake: MoneyStringSchema.nullable(),
    maxWinnings: MaxWinningsSchema.nullable(),
    minOddsAmerican: AmericanOddsSchema.nullable(),
    unparsedCapFields: z.array(z.enum(CAP_FIELDS)),
    claimRequired: z.enum(["opt_in", "claim_token"]).nullable(),
    finePrintNote: z.string().max(160).nullable(),
  })
  .superRefine((promo, ctx) => {
    if (promo.teamsText.length !== 0 && promo.teamsText.length !== 2) {
      ctx.addIssue({
        code: "custom",
        path: ["teamsText"],
        message: "teamsText must be empty (sport-wide) or exactly 2 (one named game)",
      });
    }

    if (new Set(promo.eligibleMarketTypes).size !== promo.eligibleMarketTypes.length) {
      ctx.addIssue({
        code: "custom",
        path: ["eligibleMarketTypes"],
        message: "eligibleMarketTypes must not contain duplicates",
      });
    }

    if (
      promo.promoType === "profit_boost" &&
      promo.boostPercent === null &&
      promo.boostedOddsAmerican === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["boostPercent"],
        message: "a profit_boost needs boostPercent or boostedOddsAmerican",
      });
    }

    if (promo.promoType === "bonus_bet" && promo.bonusAmount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["bonusAmount"],
        message: "a bonus_bet needs bonusAmount",
      });
    }

    // D-03: a published price belongs to one selection -- it can only be
    // set when the book names that selection (pinned).
    if (promo.boostedOddsAmerican !== null && promo.pinned === null) {
      ctx.addIssue({
        code: "custom",
        path: ["boostedOddsAmerican"],
        message: "boostedOddsAmerican requires a pinned selection",
      });
    }

    if (promo.pinned !== null) {
      const { marketType, line } = promo.pinned;
      if (marketType === "moneyline") {
        if (line !== null) {
          ctx.addIssue({
            code: "custom",
            path: ["pinned", "line"],
            message: "a pinned moneyline must have a null line",
          });
        }
      } else {
        if (line === null || !isHalfPoint(line)) {
          ctx.addIssue({
            code: "custom",
            path: ["pinned", "line"],
            message: "a pinned spread/total must have a half-point line",
          });
        }
      }
    }

    if (promo.sportKeyHint !== null && !SPORT_KEYS.includes(promo.sportKeyHint)) {
      ctx.addIssue({
        code: "custom",
        path: ["sportKeyHint"],
        message: "sportKeyHint must be in SPORT_KEYS or null",
      });
    }

    if (
      promo.windowStart !== null &&
      promo.windowEnd !== null &&
      new Date(promo.windowStart).getTime() >= new Date(promo.windowEnd).getTime()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["windowStart"],
        message: "windowStart must be before windowEnd",
      });
    }
  }) as unknown as z.ZodType<ScrapedPromo>;
