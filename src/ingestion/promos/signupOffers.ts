import Decimal from "decimal.js";
import { createHash } from "node:crypto";
import type { SkippedEntry } from "@/domain/promos/scraped";
import { mentionsNewCustomer } from "./exclusions";

/**
 * quick-260928-mgi (owner decision 3): pure, deterministic sign-up-offer
 * extractor. Turns a book's new_customer skips into SignupOfferInput rows
 * for signupStore.ts to persist -- never a DB call, never the network, never
 * the promo reader (money here is regex + decimal.js only, T-mgi-03).
 *
 * Referral offers are excluded (T-mgi guard): a refer-a-friend reward pays
 * an EXISTING customer for bringing someone in. A member who doesn't have
 * the book can't claim one themselves -- they'd need an existing customer at
 * that book to refer them -- so it is never a sign-up offer FOR the member,
 * even though the parser correctly tagged it new_customer.
 *
 * Headline-amount rule (parseSignupBonusAmount): the title is checked first
 * because the headline states the TOTAL bonus a new customer receives. DK's
 * "$150 in Bonus Bets, Paid Over 14 Days" is the total paid across
 * installments; FanDuel's title "Bet $5, Get $50 for 5 days" has no bonus
 * wording immediately after "$50" (it's followed by "for 5 days"), so the
 * title match fails and the body's "Get $250 in Bonus Bets guaranteed!"
 * wins -- $250 being the total of five $50 daily installments, consistent
 * with DK's own total-offer semantics.
 */

/** Public sportsbook origins (each scraper's own `referer` header) -- never
 * the scraped API sourceUrl, which would show a member raw JSON. */
export const SIGNUP_PAGE_URLS: Record<string, string> = {
  draftkings: "https://sportsbook.draftkings.com/",
  fanduel: "https://sportsbook.fanduel.com/",
  ballybet: "https://play.ballybet.com/",
};

export interface SignupOfferInput {
  bookKey: string;
  dedupeKey: string;
  externalId: string | null;
  title: string;
  description: string;
  /** <= 2000 chars. */
  rawText: string;
  bonusAmount: string | null;
  sourceUrl: string;
  expiresAt: string | null;
}

const RAW_TEXT_MAX_CHARS = 2000;
const TITLE_MAX_CHARS = 200;
const DESCRIPTION_MAX_CHARS = 280;

// Same refer-a-friend wording/lookahead exclusions.ts uses (DK's legal
// boilerplate "the refer-a-friend program" must never itself exclude), plus
// a whole-word "referral"/"referred" and "invite your friend(s)" -- FanDuel's
// own wording for its referral promo ("Invite your friends to join FanDuel
// from anywhere and earn Bonus Bets!").
const REFERRAL_RE = /\brefer[- ]a[- ]friend\b(?!\s+program)|\breferrals?\b|\breferred\b|\binvite\s+your\s+friends?\b/i;

/** DK's logged-out boilerplate -- the only new-customer signal on some
 * entries (e.g. "Daily Rewards Rocket Turbo!"), which is really an
 * existing-customer loyalty promo, not a sign-up offer. */
const DK_LOGIN_BOILERPLATE_RE = /please log in or sign up to view terms and conditions\.?/gi;

function hasDkBoilerplate(text: string): boolean {
  return new RegExp(DK_LOGIN_BOILERPLATE_RE.source, "i").test(text);
}

function stripDkBoilerplate(text: string): string {
  return text.replace(DK_LOGIN_BOILERPLATE_RE, "");
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildDescription(text: string): string {
  const collapsed = collapseWhitespace(text);
  if (collapsed.length <= DESCRIPTION_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, DESCRIPTION_MAX_CHARS - 1)}…`;
}

/**
 * "$" + amount (comma-grouped or plain, optional 2dp), then optional
 * whitespace, then an optional "in ", then "bonus"/"bonus bet"/"bonus bets",
 * case-insensitive, word-bounded. Deliberately looser than reviewTriage.ts's
 * DOLLAR_BONUS_BET_RE (which requires "bonus bets?") -- signup copy also
 * says bare "$50 bonus bet" or "$25.50 in bonus".
 */
const SIGNUP_DOLLAR_BONUS_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:in\s+)?bonus(?:\s+bets?)?\b/gi;

/** Largest "$N ... bonus" match in `text`, or null when there's none. Never
 * a JS number -- comma-stripped and compared via decimal.js. */
function largestDollarBonusMatch(text: string): Decimal | null {
  const re = new RegExp(SIGNUP_DOLLAR_BONUS_RE.source, SIGNUP_DOLLAR_BONUS_RE.flags);
  let best: Decimal | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = new Decimal(match[1].replace(/,/g, ""));
    if (best === null || value.greaterThan(best)) best = value;
  }
  return best;
}

/**
 * Deterministic only -- never the reader for money (T-mgi-03). Searches the
 * title first; any title match wins outright (even over a larger body
 * match, per the headline-amount rule above). Falls back to the largest
 * match in `body` when the title has none. Null when neither has one.
 */
export function parseSignupBonusAmount(title: string, body: string): string | null {
  const titleMatch = largestDollarBonusMatch(title);
  if (titleMatch !== null) return titleMatch.toFixed(2);

  const bodyMatch = largestDollarBonusMatch(body);
  return bodyMatch !== null ? bodyMatch.toFixed(2) : null;
}

/**
 * "signup:{bookKey}:{externalId}" when the book gave one; otherwise a stable
 * "signup:{bookKey}:t:" plus a 16-hex sha256 of the whitespace-collapsed,
 * lowercased title (mirrors promoDedupeKey's no-externalId fallback shape).
 */
export function signupDedupeKey(bookKey: string, externalId: string | null, title: string): string {
  if (externalId !== null) return `signup:${bookKey}:${externalId}`;
  const normalized = collapseWhitespace(title).toLowerCase();
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  return `signup:${bookKey}:t:${hash}`;
}

export interface ExtractSignupOffersResult {
  offers: SignupOfferInput[];
  referralsExcluded: number;
  notSignup: number;
}

/**
 * Considers only reason === "new_customer" entries that carry evidence.
 * Referral offers are excluded first (T-mgi guard, doc comment above); an
 * unknown book key (SIGNUP_PAGE_URLS has no entry) is skipped and counted as
 * notSignup, since there is nowhere safe to link a member; DK's boilerplate-
 * only false positives (the entry's only new-customer signal is the generic
 * logged-out terms line) are stripped and re-checked, counted as notSignup
 * when nothing new-customer-shaped remains. Duplicate dedupeKeys within one
 * call collapse to the first offer seen.
 */
export function extractSignupOffers(
  bookKey: string,
  skipped: readonly SkippedEntry[],
): ExtractSignupOffersResult {
  const pageUrl = SIGNUP_PAGE_URLS[bookKey];
  let referralsExcluded = 0;
  let notSignup = 0;
  const byKey = new Map<string, SignupOfferInput>();

  for (const skip of skipped) {
    if (skip.reason !== "new_customer") continue;
    if (!skip.evidence) continue;

    const title = truncate(skip.title, TITLE_MAX_CHARS);
    const rawText = truncate(skip.evidence.rawText, RAW_TEXT_MAX_CHARS);
    const combined = `${title}\n${rawText}`;

    if (REFERRAL_RE.test(combined)) {
      referralsExcluded++;
      continue;
    }

    if (pageUrl === undefined) {
      notSignup++;
      continue;
    }

    let effectiveText = rawText;
    if (hasDkBoilerplate(rawText)) {
      const stripped = stripDkBoilerplate(rawText);
      if (!mentionsNewCustomer(`${title}\n${stripped}`)) {
        notSignup++;
        continue;
      }
      effectiveText = stripped;
    }

    const dedupeKey = signupDedupeKey(bookKey, skip.externalId, title);
    if (byKey.has(dedupeKey)) continue;

    const offer: SignupOfferInput = {
      bookKey,
      dedupeKey,
      externalId: skip.externalId,
      title,
      description: buildDescription(effectiveText),
      rawText,
      bonusAmount: parseSignupBonusAmount(title, rawText),
      sourceUrl: pageUrl,
      expiresAt: skip.evidence.expiresAt,
    };
    byKey.set(dedupeKey, offer);
  }

  return { offers: [...byKey.values()], referralsExcluded, notSignup };
}
