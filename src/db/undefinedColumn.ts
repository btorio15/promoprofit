const UNDEFINED_COLUMN = "42703";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when err (or its .cause chain; drizzle wraps driver errors) is the
 * Postgres "undefined_column" error for the named column, i.e. its migration
 * has not been applied yet. Handles both phrasings: select
 * (`column t.col does not exist`) and insert (`column "col" of relation "t"
 * does not exist`).
 */
export function isUndefinedColumnErrorFor(err: unknown, columnName: string): boolean {
  const col = escapeRegExp(columnName);
  const messageRe = new RegExp(`column (?:"${col}"|[\\w"]+\\.${col}) (?:of relation "[^"]+" )?does not exist`);
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    const message = typeof e.message === "string" ? e.message : null;
    if (e.code === UNDEFINED_COLUMN) {
      if (message === null) return true;
      if (messageRe.test(message)) return true;
    } else if (message !== null && e.code === undefined && messageRe.test(message)) {
      return true;
    }
    current = e.cause;
  }
  return false;
}
