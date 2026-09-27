/**
 * Dry-run matcher report for D-10 tuning (Plan 08 Task 3). Writes nothing
 * -- every promo currently `pending_review` or `active` is re-run through
 * matchPromo against the live cached-odds tables (zero Odds API credits,
 * D-07) and the result is printed, including the four signals, the
 * matched scope or best-guess/unresolvedTeamTexts, and per-book summary
 * counts. Use this to find false negatives before growing TEAM_ALIASES or
 * hardening matcher.ts's window logic.
 *
 * Usage: npm run promos:match-report
 */
import { inArray } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { promos } from "../src/db/schema";
import { getCachedEvents, getCachedExtendedEvents } from "../src/db/queries";
import { matchPromo, type MatchSignals } from "../src/domain/promos/matcher";
import { ScrapedPromoSchema } from "../src/domain/promos/scraped";
import type { ScopeGuess } from "../src/domain/promos/scope";

function scopeLabel(scope: ScopeGuess): string {
  if (scope.kind === "event") {
    return `event ${scope.eventId} (${scope.awayTeam} @ ${scope.homeTeam}, ${scope.commenceTime})`;
  }
  return `sport_window ${scope.sportKey} [${scope.windowStart} .. ${scope.windowEnd}]`;
}

async function main() {
  const db = getDb();

  const rows = await db
    .select({ id: promos.id, bookKey: promos.bookKey, status: promos.status, parsed: promos.parsed })
    .from(promos)
    .where(inArray(promos.status, ["pending_review", "active"]));

  const [moneylineResult, extendedResult] = await Promise.all([getCachedEvents(), getCachedExtendedEvents()]);
  console.log(
    `Cached events: moneyline=${moneylineResult.events.length} (fetched ${moneylineResult.fetchedAt?.toISOString() ?? "never"}), extended=${extendedResult.events.length} (fetched ${extendedResult.fetchedAt?.toISOString() ?? "never"})`,
  );
  console.log(`Promos to check (status pending_review or active): ${rows.length}\n`);

  const now = new Date();
  const matchedByBook = new Map<string, number>();
  const unmatchedByBook = new Map<string, number>();
  const signalFailByBook = new Map<string, Map<keyof MatchSignals, number>>();
  const unresolvedTexts = new Set<string>();

  for (const row of rows) {
    const parseResult = ScrapedPromoSchema.safeParse(row.parsed);
    if (!parseResult.success) {
      console.warn(`promo id=${row.id} (${row.bookKey}): stored parsed payload failed schema validation, skipping`);
      continue;
    }
    const parsed = parseResult.data;
    const match = matchPromo(parsed, { moneyline: moneylineResult.events, extended: extendedResult.events }, { now });

    console.log(`--- ${row.bookKey} #${row.id}: ${parsed.title}`);
    console.log(`  scopeText: ${JSON.stringify(parsed.scopeText)}`);
    console.log(`  teamsText: ${JSON.stringify(parsed.teamsText)}`);
    console.log(`  sportKeyHint: ${parsed.sportKeyHint ?? "null"}`);
    console.log(`  window: ${parsed.windowStart ?? "null"} .. ${parsed.windowEnd ?? "null"}`);
    console.log(`  pinned: ${parsed.pinned ? JSON.stringify(parsed.pinned) : "null"}`);
    console.log(`  signals: ${JSON.stringify(match.signals)}`);

    if (match.status === "matched") {
      console.log(`  MATCHED -> ${scopeLabel(match.scope)}${match.pinned ? ` pinned=${JSON.stringify(match.pinned)}` : ""}`);
      matchedByBook.set(row.bookKey, (matchedByBook.get(row.bookKey) ?? 0) + 1);
    } else {
      console.log(
        `  UNMATCHED -> guess: ${match.guess ? scopeLabel(match.guess) : "none"}; unresolvedTeamTexts: ${JSON.stringify(match.unresolvedTeamTexts)}`,
      );
      unmatchedByBook.set(row.bookKey, (unmatchedByBook.get(row.bookKey) ?? 0) + 1);
      for (const text of match.unresolvedTeamTexts) unresolvedTexts.add(text);

      const failures = signalFailByBook.get(row.bookKey) ?? new Map<keyof MatchSignals, number>();
      signalFailByBook.set(row.bookKey, failures);
      for (const [signal, ok] of Object.entries(match.signals) as [keyof MatchSignals, boolean][]) {
        if (!ok) failures.set(signal, (failures.get(signal) ?? 0) + 1);
      }
    }
    console.log("");
  }

  console.log("=== Summary ===");
  const books = new Set([...matchedByBook.keys(), ...unmatchedByBook.keys()]);
  for (const bookKey of books) {
    const matched = matchedByBook.get(bookKey) ?? 0;
    const unmatched = unmatchedByBook.get(bookKey) ?? 0;
    const failures = signalFailByBook.get(bookKey);
    const failureText = failures
      ? [...failures.entries()].map(([signal, count]) => `${signal}=${count}`).join(", ")
      : "none";
    console.log(`  ${bookKey}: matched=${matched}, unmatched=${unmatched} (failing signals: ${failureText})`);
  }
  console.log(`  Distinct unresolved team texts: ${JSON.stringify([...unresolvedTexts])}`);
}

main().catch((err) => {
  console.error("promos:match-report failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
