const UNDEFINED_TABLE = "42P01";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when err (or its .cause chain; drizzle wraps driver errors) is the
 * Postgres "undefined_table" error for the named table, i.e. its migration
 * has not been applied yet.
 */
export function isUndefinedTableErrorFor(err: unknown, tableName: string): boolean {
  const messageRe = new RegExp(`relation "${escapeRegExp(tableName)}" does not exist`);
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current !== null && typeof current === "object"; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (e.code === UNDEFINED_TABLE) return true;
    if (typeof e.message === "string" && messageRe.test(e.message)) return true;
    current = e.cause;
  }
  return false;
}
