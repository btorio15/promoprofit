import Decimal from "decimal.js";

/**
 * Phase 9 (FEED-01, A-06, D-16, D-17): no-sweat detection. A no-sweat refunds a
 * losing stake -- as a bonus bet (priceable) or as cash (never priced, goes to
 * review). Pure; no I/O.
 *
 * IMPORTANT: callers must call this ONLY after `classifyExclusion` returned
 * null, so parlay / SGP / new-customer / live / prop / futures no-sweats are
 * already skipped (exclusions run first).
 */
export type NoSweatDetection =
  | { kind: "none" }
  | { kind: "bonus_bet_refund"; refundCap: string | null }
  | { kind: "cash_refund"; refundCap: string | null };

const NO_SWEAT_TITLE_RE =
  /\bno[- ]sweat\b|\bbet back\b|\bsecond chance\b|\bmoney back\b|\b(?:stake|bet) back\b/i;
const REFUND_IF_LOSES_RE =
  /\bif your (?:qualifying )?(?:bet|wager|stake) (?:loses|lost)\b|\brefund(?:ed)? (?:of|if) your (?:bet|stake|wager)\b|\b(?:stake|bet|money) back\b/i;
const PERCENT_BOOST_TITLE_RE = /\d+(?:\.\d+)?\s*%\s*(?:profit\s+|odds\s+)?boost/i;

const CASH_REFUND_RE = /\b(?:in|as) cash\b|\bcash back\b|\bwithdrawable\b|\breal money\b/i;
const BONUS_REFUND_RE =
  /\bbonus bets?\b|\bfree bets?\b|\bsite credit\b|\btokens?\b|\bcrown cash\b|\bdk dollars\b/i;

const CAP_PATTERNS: RegExp[] = [
  /max(?:imum)? reward:?\s*\$(\d+(?:\.\d{1,2})?)/i,
  /up to \$(\d+(?:\.\d{1,2})?)/i,
  /\$(\d+(?:\.\d{1,2})?)\s+(?:bonus bet|no[- ]sweat|refund)/i,
];

/** Refund cap as a 2-decimal string, or null when absent / not positive. */
export function parseNoSweatRefundCap(text: string): string | null {
  for (const re of CAP_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const value = new Decimal(m[1]);
    return value.gt(0) ? value.toFixed(2) : null;
  }
  return null;
}

export function classifyNoSweat(input: {
  title: string;
  text: string;
  category?: string | null;
}): NoSweatDetection {
  const { title, text, category } = input;
  const combined = `${title}\n${text}`;
  const refundIfLoses = REFUND_IF_LOSES_RE.test(text);

  if (PERCENT_BOOST_TITLE_RE.test(title) && !refundIfLoses) return { kind: "none" };

  const titleMatch = NO_SWEAT_TITLE_RE.test(title) || (!!category && NO_SWEAT_TITLE_RE.test(category));
  const detected =
    (titleMatch && (REFUND_IF_LOSES_RE.test(combined) || BONUS_REFUND_RE.test(combined))) || refundIfLoses;
  if (!detected) return { kind: "none" };

  const refundCap = parseNoSweatRefundCap(combined);
  if (CASH_REFUND_RE.test(combined) && !BONUS_REFUND_RE.test(combined)) {
    return { kind: "cash_refund", refundCap };
  }
  return { kind: "bonus_bet_refund", refundCap };
}
