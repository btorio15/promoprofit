import type { ParseResult, ScrapedPromo, SkippedEntry } from "@/domain/promos/scraped";
import { readerText } from "./promoReading";
import type { PromoReader } from "./promoReader";
import { reconcileEntry, type ReconcileEntry, type ReconcileOutcome } from "./reconcile";
import { isReviewWorthySkip } from "./reviewTriage";
import { guardReading } from "./verbatimGuard";

/**
 * quick-260928-kc5: per-book promo-reader pass. Reads every scraped entry
 * (candidates first, then review-worthy skips, then the rest) through the
 * reader, guards and reconciles each reading, and returns a new ParseResult
 * plus stats for the run's outcome JSON. Never throws -- run.ts wraps the
 * call anyway (defense in depth), but every per-entry failure here already
 * degrades to that entry's pattern-parser result (OD-3).
 */
export interface ReaderBookStats {
  calls: number;
  cacheHits: number;
  fallbacks: number;
  disagreements: number;
  guardDrops: number;
  rescues: number;
  reviewRouted: number;
  skippedByReader: number;
  inputTokens: number;
  outputTokens: number;
}

function emptyStats(): ReaderBookStats {
  return {
    calls: 0,
    cacheHits: 0,
    fallbacks: 0,
    disagreements: 0,
    guardDrops: 0,
    rescues: 0,
    reviewRouted: 0,
    skippedByReader: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function textFor(entry: ReconcileEntry): string | null {
  if (entry.kind === "candidate") {
    return readerText(entry.candidate.title, entry.candidate.rawText);
  }
  if (!entry.skip.evidence) return null;
  return readerText(entry.skip.title, entry.skip.evidence.rawText);
}

function firstLine(text: string): string {
  const newlineIndex = text.indexOf("\n");
  return newlineIndex === -1 ? text : text.slice(0, newlineIndex);
}

function externalIdOf(entry: ReconcileEntry): string | null {
  return entry.kind === "candidate" ? entry.candidate.externalId : entry.skip.externalId;
}

function patternOnlyOutcome(entry: ReconcileEntry): ReconcileOutcome {
  return entry.kind === "candidate"
    ? { kind: "candidate", candidate: entry.candidate, via: "pattern_only" }
    : { kind: "skip", skip: entry.skip, via: "pattern_only" };
}

export async function applyPromoReader(input: {
  bookKey: string;
  parseResult: ParseResult;
  reader: PromoReader;
  fallbackSourceUrl: string;
}): Promise<{ parseResult: ParseResult; stats: ReaderBookStats }> {
  const { bookKey, parseResult, reader, fallbackSourceUrl } = input;
  const stats = emptyStats();

  const reviewWorthy = parseResult.skipped.filter(isReviewWorthySkip);
  const remaining = parseResult.skipped.filter((skip) => !isReviewWorthySkip(skip));

  const orderedEntries: ReconcileEntry[] = [
    ...parseResult.candidates.map((candidate): ReconcileEntry => ({ kind: "candidate", candidate })),
    ...reviewWorthy.map((skip): ReconcileEntry => ({ kind: "skip", skip })),
    ...remaining.map((skip): ReconcileEntry => ({ kind: "skip", skip })),
  ];

  const candidates: ScrapedPromo[] = [];
  const rescuedCandidates: ScrapedPromo[] = [];
  const skipped: SkippedEntry[] = [];

  function applyOutcome(entry: ReconcileEntry, outcome: ReconcileOutcome): void {
    if (outcome.kind === "candidate") {
      if (outcome.via === "rescued") {
        rescuedCandidates.push(outcome.candidate);
        stats.rescues++;
      } else {
        candidates.push(outcome.candidate);
      }
      return;
    }

    if (outcome.kind === "review") {
      stats.reviewRouted++;
      if (outcome.why === "disagreement" || outcome.why === "reader_not_usable") stats.disagreements++;
      skipped.push(outcome.skip);
      console.warn(
        `applyPromoReader: review routed for ${bookKey} ${externalIdOf(entry) ?? "(no id)"}: ${outcome.why} -- ${firstLine(outcome.skip.evidence?.rawText ?? "")}`,
      );
      if (entry.kind === "candidate") {
        // Known limitation (documented in the SUMMARY): a demoted candidate
        // whose dedupe key already has a live row is "touched" (kept live)
        // by store.ts, not re-queued -- only a first-seen promo actually
        // lands in the review queue's UI.
        console.warn(
          `applyPromoReader: ${bookKey} ${externalIdOf(entry) ?? "(no id)"} -- if this promo already has a live row, that row stays live (touched); only a first-seen promo lands in review.`,
        );
      }
      return;
    }

    // outcome.kind === "skip"
    if (outcome.via === "agree_not_usable") stats.skippedByReader++;
    skipped.push(outcome.skip);
  }

  for (const entry of orderedEntries) {
    try {
      const text = textFor(entry);
      if (text === null) {
        // A skip with no evidence is never read (pattern_only).
        if (entry.kind === "skip") skipped.push(entry.skip);
        continue;
      }

      const result = await reader.read({ bookKey, text });

      if (result.source === "fallback") {
        stats.fallbacks++;
        applyOutcome(entry, patternOnlyOutcome(entry));
        continue;
      }

      if (result.source === "cache") {
        stats.cacheHits++;
      } else {
        stats.calls++;
        stats.inputTokens += result.usage.inputTokens;
        stats.outputTokens += result.usage.outputTokens;
      }

      const guarded = guardReading(result.reading, text);
      if (guarded.droppedFields.length > 0) stats.guardDrops++;

      const outcome = reconcileEntry(bookKey, entry, guarded, fallbackSourceUrl);
      applyOutcome(entry, outcome);
    } catch (err) {
      stats.fallbacks++;
      console.warn(
        `applyPromoReader: entry failed for ${bookKey} ${externalIdOf(entry) ?? "(no id)"}, using pattern parser result:`,
        err instanceof Error ? err.message : err,
      );
      applyOutcome(entry, patternOnlyOutcome(entry));
    }
  }

  return {
    parseResult: { found: parseResult.found, candidates: [...candidates, ...rescuedCandidates], skipped },
    stats,
  };
}
