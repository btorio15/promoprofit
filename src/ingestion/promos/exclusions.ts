import type { SkipReason } from "@/domain/promos/scraped";

/**
 * D-15 exclusion classification (03-RECON.md Design Implications 3, and
 * each book's own "Exclusion rules" row in the Scraper Contract). Checks
 * run in priority order -- category/new-customer wording is checked before
 * bet-type restrictions, since a new-customer promo's terms may also
 * happen to mention Parlay/SGP incidentally. A boost whose eligible bet
 * types include Single or "any wager" is always kept (returns null) even
 * when Parlay/SGP is also listed, per Design Implication 3.
 */

const NEW_CUSTOMER_CATEGORY_RE = /^new customers?$/i;
const NEW_CUSTOMER_TEXT_RE = /\bnew (?:customers?|users?)\b|\bfirst[- ]bet\b|\bsign[- ]up\b/i;
const DEPOSIT_RE = /\bdeposit bonus\b|\bdeposit match\b/i;

const NOT_A_PROMO_RE =
  /\bpick\s*'?em\b|\bsweepstakes?\b|\bgiveaway\b|\brefer[- ]a[- ]friend\b|\bbet protect\b|\blink your account\b|\baccount linking\b/i;

// Bally Bet's own title wording is just "Live Wager Profit Boost" (no
// trailing "Only") while its detail bullet says "Live Wagers Only" -- both
// must classify the same way (03-RECON.md Observed Promos row 3), so this
// matches bare "live wager(s)" as well as the "... only" phrasing.
const LIVE_ONLY_RE = /\blive[- ]wagers?\b|\blive[- ]only\b/i;

const FUTURES_RE = /\bfutures?\b|\bchampion\b|\bto win the\b/i;
const OUTRIGHT_RE =
  /\bpresidents cup\b|\bmasters\b|\b(?:the\s+)?open\b|\btournament winner\b|\boutright\b/i;

const PROP_RE = /\bscorer\b|\bplayer prop\b|\banytime touchdown\b/i;

const SGP_RE = /\bsgp\s*\(?x?\)?\b|\bsame game parlay\b/i;
const PARLAY_RE = /\bparlay\b/i;

const HAS_SINGLE_OR_ANY_WAGER_RE = /\bsingle\b|\bany wager\b/i;
const RESTRICTS_TO_PARLAY_SGP_RE = /\b(?:parlay|sgp\s*\(?x?\)?)\b/i;

export function classifyExclusion(input: {
  title: string;
  text: string;
  category?: string | null;
}): SkipReason | null {
  const { title, text, category } = input;
  const combined = `${title}\n${text}`;

  if (category && NEW_CUSTOMER_CATEGORY_RE.test(category.trim())) return "new_customer";
  if (NEW_CUSTOMER_TEXT_RE.test(combined)) return "new_customer";
  if (DEPOSIT_RE.test(combined)) return "deposit";

  if (NOT_A_PROMO_RE.test(combined)) return "not_a_promo";

  if (LIVE_ONLY_RE.test(combined)) return "live_only";

  // Title-level parlay/SGP wording always excludes, regardless of what
  // else the title mentions (a title like "... SGP Profit Boost", or a
  // parlay themed around a scorer prop like "TD Scorer Parlay Profit
  // Boost", IS the SGP/Parlay promo -- checked before the generic
  // futures/outright/prop wording below so it takes priority).
  if (SGP_RE.test(title)) return "sgp";
  if (PARLAY_RE.test(title)) return "parlay";

  if (OUTRIGHT_RE.test(combined)) return "outright";
  if (FUTURES_RE.test(combined)) return "futures";

  if (PROP_RE.test(combined)) return "prop";

  // Otherwise, only exclude when the terms restrict eligible bet types to
  // Parlay/SGP with no "Single"/"any wager" escape hatch (D-15, keeps the
  // DraftKings "... Single, Parlay, SGP, or SGPx bet" case).
  if (RESTRICTS_TO_PARLAY_SGP_RE.test(text) && !HAS_SINGLE_OR_ANY_WAGER_RE.test(combined)) {
    return SGP_RE.test(text) ? "sgp" : "parlay";
  }

  return null;
}
