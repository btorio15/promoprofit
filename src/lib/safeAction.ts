/**
 * quick-260930-iaw: server actions that throw (e.g. a transient
 * `NeonDbError: fetch failed`) inside startTransition escape to the page and
 * blank the whole site. Wrap each call in safeAction so the caller gets a
 * plain { ok: false } it can turn into an inline, retryable message.
 */
export const ACTION_FAILED_MESSAGE = "Couldn't reach the database — try again.";

export type SafeActionResult<T> = { ok: true; value: T } | { ok: false };

/** Next.js redirect()/notFound() are thrown control flow and must propagate. */
function isFrameworkControlError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

export async function safeAction<T>(
  call: () => Promise<T>,
  label: string,
): Promise<SafeActionResult<T>> {
  try {
    return { ok: true, value: await call() };
  } catch (err) {
    if (isFrameworkControlError(err)) throw err;
    // Logged only; the message is never shown in the UI (may hold connection details).
    console.error(`${label} failed:`, err);
    return { ok: false };
  }
}
