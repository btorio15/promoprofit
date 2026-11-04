import { and, desc, eq } from "drizzle-orm";
import {
  NoSweatCorrectionSchema,
  TrackedNoSweatSnapshotSchema,
  type NoSweatCorrection,
  type TrackedNoSweatSnapshot,
} from "@/domain/promos/noSweatSnapshot";
import { getDb } from "./client";
import { trackedNoSweats } from "./schema";
import { isUndefinedTableErrorFor } from "./undefinedTable";

/**
 * Phase 9 (FEED-05): the ONLY read/write path for tracked_no_sweats. Every
 * statement is filtered by the session user id passed by the caller (T-09-04).
 * These rows never count toward totals; settling writes a promo_completions row.
 */

const TABLE = "tracked_no_sweats";

/** True when err is the undefined-table error for tracked_no_sweats (migration 0018 not applied). */
export function isTrackedNoSweatsTableMissing(err: unknown): boolean {
  return isUndefinedTableErrorFor(err, TABLE);
}

export type TrackedNoSweatRow = {
  promoId: number;
  state: "tracking" | "awaiting_refund";
  trackedAt: Date;
  outcome: "lost" | null;
  outcomeAt: Date | null;
  correction: NoSweatCorrection | null;
  snapshot: TrackedNoSweatSnapshot;
};

let warnedMissingTable = false;
function warnMissingOnce(fn: string): void {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn(`${fn}: tracked_no_sweats table not found (migration 0018 not applied yet); treating as none tracked`);
}

type RawRow = {
  promoId: number;
  state: string;
  trackedAt: Date;
  outcome: string | null;
  outcomeAt: Date | null;
  correction: unknown;
  snapshot: unknown;
};

function parseRow(raw: RawRow): TrackedNoSweatRow | null {
  const snapshot = TrackedNoSweatSnapshotSchema.safeParse(raw.snapshot);
  if (!snapshot.success) {
    console.warn(`tracked_no_sweats: dropping promo ${raw.promoId} (snapshot failed validation)`);
    return null;
  }
  if (raw.state !== "tracking" && raw.state !== "awaiting_refund") {
    console.warn(`tracked_no_sweats: dropping promo ${raw.promoId} (unknown state)`);
    return null;
  }
  let correction: NoSweatCorrection | null = null;
  if (raw.correction !== null && raw.correction !== undefined) {
    const parsed = NoSweatCorrectionSchema.safeParse(raw.correction);
    if (parsed.success) correction = parsed.data;
    else console.warn(`tracked_no_sweats: ignoring invalid correction on promo ${raw.promoId}`);
  }
  return {
    promoId: raw.promoId,
    state: raw.state,
    trackedAt: raw.trackedAt,
    outcome: raw.outcome === "lost" ? "lost" : null,
    outcomeAt: raw.outcomeAt,
    correction,
    snapshot: snapshot.data,
  };
}

const columns = {
  promoId: trackedNoSweats.promoId,
  state: trackedNoSweats.state,
  trackedAt: trackedNoSweats.trackedAt,
  outcome: trackedNoSweats.outcome,
  outcomeAt: trackedNoSweats.outcomeAt,
  correction: trackedNoSweats.correction,
  snapshot: trackedNoSweats.snapshot,
};

/** Every no-sweat THIS member tracks, newest first. Degrades to [] if the table is missing. */
export async function getTrackedNoSweats(userId: number): Promise<TrackedNoSweatRow[]> {
  try {
    const rows = await getDb()
      .select(columns)
      .from(trackedNoSweats)
      .where(eq(trackedNoSweats.userId, userId))
      .orderBy(desc(trackedNoSweats.trackedAt));
    return rows.map(parseRow).filter((r): r is TrackedNoSweatRow => r !== null);
  } catch (err) {
    if (isTrackedNoSweatsTableMissing(err)) {
      warnMissingOnce("getTrackedNoSweats");
      return [];
    }
    throw err;
  }
}

export async function getTrackedNoSweat(userId: number, promoId: number): Promise<TrackedNoSweatRow | null> {
  try {
    const rows = await getDb()
      .select(columns)
      .from(trackedNoSweats)
      .where(and(eq(trackedNoSweats.userId, userId), eq(trackedNoSweats.promoId, promoId)));
    const raw = rows[0];
    return raw ? parseRow(raw) : null;
  } catch (err) {
    if (isTrackedNoSweatsTableMissing(err)) {
      warnMissingOnce("getTrackedNoSweat");
      return null;
    }
    throw err;
  }
}

/** Idempotent: true only when a new row was inserted. */
export async function insertTrackedNoSweat(input: {
  userId: number;
  promoId: number;
  snapshot: TrackedNoSweatSnapshot;
  now: Date;
}): Promise<boolean> {
  const inserted = await getDb()
    .insert(trackedNoSweats)
    .values({
      userId: input.userId,
      promoId: input.promoId,
      state: "tracking",
      trackedAt: input.now,
      snapshot: input.snapshot,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: [trackedNoSweats.userId, trackedNoSweats.promoId] })
    .returning({ promoId: trackedNoSweats.promoId });
  return inserted.length > 0;
}

/** Untrack: only allowed while still 'tracking'. */
export async function deleteTrackedNoSweat(input: { userId: number; promoId: number }): Promise<boolean> {
  const deleted = await getDb()
    .delete(trackedNoSweats)
    .where(
      and(
        eq(trackedNoSweats.userId, input.userId),
        eq(trackedNoSweats.promoId, input.promoId),
        eq(trackedNoSweats.state, "tracking"),
      ),
    )
    .returning({ promoId: trackedNoSweats.promoId });
  return deleted.length > 0;
}

/** tracking -> awaiting_refund (one UPDATE with a state precondition). */
export async function markTrackedLost(input: {
  userId: number;
  promoId: number;
  correction: NoSweatCorrection | null;
  now: Date;
}): Promise<boolean> {
  const updated = await getDb()
    .update(trackedNoSweats)
    .set({
      state: "awaiting_refund",
      outcome: "lost",
      outcomeAt: input.now,
      correction: input.correction,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(trackedNoSweats.userId, input.userId),
        eq(trackedNoSweats.promoId, input.promoId),
        eq(trackedNoSweats.state, "tracking"),
      ),
    )
    .returning({ promoId: trackedNoSweats.promoId });
  return updated.length > 0;
}

/** awaiting_refund -> tracking (one UPDATE with a state precondition). */
export async function revertTrackedToTracking(input: {
  userId: number;
  promoId: number;
  now: Date;
}): Promise<boolean> {
  const updated = await getDb()
    .update(trackedNoSweats)
    .set({ state: "tracking", outcome: null, outcomeAt: null, correction: null, updatedAt: input.now })
    .where(
      and(
        eq(trackedNoSweats.userId, input.userId),
        eq(trackedNoSweats.promoId, input.promoId),
        eq(trackedNoSweats.state, "awaiting_refund"),
      ),
    )
    .returning({ promoId: trackedNoSweats.promoId });
  return updated.length > 0;
}
