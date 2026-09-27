import { createHash } from "node:crypto";
import type { ScrapedPromo } from "./scraped";

/**
 * Stable dedupe key for a scraped promo (D-19). The same promo seen across
 * scrape runs must produce the same key so it doesn't duplicate; a changed
 * boost %, bonus amount or published price must produce a NEW key. Match
 * and scope fields (named teams, the event-start window, the sport hint,
 * ...) are deliberately NOT part of the key -- dedupe survives re-matching, so
 * the review-queue/matcher (Plan 08) can correct a promo's match without
 * spawning a duplicate row.
 *
 * Identity when the book gives an externalId: bookKey + promoType + the
 * money/price fields + externalId. Identity when it doesn't: the same
 * fields plus a normalized (trimmed, whitespace-collapsed, lowercased)
 * rawText, so cosmetic wording tweaks between runs don't duplicate.
 */
export function promoDedupeKey(p: ScrapedPromo): string {
  const identityPart =
    p.externalId !== null ? p.externalId : p.rawText.trim().replace(/\s+/g, " ").toLowerCase();

  const parts = [
    p.bookKey,
    p.promoType,
    p.boostPercent ?? "",
    p.boostedOddsAmerican !== null ? String(p.boostedOddsAmerican) : "",
    p.bonusAmount ?? "",
    identityPart,
  ];

  return createHash("sha256").update(parts.join("|")).digest("hex");
}
