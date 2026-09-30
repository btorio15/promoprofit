---
phase: quick-260930-hor
plan: 01
type: execute
wave: 1
depends_on: [260930-gyl]
files_modified:
  - src/domain/promos/rankPromoHedges.ts
  - src/domain/promos/rankPromoHedges.test.ts
  - src/domain/promos/leagueWideAltTargets.ts
  - src/domain/promos/leagueWideAltTargets.test.ts
  - src/domain/promos/altSpreads.ts
  - src/domain/promos/altSpreads.test.ts
  - src/ingestion/odds/refreshExtended.ts
  - src/ingestion/odds/refreshExtended.test.ts
  - src/app/actions/refresh-spreads-totals.ts
  - src/app/actions/refresh-spreads-totals.test.ts
autonomous: true
requirements: [QUICK-260930-hor]

must_haves:
  truths:
    - "On a confirmed Search spreads & totals press, each unpinned, spread-eligible league-wide (scope.kind !== 'event') boost or bonus bet visible to the pressing member adds exactly ONE game to the alt-spread fetch: its single most profitable game on the fresh MAIN lines at the member's hedge books"
    - "Several league-wide promos whose best game is the same game produce one fetch for it (dedupe, also deduped against single-game promo games)"
    - "League-wide picks share the 5-game cap with single-game and pinned targets; over the cap, soonest commence wins and the rest are counted in altLines.skippedOverLimit"
    - "A league-wide promo with no profitable/eligible main-line game adds no target"
    - "If the best-game pick throws, the main refresh still commits and returns ok, and single-game/pinned alt targets are still fetched"
    - "An unconfirmed press never loads promos, never runs the best-game pick, and never calls fetchEventOdds"
    - "Page ranking lets unpinned league-wide promos use exact-opposite half-point alt spread pairs at the promo's book on any in-scope game with cached alt lines, keeping max guaranteed profit, exact to the cent"
    - "correctionOptions output, the Arbitrage tab and the bonus-bet finder are unchanged"
  artifacts:
    - path: "src/domain/promos/leagueWideAltTargets.ts"
      provides: "pickLeagueWideAltSpreadEventIds (pure, zero-I/O best-game-per-promo pick on main lines)"
      exports: ["pickLeagueWideAltSpreadEventIds", "isLeagueWideAltSpreadPromo"]
    - path: "src/domain/promos/rankPromoHedges.ts"
      provides: "candidatesFor passes altSpreadBookKey for every unpinned promo (A1 relaxed)"
      contains: "altSpreadBookKey: promo.bookKey"
    - path: "src/ingestion/odds/refreshExtended.ts"
      provides: "pickAltSpreadEventIds hook run after the main fetch loop, before target selection, inside its own try/catch"
      contains: "pickAltSpreadEventIds"
    - path: "src/app/actions/refresh-spreads-totals.ts"
      provides: "confirmed-press wiring: member promos + member hedge books -> picker closure"
      contains: "pickLeagueWideAltSpreadEventIds"
  key_links:
    - from: "src/app/actions/refresh-spreads-totals.ts"
      to: "src/ingestion/odds/refreshExtended.ts runSpreadsTotalsRefresh"
      via: "pickAltSpreadEventIds option (closure over server-loaded promos + hedge books)"
      pattern: "pickAltSpreadEventIds"
    - from: "src/ingestion/odds/refreshExtended.ts"
      to: "src/domain/promos/altSpreads.ts selectAltSpreadTargets"
      via: "picked ids merged into scopedEventIds before the shared 5-game cap"
      pattern: "selectAltSpreadTargets"
    - from: "src/domain/promos/leagueWideAltTargets.ts"
      to: "src/domain/promos/rankPromoHedges.ts rankPromoHedges"
      via: "per-promo rank on alt-stripped fresh events, take [0].selection.eventId"
      pattern: "rankPromoHedges\\("
---

<objective>
Extend alternate-spread lines (built in 260930-gyl for single-game promos) to unpinned, spread-eligible league-wide promos (sport-window / date-window / any-game scope) without fetching every game they cover.

On the confirmed press: main spreads/totals fetch as today -> for each such promo, rank it on the FRESH main lines and take its top-1 game -> add those event ids to the alt fetch targets (deduped, sharing the 5-game cap, soonest first) -> fetch/merge/cache as today. At page render, league-wide unpinned promos may use exact-opposite alt pairs on any in-scope game that has cached alt lines.

Purpose: raise guaranteed profit on league-wide boosts/bonus bets (owner decisions in 260930-hor-CONTEXT.md, which deliberately relax gyl decision A1).
Output: one new pure domain module + tests; small edits to ranking, refresh orchestration and the server action + tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/260930-hor-alt-spreads-for-league-wide-promos-on-th/260930-hor-CONTEXT.md
@.planning/quick/260930-gyl-use-alternate-spreads-to-raise-roi-on-ga/260930-gyl-SUMMARY.md

<interfaces>
<!-- Extracted from the codebase. Use directly; no exploration needed. -->

src/domain/promos/rankPromoHedges.ts:
- `export interface RankablePromo { id; bookKey; promoType: "profit_boost"|"bonus_bet"; scope: PromoScope; pinned: PromoSelection|null; eligibleMarketTypes: readonly PromoMarketType[]; boostPercent; boostedOddsAmerican; baseOddsAmerican; bonusAmount; maxStake: string|null; winningsCap; minOddsAmerican }`
- `export interface RankOptions { moneylineEvents: OddsEvent[]; extendedEvents: OddsEvent[]; hedgeBookKeys: ReadonlySet<string>; precision: StakePrecision; now: Date }`
- `export function rankPromoHedges<P extends RankablePromo>(promos: P[], opts: RankOptions): PromoOpportunity<P>[]` — returns only strictly profitable promos, one opportunity each; `opp.selection.eventId`, `opp.selection.commenceTime: Date`.
- `export function candidatesFor(promo, opts)` (~line 290) currently passes `altSpreadBookKey: promo.scope.kind === "event" ? promo.bookKey : undefined` to `enumerateScopeSelections`. Pinned promos go through `getPinnedCandidates`.
- D-18: `profit_boost` with `maxStake === null` is never ranked.

src/domain/promos/altSpreads.ts:
- `ALT_SPREADS_MARKET = "alternate_spreads"`, `ALT_SPREAD_EVENT_LIMIT = 5`
- `interface AltSpreadRequests { pins: AltSpreadPin[]; scopedEventIds: string[] }`, `NO_ALT_SPREAD_REQUESTS`
- `buildAltSpreadRequests(promos)` — pins + event-scoped unpinned spread-eligible promos (doc comment cites "Decision A1").
- `selectAltSpreadTargets(requests, extendedEvents, now)` — scoped ids always candidates (future + present in this press's events), merged with pin events, sorted commence asc then eventId, sliced to 5, `skippedOverLimit` = remainder. Already dedupes via Set.
- NOTE: altSpreads.ts is imported by selection.ts, which rankPromoHedges.ts imports. Do NOT import rankPromoHedges into altSpreads.ts (import cycle) — the picker lives in a new file.

src/ingestion/odds/refreshExtended.ts:
- `runSpreadsTotalsRefresh(opts: { confirmed; now?; triggeredByUserId?; altSpreads?: AltSpreadRequests })` takes the refresh lock then calls `runGuardedSpreadsTotalsRefresh(opts)` (same opts type, duplicated inline).
- Unconfirmed press returns `confirm_required` BEFORE the main fetch loop.
- Main loop buffers `pendingWrites: { sportKey; extendedEvents; h2hEvents }[]`. Then the alt block: `const requests = opts.altSpreads ?? NO_ALT_SPREAD_REQUESTS; if (requests.pins.length > 0 || requests.scopedEventIds.length > 0) { selectAltSpreadTargets(requests, pendingWrites.flatMap(w => w.extendedEvents), now) ... credit gate (CREDIT_BLOCK_THRESHOLD) ... per-target try/catch fetchEventOdds ... mergeAltSpreads }`, then `commitSpreadsTotalsRefresh`.
- `altLines: AltLinesOutcome = { fetched, skippedOverLimit, skippedForCredits, failed, unmatchedOutcomes }` — shape must not change.

src/app/actions/refresh-spreads-totals.ts:
- `requireUser()` first; on `confirmed`, `altSpreads = buildAltSpreadRequests(await getActivePromos(new Date(), user.userId))` in try/catch falling back to `NO_ALT_SPREAD_REQUESTS`; then `runSpreadsTotalsRefresh({ confirmed, triggeredByUserId, altSpreads })`.

src/db/queries.ts (how get-promos.ts builds the member's hedge books, lines 114-118, 163-206):
- `getUserBookKeys(userId: number): Promise<string[]>`
- `getHedgeBookKeys(allowedKeys?: ReadonlySet<string>): Promise<string[]>` — call as `getHedgeBookKeys(new Set(userBookKeys))`.

src/db/promos.ts: `getActivePromos(now: Date, viewerUserId?: number): Promise<ActivePromo[]>`, `ActivePromo extends RankablePromo`.

Existing tests to mirror:
- rankPromoHedges.test.ts:1128 describe "alternate spreads for unpinned single-game promos (260930-gyl)" with fixture `altEvent` (game "pit-cle", FanDuel promo book, DK hedge) and test "A1: sport_window boost and any-scope bonus stay on the main line" (line ~1254) asserting 3.13 / 21.64.
- refreshExtended.test.ts:281 describe "alternate spread lines for promo games" with helpers `nflEvent(id, commenceHours)`, `altFor(event)`, `setup(events, remaining)`.
- correctionOptions.test.ts:107 "never lists alternate-spread lines (260930-gyl)".
- refresh-spreads-totals.test.ts mocks next/cache, @/lib/session, @/ingestion/odds/client, @/ingestion/odds/store (does NOT mock @/db/promos or @/db/queries today).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Ranking uses alt lines for league-wide promos + pure top-1 best-game picker</name>
  <files>src/domain/promos/rankPromoHedges.ts, src/domain/promos/rankPromoHedges.test.ts, src/domain/promos/leagueWideAltTargets.ts, src/domain/promos/leagueWideAltTargets.test.ts, src/domain/promos/altSpreads.ts, src/domain/promos/altSpreads.test.ts</files>
  <read_first>src/domain/promos/rankPromoHedges.ts (lines 280-340), src/domain/promos/rankPromoHedges.test.ts (lines 1-60 helpers, 1128-1290 gyl block), src/domain/promos/altSpreads.ts, src/domain/promos/altSpreads.test.ts, src/domain/hedge/profitBoost.ts and src/domain/hedge/bonusBet.ts (solver signatures only, for the cross-check)</read_first>
  <behavior>
    - (d) rankPromoHedges: a sport_window boost (FanDuel, 50%, maxStake 25, min odds -200) covering the gyl `altEvent` now picks Browns -6.5 alt, hedge DraftKings -230, hedgeStake 69.69, guaranteedProfit 5.30 (was 3.13 on main); an any-scope $50 bonus bet picks -6.5 alt, hedge 69.69, profit 30.30 (was 21.64). Also cross-check each against the project's solver called directly (calculateProfitBoostHedge / calculateBonusBetHedge with the same inputs) so the expected cents come from the project's own math, not a re-typed constant.
    - (d) sport_window boost covering TWO games — one with cached alt lines, one main-only — picks the alt pair on the cached game when it is more profitable; exact-opposite rule still holds (Browns -5.5 never chosen); min odds -200 still blocks the -250 line.
    - Pinned promos are unchanged (existing pinned tests pass untouched).
    - (a) pickLeagueWideAltSpreadEventIds: a sport_window boost covering games A and B where A has the higher main-line profit returns exactly ["A"] (length 1, NOT both covered games).
    - (b) two league-wide promos (a boost and a bonus bet) whose best main-line game is the same returns that id once (length 1).
    - Filters: event-scoped promo -> not picked (it is gyl's scopedEventIds job); pinned promo -> not picked; eligibleMarketTypes without "spread" -> not picked; profit_boost with maxStake null -> not picked; promo with no strictly profitable main-line game -> contributes nothing (empty array).
    - Main lines only: when an input event already carries an alternate_spreads market that would make game B the best, the picker still returns the main-line best game A (it strips alternate_spreads before ranking) and does not mutate its input events.
    - (c) selectAltSpreadTargets: 7 scoped ids (mix representing single-game and league-wide picks, one duplicated) -> 5 targets in commence-asc order, skippedOverLimit 2 (duplicate counted once).
  </behavior>
  <action>
    Ranking (per CONTEXT "Recommended" ranking side, relaxing gyl A1): in rankPromoHedges.ts `candidatesFor`, change the unpinned branch to pass `altSpreadBookKey: promo.bookKey` for every unpinned promo regardless of scope kind (drop the `promo.scope.kind === "event"` condition). Update its doc comment to say all unpinned promos try the promo book's alternate spreads on any in-scope game with cached alt lines (260930-hor relaxes 260930-gyl A1). Do not touch `enumerateScopeSelections` (alt stays opt-in, so correctionOptions.ts stays unchanged), resolveSpread, evaluators, solvers, pairPromos, rankArbs or rankBonusBetHedges.

    Update the existing gyl test "A1: sport_window boost and any-scope bonus stay on the main line" deliberately: rename it to state that league-wide promos now use the alt pair (260930-hor) and change its expectations to line -6.5 home, hedge {draftkings, -230}, 69.69 / 5.30 for the boost and 69.69 / 30.30 for the bonus, plus the direct-solver cross-check described in behavior. Add the two-game sport_window test in a new describe "rankPromoHedges: alternate spreads for league-wide promos (260930-hor)" reusing the gyl fixture pattern (build a second main-only event for the same sport inside the window). If any other existing test in the suite changes result because a league-wide promo now sees alt lines, update that expectation deliberately with a comment citing 260930-hor and list it in the SUMMARY — never loosen assertions.

    New file src/domain/promos/leagueWideAltTargets.ts (pure, zero-I/O, domain-only imports; must NOT be imported by altSpreads.ts or selection.ts to avoid an import cycle):
    - `export function isLeagueWideAltSpreadPromo(promo: RankablePromo): boolean` — true when `promo.pinned === null`, `promo.scope.kind !== "event"`, `promo.eligibleMarketTypes.includes("spread")`, and not (`promo.promoType === "profit_boost" && promo.maxStake === null`) (D-18, saves a credit). Both profit_boost and bonus_bet qualify.
    - `export function pickLeagueWideAltSpreadEventIds(promos: readonly RankablePromo[], opts: RankOptions): string[]` — first build main-only copies of `opts.moneylineEvents` and `opts.extendedEvents` (new event/bookmaker objects with every market whose key is `ALT_SPREADS_MARKET` removed; never mutate inputs). Then for each promo passing `isLeagueWideAltSpreadPromo`, call `rankPromoHedges([promo], { ...opts, moneylineEvents: stripped, extendedEvents: stripped })` and take `[0]?.selection.eventId` (top 1 by guaranteed profit, honoring min odds / max stake / caps / eligible markets / hedge books via the existing evaluator — ranking on the promo's full eligible market set, per CONTEXT step 2's "top 1 by guaranteed profit"). Collect into a Set and return `[...set]`. No ordering promise (selectAltSpreadTargets sorts). Money math stays inside the existing decimal.js solvers; this module does no arithmetic.
    - Tests in new src/domain/promos/leagueWideAltTargets.test.ts covering behaviors (a), (b), filters, main-lines-only/no-mutation. Build fixtures inline (small OddsEvent literals: two NFL games, FanDuel promo book, DraftKings hedge; NOW-relative commence times). Do not import from db or ingestion.

    altSpreads.ts: update the `buildAltSpreadRequests` / module doc comments so they no longer claim league-wide promos are excluded from alt lines — say event-scoped unpinned promos are "scoped" here and league-wide promos are picked after the main fetch via leagueWideAltTargets.ts (260930-hor). No logic change to `selectAltSpreadTargets` (it already dedupes, sorts soonest-first and caps at 5 for any scoped id). Add the (c) cap test to altSpreads.test.ts.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/leagueWideAltTargets.test.ts src/domain/promos/rankPromoHedges.test.ts src/domain/promos/altSpreads.test.ts src/domain/promos/selection.test.ts src/domain/promos/correctionOptions.test.ts src/domain/promos/pairPromos.test.ts</automated>
  </verify>
  <done>Picker returns exactly one game per qualifying league-wide promo (deduped); league-wide boost/bonus pick the alt pair at 5.30 / 30.30 matching the direct solver; cap test passes; correctionOptions and selection tests pass unchanged; `git diff --stat` shows no change to correctionOptions.ts, selection.ts, pairPromos.ts, rankArbs.ts, rankBonusBetHedges.ts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Run the best-game pick between the main fetch and the alt fetch on the confirmed press</name>
  <files>src/ingestion/odds/refreshExtended.ts, src/ingestion/odds/refreshExtended.test.ts, src/app/actions/refresh-spreads-totals.ts, src/app/actions/refresh-spreads-totals.test.ts</files>
  <read_first>src/ingestion/odds/refreshExtended.ts (lines 120-340), src/ingestion/odds/refreshExtended.test.ts (lines 1-65 mocks, 281-460 alt describe), src/app/actions/refresh-spreads-totals.ts, src/app/actions/refresh-spreads-totals.test.ts, src/domain/promos/leagueWideAltTargets.ts (from Task 1)</read_first>
  <behavior>
    - refreshExtended: with `altSpreads: { pins: [], scopedEventIds: [] }` and a `pickAltSpreadEventIds` hook returning ["e2"], fetchEventOdds is called once for e2 and altLines.fetched is 1 (league-wide pick alone triggers the fetch).
    - The hook is invoked once, after fetchSportOdds, with `{ moneylineEvents, extendedEvents, now }` where extendedEvents are the freshly fetched events and moneylineEvents are their h2h-only projections.
    - (c) shared cap: 4 single-game scoped ids + 3 hook ids (one overlapping a single-game id) over 6 distinct future events -> fetchEventOdds called 5 times in commence-asc order, altLines.skippedOverLimit === 1.
    - (e) hook throws -> outcome.status "ok", commitSpreadsTotalsRefresh called once, recordCreditUsage called, single-game scoped id still fetched, altLines.failed unchanged by the throw (0).
    - Credit gate still skips only the alt fetch when hook ids push the estimate below CREDIT_BLOCK_THRESHOLD (skippedForCredits true, status ok, main commit happens).
    - (g) unconfirmed press with a hook supplied -> hook never called, fetchEventOdds never called, status confirm_required.
    - Action: confirmed:false -> getActivePromos, getUserBookKeys, getHedgeBookKeys never called. confirmed:true -> getActivePromos(…, 42), getUserBookKeys(42) and getHedgeBookKeys(Set of those keys) called, and runSpreadsTotalsRefresh receives a pickAltSpreadEventIds function. Hedge-book load failure -> refresh still runs with gyl altSpreads intact and no hook. Promo load failure -> refresh still runs (no altSpreads, no hook).
  </behavior>
  <action>
    refreshExtended.ts (per CONTEXT "Refresh side", chosen approach = callback hook, which keeps the refresh lock, credit accounting, altLines shape and per-fetch try/catch intact and keeps member/book logic out of ingestion):
    - Export a type `AltSpreadEventPicker = (fresh: { moneylineEvents: OddsEvent[]; extendedEvents: OddsEvent[]; now: Date }) => string[]` (synchronous; all DB loading happens in the action before the lock).
    - Add `pickAltSpreadEventIds?: AltSpreadEventPicker` to the opts of both `runSpreadsTotalsRefresh` and `runGuardedSpreadsTotalsRefresh` (consider extracting a shared `SpreadsTotalsRefreshOptions` interface to avoid the duplicated inline type).
    - After the main per-sport loop and before the existing alt block, compute picked ids: if the hook is present, call it with `pendingWrites.flatMap(w => w.h2hEvents)`, `pendingWrites.flatMap(w => w.extendedEvents)` and `now`, inside its own try/catch that falls back to [] (a pick failure must never fail the main refresh and must not increment altLines.failed). Build `requests = { pins: base.pins, scopedEventIds: [...new Set([...base.scopedEventIds, ...picked])] }` where base is `opts.altSpreads ?? NO_ALT_SPREAD_REQUESTS`, and feed THAT into the existing guard / `selectAltSpreadTargets` / credit gate / fetch loop unchanged. The shared 5-game cap, soonest-first order and skipped count therefore apply to all target kinds together (owner decision). The hook is unreachable on an unconfirmed press because that path returns before the main loop — keep it that way.
    - Update the alt-block comment to mention 260930-hor league-wide top-1 picks.

    refresh-spreads-totals.ts:
    - Keep the existing confirmed-only try/catch that loads `getActivePromos(new Date(), user.userId)`; hold the loaded promos in a local so they can be reused. On failure, promos fallback is empty and no hook is built.
    - When promos loaded, in a SEPARATE try/catch load the member's hedge books exactly like get-promos.ts: `getUserBookKeys(user.userId)` then `getHedgeBookKeys(new Set(userBookKeys))` (import from `@/db/queries`). On success build the hook as a closure: `(fresh) => pickLeagueWideAltSpreadEventIds(promos, { moneylineEvents: fresh.moneylineEvents, extendedEvents: fresh.extendedEvents, hedgeBookKeys: new Set(hedgeBookKeys), precision: "cents", now: fresh.now })`. Precision "cents" is Claude's discretion (the pick only needs relative profit; the action has no precision input). On failure leave the hook undefined so single-game/pinned alt fetches still happen.
    - Pass `pickAltSpreadEventIds` to `runSpreadsTotalsRefresh`. Event ids come only from server-loaded promos of `requireUser()`'s member (T-hor-01); nothing from client input.
    - Update the comment block to describe league-wide top-1 picks.

    Tests:
    - refreshExtended.test.ts: add cases for every refreshExtended behavior above inside the existing "alternate spread lines for promo games" describe (retitle to include 260930-hor), reusing `nflEvent`, `altFor`, `setup`. Hooks are plain `vi.fn()` returning fixed ids — no real ranking needed here.
    - refresh-spreads-totals.test.ts: add `vi.mock("@/db/promos", …)` for getActivePromos and `vi.mock("@/db/queries", …)` for getUserBookKeys/getHedgeBookKeys, and `vi.spyOn` or mock `@/ingestion/odds/refreshExtended`'s runSpreadsTotalsRefresh only inside a new describe if needed to inspect the passed opts (otherwise assert through the mocked client/store). Existing tests must keep passing; if adding the module mocks changes their setup, give getActivePromos a default `mockResolvedValue([])` in beforeEach.
    - No live DB, no migrations, no Odds API calls (client and store are mocked).
  </action>
  <verify>
    <automated>npx vitest run src/ingestion/odds/refreshExtended.test.ts src/app/actions/refresh-spreads-totals.test.ts src/domain/promos/leagueWideAltTargets.test.ts</automated>
  </verify>
  <done>Confirmed press runs the picker once after the main fetch and fetches deduped league-wide + single-game + pinned targets under one shared 5-game cap; a throwing picker leaves the refresh ok and committed; unconfirmed press never loads promos, never picks, never fetches alt lines; altLines shape unchanged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> refreshSpreadsTotals action | Only `{ confirmed: boolean }` crosses; zod-validated after requireUser() |
| app -> The Odds API | Per-event alt fetches spend shared credits |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hor-01 | Tampering | alt target event ids | mitigate | Ids come only from getActivePromos(now, requireUser().userId) and the member's hedge books, loaded server-side; nothing from client input |
| T-hor-02 | Denial of service (credit burn) | league-wide picks | mitigate | Top-1 per promo, deduped, shared 5-game cap, existing CREDIT_BLOCK_THRESHOLD gate skips alt fetch only; confirmed press only |
| T-hor-03 | Denial of service | picker exception | mitigate | Picker wrapped in its own try/catch falling back to [], main refresh and credit recording unaffected |
| T-hor-04 | Information disclosure | refresh outcome | accept | altLines shape unchanged; no promo or book detail added to the response |
</threat_model>

<verification>
- `npx vitest run` (full suite) passes.
- `npx tsc --noEmit` reports 0 errors.
- `npm run lint` clean.
- `git diff --stat` touches only files in files_modified (no schema/migration, no correctionOptions.ts, selection.ts, pairPromos.ts, rankArbs.ts, rankBonusBetHedges.ts, arb or bonus-finder UI changes).
- `grep -n "altSpreadBookKey: promo.bookKey" src/domain/promos/rankPromoHedges.ts` shows no `scope.kind === "event"` guard on that line.
</verification>

<success_criteria>
- League-wide unpinned spread-eligible boosts/bonus bets each add exactly one (their best main-line) game to the alt fetch on a confirmed press, deduped, under the shared 5-game soonest-first cap with a correct skipped count.
- Feed ranking picks higher-profit exact-opposite alt pairs for league-wide promos on cached games, correct to the cent (5.30 boost / 30.30 bonus on the gyl fixture, matching the direct solver).
- Picker failure never fails the main refresh; unconfirmed press never triggers any alt work.
- correctionOptions, Arbitrage tab and bonus-bet finder unchanged.
</success_criteria>

<output>
Create `.planning/quick/260930-hor-alt-spreads-for-league-wide-promos-on-th/260930-hor-SUMMARY.md` when done
</output>
