# Quick Task 260930-gam: Alternate spread lines for pinned promo games - Research

**Researched:** 2026-09-30
**Domain:** The Odds API per-event `alternate_spreads` + existing spreads/totals refresh pipeline
**Confidence:** HIGH (codebase fully mapped; API cost/shape from official v4 guide)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **When to fetch:** ONLY on the user-triggered spreads/totals Refresh button path (`src/app/actions/refresh-spreads-totals.ts` and what it calls). Not morning scrape, not page view, not scheduled. Must go through the existing refresh lock, credit gate and credit meter (triggeredByUserId attribution).
- **Credit cap:** At most 5 events per refresh press. Only events with at least one active pinned spread promo visible to the refreshing member; dedupe per event. When >5 qualify, fetch the 5 with the soonest commence time and report how many were skipped in the refresh outcome. If the remaining-credit gate would be crossed, skip the alt-line fetch rather than the main refresh.
- **Hedge line matching:** Exact opposite line only (Team A -6.5 hedges only with Team B +6.5 at hedge books). No nearby/middle lines, no approximation.
- **Scope:** Spreads only. Alternate totals OUT of scope.

### Claude's Discretion
- Cache table/shape (extend existing extended-odds cache vs new table). A new table would be an additive migration requiring owner's explicit OK before applying to live Neon (generate OK, apply = human checkpoint).
- How ranking merges alt-line outcomes with main-line spreads.
- UI wording for "N games' alt lines skipped (limit 5)".

### Deferred Ideas (OUT OF SCOPE)
- Alternate totals.
</user_constraints>

## Summary

The per-event endpoint `GET /v4/sports/{sport}/events/{eventId}/odds?markets=alternate_spreads` returns a **single event object** (not an array) with the same `bookmakers[].markets[].outcomes[{name, price, point}]` shape the app already validates with `OddsEventSchema` [CITED: the-odds-api.com/liveapi/guides/v4/]. Cost = *unique markets returned* x *regions*, where every 10 bookmakers passed via `bookmakers=` count as 1 region; empty responses cost 0 [CITED: v4 guide]. This app never uses `regions=` -- it passes `bookmakers=` with the 7 `usableOddsBooks()` keys (`src/config/books.ts:139`, tier free: draftkings, fanduel, betmgm, betrivers, espnbet, hardrockbet, ballybet). So each alt fetch costs **1 credit, not 2** (CONTEXT's "~2 each with us,us2" estimate is too high): max 5 credits per press.

**No migration needed.** Merge the fetched `alternate_spreads` market into the matching event's bookmakers inside `pendingWrites[].extendedEvents` before `commitSpreadsTotalsRefresh` runs. `cached_extended_odds.raw_response` is jsonb holding the full event; `OddsEventSchema` is `looseObject` with `key: z.string()`; every consumer selects markets by exact key (`h2h`/`spreads`/`totals`), so an extra `alternate_spreads` market is inert everywhere except the one place we teach to read it (`resolveSpread` in `selection.ts`).

**Primary recommendation:** Add `fetchEventOdds()` to `client.ts`; in `refreshExtended.ts`, after the main sport loop succeeds and before commit, pick up to 5 target events (passed in from the action), check the remaining-credit gate, fetch alt spreads soft-fail per event, merge into buffered events, commit once; extend `resolveSpread` to also read `alternate_spreads` with exact-point matching.

## Integration Map (file:line)

| Concern | Location | What exists today |
|---|---|---|
| Action entry | `src/app/actions/refresh-spreads-totals.ts:20-38` | `requireUser()` -> zod `{confirmed}` -> `runSpreadsTotalsRefresh({confirmed, triggeredByUserId})` |
| Lock | `refreshExtended.ts:93-119` | `tryAcquireRefreshLock` / `releaseRefreshLock` wrap `runGuardedSpreadsTotalsRefresh` |
| Gate | `refreshExtended.ts:143-179`, `quota.ts:29-36, 62-85` | `estimateRefreshCredits(sports, books, 3)`; `evaluateRefreshGate` blocks if `remaining < 20` (`CREDIT_BLOCK_THRESHOLD`) or `estimated > remaining`; confirm always required |
| Fetch loop | `refreshExtended.ts:192-218` | Buffers `{sportKey, extendedEvents, h2hEvents}`; accumulates `refreshCost += quota.last`, `lastRemaining`, `lastUsed` |
| Commit | `refreshExtended.ts:222` -> `store.ts:124-138` | One neon-http batch: delete+insert per sport into both caches, then purges |
| Credit meter | `refreshExtended.ts:225-253` | `recordCreditUsage` in `finally`; `sportsFetched: inSeason.length` (feeds status.ts estimates -- do NOT add alt count here) |
| Outcome type | `refreshExtended.ts:47-58` | `ok` = `{fetchedAt, sportsFetched, creditsSpent, remaining}` |
| HTTP client | `client.ts:96-130` | `fetchSportOdds` builds URL with `bookmakers`, `markets`, `oddsFormat=american`, `dateFormat=iso`; `parseQuotaHeaders` (`:43`) |
| Response schema | `src/domain/odds/schemas.ts` | `OddsOutcomeSchema` has optional `point: z.number()`; `OddsEventSchema` loose |
| Cache read | `src/db/queries.ts:166-194` | `getCachedExtendedEvents()` latest-batch rows, reparsed with `OddsEventSchema` |
| Cache table | `src/db/schema.ts:63-76` | `cached_extended_odds(event_id pk, sport_key, commence_time, raw_response jsonb, fetched_at)` |
| Promo pin | `src/db/schema.ts:214-216`; `src/db/promos.ts:188-205` | `market_type/line(double)/side`; mapped to `pinned: PromoSelection {eventId, marketType, line, side}` only when `scope.kind === "event"` |
| Active promos query | `src/db/promos.ts:263-284` | `getActivePromos(now, viewerUserId)` applies status/scope/expiry/visibility (personal promos) |
| Pinned resolution | `rankPromoHedges.ts:92-121` | `getPinnedCandidates` -> for spread uses `extendedEvents` -> `resolveSelection` |
| Spread matching | `src/domain/promos/selection.ts:79-125` | `resolveSpread` reads ONLY `m.key === "spreads"`, requires `outcomes.length === 2` and `homeOutcome.point === expectedHomePoint`. A pinned -6.5 when main is -7 => zero quotes => `null` => promo drops out. **This is the gap.** |
| Hedge pick | `rankPromoHedges.ts:237-241` | `promoBookQuote = promoSideQuotes.find(bookKey===promo.bookKey)`; `hedge = bestHedgeQuote(oppositeSideQuotes, hedgeBookKeys)` (decimal.js via `americanToDecimal`) |
| UI | `src/components/arb/ArbForm.tsx:41,130-165`; `SearchSpreadsTotalsDialog.tsx:57` | `SearchBanner.kind` is `blocked/busy/error`; `ok` clears banner. Dialog text "about N credits -- roughly 3x a normal refresh" |

`line` semantics: `line` is the promo team's own point (`selection.ts:82` `expectedHomePoint = side==="home" ? line : -line`). So the opposite outcome is `{name: oppositeTeam, point: -line}`.

## Recommended Implementation

### 1. Client: `fetchEventOdds` (client.ts)
```typescript
// GET /v4/sports/{sportKey}/events/{eventId}/odds -- single event object.
// Cost = unique markets RETURNED x ceil(bookmakers/10); empty => 0 credits.
export async function fetchEventOdds(sportKey: string, eventId: string, opts: { bookmakerKeys: string[]; markets: readonly string[] })
  : Promise<{ event: OddsEvent | null; quota: QuotaHeaders }> {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/events/${encodeURIComponent(eventId)}/odds`);
  url.searchParams.set("apiKey", getApiKey());
  url.searchParams.set("bookmakers", opts.bookmakerKeys.join(","));
  url.searchParams.set("markets", opts.markets.join(","));
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  // fetch no-store; parseQuotaHeaders BEFORE checking res.ok; 404 -> { event: null } (event gone/started);
  // other !ok -> OddsApiError (never include the URL -- it carries apiKey); body -> OddsEventSchema.safeParse
}
```
Use the same error-message discipline (no key/URL in messages, `client.ts:28-34, 110-127`). Treat 404 as "event unavailable" rather than throwing [ASSUMED: 404 is the status for an unknown/expired event id -- not stated on the v4 guide page fetched; handle any non-ok per event as soft skip anyway].

### 2. Target selection (pure helper, e.g. `src/domain/promos/altSpreadTargets.ts`)
Input: member's `ActivePromo[]` + the just-fetched extended events + `now`. Output: `{ targets: {sportKey, eventId, commenceTime}[], skipped: number }`.
- Keep promos with `pinned?.marketType === "spread"` and `isHalfPoint(pinned.line)`.
- Dedupe by `pinned.eventId`.
- Look the event up in the freshly buffered `extendedEvents` (gives `sport_key` + `commence_time`, and proves it is still in the 7-day fetch window and in the future). Events not found are not candidates.
- "Not the main spread" filter: skip an event only if every bookmaker in its main `spreads` market already quotes every pinned line for that event (then alt adds nothing). Otherwise it's a candidate.
- Sort by `commence_time` asc (tie-break eventId), take 5, `skipped = total - 5`.

Keep `runSpreadsTotalsRefresh` DB-free for promos: the action loads `getActivePromos(new Date(), user.userId)` and passes the pinned-spread promos (or a thin `{eventId, line}[]` list) in as a new option, e.g. `altSpreadPins`. This preserves the existing test mocks (`refreshExtended.test.ts:4-16` only mocks client + store) and keeps visibility (personal promos) enforced by `promoVisibilityCondition`.

### 3. Orchestration (refreshExtended.ts, inside the existing try, after the sport loop, before `commitSpreadsTotalsRefresh`)
- Credit check with the freshest balance: `const bal = lastRemaining ?? priorRemaining`; `altCost = targets.length * Math.ceil(bookKeys.length / 10)`; if `bal !== null && (bal - altCost < CREDIT_BLOCK_THRESHOLD)` -> skip all alt fetches, set `altSkippedForCredits = true`. Main refresh still commits.
- Loop targets sequentially: `fetchEventOdds(sportKey, eventId, { bookmakerKeys: bookKeys, markets: ["alternate_spreads"] })`; add `quota.last` to `refreshCost`, update `lastRemaining/lastUsed`, set `quotaCaptured = true` (so the `finally` records it with `triggeredByUserId`).
- **Soft-fail per event**: wrap each call in try/catch; count failures; never set `refreshError` for an alt failure (main cache must still land).
- Merge into the buffered event (pure helper `mergeAltSpreads(event, altEvent)`): for each alt bookmaker, find-or-create the bookmaker entry by `key` on the buffered event (alt may include a book with no main spreads), append `{ key: "alternate_spreads", last_update, outcomes }` -- replacing any existing `alternate_spreads` market. Never mutate; return new objects. Only keep bookmakers whose key is in `bookKeys`.
- Commit unchanged -- the merged event goes into `cached_extended_odds.raw_response` in the same transaction/timestamp.
- Extend `ok` outcome: `altLines: { fetched: number; skippedOverLimit: number; skippedForCredits: boolean; failed: number }`.
- `estimatedCredits` for the confirm dialog: keep the gate evaluated on the main estimate only (so alt never blocks main, per CONTEXT). Optionally show "+ up to 5 credits for alternate lines on pinned games" in `SearchSpreadsTotalsDialog.tsx:57` -- but the action doesn't know targets at confirm time without the main fetch; a static "up to 5 more" note is simplest and honest.

### 4. Ranking merge (selection.ts `resolveSpread`)
Keep the main-line loop exactly as is. Then, per bookmaker that produced **no** main-line quote for this selection, read `markets.find(m => m.key === "alternate_spreads")` and:
```typescript
const promoOutcome = alt.outcomes.find(o => o.name === promoTeam && samePoint(o.point, sel.line));
const oppositeOutcome = alt.outcomes.find(o => o.name === oppositeTeam && samePoint(o.point, -sel.line));
if (promoOutcome) promoSideQuotes.push({ bookKey, oddsAmerican: promoOutcome.price });
if (oppositeOutcome) oppositeSideQuotes.push({ bookKey, oddsAmerican: oppositeOutcome.price });
```
- One quote per book per side (main wins if present; they should be the same price anyway) -- otherwise `bestHedgeQuote` sees duplicates (harmless but confusing) and `promoSideQuotes.find` could pick a stale one.
- Alt market has many outcomes (2 per point), so the `outcomes.length !== 2` guard used for main spreads must NOT apply to it.
- Only affects pinned selections: `enumerateScopeSelections` (`selection.ts:194-209, 296-300`) enumerates candidate points from `spreads` only, so unpinned promos keep today's behavior. Do not add alt points to `collectSpreadHomePoints` (would change unpinned ranking and arb tab; out of scope).
- `spreadsTotalsFilter.ts:60` (arb/finder) keys on `"spreads"` -> untouched.

## Don't Hand-Roll
| Problem | Use Instead |
|---|---|
| Money / odds math | Existing `americanToDecimal`, `calculateProfitBoostHedge`, `calculateBonusBetHedge` (decimal.js). Alt lines only add quotes; no new math. |
| Response validation | Existing `OddsEventSchema` (single object) -- no new schema needed beyond `.safeParse` on the object. |
| Lock / gate / meter | Existing `tryAcquireRefreshLock`, `CREDIT_BLOCK_THRESHOLD`, `recordCreditUsage` in the existing `finally`. |
| Cache write | Existing `commitSpreadsTotalsRefresh` batch -- no new writer, no new table. |

## Common Pitfalls

1. **Credit estimate from regions vs bookmakers.** App uses `bookmakers=` (7 keys) -> 1 region group -> 1 credit/event when alt markets are returned, 0 when empty. Always record `quota.last` from headers rather than the estimate.
2. **Float point equality.** API JSON gives `-6.5`; DB `line` is `double precision`; half-points are exact in binary, so `===` works, but guard with `isHalfPoint` (`spreadsTotalsFilter.ts:21`) and compare `Math.round(a*2) === Math.round(b*2)` to be safe against `-6.50`/string drift. Watch `-0` never occurs for half-points.
3. **Opposite sign.** Opposite outcome is `point === -sel.line` on the *other team's* name, not the same point. Test both home-pinned and away-pinned.
4. **Coverage gaps.** Alt spreads are "US sports and selected bookmakers" only [CITED: betting-markets page]; many books won't return the market or won't carry the exact point. Result: promo may still resolve with no hedge -> existing "no hedge" path. Don't approximate (locked).
5. **Alt failure must not fail main.** Current loop sets `refreshError` on any throw and skips commit (`refreshExtended.ts:223-224`). Alt fetches need their own try/catch.
6. **Stale alt data across presses.** Every press replaces rows per sport; alt lines persist only for events fetched on that press. A press by another member (different personal promos) drops alt lines for the first member's personal-promo games. Acceptable; note it in the summary.
7. **5-cap ordering.** Sort by the fetched event's `commence_time` (not promo `expires_at`), dedupe per event before capping, and report `skipped = qualifying - 5`.
8. **`sportsFetched` in credit row.** Keep it `inSeason.length` (`refreshExtended.ts:244`); status.ts derives future estimates from it.
9. **API key leakage.** Per-event URL carries `apiKey`; never interpolate URL into error messages (T-01-13).
10. **Module boundary.** `refresh.ts` must not import `refreshExtended.ts` (D-16) -- keep the new client function in `client.ts` and helpers in domain modules.

## Validation Architecture

| Property | Value |
|---|---|
| Framework | Vitest (`vitest.config.ts`) |
| Quick run | `npx vitest run src/domain/promos/selection.test.ts src/ingestion/odds/refreshExtended.test.ts src/ingestion/odds/client.test.ts` |
| Full suite | `npm test` |

| Behavior | Test | File |
|---|---|---|
| `fetchEventOdds` URL (markets=alternate_spreads, bookmakers, american, iso), quota headers parsed on success/error, single-object parse, 404 -> null, key not in error | unit (stub `fetch`, pattern at `client.test.ts:70`) | `client.test.ts` |
| Target selection: pinned-spread only, dedupe, commence asc, cap 5 + skipped count, events absent from fetch excluded, main-already-covers skipped | unit | new `altSpreadTargets.test.ts` |
| Orchestration: alt credits added to `refreshCost` and recorded with `triggeredByUserId`; low balance skips alt but main commits; alt throw doesn't fail main; merged event passed to `commitSpreadsTotalsRefresh`; no alt calls when no pins | unit (add `fetchEventOdds: vi.fn()` to mock at `refreshExtended.test.ts:4-7`) | `refreshExtended.test.ts` |
| `resolveSpread`: pinned -6.5 home with main -7 -> quotes from alt; opposite = away +6.5 only (not +7, not +6); main wins over alt per book; away-pinned sign; unpinned enumeration unchanged | unit | `selection.test.ts` |
| End-to-end ranking exact to the cent with alt hedge | unit | `rankPromoHedges.test.ts` |

## Environment Availability
Step 2.6: no new tools or packages. Node v25.8.1 present. No live API calls needed for tests (fetch stubbed). No migration.

## Security Domain
- V4 Access control: target list must come from `getActivePromos(now, user.userId)` (visibility rule `promos.ts:257`), never from client input; userId only from `requireUser()`.
- V5 Input validation: `OddsEventSchema.safeParse` on per-event body; `encodeURIComponent(eventId)` in the path.
- Secret handling: `ODDS_API_KEY` server-only; no URL in errors.

## Assumptions Log
| # | Claim | Risk if Wrong |
|---|---|---|
| A1 | Unknown/started event id returns HTTP 404 | Low -- plan treats every non-ok as a per-event soft skip |
| A2 | Alt outcome `name` equals the event's `home_team`/`away_team` string exactly (same as main spreads) | Medium -- if names differ no quotes match; add a test fixture and verify on first live press |
| A3 | Colorado books in `usableOddsBooks()` return `alternate_spreads` for NFL/NBA; exact per-book coverage unknown | Low -- missing coverage just yields no hedge, never wrong math |

## Open Questions
1. Should the confirm dialog show alt credits? Recommendation: static "+ up to 5 credits for alternate lines on pinned games" line; exact count unknown until main fetch.
2. Where to show "N games' alt lines skipped (limit 5)": `ArbForm` currently clears the banner on ok; add an `info` kind to `SearchBanner` (`ArbForm.tsx:41`) shown only when `skippedOverLimit > 0 || skippedForCredits`.

## Sources
- https://the-odds-api.com/liveapi/guides/v4/ -- event odds endpoint params, cost = unique markets returned x regions, 10 bookmakers = 1 region, empty responses free, single-object response, x-requests-* headers (HIGH)
- https://the-odds-api.com/sports-odds-data/betting-markets.html -- `alternate_spreads` per-event only, US sports/selected bookmakers, 1-minute updates (HIGH)
- Codebase files cited inline (HIGH)

**Valid until:** 2026-10-30
