# Phase 6: Profit Graph - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 15 (9 new, 6 modified)
**Analogs found:** 14 / 15 (ProfitGraph chart internals have no in-repo analog)

Note: CONTEXT D-04 was revised after research. Both lines start on the "graph start day" (the day the new table begins recording), not 2026-09-27. There is no group-level fallback (D-18). So RESEARCH's `ALL_TIME_START`, "group fallback" and "member rows beat group rows" sections are superseded. The series builder reads only `member_profit_observations` plus completions. The graph start day is the earliest `denver_date` in the member table (or today when the table is empty or absent).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema.ts` (add `memberProfitObservations`) | model | CRUD | `promoProfitObservations` / `userPromoCaps` in same file | exact |
| `drizzle/0012_*.sql` (+ `meta`) | migration | batch | `drizzle/0011_user_promo_caps.sql` | exact |
| `src/db/memberObservations.ts` (record + read, tolerate missing table) | service (db) | CRUD / upsert | `src/db/promoTracking.ts` `recordProfitObservations` + `src/db/promoCaps.ts` `getMemberPromoCaps` | exact (combine) |
| `src/db/memberObservations.test.ts` | test | mock db | `src/db/promoObservations.test.ts` | exact |
| shared feed-compute helper (lift singles + chosenPairs out of `getOpportunities`; in `src/db/feedContext.ts` or new module) | service | transform | `src/app/actions/get-opportunities.ts` L85-109 | exact (extract) |
| `src/domain/promos/profitSeries.ts` (+ optional `pairShares.ts`) | utility (pure domain) | transform | `src/domain/promos/profitTotals.ts` | exact |
| `src/domain/promos/profitSeries.test.ts` | test | table-driven | `src/domain/promos/profitTotals.test.ts` | exact |
| `src/db/feedContext.ts` (add `loadProfitSeries`) | service | request-response | `loadAvailableProfit` in same file | exact |
| `src/app/actions/get-opportunities.ts` (record + embed series) | controller (server action) | request-response | itself | exact |
| `src/app/actions/get-opportunities.test.ts` (update mocks) | test | request-response | itself | exact |
| `src/domain/opportunities/types.ts` (add `profitSeries`) | model/types | - | `OpportunitiesTotals` in same file | exact |
| `src/lib/persistentState.ts` (+ 2 keys) and a `parseRange` helper | utility / hook | event-driven (localStorage) | `STORAGE_KEYS.sortMode` + `src/lib/sortPreference.ts` | exact |
| `src/ingestion/odds/morningObserve.ts` + `scripts/morning-odds-observe.ts` (loop members) | job | batch | `runMorningObservation` | exact |
| `src/components/opportunities/ProfitGraph.tsx` | component | request-response (props) | `ProfitSummary.tsx` (card) + `SortSwitch.tsx` (picker) | role-match |
| `src/components/opportunities/OpportunitiesScreen.tsx` (mount) | component | request-response | itself, `ProfitSummary` mount L166-172 | exact |

## Pattern Assignments

### `src/db/schema.ts` -> `memberProfitObservations` (model, CRUD)

**Analogs:** `promoProfitObservations` (schema.ts ~L403-420) and `userPromoCaps` (L339-352).

```typescript
export const userPromoCaps = pgTable(
  "user_promo_caps",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    promoId: integer("promo_id").notNull().references(() => promos.id, { onDelete: "cascade" }),
    maxStake: numeric("max_stake", { precision: 10, scale: 2 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.promoId] })],
);
// promoProfitObservations: denverDate text("denver_date") (TEXT, not DATE), numeric(10,2), index(...).on(denverDate)
```
Use RESEARCH's table definition verbatim (PK `userId, promoId, denverDate`; index on `userId, denverDate`). Add a doc comment in the style of the existing ones (quick-id, why TEXT date).

### `drizzle/0012_*.sql` (migration)

**Analog:** `drizzle/0011_user_promo_caps.sql`. Generate with `npm run db:generate`; do NOT run `db:migrate` (owner applies). Expected shape:
```sql
CREATE TABLE "user_promo_caps" (... CONSTRAINT "user_promo_caps_user_id_promo_id_pk" PRIMARY KEY("user_id","promo_id"));
--> statement-breakpoint
ALTER TABLE "user_promo_caps" ADD CONSTRAINT "..._user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
```

### `src/db/memberObservations.ts` (service, upsert + tolerant read)

**Write analog:** `src/db/promoTracking.ts` L140-162 (`recordProfitObservations`):
```typescript
if (entries.length === 0) return;
const db = getDb();
await db.insert(promoProfitObservations).values(entries.map((e) => ({ ..., lastObservedAt: now })))
  .onConflictDoUpdate({
    target: [promoProfitObservations.promoId, promoProfitObservations.denverDate],
    set: {
      maxGuaranteedProfit: sql`greatest(${promoProfitObservations.maxGuaranteedProfit}, excluded.max_guaranteed_profit)`,
      lastObservedAt: sql`excluded.last_observed_at`,
    },
  });
```
Adapt: target `[userId, promoId, denverDate]`, `profit = greatest(..., excluded.profit)`. Single multi-row statement (neon-http has no interactive transactions).

**Never-throw wrapper analog:** `src/db/promoObservations.ts` L74-80:
```typescript
if (entries.length === 0) return;
try {
  await recordProfitObservations(entries, now);
} catch (err) {
  console.error("recordCurrentProfitObservations: failed to write observations", err);
}
```
Also covers a missing table (the write fails, is logged, feed still works).

**Missing-table read analog:** `src/db/promoCaps.ts` L8-61. Copy `isUndefinedTableError` pattern (it hardcodes the table name `user_promo_caps` in its regex; make a table-name-parameterised copy or generalise it for `member_profit_observations`) and the warn-once flag:
```typescript
const UNDEFINED_TABLE = "42P01";
let warnedMissingTable = false;
export async function getMemberPromoCaps(userId: number) {
  try { const rows = await buildMemberCapsQuery(getDb(), userId); return new Map(...); }
  catch (err) {
    if (isUndefinedTableError(err)) { if (!warnedMissingTable) { warnedMissingTable = true; console.warn("...migration 0011 not applied yet; ..."); } return new Map(); }
    throw err;
  }
}
```
Read function signature: `getMemberProfitObservations(userId)` returning rows with a null/empty result when table absent (this drives the UI-SPEC "Graph not ready yet" state; return a flag such as `{ rows, tableMissing }`). Every query filters by the session `userId`. Add a `buildXQuery(db, userId)` exported builder like `buildMemberCapsQuery` so the filter is testable.

### Shared feed-compute helper (transform)

**Source to extract:** `src/app/actions/get-opportunities.ts` L85-109. Do not duplicate the pair rule:
```typescript
const singles = rankPromoHedges(ctx.feedPromos, ctx.rankOpts);
const rows = singles.map((o) => toPromoRowDTO(o, ctx.bookNames, ctx.userBookSet, priceAge)).filter((r) => r.hasPromoBook);
const chosenPairs = selectPairs(
  findPairCandidates(ctx.feedPromos, singleProfitMap(singles), { ...ctx.rankOpts, memberBookKeys: ctx.userBookSet }),
);
```
Helper returns `{ singles, chosenPairs }`; `getOpportunities` and the morning job both call it. Recorder uses `PairCandidate.separateProfitA` and `result` pair profit (`pairPromos.ts` L35-58) for shares: A gets `separateProfitA`, B gets `pairProfit - separateProfitA`. Singles: apply `hasPromoBook` filter (promo's book in `ctx.userBookSet`); profit extraction like `promoObservations.ts` L60-63 (`result.kind === "boost" ? result.boost.guaranteedProfit : result.bonus.guaranteedProfit`). Skip pair members from singles; write positives only.

### `src/domain/promos/profitSeries.ts` (pure domain)

**Analog:** `src/domain/promos/profitTotals.ts`. Pure; no src/db imports; decimal.js; strings out at `toFixed(2)`.

**Reuse, do not rewrite** (L68-111): `denverDate(instant)`, `periodStartDates(now)` (weekStart = today - 6, monthStart = today - 29, via `Date.UTC` on the date string). `toDateString` is private (L106) and `periodStartDates` takes a `Date`: export `toDateString` (or add an `addDays(dateString, n)` helper in the same style) and add a variant that accepts the server's `today` string so the client never uses its own clock.
```typescript
const [year, month, day] = today.split("-").map((n) => parseInt(n, 10));
const weekStart = toDateString(new Date(Date.UTC(year, month - 1, day - 6)));
```
**Max-per-promo dedupe** (L161-176) is the model for "best per promo, once, on first-seen day":
```typescript
const maxByPromo = new Map<number, Decimal>();
for (const obs of observations) {
  const value = new Decimal(obs.maxGuaranteedProfit);
  const existing = maxByPromo.get(obs.promoId);
  if (existing === undefined || value.greaterThan(existing)) maxByPromo.set(obs.promoId, value);
}
```
Per D-18/D-04 revised: group by promo -> `best` = max profit across the member's rows, `day` = min `denverDate`; add to `gains[day]`. Green: bucket each completion by `denverDate(completedAt)` summing `profitExtracted` with `Decimal` (convention: `sumProfitExtracted` in `src/domain/promos/doneSnapshot.ts` L330: `rows.reduce((sum, r) => sum.plus(r.profitExtracted), new Decimal(0)).toFixed(2)`). Drop completions before the graph start day. Include zero days so every day is a point. `cumulate(days, startDate)` per RESEARCH Code Examples (running totals start at 0, D-01); the client calls it per range with start = `max(graphStartDay, weekStart|monthStart)`.

Interface style to copy (L113-125): small exported interfaces with string money fields (`ProfitObservation`, `AvailableProfit`).

### `src/domain/promos/profitSeries.test.ts`

**Analog:** `src/domain/promos/profitTotals.test.ts` (L1-30: table-driven `describe`/`it`, direct imports, no mocks, string expectations such as `"65.00"`). Cases from RESEARCH validation map: each promo once at best on first-seen day, pair shares sum exactly to pair profit, DST/Denver-day bucketing of completions, legacy "0.00" completion, 7d/30d/all slices start at $0, clamp to graph start day, empty series.

### `src/db/memberObservations.test.ts`

**Analog:** `src/db/promoObservations.test.ts` L8-18, 83-107: `vi.mock("./promoTracking", ...)`-style module mocks, `vi.clearAllMocks()` in `beforeEach`, assert on `mock.calls[0]` entries (e.g. positive profits only, pair shares, never throws when the write rejects, session user id passed to the read).

### `src/db/feedContext.ts` -> `loadProfitSeries(userId, now)`

**Analog:** `loadAvailableProfit` L34-47 (plain module, caller passes the user id obtained from `requireUser()`):
```typescript
export async function loadAvailableProfit(now, ownBookKeys, viewerUserId, doneIds): Promise<AvailableProfit> {
  const { weekStart, monthStart } = periodStartDates(now);
  const observations = await getProfitObservationsSince(sinceDate, viewerUserId);
  return summarizeAvailableProfit(observations, ownBookKeys, now, doneIds);
}
```
`loadMemberFeedContext` already loads `completions` (L77, `getPromoCompletions(userId)`) so pass `ctx.completions` rather than re-querying.

### `src/app/actions/get-opportunities.ts` (server action)

**Analog:** itself. Keep `requireUser()` as the first statement and the strict zod schema (no user id, no range input):
```typescript
const user = await requireUser();
...
await recordCurrentProfitObservations(now, { activePromos: ctx.activePromos, precision });   // L53
const availableProfit = await loadAvailableProfit(now, ctx.userBookSet, user.userId, ctx.doneIds);  // L54
const respond = (emptyVariant, totalProfit, sources): OpportunitiesResponse => ({ status: "ok", emptyVariant, ..., totals: {...}, sources });  // L59-70
```
Insert the member recording after L109 (once `singles`/`chosenPairs` exist; skip in the early "no-odds" return) and before building `profitSeries`; `profitSeries` is computed after recording so today's value is included, and put it inside `respond()` so every empty variant carries it (same trick as `availableProfit`). For the early `no-odds` branch, `respond` is called before singles exist, so compute the series up front or lazily; plan accordingly.

### `src/app/actions/get-opportunities.test.ts` (update)

**Analog:** itself L7-53: hoisted mocks (`vi.hoisted`) and `vi.mock("@/db/...")` per module. Add a mock for `@/db/memberObservations` (record + read) and extend the `@/db/promoTracking` mock if needed; assert the read receives the session user id (security row in RESEARCH).

### `src/domain/opportunities/types.ts`

**Analog:** L35-50 (`OpportunitiesTotals`, `OpportunitiesResponse` "ok" arm). Add `profitSeries: ProfitSeriesDTO` (strings only) beside `totals`, with a status field for `ready | not-ready` (table missing) to drive the UI-SPEC copy states; import types from the new domain file as `AvailableProfit` is imported at L4.

### `src/lib/persistentState.ts` + `parseRange`

**Analog:** `STORAGE_KEYS` L14-20 (add `profitGraphRange: "promoprofit.profitGraph.range"`, `profitGraphHidden: "promoprofit.profitGraph.hidden"`) and `src/lib/sortPreference.ts` L3-6:
```typescript
export function parseSortMode(value: string | null | undefined): SortKey {
  return value === "roi" ? "roi" : "profit";
}
```
Write `parseGraphRange(value): "7d" | "30d" | "all"` defaulting to `"30d"`. Usage analog in `OpportunitiesScreen.tsx` L95-96:
```typescript
const [sortStored, setSortStored] = usePersistentString(STORAGE_KEYS.sortMode, "profit");
const sort = parseSortMode(sortStored);
```
Hidden flag: `usePersistentString(key, "0")` with `"1"` meaning hidden.

### Morning job (batch)

**Analog:** `src/ingestion/odds/morningObserve.ts` L30-50: after `await recordCurrentProfitObservations(now);` add a loop over `select id from users` calling `loadMemberFeedContext` then the shared compute then member record. `src/ingestion` may import `src/db`/`src/domain`; `src/app` must not import `src/ingestion` (boundary test). Wrap each member in try/catch so one failure does not stop the others. `scripts/morning-odds-observe.ts` needs no change except maybe a log line.

### `src/components/opportunities/ProfitGraph.tsx` (client component)

**Card shell analog:** `src/components/promos/ProfitSummary.tsx` L24-26:
```tsx
"use client";
import { formatUsd } from "@/lib/format";
<div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary p-4">
  <span className="num text-lg font-medium">{formatUsd(availableProfit.month)}</span>
```
UI-SPEC wants the same shell with `gap-2` inside, `text-primary` green for extracted, `text-muted-foreground` grey for available.

**Range picker analog:** `src/components/opportunities/SortSwitch.tsx` L14-34 (base-ui `ToggleGroup` with `value={[value]}` array, ignore deselect, 44px targets):
```tsx
<ToggleGroup aria-label="Sort by" value={[value]}
  onValueChange={(values) => { const next = values[0]; if (next === "profit" || next === "roi") onChange(next); }}>
  <ToggleGroupItem value="profit" className="min-h-11 min-w-11 px-4 text-sm">Profit ($)</ToggleGroupItem>
```
Copy with values `"7d" | "30d" | "all"`.

**Skeleton analog:** `OpportunitiesScreen.tsx` L176-186 (`<Skeleton className="h-24 w-full" />`). Muted text-only error/empty copy follows UI-SPEC (not the destructive Alert at L188).

**Chart internals:** no analog in the repo (recharts not installed). Follow RESEARCH "Chart specifics" and UI-SPEC: `ResponsiveContainer height={160}`, two `Line type="stepAfter" dot={false} isAnimationActive={false}`, custom Tooltip content, `stroke="var(--muted-foreground)"` / `"var(--primary)"`, wrapper `touch-action: pan-y`, `role="img"` with aria-label. Float `Number()` only for plot coordinates, with a comment (CLAUDE.md). Gate `npm install recharts` behind `checkpoint:human-verify`. Verify `Intl` date formatting for ticks uses the server `today`, not the client clock.

### `src/components/opportunities/OpportunitiesScreen.tsx` (mount)

**Analog:** L166-174; mount `<ProfitGraph />` at the very top of the content, above the `ProfitSummary` block (UI-SPEC: above sport chips and feed). Props come from `ok.profitSeries`:
```tsx
{ok ? (<ProfitSummary totalProfit={ok.totals.totalProfit} ... />) : null}
```
Show the graph skeleton while `showSkeleton` (L141), and the "Couldn't load the graph" text state when the response has no series. The component re-slices client-side on range change (no refetch), and refreshes automatically via the existing `promosVersion` refetch (L132-139) after Mark done/Undo.

## Shared Patterns

### Auth / session-only user id
**Source:** `src/app/actions/get-opportunities.ts` L30-41. `requireUser()` first statement; zod `strictObject` with no userId; every DB read filtered by `user.userId`.
**Apply to:** any new action or db read (`memberObservations`, `loadProfitSeries`).

### Tolerate missing migration
**Source:** `src/db/promoCaps.ts` L8-61 (`42P01` detection with `.cause` chain walk, warn-once, degrade).
**Apply to:** member observation reads (degrade to "not ready" state) and writes (try/catch + `console.error`).

### Money math
**Source:** `profitTotals.ts` L19-32/161-176, `doneSnapshot.ts` L330. decimal.js internally, 2dp strings across the server/client boundary, `formatUsd` only at display (`src/lib/format.ts`).
**Apply to:** `profitSeries.ts`, recorder, `ProfitGraph.tsx`.

### Denver-day bucketing
**Source:** `profitTotals.ts` L68-81 `denverDate`, L96-111 `periodStartDates`/`toDateString`. Never local-time Date methods; never the client clock.
**Apply to:** series builder, range slicing, tick labels.

### Layering boundary
`src/domain` pure (no db imports); `src/db` for queries; `src/app` never imports `src/ingestion`.

### Per-device UI state
**Source:** `src/lib/persistentState.ts` `usePersistentString` (SSR-safe via `useSyncExternalStore`) + whitelist parser like `parseSortMode`.
**Apply to:** range pick and hide/show.

### Tests
Vitest, colocated `*.test.ts`; domain tests are pure and table-driven; db/action tests use `vi.mock` of sibling modules (and `vi.hoisted` for actions).

## No Analog Found

| File / part | Role | Data Flow | Reason |
|---|---|---|---|
| Chart rendering inside `ProfitGraph.tsx` (recharts LineChart, custom tooltip, touch scrub) | component | interactive | No chart library or SVG chart in the repo; use RESEARCH/UI-SPEC. Fallback hand-rolled SVG if the phone check fails. |
| `Collapsible` hide/show | component | UI state | `src/components/ui/collapsible.tsx` exists but nothing in the feed uses it; a conditional render with a `Button` and `aria-expanded` is fine (UI-SPEC). |

## Open verification items for the planner
- Confirm in `src/app/actions/mark-pair-done.ts` (primary + member `profitExtracted`, ~L38/L70) that the two completion rows sum to the pair profit (RESEARCH A5) before relying on a plain sum for green.
- `isUndefinedTableError` is table-specific; plan a parameterised version.
- The early `no-odds` return in `getOpportunities` happens before `singles` exist; `profitSeries` there reads stored rows only.

## Metadata

**Analog search scope:** `src/db`, `src/domain/promos`, `src/domain/opportunities`, `src/app/actions`, `src/components/opportunities`, `src/components/promos`, `src/components/ui`, `src/lib`, `src/ingestion/odds`, `scripts`, `drizzle`
**Files scanned:** ~25
**Pattern extraction date:** 2026-10-03
