import { createHash } from "node:crypto";
import { z } from "zod";
import { SPORT_KEYS } from "@/config/sports";
import { SKIP_REASONS } from "@/domain/promos/scraped";

/**
 * quick-260928-kc5: schema/prompt/cache-key contract for the Claude Haiku 4.5
 * promo reader (PROMO-03). A second, independent reading of the same scraped
 * promo text, reconciled against the pattern parser's own result by
 * reconcile.ts and backed by verbatimGuard.ts so a hallucinated number can
 * never reach the app's money math.
 *
 * OD-1: the model id is exactly claude-haiku-4-5 -- never substitute another
 * model, and never append a date suffix.
 *
 * Bumping PROMO_READER_PROMPT_VERSION invalidates every cached reading (it
 * is part of readingCacheKey's hash) -- do this whenever the system prompt's
 * instructions change in a way that could change the model's output shape.
 */
export const PROMO_READER_MODEL = "claude-haiku-4-5";
export const PROMO_READER_PROMPT_VERSION = "2026-09-28.1";

/** SPORT_KEYS is a readonly string[] (built from SPORTS.map), not a literal
 * tuple -- cast once here so z.enum (which requires a non-empty tuple of
 * literal strings) can be built from it. */
const SPORT_KEY_TUPLE = SPORT_KEYS as unknown as [string, ...string[]];

/**
 * Strict (closed) schema for one structured-output reading. No .min/.max/
 * .length anywhere -- the Anthropic structured-output helper strips numeric/
 * length constraints from the JSON schema it builds, so every range/length
 * check lives client-side in verbatimGuard.ts/reconcile.ts instead. Money
 * fields stay plain decimal strings (no $, %, commas) per the system
 * prompt's own instructions; minOddsAmerican is the only true number.
 */
export const PromoReadingSchema = z.strictObject({
  kind: z.enum(["profit_boost", "bonus_bet", "not_usable"]),
  skipReason: z.enum(SKIP_REASONS).nullable(),
  boostPercent: z.string().nullable(),
  bonusAmount: z.string().nullable(),
  maxStake: z.string().nullable(),
  maxWinnings: z.string().nullable(),
  minOddsAmerican: z.number().int().nullable(),
  sport: z.enum(SPORT_KEY_TUPLE).nullable(),
  teams: z.array(z.string()),
  singleGame: z.boolean(),
  liveOnly: z.boolean(),
  parlayOrSgpOnly: z.boolean(),
  propOnly: z.boolean(),
  newCustomerOnly: z.boolean(),
  eventDateText: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.strictObject({
    boostPercent: z.string().nullable(),
    bonusAmount: z.string().nullable(),
    maxStake: z.string().nullable(),
    maxWinnings: z.string().nullable(),
    minOddsAmerican: z.string().nullable(),
  }),
});

export type PromoReading = z.infer<typeof PromoReadingSchema>;

const SPORT_LIST_TEXT = SPORT_KEYS.join(", ");
const SKIP_REASON_LIST_TEXT = SKIP_REASONS.join(", ");

/**
 * Long, stable system prompt (put first per the claude-api rules; no
 * cache_control). Interpolates the app's own sport/skip-reason vocabulary so
 * a config change (a new supported sport, a new skip reason) doesn't require
 * a hand-edited prompt string elsewhere.
 */
export const PROMO_READER_SYSTEM_PROMPT = `You read one promotion from a Colorado sportsbook and classify it, extracting its concrete numeric offer.

Supported sports (sport field values): ${SPORT_LIST_TEXT}. Use null when the promo is sport-wide across sports not in this list, or when no sport is stated.

Skip reasons (skipReason field values, use only one when kind is "not_usable"): ${SKIP_REASON_LIST_TEXT}.

Classification rules:
- Use "not_usable" for casino games, deposit match offers, new-customer/welcome offers, refer-a-friend, giveaways, pick'em contests, futures/outright bets, and any marketing copy with no concrete offer. Choose the closest skipReason from the list above.
- Use "profit_boost" for an offer that boosts winnings by a stated percent.
- Use "bonus_bet" for a stated-dollar bonus bet, free bet, or token the user already holds or will receive.

Number rules (these are the most important rules -- read them twice):
- Output a number ONLY when it is explicitly stated in the promo's own text. Never compute, convert, round, or infer a number that is not written down.
- Write every number as plain digits with no $, %, or commas (e.g. "50", not "50%" or "$50.00"). minOddsAmerican is the only field that is an actual number, and it is signed (e.g. -200, +150).
- For every non-null number you output, also copy its evidence: the shortest verbatim span of the original text (character-for-character, no paraphrasing) that contains that number, at most 80 characters. Use null for a field's evidence when the field itself is null.
- The evidence for boostPercent must include the "%" sign and the word "boost" (e.g. "Profit Boost: 50%").
- The evidence for bonusAmount, maxStake, and maxWinnings must include the "$" sign right before the number (e.g. "MAX $25 WAGER").
- The evidence for minOddsAmerican must include the signed odds as written (e.g. "-200 or longer").
- Never cite the exact same span of text as evidence for two different fields.

Other fields:
- Set liveOnly, parlayOrSgpOnly, propOnly, and newCustomerOnly to true only when the promo is restricted to exactly that bet type or audience; otherwise false.
- Set singleGame to true only when the promo names one specific game.
- Fill teams only when the promo names exactly one game, as the two team names appear in the text; otherwise an empty array.
- Set eventDateText to the date phrase exactly as written (e.g. "9/29/2026"), or null when no date is stated.
- Set confidence to "high" only when you are certain of the classification and every extracted number's evidence is airtight; "medium" when reasonably sure; "low" when guessing.

Read the promo text below and return the structured reading.`;

/**
 * The exact text sent to the model (and later guarded against by
 * verbatimGuard.ts). Joins title + rawText, trims each line, collapses runs
 * of spaces/tabs within a line to one space, and drops blank lines --
 * whitespace noise from the source HTML/JSON must never change what the
 * model reads or what the guard matches against.
 */
export function readerText(title: string, rawText: string): string {
  return `${title}\n${rawText}`
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * sha256 hex of [prompt version, model, book key, whitespace-normalized
 * text] -- changes whenever any of those four change, and is identical for
 * text that differs only in whitespace runs (so a cosmetic re-scrape of the
 * same promo is still a cache hit).
 */
export function readingCacheKey(bookKey: string, text: string): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const payload = [PROMO_READER_PROMPT_VERSION, PROMO_READER_MODEL, bookKey, normalizedText].join("\u0000");
  return createHash("sha256").update(payload).digest("hex");
}
