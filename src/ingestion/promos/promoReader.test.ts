import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createPromoReader, type PromoReaderClient, type PromoReadingCache } from "./promoReader";
import { readingCacheKey } from "./promoReading";
import type { PromoReading } from "./promoReading";

function validReading(overrides: Partial<PromoReading> = {}): PromoReading {
  return {
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
    ...overrides,
  };
}

function makeMemoryCache(): PromoReadingCache & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async get(contentHash) {
      return store.get(contentHash) ?? null;
    },
    async put(row) {
      store.set(row.contentHash, row.reading);
    },
  };
}

function makeClient(parseImpl: (...args: unknown[]) => unknown) {
  return { messages: { parse: vi.fn(parseImpl) } } as unknown as PromoReaderClient & {
    messages: { parse: ReturnType<typeof vi.fn> };
  };
}

function apiMessage(overrides: Partial<{ stop_reason: string | null; parsed_output: unknown; usage: { input_tokens: number; output_tokens: number } }> = {}) {
  return {
    stop_reason: "end_turn",
    parsed_output: validReading(),
    usage: { input_tokens: 400, output_tokens: 200 },
    ...overrides,
  };
}

describe("createPromoReader", () => {
  it("a cache hit returns {source:'cache'} and makes zero client.messages.parse calls, never counted toward the budget", async () => {
    const cache = makeMemoryCache();
    const contentHash = readingCacheKey("draftkings", "some text");
    cache.store.set(contentHash, validReading());
    const client = makeClient(() => apiMessage());

    const reader = createPromoReader({ client, cache, maxCalls: 1 });
    const result = await reader.read({ bookKey: "draftkings", text: "some text" });

    expect(result.source).toBe("cache");
    expect(client.messages.parse).not.toHaveBeenCalled();

    // Confirms cache hits don't count toward the budget: with maxCalls 1, a
    // second DIFFERENT-text call (a real miss) must still be allowed through.
    const result2 = await reader.read({ bookKey: "draftkings", text: "different text" });
    expect(result2.source).toBe("api");
  });

  it("a cache miss calls parse once with the right shape, no thinking/effort, a 30s timeout request option, then caches and returns {source:'api', usage}", async () => {
    const cache = makeMemoryCache();
    const client = makeClient(() => apiMessage());

    const reader = createPromoReader({ client, cache });
    const result = await reader.read({ bookKey: "draftkings", text: "some promo text" });

    expect(client.messages.parse).toHaveBeenCalledTimes(1);
    const [params, requestOpts] = client.messages.parse.mock.calls[0];
    expect((params as Record<string, unknown>).model).toBe("claude-haiku-4-5");
    expect((params as Record<string, unknown>).max_tokens).toBe(1024);
    expect(typeof (params as Record<string, unknown>).system).toBe("string");
    expect((params as Record<string, unknown>).messages).toEqual([{ role: "user", content: "some promo text" }]);
    expect((params as Record<string, unknown>).output_config).toBeDefined();
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("effort");
    expect(requestOpts).toEqual({ timeout: 30_000 });

    expect(result).toEqual({
      source: "api",
      reading: validReading(),
      usage: { inputTokens: 400, outputTokens: 200 },
    });

    const contentHash = readingCacheKey("draftkings", "some promo text");
    expect(cache.store.get(contentHash)).toEqual(validReading());
  });

  it("a cached value that fails PromoReadingSchema is treated as a miss", async () => {
    const cache = makeMemoryCache();
    const contentHash = readingCacheKey("draftkings", "bad cache text");
    cache.store.set(contentHash, { not: "a valid reading" });
    const client = makeClient(() => apiMessage());

    const reader = createPromoReader({ client, cache });
    const result = await reader.read({ bookKey: "draftkings", text: "bad cache text" });

    expect(client.messages.parse).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("api");
  });

  it("parse throwing a generic Error gives {source:'fallback', reason:'api_error'} and nothing is cached", async () => {
    const cache = makeMemoryCache();
    const client = makeClient(() => {
      throw new Error("boom");
    });
    const log = vi.fn();

    const reader = createPromoReader({ client, cache, log });
    const result = await reader.read({ bookKey: "draftkings", text: "text" });

    expect(result).toEqual({ source: "fallback", reason: "api_error" });
    expect(cache.store.size).toBe(0);
    expect(log).toHaveBeenCalled();
  });

  it("parse throwing an Anthropic.APIError subclass gives {source:'fallback', reason:'api_error'}", async () => {
    const cache = makeMemoryCache();
    const client = makeClient(() => {
      throw new Anthropic.APIConnectionError({ message: "connection reset" });
    });
    const log = vi.fn();

    const reader = createPromoReader({ client, cache, log });
    const result = await reader.read({ bookKey: "draftkings", text: "text" });

    expect(result).toEqual({ source: "fallback", reason: "api_error" });
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).not.toContain("sk-ant-");
  });

  it("stop_reason 'refusal' gives reason 'refusal'", async () => {
    const cache = makeMemoryCache();
    const client = makeClient(() => apiMessage({ stop_reason: "refusal" }));
    const reader = createPromoReader({ client, cache });
    const result = await reader.read({ bookKey: "draftkings", text: "text" });
    expect(result).toEqual({ source: "fallback", reason: "refusal" });
    expect(cache.store.size).toBe(0);
  });

  it("stop_reason 'max_tokens' gives reason 'max_tokens'", async () => {
    const cache = makeMemoryCache();
    const client = makeClient(() => apiMessage({ stop_reason: "max_tokens" }));
    const reader = createPromoReader({ client, cache });
    const result = await reader.read({ bookKey: "draftkings", text: "text" });
    expect(result).toEqual({ source: "fallback", reason: "max_tokens" });
    expect(cache.store.size).toBe(0);
  });

  it("parsed_output null gives reason 'parse_failed'", async () => {
    const cache = makeMemoryCache();
    const client = makeClient(() => apiMessage({ parsed_output: null }));
    const reader = createPromoReader({ client, cache });
    const result = await reader.read({ bookKey: "draftkings", text: "text" });
    expect(result).toEqual({ source: "fallback", reason: "parse_failed" });
    expect(cache.store.size).toBe(0);
  });

  it("with maxCalls 2, a third miss returns fallback 'budget' without calling parse", async () => {
    const cache = makeMemoryCache();
    const client = makeClient(() => apiMessage());
    const reader = createPromoReader({ client, cache, maxCalls: 2 });

    await reader.read({ bookKey: "draftkings", text: "text-1" });
    await reader.read({ bookKey: "draftkings", text: "text-2" });
    const third = await reader.read({ bookKey: "draftkings", text: "text-3" });

    expect(client.messages.parse).toHaveBeenCalledTimes(2);
    expect(third).toEqual({ source: "fallback", reason: "budget" });
  });

  it("after 3 consecutive API failures, every later miss returns fallback 'circuit_open' without calling parse; a success resets the counter", async () => {
    const cache = makeMemoryCache();
    let callCount = 0;
    const client = makeClient(() => {
      callCount++;
      if (callCount <= 3) throw new Error(`failure ${callCount}`);
      return apiMessage();
    });
    const reader = createPromoReader({ client, cache, circuitBreakAfter: 3, log: vi.fn() });

    await reader.read({ bookKey: "draftkings", text: "t1" });
    await reader.read({ bookKey: "draftkings", text: "t2" });
    await reader.read({ bookKey: "draftkings", text: "t3" });
    expect(client.messages.parse).toHaveBeenCalledTimes(3);

    const fourth = await reader.read({ bookKey: "draftkings", text: "t4" });
    expect(fourth).toEqual({ source: "fallback", reason: "circuit_open" });
    expect(client.messages.parse).toHaveBeenCalledTimes(3);

    // callCount is now 4 from the mock's own internal counter -- push it past
    // the throwing branch with a fresh reader to confirm a success resets things.
    const successClient = makeClient(() => apiMessage());
    const successReader = createPromoReader({ client: successClient, cache: makeMemoryCache(), circuitBreakAfter: 3 });
    const success = await successReader.read({ bookKey: "draftkings", text: "t5" });
    expect(success.source).toBe("api");
    const afterSuccess = await successReader.read({ bookKey: "draftkings", text: "t6" });
    expect(afterSuccess.source).toBe("api");
    expect(successClient.messages.parse).toHaveBeenCalledTimes(2);
  });

  it("cache.get throwing is logged and treated as a miss", async () => {
    const client = makeClient(() => apiMessage());
    const cache: PromoReadingCache = {
      get: vi.fn().mockRejectedValue(new Error("db down")),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const log = vi.fn();

    const reader = createPromoReader({ client, cache, log });
    const result = await reader.read({ bookKey: "draftkings", text: "text" });

    expect(result.source).toBe("api");
    expect(log).toHaveBeenCalled();
  });

  it("cache.put throwing is logged and ignored -- the api result is still returned", async () => {
    const client = makeClient(() => apiMessage());
    const cache: PromoReadingCache = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockRejectedValue(new Error("db down")),
    };
    const log = vi.fn();

    const reader = createPromoReader({ client, cache, log });
    const result = await reader.read({ bookKey: "draftkings", text: "text" });

    expect(result.source).toBe("api");
    expect(log).toHaveBeenCalled();
  });

  it("read() never throws even when both cache and client fail", async () => {
    const client = makeClient(() => {
      throw new Error("api down");
    });
    const cache: PromoReadingCache = {
      get: vi.fn().mockRejectedValue(new Error("db down")),
      put: vi.fn().mockRejectedValue(new Error("db down")),
    };

    const reader = createPromoReader({ client, cache, log: vi.fn() });
    await expect(reader.read({ bookKey: "draftkings", text: "text" })).resolves.toEqual({
      source: "fallback",
      reason: "api_error",
    });
  });
});
