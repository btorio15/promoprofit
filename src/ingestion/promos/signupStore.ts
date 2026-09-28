import { and, eq, notInArray, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/db/client";
import { signupOffers } from "@/db/schema";
import type { SignupOfferInput } from "./signupOffers";

/**
 * quick-260928-mgi (owner decision 3): server-only Postgres write path for
 * sign-up offers -- a table deliberately separate from `promos` (see
 * schema.ts's doc comment), so this file never touches ranking, review, or
 * promo dedupe. Mirrors src/ingestion/promos/store.ts's db.batch pattern
 * for multi-statement atomicity.
 */

type Statement = BatchItem<"pg">;
type Db = ReturnType<typeof getDb>;

export interface CommitSignupOffersOutcome {
  upserted: number;
  expired: number;
}

function upsertStatementFor(db: Db, bookKey: string, offer: SignupOfferInput, now: Date): Statement {
  const expiresAt = offer.expiresAt ? new Date(offer.expiresAt) : null;

  return db
    .insert(signupOffers)
    .values({
      bookKey,
      dedupeKey: offer.dedupeKey,
      externalId: offer.externalId,
      title: offer.title,
      description: offer.description,
      rawText: offer.rawText,
      bonusAmount: offer.bonusAmount,
      sourceUrl: offer.sourceUrl,
      expiresAt,
      firstSeenAt: now,
      lastSeenAt: now,
      status: "active",
    })
    .onConflictDoUpdate({
      target: signupOffers.dedupeKey,
      // first_seen_at is deliberately never updated here -- it's the row's
      // original first-seen timestamp, set only on insert.
      set: {
        title: offer.title,
        description: offer.description,
        rawText: offer.rawText,
        bonusAmount: offer.bonusAmount,
        sourceUrl: offer.sourceUrl,
        expiresAt,
        lastSeenAt: now,
        status: "active",
      },
    });
}

/**
 * Upserts every offer AND expires the book's previously active offers not
 * among them, in ONE db.batch transaction. Unlike commitScrapedPromos, an
 * EMPTY `offers` list is never refused -- it still runs the expire
 * statement, because a successful scrape that saw no sign-up offers this
 * time means that book's previously-seen offers are gone. run.ts never
 * calls this on a failed book run (commitSignupOffersSafely is only reached
 * from the two "ok" branches).
 *
 * Statement order (expire first, then upserts) is a comment-only choice:
 * the expire statement's own WHERE clause already excludes every dedupeKey
 * in `offers` via NOT IN (only added when offers is non-empty, since an
 * empty NOT IN list is a Postgres no-op that would otherwise still
 * evaluate correctly, but is skipped here for clarity), so it can never
 * touch a row this same call is about to upsert, regardless of the batch's
 * own execution order.
 */
export async function commitSignupOffers(
  bookKey: string,
  offers: SignupOfferInput[],
  now: Date,
): Promise<CommitSignupOffersOutcome> {
  const db = getDb();

  const seenKeys = offers.map((offer) => offer.dedupeKey);
  const activeForBook = and(eq(signupOffers.bookKey, bookKey), eq(signupOffers.status, "active"))!;
  const expireWhere: SQL = seenKeys.length > 0 ? and(activeForBook, notInArray(signupOffers.dedupeKey, seenKeys))! : activeForBook;

  const expireStatement = db
    .update(signupOffers)
    .set({ status: "expired" })
    .where(expireWhere)
    .returning({ id: signupOffers.id });

  const upsertStatements = offers.map((offer) => upsertStatementFor(db, bookKey, offer, now));

  const [expiredRows] = await db.batch([expireStatement, ...upsertStatements] as [Statement, ...Statement[]]);

  return { upserted: offers.length, expired: expiredRows.length };
}
