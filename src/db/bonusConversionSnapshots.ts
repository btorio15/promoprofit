import { getDb } from "./client";
import { bonusConversionSnapshots } from "./schema";
import { getCachedEvents, getHedgeBookKeys } from "./queries";
import { buildConversionSnapshotRows, type ConversionSnapshotRow } from "@/domain/hedge/conversionSnapshot";

/**
 * Writes one scheduled run's conversion-rate rows. A book can only land once
 * per capturedAt (the primary key), so a retried run never double counts.
 */
export async function recordBonusConversionSnapshots(rows: ConversionSnapshotRow[]): Promise<void> {
  if (rows.length === 0) return;

  const db = getDb();
  await db.insert(bonusConversionSnapshots).values(rows).onConflictDoNothing();
}

/**
 * Called only from the scheduled run. Values a fixed $100.00 bonus bet at
 * every usable Colorado book from the already-cached odds (0 Odds API
 * credits), hedging at every usable book. Must never import src/ingestion.
 * The whole call (reads and write) never throws; a failure is logged only.
 */
export async function recordCurrentBonusConversionSnapshots(now: Date): Promise<void> {
  try {
    const { events, fetchedAt } = await getCachedEvents();
    if (fetchedAt === null) return;

    const bookKeys = await getHedgeBookKeys();
    const rows = buildConversionSnapshotRows({ events, now, bookKeys });
    await recordBonusConversionSnapshots(rows);
  } catch (err) {
    console.error("recordCurrentBonusConversionSnapshots: failed to record conversion snapshots", err);
  }
}
