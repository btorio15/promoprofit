"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { SetBookCapInputSchema } from "@/domain/promos/yourCap";
import { deleteMemberBookCap, isBookCapsTableMissing, upsertMemberBookCap } from "@/db/bookCaps";
import { getUsableUserBooks } from "@/db/queries";

/**
 * quick-261014-u6k (T-u6k-01..03, T-u6k-06): set or clear the CURRENT
 * member's max bet for one of THEIR saved books. requireUser() is the first
 * statement; the strict schema has no userId field, so the row owner is only
 * ever the session user. The book must be among the member's usable saved
 * books or the request is rejected with one generic not_found.
 */
export type SetBookCapResponse =
  | { status: "ok" }
  | { status: "invalid"; message: string }
  | { status: "not_found"; message: string }
  | { status: "unavailable"; message: string };

export async function setBookCapAction(input: unknown): Promise<SetBookCapResponse> {
  const user = await requireUser();

  const parsed = SetBookCapInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", message: parsed.error.issues[0]?.message ?? "Enter an amount between $0.01 and $10,000." };
  }

  const { bookKey, maxStake } = parsed.data;

  const books = await getUsableUserBooks(user.userId);
  if (!books.some((book) => book.key === bookKey)) {
    return { status: "not_found", message: "That book isn't in your books." };
  }

  try {
    if (maxStake === null) {
      await deleteMemberBookCap({ userId: user.userId, bookKey });
    } else {
      await upsertMemberBookCap({
        userId: user.userId,
        bookKey,
        maxStake: new Decimal(maxStake).toFixed(2),
        now: new Date(),
      });
    }
  } catch (err) {
    if (isBookCapsTableMissing(err)) {
      return {
        status: "unavailable",
        message: "Your max bet can't be saved yet — the database update hasn't been applied.",
      };
    }
    throw err;
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { status: "ok" };
}
