import { z } from "zod";
import Decimal from "decimal.js";
import {
  ScrapedPromoSchema,
  type BookScraper,
  type DetailPlan,
  type ParseResult,
  type ScrapedPromo,
  type SkipReason,
  type SkippedEntry,
} from "@/domain/promos/scraped";
import { PROMO_MARKET_TYPES, type WinningsCapKind } from "@/domain/promos/types";
import { slateWindow } from "@/domain/promos/etTime";
import { parseMaxStake, parseMaxWinnings, parseMinOdds, extractFinePrintNote } from "@/ingestion/promos/finePrint";
import { classifyExclusion } from "@/ingestion/promos/exclusions";
import { sportFromText } from "@/ingestion/promos/sportHints";

/** This book's winnings-cap semantics (per-book recon, 03-RECON.md) -- known independently of whether a cap amount parses (WR-01). */
const WINNINGS_CAP_KIND: WinningsCapKind = "boost_extra";

/**
 * DraftKings parser (03-RECON.md "### DraftKings (`draftkings`)"). One POST
 * to the promotions-query endpoint returns full fine print inline for every
 * promo -- there is no detail endpoint for this book, unlike Bally Bet or
 * FanDuel (maxDetailRequests is always 0, planDetails always returns []).
 *
 * D-09: the owner's Task 2 pass confirmed this specific JSON endpoint needs
 * no Akamai sensor token to return real data -- RESEARCH.md's Akamai
 * finding was for the JS-rendered `/promos` HTML page, a different URL
 * entirely. This scraper never sends or forges an Akamai sensor token, or
 * any stored-session value at all: it is a plain, logged-out POST with
 * only the Contract's headers and body above. Never add a session/bearer
 * header here, and never guess at an Akamai anti-bot value -- doing so
 * would be indistinguishable from credential/session forgery this
 * project's D-09 decision explicitly rules out.
 *
 * D-15: exclusion classification order is classifyExclusion first (it owns
 * the new-customer/deposit/live-only/title-level-SGP-or-Parlay/futures/
 * outright/prop/bet-type-restriction rules), then this file's own
 * "does this even name a profit boost, odds boost or bonus bet" gate for
 * everything classifyExclusion lets through (DraftKings' feed carries many
 * non-promo rows -- casino, sweepstakes, racing, refer-a-friend, offer-card
 * marketing, Discord, DK Horse -- that no keyword in the shared exclusion
 * regexes is written to catch, because they are not excluded promo types,
 * they are not promos at all), then sport support last. This order matters:
 * checking classifyExclusion first is what correctly buckets the
 * "New Customers: Deposit Bonus" entry as `new_customer` (matches the
 * text-level "New Customers" wording) rather than falling through to this
 * file's not-a-promo gate.
 */

const LIST_URL = "https://api.draftkings.com/en/api/promotions/v3/promotions/query";

const LIST_BODY = JSON.stringify({
  productName: "Sportsbook",
  filterByProduct: false,
  zones: { zoneName: "UniversalPromoPage" },
  siteExperience: "US-CO-SB",
});

const LIST_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "application/json",
  accept: "application/json",
  referer: "https://sportsbook.draftkings.com/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

const InlineDetailsSchema = z.looseObject({
  promotionSubHeadline: z.string().optional(),
});

const MerchandisingDataSchema = z.looseObject({
  promotionHeadline: z.string().optional(),
  promotionDescription: z.string().optional(),
  terms: z.string().optional(),
  loggedOutTerms: z.string().optional(),
  additionalDetail: z.string().optional(),
  inlineDetails: InlineDetailsSchema.optional(),
});

const PromotionEntrySchema = z.looseObject({
  promotionId: z.union([z.number(), z.string()]),
  startDate: z.string().optional(),
  expirationDate: z.string().optional(),
  category: z.string().nullable().optional(),
  isOptInPromotion: z.boolean().optional(),
  merchandisingData: MerchandisingDataSchema,
});

const ZoneSchema = z.looseObject({
  promotions: z.array(PromotionEntrySchema),
});

const DraftKingsResponseSchema = z.looseObject({
  zones: z.array(ZoneSchema),
});

type PromotionEntry = z.infer<typeof PromotionEntrySchema>;

/** "profit boost", "odds boost" or "bonus bet(s)" -- the minimum a
 * DraftKings promo must say to be considered a promo at all (before any
 * exclusion classification). Rows with none of these (casino rewards,
 * sweepstakes, racing "bet and get" cash, refer-a-friend, offer-card
 * marketing, Discord, DK Horse, generic deposit-match copy) are
 * `not_a_promo`, independent of whatever else their category/title says. */
const MENTIONS_BOOST_OR_BONUS_RE = /\b(?:profit\s+boost|odds\s+boost|bonus\s+bets?)\b/i;

const BOOST_PERCENT_RE = /profit\s+boost:\s*(\d+(?:\.\d+)?)%/i;

/** "for all NFL games on 9/27/2026" / "for all College Football games on
 * 9/26/2026" (03-RECON.md Scraper Contract scope row). Non-greedy sport
 * word group so it stops at " games on ", not at the next occurrence. */
const SCOPE_RE = /for all ([A-Za-z][A-Za-z\s]*?) games on (\d{1,2}\/\d{1,2}\/\d{4})/i;

const OPT_IN_TEXT_RE = /\bopt-in\b/i;

/** Every DK promo's `terms` field is the short, informative numbered list
 * (opt-in, boost %, eligible bet types, min odds, max stake, expiry)
 * followed by several thousand characters of generic legal boilerplate
 * ("Thank you for choosing to participate in this promotion...", eligible
 * jurisdictions, responsible-gaming numbers, etc.) that is IDENTICAL in
 * substance across nearly every promo, boost or not. That boilerplate
 * contains incidental word matches that collide with the shared D-15
 * classifier's regexes on real fixture data -- e.g. "...or any bonuses,
 * the refer-a-friend program..." and "Profit Boost Tokens are single-use
 * and have no cash value" (the word "single" there refers to the token,
 * not the Single bet type). Truncating at the boilerplate's own marker
 * keeps only the numbered list classifyExclusion/sportFromText/finePrint
 * actually need to read, without patching the shared classifier's regexes
 * for every new boilerplate collision found. */
const TERMS_BOILERPLATE_RE = /\n+\s*thank you for choosing to participate/i;

function stripTermsBoilerplate(terms: string): string {
  const match = TERMS_BOILERPLATE_RE.exec(terms);
  return match ? terms.slice(0, match.index) : terms;
}

/** DK machine timestamps carry 7 fractional digits
 * ("2026-09-28T03:00:00.0000000Z"), one more digit than `Date` reliably
 * parses. Trim to milliseconds via regex BEFORE constructing a `Date` --
 * never hand the raw 7-digit string to `new Date()`/`Date.parse()`. */
const DK_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d+)Z$/;

function normalizeDkTimestamp(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = DK_TIMESTAMP_RE.exec(raw.trim());
  if (!match) return null;
  const millis = match[2].slice(0, 3).padEnd(3, "0");
  const trimmed = `${match[1]}.${millis}Z`;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildText(md: PromotionEntry["merchandisingData"]): string {
  // additionalDetail first so its numeric max stake ("BOOSTED UP TO MAX
  // $25 WAGER") is the first line parseMaxStake sees.
  return [
    md.additionalDetail ?? "",
    md.terms ? stripTermsBoilerplate(md.terms) : "",
    md.promotionDescription ?? "",
    md.inlineDetails?.promotionSubHeadline ?? "",
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function skippedEntry(reason: SkipReason, entry: PromotionEntry, title: string): SkippedEntry {
  return { reason, externalId: String(entry.promotionId), title };
}

function buildCandidate(entry: PromotionEntry, title: string, text: string): ScrapedPromo {
  const boostMatch = BOOST_PERCENT_RE.exec(text);
  const boostPercent = boostMatch ? new Decimal(boostMatch[1]).toFixed(2) : null;

  const maxStakeParse = parseMaxStake(text);
  const maxStake = maxStakeParse.status === "parsed" ? maxStakeParse.value : null;

  const maxWinningsParse = parseMaxWinnings(text, WINNINGS_CAP_KIND);
  const maxWinnings = maxWinningsParse.status === "parsed" ? maxWinningsParse.value : null;

  const minOddsParse = parseMinOdds(text);
  const minOddsAmerican = minOddsParse.status === "parsed" ? minOddsParse.value : null;

  const unparsedCapFields: Array<"maxStake" | "maxWinnings" | "minOdds"> = [];
  if (maxStakeParse.status === "unparsed") unparsedCapFields.push("maxStake");
  if (maxWinningsParse.status === "unparsed") unparsedCapFields.push("maxWinnings");
  if (minOddsParse.status === "unparsed") unparsedCapFields.push("minOdds");

  const scopeMatch = SCOPE_RE.exec(text);
  const expiresAt = normalizeDkTimestamp(entry.expirationDate);

  let scopeText = title;
  let windowStart: string | null = null;
  let windowEnd: string | null = null;

  if (scopeMatch) {
    const sportWords = scopeMatch[1].trim();
    const dateText = scopeMatch[2];
    scopeText = truncate(`${sportWords} games on ${dateText}`, 200);
    const window = slateWindow(dateText, expiresAt);
    if (window) {
      windowStart = window.start;
      windowEnd = window.end;
    }
  }

  if (windowStart === null || windowEnd === null) {
    // No "games on <date>" scope phrase found -- fall back to the
    // promotion's own start/end fields (03-RECON.md, Task 2 behavior).
    windowStart = normalizeDkTimestamp(entry.startDate);
    windowEnd = expiresAt;
  }

  const sportHint = sportFromText(`${title} ${text}`);
  const sportKeyHint = sportHint.kind === "supported" ? sportHint.sportKey : null;

  const claimRequired: ScrapedPromo["claimRequired"] =
    entry.isOptInPromotion === true || OPT_IN_TEXT_RE.test(text) ? "opt_in" : null;

  return {
    bookKey: "draftkings",
    externalId: String(entry.promotionId),
    promoType: "profit_boost",
    title: truncate(title, 200),
    rawText: truncate(`${title}\n${text}`, 2000),
    sourceUrl: LIST_URL,
    sportKeyHint,
    scopeText,
    teamsText: [],
    windowStart,
    windowEnd,
    expiresAt,
    eligibleMarketTypes: [...PROMO_MARKET_TYPES],
    pinned: null,
    boostPercent,
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake,
    maxWinnings,
    winningsCapKind: WINNINGS_CAP_KIND,
    minOddsAmerican,
    unparsedCapFields,
    claimRequired,
    finePrintNote: extractFinePrintNote(text),
  };
}

export const draftkingsScraper: BookScraper = {
  bookKey: "draftkings",
  render: "http",
  stealth: false,
  sourceFormat: "json",
  maxDetailRequests: 0,
  listRequest: {
    method: "POST",
    url: LIST_URL,
    headers: LIST_HEADERS,
    body: LIST_BODY,
  },
  planDetails(): DetailPlan[] {
    return [];
  },
  parse(input): ParseResult {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(input.listBody);
    } catch {
      return { found: 0, candidates: [], skipped: [] };
    }

    const result = DraftKingsResponseSchema.safeParse(parsedJson);
    if (!result.success) {
      return { found: 0, candidates: [], skipped: [] };
    }

    const entries: PromotionEntry[] = result.data.zones[0]?.promotions ?? [];

    const candidates: ScrapedPromo[] = [];
    const skipped: SkippedEntry[] = [];

    for (const entry of entries) {
      const title = entry.merchandisingData.promotionHeadline ?? "";
      const text = buildText(entry.merchandisingData);
      const category = entry.category ?? null;

      const exclusionReason = classifyExclusion({ title, text, category });
      if (exclusionReason !== null) {
        skipped.push(skippedEntry(exclusionReason, entry, title));
        continue;
      }

      if (!MENTIONS_BOOST_OR_BONUS_RE.test(`${title}\n${text}`)) {
        skipped.push(skippedEntry("not_a_promo", entry, title));
        continue;
      }

      const sportHint = sportFromText(`${title} ${text}`);
      if (sportHint.kind === "unsupported") {
        skipped.push(skippedEntry("unsupported_sport", entry, title));
        continue;
      }
      if (sportHint.kind === "unknown") {
        skipped.push(skippedEntry("unrecognized", entry, title));
        continue;
      }

      const candidate = buildCandidate(entry, title, text);
      const validated = ScrapedPromoSchema.safeParse(candidate);
      if (!validated.success) {
        console.warn(
          `draftkingsScraper: candidate ${entry.promotionId} failed ScrapedPromoSchema`,
          validated.error.issues,
        );
        skipped.push(skippedEntry("schema_invalid", entry, title));
        continue;
      }

      candidates.push(validated.data);
    }

    return { found: candidates.length + skipped.length, candidates, skipped };
  },
};
