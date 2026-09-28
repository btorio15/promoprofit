import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { promoReadings } from "@/db/schema";
import type { PromoReadingCache } from "./promoReader";

/**
 * quick-260928-kc5: Postgres-backed PromoReadingCache (T-kc5-06). Errors are
 * NOT caught here -- promoReader.ts's read() wraps every cache call in its
 * own try/catch and logs+treats a failure as a miss, so this module stays a
 * thin, honest translation of the interface to SQL.
 */
export const promoReadingCache: PromoReadingCache = {
  async get(contentHash) {
    const db = getDb();
    const rows = await db
      .select({ reading: promoReadings.reading })
      .from(promoReadings)
      .where(eq(promoReadings.contentHash, contentHash))
      .limit(1);
    return rows[0]?.reading ?? null;
  },

  async put(row) {
    const db = getDb();
    await db
      .insert(promoReadings)
      .values({
        contentHash: row.contentHash,
        bookKey: row.bookKey,
        model: row.model,
        promptVersion: row.promptVersion,
        reading: row.reading,
      })
      .onConflictDoNothing();
  },
};
