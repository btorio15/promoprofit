# Phase 6: Profit Graph - Research

**Researched:** 2026-10-03
**Domain:** per-member cumulative profit series (Postgres/Drizzle + pure decimal.js domain) plus a client chart in Next.js 16 App Router
**Confidence:** HIGH on data findings (read directly from code and live DB), MEDIUM on chart library touch behavior

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Both lines **start at $0 at the beginning of the selected range**. "Last 7 days" shows only profit that happened in those 7 days, not the tail of the all-time total.
- **D-02:** Ranges are rolling Denver days including today, the same definition as the "Last 7 days"/"Last 30 days" labels shipped 2026-10-03 (`periodStartDates` in `src/domain/promos/profitTotals.ts`).
- **D-03:** Default range is **Last 30 days**. The member's last pick is **remembered on this device** (use the existing `src/lib/persistentState.ts` pattern).
- **D-04:** **All time starts 2026-09-27 for both lines**, because available-profit observations only began then. Any older completions are not shown before that date, so both lines cover the same days and the gap is fair. (Planner's choice: whether pre-09-27 completions are dropped or rolled into the starting value. Pick the one that keeps both lines on the same footing, and document it.)
- **D-05:** **Include the member's private hand-added promos** (`promos.added_by_user_id`). Otherwise green could exceed grey.
- **D-06:** **Pairs are counted the way the feed would show them.** If the feed's pair rule (pair only when it beats the two singles; owner reaffirmed 2026-10-03) picks the pair, count the pair's profit once. Otherwise count the singles.
- **D-07:** **Use the member's "Your cap"** when they have one, so grey is what *they* could have taken, not the promo's full max stake.
- **D-08:** Each promo's available profit lands on the **Denver day it was first seen**, at its **best observed** guaranteed profit, and is counted once.
- **D-09 (feasibility flag, for research and planning):** Today `promo_profit_observations` stores one group-level number per promo per Denver day, ranked at full max stake (`stripMemberCaps`) with no pair awareness. D-05/D-06/D-07 may not be derivable from it as-is. The researcher must check what can be derived from stored data (e.g. re-ranking is impossible after the fact because historical odds aren't kept), and propose the smallest honest solution. That could be a per-member/pair-aware observation table going forward, with older days falling back to the group-level number. A schema change is acceptable if needed. Surface the trade-off plainly to the owner if the choices can't be met for past days.
- **D-10:** Green = sum of `promo_completions.profit_extracted` for this member, placed on the **Denver day of `completed_at`**. Undo deletes the completion row, so undone promos vanish from history (accepted).
- **D-11:** **Compact** graph (~160px tall) at the top of Opportunities.
- **D-12:** **Hide/show toggle, remembered per device.**
- **D-13:** Above the graph: two totals for the selected range in the line colors, e.g. "Extracted **$123.45** of **$210.00** available".
- **D-14:** The readout shows the **date, both running totals, and that day's gain**, exact to the cent.
- **D-15:** On a phone it is a **tooltip at the finger** (same as desktop hover).
- **D-16:** With no tap, the numbers above the graph show the **end-of-range totals**.
- **D-17:** A member with no history in the selected range sees a short "nothing yet" message instead of an empty chart (STATS-06).

### Claude's Discretion
- Line style (step vs smooth); recommendation was step lines.
- Charting library choice (none installed yet); must work with React 19 / Next 16 and support touch tooltips.
- Exact green/grey shades, axis labels and ticks.
- Whether the toggle and range picker share one header row.

### Deferred Ideas (OUT OF SCOPE)
- "Gap / left on the table" figure in the readout.
- Breakdowns by book / promo type / sport, group totals, completed-bets list, 90-day range.
- 2-bet pair solver 1 cent rounding todo (standalone fix).
- Stats page, headline totals/counts, removing the Promos-tab summary are Phase 7.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STATS-01 | Cumulative profit graph at top of Opportunities | Mount point `OpportunitiesScreen.tsx`; series ships inside `getOpportunities` response (Architecture) |
| STATS-02 | Grey = running available total, each promo once at best observed profit on first-seen Denver day | New per-member observation table + group-table fallback; `resolveAvailableByPromo` (Data Findings, Pattern 1) |
| STATS-03 | Green = running extracted total by Denver day of completion | `getPromoCompletions(userId)` + `denverDate(completedAt)` (Pattern 2) |
| STATS-04 | Range switch 7d/30d/All time | Server returns all-time daily gains; client re-cumulates per range (Pattern 3); persisted via `usePersistentString` |
| STATS-05 | Tap/hover readout, exact cents | Recharts Tooltip with custom content fed by decimal-string fields (Chart section) |
| STATS-06 | Phone-readable, empty state | 160px responsive container, empty-state branch when no day in range has a nonzero gain |
</phase_requirements>

## Summary

**The owner's four grey-line choices (D-05..D-08) cannot be met from the stored data, and cannot be reconstructed for past days.** `promo_profit_observations` is group-level: it is recorded by `recordCurrentProfitObservations` from `getActivePromos(now)` with no viewer id (so private promos are never observed), ranks every promo alone (`rankPromoHedges`, no `findPairCandidates`/`selectPairs`), hedges against every usable book rather than the member's books, and strips member caps. Odds are overwritten on refresh, so none of these can be re-ranked later. They can be met going forward by recording a per-member, pair-aware, cap-aware observation, which `getOpportunities` already has everything for (it computes exactly that feed per member on every load).

**Smallest honest design:** add one table, `member_profit_observations (user_id, promo_id, denver_date, profit, partner_promo_id, book_key, last_observed_at)`, written going forward by the member's own Opportunities load (plus the morning job, looping over members, so a day nobody opened the app is not lost). Pair profit is split so it sums exactly to the pair's profit and counts once (see Pattern 1). For each promo the series uses the member table when that promo has member rows, else falls back to the group-level number (filtered to the member's current books). Day = earliest date across both tables. Days before the cutover carry the documented approximations below. The owner must be told this plainly.

**Primary recommendation:** Add `member_profit_observations` (migration 0012, applied manually with owner OK), build the series in a pure `src/domain/promos/profitSeries.ts` returning all-time daily gains as cent strings, ship it inside the `getOpportunities` response, and render with `recharts` 3.10.1 (`type="stepAfter"` lines, custom tooltip content) in a client `ProfitGraph` component. Do an on-phone touch-tooltip check before sign-off.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Record per-member observations | API / Backend (`src/db`, called from server action and morning script) | Database | Needs ranked feed (pairs, caps, books) already computed server-side |
| Resolve observations to daily available gains | API / Backend (pure `src/domain`) | — | Money math, decimal.js, no I/O |
| Extracted gains by Denver day | API / Backend (pure `src/domain`) | Database (completions) | Same bucketing as `denverDate` |
| Range slicing and cumulative totals | Browser / Client (pure function from `src/domain`) | — | Range switch must not refetch; function is shared with Phase 7 |
| Chart rendering, tooltip, hide/show, range pick | Browser / Client | — | Interactive; per-device localStorage |
| Auth / user identity | API / Backend (`requireUser()`) | — | User id from session only |

## Data Findings (D-09, top priority)

### What stored data can and cannot give (verified in code and live DB)

| Owner choice | Derivable from `promo_profit_observations`? | Why |
|---|---|---|
| D-05 private promos | **No** [VERIFIED: codebase] | `recordCurrentProfitObservations` calls `getActivePromos(now)` with no `viewerUserId`; `activePromoWhere`/`promoVisibilityCondition(undefined)` is `added_by_user_id IS NULL`. Live: 0 private promos exist today, 0 observed. |
| D-06 pair-aware | **No** [VERIFIED: codebase] | Only `rankPromoHedges` singles are recorded; `findPairCandidates`/`selectPairs` never run in `promoObservations.ts`. Past odds not kept. |
| D-07 Your cap | **No** [VERIFIED: codebase] | `stripMemberCaps` restores the promo's own max stake. Past odds not kept, so cannot re-rank at the cap. |
| D-08 first-seen day, best, once | **Yes** [VERIFIED: codebase+DB] | PK `(promo_id, denver_date)`; `min(denver_date)` = first seen, `max(...)` = best. Reuse `sumMaxPerPromo` logic. |
| (implicit) member's own hedge books | **No** | Group row ranks against `getHedgeBookKeys()` (every usable book); the feed uses the member's own hedge books. Group number can overstate for a member lacking the best hedge book. |
| Green line | **Yes** [VERIFIED] | `promo_completions` has `completed_at`, `profit_extracted`. |

### Live data snapshot (read-only Neon queries, 2026-10-03)
- Observations 2026-09-27 to 10-03: 25 rows, 16 distinct promos, all at the group level; 7 promos observed on more than one day; group best-per-promo sum is **$70.45**. Daily sums of rows: 9.40, 5.60, 13.51, 11.50, 14.95, 20.33, 25.47.
- 4 users; `user_books`: users 1, 2, 4 have books (7, 7, 2).
- Completions: user 1 has 7 (two legacy with $0 and null snapshot on 09-28, 09-29; then 5.12, 4.25, 3.88, 9.05); user 2 has one ($1.97 on 10-01). No completion predates 09-27. Every completion with profit has an observation for its promo, so at the group level grey >= green today.
- Caps: 6 rows. User 1 caps four DraftKings boosts (promos 20, 24, 29, 36) at $20 against the promo's $25. User 2 caps promo 20 at **$200** (above the $25 public cap). User 4 caps promo 32 at $10 (equal to the public cap).

### Size of the difference on live data
- **Caps (quantifiable roughly):** User 1's four capped promos carry $27.18 of group-level best profit (5.75+4.56+5.50+11.37). If profit scales linearly with stake, at $20 that is about $21.74, so the group-level grey overstates user 1 by about **$5.44** (roughly 8% of the $70.45 total). [ASSUMED: linear scaling; a winnings cap or the bonus-leg mechanics could change it.]
- User 2's $200 cap on promo 20 would move that promo from $5.75 toward $46 if linear [ASSUMED], i.e. the group-level grey would **understate** user 2 by up to about $40, more than all group-level profit combined. Whether a winnings cap binds is unknown without re-ranking. This is the largest single distortion on live data.
- **Pairs and member hedge books: not quantifiable** for past days. Pair profit is always >= the two singles combined by the selection rule, so ignoring pairs understates grey; ignoring the member's hedge-book limits overstates it. Directions oppose, size unknown.
- **Private promos:** zero today, so no current effect, but any future one makes green exceed grey on the fallback.

**Plain-English trade-off for the owner:** days 09-27 through the day this ships will show the group-level number (full max stake, singles only, best hedge book across all books, no private promos). From the ship day onward the grey line is exactly what your own feed showed, with your caps and pairs. Past days cannot be corrected because the odds they depended on were not saved.

### Recommended design

**New table (migration 0012, drizzle-kit generate; applied manually with owner OK):**
```ts
export const memberProfitObservations = pgTable(
  "member_profit_observations",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    promoId: integer("promo_id").notNull().references(() => promos.id, { onDelete: "cascade" }),
    denverDate: text("denver_date").notNull(),
    bookKey: text("book_key").notNull().references(() => books.key),
    /** This promo's attributed profit that day: its single profit, or its share of a chosen pair (shares sum exactly to the pair profit). */
    profit: numeric("profit", { precision: 10, scale: 2 }).notNull(),
    partnerPromoId: integer("partner_promo_id"),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.promoId, t.denverDate] }),
    index("member_profit_observations_user_date_idx").on(t.userId, t.denverDate),
  ],
);
```
Upsert like `recordProfitObservations`: `ON CONFLICT (user_id, promo_id, denver_date) DO UPDATE SET profit = greatest(...)`. Caveat: `greatest` per promo-day mixes single and pair states (a promo can be single on one load and paired on another within a day). Accepted ("best observed"); it can only raise a promo's number, and each promo is counted once at its best. Document in a code comment.

**Pair share rule (exact to the cent, nonnegative):** for a chosen pair, row for promo A gets its own single profit (`separateProfitA` from the candidate), row for promo B gets `pair.guaranteedProfit - separateProfitA`. Sum = pair profit exactly; B's share >= its single because selection requires gain > 0. [VERIFIED: `PairCandidate.separateProfitA/B/gain` in `pairPromos.ts`.] Both rows carry `partnerPromoId`.

**What to record (per member):** from the same values `getOpportunities` already computes: `singles` (member-capped, member hedge books, `hasPromoBook` filter) and `chosenPairs` over `ctx.feedPromos`. Write only positive profits. Extract a shared function (e.g. `recordMemberProfitObservations(userId, now, {singles, chosenPairs})` in `src/db/memberObservations.ts`) so the morning job can call it too: refactor the singles+pairs computation of `getOpportunities` into a reusable helper (planner: lift the block that builds `singles`/`chosenPairs` into `src/db/feedContext.ts` or a new pure-ish module so both callers share one implementation; do not duplicate the pair rule). Wrap writes in try/catch + `console.error`, as `promoObservations.ts` does, so a write failure never breaks the feed.

**Morning job:** loop all users (`select id from users`) calling `loadMemberFeedContext` then the shared compute then record, after `recordCurrentProfitObservations`. Same boundary rule: `src/ingestion` may import `src/db`/`src/domain`; `src/app` must not import `src/ingestion` (boundary test exists). Keep the group-level recording unchanged.

**Done-promo guard (recommended, small):** `feedPromos` excludes done promos, so a promo the member completes stops being re-observed. It was observed on earlier loads (the member needed the feed to mark it done), so this is fine in practice. For legacy/odd cases, in the series builder clamp nothing; instead let the unit tests assert that the resolved available best for a completed promo is never below its `profit_extracted` only if the member row exists. Do not invent data.

### How the series resolves a promo (fallback rule)
For each promo visible to the member:
1. `best` = max(member rows' `profit`) if the member has any rows for the promo, else max(group rows' `max_guaranteed_profit`) provided the group row's `book_key` is in the member's CURRENT own books (group rows have no per-member book info).
2. `day` = min(`denver_date`) across member rows and group rows for that promo (so a promo first seen 09-29 still lands on 09-29 after cutover).
3. Add `best` to that day's available gain (decimal.js).
Member rows are not filtered by current books (history is what the member actually saw).

## Standard Stack

### Core (new)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | 3.10.1 (published 2026-07-25, `latest` dist-tag) [VERIFIED: npm registry] | Line chart, step lines, tooltip | What the project's shadcn registry charts wrap; peer deps accept React 19 (`react ^16.8 \|\| ... \|\| ^19`); repo https://github.com/recharts/recharts |

Project is on `react@19.2.8` (CLAUDE.md said 19.3; package.json is authoritative). recharts peers cover it. [VERIFIED: npm view + package.json]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | Hand-rolled SVG with pointer events | Zero dependency and tiny, ~100 lines for 2 step paths, hit-testing by x, and a tooltip; fine for at most a few hundred daily points. Choose this if recharts' touch tooltip fails the phone check or the bundle cost bothers the owner. |
| recharts | uPlot 1.6.32 (545KB unpacked, fast, small) | Imperative canvas API, no React bindings, more glue and a custom tooltip; overkill |
| recharts | @visx/xychart 4.0.0 | Needs `@react-spring/web`; more assembly |
| recharts | chart.js 4.5.1 + react-chartjs-2 5.3.1 | Canvas, heavier, tooltip styling outside Tailwind |
| recharts | echarts 6.1.0 | 60MB unpacked; far too heavy |

**Installation:** `npm install recharts` (or `npx shadcn@latest add chart`, which adds `src/components/ui/chart.tsx` and recharts; project style is `base-nova`, `components.json` present). The plain install plus a small custom component is acceptable; the shadcn wrapper is optional and mainly supplies CSS-variable color config.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| recharts | npm | about 11 yrs (created 2015-08-07) | very high (widely used; not queried) | github.com/recharts/recharts | slopcheck ran against **PyPI** (wrong ecosystem; its CLI has no npm mode here) and returned SLOP, which is meaningless for an npm package | Approved with caveat: no `postinstall` script found (`npm view recharts scripts.postinstall` empty); planner should still add a `checkpoint:human-verify` before `npm install` because slopcheck could not validate npm. Tagged [ASSUMED] for the provenance rule. |

**Packages removed:** none. **Flagged suspicious:** none (verification gap only).

## Architecture Patterns

### System Architecture Diagram
```
Member opens Opportunities
        |
        v
getOpportunities (server action, requireUser first)
        |-- loadMemberFeedContext(user, caps, books, done)
        |-- singles = rankPromoHedges(feedPromos)     chosenPairs = selectPairs(findPairCandidates(...))
        |-- recordMemberProfitObservations(user, singles, pairs)  --> member_profit_observations (upsert greatest)
        |-- loadProfitSeries(user, now):
        |      group obs (promo_profit_observations) + member obs + completions
        |      --> buildDailyGains()  (pure, decimal.js) --> [{date, available, extracted}] all-time
        v
OpportunitiesResponse.profitSeries (strings, cents) + today (Denver)
        |
        v  (client)
ProfitGraph: range (persisted) --> cumulate(days, range, today) --> {points, totals}
        |--> header: Extracted $X of $Y available + range ToggleGroup + hide/show
        '--> Recharts LineChart (2 stepAfter lines) + Tooltip content (date, both totals, day gain)

Morning job (scripts/morning-odds-observe.ts) --> for each user: same compute + record
Mark done / Undo --> promosVersion bump --> OpportunitiesScreen refetch --> green updates
```

### Recommended Project Structure
```
src/domain/promos/profitSeries.ts        # pure: resolveAvailableByPromo, buildDailyGains, cumulate, range helpers, ALL_TIME_START
src/domain/promos/profitSeries.test.ts   # table-driven
src/domain/promos/pairShares.ts          # pure: pair -> two exact shares (or inside profitSeries.ts)
src/db/memberObservations.ts             # record + read member rows
src/db/schema.ts + drizzle/0012_*.sql    # new table
src/components/opportunities/ProfitGraph.tsx   # "use client"; Phase 7 reuses
src/lib/persistentState.ts               # + STORAGE_KEYS.profitGraphRange, profitGraphHidden
src/domain/opportunities/types.ts        # + profitSeries on the ok response
```

### Pattern 1: Resolve then bucket (pure, exact)
```ts
// Decimal strings in, cent strings out. Mirrors sumMaxPerPromo in profitTotals.ts.
const best = new Map<number, { day: string; profit: Decimal }>();
// pass 1: member rows; pass 2: group rows (only for promos with no member rows, own books only)
// day = min date seen across BOTH sources for that promo; profit = max in the chosen source
// gains[day] = gains[day].plus(profit)
```
Reuse `denverDate`, add `addDays(dateString, n)` with `Date.UTC` (same technique as `toDateString` in `profitTotals.ts`, which is not exported; export it or add a small shared helper rather than using local-time Date methods).

### Pattern 2: Green line
`getPromoCompletions(userId)` already returns `completedAt` and `profitExtracted` (string). Bucket `denverDate(completedAt)`. Pair completions are two rows (primary and member marker); `profit_extracted` of the marker row is stored separately, so a plain sum counts a pair once as long as the existing mark-pair code splits it (verify in `mark-pair-done.ts` that primary + member extracted sum to the pair profit; `sumProfitExtracted` in `doneSnapshot.ts` is the existing precedent, reuse its summation convention). Legacy rows contribute "0.00".

### Pattern 3: Server ships daily gains, client cumulates per range
Server returns `{ today: "YYYY-MM-DD", days: [{date, available, extracted}] }` for `ALL_TIME_START` ("2026-09-27", exported constant) through today, including zero days (so every day is a point; roughly 365 rows per year at most, tiny). Client `cumulate(days, rangeStart)`: start = `weekStart` / `monthStart` from `periodStartDates(now-based today)` or `max(ALL_TIME_START, ...)`. Take days with `date >= start`, running totals start from 0 (D-01). Because `periodStartDates` takes a `Date`, expose a variant that accepts the server's `today` string, so the client never depends on its own timezone.
- **D-04 choice (recommended):** drop completions before 2026-09-27 (clamp both lines to the same day window). Rolling them into a starting value would put green above a $0 grey start and break D-01. Live data has none, so no visible effect.
- Range is a pure presentation slice, so no refetch on range change, and Phase 7's Stats page reuses `cumulate` and `ProfitGraph`.
- Points: first point is the first day's cumulative (gain of that day included). Optionally prepend a $0 anchor point at start-1 for the visual "starts at $0"; planner's call, recommend yes for a clear baseline.
- Day gain in readout = that day's `available`/`extracted` strings straight from the DTO (no float).

### Pattern 4: Persistence
Add to `STORAGE_KEYS`: `profitGraphRange: "promoprofit.profitGraph.range"`, `profitGraphHidden: "promoprofit.profitGraph.hidden"`. Use `usePersistentString(key, "30d")` and a `parseRange(value): "7d"|"30d"|"all"` fallback exactly like `parseSortMode` in `src/lib/sortPreference.ts`. SSR returns the default; the hook is hydration-safe via `useSyncExternalStore`.

### Pattern 5: Server action and response
Do not add a client-supplied range or user id. Embed `profitSeries` in `OpportunitiesResponse` `ok` (built inside `respond()`, so every empty variant also carries it, like `availableProfit`). Compute it AFTER the member recording call so today's number is included. Also export `loadProfitSeries(userId, now)` from `src/db` for a Phase 7 standalone action. Any new action must call `requireUser()` first and use a `z.strictObject({})` input if it takes none.

### Chart specifics (Recharts)
- `"use client"` component. `ResponsiveContainer width="100%" height={160}` (D-11). Two `<Line type="stepAfter" dot={false} isAnimationActive={false}>`. Step line types are documented as `stepAfter`/`step`. [ASSUMED: from training; confirm in Recharts docs during implementation.]
- Colors via CSS variables so `prefers-color-scheme` works with no JS: grey `stroke="var(--muted-foreground)"`, green `stroke="var(--primary)"` (the app's `text-primary` green; check contrast of both in dark mode).
- Tooltip: custom `content` component reading the active point's string fields. Recharts' docs page for Tooltip lists only `hover`/`click` triggers and says nothing about touch. [CITED: recharts.github.io/en-US/api/Tooltip] Touch support is believed to work through the chart's touch handlers but is **not confirmed by docs** [ASSUMED]. Mandate a real-phone (or device-emulator touch) check; if the tooltip does not follow a dragging finger, fall back to the hand-rolled SVG. Set `touch-action: pan-y` on the chart wrapper so vertical page scroll still works while horizontal drags scrub.
- Figures use `num` class; header totals show end-of-range values by default and swap to the hovered point's running totals only inside the tooltip (D-16).
- Compare floats only for pixel plotting: `Number(str)` for the Y values is acceptable because nothing displayed is derived from it; add a code comment, since CLAUDE.md forbids float money math.
- Hide/show: shadcn `collapsible` or a conditional render with a small button; range picker: `toggle-group` (base-ui) with type single, ignore empty value on deselect.
- Empty state (D-17): show the message when no day in range has a nonzero available or extracted gain.

### Anti-Patterns to Avoid
- Re-deriving the pair rule in the recorder: call `findPairCandidates`/`selectPairs` once in a shared helper, used by the feed, the recorder, and the morning job.
- Recording from the group-level job with a member id: the group table stays group-level.
- Using the client clock for "today" or range starts.
- Summing floats anywhere; show only decimal strings.
- Fetching on range change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Denver day bucketing | custom tz math | `denverDate`, `periodStartDates` (`profitTotals.ts`) | DST-safe, already tested |
| Per-device state | raw localStorage effects | `usePersistentString` | SSR-safe, lint-safe |
| Pair rule | a second copy | `findPairCandidates` + `selectPairs` | owner-reaffirmed rule |
| Cap application | manual stake math | `applyMemberCaps` via `getActivePromos(now, userId)` | already applies the member's caps |
| Money sums | numbers | `decimal.js` | CLAUDE.md |
| Chart axes/tooltip plumbing | bespoke SVG (unless fallback needed) | recharts | hit-testing and responsive sizing |

## Runtime State Inventory
Not a rename/refactor phase. One schema addition (new table); no stored data to migrate. Existing `promo_profit_observations` rows stay untouched and become the fallback source.

## Common Pitfalls

### Pitfall 1: Recording only on page load misses quiet days
**What goes wrong:** a member who does not open the app on a day gets no member rows, so those days fall back to the group number forever.
**Avoid:** also record per member in the morning job (loop users). Odds are only as fresh as the cache, same as the group job.

### Pitfall 2: Two sources double count one promo
Use per-promo precedence (member rows win), never union and sum. Test: a promo present in both tables counts once, on the earliest date.

### Pitfall 3: Pair counted plus singles
Pair shares replace the singles (B's share = pair minus A's single). Test that the two shares sum exactly to the pair profit and that a pair-then-single day does not exceed the larger observed total per promo.

### Pitfall 4: `greatest` mixing single and pair states within a day
Accepted behavior, documented; covered by a test of the upsert expression only if done in SQL (use the same pattern as `recordProfitObservations`).

### Pitfall 5: Green above grey from legitimate causes
Private promos (fixed), caps above the public cap (fixed going forward), completion on a different Denver day than first seen (not an error: lines are cumulative). The fallback days can still show green above grey (private promos, cap raises); mention in the owner note.

### Pitfall 6: Timezone drift
Server provides `today`; never call `new Date()` for bucketing on the client; Intl `en-CA` formatter pattern is already in `profitTotals.ts`.

### Pitfall 7: Chart SSR/hydration
Recharts `ResponsiveContainer` measures on the client; render the chart inside the client component and give the wrapper a fixed 160px height so layout does not jump (use `skeleton` while the response is null).

### Pitfall 8: Existing tests
`getOpportunities` tests mock the DB layer; adding a field to the response and new DB calls requires updating those mocks (`get-opportunities.test.ts`, `promoObservations.test.ts` style).

## Code Examples

### Cumulate (client-safe, pure)
```ts
// src/domain/promos/profitSeries.ts
export function cumulate(days: DailyGain[], startDate: string): SeriesPoint[] {
  let a = new Decimal(0), e = new Decimal(0);
  return days.filter(d => d.date >= startDate).map(d => {
    a = a.plus(d.available); e = e.plus(d.extracted);
    return { date: d.date, availableTotal: a.toFixed(2), extractedTotal: e.toFixed(2),
             availableGain: d.available, extractedGain: d.extracted };
  });
}
```

### Pair share
```ts
const shareA = candidate.separateProfitA;                 // Decimal
const shareB = new Decimal(pair.guaranteedProfit).minus(shareA);
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Group-level observations (quick-260927-n12) | Per-member, pair/cap-aware rows going forward, group rows as fallback | Grey matches what the member's feed showed |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Boost profit scales roughly linearly with stake for the cap-size estimates ($5.44 over, up to about $40 under) | Data Findings | Estimates off; qualitative conclusion (group-level grey is wrong for capped members) still holds |
| A2 | Recharts tooltip follows a finger on touch devices | Chart | Need hand-rolled SVG fallback; hence the mandatory phone check |
| A3 | `type="stepAfter"` is the correct Recharts step prop | Chart | Trivial fix at implementation |
| A4 | recharts package safe (slopcheck could not check npm) | Package Audit | Low (11-year-old well-known package); gated behind a human-verify checkpoint |
| A5 | Pair completions store primary + member `profit_extracted` that sum to the pair profit | Pattern 2 | Green would double or half count pairs; verify in `mark-pair-done.ts` first |

## Open Questions

1. **Should the owner accept the fallback days' approximation?** Past days (09-27 to ship day) show group-level, singles-only, full-stake numbers. Recommendation: yes, with a short footnote or caption under the graph ("Before Oct N, available profit is estimated at each promo's full max stake"), since past odds are gone. Cap-raise cases (user 2) are the worst offender.
2. **Record on Promos-tab loads too?** `getPromos` also calls `recordCurrentProfitObservations`. It computes pairs only in Opportunities; recording member rows only from `getOpportunities` plus the morning job is enough. Recommendation: Opportunities and the morning job only.
3. **Whether to clamp** grey up to green on a day for legacy rows. Recommendation: no (honest data, no invention).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm | install recharts | yes | engines >=22.13 | — |
| Neon DB (read) | live findings | yes | — | — |
| Neon DB (migrate) | migration 0012 | owner-gated | — | Owner applies `npm run db:migrate` manually; code must degrade (try/catch) if the table is absent before migration is applied |

Migration notes: `npm run db:generate` creates `drizzle/0012_*.sql` and updates `drizzle/meta`; commit it; do NOT run `db:migrate` without owner OK. Latest existing is `0011_user_promo_caps`. Because migrations are applied manually, ship order: migration applied first, then deploy; reads of the new table should tolerate absence (catch and fall back to group-only) so a deploy before the migration does not break the feed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.x (`npm test` = `vitest run`) |
| Config file | existing repo vitest config (tests colocated `*.test.ts`) |
| Quick run command | `npx vitest run src/domain/promos/profitSeries.test.ts` |
| Full suite command | `npm test && npm run typecheck && npm run lint` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STATS-02 | each promo once, best value, first-seen Denver day; member rows beat group rows; fallback filtered to own books; pair shares sum exactly | unit (table-driven) | `npx vitest run src/domain/promos/profitSeries.test.ts` | Wave 0 |
| STATS-02 | member recorder writes singles and pair shares, positive only, never throws | unit (mock db) | `npx vitest run src/db/memberObservations.test.ts` | Wave 0 |
| STATS-03 | completions bucketed by Denver day incl. DST edges and legacy "0.00" | unit | same profitSeries test | Wave 0 |
| STATS-04 | 7d/30d/all slices, start at $0, All time clamped to 2026-09-27, Denver rolling days | unit | same | Wave 0 |
| STATS-01/05/06 | response carries series in every ok branch; empty series gives empty state; readout strings exact | unit/component (existing get-opportunities mocks) | `npx vitest run src/app/actions/get-opportunities.test.ts` | exists, needs update |
| STATS-05/06 | touch tooltip on a real phone, dark mode, 160px layout | manual-only (device behavior not reproducible in jsdom) | — | — |

### Sampling Rate
- **Per task commit:** the quick command for the touched file
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green, typecheck and lint clean, manual phone check done

### Wave 0 Gaps
- [ ] `src/domain/promos/profitSeries.test.ts`
- [ ] `src/db/memberObservations.test.ts`
- [ ] update `get-opportunities.test.ts` mocks for new DB calls and response field
- [ ] Framework install: none (Vitest present)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2/V3 Authentication, Session | yes (existing) | `requireUser()` first statement; iron-session |
| V4 Access Control | yes | user id from the session only; every query filtered by it; never accept a user id or range from input (IDOR guard, as in `SetPromoCapInputSchema`) |
| V5 Input Validation | yes | `z.strictObject` on any new action input; client range validated by `parseRange` |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| One member reading another's totals | Information disclosure | session-scoped queries; no user id param; test that the DB read receives the session id |
| Another member's private promo leaking into group fallback | Information disclosure | reuse `promoVisibilityCondition(viewerUserId)` |
| Malformed persisted localStorage range | Tampering | whitelist parse with default |

## Project Constraints (from CLAUDE.md)
- decimal.js for all money math; format to cents only at display (plotting coordinates are the only float use).
- Next.js App Router, TypeScript, Drizzle + Neon (`@neondatabase/serverless`, neon-http: no interactive transactions, so use multi-row single statements for atomic writes).
- Zod validation on server action inputs; invite-only access.
- Work through GSD workflow commands only; migrations only with owner OK.
- No emojis; owner prefers plain-English explanations and sticking to ROADMAP.

## Sources

### Primary (HIGH confidence)
- Repo code: `src/db/promoObservations.ts`, `promoTracking.ts`, `feedContext.ts`, `promos.ts`, `schema.ts`, `src/domain/promos/profitTotals.ts`, `yourCap.ts`, `pairPromos.ts`, `src/app/actions/get-opportunities.ts`, `src/lib/persistentState.ts`, `OpportunitiesScreen.tsx`
- Live Neon read-only queries, 2026-10-03
- npm registry: recharts 3.10.1 (peers, dist-tags, publish time), uplot, visx, chart.js, echarts versions

### Secondary (MEDIUM)
- https://recharts.github.io/en-US/api/Tooltip/ (triggers documented; no touch mention)

### Tertiary (LOW)
- Training knowledge on Recharts touch handling and `stepAfter` (flagged A2, A3)

## Metadata

**Confidence breakdown:**
- Data findings and design: HIGH (code + live DB inspected)
- Standard stack: MEDIUM (version verified; touch behavior unverified; slopcheck gap)
- Pitfalls: HIGH

**Research date:** 2026-10-03
**Valid until:** 2026-11-02 (recharts 3.11 canary is in flight; pin 3.10.1)
