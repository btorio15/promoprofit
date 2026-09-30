---
phase: quick-260930-gam
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/promos/altSpreads.ts
  - src/domain/promos/altSpreads.test.ts
  - src/domain/promos/selection.ts
  - src/domain/promos/selection.test.ts
  - src/domain/promos/rankPromoHedges.test.ts
  - src/ingestion/odds/client.ts
  - src/ingestion/odds/client.test.ts
  - src/ingestion/odds/refreshExtended.ts
  - src/ingestion/odds/refreshExtended.test.ts
  - src/app/actions/refresh-spreads-totals.ts
  - src/components/arb/ArbForm.tsx
  - src/components/arb/SearchSpreadsTotalsDialog.tsx
autonomous: true
requirements: [QUICK-260930-gam]

must_haves:
  truths:
    - "A promo pinned to a spread line that is not the main line (e.g. home -6.5 while books show -7) resolves with quotes read from the cached alternate_spreads market instead of dropping out of the ranking"
    - "The hedge for a pinned Team A -6.5 uses ONLY Team B +6.5 at hedge books -- never +7, +6 or any other nearby line"
    - "Alt-line fetches happen ONLY on the confirmed Search spreads & totals press, for at most 5 events (soonest commence first), each an event with an active pinned spread promo visible to the pressing member"
    - "Alt-line credits are added to the same credit-meter row attributed to the pressing member (triggeredByUserId)"
    - "If the remaining balance would drop below the credit block threshold, alt lines are skipped and the main spreads/totals refresh still lands; an alt fetch failure never fails the main refresh"
    - "When games are skipped (over the 5 limit or for credits) the Arbitrage tab shows an info message saying how many; the confirm dialog mentions up to 5 extra credits"
    - "Unpinned promos, the Arbitrage tab and the Bonus-bet finder behave exactly as before (they never read alternate_spreads)"
  artifacts:
    - path: "src/domain/promos/altSpreads.ts"
      provides: "Pure helpers selectAltSpreadTargets (dedupe, main-line coverage check, commence-asc sort, cap 5, skipped count) and mergeAltSpreads (immutable merge of alternate_spreads market into a buffered event)"
      exports: ["selectAltSpreadTargets", "mergeAltSpreads", "ALT_SPREAD_EVENT_LIMIT", "ALT_SPREADS_MARKET", "AltSpreadPin"]
    - path: "src/ingestion/odds/client.ts"
      provides: "fetchEventOdds per-event endpoint client"
      exports: ["fetchEventOdds"]
    - path: "src/domain/promos/selection.ts"
      provides: "resolveSpread falls back to alternate_spreads with exact-point matching per bookmaker"
      contains: "alternate_spreads"
  key_links:
    - from: "src/app/actions/refresh-spreads-totals.ts"
      to: "getActivePromos(now, user.userId)"
      via: "maps pinned spread promos to altSpreadPins passed to runSpreadsTotalsRefresh"
      pattern: "altSpreadPins"
    - from: "src/ingestion/odds/refreshExtended.ts"
      to: "fetchEventOdds + mergeAltSpreads"
      via: "after the sport loop, before commitSpreadsTotalsRefresh"
      pattern: "fetchEventOdds\\("
    - from: "src/domain/promos/selection.ts resolveSpread"
      to: "cached_extended_odds.raw_response alternate_spreads market"
      via: "markets.find(m => m.key === ALT_SPREADS_MARKET)"
      pattern: "alternate_spreads|ALT_SPREADS_MARKET"
---

<objective>
Let promos pinned to a non-main spread line (e.g. "Steelers -6.5" when books' main spread is -7) get an exact hedge. On the confirmed "Search spreads & totals" press, fetch The Odds API `alternate_spreads` for up to 5 pinned-promo games via the per-event endpoint, merge that market into the event stored in the existing `cached_extended_odds.raw_response` (no migration), and teach the pinned spread resolver to read the exact pinned line and its exact opposite line from it.

Purpose: Pinned spread promos on alternate lines currently vanish from the ranked feed because `resolveSpread` only reads the main `spreads` market.
Output: New pure helper module, per-event client function, orchestration + action wiring, resolver fallback, small UI copy changes, all unit-tested with the Odds API and DB mocked.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/quick/260930-gam-add-alternate-spread-lines-for-pinned-pr/260930-gam-CONTEXT.md
@.planning/quick/260930-gam-add-alternate-spread-lines-for-pinned-pr/260930-gam-RESEARCH.md
@src/domain/promos/selection.ts
@src/ingestion/odds/refreshExtended.ts
@src/ingestion/odds/client.ts
@src/app/actions/refresh-spreads-totals.ts

<interfaces>
From src/domain/promos/types.ts:
  export interface PromoSelection { eventId: string; marketType: PromoMarketType; line: number | null; side: PromoSide; }
  (spread `line` is the PROMO TEAM's own point; home main point = side==="home" ? line : -line; opposite outcome = other team at -line)

From src/db/promos.ts:
  export interface ActivePromo extends RankablePromo { ... pinned: PromoSelection | null ... }
  export async function getActivePromos(now: Date, viewerUserId?: number): Promise<ActivePromo[]>  // applies status/scope/expiry/personal visibility

From src/domain/odds/schemas.ts:
  OddsEventSchema (looseObject: id, sport_key, commence_time, home_team, away_team, bookmakers[{key, markets[{key, last_update?, outcomes[{name, price, point?}]}]}]); type OddsEvent

From src/ingestion/odds/client.ts:
  export interface QuotaHeaders { remaining; used; last: number | null }
  export class OddsApiError extends Error (message must never contain URL/apiKey)
  export function parseQuotaHeaders(headers: Headers): QuotaHeaders
  export async function fetchSportOdds(sportKey, { bookmakerKeys, commenceTimeFrom, commenceTimeTo, markets? }): Promise<{ events: OddsEvent[]; quota: QuotaHeaders }>

From src/ingestion/odds/refreshExtended.ts:
  export const EXTENDED_MARKETS = ["h2h","spreads","totals"] as const;
  export type ExtendedRefreshOutcome = { status:"ok"; fetchedAt; sportsFetched; creditsSpent; remaining } | confirm_required | blocked | busy | error
  export async function runSpreadsTotalsRefresh(opts: { confirmed: boolean; now?: Date; triggeredByUserId?: number | null })
  Internals: pendingWrites: ExtendedSportOddsWrite[] = { sportKey, extendedEvents, h2hEvents }; refreshCost/lastRemaining/lastUsed/quotaCaptured; commitSpreadsTotalsRefresh(pendingWrites, now); recordCreditUsage in finally with sportsFetched: inSeason.length
  CREDIT_BLOCK_THRESHOLD (quota.ts) = 20; isHalfPoint in src/domain/.../spreadsTotalsFilter.ts:21

From src/components/arb/ArbForm.tsx:
  type SearchBanner = { kind: "blocked" | "busy" | "error"; message: string };  handleSearchOutcome clears banner on ok
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure alt-spread helpers + exact-line fallback in resolveSpread</name>
  <files>src/domain/promos/altSpreads.ts, src/domain/promos/altSpreads.test.ts, src/domain/promos/selection.ts, src/domain/promos/selection.test.ts, src/domain/promos/rankPromoHedges.test.ts</files>
  <behavior>
    - selectAltSpreadTargets: only pins with a half-point line become candidates; pins whose eventId is not among the given fetched extended events (or whose commence_time is not after now) are excluded; multiple pins on one event dedupe to one target; an event is skipped when EVERY bookmaker's main spreads market already quotes every pinned line for that event (home point = side==="home" ? line : -line); remaining candidates sorted by commence_time asc (tie-break eventId), first 5 returned as {sportKey, eventId, commenceTime}, skippedOverLimit = candidates - 5 (0 when fewer)
    - mergeAltSpreads(event, altEvent, allowedBookKeys): returns a NEW event; for each alt bookmaker in allowedBookKeys with an alternate_spreads market, find-or-create the bookmaker entry by key and set its alternate_spreads market (replacing any existing one); input objects are not mutated; existing h2h/spreads/totals markets untouched
    - resolveSpread: home pinned -6.5 with main spreads at -7 -> promoSideQuotes from alt outcome {home, -6.5}, oppositeSideQuotes ONLY from {away, +6.5} (alt fixture also contains away +7 and +6, which must be ignored)
    - resolveSpread: away-pinned +3.5 -> promo quote {away, +3.5}, opposite {home, -3.5}
    - resolveSpread: a book with a matching main-line quote uses the main quote and its alt market is not read for that selection (one quote per book per side)
    - resolveSpread: a bookmaker with only an alternate_spreads market (no main spreads) still contributes quotes
    - enumeration for unpinned promos is unchanged (alt points never enter collectSpreadHomePoints)
    - rankPromoHedges end-to-end: pinned alt-line profit-boost promo ranks with hedge at the exact opposite alt line; guaranteed profit asserted to the cent against a hand-computed value
  </behavior>
  <action>
Create src/domain/promos/altSpreads.ts (domain only -- must not import from src/db or src/ingestion, per the D-16 module boundary noted in research pitfall 10). Export ALT_SPREADS_MARKET = "alternate_spreads", ALT_SPREAD_EVENT_LIMIT = 5 (per CONTEXT credit-cap decision), type AltSpreadPin = { eventId: string; line: number; side: "home" | "away" }, selectAltSpreadTargets(pins, extendedEvents, now) returning { targets: { sportKey; eventId; commenceTime: string }[]; skippedOverLimit: number }, and mergeAltSpreads(event, altEvent, allowedBookKeys) per the behavior list. Reuse the existing isHalfPoint helper (import from where selection.ts imports it). Point comparison helper samePoint(a, b) = both finite numbers and Math.round(a*2) === Math.round(b*2) (research pitfall 2); export it for selection.ts.

In selection.ts resolveSpread: keep the existing main-line loop byte-for-byte in behavior, but record which bookmaker keys produced a main quote. Then loop bookmakers again: skip those already quoted; read markets.find(m => m.key === ALT_SPREADS_MARKET); if present, find promoOutcome = outcome with name === promoTeam and samePoint(point, sel.line), and oppositeOutcome = outcome with name === oppositeTeam and samePoint(point, -sel.line); push each independently if found. Do NOT apply the outcomes.length === 2 guard to the alt market. Exact opposite line only per the CONTEXT hedge-matching decision -- no nearest-line or middle logic anywhere. Do not touch resolveTotal, enumeration, or spreadsTotalsFilter.ts (alternate totals are out of scope; arb/finder must stay unchanged). No new money math: ranking already uses decimal.js via americanToDecimal and the calculators.

Write the tests first (RED), then implement (GREEN). Build fixtures as plain OddsEvent objects; no DB, no network.
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx vitest run src/domain/promos/altSpreads.test.ts src/domain/promos/selection.test.ts src/domain/promos/rankPromoHedges.test.ts</automated>
  </verify>
  <done>All listed behaviors have passing tests; existing selection/ranking tests still pass; altSpreads.ts has no imports from src/db or src/ingestion.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: fetchEventOdds client, capped alt fetch in the spreads/totals refresh, action wiring</name>
  <files>src/ingestion/odds/client.ts, src/ingestion/odds/client.test.ts, src/ingestion/odds/refreshExtended.ts, src/ingestion/odds/refreshExtended.test.ts, src/app/actions/refresh-spreads-totals.ts</files>
  <behavior>
    - fetchEventOdds builds GET {BASE_URL}/sports/{sportKey}/events/{encodeURIComponent(eventId)}/odds with apiKey, bookmakers (comma list), markets=alternate_spreads, oddsFormat=american, dateFormat=iso; no commenceTime params; parses quota headers before checking res.ok; 404 -> { event: null, quota }; other non-ok -> OddsApiError whose message contains neither the URL nor the api key; body validated with OddsEventSchema.safeParse (single object) and a bad shape throws OddsApiError
    - refresh with no altSpreadPins (or none qualifying): fetchEventOdds never called; outcome identical to today plus altLines { fetched: 0, skippedOverLimit: 0, skippedForCredits: false, failed: 0 }
    - refresh with 7 qualifying pinned events: fetchEventOdds called exactly 5 times for the 5 soonest; ok outcome altLines.skippedOverLimit === 2; the events passed to commitSpreadsTotalsRefresh contain the merged alternate_spreads markets
    - alt quota.last values are added to creditsSpent and to the single recordCreditUsage call, which carries triggeredByUserId; sportsFetched in the credit row stays inSeason.length
    - freshest known balance minus (targets x ceil(books/10)) below CREDIT_BLOCK_THRESHOLD -> no alt fetch, altLines.skippedForCredits true, main commit still happens, status ok
    - one fetchEventOdds rejects -> altLines.failed === 1, other targets still merged, status ok, commit still happens
    - unconfirmed press never calls fetchEventOdds (confirm gate unchanged)
  </behavior>
  <action>
client.ts: add fetchEventOdds(sportKey, eventId, { bookmakerKeys, markets }) returning Promise<{ event: OddsEvent | null; quota: QuotaHeaders }>, mirroring fetchSportOdds' structure and error-message discipline (messages like "Odds API returned an error for /sports/{sportKey}/events/odds" -- no URL, no key, T-01-13). Doc comment: cost = unique markets returned x ceil(bookmakers/10), empty response costs 0, so 1 credit per event with the 7 free-tier books.

refreshExtended.ts: extend runSpreadsTotalsRefresh / runGuardedSpreadsTotalsRefresh opts with altSpreadPins?: AltSpreadPin[]. Extend the ok outcome with altLines: { fetched: number; skippedOverLimit: number; skippedForCredits: boolean; failed: number }. Leave the lock, the gate estimate (main markets only -- alt never blocks main, per CONTEXT), the confirm requirement and the error paths unchanged. Inside the existing try, after the sport loop and before commitSpreadsTotalsRefresh: collect all buffered extendedEvents; call selectAltSpreadTargets(pins, events, now); compute altCost = targets.length * Math.ceil(bookKeys.length / 10); balance = lastRemaining ?? priorRemaining; if balance !== null and balance - altCost < CREDIT_BLOCK_THRESHOLD, skip all alt fetches and set skippedForCredits (per CONTEXT: skip the alt fetch, not the main refresh). Otherwise fetch targets sequentially, each in its own try/catch (failure increments failed, never sets refreshError); on each response set quotaCaptured, add quota.last to refreshCost, update lastRemaining/lastUsed; when event is non-null, replace the matching event in its pendingWrites entry's extendedEvents with mergeAltSpreads(event, altEvent, bookKeys). Leave h2hEvents untouched (cached_odds never holds alt markets). Keep recordCreditUsage in the finally with sportsFetched: inSeason.length.

refresh-spreads-totals.ts: after requireUser() and input parsing, only when parsed.data.confirmed is true, load getActivePromos(new Date(), user.userId) (visibility enforced server-side; never accept pins from client input -- ASVS V4), map promos with pinned?.marketType === "spread", pinned.line !== null and side home/away to AltSpreadPin, and pass as altSpreadPins. If loading promos throws, pass an empty list (main refresh must still run).

Tests: add fetchEventOdds: vi.fn() to the client mock in refreshExtended.test.ts (existing pattern at lines 4-16); stub global fetch in client.test.ts as the existing tests do. No test may hit the live Odds API or the live DB.
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx vitest run src/ingestion/odds/client.test.ts src/ingestion/odds/refreshExtended.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>All listed behaviors have passing tests; existing refresh tests still pass; tsc clean; refresh.ts still does not import refreshExtended.ts.</done>
</task>

<task type="auto">
  <name>Task 3: Surface skipped alt-line games and the extra-credit note in the Arbitrage UI</name>
  <files>src/components/arb/ArbForm.tsx, src/components/arb/SearchSpreadsTotalsDialog.tsx</files>
  <action>
ArbForm.tsx: widen SearchBanner kind to include "info". In handleSearchOutcome's ok branch, keep all existing behavior (clear confirm, router.refresh, onSearched) but set an info banner instead of null when outcome.altLines.skippedOverLimit > 0 or skippedForCredits: plain-English copy, e.g. "Alternate lines fetched for 5 pinned games; 2 more skipped (limit is 5 per search)." and/or "Alternate lines for pinned games were skipped to save credits -- balance is low." (Claude's discretion on wording per CONTEXT; keep it everyday language, no jargon). Render info with a neutral (non-error) style using the same banner element/pattern already used for the other kinds. Otherwise ok still clears the banner.

SearchSpreadsTotalsDialog.tsx: append to the description sentence " Games with a pinned spread promo on an alternate line use up to 5 more credits." (research corrected cost: 1 credit per game, max 5).
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx tsc --noEmit && npx vitest run src/components 2>&1 | tail -5 && grep -c "up to 5 more credits" src/components/arb/SearchSpreadsTotalsDialog.tsx</automated>
  </verify>
  <done>tsc clean; any existing component tests pass; dialog copy contains the up-to-5-credits note; ArbForm shows an info banner only when alt games were skipped.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> refreshSpreadsTotals action | Untrusted input; only `{confirmed}` accepted |
| server -> The Odds API per-event endpoint | Untrusted response body; request URL carries the secret key |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gam-01 | Elevation/Info disclosure | refresh-spreads-totals.ts pin list | mitigate | Pins derived only from getActivePromos(now, user.userId) after requireUser(); never from client input, so other members' personal promos are never targeted |
| T-gam-02 | Tampering | fetchEventOdds response | mitigate | OddsEventSchema.safeParse on the single-object body; eventId encodeURIComponent'd in the path |
| T-gam-03 | Info disclosure | fetchEventOdds errors | mitigate | Error messages never include URL or apiKey (same discipline as fetchSportOdds); action returns safeMessage only |
| T-gam-04 | Denial of service (credit exhaustion) | alt fetch loop | mitigate | Hard cap ALT_SPREAD_EVENT_LIMIT=5, only on confirmed press inside the refresh lock, skipped when balance would cross CREDIT_BLOCK_THRESHOLD, spend recorded to the credit meter |
| T-gam-05 | Tampering (wrong money) | resolveSpread alt fallback | mitigate | Exact samePoint match on promo line and its negation only; tests assert nearby lines are ignored and profit exact to the cent |
</threat_model>

<verification>
- npx vitest run (full suite) passes
- npx tsc --noEmit clean
- grep confirms fetchEventOdds is called only from refreshExtended.ts (not refresh.ts, not the morning scrape job, not page loads)
- No migration generated; src/db/schema.ts unchanged
</verification>

<success_criteria>
- A pinned alternate-line spread promo appears in the ranked feed after a Search spreads & totals press, hedged at the exact opposite line, profit exact to the cent
- At most 5 per-event alt fetches per press, attributed to the pressing member in the credit meter
- Skipped games are reported in the Arbitrage tab; main refresh is never blocked or failed by alt fetching
</success_criteria>

<output>
Create `.planning/quick/260930-gam-add-alternate-spread-lines-for-pinned-pr/260930-gam-SUMMARY.md` when done. Note in the summary: alt lines persist only for events fetched on the most recent press (a later press by another member replaces them), and assumption A2 (alt outcome names match event team names) should be confirmed on the first live press.
</output>
