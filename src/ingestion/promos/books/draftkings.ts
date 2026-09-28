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
import { slateWindow, parseEtDateTime } from "@/domain/promos/etTime";
import { parseMaxStake, parseMaxWinnings, parseMinOdds, extractFinePrintNote } from "@/ingestion/promos/finePrint";
import { classifyExclusion } from "@/ingestion/promos/exclusions";
import { sportFromText, sportFromTeamPair } from "@/ingestion/promos/sportHints";

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
 *
 * Single-game scope handling (real fixture 1126403, "LA Rams @ DEN Broncos
 * 50% Profit Boost"): not every single-game boost's text names a sport --
 * some only say "for the <A> @ <B> game on <date>". When sportFromText
 * comes back unknown, GAME_SCOPE_RE/parseGameScope is tried as a fallback
 * scope signal before giving up as "unrecognized"; when it matches, the
 * candidate gets a real teamsText pair and, if no sport word was found
 * either, a sportKeyHint inferred from the team names themselves
 * (sportFromTeamPair). The sport-wide "for all <sport> games on <date>"
 * phrase (SCOPE_RE) always wins when both phrases are present.
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

/** "for the LA Rams @ DEN Broncos game on 9/27/2026 at 08:20 PM ET" (real
 * fixture 1126403) -- a single-game profit boost whose text never says a
 * sport (unlike SCOPE_RE's "for all NFL games on..."). Requires the
 * literal "for the" prefix so generic copy like "end of the final NFL
 * game on 9/27/2026" (real fixture wording, both DK fixtures) can never
 * match: that phrase has no "for the" immediately before a team pair. The
 * team groups are limited to a negated character class excluding
 * newline/@/! (no nested quantifiers -- no catastrophic-backtracking risk,
 * T-pcc-02) so they can't cross a numbered-list line or swallow the "!" DK
 * puts at the end of its opt-in sentence. The trailing "at <time> ET" is
 * optional -- some single-game boosts' terms omit it. */
const GAME_SCOPE_RE =
  /for the ([^\n@!]+?) (?:@|vs\.?) ([^\n@!]+?) game on (\d{1,2}\/\d{1,2}\/\d{4})(?: at (\d{1,2}:\d{2}\s*[AP]M) ET)?/i;

interface GameScope {
  teams: [string, string];
  dateText: string;
  timeText: string | null;
  scopeText: string;
}

/** Pure helper: parses the GAME_SCOPE_RE phrase, or null when absent. */
function parseGameScope(text: string): GameScope | null {
  const match = GAME_SCOPE_RE.exec(text);
  if (!match) return null;

  const away = match[1].trim();
  const home = match[2].trim();
  const dateText = match[3];
  const timeText = match[4] ? match[4].trim() : null;
  if (away.length === 0 || home.length === 0) return null;

  const scopeTextRaw = timeText
    ? `${away} @ ${home} game on ${dateText} at ${timeText} ET`
    : `${away} @ ${home} game on ${dateText}`;

  return { teams: [away, home], dateText, timeText, scopeText: truncate(scopeTextRaw, 200) };
}

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
  // SCOPE_RE (sport-wide) wins when both phrases match -- only look for the
  // single-game phrase when the sport-wide one isn't present.
  const gameScope = scopeMatch ? null : parseGameScope(text);
  const expiresAt = normalizeDkTimestamp(entry.expirationDate);

  let scopeText = title;
  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let teamsText: string[] = [];

  if (scopeMatch) {
    const sportWords = scopeMatch[1].trim();
    const dateText = scopeMatch[2];
    scopeText = truncate(`${sportWords} games on ${dateText}`, 200);
    const window = slateWindow(dateText, expiresAt);
    if (window) {
      windowStart = window.start;
      windowEnd = window.end;
    }
  } else if (gameScope) {
    scopeText = gameScope.scopeText;
    teamsText = gameScope.teams;
    const window = slateWindow(gameScope.dateText, expiresAt);
    if (window) {
      windowStart = window.start;
      windowEnd = window.end;

      if (gameScope.timeText) {
        const kickoffIso = parseEtDateTime(`${gameScope.dateText} at ${gameScope.timeText} ET`);
        if (kickoffIso !== null) {
          const kickoffMs = new Date(kickoffIso).getTime();
          if (kickoffMs < new Date(windowStart).getTime() || kickoffMs > new Date(windowEnd).getTime()) {
            // Kickoff falls outside the slate window -- fall through to the
            // startDate/expiresAt fallback below instead of trusting it.
            windowStart = null;
            windowEnd = null;
          }
        }
      }
    }
  }

  if (windowStart === null || windowEnd === null) {
    // No "games on <date>" scope phrase found -- fall back to the
    // promotion's own start/end fields (03-RECON.md, Task 2 behavior).
    windowStart = normalizeDkTimestamp(entry.startDate);
    windowEnd = expiresAt;
  }

  const sportHint = sportFromText(`${title} ${text}`);
  let sportKeyHint = sportHint.kind === "supported" ? sportHint.sportKey : null;
  if (sportKeyHint === null && teamsText.length === 2) {
    const teamSportHint = sportFromTeamPair(teamsText[0], teamsText[1]);
    if (teamSportHint.kind === "supported") sportKeyHint = teamSportHint.sportKey;
  }

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
    teamsText,
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
        // No sport word in the text -- still let it through when it's a
        // single-game "for the A @ B game on <date>" boost (real fixture
        // 1126403); the team names, not a sport word, pin its scope.
        if (parseGameScope(text) === null) {
          skipped.push(skippedEntry("unrecognized", entry, title));
          continue;
        }
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
