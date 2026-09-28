import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPromoScrape, scrapeExitCode, type BookRunOutcome, type LoadPromoMatchEvents } from "./run";
import type { ClassifyWrite, CommitOutcome, CommitScrapedPromosOpts, PromoStore, PromoWrite } from "./store";
import type { FetchRequest, FetchResult } from "./fetchPage";
import type { BookScraper, DetailPlan, HttpRequestSpec, ParseResult, ScrapedPromo, SkippedEntry } from "@/domain/promos/scraped";
import { draftkingsScraper } from "./books/draftkings";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import type { PromoReader, ReaderResult } from "./promoReader";
import type { ReaderBookStats } from "./readerPass";

/** Every run.test.ts scenario is offline: never touch the real cached-odds tables. */
const EMPTY_MATCH_EVENTS: LoadPromoMatchEvents = async () => ({ moneyline: [], extended: [] });

function req(url: string, method: "GET" | "POST" = "GET"): HttpRequestSpec {
  return { method, url, headers: {}, body: null };
}

function makeScraper(overrides: Partial<BookScraper> = {}): BookScraper {
  return {
    bookKey: "testbook",
    render: "http",
    stealth: false,
    sourceFormat: "json",
    maxDetailRequests: 6,
    listRequest: req("https://example.com/list"),
    planDetails: () => [],
    parse: () => ({ found: 0, candidates: [], skipped: [] }),
    ...overrides,
  };
}

function makePromo(overrides: Partial<ScrapedPromo> = {}): ScrapedPromo {
  return {
    bookKey: "testbook",
    externalId: "ext-1",
    promoType: "profit_boost",
    title: "Test Promo",
    rawText: "raw text",
    sourceUrl: "https://example.com/promo",
    sportKeyHint: null,
    scopeText: "Any game",
    teamsText: [],
    windowStart: null,
    windowEnd: null,
    expiresAt: null,
    eligibleMarketTypes: ["moneyline", "spread", "total"],
    pinned: null,
    boostPercent: "10.00",
    boostedOddsAmerican: null,
    baseOddsAmerican: null,
    bonusAmount: null,
    maxStake: "25.00",
    maxWinnings: null,
    minOddsAmerican: null,
    unparsedCapFields: [],
    claimRequired: null,
    finePrintNote: null,
    ...overrides,
  };
}

const COMMIT_RESOLVED: CommitOutcome = { inserted: 0, refreshed: 0, revived: 0, skippedDismissed: 0, expired: 0 };

function makeStore(): PromoStore & {
  recordScrapeRun: ReturnType<typeof vi.fn>;
  commitScrapedPromos: ReturnType<typeof vi.fn>;
} {
  return {
    recordScrapeRun: vi.fn().mockResolvedValue(undefined),
    commitScrapedPromos: vi.fn().mockResolvedValue(COMMIT_RESOLVED),
  };
}

function makeSleep() {
  return vi.fn().mockResolvedValue(undefined);
}

const NOW = new Date("2026-09-27T12:00:00.000Z");

describe("runPromoScrape", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches list then details in order, spaces requests, upserts/expires/records ok", async () => {
    const plans: DetailPlan[] = [
      { entryKey: "d1", request: req("https://example.com/detail/1") },
      { entryKey: "d2", request: req("https://example.com/detail/2") },
    ];
    const promoA = makePromo({ externalId: "a" });
    const promoB = makePromo({ externalId: "b" });
    const parseResult: ParseResult = { found: 5, candidates: [promoA, promoB], skipped: [] };
    const parseFn = vi.fn().mockReturnValue(parseResult);

    const scraper = makeScraper({
      listRequest: req("https://example.com/list"),
      planDetails: () => plans,
      parse: parseFn,
    });

    const fetchFn: FetchRequest = vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" }));
    const store = makeStore();
    const sleep = makeSleep();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: fetchFn,
      store,
      sleep,
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0].url).toBe("https://example.com/list");
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls[1][0].url).toBe("https://example.com/detail/1");
    expect((fetchFn as ReturnType<typeof vi.fn>).mock.calls[2][0].url).toBe("https://example.com/detail/2");

    expect(sleep).toHaveBeenCalledTimes(2);
    for (const call of sleep.mock.calls) {
      expect(call[0]).toBeGreaterThanOrEqual(2000);
    }

    expect(parseFn).toHaveBeenCalledTimes(1);
    expect(parseFn.mock.calls[0][0].detailBodies).toEqual({ d1: "{}", d2: "{}" });

    // Upsert + expiry of unseen rows are one transactional store call (WR-03).
    expect(store.commitScrapedPromos).toHaveBeenCalledTimes(1);
    const [bookKeyArg, writesArg, nowArg, optsArg] = store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    expect(bookKeyArg).toBe("testbook");
    expect(nowArg).toBe(NOW);
    expect(writesArg).toHaveLength(2);
    expect(writesArg.every((w: PromoWrite) => typeof w.dedupeKey === "string" && w.dedupeKey.length > 0)).toBe(true);
    expect(optsArg.classify).toEqual([]);
    expect(optsArg.expireUnseen).toBe(true);

    expect(store.recordScrapeRun).toHaveBeenCalledWith({
      bookKey: "testbook",
      ranAt: NOW,
      status: "ok",
      promosFound: 5,
      promosKept: 2,
      errorMessage: null,
    });

    expect(outcomes).toEqual([
      {
        bookKey: "testbook",
        status: "ok",
        promosFound: 5,
        promosKept: 2,
        detailRequests: 2,
        detailFailures: 0,
        skippedByReason: {},
        sentToReview: 0,
        errorMessage: null,
      },
    ]);
  });

  it("one detail failing does not fail the book; the failed key is absent from detailBodies", async () => {
    const plans: DetailPlan[] = [
      { entryKey: "d1", request: req("https://example.com/detail/1") },
      { entryKey: "d2", request: req("https://example.com/detail/2") },
    ];
    const parseFn = vi.fn().mockReturnValue({ found: 1, candidates: [makePromo()], skipped: [] });
    const scraper = makeScraper({ planDetails: () => plans, parse: parseFn });

    const fetchFn: FetchRequest = vi.fn(async (r: HttpRequestSpec): Promise<FetchResult> => {
      if (r.url.endsWith("/2")) return { ok: false, reason: "HTTP 500" };
      return { ok: true, body: "{}" };
    });
    const store = makeStore();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: fetchFn,
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(parseFn.mock.calls[0][0].detailBodies).toEqual({ d1: "{}" });
    expect(outcomes[0].status).toBe("ok");
    expect(outcomes[0].detailFailures).toBe(1);
  });

  it("caps detail fetches at maxDetailRequests even when planDetails over-plans", async () => {
    const plans: DetailPlan[] = Array.from({ length: 10 }, (_, i) => ({
      entryKey: `d${i}`,
      request: req(`https://example.com/detail/${i}`),
    }));
    const scraper = makeScraper({
      maxDetailRequests: 3,
      planDetails: () => plans,
      parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }),
    });

    const fetchFn: FetchRequest = vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" }));

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: fetchFn,
      store: makeStore(),
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    // 1 list + 3 detail (capped from 10) = 4 total fetches.
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(outcomes[0].detailRequests).toBe(3);
  });

  it("(a) 1 candidate + 1 unrecognized + 1 parlay is ok: promosKept 1, sentToReview 1, classify write committed with expireUnseen true", async () => {
    const scraper = makeScraper({
      parse: () => ({
        found: 3,
        candidates: [makePromo({ externalId: "kept-1" })],
        skipped: [
          { reason: "unrecognized", externalId: "u-1", title: "Mystery Boost" },
          { reason: "parlay", externalId: "p-1", title: "Parlay Boost" },
        ],
      }),
    });
    const store = makeStore();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(outcomes[0]).toMatchObject({
      status: "ok",
      promosFound: 3,
      promosKept: 1,
      sentToReview: 1,
      skippedByReason: { unrecognized: 1, parlay: 1 },
      errorMessage: null,
    });
    expect(store.commitScrapedPromos).toHaveBeenCalledTimes(1);
    const [, writesArg, , optsArg] = store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    expect(writesArg).toHaveLength(1);
    expect(optsArg.classify).toHaveLength(1);
    expect(optsArg.classify?.[0].draft.title).toBe("Mystery Boost");
    expect(optsArg.expireUnseen).toBe(true);
    expect(scrapeExitCode(outcomes)).toBe(0);
  });

  it("(b) 0 candidates + 2 unrecognized (found 2) is ok, not failed: sentToReview 2, classify writes committed with expireUnseen false", async () => {
    const scraper = makeScraper({
      parse: () => ({
        found: 2,
        candidates: [],
        skipped: [
          { reason: "unrecognized", externalId: "u-1", title: "Mystery A" },
          { reason: "unrecognized", externalId: "u-2", title: "Mystery B" },
        ],
      }),
    });
    const store = makeStore();
    const loadEvents = vi.fn(async () => ({ moneyline: [], extended: [] }));

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents,
    });

    expect(outcomes[0]).toMatchObject({
      status: "ok",
      promosFound: 2,
      promosKept: 0,
      sentToReview: 2,
      skippedByReason: { unrecognized: 2 },
      errorMessage: null,
    });
    // A book with zero candidates never needs match events, even when it
    // has classify writes -- a classify row is never matched.
    expect(loadEvents).not.toHaveBeenCalled();
    expect(store.commitScrapedPromos).toHaveBeenCalledTimes(1);
    const [bookKeyArg, writesArg, , optsArg] = store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    expect(bookKeyArg).toBe("testbook");
    expect(writesArg).toEqual([]);
    expect(optsArg.classify).toHaveLength(2);
    expect(optsArg.expireUnseen).toBe(false);
    expect(scrapeExitCode(outcomes)).toBe(0);
  });

  it("(c) a book whose every found promo is a clear/legitimate exclusion is ok with 0 kept, and nothing is committed", async () => {
    const skipped: SkippedEntry[] = [
      ...Array.from({ length: 8 }, (_, i) => ({ reason: "not_a_promo" as const, externalId: `na-${i}`, title: `NA ${i}` })),
      ...Array.from({ length: 2 }, (_, i) => ({ reason: "new_customer" as const, externalId: `nc-${i}`, title: `NC ${i}` })),
      { reason: "outright" as const, externalId: "or-1", title: "OR 1" },
    ];
    const scraper = makeScraper({
      parse: () => ({ found: 11, candidates: [], skipped }),
    });
    const store = makeStore();
    const loadEvents = vi.fn(async () => ({ moneyline: [], extended: [] }));

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents,
    });

    expect(outcomes[0]).toMatchObject({
      status: "ok",
      promosFound: 11,
      promosKept: 0,
      sentToReview: 0,
      skippedByReason: { not_a_promo: 8, new_customer: 2, outright: 1 },
      errorMessage: null,
    });
    expect(store.commitScrapedPromos).not.toHaveBeenCalled();
    expect(loadEvents).not.toHaveBeenCalled();
    expect(store.recordScrapeRun).toHaveBeenCalledWith({
      bookKey: "testbook",
      ranAt: NOW,
      status: "ok",
      promosFound: 11,
      promosKept: 0,
      errorMessage: null,
    });
    expect(scrapeExitCode(outcomes)).toBe(0);
  });

  it("(f) a candidate and a classify draft with the same dedupe key: the candidate wins, only one write is sent", async () => {
    const promo = makePromo({ externalId: "same-key", boostPercent: "50.00" });
    // A synthetic unrecognized skip whose evidence, once run through
    // buildClassifyDraft, produces a draft with the SAME dedupe-key
    // identity fields (bookKey/promoType/boostPercent/externalId) as the
    // candidate above.
    const skip: SkippedEntry = {
      reason: "unrecognized",
      externalId: "same-key",
      title: "Duplicate",
      evidence: {
        rawText: "50% Profit Boost",
        sourceUrl: "https://example.com/list",
        expiresAt: null,
        partial: { promoType: "profit_boost", boostPercent: "50.00" },
      },
    };
    const scraper = makeScraper({
      listRequest: req("https://example.com/list"),
      parse: () => ({ found: 2, candidates: [promo], skipped: [skip] }),
    });
    const store = makeStore();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(outcomes[0]).toMatchObject({ status: "ok", promosKept: 1, sentToReview: 0 });
    const [, writesArg, , optsArg] = store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    expect(writesArg).toHaveLength(1);
    expect(optsArg.classify).toEqual([]);
  });

  it("(g) a schema_invalid skip becomes a classify write whose draft carries the evidence.partial fields", async () => {
    const skip: SkippedEntry = {
      reason: "schema_invalid",
      externalId: "bad-1",
      title: "Broken Promo",
      evidence: {
        rawText: "some raw text",
        sourceUrl: "https://example.com/bad",
        expiresAt: "2026-10-01T00:00:00.000Z",
        partial: { promoType: "profit_boost", sportKeyHint: "americanfootball_nfl", boostPercent: "75.00" },
      },
    };
    const scraper = makeScraper({
      parse: () => ({ found: 1, candidates: [], skipped: [skip] }),
    });
    const store = makeStore();

    await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    const [, , , optsArg] = store.commitScrapedPromos.mock.calls[0] as [string, PromoWrite[], Date, CommitScrapedPromosOpts];
    expect(optsArg.classify).toHaveLength(1);
    const draft = (optsArg.classify as ClassifyWrite[])[0].draft;
    expect(draft.promoType).toBe("profit_boost");
    expect(draft.sportKeyHint).toBe("americanfootball_nfl");
    expect(draft.boostPercent).toBe("75.00");
    expect(draft.sourceUrl).toBe("https://example.com/bad");
    expect(draft.expiresAt).toBe("2026-10-01T00:00:00.000Z");
  });


  it("a failed list fetch records failed with the reason and makes no detail/upsert/expire calls", async () => {
    const scraper = makeScraper();
    const fetchFn: FetchRequest = vi.fn(async (): Promise<FetchResult> => ({ ok: false, reason: "HTTP 403" }));
    const store = makeStore();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: fetchFn,
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(outcomes[0]).toEqual({
      bookKey: "testbook",
      status: "failed",
      promosFound: 0,
      promosKept: 0,
      detailRequests: 0,
      detailFailures: 0,
      skippedByReason: {},
      sentToReview: 0,
      errorMessage: "HTTP 403",
    });
    expect(store.commitScrapedPromos).not.toHaveBeenCalled();
    expect(store.recordScrapeRun).toHaveBeenCalledWith({
      bookKey: "testbook",
      ranAt: NOW,
      status: "failed",
      promosFound: 0,
      promosKept: 0,
      errorMessage: "HTTP 403",
    });
  });

  it("parse returning found:0 fails as 'zero promos parsed' with no upsert/expire", async () => {
    const scraper = makeScraper({ parse: () => ({ found: 0, candidates: [], skipped: [] }) });
    const store = makeStore();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].errorMessage).toBe("zero promos parsed");
    expect(store.commitScrapedPromos).not.toHaveBeenCalled();
    expect(scrapeExitCode(outcomes)).toBe(1);
  });

  it("parse throwing fails with the message truncated to 300 chars, no upsert/expire", async () => {
    const longMessage = "x".repeat(500);
    const scraper = makeScraper({
      parse: () => {
        throw new Error(longMessage);
      },
    });
    const store = makeStore();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].errorMessage).toHaveLength(300);
    expect(outcomes[0].errorMessage).toBe(longMessage.slice(0, 300));
    expect(store.commitScrapedPromos).not.toHaveBeenCalled();
  });

  it("isolates books: the first target throwing inside fetch does not stop the rest, and cadence still holds", async () => {
    const scraperOk = makeScraper({ parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }) });
    const scraperThrows = makeScraper({ bookKey: "throwbook" });

    let fetchCallCount = 0;
    const fetchFn: FetchRequest = vi.fn(async (r: HttpRequestSpec): Promise<FetchResult> => {
      fetchCallCount++;
      if (r.url === "https://example.com/list" && fetchCallCount === 1) {
        throw new Error("boom");
      }
      return { ok: true, body: "{}" };
    });
    const store = makeStore();
    const sleep = makeSleep();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["throwbook", "book2", "book3"],
      scrapers: { throwbook: scraperThrows, book2: scraperOk, book3: scraperOk },
      fetch: fetchFn,
      store,
      sleep,
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(outcomes).toHaveLength(3);
    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[1].status).toBe("ok");
    expect(outcomes[2].status).toBe("ok");
    // book2's list fetch (2nd overall request) must still wait the gap even
    // though book1 never got past its own first (throwing) request.
    expect(sleep).toHaveBeenCalled();
  });

  it("an unknown target key fails with 'no scraper registered' and makes no fetch call", async () => {
    const fetchFn: FetchRequest = vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" }));
    const store = makeStore();

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["ghostbook"],
      scrapers: {},
      fetch: fetchFn,
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(outcomes[0]).toEqual({
      bookKey: "ghostbook",
      status: "failed",
      promosFound: 0,
      promosKept: 0,
      detailRequests: 0,
      detailFailures: 0,
      skippedByReason: {},
      sentToReview: 0,
      errorMessage: "no scraper registered",
    });
    expect(store.recordScrapeRun).toHaveBeenCalledWith({
      bookKey: "ghostbook",
      ranAt: NOW,
      status: "failed",
      promosFound: 0,
      promosKept: 0,
      errorMessage: "no scraper registered",
    });
  });

  it("collapses duplicate dedupe keys within one run to a single write", async () => {
    const identicalA = makePromo({ externalId: "same-id" });
    const identicalB = makePromo({ externalId: "same-id" });
    const scraper = makeScraper({
      parse: () => ({ found: 2, candidates: [identicalA, identicalB], skipped: [] }),
    });
    const store = makeStore();

    await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    const [, writesArg] = store.commitScrapedPromos.mock.calls[0];
    expect(writesArg).toHaveLength(1);
  });

  it("recordScrapeRun throwing is logged but does not change the returned outcome", async () => {
    const scraper = makeScraper({ parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }) });
    const store = makeStore();
    store.recordScrapeRun.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    expect(outcomes[0]).toMatchObject({ status: "ok", promosFound: 1, promosKept: 1 });
    expect(consoleError).toHaveBeenCalled();
  });

  it("loadEvents is called once per run (not per book), only when at least one book fetched ok", async () => {
    const scraperA = makeScraper({ bookKey: "book-a", parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }) });
    const scraperB = makeScraper({ bookKey: "book-b", parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }) });
    const store = makeStore();
    const loadEvents = vi.fn(async () => ({ moneyline: [], extended: [] }));

    await runPromoScrape({
      now: NOW,
      targets: ["book-a", "book-b"],
      scrapers: { "book-a": scraperA, "book-b": scraperB },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents,
    });

    expect(loadEvents).toHaveBeenCalledTimes(1);
  });

  it("never calls loadEvents when every book fails", async () => {
    const scraper = makeScraper({ parse: () => ({ found: 0, candidates: [], skipped: [] }) });
    const store = makeStore();
    const loadEvents = vi.fn(async () => ({ moneyline: [], extended: [] }));

    await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents,
    });

    expect(loadEvents).not.toHaveBeenCalled();
  });

  it("each PromoWrite carries the MatchResult from matchPromo", async () => {
    const scraper = makeScraper({ parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }) });
    const store = makeStore();

    await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
    });

    const [, writesArg] = store.commitScrapedPromos.mock.calls[0];
    expect(writesArg).toHaveLength(1);
    const write: PromoWrite = writesArg[0];
    expect(write.match).toBeDefined();
    expect(["matched", "unmatched"]).toContain(write.match.status);
  });

  it("WR-09: a failed odds-cache read fails only that book; the next book retries the load", async () => {
    const scraper = makeScraper({ parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }) });
    const store = makeStore();
    const loadEvents = vi
      .fn<LoadPromoMatchEvents>()
      .mockRejectedValueOnce(new Error("neon blip"))
      .mockResolvedValue({ moneyline: [], extended: [] });

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["book1", "book2"],
      scrapers: { book1: scraper, book2: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents,
    });

    expect(outcomes.map((o) => o.status)).toEqual(["failed", "ok"]);
    expect(outcomes[0].errorMessage).toBe("neon blip");
    expect(loadEvents).toHaveBeenCalledTimes(2);
  });
});

describe("scrapeExitCode", () => {
  const ok: BookRunOutcome = {
    bookKey: "a",
    status: "ok",
    promosFound: 1,
    promosKept: 1,
    detailRequests: 0,
    detailFailures: 0,
    skippedByReason: {},
    sentToReview: 0,
    errorMessage: null,
  };
  const okWithReview: BookRunOutcome = {
    bookKey: "c",
    status: "ok",
    promosFound: 2,
    promosKept: 0,
    detailRequests: 0,
    detailFailures: 0,
    skippedByReason: { unrecognized: 2 },
    sentToReview: 2,
    errorMessage: null,
  };
  const failed: BookRunOutcome = {
    bookKey: "b",
    status: "failed",
    promosFound: 0,
    promosKept: 0,
    detailRequests: 0,
    detailFailures: 0,
    skippedByReason: {},
    sentToReview: 0,
    errorMessage: "x",
  };

  it("returns 0 for an empty outcomes array", () => {
    expect(scrapeExitCode([])).toBe(0);
  });

  it("returns 1 when any outcome failed", () => {
    expect(scrapeExitCode([ok, failed])).toBe(1);
  });

  it("returns 0 when all outcomes are ok, including a book with sentToReview > 0", () => {
    expect(scrapeExitCode([ok, okWithReview])).toBe(0);
  });
});

describe("runPromoScrape with the promo reader (quick-260928-kc5)", () => {
  const DK_NOW = new Date("2026-09-28T12:00:00.000Z");
  const DK_SOURCE_URL = "https://api.draftkings.com/en/api/promotions/v3/promotions/query";

  function loadDkFixtureBody(): string {
    return readFileSync(join(process.cwd(), "src/test/fixtures/promos/draftkings-promos-2026-09-28.json"), "utf-8");
  }

  function makeDkFetch(): FetchRequest {
    return vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: loadDkFixtureBody() }));
  }

  async function runDk(reader?: PromoReader | null, store: ReturnType<typeof makeStore> = makeStore()) {
    const outcomes = await runPromoScrape({
      now: DK_NOW,
      targets: ["draftkings"],
      scrapers: { draftkings: draftkingsScraper },
      fetch: makeDkFetch(),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
      ...(reader !== undefined ? { reader } : {}),
    });
    return { outcomes, store };
  }

  it("PIN: the real DK 2026-09-28 fixture with no reader -- baseline for every equivalence check below", async () => {
    const { outcomes, store } = await runDk();

    expect(outcomes[0].status).toBe("ok");
    expect(outcomes[0].promosFound).toBe(23);
    expect(outcomes[0]).not.toHaveProperty("reader");

    expect(store.commitScrapedPromos).toHaveBeenCalledTimes(1);
    const [, writesArg] = store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    expect(writesArg.map((w) => w.parsed.externalId)).toEqual(["1125873"]);
  });

  it("a reader that always falls back produces commitScrapedPromos args deep-equal to the no-reader run, plus reader stats with fallbacks == entries read", async () => {
    const baseline = await runDk();
    const fallbackReader: PromoReader = {
      read: vi.fn(async (): Promise<ReaderResult> => ({ source: "fallback", reason: "api_error" })),
    };
    const withReader = await runDk(fallbackReader);

    const [, baseWrites, , baseOpts] = baseline.store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    const [, readerWrites, , readerOpts] = withReader.store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    expect(readerWrites).toEqual(baseWrites);
    expect(readerOpts).toEqual(baseOpts);

    const { reader: readerStats, ...restOfOutcome } = withReader.outcomes[0];
    const { ...baselineOutcome } = baseline.outcomes[0];
    expect(restOfOutcome).toEqual(baselineOutcome);
    expect(readerStats).toBeDefined();
    expect((readerStats as ReaderBookStats).calls).toBe(0);
    expect((readerStats as ReaderBookStats).cacheHits).toBe(0);
    // 1 candidate + 22 skips (every skip in this fixture carries evidence) == 23 entries read.
    expect((readerStats as ReaderBookStats).fallbacks).toBe(23);
  });

  it("agreeing on 1125873 and not_usable/prop on 1127668 leaves the candidate write unchanged, disagreements 0", async () => {
    const candidate1125873 = draftkingsScraper.parse(
      { listBody: loadDkFixtureBody(), detailBodies: {} },
      { now: DK_NOW, sourceUrl: DK_SOURCE_URL },
    ).candidates.find((c) => c.externalId === "1125873")!;
    const skip1127668 = draftkingsScraper.parse(
      { listBody: loadDkFixtureBody(), detailBodies: {} },
      { now: DK_NOW, sourceUrl: DK_SOURCE_URL },
    ).skipped.find((s) => s.externalId === "1127668")!;

    const scraper = makeScraper({
      listRequest: req(DK_SOURCE_URL),
      parse: () => ({ found: 2, candidates: [candidate1125873], skipped: [skip1127668] }),
    });
    const store = makeStore();

    const agreeingReader: PromoReader = {
      read: vi.fn(async ({ text }): Promise<ReaderResult> => {
        if (text.includes("NHL 50% Profit Boost")) {
          return {
            source: "api",
            reading: {
              kind: "profit_boost",
              skipReason: null,
              boostPercent: "50",
              bonusAmount: null,
              maxStake: "25",
              maxWinnings: null,
              minOddsAmerican: -200,
              sport: "icehockey_nhl",
              teams: [],
              singleGame: false,
              liveOnly: false,
              parlayOrSgpOnly: false,
              propOnly: false,
              newCustomerOnly: false,
              eventDateText: "9/29/2026",
              confidence: "high",
              evidence: {
                boostPercent: "Profit Boost: 50%",
                bonusAmount: null,
                maxStake: "MAX $25 WAGER",
                maxWinnings: null,
                minOddsAmerican: "-200 or longer",
              },
            },
            usage: { inputTokens: 400, outputTokens: 200 },
          };
        }
        return {
          source: "api",
          reading: {
            kind: "not_usable",
            skipReason: "prop",
            boostPercent: null,
            bonusAmount: null,
            maxStake: null,
            maxWinnings: null,
            minOddsAmerican: null,
            sport: null,
            teams: [],
            singleGame: false,
            liveOnly: false,
            parlayOrSgpOnly: false,
            propOnly: true,
            newCustomerOnly: false,
            eventDateText: null,
            confidence: "high",
            evidence: {
              boostPercent: null,
              bonusAmount: null,
              maxStake: null,
              maxWinnings: null,
              minOddsAmerican: null,
            },
          },
          usage: { inputTokens: 300, outputTokens: 100 },
        };
      }),
    };

    const outcomes = await runPromoScrape({
      now: DK_NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
      reader: agreeingReader,
    });

    expect(outcomes[0].status).toBe("ok");
    const [, writesArg] = store.commitScrapedPromos.mock.calls[0] as [string, PromoWrite[], Date, CommitScrapedPromosOpts];
    expect(writesArg).toHaveLength(1);
    expect(writesArg[0].parsed).toEqual(candidate1125873);

    const stats = outcomes[0].reader as ReaderBookStats;
    expect(stats.calls).toBe(2);
    expect(stats.cacheHits).toBe(0);
    expect(stats.disagreements).toBe(0);
  });

  it("a disagreeing reader on 1125873's boost demotes it to review, preserving its dedupe key", async () => {
    const realFixtureResult = draftkingsScraper.parse(
      { listBody: loadDkFixtureBody(), detailBodies: {} },
      { now: DK_NOW, sourceUrl: DK_SOURCE_URL },
    );
    const realCandidate = realFixtureResult.candidates.find((c) => c.externalId === "1125873")!;
    // A simulated parser mistake: boostPercent 40.00 paired with 1125873's
    // own real text (which actually says 50%) -- after the field-binding
    // guard, only a genuinely-backed "50" can prove boostPercent, so this
    // must disagree rather than pass some fuzzy tolerance.
    const mistakenCandidate: ScrapedPromo = { ...realCandidate, boostPercent: "40.00" };

    const scraper = makeScraper({
      listRequest: req(DK_SOURCE_URL),
      parse: () => ({ found: 1, candidates: [mistakenCandidate], skipped: [] }),
    });
    const store = makeStore();

    const disagreeingReader: PromoReader = {
      read: vi.fn(async (): Promise<ReaderResult> => ({
        source: "api",
        reading: {
          kind: "profit_boost",
          skipReason: null,
          boostPercent: "50",
          bonusAmount: null,
          maxStake: "25",
          maxWinnings: null,
          minOddsAmerican: -200,
          sport: "icehockey_nhl",
          teams: [],
          singleGame: false,
          liveOnly: false,
          parlayOrSgpOnly: false,
          propOnly: false,
          newCustomerOnly: false,
          eventDateText: "9/29/2026",
          confidence: "high",
          evidence: {
            boostPercent: "Profit Boost: 50%",
            bonusAmount: null,
            maxStake: "MAX $25 WAGER",
            maxWinnings: null,
            minOddsAmerican: "-200 or longer",
          },
        },
        usage: { inputTokens: 400, outputTokens: 200 },
      })),
    };

    const outcomes = await runPromoScrape({
      now: DK_NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
      reader: disagreeingReader,
    });

    expect(outcomes[0].status).toBe("ok");
    expect((outcomes[0].reader as ReaderBookStats).disagreements).toBe(1);

    expect(store.commitScrapedPromos).toHaveBeenCalledTimes(1);
    const [, writesArg, , optsArg] = store.commitScrapedPromos.mock.calls[0] as [
      string,
      PromoWrite[],
      Date,
      CommitScrapedPromosOpts,
    ];
    expect(writesArg).toEqual([]);
    expect(optsArg.expireUnseen).toBe(false);
    expect(optsArg.classify).toHaveLength(1);
    const classifyWrite = (optsArg.classify as ClassifyWrite[])[0];
    expect(classifyWrite.dedupeKey).toBe(promoDedupeKey(mistakenCandidate));
    expect(classifyWrite.draft.rawText.startsWith("[Promo reader check: disagreement]")).toBe(true);
  });

  it("a reader whose read() throws for every entry leaves the book's result equal to the no-reader result, status ok", async () => {
    const scraper = makeScraper({ parse: () => ({ found: 1, candidates: [makePromo()], skipped: [] }) });
    const store = makeStore();
    const throwingReader: PromoReader = {
      read: vi.fn(async () => {
        throw new Error("defensive: the real reader never throws");
      }),
    };

    const outcomes = await runPromoScrape({
      now: NOW,
      targets: ["testbook"],
      scrapers: { testbook: scraper },
      fetch: vi.fn(async (): Promise<FetchResult> => ({ ok: true, body: "{}" })),
      store,
      sleep: makeSleep(),
      loadEvents: EMPTY_MATCH_EVENTS,
      reader: throwingReader,
    });

    expect(outcomes[0].status).toBe("ok");
    expect(outcomes[0].promosKept).toBe(1);
    const stats = outcomes[0].reader as ReaderBookStats;
    expect(stats.fallbacks).toBe(1);
    const [, writesArg] = store.commitScrapedPromos.mock.calls[0] as [string, PromoWrite[], Date, CommitScrapedPromosOpts];
    expect(writesArg).toHaveLength(1);
    expect(writesArg[0].parsed).toEqual(makePromo());
  });
});
