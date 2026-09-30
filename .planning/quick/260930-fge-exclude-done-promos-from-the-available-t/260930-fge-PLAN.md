---
phase: quick-260930-fge
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/promos/profitTotals.ts
  - src/domain/promos/profitTotals.test.ts
  - src/db/feedContext.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/get-opportunities.ts
  - src/app/actions/get-promos.test.ts
  - src/app/actions/get-opportunities.test.ts
autonomous: true
requirements: [QUICK-260930-fge]

must_haves:
  truths:
    - "A promo the viewer has marked Done does not count toward the 'Available today' number"
    - "Both promos of a Done pair are excluded from 'Available today' (markPairDone writes a promo_completions row for each, so both ids are in doneIds)"
    - "The week and month numbers are unchanged: Done promos still count there"
    - "Another member's Done marks never affect this viewer's today number (doneIds comes from getPromoCompletions(viewer userId))"
    - "Money math stays in decimal.js with a 2-dp string result"
  artifacts:
    - path: "src/domain/promos/profitTotals.ts"
      provides: "summarizeAvailableProfit with a doneTodayExcludedIds parameter applied only to the today bucket"
      contains: "excludeFromToday"
    - path: "src/db/feedContext.ts"
      provides: "loadAvailableProfit(now, ownBookKeys, viewerUserId, doneIds)"
  key_links:
    - from: "src/app/actions/get-promos.ts"
      to: "loadAvailableProfit"
      via: "passes the existing doneIds Set built from completions"
      pattern: "loadAvailableProfit\\(now, userBookSet, user\\.userId, doneIds\\)"
    - from: "src/app/actions/get-opportunities.ts"
      to: "loadAvailableProfit"
      via: "passes ctx.doneIds from loadMemberFeedContext"
      pattern: "loadAvailableProfit\\(now, ctx\\.userBookSet, user\\.userId, ctx\\.doneIds\\)"
---

<objective>
Exclude the viewer's Done promos (including both promos of a Done pair) from `availableProfit.today`, leaving `week` and `month` as they are (owner asked for today only).

Purpose: The headline "Total profit available" already skips Done promos (sumOwnBookProfit / sumPortfolioProfit take `doneIds`), but the "Available today" counter still sums them from promo_profit_observations, so it overstates what is actually left to grab today.
Output: A pure-domain change in profitTotals.ts, a threaded `doneIds` argument through loadAvailableProfit, both callers updated, and Vitest coverage. No new DB query, no DB writes, no migrations.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/domain/promos/profitTotals.ts
@src/db/feedContext.ts

<interfaces>
Current (src/domain/promos/profitTotals.ts):
- `export function summarizeAvailableProfit(observations: ProfitObservation[], ownBookKeys: ReadonlySet<string>, now: Date): AvailableProfit` -- filters to own books and `denverDate <= today`, then today/week/month each call private `sumMaxPerPromo(filtered)` (per-promo MAX, summed with Decimal, `.toFixed(2)`).
- `ProfitObservation { promoId: number; bookKey: string; denverDate: string; maxGuaranteedProfit: string }`
- `AvailableProfit { today: string; week: string; month: string }`

Current (src/db/feedContext.ts):
- `export async function loadAvailableProfit(now: Date, ownBookKeys: ReadonlySet<string>, viewerUserId: number): Promise<AvailableProfit>`
- `loadMemberFeedContext(...)` already returns `doneIds: Set<number>` = `new Set(completions.map((c) => c.promoId))` from `getPromoCompletions(userId)`.

Callers:
- src/app/actions/get-promos.ts line ~124 builds `const doneIds = new Set(completions.map((c) => c.promoId));` (completions from `getPromoCompletions(user.userId)`), line ~143: `await loadAvailableProfit(now, userBookSet, user.userId);`
- src/app/actions/get-opportunities.ts line ~53: `await loadAvailableProfit(now, ctx.userBookSet, user.userId);` where `ctx = await loadMemberFeedContext(...)` exposes `ctx.doneIds`.

Pair Done: `markPairDone` (src/db/promoTracking.ts) inserts one promo_completions row per promo of the pair, so `doneIds` already contains BOTH pair promo ids -- no extra pair handling is needed.

Action tests mock `@/db/promoTracking` (`getPromoCompletions`, `getProfitObservationsSince`) -- loadAvailableProfit itself is NOT mocked, so the real summarize logic runs in action tests. get-promos.test.ts has a `completion({ promoId })` helper (line ~1100) and a describe block "getPromos profit observation recording + availableProfit (quick-260927-n12)" (line ~1264) using `denverDate(new Date())` for today's observation date.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Domain -- exclude Done promo ids from the today bucket only</name>
  <files>src/domain/promos/profitTotals.ts, src/domain/promos/profitTotals.test.ts</files>
  <behavior>
    - Promo 1 (draftkings, today, 6.00) and promo 2 (draftkings, today, 4.00), excludeFromToday = {1} -> today "4.00", week "10.00", month "10.00"
    - Done pair: promos 1 and 2 both in excludeFromToday, promo 3 (today, 2.50) not -> today "2.50"; week/month still include 1 and 2
    - Done promo observed on an earlier day this week at a higher value: still counts in week at its max, absent from today
    - Every promo Done -> today "0.00" (exact 2-dp string), week/month non-zero
    - Empty excludeFromToday Set -> identical results to the existing tests (existing cases keep passing)
  </behavior>
  <action>
In summarizeAvailableProfit add a required 4th parameter `excludeFromToday: ReadonlySet<number>` (the viewer's Done promo ids). Apply it ONLY when computing `today`: filter the today-period observations with `!excludeFromToday.has(o.promoId)` before calling sumMaxPerPromo. Leave the week and month computations exactly as they are (owner asked for today only). Keep all money math in decimal.js via the existing sumMaxPerPromo -- no native number arithmetic on money. Update the function's doc comment to say Done promos (both halves of a Done pair, since each has its own completion row) are excluded from today only, matching how the headline total treats Done via sumOwnBookProfit/sumPortfolioProfit.

Make the parameter required (not defaulted) so every caller is forced by the type checker to supply it. Update the existing summarizeAvailableProfit test calls in profitTotals.test.ts to pass `new Set()` and add a new `describe` block covering the behavior cases above (write the new tests first, confirm they fail, then implement).
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/profitTotals.test.ts</automated>
  </verify>
  <done>New and existing profitTotals tests pass; today excludes Done ids; week/month unchanged by Done ids.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Thread the viewer's Done ids through loadAvailableProfit and both callers</name>
  <files>src/db/feedContext.ts, src/app/actions/get-promos.ts, src/app/actions/get-opportunities.ts, src/app/actions/get-promos.test.ts, src/app/actions/get-opportunities.test.ts</files>
  <behavior>
    - getPromos: user owns draftkings; observations today for promo 1 (12.34) and promo 2 (5.00) at draftkings; getPromoCompletions returns completion({ promoId: 1 }) -> availableProfit.today "5.00", week "17.34", month "17.34"
    - getOpportunities: same setup via its own mocks (completion row for promo 1) -> totals.availableProfit.today excludes promo 1, week/month include it
  </behavior>
  <action>
In src/db/feedContext.ts add a required 4th parameter `doneIds: ReadonlySet<number>` to loadAvailableProfit (keep it viewer-scoped: the ids come from the caller's getPromoCompletions(viewer userId) result) and pass it to summarizeAvailableProfit. Update the doc comment accordingly. Do NOT add any new DB query.

In src/app/actions/get-promos.ts change the call to `loadAvailableProfit(now, userBookSet, user.userId, doneIds)`, reusing the `doneIds` Set already built from `completions` a few lines above (the same Set passed to sumOwnBookProfit for the headline). In src/app/actions/get-opportunities.ts change the call to `loadAvailableProfit(now, ctx.userBookSet, user.userId, ctx.doneIds)` (same Set passed to sumPortfolioProfit). Confirm with grep there are no other callers of loadAvailableProfit or summarizeAvailableProfit in src (currently only these two actions and feedContext).

Add one test to the existing "getPromos profit observation recording + availableProfit (quick-260927-n12)" describe in get-promos.test.ts using the `completion({ promoId: 1 })` helper and `denverDate(new Date())` for the observation date. Add an equivalent test in get-opportunities.test.ts, reusing that file's existing completion-row shape (see the mockGetPromoCompletions.mockResolvedValue usages around lines 231/335) and its mockGetUserBookKeys / mockGetProfitObservationsSince mocks. Then run the full checks.
  </action>
  <verify>
    <automated>npm test &amp;&amp; npm run typecheck &amp;&amp; npm run lint</automated>
  </verify>
  <done>Both actions pass the viewer's Done ids; new action tests show today excludes the Done promo while week/month keep it; full test suite, typecheck, and lint pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| session -> server action | viewer identity comes only from requireUser() |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fge-01 | Information Disclosure | loadAvailableProfit doneIds | mitigate | doneIds is built only from getPromoCompletions(user.userId) (session user); another member's Done marks never reach this viewer's totals |
| T-fge-02 | Tampering | availableProfit.today | accept | read-only display figure; no client input feeds doneIds; no DB writes in this change |
</threat_model>

<verification>
- `npm test`, `npm run typecheck`, `npm run lint` all pass
- `grep -n "loadAvailableProfit(" src/app/actions/*.ts` shows both callers passing a Done-ids Set
- week/month assertions in existing tests unchanged
</verification>

<success_criteria>
- availableProfit.today excludes every promo in the viewer's promo_completions (both halves of a Done pair)
- availableProfit.week and .month are computed exactly as before
- No new DB query, no DB writes, no migrations; decimal.js money math retained
</success_criteria>

<output>
Create `.planning/quick/260930-fge-exclude-done-promos-from-the-available-t/260930-fge-SUMMARY.md` when done
</output>
