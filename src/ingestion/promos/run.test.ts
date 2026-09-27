import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPromoScrape, type LoadPromoMatchEvents } from "./run";
import type { CommitOutcome, PromoStore, PromoWrite } from "./store";
import type { FetchRequest, FetchResult } from "./fetchPage";
import type { BookScraper, DetailPlan, HttpRequestSpec, ParseResult, ScrapedPromo } from "@/domain/promos/scraped";

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
    const [bookKeyArg, writesArg, nowArg] = store.commitScrapedPromos.mock.calls[0];
    expect(bookKeyArg).toBe("testbook");
    expect(nowArg).toBe(NOW);
    expect(writesArg).toHaveLength(2);
    expect(writesArg.every((w: PromoWrite) => typeof w.dedupeKey === "string" && w.dedupeKey.length > 0)).toBe(true);

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

  it("WR-03: found > 0 with zero kept candidates is a failed run that writes and expires nothing", async () => {
    const scraper = makeScraper({
      parse: () => ({
        found: 3,
        candidates: [],
        skipped: [
          { reason: "schema_invalid", externalId: "a", title: "A" },
          { reason: "schema_invalid", externalId: "b", title: "B" },
          { reason: "unrecognized", externalId: "c", title: "C" },
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
      status: "failed",
      promosFound: 3,
      promosKept: 0,
      skippedByReason: { schema_invalid: 2, unrecognized: 1 },
      errorMessage: "3 promos found but none usable; existing promos kept",
    });
    expect(store.commitScrapedPromos).not.toHaveBeenCalled();
    expect(store.recordScrapeRun).toHaveBeenCalledWith({
      bookKey: "testbook",
      ranAt: NOW,
      status: "failed",
      promosFound: 3,
      promosKept: 0,
      errorMessage: "3 promos found but none usable; existing promos kept",
    });
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
});
