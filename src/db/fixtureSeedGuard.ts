/**
 * Guard for `npm run db:seed -- --fixtures` (WR-04). Fixture events carry
 * made-up prices but are written to the same cached_odds table the finder
 * ranks from, with fetched_at = now, so they would be shown to users as
 * fresh, real opportunities. The only configured DB is the shared one, so
 * the fixture seed must be an explicit opt-in and must never mix into a
 * cache that already holds live Odds API data.
 */
export const ALLOW_FIXTURE_SEED_ENV = "ALLOW_FIXTURE_SEED";

export interface FixtureSeedGuardInput {
  /** Value of process.env.ALLOW_FIXTURE_SEED. */
  allowFlag: string | undefined;
  /** Whether any real odds refresh has ever run (a credit_usage row exists). */
  liveRefreshHasRun: boolean;
}

/** Returns a refusal message, or null when the fixture seed may proceed. */
export function fixtureSeedRefusal(i: FixtureSeedGuardInput): string | null {
  if (i.allowFlag !== "1") {
    return (
      `Refusing to seed fixture odds: they are fake prices that the finder would show as real. ` +
      `Set ${ALLOW_FIXTURE_SEED_ENV}=1 to seed them into a throwaway/dev database.`
    );
  }
  if (i.liveRefreshHasRun) {
    return (
      "Refusing to seed fixture odds: this database already holds live Odds API data " +
      "(a credit_usage row exists). Fixtures would be mixed in with real odds."
    );
  }
  return null;
}
