"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { SaveBooksInputSchema } from "@/domain/books/bookSelection";
import { saveUserBooks } from "@/db/queries";

export type SaveBooksResponse =
  | { status: "ok"; bookKeys: string[] }
  | { status: "invalid"; fieldErrors: { bookKeys?: string[] } };

/**
 * Persists a user's book selection (DASH-02, D-12). requireUser() is the
 * first statement -- the user id comes ONLY from the session, never from
 * input (T-02-21) -- before any parsing or DB write. Deliberately imports
 * nothing from the odds-fetch pipeline: saving books never spends Odds API
 * credits or re-fetches odds (D-19, RESEARCH Pitfall 5). Revalidates "/"
 * (book-gated main page) and "/settings" (this same page) so both pick up
 * the new selection on next render.
 */
export async function saveBooks(input: unknown): Promise<SaveBooksResponse> {
  const user = await requireUser();

  const parsed = SaveBooksInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: { bookKeys?: string[] } = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "bookKeys") {
        (fieldErrors.bookKeys ??= []).push(issue.message);
      }
    }
    return { status: "invalid", fieldErrors };
  }

  const { bookKeys } = parsed.data;
  await saveUserBooks(user.userId, bookKeys);

  revalidatePath("/");
  revalidatePath("/settings");

  return { status: "ok", bookKeys };
}
