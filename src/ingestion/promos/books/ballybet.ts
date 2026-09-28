import Decimal from "decimal.js";
import { z } from "zod";
import { parseEtDateTime } from "@/domain/promos/etTime";
import {
  ScrapedPromoSchema,
  type BookScraper,
  type DetailPlan,
  type HttpRequestSpec,
  type ParseResult,
  type ScrapedPromo,
  type SkipEvidence,
  type SkipReason,
  type SkippedEntry,
} from "@/domain/promos/scraped";
import { PROMO_MARKET_TYPES, type CapField, type WinningsCapKind } from "@/domain/promos/types";
import { classifyExclusion } from "@/ingestion/promos/exclusions";
import {
  extractFinePrintNote,
  htmlToText,
  parseMaxStake,
  parseMaxWinnings,
  parseMinOdds,
} from "@/ingestion/promos/finePrint";
import { splitTeams } from "@/ingestion/promos/promoText";
import { sportFromText, type SportHint } from "@/ingestion/promos/sportHints";

/** This book's winnings-cap semantics (per-book recon, 03-RECON.md) -- known independently of whether a cap amount parses (WR-01). */
const WINNINGS_CAP_KIND: WinningsCapKind = "boost_extra";

/**
 * Bally Bet parser (PROMO-03, D-06 first target, D-09 render:"http").
 * Turns the dx-config-service promotions list + per-promo detail JSON
 * (03-RECON.md "Bally Bet (`ballybet`)" Scraper Contract) into validated
 * scope-based ScrapedPromo candidates, using Plan 05's shared helpers
 * verbatim. Never logs in, never sends a session token or any stored
 * account credential (D-09) -- the request headers below are exactly the
 * Contract's list, no more.
 * planDetails is capped at 6 requests and only plans a detail fetch for a
 * card that already looks like a real, hedgeable single-game/sport-wide
 * boost at the title level (Design Implication 7, polite cadence).
 */

const LIST_URL = "https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view/promotions";
const DETAIL_BASE_URL = "https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view";
const REFERER = "https://play.ballybet.com/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MAX_DETAIL_REQUESTS = 6;
const RAW_TEXT_MAX_CHARS = 2000;

function buildHeaders(): Record<string, string> {
  return {
    jurisdiction: "US-CO",
    brand: "ballybet",
    "accept-language": "en-US",
    "application-type": "WEB",
    referer: REFERER,
    accept: "application/json",
    "user-agent": USER_AGENT,
  };
}

function buildRequest(url: string): HttpRequestSpec {
  return { method: "GET", url, headers: buildHeaders(), body: null };
}

function detailUrlFor(slug: string): string {
  return `${DETAIL_BASE_URL}/${slug}`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

// --- List body shape (loose; unknown keys tolerated -- T-03-12-01) ---

const ListLinkSchema = z.looseObject({ url: z.string().optional() });

const ListCardEntrySchema = z.looseObject({
  type: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  link: ListLinkSchema.optional(),
});

const ListSectionSchema = z.looseObject({
  data: z.array(z.unknown()).optional(),
});

const ListBodySchema = z.looseObject({
  sections: z
    .looseObject({
      primaryContent: z.array(z.unknown()).optional(),
    })
    .optional(),
});

interface ListCard {
  title: string;
  description: string;
  slug: string | null;
}

const SLUG_RE = /\/promotions\/([^/?#]+)/;

function extractSlug(url: string | undefined): string | null {
  if (!url) return null;
  const match = SLUG_RE.exec(url);
  return match ? match[1] : null;
}

/** Any schema/parse failure yields an empty list, never a throw (T-03-12-01). */
function extractListCards(listBody: string): ListCard[] {
  let raw: unknown;
  try {
    raw = JSON.parse(listBody);
  } catch {
    return [];
  }

  const parsedBody = ListBodySchema.safeParse(raw);
  if (!parsedBody.success) return [];

  const cards: ListCard[] = [];
  const sections = parsedBody.data.sections?.primaryContent ?? [];

  for (const sectionRaw of sections) {
    const section = ListSectionSchema.safeParse(sectionRaw);
    if (!section.success) continue;

    for (const entryRaw of section.data.data ?? []) {
      const entry = ListCardEntrySchema.safeParse(entryRaw);
      if (!entry.success) continue;
      if (entry.data.type !== "promotion_content_card") continue;

      const title = entry.data.title ?? "";
      if (title.length === 0) continue;

      cards.push({
        title,
        description: entry.data.description ?? "",
        slug: extractSlug(entry.data.link?.url),
      });
    }
  }

  return cards;
}

// --- Detail body shape ---

const DetailCtaSchema = z.looseObject({ url: z.string().optional() });

const DetailEntrySchema = z.looseObject({
  componentType: z.string().optional(),
  promotionIdentifier: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  terms: z.string().optional(),
  promotionCta: DetailCtaSchema.optional(),
});

type DetailEntry = z.infer<typeof DetailEntrySchema>;

const DetailBodySchema = z.looseObject({
  sections: z
    .looseObject({
      primaryContent: z.array(z.unknown()).optional(),
    })
    .optional(),
});

function extractDetailEntry(detailBody: string): DetailEntry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(detailBody);
  } catch {
    return null;
  }

  const parsedBody = DetailBodySchema.safeParse(raw);
  if (!parsedBody.success) return null;

  for (const entryRaw of parsedBody.data.sections?.primaryContent ?? []) {
    const entry = DetailEntrySchema.safeParse(entryRaw);
    if (!entry.success) continue;
    if (entry.data.componentType === "promotion_details") return entry.data;
  }

  return null;
}

// --- Title-level qualification (Task 1) ---

const BOOST_BONUS_KEYWORD_RE = /\b(?:boost|bonus)\b/i;
const PERCENT_OR_DOLLAR_RE = /\d+\s*%|\$\s*\d/;

function isQualifyingTitle(title: string): boolean {
  if (classifyExclusion({ title, text: "" }) !== null) return false;
  if (sportFromText(title).kind === "unsupported") return false;
  if (!BOOST_BONUS_KEYWORD_RE.test(title)) return false;
  if (!PERCENT_OR_DOLLAR_RE.test(title)) return false;
  return true;
}

function planBallybetDetails(listBody: string): DetailPlan[] {
  const cards = extractListCards(listBody);
  const plans: DetailPlan[] = [];

  for (const card of cards) {
    if (plans.length >= MAX_DETAIL_REQUESTS) break;
    if (!card.slug) continue;
    if (!isQualifyingTitle(card.title)) continue;

    plans.push({ entryKey: card.slug, request: buildRequest(detailUrlFor(card.slug)) });
  }

  return plans;
}

// --- Candidate assembly (Task 2) ---

const ANY_WAGER_RE = /\bany wager\b/i;
const BOOST_PERCENT_NEAR_LABEL_RE = /(\d+(?:\.\d+)?)\s*%\s*profit boost/i;
const LEADING_PERCENT_RE = /^(\d+(?:\.\d+)?)\s*%/;
const CLAIMABLE_SCOPE_RE =
  /promotion claimable for\s+(.+?)\s+between\s+(.+?)\s+and\s+(.+?)\.(?:\s|$)/i;
const TITLE_SCOPE_STRIP_RE = /^\d+(?:\.\d+)?\s*%\s*/;
const TITLE_SCOPE_TRAIL_RE = /\s*(?:live\s+wager\s*)?profit\s+boost(?:\s+token)?\s*$/i;

function extractBoostPercent(text: string): string | null {
  const match = BOOST_PERCENT_NEAR_LABEL_RE.exec(text);
  if (!match) return null;
  return new Decimal(match[1]).toFixed(2);
}

function extractLeadingPercent(title: string): string | null {
  const match = LEADING_PERCENT_RE.exec(title.trim());
  if (!match) return null;
  return new Decimal(match[1]).toFixed(2);
}

function scopeFromTitle(title: string): string {
  return title.replace(TITLE_SCOPE_STRIP_RE, "").replace(TITLE_SCOPE_TRAIL_RE, "").trim();
}

type BuildResult =
  | { status: "candidate"; promo: ScrapedPromo }
  | { status: "skip"; reason: SkipReason; evidence?: SkipEvidence };

function buildFromListFallback(card: ListCard, slug: string, titleSportHint: SportHint): BuildResult {
  const listText = htmlToText(card.description);
  const scopeText = scopeFromTitle(card.title);

  const promo: ScrapedPromo = {
    bookKey: "ballybet",
    externalId: slug,
    promoType: "profit_boost",
    title: card.title,
    rawText: truncate(listText, RAW_TEXT_MAX_CHARS),
    sourceUrl: detailUrlFor(slug),
    sportKeyHint: titleSportHint.kind === "supported" ? titleSportHint.sportKey : null,
    scopeText,
    teamsText: splitTeams(scopeText) ?? [],
    windowStart: null,
    windowEnd: null,
    expiresAt: null,
    eligibleMarketTypes: [...PROMO_MARKET_TYPES],
    pinned: null,
    boostPercent: extractLeadingPercent(card.title),
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: null,
    maxWinnings: null,
    winningsCapKind: WINNINGS_CAP_KIND,
    minOddsAmerican: null,
    // D-18: the detail that would state these caps was planned but never
    // came back -- mark them unparsed (never guessed) rather than absent.
    unparsedCapFields: ["maxStake", "minOdds"],
    claimRequired: "claim_token",
    finePrintNote: extractFinePrintNote(listText),
  };

  return { status: "candidate", promo };
}

function buildFromDetail(card: ListCard, slug: string, detailBody: string): BuildResult {
  const detail = extractDetailEntry(detailBody);
  if (!detail) {
    return buildFromListFallback(card, slug, sportFromText(card.title));
  }

  const title = detail.title ?? card.title;
  const descText = htmlToText(detail.description ?? "");
  const termsText = htmlToText(detail.terms ?? "");
  const text = `${descText}\n${termsText}`;
  const sourceUrl = detailUrlFor(slug);

  // Computed early so every skip return below can attach evidence with the
  // detail's own text/URL/expiry -- windowEnd (when the claimable-scope
  // phrase parsed) doubles as the promo's own expiry, same as the candidate
  // path further down.
  const earlyClaimMatch = CLAIMABLE_SCOPE_RE.exec(text);
  const earlyWindowEnd = earlyClaimMatch ? parseEtDateTime(earlyClaimMatch[3].trim()) : null;
  const evidence: SkipEvidence = { rawText: truncate(text, RAW_TEXT_MAX_CHARS), sourceUrl, expiresAt: earlyWindowEnd, partial: null };

  // Detail text can reveal an exclusion the list card's title/description
  // didn't (e.g. "Live Wagers Only" in the Offer Details bullets).
  const exclusion = classifyExclusion({ title, text });
  if (exclusion) return { status: "skip", reason: exclusion, evidence };

  let sportHint = sportFromText(detail.promotionCta?.url ?? "");
  if (sportHint.kind === "unknown") sportHint = sportFromText(title);
  if (sportHint.kind === "unsupported") return { status: "skip", reason: "unsupported_sport", evidence };
  const sportKeyHint = sportHint.kind === "supported" ? sportHint.sportKey : null;

  // "Any Wager" is the only eligible-bet-type wording recon found on any
  // Bally Bet promo (Observed Promos rows 1-3) -- anything else is a market
  // wording this parser can't map, so it's skipped rather than guessed.
  if (!ANY_WAGER_RE.test(text)) {
    return { status: "skip", reason: "unrecognized", evidence };
  }

  const maxStakeParse = parseMaxStake(text);
  const minOddsParse = parseMinOdds(text);
  const maxWinningsParse = parseMaxWinnings(text, WINNINGS_CAP_KIND);

  const unparsedCapFields: CapField[] = [];

  const maxStake = maxStakeParse.status === "parsed" ? maxStakeParse.value : null;
  if (maxStakeParse.status === "unparsed") unparsedCapFields.push("maxStake");

  const minOddsAmerican = minOddsParse.status === "parsed" ? minOddsParse.value : null;
  if (minOddsParse.status === "unparsed") unparsedCapFields.push("minOdds");

  const maxWinnings = maxWinningsParse.status === "parsed" ? maxWinningsParse.value : null;
  if (maxWinningsParse.status === "unparsed") unparsedCapFields.push("maxWinnings");

  const claimMatch = earlyClaimMatch;
  const scopeText = claimMatch ? claimMatch[1].trim() : scopeFromTitle(title);
  const windowStart = claimMatch ? parseEtDateTime(claimMatch[2].trim()) : null;
  const windowEnd = earlyWindowEnd;

  const promo: ScrapedPromo = {
    bookKey: "ballybet",
    externalId: slug,
    promoType: "profit_boost",
    title,
    rawText: truncate(text, RAW_TEXT_MAX_CHARS),
    sourceUrl,
    sportKeyHint,
    scopeText,
    teamsText: splitTeams(scopeText) ?? [],
    windowStart,
    windowEnd,
    expiresAt: windowEnd,
    eligibleMarketTypes: [...PROMO_MARKET_TYPES],
    pinned: null,
    boostPercent: extractBoostPercent(text) ?? extractLeadingPercent(title),
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake,
    maxWinnings,
    winningsCapKind: WINNINGS_CAP_KIND,
    minOddsAmerican,
    unparsedCapFields,
    claimRequired: "claim_token",
    finePrintNote: extractFinePrintNote(text),
  };

  return { status: "candidate", promo };
}

function ballybetParse(
  input: { listBody: string; detailBodies: Readonly<Record<string, string>> },
  ctx: { now: Date; sourceUrl: string },
): ParseResult {
  const cards = extractListCards(input.listBody);
  const candidates: ScrapedPromo[] = [];
  const skipped: SkippedEntry[] = [];

  for (const card of cards) {
    const listText = htmlToText(card.description);
    // quick-260928-it1: list-level skip evidence -- sourceUrl is the card's
    // own detail URL when a slug exists (the same URL a member could open
    // themselves), else the list request's own URL (ctx.sourceUrl).
    const listEvidence: SkipEvidence = {
      rawText: truncate(listText, RAW_TEXT_MAX_CHARS),
      sourceUrl: card.slug ? detailUrlFor(card.slug) : ctx.sourceUrl,
      expiresAt: null,
      partial: null,
    };

    const exclusion = classifyExclusion({ title: card.title, text: listText });
    if (exclusion) {
      skipped.push({ reason: exclusion, externalId: card.slug, title: card.title, evidence: listEvidence });
      continue;
    }

    if (!BOOST_BONUS_KEYWORD_RE.test(card.title) || !PERCENT_OR_DOLLAR_RE.test(card.title)) {
      skipped.push({ reason: "not_a_promo", externalId: card.slug, title: card.title, evidence: listEvidence });
      continue;
    }

    const titleSportHint = sportFromText(card.title);
    if (titleSportHint.kind === "unsupported") {
      skipped.push({ reason: "unsupported_sport", externalId: card.slug, title: card.title, evidence: listEvidence });
      continue;
    }

    if (!card.slug) {
      // A real single-game/sport-wide boost with no resolvable slug can't
      // be planned for a detail fetch or matched later -- never guessed.
      skipped.push({ reason: "not_a_promo", externalId: null, title: card.title, evidence: listEvidence });
      continue;
    }

    const detailBody = input.detailBodies[card.slug];
    const built = detailBody
      ? buildFromDetail(card, card.slug, detailBody)
      : buildFromListFallback(card, card.slug, titleSportHint);

    if (built.status === "skip") {
      skipped.push({ reason: built.reason, externalId: card.slug, title: card.title, evidence: built.evidence ?? listEvidence });
      continue;
    }

    const validated = ScrapedPromoSchema.safeParse(built.promo);
    if (!validated.success) {
      console.warn(
        `[ballybet] candidate failed ScrapedPromoSchema for "${card.title}" (${card.slug}):`,
        validated.error.issues,
      );
      skipped.push({
        reason: "schema_invalid",
        externalId: card.slug,
        title: card.title,
        evidence: { rawText: truncate(built.promo.rawText, RAW_TEXT_MAX_CHARS), sourceUrl: built.promo.sourceUrl, expiresAt: built.promo.expiresAt, partial: built.promo },
      });
      continue;
    }

    candidates.push(validated.data);
  }

  return { found: cards.length, candidates, skipped };
}

export const ballybetScraper: BookScraper = {
  bookKey: "ballybet",
  render: "http",
  stealth: false,
  sourceFormat: "json",
  maxDetailRequests: MAX_DETAIL_REQUESTS,
  listRequest: buildRequest(LIST_URL),
  planDetails: planBallybetDetails,
  parse: ballybetParse,
};
