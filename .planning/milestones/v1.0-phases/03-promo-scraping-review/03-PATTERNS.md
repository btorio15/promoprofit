# Phase 3: Promo Scraping & Review - Pattern Map

**Mapped:** 2026-09-27
**Files analyzed:** 22 (new/modified)
**Analogs found:** 20 / 22 (2 have no in-repo analog — first-of-kind: GH Actions workflow, scraper workspace)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/domain/hedge/profitBoost.ts` | service (pure domain fn) | transform | `src/domain/hedge/arbMath.ts` (cap/kink candidate search) + `src/domain/hedge/bonusBet.ts` (stake-not-returned solver shape) | exact |
| `src/domain/hedge/profitBoost.test.ts` | test | transform | `src/domain/hedge/arbMath.test.ts` / `bonusBet.test.ts` | exact |
| `src/domain/promos/matcher.ts` | service (pure domain fn) | transform | `src/domain/hedge/marketFilter.ts` (pure fn over `OddsEvent[]`, zero I/O) | role-match |
| `src/domain/promos/matcher.test.ts` | test | transform | `src/domain/hedge/marketFilter.test.ts` | role-match |
| `src/domain/promos/aliases.ts` | config/utility | transform | `src/config/books.ts` (static config array + lookup helpers) | role-match |
| `src/domain/promos/dedupe.ts` | utility | transform | `src/domain/hedge/americanOdds.ts` (small pure helper module) | partial |
| `src/domain/promos/rankPromoHedges.ts` (implied — Promos tab needs a ranking layer analogous to `rankBonusBetHedges`) | service (pure domain fn) | transform | `src/domain/hedge/rankBonusBetHedges.ts` | exact |
| `src/db/schema.ts` (EXTEND: `promos`, `scrapeRuns`, `teamAliases`/dedupe columns) | model | CRUD | `src/db/schema.ts` existing tables (`cachedOdds`, `creditUsage`, `refreshLock`) | exact |
| `src/db/queries.ts` (EXTEND: promo/queue/scrape-status queries) | model/query | CRUD | `src/db/queries.ts` existing (`getUsableUserBooks`, `getCachedEvents`, `saveUserBooks`) | exact |
| `src/app/actions/confirm-promo-match.ts` | controller (server action) | request-response | `src/app/actions/save-books.ts` | exact |
| `src/app/actions/correct-promo-match.ts` | controller (server action) | request-response | `src/app/actions/save-books.ts` | exact |
| `src/app/actions/dismiss-promo.ts` | controller (server action) | request-response | `src/app/actions/save-books.ts` | exact |
| `src/app/actions/flag-promo-match.ts` | controller (server action) | request-response | `src/app/actions/save-books.ts` | exact |
| `src/app/actions/enter-promo-caps.ts` (implied by D-18 cap-review sub-panel) | controller (server action) | request-response | `src/app/actions/refresh-spreads-totals.ts` (Zod input → domain fn → typed outcome, attribution) | role-match |
| `src/components/promos/PromosScreen.tsx` | component | request-response | `src/components/arb/ArbScreen.tsx` / `src/components/finder/FinderScreen.tsx` | exact |
| `src/components/promos/PromoRow.tsx` | component | request-response | `src/components/finder/ResultRow.tsx` | exact |
| `src/components/promos/PromoDetails.tsx` | component | request-response | `src/components/finder/ResultDetails.tsx` | exact |
| `src/components/promos/ScrapeStatusPanel.tsx` | component | request-response | `src/components/finder/OddsStatusBar.tsx` (status line + warning icon, minus the refresh button) | role-match |
| `src/components/promos/QueueItemCard.tsx` | component | request-response | `src/components/arb/MultipleBooksPopover.tsx` (inline stop-propagation actions) + `src/components/finder/RefreshConfirmDialog.tsx` (button/state shape) | partial |
| `src/components/promos/DismissPromoDialog.tsx` | component | request-response | `src/components/finder/RefreshConfirmDialog.tsx` | exact |
| `src/components/promos/PromosEmptyState.tsx` | component | request-response | `src/components/finder/EmptyState.tsx` | exact |
| `src/components/AppShell.tsx` (EXTEND: third tab) | component | request-response | `src/components/AppShell.tsx` itself (existing two-tab shape) | exact |
| `scrapers/ballybet.ts` (scraper entry point) | script (standalone workspace) | file-I/O / event-driven (cron-triggered) | `scripts/refresh-odds.ts` (CLI wrapper pattern) — different workspace, same "wrap a pure/async fn, exit-code by outcome" shape | role-match |
| `.github/workflows/scrape-promos.yml` | config | event-driven | none in repo | no analog |

## Pattern Assignments

### `src/domain/hedge/profitBoost.ts` (service, transform)

**Analog:** `src/domain/hedge/arbMath.ts` (cap-driven candidate search) and `src/domain/hedge/bonusBet.ts` (single-stake-returned-leg solver structure)

**Imports pattern** (`arbMath.ts` lines 1-2):
```typescript
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
```

**Local-precision-clone + noise-cleanup pattern** (`arbMath.ts` lines 31-45, identical in `bonusBet.ts` lines 25-39):
```typescript
// Local clone so this module never mutates the shared global Decimal config.
const LocalDecimal = Decimal.clone({ precision: 40 });

// American odds like -300 (1 + 1/3) or -275 (1 + 4/11) have no exact base-10
// representation, so every division/multiplication through them carries an
// unavoidable truncation of a few units in the ~38th-40th decimal place
// (see americanOdds.ts). ... Snapping to 20 decimal places with normal
// rounding erases that noise ... while leaving genuine sub-cent content
// untouched.
function clean(value: Decimal): Decimal {
  return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
}
```
Copy this verbatim into `profitBoost.ts` — RESEARCH.md's own code sketch (Code Examples section) already assumes it.

**Core candidate-search pattern to extend** (`arbMath.ts` lines 41-56, 108-178): the `Candidate` interface + the "evaluate a small set of exact candidates, take the max, tie-break to smaller stake" loop is the shape `profitBoost.ts`'s cap-binding solver must follow (per RESEARCH.md "Boost Stake Optimization Under Caps"). Reuse the tie-break comparator exactly:
```typescript
const isBetter =
  best === null ||
  guaranteedProfit.gt(best.guaranteedProfit) ||
  (guaranteedProfit.equals(best.guaranteedProfit) && hedgeStake.lt(best.hedgeStake));
```
(from `bonusBet.ts` lines 94-97 — same rule RESEARCH.md's sketch uses).

**Cent-floor payout discipline** (`bonusBet.ts` lines 64-68, `arbMath.ts` lines 123-125):
```typescript
// Books pay whole cents; flooring is the conservative assumption everywhere.
const bonusPayout = clean(bonusAmount.times(bonusDecimalOdds.minus(1))).toDecimalPlaces(
  2,
  Decimal.ROUND_DOWN,
);
```

**Validation pattern** (`bonusBet.ts` lines 52-59, `arbMath.ts` lines 61-68) — throw `RangeError` on invalid magnitude/precision inputs at the top of the function, before any Decimal math:
```typescript
if (bonusAmount.lte(0)) {
  throw new RangeError(`bonusAmount must be greater than 0, got ${bonusAmount.toString()}`);
}
if (bonusAmount.decimalPlaces() > 2) {
  throw new RangeError(
    `bonusAmount must have at most 2 decimal places, got ${bonusAmount.toString()}`,
  );
}
```

**Non-profitable exclusion pattern** (`arbMath.ts` lines 184-186) — return `null`, never a $0-or-negative result:
```typescript
if (chosen === null || chosen.guaranteedProfit.lte(0)) {
  return null;
}
```

**Pitfall guard (do NOT do this):** do not add a `stakeReturned: boolean` flag to `bonusBet.ts` or a shared "generic hedge" function — RESEARCH.md Pitfall 3 and CONTEXT.md's own "Claude's Discretion" note both require `profitBoost.ts` as its own module, same-file-neighbor to `bonusBet.ts`/`arbMath.ts`, not a parameterized extension of either.

---

### `src/domain/promos/matcher.ts` (service, transform)

**Analog:** `src/domain/hedge/marketFilter.ts`

**Imports pattern** (lines 1-2):
```typescript
import type { OddsEvent } from "@/domain/odds/schemas";
import { isTieRiskSport } from "@/config/sports";
```

**Pure-function-over-plain-data discipline** (lines 26-31, whole-file shape): the matcher takes `(parsedPromo, events: OddsEvent[], opts)` and returns a plain result — no DB reads, no clock reads except via an injected `now`:
```typescript
export interface MarketFilterOptions {
  now: Date;
  windowDays: number;
  allowedBookKeys: ReadonlySet<string>;
  sportKeys: ReadonlySet<string>;
}
```
`matcher.ts` should mirror this: accept `now`/cached events as explicit arguments (never read `new Date()` or call `getCachedEvents()` internally), so it stays testable with fixed fixtures exactly like `marketFilter.test.ts` does.

**Filter-and-collect loop pattern** (lines 42-88) — the 3-signal gate (`teamMatch ∧ dateMatch ∧ marketMatch`) should follow this same per-event filter/continue/collect shape, returning a discriminated result (`{ status: "matched"; ... } | { status: "ambiguous" | "no_candidate"; ... }`) rather than a bare boolean, so `pending_review` queue cards can show the "best guess" line from the partial-match info (per 03-UI-SPEC.md).

---

### `src/domain/promos/rankPromoHedges.ts` (service, transform — implied file, no explicit RESEARCH.md path but required by D-01's "each active promo shows its best hedge book, both stakes, guaranteed profit and ROI%")

**Analog:** `src/domain/hedge/rankBonusBetHedges.ts`

**Imports pattern** (lines 1-4):
```typescript
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import { calculateBonusBetHedge, type BonusBetHedgeResult } from "./bonusBet";
import type { MoneylineQuote, TwoWayMoneylineMarket } from "./marketFilter";
```

**Best-hedge-quote search** (lines 51-75) — reuse verbatim (RESEARCH.md explicitly calls this out: "reuse the existing `bestHedgeQuote` search"):
```typescript
function bestHedgeQuote(
  quotes: MoneylineQuote[],
  outcome: "home" | "away",
  hedgeBookKeys: ReadonlySet<string>,
): MoneylineQuote | null {
  const candidates = quotes.filter((q) => q.outcome === outcome && hedgeBookKeys.has(q.bookKey));
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDecimal = americanToDecimal(best.oddsAmerican);
  for (const candidate of candidates.slice(1)) {
    const candidateDecimal = americanToDecimal(candidate.oddsAmerican);
    if (
      candidateDecimal.gt(bestDecimal) ||
      (candidateDecimal.equals(bestDecimal) && candidate.bookKey < best.bookKey)
    ) {
      best = candidate;
      bestDecimal = candidateDecimal;
    }
  }
  return best;
}
```

**Same-book badge derivation** (line 103):
```typescript
sameBook: hedgeQuote.bookKey === bonusQuote.bookKey,
```

**Sort/limit pattern** (lines 141-157) — D-01/UI-SPEC's "sorted by guaranteed profit, descending, no user sort control this phase" maps directly onto this existing comparator (drop the `maxHedgeStake` cap-filter step unless a promo-level cap is relevant, keep the profit→time→id tie-break):
```typescript
withinCap.sort((a, b) => {
  const profitDiff = b.result.guaranteedProfit.comparedTo(a.result.guaranteedProfit);
  if (profitDiff !== 0) return profitDiff;
  const timeDiff = a.commenceTime.getTime() - b.commenceTime.getTime();
  if (timeDiff !== 0) return timeDiff;
  return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
});
```

---

### `src/db/schema.ts` (EXTEND — `promos`, `scrapeRuns` tables)

**Analog:** existing tables in the same file (`cachedOdds`, `creditUsage`, `refreshLock`)

**Imports** (line 1, unchanged — add no new drizzle-orm/pg-core imports beyond what's already there: `text`, `boolean`, `integer`, `serial`, `timestamp`, `jsonb`, `index`, `primaryKey`).

**Doc-comment convention** (every table in the file, e.g. lines 20-24, 122-129) — cite decision/requirement IDs, state the ONE code path that writes the table, and any invariant a future reader needs:
```typescript
/**
 * Cached Odds API events (ODDS-01/ODDS-03). One row per event; the full
 * API event object (all bookmakers/markets) is stored in raw_response so
 * findHedges never needs a fresh API call to compute results.
 */
export const cachedOdds = pgTable(
  "cached_odds",
  { /* ... */ },
  (table) => [
    index("cached_odds_sport_key_idx").on(table.sportKey),
    index("cached_odds_commence_time_idx").on(table.commenceTime),
  ],
);
```
Apply the same shape to `promos` (status enum-as-text: `active | pending_review | dismissed | expired`, `dedupeKey` unique index, nullable `matchedEventId`/`marketKey`, structured cap fields, `confirmedByUserId`/`correctedByUserId`/`capEnteredByUserId` FKs mirroring `creditUsage.triggeredByUserId`'s `ON DELETE SET NULL` attribution pattern, lines 130-138) and to `scrapeRuns` (one row per book per run: `bookKey`, `status: "ok" | "failed"`, `promosFound`, `ranAt` — mirrors `refreshLock`'s single-purpose small-table shape, lines 147-151, but append-only rather than a singleton).

**Attribution FK pattern** (lines 130-138, `creditUsage.triggeredByUserId`):
```typescript
triggeredByUserId: integer("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }),
```
Use this exact `references(() => users.id, { onDelete: "set null" })` shape for every "who confirmed/corrected/entered-caps/dismissed" column (D-12).

---

### `src/db/queries.ts` (EXTEND — promo/queue/scrape-status reads+writes)

**Analog:** `getUsableUserBooks`/`saveUserBooks`/`getCachedEvents` in the same file

**Batch-transaction write pattern** (lines 77-86, `saveUserBooks`) — use for any "replace queue state atomically" write (e.g. dismiss = update `promos.status` + no re-queue check in one statement, not two round trips):
```typescript
export async function saveUserBooks(userId: number, bookKeys: readonly string[]): Promise<void> {
  const db = getDb();
  type Statement = BatchItem<"pg">;
  const statements: Statement[] = [db.delete(userBooks).where(eq(userBooks.userId, userId))];
  if (bookKeys.length > 0) {
    statements.push(db.insert(userBooks).values(bookKeys.map((bookKey) => ({ userId, bookKey }))));
  }
  const [first, ...rest] = statements;
  await db.batch([first, ...rest]);
}
```

**"Latest batch" read pattern** (lines 110-138, `getCachedEvents`) — reuse this exact `fetched_at = max(fetched_at)` subquery shape for "most recent scrape run per book" status reads, and the Zod-`safeParse`-with-drop-and-log discipline for any row read back from a `jsonb`/free-text column:
```typescript
const rows = await db
  .select({ eventId: cachedOdds.eventId, rawResponse: cachedOdds.rawResponse })
  .from(cachedOdds)
  .where(
    and(
      gt(cachedOdds.commenceTime, new Date()),
      sql`${cachedOdds.fetchedAt} = (select max(${cachedOdds.fetchedAt}) from ${cachedOdds})`,
    ),
  );
for (const row of rows) {
  const parsed = OddsEventSchema.safeParse(row.rawResponse);
  if (!parsed.success) {
    console.warn(`getCachedEvents: dropping invalid cached_odds row, event_id=${row.eventId}`);
    continue;
  }
  events.push(parsed.data);
}
```

---

### `src/app/actions/confirm-promo-match.ts` / `correct-promo-match.ts` / `dismiss-promo.ts` / `flag-promo-match.ts` / `enter-promo-caps.ts` (controller, request-response)

**Analog:** `src/app/actions/save-books.ts` (simple case) and `src/app/actions/refresh-spreads-totals.ts` (attribution-carrying case)

**Full shape to copy** (`save-books.ts`, entire file, lines 1-42):
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { SaveBooksInputSchema } from "@/domain/books/bookSelection";
import { saveUserBooks } from "@/db/queries";

export type SaveBooksResponse =
  | { status: "ok"; bookKeys: string[] }
  | { status: "invalid"; fieldErrors: { bookKeys?: string[] } };

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
```
Every new action here follows the identical skeleton: `requireUser()` FIRST (before parsing input — this is load-bearing per `save-books.ts`'s own doc comment: "the user id comes ONLY from the session, never from input"), then Zod `safeParse`, then a typed `{status:"ok"|"invalid"}` union, then `revalidatePath("/")` on success. `confirm-promo-match.ts`/`correct-promo-match.ts`/`flag-promo-match.ts` additionally pass `user.userId` through as the `confirmedByUserId`/`correctedByUserId` attribution column (D-12), exactly as `refresh-spreads-totals.ts` threads `triggeredByUserId`:
```typescript
export async function refreshSpreadsTotals(input: unknown): Promise<ExtendedRefreshOutcome> {
  const user = await requireUser();
  const parsed = RefreshSpreadsTotalsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid refresh request" };
  }
  const outcome = await runSpreadsTotalsRefresh({
    confirmed: parsed.data.confirmed,
    triggeredByUserId: user.userId,
  });
  if (outcome.status === "ok") {
    revalidatePath("/");
  }
  return outcome;
}
```

---

### `src/components/promos/PromosScreen.tsx` (component, request-response)

**Analog:** `src/components/arb/ArbForm.tsx` (auto-loading list screen with skeleton/empty/error states) — `ArbScreen.tsx` is the thin wrapper, `ArbForm.tsx` holds the real state-machine; copy the latter's pattern.

**Response-state rendering pattern** (`ArbForm.tsx` lines 280-295):
```typescript
{!canShowResults ? null : showSkeleton || (response === null && hasCachedOdds) ? (
  <div className="flex flex-col gap-2">
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-14 w-full" />
  </div>
) : response === null ? (
  <ArbEmptyState variant="no-cached-odds" />
) : response.status === "no_cached_odds" ? (
  <ArbEmptyState variant="no-cached-odds" />
) : response.status === "ok" ? (
  <ArbResultsList response={response} />
) : null}
```
`PromosScreen.tsx` needs one more branch than `ArbForm.tsx` (the "Needs review (N)" section rendered above the advisory/list, only when `N > 0` — per 03-UI-SPEC.md) but the skeleton→empty→list decision tree is otherwise identical.

**`RiskAdvisory` placement** (`ArbForm.tsx` line 280) — render the shared component verbatim, unchanged import:
```typescript
import { RiskAdvisory } from "@/components/RiskAdvisory";
// ...
<RiskAdvisory />
```

---

### `src/components/AppShell.tsx` (EXTEND — third tab)

**Analog:** itself, current two-tab shape (whole file, lines 1-78)

**Tab list extension pattern** (lines 20, 53-56):
```typescript
type ActiveTab = "bonus" | "arbitrage";
// ...
<TabsList variant="line" aria-label="Select a tab" className="mt-2">
  <TabsTrigger value="bonus">Bonus bets</TabsTrigger>
  <TabsTrigger value="arbitrage">Arbitrage</TabsTrigger>
</TabsList>
```
Change to `type ActiveTab = "bonus" | "arbitrage" | "promos";` and add a third `<TabsTrigger value="promos">Promos</TabsTrigger>` (D-01: "a third tab after Bonus bets | Arbitrage") plus a third `keepMounted` `TabsContent` panel (lines 58-73) rendering `PromosScreen`. `showExtendedAge` (line 42) stays scoped to `activeTab === "arbitrage"` only — the Promos tab does not get a fourth status-bar line (03-UI-SPEC.md: "No new status-bar line is added for scraping").

---

### `src/components/promos/PromoRow.tsx` (component, request-response)

**Analog:** `src/components/finder/ResultRow.tsx` (whole file, lines 1-93)

**Collapsible six-column grid pattern** (lines 20-90) — copy verbatim, same `grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px]` desktop grid, same `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` wiring, same `.num` typography on money/odds/pct figures, same `Tooltip`+`Badge` idiom for "Same book"/"Tie risk" (lines 45-71) — reused verbatim per D-04/UI-SPEC. New elements this phase (Auto-matched badge + flag-back icon button in Col 1) follow `MultipleBooksPopover.tsx`'s `e.stopPropagation()` technique (line 28) so the flag button never also toggles the row:
```typescript
onClick={(event: MouseEvent) => event.stopPropagation()}
```

**Dynamic ROI/Conversion column label** (`ResultRow.tsx` lines 80-83, generalize per-row):
```typescript
<span className="flex flex-col md:items-end">
  <span className="num text-base">{formatPct(result.conversionPct)}</span>
  <span className="text-sm text-muted-foreground">Conversion</span>
</span>
```
becomes conditional on promo type (boost → ROI/`roiPct`, bonus bet → Conversion/`conversionPct`) per 03-UI-SPEC.md Col 5.

---

### `src/components/promos/ScrapeStatusPanel.tsx` (component, request-response)

**Analog:** `src/components/finder/OddsStatusBar.tsx` — specifically its warning-state line rendering (lines 130-144), not its refresh-button/credit-meter machinery (no refresh action exists for scrape status — it's read-only per D-08)

**Warning-line pattern to copy** (lines 133-144):
```typescript
{isPending ? (
  <span className="text-muted-foreground">Refreshing odds…</span>
) : age.stale ? (
  <span className="inline-flex items-center gap-1.5 text-warning">
    <TriangleAlert className="size-4" aria-hidden="true" />
    {withAttribution(age.label, "Refreshed by", status.oddsRefreshedBy)} —{" "}
    <span className="font-semibold">Refresh before betting</span>
  </span>
) : (
  <span className="text-muted-foreground">
    {withAttribution(age.label, "Refreshed by", status.oddsRefreshedBy)}
  </span>
)}
```
`ScrapeStatusPanel.tsx` needs one line per book (D-08), each independently fresh/failed/never-run — same `TriangleAlert`+`text-warning` treatment for "last run failed" (per 03-UI-SPEC.md: "identical visual treatment to `OddsStatusBar`'s stale-odds line ... not destructive red"), but no `Progress`/credit-meter/`Button` — it's a static `Card`-like block (`rounded-lg border border-border bg-secondary p-4`), not sticky.

---

### `src/components/promos/DismissPromoDialog.tsx` (component, request-response)

**Analog:** `src/components/finder/RefreshConfirmDialog.tsx` (whole file, lines 1-75)

**AlertDialog shape to copy verbatim** (lines 49-74), new copy only ("Dismiss this promo?" / destructive `AlertDialogAction`):
```typescript
<AlertDialog
  open={open}
  onOpenChange={(next) => {
    if (!next && !isPending) onCancel();
  }}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{/* "Dismiss this promo?" */}</AlertDialogTitle>
      <AlertDialogDescription>{/* body copy */}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel variant="ghost" onClick={onCancel}>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={confirmDismiss} disabled={isPending}>
        {isPending ? "Dismissing…" : "Dismiss"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```
Per 03-UI-SPEC.md, the confirm action's text/icon should be `text-destructive` (this is the one destructive dialog in the app so far — `RefreshConfirmDialog`'s confirm button is NOT destructive-styled, so copy the structural shape but not the button color).

---

### `src/components/promos/PromosEmptyState.tsx` (component, request-response)

**Analog:** `src/components/finder/EmptyState.tsx` (whole file, lines 1-99)

**Variant-dispatch + "Manage your books" CTA pattern** (lines 76-90):
```typescript
if (variant === "no-books-covered") {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
      <h3 className="text-xl font-semibold">No games at your books right now</h3>
      <p className="max-w-prose text-sm text-muted-foreground">
        None of the upcoming games are offered at the sportsbooks you&apos;ve selected. Add more books to see more opportunities.
      </p>
      <div>
        <Button variant="outline" render={<Link href="/settings" />}>
          Manage your books
        </Button>
      </div>
    </div>
  );
}
```
Copy this exact `Button variant="outline"` + `render={<Link href="/settings" />}` idiom for the Promos tab's "No promos at your books right now" state (03-UI-SPEC.md variant 3). The other three Promos empty states (no promos scraped yet / no active promos / no cached odds) follow the plain `COPY` lookup-table branch (lines 92-98) — "no cached odds" reuses the finder's copy verbatim per 03-UI-SPEC.md.

---

### `scrapers/ballybet.ts` (script, file-I/O / event-driven)

**Analog:** `scripts/refresh-odds.ts` (whole file, lines 1-41) — same "wrap an async orchestration fn, map its outcome to `process.exit(code)`" shape, even though it lives in a different workspace and calls a scraper instead of `runOddsRefresh`:
```typescript
async function main() {
  const outcome = await runOddsRefresh({ confirmed });
  console.log(JSON.stringify(outcome, null, 2));
  switch (outcome.status) {
    case "ok":
      process.exit(0);
      break;
    // ...
  }
}

main().catch((err) => {
  console.error("odds:refresh failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
```
`ballybet.ts` should mirror this exit-code discipline so a GitHub Actions step fails loudly on a scrape error, and log a per-book `{status, promosFound}` JSON line the workflow (or a follow-up write) can capture — same discipline as the `scrape_runs` D-08 status the schema records. No direct analog exists for the `fetch`+`cheerio` parsing itself (first scraper in the repo) — RESEARCH.md's own "Recommended Project Structure" and "Don't Hand-Roll" sections are the reference for that part, not existing code.

---

## Shared Patterns

### `requireUser()` before any input parsing
**Source:** `src/lib/session.ts` lines 70-76, applied in every existing action (`save-books.ts` line 22, `refresh-spreads-totals.ts` line 21)
**Apply to:** `confirm-promo-match.ts`, `correct-promo-match.ts`, `dismiss-promo.ts`, `flag-promo-match.ts`, `enter-promo-caps.ts` — every one of these is a new server action and must call `requireUser()` as its literal first statement, per D-12's "any logged-in member" + the codebase's own `save-books.ts` doc-comment rule that the user id "comes ONLY from the session, never from input."
```typescript
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
```

### Decimal-exact money math, local-precision clone
**Source:** `src/domain/hedge/arbMath.ts` lines 31-45 (identical in `bonusBet.ts` lines 25-39)
**Apply to:** `profitBoost.ts` — every stake/profit/ROI figure. Never use native `number` math (CLAUDE.md "What NOT to Use" is explicit and unchanged this phase).
```typescript
const LocalDecimal = Decimal.clone({ precision: 40 });
function clean(value: Decimal): Decimal {
  return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
}
```

### Attribution ("Refreshed by" / triggered-by pattern)
**Source:** `src/db/schema.ts` lines 130-138 (`creditUsage.triggeredByUserId`) + `src/components/finder/OddsStatusBar.tsx`'s `withAttribution()` helper (imported from `src/components/finder/oddsAge.ts`)
**Apply to:** `promos` table's `confirmedByUserId`/`correctedByUserId`/`capEnteredByUserId` columns, and the expanded-panel attribution line in `PromoDetails.tsx` ("Confirmed by {displayName}" per 03-UI-SPEC.md) — same nullable `references(() => users.id, { onDelete: "set null" })` FK shape, same muted-Label `·`-suffix rendering convention.

### Zod `safeParse` on every server-action input and every scraped/parsed field
**Source:** `src/app/actions/save-books.ts` line 24; `src/domain/odds/schemas.ts`'s `OddsEventSchema.safeParse` used in `src/db/queries.ts` lines 129-134
**Apply to:** every new server action's input, AND per RESEARCH.md's Security Domain (V5), the scraper's parsed promo candidates before they are trusted as a DB write — mirror the "parse, drop-and-log on failure, never throw into the caller" discipline:
```typescript
const parsed = OddsEventSchema.safeParse(row.rawResponse);
if (!parsed.success) {
  console.warn(`getCachedEvents: dropping invalid cached_odds row, event_id=${row.eventId}`);
  continue;
}
```

### Pure-function domain layer (zero I/O, `now`/data injected)
**Source:** `src/domain/hedge/marketFilter.ts` lines 26-31 (`now: Date` as an explicit option, never `new Date()` inside)
**Apply to:** `matcher.ts`, `profitBoost.ts`, `rankPromoHedges.ts`, `dedupe.ts` — none of these may import `getDb()`, call `fetch`, or read the system clock directly; all such inputs come from the caller (a server action or the scraper script), preserving the same "Domain tier" boundary ARCHITECTURE.md and this codebase's existing hedge modules already enforce.

### Collapsible compact row + `Badge`/`Tooltip` idiom
**Source:** `src/components/finder/ResultRow.tsx` (whole file)
**Apply to:** `PromoRow.tsx` — six-column grid, `.num` typography, `Same book`/`Tie risk` badges reused verbatim (D-04), new `Auto-matched` badge + flag-back icon following `MultipleBooksPopover.tsx`'s `stopPropagation()` technique.

### AlertDialog confirm-action shape
**Source:** `src/components/finder/RefreshConfirmDialog.tsx` (whole file)
**Apply to:** `DismissPromoDialog.tsx` — identical `AlertDialog`/`onOpenChange` guard-against-close-while-pending structure, new copy and destructive button styling only.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.github/workflows/scrape-promos.yml` | config | event-driven | First GitHub Actions workflow in this repo — no existing CI file to pattern-match. RESEARCH.md's own "GitHub Actions Scheduling" section (verified against github.blog changelog) is the reference, not codebase precedent: use `cron: "0 8,12,17 * * *"` with `timezone: "America/Denver"`, `workflow_dispatch: {}` for manual debugging, `DATABASE_URL` from `secrets.DATABASE_URL`. |
| `scrapers/` workspace `package.json` + `shared/parseFinePrint.ts` (fetch+cheerio parsing, fine-print/cap-text extraction) | utility | file-I/O | No HTML-scraping or text-parsing code exists anywhere in this repo yet — RESEARCH.md's "Don't Hand-Roll" table (cheerio DOM queries over regex) and "Recommended Project Structure" are the only guidance; there is no in-repo analog to point to for the parsing logic itself, only for the surrounding script/exit-code shell (`scripts/refresh-odds.ts`, already covered above). |

## Metadata

**Analog search scope:** `src/domain/hedge/`, `src/domain/promos/` (new), `src/db/`, `src/app/actions/`, `src/components/finder/`, `src/components/arb/`, `src/components/` (root), `src/lib/session.ts`, `src/config/books.ts`, `scripts/`
**Files scanned:** ~40 (full `src/` tree listing) + 14 read in full for excerpt extraction
**Pattern extraction date:** 2026-09-27
