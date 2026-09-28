/**
 * quick-260928-kc5: zod-helper path confirmed by compile (Task 2 action 2) --
 * `client.messages.parse` + `zodOutputFormat(PromoReadingSchema)` from
 * `@anthropic-ai/sdk/helpers/zod` (which imports `zod/v4`) compiles cleanly
 * against this project's `zod@^4.6.5` under `npx tsc --noEmit`, so this file
 * uses the zodOutputFormat path -- NOT the `z.toJSONSchema` + manual
 * `messages.create` + `safeParse` fallback described in the plan as a
 * contingency.
 *
 * Server-only scrape code (T-kc5-05): never imported from src/app or
 * src/components (boundary.test.ts enforces this).
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  PROMO_READER_MODEL,
  PROMO_READER_PROMPT_VERSION,
  PROMO_READER_SYSTEM_PROMPT,
  PromoReadingSchema,
  readingCacheKey,
  type PromoReading,
} from "./promoReading";
import { promoReadingCache } from "./readerCache";

export type ReaderFallbackReason = "budget" | "circuit_open" | "api_error" | "refusal" | "max_tokens" | "parse_failed";

export type ReaderResult =
  | { source: "cache"; reading: PromoReading }
  | { source: "api"; reading: PromoReading; usage: { inputTokens: number; outputTokens: number } }
  | { source: "fallback"; reason: ReaderFallbackReason };

export interface PromoReader {
  read(input: { bookKey: string; text: string }): Promise<ReaderResult>;
}

export interface PromoReadingCache {
  get(contentHash: string): Promise<unknown | null>;
  put(row: { contentHash: string; bookKey: string; model: string; promptVersion: string; reading: PromoReading }): Promise<void>;
}

/**
 * Minimal structural type for the one client method this module calls.
 * Lets tests mock a fake client with `as unknown as PromoReaderClient`
 * instead of constructing a real `Anthropic` instance.
 */
export type PromoReaderClient = Pick<Anthropic, "messages">;

const DEFAULT_MAX_CALLS = 60;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CIRCUIT_BREAK_AFTER = 3;
const MAX_TOKENS = 1024;
const MAX_LOG_MESSAGE_CHARS = 200;

/** Never logs the API key, request headers, or anything beyond the error class name, HTTP status, and a truncated message (T-kc5-03). */
function describeError(err: unknown): string {
  const truncate = (message: string) => (message.length > MAX_LOG_MESSAGE_CHARS ? message.slice(0, MAX_LOG_MESSAGE_CHARS) : message);

  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.APIError) {
    const status = err.status !== undefined ? ` status=${err.status}` : "";
    return `${err.constructor.name}${status}: ${truncate(err.message)}`;
  }
  if (err instanceof Error) {
    return `${err.constructor.name}: ${truncate(err.message)}`;
  }
  return "unknown error";
}

/**
 * Builds a stateful PromoReader: one call-count and one consecutive-failure
 * count shared across every `read()` call on this instance (one instance per
 * scrape run, one shared cap/breaker across every book in that run --
 * requirement 5). Never throws; every failure mode becomes a `fallback`
 * result so the caller (readerPass.ts) can always fall back to the pattern
 * parser's own result (OD-3).
 */
export function createPromoReader(opts: {
  client: PromoReaderClient;
  cache: PromoReadingCache;
  maxCalls?: number;
  timeoutMs?: number;
  circuitBreakAfter?: number;
  log?: (msg: string) => void;
}): PromoReader {
  const maxCalls = opts.maxCalls ?? DEFAULT_MAX_CALLS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const circuitBreakAfter = opts.circuitBreakAfter ?? DEFAULT_CIRCUIT_BREAK_AFTER;
  const log = opts.log ?? console.warn;

  let callCount = 0;
  let consecutiveFailures = 0;

  return {
    async read({ bookKey, text }): Promise<ReaderResult> {
      const contentHash = readingCacheKey(bookKey, text);

      try {
        const cached = await opts.cache.get(contentHash);
        if (cached !== null && cached !== undefined) {
          const parsedCache = PromoReadingSchema.safeParse(cached);
          if (parsedCache.success) {
            return { source: "cache", reading: parsedCache.data };
          }
        }
      } catch (err) {
        log(`promoReader: cache.get failed for ${bookKey}: ${describeError(err)}`);
      }

      if (callCount >= maxCalls) {
        return { source: "fallback", reason: "budget" };
      }
      if (consecutiveFailures >= circuitBreakAfter) {
        return { source: "fallback", reason: "circuit_open" };
      }

      callCount++;

      try {
        const response = await opts.client.messages.parse(
          {
            model: PROMO_READER_MODEL,
            max_tokens: MAX_TOKENS,
            system: PROMO_READER_SYSTEM_PROMPT,
            messages: [{ role: "user", content: text }],
            output_config: { format: zodOutputFormat(PromoReadingSchema) },
          },
          { timeout: timeoutMs },
        );

        if (response.stop_reason === "refusal") {
          consecutiveFailures++;
          return { source: "fallback", reason: "refusal" };
        }
        if (response.stop_reason === "max_tokens") {
          consecutiveFailures++;
          return { source: "fallback", reason: "max_tokens" };
        }
        if (response.parsed_output === null) {
          consecutiveFailures++;
          return { source: "fallback", reason: "parse_failed" };
        }

        consecutiveFailures = 0;
        const reading = response.parsed_output;

        try {
          await opts.cache.put({
            contentHash,
            bookKey,
            model: PROMO_READER_MODEL,
            promptVersion: PROMO_READER_PROMPT_VERSION,
            reading,
          });
        } catch (err) {
          log(`promoReader: cache.put failed for ${bookKey}: ${describeError(err)}`);
        }

        return {
          source: "api",
          reading,
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        };
      } catch (err) {
        consecutiveFailures++;
        log(`promoReader: API call failed for ${bookKey}: ${describeError(err)}`);
        return { source: "fallback", reason: "api_error" };
      }
    },
  };
}

/**
 * Returns null when ANTHROPIC_API_KEY is unset (OD-3: a missing key falls
 * back to the pattern parsers, never fails the job). The real client reads
 * the key from env itself; this module never reads or logs the key value.
 */
export function createDefaultPromoReader(opts?: { maxCalls?: number }): PromoReader | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic({ timeout: DEFAULT_TIMEOUT_MS, maxRetries: 2 });
  return createPromoReader({ client, cache: promoReadingCache, maxCalls: opts?.maxCalls });
}
