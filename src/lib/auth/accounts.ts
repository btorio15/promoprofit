import { sql, eq, and, isNull, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { invites, users } from "@/db/schema";

/** A user row that includes secrets -- never returned by redeem/invite functions below. */
export interface UserRecord {
  id: number;
  email: string;
  displayName: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export type RedeemResult =
  | { status: "ok"; user: { id: number; email: string; displayName: string } }
  | { status: "invite_invalid" }
  | { status: "email_taken" };

/** Postgres unique_violation error code. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

/**
 * Redeems a single-use invite and creates a user, in ONE atomic SQL
 * statement (T-02-02, T-02-03, D-01). neon-http has no interactive
 * transactions, so the "claim the invite, then insert the user, then mark
 * the invite used" sequence is expressed as a single multi-CTE statement:
 *
 *   1. `claimed` selects the invite row FOR UPDATE, gated on
 *      used_at IS NULL AND expires_at > now -- so a concurrent redemption
 *      of the same token can claim it at most once.
 *   2. `new_user` inserts a user SELECTing FROM `claimed` -- if `claimed`
 *      has zero rows (invalid/used/expired token), the insert affects zero
 *      rows and no user is ever created (D-01: this is the ONLY insert
 *      site into users in the whole app).
 *   3. `updated_invite` marks the claimed invite used, pointing at the new
 *      user's id.
 *
 * A unique violation on users.email (email_taken) rolls back the entire
 * statement, so the invite is left unused and can still be redeemed with a
 * different email.
 */
export async function redeemInviteAndCreateUser(args: {
  tokenHash: string;
  email: string;
  displayName: string;
  passwordHash: string;
  now: Date;
}): Promise<RedeemResult> {
  const db = getDb();
  const { tokenHash, email, displayName, passwordHash, now } = args;

  try {
    const result = await db.execute<{ id: number; email: string; display_name: string }>(sql`
      WITH claimed AS (
        SELECT id FROM invites
        WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > ${now}
        FOR UPDATE
      ),
      new_user AS (
        INSERT INTO users (email, display_name, password_hash)
        SELECT ${email}, ${displayName}, ${passwordHash}
        FROM claimed
        RETURNING id, email, display_name
      ),
      updated_invite AS (
        UPDATE invites
        SET used_at = ${now}, used_by_user_id = (SELECT id FROM new_user)
        WHERE id = (SELECT id FROM claimed)
        RETURNING id
      )
      SELECT id, email, display_name FROM new_user
    `);

    const row = result.rows[0];
    if (!row) {
      return { status: "invite_invalid" };
    }

    return {
      status: "ok",
      user: { id: row.id, email: row.email, displayName: row.display_name },
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { status: "email_taken" };
    }
    throw err;
  }
}

/** Whether an unused, unexpired invite exists for this token hash. */
export async function isInviteRedeemable(tokenHash: string, now: Date): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: invites.id })
    .from(invites)
    .where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, now)))
    .limit(1);
  return rows.length > 0;
}

/** Creates a new single-use invite row (D-02). */
export async function createInvite(tokenHash: string, expiresAt: Date): Promise<void> {
  const db = getDb();
  await db.insert(invites).values({ tokenHash, expiresAt });
}

/**
 * Owner-script password reset (D-07). Also clears the lockout columns so a
 * locked-out user isn't stuck after a reset. Never selects/returns
 * password_hash. Returns whether a row was updated (false => no such
 * email).
 */
export async function setPasswordByEmail(email: string, passwordHash: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .update(users)
    .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  return rows.length > 0;
}
