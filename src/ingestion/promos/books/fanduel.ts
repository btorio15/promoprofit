import Decimal from "decimal.js";
import { z } from "zod";
import type {
  BookScraper,
  DetailPlan,
  HttpRequestSpec,
  ParseResult,
  ScrapedPromo,
  SkipEvidence,
  SkipReason,
  SkippedEntry,
} from "@/domain/promos/scraped";
import { ScrapedPromoSchema } from "@/domain/promos/scraped";
import { PROMO_MARKET_TYPES, type CapField, type WinningsCapKind } from "@/domain/promos/types";
import { slateWindow } from "@/domain/promos/etTime";
import {
  extractFinePrintNote,
  htmlToText,
  parseMaxStake,
  parseMaxWinnings,
  parseMinOdds,
} from "@/ingestion/promos/finePrint";
import { classifyExclusion } from "@/ingestion/promos/exclusions";
import { sportFromTags, sportFromText } from "@/ingestion/promos/sportHints";
import { splitTeams } from "@/ingestion/promos/promoText";

/** This book's winnings-cap semantics (per-book recon, 03-RECON.md) -- known independently of whether a cap amount parses (WR-01). */
const WINNINGS_CAP_KIND: WinningsCapKind = "boost_extra";

/**
 * FanDuel parser (one of the three http books the owner cleared in D-09,
 * 03-RECON.md "### FanDuel (`fanduel`)"). Plain-fetch, logged-out, JSON-only
 * -- no browser, no stealth, no stored session state of any kind. The
 * PerimeterX bot-detection request header (recon's evidence: FanDuel's CSP
 * references px-cloud/px-cdn) is never sent or forged: recon confirmed the
 * promotions API returns 200 without it, and forging a bot-detection token
 * is out of scope regardless of whether it "works" (D-09, T-03-14-03).
 *
 * FanDuel hides its max wager entirely when logged out ("up to a maximum
 * wager. Log in for more details.") -- every candidate here carries
 * maxStake=null with "maxStake" in unparsedCapFields so it lands in the
 * cap-review queue (D-18, Design Implication 5); the app never guesses it.
 *
 * Detail fan-out is capped at FANDUEL_MAX_DETAIL_REQUESTS and only issued
 * for entries that survive classifyFanduelEntry (Design Implication 7 --
 * a handful of requests per run, polite cadence).
 */

const FANDUEL_LIST_URL =
  "https://api.sportsbook.fanduel.com/promos/api/promotions?containers=SBK_PROMOHUB&channel=desktop&page=1&generosityGamesEnabled=false&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false&filterPlayItAgainPromosEnabled=false&filterMultiCyrPromosEnabled=false";

const FANDUEL_HEADERS: Readonly<Record<string, string>> = {
  "x-sportsbook-region": "CO",
  accept: "application/json",
  referer: "https://sportsbook.fanduel.com/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export const FANDUEL_MAX_DETAIL_REQUESTS = 6;

function fanduelDetailUrl(promoCode: string): string {
  return `https://api.sportsbook.fanduel.com/promos/api/promotions/${promoCode}?channel=desktop&rewardsHubEnabled=true&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false`;
}

const FANDUEL_LIST_REQUEST: HttpRequestSpec = {
  method: "GET",
  url: FANDUEL_LIST_URL,
  headers: FANDUEL_HEADERS,
  body: null,
};

function fanduelDetailRequest(promoCode: string): HttpRequestSpec {
  return {
    method: "GET",
    url: fanduelDetailUrl(promoCode),
    headers: FANDUEL_HEADERS,
    body: null,
  };
}

// ---------------------------------------------------------------------------
// List/detail JSON shapes (looseObject -- untrusted third-party JSON, only
// the fields this parser reads are validated; everything else passes
// through unchecked and is never touched, T-03-14-01).
// ---------------------------------------------------------------------------

const FanduelListEntrySchema = z.looseObject({
  promoCode: z.string(),
  title: z.string(),
  name: z.string(),
  tags: z.array(z.string()).optional(),
  combinedEndDate: z.string().optional(),
});
type FanduelListEntry = z.infer<typeof FanduelListEntrySchema>;

const FanduelListResponseSchema = z.looseObject({
  promoPlacements: z.array(
    z.looseObject({
      promotions: z.array(FanduelListEntrySchema),
    }),
  ),
});

const FanduelDetailEntrySchema = z.looseObject({
  promoCode: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  combinedEndDate: z.string().optional(),
  termsAndConditions: z.looseObject({ full: z.string().optional() }).optional(),
  customerPromotionState: z
    .looseObject({ promoStateExpiryDate: z.string().optional() })
    .optional(),
});
type FanduelDetailEntry = z.infer<typeof FanduelDetailEntrySchema>;

const FanduelDetailResponseSchema = z.array(FanduelDetailEntrySchema).min(1);

function safeJsonParse(body: string): unknown | null {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function extractListEntries(listBody: string): FanduelListEntry[] {
  const parsed = safeJsonParse(listBody);
  if (parsed === null) return [];

  const result = FanduelListResponseSchema.safeParse(parsed);
  if (!result.success) return [];

  const seen = new Set<string>();
  const entries: FanduelListEntry[] = [];
  for (const placement of result.data.promoPlacements) {
    for (const promo of placement.promotions) {
      if (seen.has(promo.promoCode)) continue;
      seen.add(promo.promoCode);
      entries.push(promo);
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Title-level classification -- shared by planDetails and parse so the
// entries we fetch details for are exactly the entries that become
// candidates (03-RECON.md Design Implications 3/5, D-15).
// ---------------------------------------------------------------------------

/** Real FanDuel boost/bonus token wording ("Profit Boost", "Odds Boost",
 * "Boost Token", "Bonus Bet(s)", "PBT"). An entry that never names one of
 * these is not a redeemable promo at all (a feature announcement, a
 * contest, a static info card) -- not_a_promo, regardless of other text. */
const BOOST_OR_BONUS_TOKEN_RE = /\b(?:profit\s+boost|odds\s+boost|boost\s+token|bonus\s+bets?|pbt)\b/i;

/** FanDuel tags new-customer/acquisition promos with an "acq" substring
 * (e.g. "national-acq-offer", "acquisition-tracker"); wording alone also
 * signals it ("first wager", "New Customers", "new user") even when no such
 * tag is present. Checked before classifyExclusion's own new-customer text
 * check, which does not cover "first wager". */
const FANDUEL_ACQ_TAG_RE = /acq/i;
const FANDUEL_NEW_CUSTOMER_TEXT_RE = /\bfirst\s+wager\b|\bnew\s+customers?\b|\bnew\s+users?\b/i;

interface FanduelClassification {
  candidate: boolean;
  reason: SkipReason | null;
  sportKey: string | null;
}

function classifyFanduelEntry(entry: {
  title: string;
  name: string;
  tags?: string[];
}): FanduelClassification {
  const combined = `${entry.title}\n${entry.name}`;
  const tags = entry.tags ?? [];

  if (tags.some((t) => FANDUEL_ACQ_TAG_RE.test(t)) || FANDUEL_NEW_CUSTOMER_TEXT_RE.test(combined)) {
    return { candidate: false, reason: "new_customer", sportKey: null };
  }

  const exclusion = classifyExclusion({ title: entry.title, text: entry.name });
  if (exclusion !== null) {
    return { candidate: false, reason: exclusion, sportKey: null };
  }

  if (!BOOST_OR_BONUS_TOKEN_RE.test(combined)) {
    return { candidate: false, reason: "not_a_promo", sportKey: null };
  }

  let sport = sportFromTags(tags);
  if (sport.kind === "unknown") {
    sport = sportFromText(combined);
  }

  if (sport.kind === "unsupported") {
    return { candidate: false, reason: "unsupported_sport", sportKey: null };
  }
  if (sport.kind !== "supported") {
    return { candidate: false, reason: "unrecognized", sportKey: null };
  }

  return { candidate: true, reason: null, sportKey: sport.sportKey };
}

// ---------------------------------------------------------------------------
// planDetails
// ---------------------------------------------------------------------------

function planDetails(listBody: string): DetailPlan[] {
  const entries = extractListEntries(listBody);
  const plans: DetailPlan[] = [];

  for (const entry of entries) {
    const result = classifyFanduelEntry(entry);
    if (!result.candidate) continue;

    plans.push({
      entryKey: entry.promoCode,
      request: fanduelDetailRequest(entry.promoCode),
    });

    if (plans.length >= FANDUEL_MAX_DETAIL_REQUESTS) break;
  }

  return plans;
}

// ---------------------------------------------------------------------------
// parse -- scope/date/cap extraction
// ---------------------------------------------------------------------------

/** "for any College Football Games on September 26th, 2026" -> scope
 * phrase + the raw date text for slateWindow. Same shape appears in both
 * FanDuel's list `.name` one-liner and detail `.description` prose. */
const SCOPE_PHRASE_RE =
  /for\s+any\s+(.+?)\s+Games?\s+on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i;

function extractScope(text: string): { scopeText: string; dateText: string } | null {
  const match = SCOPE_PHRASE_RE.exec(text);
  if (!match) return null;
  const sportWords = match[1].trim();
  const dateText = match[2].trim();
  return { scopeText: `${sportWords} Games on ${dateText}`, dateText };
}

/** "for the Eagles @ Bears NFL Game on September 28" (real fixture
 * LONFLMNFRE0928, "NFL Reward Escalator", 2026-09-28) -- a single-game
 * FanDuel boost, distinct from SCOPE_PHRASE_RE's sport-wide "for any
 * <sport> Games on <Month Day, Year>" phrasing in two ways: it names the
 * two teams instead of a sport, and its date has no year. The optional
 * ALL-CAPS sport code between the team pair and "Game" (e.g. "NFL") is
 * consumed but discarded, since it is not part of either team name. Team
 * groups exclude "@" and newlines only (no nested quantifiers -- same
 * catastrophic-backtracking guard as DraftKings' GAME_SCOPE_RE, T-pcc-02).
 * Before this regex existed, splitTeams ran directly on the full raw
 * `entry.name` one-liner as a fallback and would spuriously split on the
 * embedded " @ " inside this promo's marketing sentence, producing garbage
 * "team" text that included unrelated words either side of "@" -- this
 * regex isolates the real team pair before that fallback ever runs. */
const GAME_SCOPE_RE =
  /for the ([^\n@]+?) @ ([^\n@]+?)(?:\s+[A-Z]{2,6})?\s+Games?\s+on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?)\b/i;

interface FanduelGameScope {
  teams: [string, string];
  dateText: string;
  scopeText: string;
}

/** Pure helper: parses the GAME_SCOPE_RE phrase, or null when absent. */
function parseGameScope(text: string): FanduelGameScope | null {
  const match = GAME_SCOPE_RE.exec(text);
  if (!match) return null;

  const away = match[1].trim();
  const home = match[2].trim();
  const dateText = match[3].trim();
  if (away.length === 0 || home.length === 0) return null;

  return {
    teams: [away, home],
    dateText,
    scopeText: truncate(`${away} @ ${home} game on ${dateText}`, MAX_SCOPE_TEXT_CHARS),
  };
}

const EXPIRES_AT_YEAR_RE = /^(\d{4})-/;

/** GAME_SCOPE_RE's dateText has no year ("September 28"), unlike
 * SCOPE_PHRASE_RE's date, which always includes one -- slateWindow's
 * underlying date parser requires a 4-digit year to produce a window at
 * all. The promo's own expiry always falls within a day or two of the
 * named game in every observed single-game FanDuel fixture, so its year is
 * a safe, conservative source for the missing year (never guessed from
 * "now", which could be wrong across a Dec 31/Jan 1 boundary). Returns the
 * bare dateText unchanged when expiresAt is absent or unparseable, in
 * which case slateWindow will simply fail closed (null window) exactly as
 * it does for any other unparseable date. */
function withInferredYear(dateText: string, expiresAt: string | null): string {
  const yearMatch = expiresAt ? EXPIRES_AT_YEAR_RE.exec(expiresAt) : null;
  return yearMatch ? `${dateText}, ${yearMatch[1]}` : dateText;
}

const ANY_WAGER_RE = /\bany\s+wager\b/i;

const BOOST_PERCENT_RE = /(\d+(?:\.\d+)?)\s*%\s*profit\s+boost/i;

function extractBoostPercent(text: string): string | null {
  const match = BOOST_PERCENT_RE.exec(text);
  if (!match) return null;
  return new Decimal(match[1]).toFixed(2);
}

const MAX_RAW_TEXT_CHARS = 2000;
const MAX_SCOPE_TEXT_CHARS = 200;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function eligibleMarketTypesFor(text: string) {
  // FanDuel's target promo shape (03-RECON.md) is always "ANY wager" on a
  // sport-wide/date-wide slate -- no pinned single-market FanDuel boost has
  // been observed, so all three market types apply whenever the promo
  // states "any wager"; default to all three otherwise too (defensive --
  // no observed FanDuel promo restricts to one market type without naming
  // a specific selection, which would make it "pinned" instead).
  void ANY_WAGER_RE.test(text);
  return [...PROMO_MARKET_TYPES];
}

function buildCandidate(params: {
  entry: FanduelListEntry;
  title: string;
  text: string;
  sourceUrl: string;
  sportKey: string;
  expiresAt: string | null;
  maxStake: string | null;
  maxWinnings: { amount: string; kind: WinningsCapKind } | null;
  minOddsAmerican: number | null;
  unparsedCapFields: CapField[];
  finePrintNote: string | null;
}): ScrapedPromo {
  const {
    entry,
    title,
    text,
    sourceUrl,
    sportKey,
    expiresAt,
    maxStake,
    maxWinnings,
    minOddsAmerican,
    unparsedCapFields,
    finePrintNote,
  } = params;

  const scope = extractScope(text);
  // SCOPE_PHRASE_RE (sport-wide, has its own year) wins when both phrases
  // match -- only look for the single-game team-pair phrase when the
  // sport-wide one isn't present.
  const gameScope = scope ? null : parseGameScope(text);
  const boostPercent = extractBoostPercent(text);

  let window: { start: string; end: string } | null = null;
  let scopeText: string;
  let teamsText: string[] = [];

  if (scope) {
    scopeText = scope.scopeText;
    window = slateWindow(scope.dateText, expiresAt);
    const teamPair = splitTeams(scopeText);
    if (teamPair) teamsText = [teamPair[0], teamPair[1]];
  } else if (gameScope) {
    scopeText = gameScope.scopeText;
    teamsText = gameScope.teams;
    window = slateWindow(withInferredYear(gameScope.dateText, expiresAt), expiresAt);
  } else {
    scopeText = truncate(entry.name, MAX_SCOPE_TEXT_CHARS);
    const teamPair = splitTeams(scopeText);
    if (teamPair) teamsText = [teamPair[0], teamPair[1]];
  }

  return {
    bookKey: "fanduel",
    externalId: entry.promoCode,
    promoType: "profit_boost",
    title,
    rawText: truncate(text, MAX_RAW_TEXT_CHARS),
    sourceUrl,
    sportKeyHint: sportKey,
    scopeText,
    teamsText,
    windowStart: window ? window.start : null,
    windowEnd: window ? window.end : null,
    expiresAt,
    eligibleMarketTypes: eligibleMarketTypesFor(text),
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
    claimRequired: "claim_token",
    finePrintNote,
  };
}

function buildCandidateWithDetail(
  entry: FanduelListEntry,
  detail: FanduelDetailEntry,
  sportKey: string,
): ScrapedPromo {
  const descriptionText = htmlToText(detail.description ?? "");
  const text = `${entry.name}\n${detail.title}\n${descriptionText}`;
  const expiresAt =
    detail.combinedEndDate ??
    detail.customerPromotionState?.promoStateExpiryDate ??
    entry.combinedEndDate ??
    null;

  const maxStakeParse = parseMaxStake(descriptionText);
  const minOddsParse = parseMinOdds(descriptionText);
  const maxWinningsParse = parseMaxWinnings(descriptionText, WINNINGS_CAP_KIND);

  const unparsedCapFields: CapField[] = [];
  if (maxStakeParse.status === "unparsed") unparsedCapFields.push("maxStake");
  if (minOddsParse.status === "unparsed") unparsedCapFields.push("minOdds");
  if (maxWinningsParse.status === "unparsed") unparsedCapFields.push("maxWinnings");

  return buildCandidate({
    entry,
    title: detail.title || entry.title,
    text,
    sourceUrl: fanduelDetailUrl(entry.promoCode),
    sportKey,
    expiresAt,
    maxStake: maxStakeParse.status === "parsed" ? maxStakeParse.value : null,
    maxWinnings: maxWinningsParse.status === "parsed" ? maxWinningsParse.value : null,
    minOddsAmerican: minOddsParse.status === "parsed" ? minOddsParse.value : null,
    unparsedCapFields,
    finePrintNote: extractFinePrintNote(descriptionText),
  });
}

/** No detail body was fetched for this entry (either it wasn't in the
 * planned batch, or the fetch failed upstream). FanDuel hides its max
 * wager and never states min odds on the list `.name` one-liner alone, so
 * both fields are always routed to review here rather than guessed at
 * (D-18) -- this is a deliberate, conservative default for the degraded
 * path, distinct from the with-detail path's per-field parse result. */
function buildCandidateListOnly(entry: FanduelListEntry, sportKey: string, sourceUrl: string): ScrapedPromo {
  const text = `${entry.title}\n${entry.name}`;
  const expiresAt = entry.combinedEndDate ?? null;

  return buildCandidate({
    entry,
    title: entry.title,
    text,
    sourceUrl,
    sportKey,
    expiresAt,
    maxStake: null,
    maxWinnings: null,
    minOddsAmerican: null,
    unparsedCapFields: ["maxStake", "minOdds"],
    finePrintNote: extractFinePrintNote(entry.name),
  });
}

function parse(
  input: { listBody: string; detailBodies: Readonly<Record<string, string>> },
  ctx: { now: Date; sourceUrl: string },
): ParseResult {
  const entries = extractListEntries(input.listBody);
  const candidates: ScrapedPromo[] = [];
  const skipped: SkippedEntry[] = [];

  for (const entry of entries) {
    // quick-260928-it1: every skip's evidence mirrors what buildCandidateListOnly
    // would compute for this entry -- the list `.title`/`.name` text, the
    // list request's own URL, and the entry's own stated expiry.
    const evidence: SkipEvidence = {
      rawText: truncate(`${entry.title}\n${entry.name}`, MAX_RAW_TEXT_CHARS),
      sourceUrl: ctx.sourceUrl,
      expiresAt: entry.combinedEndDate ?? null,
      partial: null,
    };

    const classification = classifyFanduelEntry(entry);
    if (!classification.candidate || classification.sportKey === null) {
      skipped.push({
        reason: classification.reason ?? "unrecognized",
        externalId: entry.promoCode,
        title: entry.title,
        evidence,
      });
      continue;
    }

    const detailBody = input.detailBodies[entry.promoCode];
    let promo: ScrapedPromo;

    if (detailBody !== undefined) {
      const parsedDetail = safeJsonParse(detailBody);
      const detailResult =
        parsedDetail !== null ? FanduelDetailResponseSchema.safeParse(parsedDetail) : null;
      const detail = detailResult?.success ? detailResult.data[0] : null;
      promo = detail
        ? buildCandidateWithDetail(entry, detail, classification.sportKey)
        : buildCandidateListOnly(entry, classification.sportKey, ctx.sourceUrl);
    } else {
      promo = buildCandidateListOnly(entry, classification.sportKey, ctx.sourceUrl);
    }

    const validated = ScrapedPromoSchema.safeParse(promo);
    if (!validated.success) {
      console.warn(
        `fanduel parser: schema_invalid for ${entry.promoCode}: ${validated.error.message}`,
      );
      skipped.push({
        reason: "schema_invalid",
        externalId: entry.promoCode,
        title: entry.title,
        evidence: { rawText: truncate(promo.rawText, MAX_RAW_TEXT_CHARS), sourceUrl: promo.sourceUrl, expiresAt: promo.expiresAt, partial: promo },
      });
      continue;
    }

    candidates.push(validated.data);
  }

  return { found: entries.length, candidates, skipped };
}

export const fanduelScraper: BookScraper = {
  bookKey: "fanduel",
  render: "http",
  stealth: false,
  sourceFormat: "json",
  maxDetailRequests: FANDUEL_MAX_DETAIL_REQUESTS,
  listRequest: FANDUEL_LIST_REQUEST,
  planDetails,
  parse,
};
