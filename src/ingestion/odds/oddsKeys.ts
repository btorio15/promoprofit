/**
 * Odds API key configuration (quick-261013-ny2). The raw `key` must only ever
 * flow to the HTTP client; logs, the database and the UI get the non-reversible
 * `id` fingerprint only.
 */
import { createHash } from "node:crypto";
import { FREE_TIER_MONTHLY_CREDITS } from "./quota";

/** Shared text: refresh.ts / refreshExtended.ts match it by equality. */
export const MISSING_KEY_MESSAGE = "ODDS_API_KEY is not set";

export type OddsKey = { key: string; id: string };

type Env = Record<string, string | undefined>;

/** First 8 hex chars of sha256(key): identifies a key without revealing it. */
export function keyFingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/**
 * ODDS_API_KEYS (comma list: trimmed, empties dropped, duplicates collapsed
 * keeping the first) wins; otherwise the single ODDS_API_KEY; otherwise [].
 */
export function configuredOddsKeys(env: Env = process.env): OddsKey[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const part of (env.ODDS_API_KEYS ?? "").split(",")) {
    const k = part.trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  if (keys.length === 0) {
    const single = env.ODDS_API_KEY?.trim();
    if (single) keys.push(single);
  }
  return keys.map((key) => ({ key, id: keyFingerprint(key) }));
}

/**
 * Owner of legacy (null key_id) credit rows: ODDS_API_KEY's fingerprint when
 * set, else the first ODDS_API_KEYS entry, else null.
 */
export function legacyKeyId(env: Env = process.env): string | null {
  const single = env.ODDS_API_KEY?.trim();
  if (single) return keyFingerprint(single);
  return configuredOddsKeys(env)[0]?.id ?? null;
}

/**
 * Highest balance wins (null counts as a fresh free-tier allotment); ties go
 * to the earlier candidate (strict `>`).
 */
export function pickKey<T extends { id: string }>(
  candidates: T[],
  balanceOf: (c: T) => number | null,
): T | null {
  let best: T | null = null;
  let bestBalance = -Infinity;
  for (const c of candidates) {
    const b = balanceOf(c) ?? FREE_TIER_MONTHLY_CREDITS;
    if (b > bestBalance) {
      best = c;
      bestBalance = b;
    }
  }
  return best;
}
