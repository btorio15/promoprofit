"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  ADDED_PROMO_MAX_ACTIVE,
  AddPromoInputSchema,
  MSG_EXPIRY_PASSED,
  MSG_GAME_GONE,
  MSG_GAME_INVALID,
  MSG_PICK_BOOK,
  MSG_TOO_MANY,
  fieldErrorsFromIssues,
  type AddedPromoResponse,
} from "@/domain/promos/addedPromoInput";
import { buildAddedPromoRow, etExpiryInstant } from "@/domain/promos/buildAddedPromo";
import { resolveMemberScope } from "@/domain/promos/memberScope";
import type { ScopeGuess } from "@/domain/promos/scope";
import { getCachedEvents, getCachedExtendedEvents, getUsableUserBooks } from "@/db/queries";
import { countOwnActiveAddedPromos, insertAddedPromo } from "@/db/addedPromos";

/**
 * Phase 5: a member adds a promo for themselves (D-07/D-09). requireUser() is
 * the literal first statement; the owner is always user.userId (the input
 * schema has no owner field). The book must be one the member actually has
 * (D-08), any chosen game/league scope is re-resolved server-side against the
 * cached odds (D-04), and the row goes live immediately as 'active' with no
 * review queue.
 */
export async function addPromo(input: unknown): Promise<AddedPromoResponse> {
  const user = await requireUser();

  const parsed = AddPromoInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  }
  const data = parsed.data;

  const books = await getUsableUserBooks(user.userId);
  const book = books.find((b) => b.key === data.bookKey);
  if (!book) {
    return { status: "invalid", fieldErrors: { bookKey: [MSG_PICK_BOOK] } };
  }

  if ((await countOwnActiveAddedPromos(user.userId)) >= ADDED_PROMO_MAX_ACTIVE) {
    return { status: "invalid", fieldErrors: { form: [MSG_TOO_MANY] } };
  }

  const now = new Date();
  const expiresIso = etExpiryInstant(data.expires.etDate, data.expires.etTime);
  if (expiresIso === null || new Date(expiresIso).getTime() <= now.getTime()) {
    return { status: "invalid", fieldErrors: { expires: [MSG_EXPIRY_PASSED] } };
  }

  let scope: ScopeGuess | { kind: "any" } = { kind: "any" };
  if (data.scope) {
    const [{ events: moneyline }, { events: extended }] = await Promise.all([
      getCachedEvents(),
      getCachedExtendedEvents(),
    ]);
    const scopeResult = resolveMemberScope(
      data.scope.kind === "event"
        ? { kind: "event", eventId: data.scope.eventId }
        : {
            kind: "sport_day",
            sportKey: data.scope.sportKey,
            etDate: data.scope.etDate,
            ...(data.scope.etEndDate !== undefined ? { etEndDate: data.scope.etEndDate } : {}),
          },
      { moneyline, extended },
      now,
    );
    if (scopeResult.status === "stale") {
      return { status: "stale", message: MSG_GAME_GONE };
    }
    if (scopeResult.status === "invalid") {
      return { status: "invalid", fieldErrors: { scope: [MSG_GAME_INVALID] } };
    }
    scope = scopeResult.scope;
  }

  const built = buildAddedPromoRow({
    input: data,
    scope,
    bookName: book.displayName,
    now,
    expiresAt: new Date(expiresIso),
    userId: user.userId,
    dedupeKey: `added:${crypto.randomUUID()}`,
  });
  if (!built.ok) {
    return { status: "invalid", fieldErrors: { form: ["Something is off with that promo. Check the fields and try again."] } };
  }

  const promoId = await insertAddedPromo(built.values);

  revalidatePath("/");
  return { status: "ok", promoId };
}
