import Decimal from "decimal.js";
import { z } from "zod";
import {
  ScrapedPromoFieldsSchema,
  type ScrapedPromo,
  type SkipReason,
  type SkippedEntry,
} from "@/domain/promos/scraped";
import { SPORT_KEYS } from "@/config/sports";
import { PROMO_MARKET_TYPES, type PromoType } from "@/domain/promos/types";
import { classifyExclusion } from "./exclusions";

/**
 * quick-260928-it1: decides which parser skips are worth surfacing to a
 * member as a "classify" review item, and builds the draft ScrapedPromo a
 * member completes. Lives in src/ingestion/promos/ (not src/domain/promos/)
 * because it depends on classifyExclusion, an ingestion-only module
 * (boundary test).
 *
 * Skips fall into three buckets: REVIEW_SKIP_REASONS always escalate
 * (unrecognized/unsupported_sport/schema_invalid -- these signal either a
 * new promo shape or a previously-unsupported sport, never a legitimate
 * exclusion). CLEAR_SKIP_REASONS never escalate (new_customer, deposit,
 * parlay, sgp, futures, outright, prop, live_only, not_half_point -- the
 * shared classifier already positively identified what these are, and it
 * is not a hedgeable promo). not_a_promo is the one ambiguous bucket: it
 * covers both genuine non-promo marketing copy (giveaways, refer-a-friend,
 * casino rewards) AND -- per each book's own title-level keyword gate --
 * anything that mentions "boost"/"bonus" without a concrete numeric offer.
 * A fixture sweep (planner finding 5) found that every not_a_promo in
 * today's real fixtures is one of: (a) a classifyExclusion hit (pick'em,
 * giveaway, refer-a-friend, ...), which is unambiguously not a promo, or
 * (b) marketing copy with no concrete offer (e.g. "Bally's Profit Boost" --
 * a generic info page, not a specific N% or $N offer). Zero real
 * not_a_promo entries name a concrete numeric offer while also passing
 * classifyExclusion -- so escalating exactly that combination (a concrete
 * offer AND no exclusion hit) catches a real missed promo without flooding
 * the queue with generic marketing copy.
 */

export const CLEAR_SKIP_REASONS: ReadonlySet<SkipReason> = new Set([
  "new_customer",
  "deposit",
  "parlay",
  "sgp",
  "futures",
  "outright",
  "prop",
  "live_only",
  "not_half_point",
]);

export const REVIEW_SKIP_REASONS: ReadonlySet<SkipReason> = new Set([
  "unrecognized",
  "unsupported_sport",
  "schema_invalid",
]);

/** "40% Profit Boost" / "40% boost" -- a percent number directly followed by "[profit|odds ]boost". */
const PERCENT_NEXT_TO_BOOST_RE = /(\d+(?:\.\d+)?)\s*%\s*(?:profit\s+|odds\s+)?boost\b/i;
/** "Profit Boost: 40%" / "Odds Boost 40%" -- the label followed by a percent number. */
const BOOST_LABEL_PERCENT_RE = /\b(?:profit|odds)\s+boost[:]?\s*(\d+(?:\.\d+)?)\s*%/i;
/** "$50 bonus bet(s)" / "$1,000 in Bonus Bets". */
const DOLLAR_BONUS_BET_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:in\s+)?bonus\s+bets?\b/i;
/** "boosted odds" / "boosted price", or an American-odds pair like "+150 -> +200" / "+150 to +200". */
const BOOSTED_PRICE_RE = /\bboosted\s+(?:odds|price)\b|[+-]\d{2,4}\s*(?:->|→|to)\s*[+-]\d{2,4}/i;

function hasConcreteOffer(combined: string): boolean {
  return (
    PERCENT_NEXT_TO_BOOST_RE.test(combined) ||
    BOOST_LABEL_PERCENT_RE.test(combined) ||
    DOLLAR_BONUS_BET_RE.test(combined) ||
    BOOSTED_PRICE_RE.test(combined)
  );
}

/**
 * true for any REVIEW_SKIP_REASONS; false for CLEAR_SKIP_REASONS; for
 * not_a_promo, true only when classifyExclusion (re-run over the skip's own
 * title/rawText) finds nothing AND a concrete-offer regex matches.
 */
export function isReviewWorthySkip(skip: SkippedEntry): boolean {
  if (REVIEW_SKIP_REASONS.has(skip.reason)) return true;
  if (CLEAR_SKIP_REASONS.has(skip.reason)) return false;

  // skip.reason === "not_a_promo"
  const rawText = skip.evidence?.rawText ?? "";
  if (classifyExclusion({ title: skip.title, text: rawText }) !== null) return false;

  const combined = `${skip.title}\n${rawText}`;
  return hasConcreteOffer(combined);
}

function extractBoostPercent(combined: string): string | null {
  const nextTo = PERCENT_NEXT_TO_BOOST_RE.exec(combined);
  if (nextTo) return new Decimal(nextTo[1]).toFixed(2);
  const label = BOOST_LABEL_PERCENT_RE.exec(combined);
  if (label) return new Decimal(label[1]).toFixed(2);
  return null;
}

function extractBonusAmount(combined: string): string | null {
  const match = DOLLAR_BONUS_BET_RE.exec(combined);
  if (!match) return null;
  return new Decimal(match[1].replace(/,/g, "")).toFixed(2);
}

/** Validates one field of `partial` against its own ScrapedPromoFieldsSchema shape entry; null on failure or absence. */
function validatedField<K extends keyof ScrapedPromo>(
  partial: Partial<ScrapedPromo> | null,
  key: K,
): ScrapedPromo[K] | null {
  if (!partial || !(key in partial)) return null;
  const shape = ScrapedPromoFieldsSchema.shape as Record<string, z.ZodTypeAny>;
  const fieldSchema = shape[key as string];
  if (!fieldSchema) return null;
  const result = fieldSchema.safeParse(partial[key]);
  return result.success ? (result.data as ScrapedPromo[K]) : null;
}

/** sportKeyHint's field schema is a bare nullable string (the SPORT_KEYS check is only in ScrapedPromoSchema's cross-field superRefine, not the lenient fields schema) -- validated separately here so an out-of-range hint (e.g. a since-removed sport, or a typo) still drops to null. */
function validatedSportKeyHint(partial: Partial<ScrapedPromo> | null): string | null {
  const value = validatedField(partial, "sportKeyHint");
  return value !== null && SPORT_KEYS.includes(value) ? value : null;
}

function validatedTeamsText(partial: Partial<ScrapedPromo> | null): string[] {
  const value = validatedField(partial, "teamsText");
  if (!Array.isArray(value)) return [];
  return value.length === 0 || value.length === 2 ? value : [];
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/**
 * Builds a ScrapedPromo draft from an uncertain skip (unrecognized/
 * unsupported_sport/schema_invalid, or a concrete-offer not_a_promo), for a
 * member to complete into a real profit_boost/bonus_bet promo
 * (classify-promo.ts). Always passes the lenient ScrapedPromoFieldsSchema --
 * never the full cross-field ScrapedPromoSchema, since a classify draft is
 * deliberately incomplete (no boost %/bonus amount/scope may be known yet).
 * Every partial field is validated independently: an invalid or missing
 * value silently drops to null/the field's default, it never fails the
 * whole draft.
 */
export function buildClassifyDraft(
  bookKey: string,
  skip: SkippedEntry,
  fallbackSourceUrl: string,
): ScrapedPromo {
  const evidence = skip.evidence ?? null;
  const partial = evidence?.partial ?? null;
  const rawText = truncate(evidence?.rawText ?? "", 2000);
  const title = truncate(skip.title, 200);
  const combined = `${title}\n${rawText}`;

  const partialPromoType = validatedField(partial, "promoType");
  const partialBoostPercent = validatedField(partial, "boostPercent");
  const partialBonusAmount = validatedField(partial, "bonusAmount");

  const boostPercent = partialBoostPercent ?? extractBoostPercent(combined);
  const bonusAmountFromText = extractBonusAmount(combined);

  let promoType: PromoType;
  if (partialPromoType) {
    promoType = partialPromoType;
  } else if (boostPercent !== null) {
    promoType = "profit_boost";
  } else if (bonusAmountFromText !== null) {
    promoType = "bonus_bet";
  } else {
    promoType = "profit_boost";
  }

  const bonusAmount = partialBonusAmount ?? (promoType === "bonus_bet" ? bonusAmountFromText : null);

  const draft: ScrapedPromo = {
    bookKey,
    externalId: skip.externalId,
    promoType,
    title,
    rawText,
    sourceUrl: evidence?.sourceUrl ?? fallbackSourceUrl,
    sportKeyHint: validatedSportKeyHint(partial),
    scopeText: validatedField(partial, "scopeText") ?? title,
    teamsText: validatedTeamsText(partial),
    windowStart: validatedField(partial, "windowStart"),
    windowEnd: validatedField(partial, "windowEnd"),
    expiresAt: evidence?.expiresAt ?? null,
    eligibleMarketTypes: [...PROMO_MARKET_TYPES],
    pinned: null,
    boostPercent: promoType === "profit_boost" ? boostPercent : null,
    boostedOddsAmerican: null,
    baseOddsAmerican: validatedField(partial, "baseOddsAmerican"),
    bonusAmount,
    maxStake: validatedField(partial, "maxStake"),
    maxWinnings: validatedField(partial, "maxWinnings"),
    winningsCapKind: validatedField(partial, "winningsCapKind"),
    minOddsAmerican: validatedField(partial, "minOddsAmerican"),
    unparsedCapFields: [],
    claimRequired: validatedField(partial, "claimRequired"),
    finePrintNote: validatedField(partial, "finePrintNote"),
  };

  return draft;
}
