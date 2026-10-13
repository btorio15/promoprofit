import { inArray } from "drizzle-orm";
import { getDb } from "./client";
import { profitSnapshots, promos } from "./schema";
import type { SnapshotRow } from "@/domain/stats/profitStats";

export interface NewProfitSnapshot {
  promoId: number;
  capturedAt: Date;
  denverDate: string;
  denverHour: number;
  sportKey: string;
  gameAt: Date | null;
  bookKey: string;
  guaranteedProfit: string;
}

/**
 * Writes one scheduled run's snapshot rows. A promo can only land once per
 * capturedAt (the primary key), so a retried run never double counts.
 */
export async function recordProfitSnapshots(entries: NewProfitSnapshot[]): Promise<void> {
  if (entries.length === 0) return;

  const db = getDb();
  await db.insert(profitSnapshots).values(entries).onConflictDoNothing();
}

/**
 * Game time per promo: the event's commence time, or the sport window start
 * for sport-wide promos. Used to place a snapshot on a game weekday.
 */
export async function loadGameTimes(promoIds: number[]): Promise<Map<number, Date | null>> {
  if (promoIds.length === 0) return new Map();

  const db = getDb();
  const rows = await db
    .select({
      id: promos.id,
      eventCommenceTime: promos.eventCommenceTime,
      windowStart: promos.windowStart,
    })
    .from(promos)
    .where(inArray(promos.id, promoIds));

  return new Map(rows.map((row) => [row.id, row.eventCommenceTime ?? row.windowStart ?? null]));
}

/** Every stored snapshot row, shaped for the pure aggregation in domain/stats. */
export async function loadProfitSnapshotRows(): Promise<SnapshotRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      promoId: profitSnapshots.promoId,
      capturedAt: profitSnapshots.capturedAt,
      denverHour: profitSnapshots.denverHour,
      sportKey: profitSnapshots.sportKey,
      gameAt: profitSnapshots.gameAt,
      guaranteedProfit: profitSnapshots.guaranteedProfit,
    })
    .from(profitSnapshots);

  return rows;
}
