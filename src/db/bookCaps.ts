import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { userBookCaps } from "./schema";
import { isUndefinedTableErrorFor } from "./undefinedTable";

/**
 * quick-261014-u6k: per-member max bet per book. This module holds the ONLY
 * read and write paths for user_book_caps. The scraper never imports it
 * (boundary-tested).
 */

const TABLE = "user_book_caps";

/** True when err is the undefined-table error for user_book_caps (migration 0016 not applied). */
export function isBookCapsTableMissing(err: unknown): boolean {
  return isUndefinedTableErrorFor(err, TABLE);
}

let warnedMissingTable = false;

/**
 * One member's max bets keyed by book key. Degrades to "none set" ONLY when
 * the table is missing (migration not applied); any other error is rethrown.
 */
export async function getMemberBookCaps(userId: number): Promise<Map<string, string>> {
  try {
    const rows = await getDb()
      .select({ bookKey: userBookCaps.bookKey, maxStake: userBookCaps.maxStake })
      .from(userBookCaps)
      .where(eq(userBookCaps.userId, userId));
    return new Map(rows.map((row) => [row.bookKey, row.maxStake]));
  } catch (err) {
    if (isBookCapsTableMissing(err)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          "getMemberBookCaps: user_book_caps table not found (migration 0016 not applied yet); treating as no per-book caps",
        );
      }
      return new Map();
    }
    throw err;
  }
}

export async function upsertMemberBookCap(input: {
  userId: number;
  bookKey: string;
  maxStake: string;
  now: Date;
}): Promise<void> {
  await getDb()
    .insert(userBookCaps)
    .values({ userId: input.userId, bookKey: input.bookKey, maxStake: input.maxStake, updatedAt: input.now })
    .onConflictDoUpdate({
      target: [userBookCaps.userId, userBookCaps.bookKey],
      set: { maxStake: input.maxStake, updatedAt: input.now },
    });
}

/** Idempotent: no row is fine. */
export async function deleteMemberBookCap(input: { userId: number; bookKey: string }): Promise<void> {
  await getDb()
    .delete(userBookCaps)
    .where(and(eq(userBookCaps.userId, input.userId), eq(userBookCaps.bookKey, input.bookKey)));
}
