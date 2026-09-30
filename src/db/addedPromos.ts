import { and, count, eq } from "drizzle-orm";
import { getDb } from "./client";
import { promos } from "./schema";
import type { AddedPromoInsert } from "@/domain/promos/buildAddedPromo";

/** Inserts one member-added promo and returns its id (D-09: live immediately, no review queue). */
export async function insertAddedPromo(values: AddedPromoInsert): Promise<number> {
  const db = getDb();
  const [row] = await db.insert(promos).values(values).returning({ id: promos.id });
  return row.id;
}

/** How many active promos this member has added (per-user cap, T-5-10). */
export async function countOwnActiveAddedPromos(userId: number): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(promos)
    .where(and(eq(promos.addedByUserId, userId), eq(promos.status, "active")));
  return Number(row?.n ?? 0);
}
