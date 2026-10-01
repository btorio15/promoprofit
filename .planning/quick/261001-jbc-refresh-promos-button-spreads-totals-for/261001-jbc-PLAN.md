---
phase: quick-261001-jbc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/ingestion/odds/store.ts
  - src/ingestion/odds/store.test.ts
  - src/db/queries.ts
  - src/db/queries.test.ts
  - src/domain/promos/priceAge.ts
  - src/domain/promos/priceAge.test.ts
  - src/db/feedContext.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/get-opportunities.ts
  - src/domain/promos/promoRefreshScope.ts
  - src/domain/promos/promoRefreshScope.test.ts
  - src/ingestion/odds/refreshExtended.ts
  - src/ingestion/odds/refreshExtended.test.ts
  - src/app/actions/refresh-promos.ts
  - src/app/actions/refresh-promos.test.ts
  - src/components/arb/spreadsTotalsSearch.ts
  - src/components/finder/promoRefresh.ts
  - src/components/finder/promoRefresh.test.ts
  - src/components/finder/usePromoRefresh.ts
  - src/components/finder/PromoRefreshDialog.tsx
  - src/components/finder/OddsStatusBar.tsx
autonomous: true
requirements: [QUICK-261001-jbc]

must_haves:
  truths:
    - "The status bar shows a 'Refresh promos' button (stacked under 'Refresh odds', same compact equal-width styling) where 'Spreads & alt lines' used to be (D-05)"
    - "Pressing 'Refresh promos' never spends credits until the member confirms a dialog naming the promo sports and an estimated credit cost with the remaining balance (D-04)"
    - "With no active (non-Done) promos visible to the member, the press makes no Odds API call and shows 'No active promos to refresh' (D-04)"
    - "A confirmed press fetches h2h+spreads+totals ONLY for in-season sports covered by the member's visible, non-Done promos (D-01, D-02), then alternate_spreads only for each promo's best game, sharing the 5-game cap, soonest-first order, skipped count and low-credit alt skip (D-03)"
    - "After a promo refresh, cached events of sports that were NOT refreshed are still returned by getCachedEvents/getCachedExtendedEvents with their ORIGINAL fetched_at; each promo row's 'Prices as of' uses its own event's fetched_at; status-bar ages show the oldest live row (D-06)"
    - "Exactly one credit_usage row is recorded per confirmed press with refreshCost = real API-reported spend and triggeredByUserId = the pressing member (D-07)"
    - "The Arbitrage tab's 'Search spreads & totals' still searches every in-season sport with its own confirm and commits via commitSpreadsTotalsRefresh (unchanged)"
  artifacts:
    - path: "src/domain/promos/promoRefreshScope.ts"
      provides: "promoRefreshSportKeys + estimatePromoAltGames pure helpers (D-01, D-03, D-04)"
      exports: ["promoRefreshSportKeys", "estimatePromoAltGames"]
    - path: "src/ingestion/odds/store.ts"
      provides: "commitPromoSportsRefresh partial-sport merge commit (D-06)"
      contains: "export async function commitPromoSportsRefresh"
    - path: "src/ingestion/odds/refreshExtended.ts"
      provides: "runPromoSportsRefresh guarded runner (lock, gate, confirm, fetch, alt, commit, credit row)"
      exports: ["runPromoSportsRefresh", "runSpreadsTotalsRefresh"]
    - path: "src/app/actions/refresh-promos.ts"
      provides: "refreshPromos server action (requireUser first, viewer-scoped promos, no_promos short-circuit)"
      exports: ["refreshPromos"]
    - path: "src/components/finder/promoRefresh.ts"
      provides: "pure client logic: runPromoRefresh via safeAction, reducePromoRefreshOutcome, describePromoRefreshConfirm"
    - path: "src/components/finder/OddsStatusBar.tsx"
      provides: "'Refresh promos' button replacing 'Spreads & alt lines'"
      contains: "Refresh promos"
  key_links:
    - from: "src/components/finder/OddsStatusBar.tsx"
      to: "src/app/actions/refresh-promos.ts"
      via: "usePromoRefresh -> runPromoRefresh(refreshPromos) through safeAction"
      pattern: "usePromoRefresh"
    - from: "src/app/actions/refresh-promos.ts"
      to: "src/ingestion/odds/refreshExtended.ts"
      via: "runPromoSportsRefresh({ confirmed, triggeredByUserId, sportKeys, altGameEstimate, altSpreads, pickAltSpreadEventIds })"
      pattern: "runPromoSportsRefresh"
    - from: "src/ingestion/odds/refreshExtended.ts"
      to: "src/ingestion/odds/store.ts"
      via: "commitPromoSportsRefresh for scoped runs; commitSpreadsTotalsRefresh for the full Arbitrage search"
      pattern: "commitPromoSportsRefresh"
    - from: "src/app/actions/get-promos.ts"
      to: "src/domain/promos/priceAge.ts"
      via: "buildPriceAgeContext(..., { moneyline: fetchedAtByEventId, extended: fetchedAtByEventId })"
      pattern: "fetchedAtByEventId"
---

<objective>
Replace the status-bar "Spreads & alt lines" button with "Refresh promos": a confirmed, cost-quoted refresh of h2h+spreads+totals for only the sports the member's visible active promos cover, followed by the existing best-game alternate-spreads shortcut — merging into both odds caches without wiping or re-dating other sports' rows. The Arbitrage tab's full "Search spreads & totals" stays exactly as it is.

Purpose: the owner mostly needs fresh prices for promo games; the full search spends ~12-17 credits per press against a 500/month budget.
Output: per-sport cache merge + honest per-row age (D-06), a scoped runner + server action, and the new status-bar button/dialog.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/quick/261001-jbc-refresh-promos-button-spreads-totals-for/261001-jbc-CONTEXT.md
@.planning/quick/261001-e1j-odds-age-and-base-to-boosted-price-on-pr/261001-e1j-SUMMARY.md

<cache_risk_findings>
Read by the planner — this is the reason Task 1 exists:
1. src/db/queries.ts getCachedEvents / getCachedExtendedEvents filter rows to `fetched_at = (select max(fetched_at) ...)` (the "latest-batch" filter). A partial write stamped with a newer timestamp would HIDE every other sport's events. The filter is redundant today: every full commit (commitOddsRefresh, commitSpreadsTotalsRefresh) is one transaction that purges `fetched_at < now` rows, so after any full refresh only that batch exists.
2. src/ingestion/odds/store.ts purgeStatements() deletes `fetched_at < fetchedAt` — the promo commit must NOT use it (it would delete other sports); it may only purge started events (`commence_time <= fetchedAt`).
3. Both readers return `fetchedAt = max(fetched_at)`, which feeds the status-bar age, find-hedges' age, and buildPriceAgeContext. After a partial refresh max would claim every sport is fresh — dishonest (D-06).
4. src/ingestion/odds/status.ts derives every credit estimate from credit_usage.sports_fetched as the "in-season sport count". The promo run must record the full in-season count from listSports (NOT the promo sport count), or the next full refresh's estimate would be understated.
</cache_risk_findings>

<interfaces>
From src/ingestion/odds/store.ts (existing):
- interface ExtendedSportOddsWrite { sportKey: string; extendedEvents: OddsEvent[]; h2hEvents: OddsEvent[] }
- function replaceSportStatements(db, table, sportKey, events, fetchedAt): Statement[]  // delete where sport_key = X, then insert (omitted when events empty)
- function purgeStatements(db, table, fetchedAt): Statement[]  // [delete fetched_at < t, delete commence_time <= t]
- commitSpreadsTotalsRefresh(sports: ExtendedSportOddsWrite[], fetchedAt: Date): Promise<void>  // db.batch([...])
- recordCreditUsage(row: CreditUsageRow); CreditUsageRow { requestsRemaining, requestsUsed, refreshCost, sportsFetched, recordedAt, triggeredByUserId? }

From src/ingestion/odds/refreshExtended.ts (existing):
- EXTENDED_MARKETS = ["h2h","spreads","totals"]
- type ExtendedRefreshOutcome = ok{fetchedAt, sportsFetched, creditsSpent, remaining, altLines: AltLinesOutcome} | confirm_required{estimatedCredits, remaining, minutesSinceLastRefresh} | blocked{reason, remaining, estimatedCredits, resetsOn} | busy{message} | error{message}
- type AltSpreadEventPicker = (fresh: { moneylineEvents; extendedEvents; now }) => string[]
- interface SpreadsTotalsRefreshOptions { confirmed; now?; triggeredByUserId?; altSpreads?: AltSpreadRequests; pickAltSpreadEventIds? }
- runSpreadsTotalsRefresh(opts): lock -> getLatestCreditUsage -> listSports -> inSeason (active ∩ SPORT_KEYS) -> estimateRefreshCredits(n, books, 3) -> evaluateRefreshGate -> always confirm when !confirmed -> buffered per-sport fetch -> alt section (selectAltSpreadTargets cap 5, CREDIT_BLOCK_THRESHOLD skip) -> commitSpreadsTotalsRefresh -> finally recordCreditUsage

From src/ingestion/odds/quota.ts: estimateRefreshCredits(inSeasonSportCount, bookmakerCount, marketCount = 1) = n * ceil(books/10) * markets

From src/domain/promos/altSpreads.ts: ALT_SPREAD_EVENT_LIMIT = 5; buildAltSpreadRequests(promos) -> { pins, scopedEventIds }; NO_ALT_SPREAD_REQUESTS
From src/domain/promos/leagueWideAltTargets.ts: isLeagueWideAltSpreadPromo(promo); pickLeagueWideAltSpreadEventIds(promos, RankOptions)
From src/domain/promos/scope.ts: PromoScope = {kind:"event"; eventId; sportKey} | {kind:"sport_window"; sportKey; windowStart; windowEnd} | {kind:"any"}
From src/domain/promos/rankPromoHedges.ts: RankablePromo { id; bookKey; promoType; scope; pinned: PromoSelection | null (PromoSelection.eventId); eligibleMarketTypes; maxStake; ... }
From src/config/sports.ts: SPORTS (ordered), SPORT_KEYS, getSportLabel(sportKey)
From src/db/promos.ts: getActivePromos(now, viewerUserId) -> ActivePromo[] (viewer-scoped: other members' hand-added promos already excluded)
From src/db/promoTracking.ts: getPromoCompletions(userId) -> { promoId }[]  (Done promos)
From src/db/queries.ts: getUserBookKeys(userId), getHedgeBookKeys(Set), getCachedEvents(), getCachedExtendedEvents() -> { events, fetchedAt }
From src/domain/promos/priceAge.ts: PriceAgeContext { moneylineEventIds; moneylineFetchedAt; extendedFetchedAt }; buildPriceAgeContext(moneylineEvents, mlAt, extAt); pricesAsOfFor(selections, ctx)
From src/components/arb/spreadsTotalsSearch.ts: reduceSearchOutcome (ok branch builds alt-lines notes inline), SearchBanner { kind: "blocked"|"busy"|"error"|"info"; message }
From src/lib/safeAction.ts: safeAction(fn, label) -> { ok: true; value } | { ok: false }; ACTION_FAILED_MESSAGE
Existing UI patterns: src/components/arb/useSpreadsTotalsSearch.ts (hook), src/components/arb/SearchSpreadsTotalsDialog.tsx (AlertDialog confirm, locked while pending), src/components/arb/SpreadsTotalsSearchBanners.tsx (banner renderer, reusable as-is).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Partial-sport cache merge + honest per-row price age (D-06)</name>
  <files>src/ingestion/odds/store.ts, src/ingestion/odds/store.test.ts, src/db/queries.ts, src/db/queries.test.ts, src/domain/promos/priceAge.ts, src/domain/promos/priceAge.test.ts, src/db/feedContext.ts, src/app/actions/get-promos.ts, src/app/actions/get-opportunities.ts</files>
  <behavior>
    - store.test.ts (new; mock "@/db/client" getDb with a recording fake db whose delete(table).where(cond) / insert(table).values(rows) return descriptor objects and batch(stmts) records them; render conditions with PgDialect from "drizzle-orm/pg-core" (sqlToQuery) or inspect the condition's column/operator): commitPromoSportsRefresh([NFL write], t) issues delete-by-sport_key + insert ONLY for americanfootball_nfl in BOTH cached_extended_odds and cached_odds, inserted rows all carry fetchedAt = t, plus a commence_time <= t purge on each table, and NO fetched_at < t purge on either table; all in one db.batch call. An empty write list issues no batch call.
    - store.test.ts: commitSpreadsTotalsRefresh still issues the fetched_at < t purge on both tables (full-search behavior unchanged).
    - queries.test.ts: pure collectCachedEventRows(rows) given rows for two sports with different fetchedAt values returns BOTH sports' events and a fetchedAtByEventId map with each row's own Date (string fetchedAt normalized to Date); a row failing OddsEventSchema is dropped and absent from the map.
    - priceAge.test.ts: with per-event maps, an NFL selection reports the new time and an NHL selection keeps its older time; a pair spanning both reports the older; a selection missing from the map falls back to the global fetchedAt; existing tests (no maps) unchanged.
  </behavior>
  <action>
Per D-06 (planner's chosen merge mechanism; no DB migration, no new columns):

store.ts: add exported commitPromoSportsRefresh(sports: ExtendedSportOddsWrite[], fetchedAt: Date): Promise<void>. It returns immediately when sports is empty. Otherwise it builds, in one db.batch: replaceSportStatements for each sport into cachedExtendedOdds (extendedEvents) and into cachedOdds (h2hEvents), then for each table ONLY the started-event purge (delete where commence_time <= fetchedAt). Factor that single statement out of purgeStatements into a small helper so both use it; purgeStatements keeps both of its statements unchanged for the full commits. Update the module header comment: commitSpreadsTotalsRefresh and commitPromoSportsRefresh are now the two writers of cached_extended_odds (D-16 note), and explain the promo commit leaves other sports' rows and their fetched_at untouched.

queries.ts: (a) remove the latest-batch `fetched_at = (select max(...))` condition from both getCachedEvents and getCachedExtendedEvents (keep `commence_time > now`); select fetchedAt too. Rewrite their doc comments: full commits purge older rows atomically, so the cache holds one batch after a full refresh, and per-sport promo refreshes deliberately leave other sports' rows with their own fetched_at. (b) Add exported pure collectCachedEventRows(rows: { eventId: string; rawResponse: unknown; fetchedAt: Date | string }[], label: string) returning { events: OddsEvent[]; fetchedAtByEventId: Map<string, Date> } — parses with OddsEventSchema.safeParse, drops + console.warns invalid rows exactly as today. Both readers use it. (c) Return type becomes { events; fetchedAt: Date | null; fetchedAtByEventId?: ReadonlyMap<string, Date> } — the map is OPTIONAL in the type so the many existing test mocks returning { events, fetchedAt } keep compiling. (d) Replace getMaxFetchedAt / getMaxExtendedFetchedAt with an "age" aggregate per table: coalesce(min(fetched_at) filter (where commence_time > now), max(fetched_at)) via the sql template with the current Date as a parameter — i.e. the OLDEST live row, falling back to max so the value is null only when the table is empty (preserves every caller's "no odds" null check). getOddsFreshness / getExtendedOddsFreshness use it, so the status-bar age lines and find-hedges' oddsFetchedAt report the oldest live prices (honest after a partial refresh; identical to today after a full refresh). Normalize string results to Date as today.

priceAge.ts: add optional moneylineFetchedAtByEvent / extendedFetchedAtByEvent (ReadonlyMap<string, Date>) to PriceAgeContext; buildPriceAgeContext gains an optional 4th parameter perEvent?: { moneyline?: ReadonlyMap<string, Date>; extended?: ReadonlyMap<string, Date> }. pricesAsOfFor resolves each selection's time as the per-event map entry for its source cache, falling back to the cache-wide time; the oldest-wins and null rules are unchanged. No money math touched.

Wiring: feedContext.ts destructures fetchedAtByEventId from both reads and returns them as oddsFetchedAtByEventId / extendedOddsFetchedAtByEventId; get-opportunities.ts passes them as the 4th buildPriceAgeContext argument; get-promos.ts does the same from its own getCachedEvents / getCachedExtendedEvents destructure (the call at ~line 164, not the empty-feed branch).
  </action>
  <verify>
    <automated>npx vitest run src/ingestion/odds/store.test.ts src/db/queries.test.ts src/domain/promos/priceAge.test.ts src/app/actions/get-promos.test.ts src/app/actions/get-opportunities.test.ts src/app/actions/find-hedges.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>commitPromoSportsRefresh exists and is tested to never purge by fetched_at; both readers return every live sport's events with a per-event fetched-at map and an oldest-live-row fetchedAt; promo/pair rows' "Prices as of" use per-event times; existing tests pass; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Promo-sport scope helpers, scoped runner, and refreshPromos server action (D-01..D-04, D-07)</name>
  <files>src/domain/promos/promoRefreshScope.ts, src/domain/promos/promoRefreshScope.test.ts, src/ingestion/odds/refreshExtended.ts, src/ingestion/odds/refreshExtended.test.ts, src/app/actions/refresh-promos.ts, src/app/actions/refresh-promos.test.ts</files>
  <behavior>
    - promoRefreshScope.test.ts promoRefreshSportKeys: event-scope promo -> its scope.sportKey; sport_window -> its sportKey; any-scope unpinned -> every SPORT_KEYS sport; any-scope pinned whose pinned event is known via sportOfEvent -> only that sport (unknown -> every sport); promo with no eligible market types contributes nothing; duplicates collapse; result is in SPORTS config order; unknown (non-configured) sport keys are dropped; empty input -> [].
    - promoRefreshScope.test.ts estimatePromoAltGames: counts distinct alt event ids from buildAltSpreadRequests (pins + scoped) plus one per isLeagueWideAltSpreadPromo promo, capped at ALT_SPREAD_EVENT_LIMIT (7 candidates -> 5); profit_boost with null maxStake excluded (D-18 inherited); no promos -> 0.
    - refreshExtended.test.ts runPromoSportsRefresh: unconfirmed -> confirm_required with sportKeys = requested ∩ in-season and estimatedCredits = estimateRefreshCredits(scoped, books, 3) + altGameEstimate * ceil(books/10), and fetchSportOdds / recordCreditUsage / commits NOT called; requested sports none in season -> { status: "no_promos" } with no fetch and no credit row; confirmed with in-season [nfl, nba, nhl] and requested [nfl] -> fetchSportOdds called once (nfl, markets h2h,spreads,totals), commitPromoSportsRefresh called with only nfl, commitSpreadsTotalsRefresh NOT called; alt picker receives only fresh nfl events and alt fetches respect the 5 cap; recordCreditUsage called once with refreshCost = sum of quota.last across main + alt calls, sportsFetched = 3 (full in-season count, not 1), triggeredByUserId passed through; low-credit gate returns blocked; lock busy returns busy.
    - refreshExtended.test.ts existing runSpreadsTotalsRefresh tests pass UNMODIFIED (full Arbitrage search unchanged).
    - refresh-promos.test.ts (mock session, runner, @/db/promos, @/db/queries, @/db/promoTracking like refresh-spreads-totals.hook.test.ts): requireUser runs first; getActivePromos called with (Date, user.userId); all promos Done or none active -> { status: "no_promos", message: "No active promos to refresh." } and runner NOT called; otherwise runner receives confirmed flag, triggeredByUserId, sportKeys from feed (non-Done) promos only, altGameEstimate, altSpreads built from feed promos, and on confirmed calls a picker; invalid input -> error; revalidatePath("/") only on ok.
  </behavior>
  <action>
promoRefreshScope.ts (new, pure, domain-only — no db/ingestion imports): export promoRefreshSportKeys(promos: readonly RankablePromo[], opts?: { sportOfEvent?: (eventId: string) => string | undefined }): string[] implementing D-01 per the behavior list (any-scope = all configured sports because an unrestricted bonus bet can convert on any game; a pinned promo resolves to its pinned event's sport when known). Export estimatePromoAltGames(promos): number for the D-04 quote (an upper bound — pins whose main line already covers them are skipped at fetch time). Import ALT_SPREAD_EVENT_LIMIT / buildAltSpreadRequests from altSpreads.ts and isLeagueWideAltSpreadPromo from leagueWideAltTargets.ts.

refreshExtended.ts: extract the body of runGuardedSpreadsTotalsRefresh into an internal function parameterized by an optional scope { sportKeys: readonly string[]; altGameEstimate: number }. With no scope, behavior, messages, return type and commit (commitSpreadsTotalsRefresh) are byte-for-byte what they are today. With a scope: targets = inSeason filtered to scope.sportKeys (in-season order); if targets is empty return { status: "no_promos", message: "No active promos to refresh." } before any credit spend or credit row; mainEstimate = estimateRefreshCredits(targets.length, books, EXTENDED_MARKETS.length) drives evaluateRefreshGate (alt stays skippable, as today); the quoted estimate = mainEstimate + altGameEstimate * ceil(books/10); unconfirmed -> confirm_required including sportKeys (targets) (D-04, always confirm like the full search); fetch loop over targets only with EXTENDED_MARKETS in one call per sport (D-02, Claude's discretion: one call carries h2h+spreads+totals); the alt section is reused unchanged (D-03: picker over the fresh events, selectAltSpreadTargets cap/order/skipped count, CREDIT_BLOCK_THRESHOLD alt-only skip, exact-opposite/half-point rules untouched); commit via commitPromoSportsRefresh (D-06); the finally block records ONE credit_usage row with the real refreshCost and triggeredByUserId (D-07) and sportsFetched = inSeason.length (see cache_risk_findings #4 — comment why). Export runPromoSportsRefresh(opts: SpreadsTotalsRefreshOptions & { sportKeys: readonly string[]; altGameEstimate: number }): Promise<PromoRefreshOutcome>, taking/releasing the same refresh_lock as runSpreadsTotalsRefresh. Define and export PromoRefreshOutcome = ExtendedRefreshOutcome's ok/blocked/busy/error variants + confirm_required with an added sportKeys: string[] + { status: "no_promos"; message: string }. Do NOT widen ExtendedRefreshOutcome (the Arbitrage reducer's exhaustive banner kinds must not change). Use a promo-specific generic failure message ("Couldn't refresh promo odds: the Odds API didn't respond."). Update the header comment for the new caller.

refresh-promos.ts (new "use server" action, structural copy of refresh-spreads-totals.ts which stays untouched): export refreshPromos(input: unknown): Promise<PromoRefreshOutcome>. requireUser() first; zod { confirmed: boolean }. Load (server-side only, never client input) getActivePromos(now, user.userId), getPromoCompletions, getUserBookKeys; feedPromos = active minus Done (same set the Promos tab ranks). If feedPromos is empty return no_promos without calling the runner (D-04). Build a sportOfEvent lookup from getCachedEvents + getCachedExtendedEvents events (cheap DB read, 0 credits) for pinned any-scope promos; sportKeys = promoRefreshSportKeys(feedPromos, { sportOfEvent }); altGameEstimate = estimatePromoAltGames(feedPromos). On confirmed calls also pass altSpreads = buildAltSpreadRequests(feedPromos) and a pickAltSpreadEventIds closure over pickLeagueWideAltSpreadEventIds(feedPromos, ...) with hedgeBookKeys = getHedgeBookKeys(member's books) and precision "cents", exactly as refresh-spreads-totals.ts does. Promo-load failures return { status: "error", message } with no runner call (nothing is known to refresh). revalidatePath("/") on ok. No DB writes besides what the runner does; no money math.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/promoRefreshScope.test.ts src/ingestion/odds/refreshExtended.test.ts src/app/actions/refresh-promos.test.ts src/app/actions/refresh-spreads-totals.test.ts src/app/actions/refresh-spreads-totals.hook.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>runPromoSportsRefresh fetches only promo sports after confirm, commits via commitPromoSportsRefresh, records one honest credit row; refreshPromos short-circuits with no_promos; the full Arbitrage search's existing tests pass unmodified; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: "Refresh promos" status-bar button, confirm dialog, banners (D-04, D-05)</name>
  <files>src/components/finder/promoRefresh.ts, src/components/finder/promoRefresh.test.ts, src/components/finder/usePromoRefresh.ts, src/components/finder/PromoRefreshDialog.tsx, src/components/finder/OddsStatusBar.tsx, src/components/arb/spreadsTotalsSearch.ts</files>
  <behavior>
    - promoRefresh.test.ts runPromoRefresh(action, "start") calls the action with { confirmed: false }; "confirm" with { confirmed: true }; a throwing/failed action becomes { status: "error", message: ACTION_FAILED_MESSAGE } (via safeAction).
    - reducePromoRefreshOutcome: confirm_required -> confirm state { sportKeys, estimatedCredits, remaining } and no fetch side effects (refreshPage/recompute false); ok -> refreshPage + recompute true, info banner "Updated odds for NFL, NCAAF (N credits). Other sports keep their earlier prices." plus the same alt-lines notes the Arbitrage search shows; no_promos -> info banner "No active promos to refresh.", no refresh/recompute; blocked -> blocked banner mentioning the remaining credits; busy/error -> banner with the message and refreshPage true, recompute false.
    - describePromoRefreshConfirm(sportKeys, estimatedCredits, remaining) -> "Refresh promos for NFL, NCAAF — about N credits (X left)." using getSportLabel; remaining null -> "...about N credits. Your credit balance appears after the first refresh."
    - isPromoRefreshDisabled(status, pending) true when level blocked or pending.
    - spreadsTotalsSearch.test.ts passes unmodified after extracting the alt notes helper.
  </behavior>
  <action>
spreadsTotalsSearch.ts: extract the ok-branch alt-lines note building into an exported pure describeAltLinesNotes(alt: AltLinesOutcome): string[]; reduceSearchOutcome calls it and produces identical output (Arbitrage unchanged).

promoRefresh.ts (new, pure, no "use server" import — the action is passed in, mirroring spreadsTotalsSearch.ts so it is testable without DB/Odds API): export PromoRefreshAction type, PromoRefreshConfirmState, runPromoRefresh (through safeAction, label "refreshPromos"), reducePromoRefreshOutcome (reusing SearchBanner kinds and describeAltLinesNotes), describePromoRefreshConfirm, isPromoRefreshDisabled per the behavior list (D-04 wording; Claude's discretion on exact copy beyond the quoted strings).

usePromoRefresh.ts (new "use client" hook, structural copy of useSpreadsTotalsSearch): state confirmState/banner/pending; startRefresh makes only the unconfirmed call; handleOutcome applies the reduction (router.refresh() when refreshPage, onRefreshed() when recompute so Promos/Opportunities/Arbitrage refetch in place per D-05).

PromoRefreshDialog.tsx (new, structural copy of SearchSpreadsTotalsDialog): title "Refresh odds for your promos?", description = describePromoRefreshConfirm(...) plus "Updates moneyline, spreads and totals for those sports, then alternate spreads for each promo's best game (up to 5)."; "Refresh promos" action makes the single confirmed call via runPromoRefresh(refreshPromos, "confirm"); Cancel and close are locked while pending (same WR-04 rule).

OddsStatusBar.tsx: replace the second button and the useSpreadsTotalsSearch / SearchSpreadsTotalsDialog / isSearchDisabled usage with usePromoRefresh + PromoRefreshDialog; button label exactly "Refresh promos" (pending label "Refreshing promos…"), keeping the existing variant="outline" size="sm" className="w-full" in the same stacked column under "Refresh odds"; each button is disabled while the other is pending; disabled via isPromoRefreshDisabled. Render the promo banner with the existing SpreadsTotalsSearchBanners component (onRetry = startRefresh). Leave ArbForm.tsx, useSpreadsTotalsSearch.ts, SearchSpreadsTotalsDialog.tsx untouched (Arbitrage keeps its full search).
  </action>
  <verify>
    <automated>npx vitest run src/components/finder/promoRefresh.test.ts src/components/arb/spreadsTotalsSearch.test.ts && npx vitest run && npx tsc --noEmit && npm run lint && npx next build && grep -c "Refresh promos" src/components/finder/OddsStatusBar.tsx && test "$(grep -c 'Spreads & alt lines' src/components/finder/OddsStatusBar.tsx)" = "0" && grep -c "useSpreadsTotalsSearch" src/components/arb/ArbForm.tsx</automated>
  </verify>
  <done>Status bar shows "Refresh promos" (no "Spreads & alt lines"); press -> confirm dialog with sports + credits + balance -> confirmed refresh -> pages recompute in place; no-promo press shows the friendly banner; full vitest, tsc, lint and next build all pass; ArbForm still uses the full search hook.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> refreshPromos server action | untrusted input; only `{ confirmed: boolean }` accepted |
| server -> The Odds API | spends shared, budget-limited credits |
| server -> Neon (cached_odds, cached_extended_odds, credit_usage) | shared cache read by every member |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jbc-01 | Elevation | refresh-promos.ts | mitigate | requireUser() is the first statement; logged-out calls never reach the lock, gate or API |
| T-jbc-02 | Tampering | refresh-promos.ts input | mitigate | zod schema accepts only `confirmed`; sport keys, promos and alt targets are derived server-side from the viewer's own promos, never client input |
| T-jbc-03 | Denial of service (credit drain) | runPromoSportsRefresh | mitigate | shared refresh_lock, evaluateRefreshGate low/insufficient-credit block, mandatory confirm on every press, alt-only CREDIT_BLOCK_THRESHOLD skip, 5-game alt cap |
| T-jbc-04 | Repudiation | credit_usage | mitigate | one row per press with triggeredByUserId from the session and real refreshCost (D-07) |
| T-jbc-05 | Tampering (data integrity) | commitPromoSportsRefresh | mitigate | single db.batch transaction; per-sport delete+insert only for refreshed sports; no fetched_at purge; tests assert other sports' rows untouched (D-06) |
| T-jbc-06 | Information disclosure | runner error messages | mitigate | fixed safe messages only (never raw errors), same as refreshExtended.ts safeMessage |
| T-jbc-07 | Information disclosure | other members' hand-added promos | mitigate | getActivePromos(now, userId) viewer-scoped visibility; action test asserts the userId is passed |
</threat_model>

<verification>
- npx vitest run (targeted per task, then full suite) — no live DB writes, no Odds API calls (all mocked)
- npx tsc --noEmit — 0 errors
- npm run lint — clean
- npx next build — succeeds
- No migration files added under drizzle/ (git status shows none)
</verification>

<success_criteria>
- D-01: sports derived from the viewer's non-Done active promos (event, sport-window, any, pinned) — tested
- D-02: one h2h+spreads+totals call per promo sport — tested
- D-03: alt spreads only for each promo's best game, 5-cap, soonest-first, credit skip — tested via shared alt section
- D-04: confirm dialog with sports + estimate + balance; no promos -> no fetch + friendly message — tested
- D-05: button "Refresh promos" replaces "Spreads & alt lines"; in-place recompute on success
- D-06: other sports' cached events and fetched_at survive; per-row "Prices as of" honest; status-bar age = oldest live row — tested
- D-07: one credit_usage row with real cost and member attribution — tested
- Arbitrage full search unchanged — existing tests pass unmodified
</success_criteria>

<output>
Create `.planning/quick/261001-jbc-refresh-promos-button-spreads-totals-for/261001-jbc-SUMMARY.md` when done
</output>
