import { ACTION_FAILED_MESSAGE, type SafeActionResult } from "@/lib/safeAction";
import type { SaveBooksResponse } from "@/app/actions/save-books";

const MIN_ONE_BOOK_MESSAGE = "Select at least one book.";

export type SaveBooksOutcome =
  | { kind: "error"; message: string }
  | { kind: "saved"; bookKeys: string[] };

/** Pure mapping of a safeAction(saveBooks) result to the books form's next UI state. */
export function resolveSaveBooksOutcome(
  call: SafeActionResult<SaveBooksResponse>,
  context: "settings" | "onboarding",
): SaveBooksOutcome {
  if (!call.ok) return { kind: "error", message: ACTION_FAILED_MESSAGE };
  const result = call.value;
  if (result.status === "invalid") {
    const fallback =
      context === "settings"
        ? "Select at least one book to save."
        : "Select at least one book to continue.";
    const message = result.fieldErrors.bookKeys?.[0];
    return {
      kind: "error",
      message: message === MIN_ONE_BOOK_MESSAGE ? fallback : (message ?? fallback),
    };
  }
  return { kind: "saved", bookKeys: result.bookKeys };
}
