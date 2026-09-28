import Decimal from "decimal.js";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import { ScrapedPromoSchema, type ScrapedPromo, type SkippedEntry } from "@/domain/promos/scraped";
import type { CapField, PromoType } from "@/domain/promos/types";
import { buildClassifyDraft, CLEAR_SKIP_REASONS, REVIEW_SKIP_REASONS } from "./reviewTriage";
import type { GuardedReading } from "./verbatimGuard";

/**
 * quick-260928-kc5: pure module reconciling the pattern parser's own result
 * for one scraped entry against the guarded reader reading. Never imports
 * the SDK or touches the network -- readerPass.ts is the only caller.
 */

export type ReconcileEntry = { kind: "candidate"; candidate: ScrapedPromo } | { kind: "skip"; skip: SkippedEntry };

export type ReconcileOutcome =
  | { kind: "candidate"; candidate: ScrapedPromo; via: "agree" | "merged" | "rescued" | "pattern_only" }
  | {
      kind: "review";
      skip: SkippedEntry;
      why: "disagreement" | "guard_drop" | "reader_not_usable" | "rescue_needs_review" | "clear_reason_conflict";
    }
  | { kind: "skip"; skip: SkippedEntry; via: "agree_not_usable" | "pattern_only" };

const RAW_TEXT_MAX_CHARS = 2000;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** A reader reading is usable when it names a real offer with no restriction that rules the promo out entirely. */
function isUsable(reading: GuardedReading): boolean {
  return (
    reading.kind !== "not_usable" &&
    !reading.liveOnly &&
    !reading.parlayOrSgpOnly &&
    !reading.propOnly &&
    !reading.newCustomerOnly
  );
}

/** True only when both sides are non-null and differ -- one side unknown is never a disagreement. */
function moneyDiffers(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return !new Decimal(a).equals(new Decimal(b));
}

function intDiffers(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  return a !== b;
}

function originalTextOf(entry: ReconcileEntry): string {
  return entry.kind === "candidate" ? entry.candidate.rawText : (entry.skip.evidence?.rawText ?? "");
}

function fmtParserEntry(entry: ReconcileEntry): string {
  if (entry.kind === "skip") {
    return `skipped: ${entry.skip.reason}`;
  }
  const c = entry.candidate;
  return `${c.promoType}, boost ${c.boostPercent ?? "null"}%, bonus $${c.bonusAmount ?? "null"}, max stake $${c.maxStake ?? "null"}, max winnings $${c.maxWinnings?.amount ?? "null"}, min odds ${c.minOddsAmerican ?? "null"}`;
}

function fmtReader(reading: GuardedReading): string {
  return `${reading.kind}, boost ${reading.boostPercent ?? "null"}%, bonus $${reading.bonusAmount ?? "null"}, max stake $${reading.maxStake ?? "null"}, max winnings $${reading.maxWinnings ?? "null"}, min odds ${reading.minOddsAmerican ?? "null"}, sport ${reading.sport ?? "null"}, teams ${reading.teams.length > 0 ? reading.teams.join("/") : "none"}, event ${reading.eventDateText ?? "null"}`;
}

type ReviewWhy = "disagreement" | "guard_drop" | "reader_not_usable" | "rescue_needs_review" | "clear_reason_conflict";

function buildSummaryLine(why: ReviewWhy, entry: ReconcileEntry, reading: GuardedReading): string {
  const dropped = reading.droppedFields.length > 0 ? reading.droppedFields.join(", ") : "none";
  return `[Promo reader check: ${why}] parser: ${fmtParserEntry(entry)} | reader (${reading.confidence}): ${fmtReader(reading)} | dropped: ${dropped}`;
}

function buildReviewSkip(
  entry: ReconcileEntry,
  reading: GuardedReading,
  why: ReviewWhy,
  opts: { partial: Partial<ScrapedPromo> | null; dedupeKey?: string },
  fallbackSourceUrl: string,
): SkippedEntry {
  const summary = buildSummaryLine(why, entry, reading);
  const rawText = truncate(`${summary}\n${originalTextOf(entry)}`, RAW_TEXT_MAX_CHARS);

  const externalId = entry.kind === "candidate" ? entry.candidate.externalId : entry.skip.externalId;
  const title = entry.kind === "candidate" ? entry.candidate.title : entry.skip.title;
  const sourceUrl =
    entry.kind === "candidate" ? entry.candidate.sourceUrl : (entry.skip.evidence?.sourceUrl ?? fallbackSourceUrl);
  const expiresAt = entry.kind === "candidate" ? entry.candidate.expiresAt : (entry.skip.evidence?.expiresAt ?? null);

  return {
    reason: "unrecognized",
    externalId,
    title,
    evidence: {
      rawText,
      sourceUrl,
      expiresAt,
      partial: opts.partial,
      ...(opts.dedupeKey !== undefined ? { dedupeKey: opts.dedupeKey } : {}),
    },
  };
}

/**
 * Rule order (candidate entry): reader unusable -> guard drops -> promoType/
 * money disagreement -> otherwise fill nulls from the reader and try a
 * schema-validated merge. A pattern-kept candidate can only ever be demoted
 * to human review here, never dropped outright (T-kc5-02).
 */
function reconcileCandidate(
  entry: { kind: "candidate"; candidate: ScrapedPromo },
  reading: GuardedReading,
  fallbackSourceUrl: string,
): ReconcileOutcome {
  const candidate = entry.candidate;

  if (!isUsable(reading)) {
    return {
      kind: "review",
      skip: buildReviewSkip(entry, reading, "reader_not_usable", { partial: candidate, dedupeKey: promoDedupeKey(candidate) }, fallbackSourceUrl),
      why: "reader_not_usable",
    };
  }

  if (reading.droppedFields.length > 0) {
    return {
      kind: "review",
      skip: buildReviewSkip(entry, reading, "guard_drop", { partial: candidate, dedupeKey: promoDedupeKey(candidate) }, fallbackSourceUrl),
      why: "guard_drop",
    };
  }

  const disagrees =
    (reading.kind as PromoType) !== candidate.promoType ||
    moneyDiffers(candidate.boostPercent, reading.boostPercent) ||
    moneyDiffers(candidate.bonusAmount, reading.bonusAmount) ||
    moneyDiffers(candidate.maxStake, reading.maxStake) ||
    moneyDiffers(candidate.maxWinnings?.amount ?? null, reading.maxWinnings) ||
    intDiffers(candidate.minOddsAmerican, reading.minOddsAmerican);

  if (disagrees) {
    return {
      kind: "review",
      skip: buildReviewSkip(entry, reading, "disagreement", { partial: candidate, dedupeKey: promoDedupeKey(candidate) }, fallbackSourceUrl),
      why: "disagreement",
    };
  }

  const merged: ScrapedPromo = { ...candidate, unparsedCapFields: [...candidate.unparsedCapFields] };
  const unparsed = new Set<CapField>(candidate.unparsedCapFields);
  let filled = false;

  if (merged.maxStake === null && reading.maxStake !== null) {
    merged.maxStake = reading.maxStake;
    unparsed.delete("maxStake");
    filled = true;
  }
  if (merged.minOddsAmerican === null && reading.minOddsAmerican !== null) {
    merged.minOddsAmerican = reading.minOddsAmerican;
    unparsed.delete("minOdds");
    filled = true;
  }
  if (merged.bonusAmount === null && reading.bonusAmount !== null) {
    merged.bonusAmount = reading.bonusAmount;
    filled = true;
  }
  if (merged.maxWinnings === null && reading.maxWinnings !== null && candidate.winningsCapKind) {
    merged.maxWinnings = { amount: reading.maxWinnings, kind: candidate.winningsCapKind };
    unparsed.delete("maxWinnings");
    filled = true;
  }
  merged.unparsedCapFields = [...unparsed];

  if (filled) {
    const validated = ScrapedPromoSchema.safeParse(merged);
    if (validated.success) {
      return { kind: "candidate", candidate: validated.data, via: "merged" };
    }
  }

  return { kind: "candidate", candidate, via: "agree" };
}

/**
 * Rule order (skip entry): unusable -> agree_not_usable (with a possible
 * CLEAR_SKIP_REASONS reason swap) or leave untouched; usable -> a positive
 * parser exclusion (CLEAR_SKIP_REASONS) is never auto-rescued
 * (clear_reason_conflict, planner discretion); an uncertain reason gets a
 * rescue attempt via buildClassifyDraft + overlay, gated on high confidence,
 * a clean guard, valid team count, and a full ScrapedPromoSchema pass.
 */
function reconcileSkip(
  bookKey: string,
  entry: { kind: "skip"; skip: SkippedEntry },
  reading: GuardedReading,
  fallbackSourceUrl: string,
): ReconcileOutcome {
  const skip = entry.skip;

  if (!isUsable(reading)) {
    const patternIsClear = CLEAR_SKIP_REASONS.has(skip.reason) || skip.reason === "not_a_promo";
    if (patternIsClear && reading.confidence !== "low") {
      let updatedSkip = skip;
      if (REVIEW_SKIP_REASONS.has(skip.reason) && reading.skipReason !== null && CLEAR_SKIP_REASONS.has(reading.skipReason)) {
        updatedSkip = { ...skip, reason: reading.skipReason };
      }
      return { kind: "skip", skip: updatedSkip, via: "agree_not_usable" };
    }
    return { kind: "skip", skip, via: "pattern_only" };
  }

  if (CLEAR_SKIP_REASONS.has(skip.reason)) {
    return {
      kind: "review",
      skip: buildReviewSkip(entry, reading, "clear_reason_conflict", { partial: null }, fallbackSourceUrl),
      why: "clear_reason_conflict",
    };
  }

  // Uncertain reason (REVIEW_SKIP_REASONS or not_a_promo): attempt a rescue.
  const draft = buildClassifyDraft(bookKey, skip, fallbackSourceUrl);
  const overlaid: ScrapedPromo = { ...draft };

  overlaid.promoType = reading.kind as PromoType;
  overlaid.boostPercent = reading.kind === "profit_boost" ? reading.boostPercent : null;
  overlaid.bonusAmount = reading.kind === "bonus_bet" ? reading.bonusAmount : null;
  overlaid.maxStake = reading.maxStake;
  overlaid.minOddsAmerican = reading.minOddsAmerican;
  if (draft.winningsCapKind) {
    overlaid.maxWinnings = reading.maxWinnings !== null ? { amount: reading.maxWinnings, kind: draft.winningsCapKind } : draft.maxWinnings;
  }
  overlaid.sportKeyHint = reading.sport;
  if (reading.teams.length === 0 || reading.teams.length === 2) {
    overlaid.teamsText = reading.teams;
  }

  const unparsed = new Set<CapField>(overlaid.unparsedCapFields);
  if (overlaid.promoType === "profit_boost" && overlaid.maxStake === null) {
    unparsed.add("maxStake");
  }
  overlaid.unparsedCapFields = [...unparsed];

  const teamsOk = reading.teams.length === 0 || reading.teams.length === 2;
  const sportOrTeams = reading.sport !== null || reading.teams.length === 2;

  if (reading.confidence === "high" && reading.droppedFields.length === 0 && teamsOk && sportOrTeams) {
    const validated = ScrapedPromoSchema.safeParse(overlaid);
    if (validated.success) {
      return { kind: "candidate", candidate: validated.data, via: "rescued" };
    }
  }

  return {
    kind: "review",
    skip: buildReviewSkip(entry, reading, "rescue_needs_review", { partial: overlaid }, fallbackSourceUrl),
    why: "rescue_needs_review",
  };
}

/**
 * Reconciles one scraped entry's pattern-parser result against a guarded
 * reader reading (or null, when the reader made no reading for this entry --
 * disabled, fallback, or a skip with no evidence). Pure; never touches the
 * network or the DB.
 */
export function reconcileEntry(
  bookKey: string,
  entry: ReconcileEntry,
  reading: GuardedReading | null,
  fallbackSourceUrl: string,
): ReconcileOutcome {
  if (reading === null) {
    return entry.kind === "candidate"
      ? { kind: "candidate", candidate: entry.candidate, via: "pattern_only" }
      : { kind: "skip", skip: entry.skip, via: "pattern_only" };
  }

  return entry.kind === "candidate"
    ? reconcileCandidate(entry, reading, fallbackSourceUrl)
    : reconcileSkip(bookKey, entry, reading, fallbackSourceUrl);
}
