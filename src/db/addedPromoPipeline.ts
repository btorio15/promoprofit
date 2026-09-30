import {
  MSG_EXPIRY_PASSED,
  MSG_GAME_GONE,
  MSG_GAME_INVALID,
  MSG_PICK_BOOK,
  MSG_PIN_GONE,
  type AddPromoInput,
  type AddedPromoResponse,
} from "@/domain/promos/addedPromoInput";
import {
  buildAddedPromoRow,
  etExpiryInstant,
  type AddedPin,
  type AddedPromoInsert,
} from "@/domain/promos/buildAddedPromo";
import { resolveMemberScope } from "@/domain/promos/memberScope";
import { resolveSelection } from "@/domain/promos/selection";
import type { PromoSelection } from "@/domain/promos/types";
import type { ScopeGuess } from "@/domain/promos/scope";
import { getCachedEvents, getCachedExtendedEvents, getUsableUserBooks } from "./queries";

/**
 * Shared server validation for adding and editing a member promo (T-5-input):
 * usable-book check, expiry, scope + pin re-resolution against the cached
 * odds, and the row build. Plain module (no server-action directive) so both
 * actions can import it. The callers own requireUser, input parsing, the
 * active cap and the write.
 */
export async function prepareAddedPromoValues(args: {
  userId: number;
  data: AddPromoInput;
  now: Date;
  dedupeKey: string;
}): Promise<{ ok: true; values: AddedPromoInsert } | { ok: false; response: AddedPromoResponse }> {
  const { userId, data, now, dedupeKey } = args;

  const books = await getUsableUserBooks(userId);
  const book = books.find((b) => b.key === data.bookKey);
  if (!book) {
    return { ok: false, response: { status: "invalid", fieldErrors: { bookKey: [MSG_PICK_BOOK] } } };
  }

  let expiresAt: Date | null = null;
  if (data.expires) {
    const expiresIso = etExpiryInstant(data.expires.etDate, data.expires.etTime);
    if (expiresIso === null || new Date(expiresIso).getTime() <= now.getTime()) {
      return { ok: false, response: { status: "invalid", fieldErrors: { expires: [MSG_EXPIRY_PASSED] } } };
    }
    expiresAt = new Date(expiresIso);
  }

  let scope: ScopeGuess | { kind: "any" } = { kind: "any" };
  let pinned: AddedPin | null = null;
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
      return { ok: false, response: { status: "stale", message: MSG_GAME_GONE } };
    }
    if (scopeResult.status === "invalid") {
      return { ok: false, response: { status: "invalid", fieldErrors: { scope: [MSG_GAME_INVALID] } } };
    }
    scope = scopeResult.scope;

    // T-5-09: a boost's market/side pin is re-resolved against the cached odds.
    if (data.promoType === "profit_boost" && data.scope.kind === "event" && data.scope.pinned && scopeResult.event) {
      const { marketType, line, side } = data.scope.pinned;
      const sel: PromoSelection = { eventId: scopeResult.event.id, marketType, line, side };
      const resolved =
        marketType === "moneyline"
          ? (resolveSelection(moneyline, sel) ?? resolveSelection(extended, sel))
          : resolveSelection(extended, sel);
      if (!resolved) {
        return { ok: false, response: { status: "invalid", fieldErrors: { pinned: [MSG_PIN_GONE] } } };
      }
      const selectionText =
        side === "home"
          ? scopeResult.event.home_team
          : side === "away"
            ? scopeResult.event.away_team
            : side === "over"
              ? "Over"
              : "Under";
      pinned = { marketType, line, side, selectionText };
    }
  }

  const built = buildAddedPromoRow({
    input: data,
    scope,
    bookName: book.displayName,
    now,
    expiresAt,
    pinned,
    userId,
    dedupeKey,
  });
  if (!built.ok) {
    return {
      ok: false,
      response: {
        status: "invalid",
        fieldErrors: { form: ["Something is off with that promo. Check the fields and try again."] },
      },
    };
  }
  return { ok: true, values: built.values };
}
