/**
 * Per-book promo scrape orchestrator (PROMO-03; D-06, D-08, D-09, Design
 * Implication 7; quick-260928-it1; quick-260928-kc5). Runs
 * SCRAPE_TARGET_BOOK_KEYS sequentially, one book at a time, each in its own
 * try/catch so one book's exception, timeout, or malformed JSON can never
 * stop another book's run or corrupt its status (D-08). Every HTTP request
 * across the whole run (list + detail, across every book) is spaced at least
 * `minGapMs` apart -- polite cadence, not just "polite per book" (Design
 * Implication 7, PITFALLS Pitfall 8).
 *
 * quick-260928-kc5: when `opts.reader` is set, applyPromoReader runs after a
 * successful parse and before every later use of parseResult -- its own
 * try/catch means a reader-pass exception degrades to the unmodified pattern
 * parser result for that book, never fails the run (OD-3).
 */
import type { OddsEvent } from "@/domain/odds/schemas";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import { matchPromo } from "@/domain/promos/matcher";
import type { BookScraper, HttpRequestSpec, SkippedEntry } from "@/domain/promos/scraped";
import { SCRAPE_TARGET_BOOK_KEYS } from "@/config/scrapeTargets";
import { getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { buildClassifyDraft, isReviewWorthySkip } from "./reviewTriage";
import { fetchRequest, type FetchRequest } from "./fetchPage";
import type { PromoReader } from "./promoReader";
import { applyPromoReader, type ReaderBookStats } from "./readerPass";
import { extractSignupOffers, type SignupOfferInput } from "./signupOffers";
import { promoStore, type ClassifyWrite, type PromoStore, type PromoWrite, type ScrapeRunRow } from "./store";
import { BOOK_SCRAPERS } from "./books";

export type LoadPromoMatchEvents = () => Promise<{ moneyline: OddsEvent[]; extended: OddsEvent[] }>;

/** Default loadEvents: the same live cache Plan 04's ranker reads, in parallel, zero Odds API credits (D-07). */
async function defaultLoadEvents(): Promise<{ moneyline: OddsEvent[]; extended: OddsEvent[] }> {
  const [moneyline, extended] = await Promise.all([getCachedEvents(), getCachedExtendedEvents()]);
  return { moneyline: moneyline.events, extended: extended.events };
}

export interface BookRunOutcome {
  bookKey: string;
  status: "ok" | "failed";
  promosFound: number;
  promosKept: number;
  detailRequests: number;
  detailFailures: number;
  skippedByReason: Record<string, number>;
  /** quick-260928-it1: count of classify writes committed (or attempted, for a book whose only skips are review-worthy). */
  sentToReview: number;
  errorMessage: string | null;
  /** quick-260928-kc5: present only on an "ok" outcome when a reader was configured for this run. */
  reader?: ReaderBookStats;
  /**
   * quick-260928-mgi: present only on an "ok" outcome -- a failed book run
   * never touches sign-up offers at all. upserted/expired are the parser's
   * own attempted counts (offers.length / null) when commitSignupOffers
   * itself never ran or rejected (commitSignupOffersSafely), so a DB write
   * failure is visible without ever failing the book.
   */
  signup?: { offers: number; referralsExcluded: number; notSignup: number; upserted: number | null; expired: number | null };
}

/** Design Implication 7: a handful of requests per book, >= 2s apart. */
const DEFAULT_MIN_GAP_MS = 2000;
const ERROR_MESSAGE_MAX_CHARS = 300;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Never surface a raw error unbounded -- truncated, and never echoes env values (the scraper never reads one anyway). */
function errorMessageFrom(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > ERROR_MESSAGE_MAX_CHARS ? message.slice(0, ERROR_MESSAGE_MAX_CHARS) : message;
}

function emptyOutcome(bookKey: string, errorMessage: string): BookRunOutcome {
  return {
    bookKey,
    status: "failed",
    promosFound: 0,
    promosKept: 0,
    detailRequests: 0,
    detailFailures: 0,
    skippedByReason: {},
    sentToReview: 0,
    errorMessage,
  };
}

/** recordScrapeRun failing must never mask the outcome this function already computed. */
async function safeRecordScrapeRun(store: PromoStore, row: ScrapeRunRow): Promise<void> {
  try {
    await store.recordScrapeRun(row);
  } catch (err) {
    console.error(`runPromoScrape: recordScrapeRun failed for ${row.bookKey}:`, err);
  }
}

/**
 * quick-260928-mgi (T-mgi-06): a sign-up write failure (e.g. before
 * migration 0008 is applied) must never fail the book. Returns null on
 * error, after logging a truncated warning -- the caller reports this in the
 * outcome's `signup.upserted`/`expired` fields as null rather than crashing.
 */
async function commitSignupOffersSafely(
  store: PromoStore,
  bookKey: string,
  offers: SignupOfferInput[],
  now: Date,
): Promise<{ upserted: number; expired: number } | null> {
  try {
    return await store.commitSignupOffers(bookKey, offers, now);
  } catch (err) {
    console.warn(`runPromoScrape: commitSignupOffers failed for ${bookKey}: ${errorMessageFrom(err)}`);
    return null;
  }
}

function skippedByReasonOf(skipped: readonly SkippedEntry[]): Record<string, number> {
  const skippedByReason: Record<string, number> = {};
  for (const skip of skipped) {
    skippedByReason[skip.reason] = (skippedByReason[skip.reason] ?? 0) + 1;
  }
  return skippedByReason;
}

/**
 * quick-260928-it1: builds this book's classify writes from its review-worthy
 * skips (reviewTriage.ts), dropping any draft whose dedupe key collides with
 * a candidate write (the candidate always wins) or with another classify
 * draft (the Map naturally collapses duplicates to one write, same as the
 * candidate dedupe below).
 */
function buildClassifyWrites(
  bookKey: string,
  skipped: readonly SkippedEntry[],
  fallbackSourceUrl: string,
  candidateDedupeKeys: ReadonlySet<string>,
): ClassifyWrite[] {
  const classifyByKey = new Map<string, ClassifyWrite>();
  for (const skip of skipped.filter(isReviewWorthySkip)) {
    const draft = buildClassifyDraft(bookKey, skip, fallbackSourceUrl);
    // quick-260928-kc5: a demoted candidate carries its own dedupe key
    // (reconcile.ts) so this write touches that candidate's existing live
    // row instead of expiring it or creating a duplicate.
    const dedupeKey = skip.evidence?.dedupeKey ?? promoDedupeKey(draft);
    if (candidateDedupeKeys.has(dedupeKey)) continue;
    classifyByKey.set(dedupeKey, { dedupeKey, draft });
  }
  return [...classifyByKey.values()];
}

export async function runPromoScrape(opts?: {
  now?: Date;
  targets?: readonly string[];
  fetch?: FetchRequest;
  store?: PromoStore;
  scrapers?: Readonly<Record<string, BookScraper>>;
  sleep?: (ms: number) => Promise<void>;
  minGapMs?: number;
  loadEvents?: LoadPromoMatchEvents;
  /** quick-260928-kc5: no reader by default -- every existing test/caller behaves exactly as today. */
  reader?: PromoReader | null;
}): Promise<BookRunOutcome[]> {
  const now = opts?.now ?? new Date();
  const targets = opts?.targets ?? SCRAPE_TARGET_BOOK_KEYS;
  const fetchFn = opts?.fetch ?? fetchRequest;
  const store = opts?.store ?? promoStore;
  const scrapers = opts?.scrapers ?? BOOK_SCRAPERS;
  const sleep = opts?.sleep ?? defaultSleep;
  const minGapMs = opts?.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const loadEventsFn = opts?.loadEvents ?? defaultLoadEvents;
  const reader = opts?.reader ?? null;

  const outcomes: BookRunOutcome[] = [];

  // Loaded lazily, once for the whole run (not per book), and only when at
  // least one book successfully parses at least one CANDIDATE (found > 0 with
  // candidates.length > 0) -- matchPromo spends no Odds API credits itself
  // (D-07), it just reads whatever's already cached, and a book with only
  // classify drafts never needs match events at all (a classify row is never
  // matched).
  let eventsPromise: ReturnType<LoadPromoMatchEvents> | null = null;
  function getMatchEventsOnce(): ReturnType<LoadPromoMatchEvents> {
    if (eventsPromise === null) {
      // WR-09: never memoize a rejection -- one transient cache-read failure
      // must fail only the current book, and the next book retries.
      eventsPromise = loadEventsFn().catch((err: unknown) => {
        eventsPromise = null;
        throw err;
      });
    }
    return eventsPromise;
  }

  // Shared across every book in the run -- the gap must hold between the
  // last request of one book and the first request of the next, too.
  let requestCount = 0;
  async function politeFetch(req: HttpRequestSpec) {
    if (requestCount > 0) {
      await sleep(minGapMs);
    }
    requestCount++;
    return fetchFn(req);
  }

  for (const bookKey of targets) {
    try {
      const scraper = scrapers[bookKey];
      if (!scraper) {
        const outcome = emptyOutcome(bookKey, "no scraper registered");
        outcomes.push(outcome);
        await safeRecordScrapeRun(store, {
          bookKey,
          ranAt: now,
          status: "failed",
          promosFound: 0,
          promosKept: 0,
          errorMessage: outcome.errorMessage,
        });
        continue;
      }

      const listResult = await politeFetch(scraper.listRequest);
      if (!listResult.ok) {
        const outcome = emptyOutcome(bookKey, listResult.reason);
        outcomes.push(outcome);
        await safeRecordScrapeRun(store, {
          bookKey,
          ranAt: now,
          status: "failed",
          promosFound: 0,
          promosKept: 0,
          errorMessage: outcome.errorMessage,
        });
        continue;
      }

      const plans = scraper.planDetails(listResult.body).slice(0, scraper.maxDetailRequests);
      const detailBodies: Record<string, string> = {};
      let detailFailures = 0;

      for (const plan of plans) {
        const detailResult = await politeFetch(plan.request);
        if (detailResult.ok) {
          detailBodies[plan.entryKey] = detailResult.body;
        } else {
          detailFailures++;
        }
      }

      let parseResult;
      try {
        parseResult = scraper.parse(
          { listBody: listResult.body, detailBodies },
          { now, sourceUrl: scraper.listRequest.url },
        );
      } catch (err) {
        const errorMessage = errorMessageFrom(err);
        outcomes.push({
          bookKey,
          status: "failed",
          promosFound: 0,
          promosKept: 0,
          detailRequests: plans.length,
          detailFailures,
          skippedByReason: {},
          sentToReview: 0,
          errorMessage,
        });
        await safeRecordScrapeRun(store, {
          bookKey,
          ranAt: now,
          status: "failed",
          promosFound: 0,
          promosKept: 0,
          errorMessage,
        });
        continue;
      }

      // WR-03 (refined by quick-260928-it1): zero promos found is always a
      // failed run ("zero promos parsed") -- an empty/malformed response is a
      // likely parser regression or an upstream outage, not a legitimate
      // "nothing usable today." Once found > 0, every skip is either
      // committed as-is (a legitimate/clear exclusion, LEGITIMATE per
      // reviewTriage.ts's CLEAR_SKIP_REASONS) or escalated into a "classify"
      // review row (isReviewWorthySkip) -- there is no longer a "failed, none
      // usable" status for a book that genuinely found promos: an uncertain
      // entry always lands in review instead of disappearing or failing the
      // whole run.
      if (parseResult.found === 0) {
        const outcome: BookRunOutcome = {
          bookKey,
          status: "failed",
          promosFound: 0,
          promosKept: 0,
          detailRequests: plans.length,
          detailFailures,
          skippedByReason: {},
          sentToReview: 0,
          errorMessage: "zero promos parsed",
        };
        outcomes.push(outcome);
        await safeRecordScrapeRun(store, {
          bookKey,
          ranAt: now,
          status: "failed",
          promosFound: 0,
          promosKept: 0,
          errorMessage: outcome.errorMessage,
        });
        continue;
      }

      // quick-260928-mgi: captured from the PARSER's own pre-reader skips,
      // before applyPromoReader runs -- identical whether or not a reader is
      // configured for this run, and independent of whatever the reader
      // later does with the same skip (the reader is never consulted for
      // sign-up money, T-mgi-03).
      const signupExtraction = extractSignupOffers(bookKey, parseResult.skipped);

      // quick-260928-kc5: every later use of parseResult.candidates/skipped
      // in this book's block reads the effective (possibly reader-updated)
      // result. A reader-pass exception degrades to the unmodified pattern
      // parser result -- it never fails this book's run (OD-3).
      let readerStats: ReaderBookStats | undefined;
      if (reader) {
        try {
          const applied = await applyPromoReader({
            bookKey,
            parseResult,
            reader,
            fallbackSourceUrl: scraper.listRequest.url,
          });
          parseResult = applied.parseResult;
          readerStats = applied.stats;
        } catch (err) {
          console.warn(
            `runPromoScrape: promo reader pass failed for ${bookKey}, using pattern parsers: ${errorMessageFrom(err)}`,
          );
          readerStats = {
            calls: 0,
            cacheHits: 0,
            fallbacks: parseResult.candidates.length + parseResult.skipped.length,
            disagreements: 0,
            guardDrops: 0,
            rescues: 0,
            reviewRouted: 0,
            skippedByReader: 0,
            clearSkipOverrides: 0,
            rescuesWithoutAmount: 0,
            inputTokens: 0,
            outputTokens: 0,
          };
        }
      }

      const skippedByReason = skippedByReasonOf(parseResult.skipped);

      if (parseResult.candidates.length === 0) {
        // No candidates this run -- only load match events, and only commit,
        // when there's something worth committing (a book whose every skip
        // is a clear/legitimate exclusion writes and expires nothing).
        const classifyWrites = buildClassifyWrites(
          bookKey,
          parseResult.skipped,
          scraper.listRequest.url,
          new Set(),
        );

        if (classifyWrites.length > 0) {
          // A likely parser regression (zero candidates) must never
          // mass-expire this book's existing live rows -- the uncertain
          // entries land in review instead, and every currently-active/
          // pending promo simply survives untouched (expireUnseen false).
          await store.commitScrapedPromos(bookKey, [], now, { classify: classifyWrites, expireUnseen: false });
        }

        // quick-260928-mgi (T-mgi-06): called UNCONDITIONALLY, even when
        // signupExtraction.offers is empty -- a successful run whose promos
        // are all clear exclusions still expires this book's stale sign-up
        // offers. Outside the classifyWrites.length > 0 guard above on
        // purpose. Never fails the book (commitSignupOffersSafely).
        const signupCommit = await commitSignupOffersSafely(store, bookKey, signupExtraction.offers, now);

        const outcome: BookRunOutcome = {
          bookKey,
          status: "ok",
          promosFound: parseResult.found,
          promosKept: 0,
          detailRequests: plans.length,
          detailFailures,
          skippedByReason,
          sentToReview: classifyWrites.length,
          errorMessage: null,
          ...(reader ? { reader: readerStats } : {}),
          signup: {
            offers: signupExtraction.offers.length,
            referralsExcluded: signupExtraction.referralsExcluded,
            notSignup: signupExtraction.notSignup,
            upserted: signupCommit ? signupCommit.upserted : null,
            expired: signupCommit ? signupCommit.expired : null,
          },
        };
        outcomes.push(outcome);
        await safeRecordScrapeRun(store, {
          bookKey,
          ranAt: now,
          status: "ok",
          promosFound: parseResult.found,
          promosKept: 0,
          errorMessage: null,
        });
        continue;
      }

      // Duplicate dedupe keys within one run (two candidates whose identity
      // fields collide) collapse to a single write. Every write carries its
      // own MatchResult (Plan 08) so store.ts's decideScrapedWrite never has
      // to re-derive it.
      const matchEvents = await getMatchEventsOnce();
      const writesByKey = new Map<string, PromoWrite>();
      for (const candidate of parseResult.candidates) {
        const dedupeKey = promoDedupeKey(candidate);
        const match = matchPromo(candidate, matchEvents, { now });
        writesByKey.set(dedupeKey, { dedupeKey, parsed: candidate, match });
      }
      const writes = [...writesByKey.values()];

      const classifyWrites = buildClassifyWrites(
        bookKey,
        parseResult.skipped,
        scraper.listRequest.url,
        new Set(writesByKey.keys()),
      );

      // Upsert + expiry of unseen rows commit in one transaction (WR-03),
      // candidate and classify writes together.
      await store.commitScrapedPromos(bookKey, writes, now, { classify: classifyWrites, expireUnseen: true });

      // quick-260928-mgi (T-mgi-06): called UNCONDITIONALLY, right after the
      // candidate commit, with a possibly empty offers list. Never fails
      // the book (commitSignupOffersSafely).
      const signupCommit = await commitSignupOffersSafely(store, bookKey, signupExtraction.offers, now);

      outcomes.push({
        bookKey,
        status: "ok",
        promosFound: parseResult.found,
        promosKept: writes.length,
        detailRequests: plans.length,
        detailFailures,
        skippedByReason,
        sentToReview: classifyWrites.length,
        errorMessage: null,
        ...(reader ? { reader: readerStats } : {}),
        signup: {
          offers: signupExtraction.offers.length,
          referralsExcluded: signupExtraction.referralsExcluded,
          notSignup: signupExtraction.notSignup,
          upserted: signupCommit ? signupCommit.upserted : null,
          expired: signupCommit ? signupCommit.expired : null,
        },
      });
      await safeRecordScrapeRun(store, {
        bookKey,
        ranAt: now,
        status: "ok",
        promosFound: parseResult.found,
        promosKept: writes.length,
        errorMessage: null,
      });
    } catch (err) {
      // Isolation (D-08): an uncaught exception anywhere in this book's own
      // block (fetch throwing, planDetails throwing, the store throwing)
      // never stops the next book in `targets`.
      const errorMessage = errorMessageFrom(err);
      outcomes.push({
        bookKey,
        status: "failed",
        promosFound: 0,
        promosKept: 0,
        detailRequests: 0,
        detailFailures: 0,
        skippedByReason: {},
        sentToReview: 0,
        errorMessage,
      });
      await safeRecordScrapeRun(store, {
        bookKey,
        ranAt: now,
        status: "failed",
        promosFound: 0,
        promosKept: 0,
        errorMessage,
      });
    }
  }

  return outcomes;
}

/**
 * quick-260928-it1: the scheduled job's own exit code -- 1 if any book's run
 * failed (a real problem worth surfacing red in Actions), 0 otherwise. A
 * book is "failed" only on no-scraper, a fetch failure, a parse throw, an
 * uncaught exception, or zero promos found -- never merely because some (or
 * even all) of its found promos couldn't be classified; those land in the
 * review queue (sentToReview) instead of failing the run. Used by
 * scripts/scrape-promos.ts.
 */
export function scrapeExitCode(outcomes: readonly BookRunOutcome[]): 0 | 1 {
  return outcomes.some((outcome) => outcome.status === "failed") ? 1 : 0;
}
