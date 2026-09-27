/**
 * Per-book promo scrape orchestrator (PROMO-03; D-06, D-08, D-09, Design
 * Implication 7). Runs SCRAPE_TARGET_BOOK_KEYS sequentially, one book at a
 * time, each in its own try/catch so one book's exception, timeout, or
 * malformed JSON can never stop another book's run or corrupt its status
 * (D-08). Every HTTP request across the whole run (list + detail, across
 * every book) is spaced at least `minGapMs` apart -- polite cadence, not
 * just "polite per book" (Design Implication 7, PITFALLS Pitfall 8).
 */
import type { OddsEvent } from "@/domain/odds/schemas";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import { matchPromo } from "@/domain/promos/matcher";
import type { BookScraper, HttpRequestSpec } from "@/domain/promos/scraped";
import { SCRAPE_TARGET_BOOK_KEYS } from "@/config/scrapeTargets";
import { getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { fetchRequest, type FetchRequest } from "./fetchPage";
import { promoStore, type PromoStore, type PromoWrite, type ScrapeRunRow } from "./store";
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
  errorMessage: string | null;
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

export async function runPromoScrape(opts?: {
  now?: Date;
  targets?: readonly string[];
  fetch?: FetchRequest;
  store?: PromoStore;
  scrapers?: Readonly<Record<string, BookScraper>>;
  sleep?: (ms: number) => Promise<void>;
  minGapMs?: number;
  loadEvents?: LoadPromoMatchEvents;
}): Promise<BookRunOutcome[]> {
  const now = opts?.now ?? new Date();
  const targets = opts?.targets ?? SCRAPE_TARGET_BOOK_KEYS;
  const fetchFn = opts?.fetch ?? fetchRequest;
  const store = opts?.store ?? promoStore;
  const scrapers = opts?.scrapers ?? BOOK_SCRAPERS;
  const sleep = opts?.sleep ?? defaultSleep;
  const minGapMs = opts?.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const loadEventsFn = opts?.loadEvents ?? defaultLoadEvents;

  const outcomes: BookRunOutcome[] = [];

  // Loaded lazily, once for the whole run (not per book), and only when at
  // least one book successfully parses (found > 0) -- matchPromo spends no
  // Odds API credits itself (D-07), it just reads whatever's already cached.
  let eventsPromise: ReturnType<LoadPromoMatchEvents> | null = null;
  function getMatchEventsOnce(): ReturnType<LoadPromoMatchEvents> {
    if (eventsPromise === null) {
      eventsPromise = loadEventsFn();
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

      if (parseResult.found === 0) {
        const outcome: BookRunOutcome = {
          bookKey,
          status: "failed",
          promosFound: 0,
          promosKept: 0,
          detailRequests: plans.length,
          detailFailures,
          skippedByReason: {},
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

      await store.upsertScrapedPromos(bookKey, writes, now);
      await store.expireMissingPromos(bookKey, writes.map((w) => w.dedupeKey), now);

      const skippedByReason: Record<string, number> = {};
      for (const skip of parseResult.skipped) {
        skippedByReason[skip.reason] = (skippedByReason[skip.reason] ?? 0) + 1;
      }

      outcomes.push({
        bookKey,
        status: "ok",
        promosFound: parseResult.found,
        promosKept: writes.length,
        detailRequests: plans.length,
        detailFailures,
        skippedByReason,
        errorMessage: null,
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
