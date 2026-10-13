/**
 * Per-refresh Odds API key selection (quick-261013-ny2). Called ONCE per
 * refresh, after the refresh lock is held: every Odds API call of that refresh
 * then runs on the single key returned here. Keys are only ever identified in
 * logs by their fingerprint.
 */
import type { Sport } from "@/domain/odds/schemas";
import { listSportsWithQuota, OddsApiError } from "./client";
import {
  configuredOddsKeys,
  keyFingerprint,
  legacyKeyId,
  MISSING_KEY_MESSAGE,
  pickKey,
  type OddsKey,
} from "./oddsKeys";
import { effectiveRemaining } from "./quota";
import {
  getLatestCreditUsage,
  getLatestCreditUsageByKey,
  latestRowForKey,
  type CreditUsageRow,
} from "./store";

export interface SelectedOddsKey {
  /** Raw key: pass to the HTTP client only, never log or store. */
  key: string;
  /** Fingerprint of the key (safe for logs and the credit_usage ledger). */
  id: string;
  sports: Sport[];
  /** The chosen key's balance (null only when neither the API nor the DB knows it). */
  priorRemaining: number | null;
  priorUsed: number | null;
  /** Latest credit row across ALL keys: the global confirm window / estimates. */
  globalLatest: CreditUsageRow | null;
}

interface Probed {
  candidate: OddsKey;
  sports: Sport[];
  remaining: number | null;
  used: number | null;
  dbRow: CreditUsageRow | null;
}

export async function selectOddsKeyForRefresh(
  now: Date,
  env: Record<string, string | undefined> = process.env,
): Promise<SelectedOddsKey> {
  const keys = configuredOddsKeys(env);
  if (keys.length === 0) throw new Error(MISSING_KEY_MESSAGE);

  const legacyId = legacyKeyId(env);
  const globalLatest = await getLatestCreditUsage();
  const byKey = await getLatestCreditUsageByKey();

  let candidates: { candidate: OddsKey; dbRow: CreditUsageRow | null }[];
  if (!byKey.keyColumn) {
    // Pre-0013: no rotation. The only candidate is ODDS_API_KEY itself (even if
    // not in ODDS_API_KEYS), else the first listed key; never charge another
    // key's spend to the legacy row.
    const single = env.ODDS_API_KEY?.trim();
    const candidate: OddsKey = single ? { key: single, id: keyFingerprint(single) } : keys[0];
    candidates = [{ candidate, dbRow: globalLatest }];
  } else {
    candidates = keys.map((candidate) => ({
      candidate,
      dbRow: latestRowForKey(byKey.byKeyId, candidate.id, legacyId),
    }));
  }

  // Free /sports probes: a typo'd or revoked key is never picked, and the real
  // x-requests-remaining reflects usage outside the app.
  const probed: Probed[] = [];
  let firstError: unknown = null;
  for (const { candidate, dbRow } of candidates) {
    try {
      const { sports, quota } = await listSportsWithQuota(candidate.key);
      probed.push({ candidate, sports, remaining: quota.remaining, used: quota.used, dbRow });
    } catch (err) {
      firstError ??= err;
      console.error("Odds API key probe failed", {
        keyId: candidate.id,
        status: err instanceof OddsApiError ? err.status : null,
      });
    }
  }
  if (probed.length === 0) throw firstError;

  const balanceOf = (p: Probed) => p.remaining ?? effectiveRemaining(p.dbRow, now);
  const chosen = pickKey(
    probed.map((p) => ({ ...p, id: p.candidate.id })),
    balanceOf,
  );
  if (!chosen) throw firstError;

  const dbEffective = effectiveRemaining(chosen.dbRow, now);
  return {
    key: chosen.candidate.key,
    id: chosen.candidate.id,
    sports: chosen.sports,
    priorRemaining: balanceOf(chosen),
    priorUsed: chosen.used ?? (dbEffective !== null ? (chosen.dbRow?.requestsUsed ?? null) : null),
    globalLatest,
  };
}
