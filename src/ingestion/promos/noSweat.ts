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

// A dollar amount: "$1,000", "$25", "$12.5". Group 1 = whole dollars (commas
// allowed only as real thousands separators), group 2 = optional cents.
const AMOUNT = String.raw`\$\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?![\d,]*\d)`;
const REFUND_NOUN = String.raw`(?:bonus bets?|free bets?|no[- ]sweat|refunds?|back)\b`;

/**
 * Refund-cap patterns in priority order (CR-01). Every pattern is tied to
 * refund wording -- there is deliberately NO bare "up to $N" pattern, because
 * "Bet up to $500 ... get a $25 bonus bet" would otherwise read the wager limit
 * as the refund. Within one tier, two different amounts are ambiguous and the
 * parser returns null so the promo goes to review instead of going live with a
 * guessed cap.
 */
const CAP_TIERS: RegExp[] = [
  // "MAX REWARD: $10", "Maximum refund $25"
  new RegExp(String.raw`\bmax(?:imum)?\.? (?:reward|refund|bonus bet):?\s*` + AMOUNT, "gi"),
  // "$25 bonus bet", "$1,000 in Bonus Bets", "up to $25 back", "$50 refund"
  new RegExp(AMOUNT + String.raw`\s+(?:in\s+|as\s+(?:an?\s+)?)?` + REFUND_NOUN, "gi"),
  // "get a bonus bet up to $25", "refunded up to $50"
  new RegExp(String.raw`\b(?:refund(?:ed)?|back|bonus bets?|free bets?)\b[^.\n$]{0,40}\bup to\s*` + AMOUNT, "gi"),
];

function amountOf(m: RegExpMatchArray): Decimal {
  const whole = m[1].replace(/,/g, "");
  return new Decimal(m[2] ? `${whole}.${m[2]}` : whole);
}

/**
 * Refund cap as a 2-decimal string, or null when absent / not positive /
 * ambiguous (several different amounts in the same tier).
 */
export function parseNoSweatRefundCap(text: string): string | null {
  for (const re of CAP_TIERS) {
    const values = [...text.matchAll(re)].map(amountOf);
    if (values.length === 0) continue;
    const first = values[0];
    if (values.some((v) => !v.eq(first))) return null;
    return first.gt(0) ? first.toFixed(2) : null;
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
  const form = refundFormOf(combined);
  if (form === "cash" || form === "mixed") return { kind: "cash_refund", refundCap };
  if (form === "bonus") return { kind: "bonus_bet_refund", refundCap };
  // No refund phrase states its form: fall back to the whole-text signals.
  if (CASH_REFUND_RE.test(combined) && !BONUS_REFUND_RE.test(combined)) {
    return { kind: "cash_refund", refundCap };
  }
  return { kind: "bonus_bet_refund", refundCap };
}

/**
 * WR-01: the refund form stated right next to the refund phrase ("stake back in
 * cash", "refunded as a Bonus Bet", "back in the form of a Bonus Bet"). A bonus
 * bet mentioned elsewhere ("Not valid with bonus bets") is not the refund form.
 * "cash" / "bonus" from the adjacent match(es); "mixed" when both forms are
 * stated (treated as cash -- never priced, goes to review, D-17); null when no
 * refund phrase states a form.
 */
const REFUND_FORM_RE =
  /\b(?:refund(?:ed)?|back|returned)\b[^.\n]{0,30}?\b(?:in|as)\s+(?:the form of\s+)?(?:an?\s+)?(cash|bonus bets?|free bets?|site credit|tokens?|crown cash|dk dollars)\b/gi;

function refundFormOf(text: string): "cash" | "bonus" | "mixed" | null {
  let cash = false;
  let bonus = false;
  for (const m of text.matchAll(REFUND_FORM_RE)) {
    if (m[1].toLowerCase() === "cash") cash = true;
    else bonus = true;
  }
  if (cash && bonus) return "mixed";
  if (cash) return "cash";
  if (bonus) return "bonus";
  return null;
}
