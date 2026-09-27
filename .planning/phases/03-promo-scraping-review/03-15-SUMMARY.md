---
phase: 03-promo-scraping-review
plan: 15
subsystem: ui
tags: [drizzle, decimal.js, hedge-math, promo-scope, vitest, react, collapsible]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-03: promos/scrape_runs schema, Promos tab scaffold; 03-04: scope model + rankPromoHedges; 03-05: ScrapedPromoSchema/etTime helpers"
provides:
  - "src/db/promos.ts: ActivePromo + getActivePromos(now) -- status='active' promos with a resolved scope, D-16-compliant expiry (event commence_time or sport_window's window_end), re-validated parsed payload, attribution"
  - "src/domain/promos/dto.ts: PromoRowDTO + rows: PromoRowDTO[] on GetPromosResponse's ok branch"
  - "src/app/actions/get-promos.ts: getPromos now runs rankPromoHedges at the member's own hedge books and returns cent-exact hedge rows or the correct empty variant (none-scraped/no-active/no-books/no-odds)"
  - "src/components/promos/PromoRow.tsx + PromoDetails.tsx: compact expandable promo+hedge row and its expanded step-by-step panel"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getActivePromos re-validates the stored parsed jsonb payload with ScrapedPromoSchema.safeParse and narrows every enum text column (promo_type, market_type, side, max_winnings_kind) against types.ts's const arrays, dropping + console.warn'ing the row rather than throwing (T-03-15-01) -- a malformed row can never take down the whole tab"
    - "getPromos's book-scoping empty-state split mirrors find-arbs.ts's booksExcludedAll: rank at the member's own hedge books first, and only re-rank at every usable book (unscoped getHedgeBookKeys()) when that first ranking is empty, to distinguish 'no-books' from 'no-active' with zero extra DB reads in the common case"
    - "PromoRow.tsx/PromoDetails.tsx copy ResultRow.tsx/ResultDetails.tsx verbatim (six-column Collapsible grid, Same book/Tie risk Badge+Tooltip idiom, numbered-step expanded panel) -- new elements (Auto-matched badge, scope line, claim hint, fine-print tooltip, optional step 0) are additive, not a restructuring"

key-files:
  created:
    - src/components/promos/PromoRow.tsx
    - src/components/promos/PromoDetails.tsx
  modified:
    - src/db/promos.ts
    - src/domain/promos/dto.ts
    - src/app/actions/get-promos.ts
    - src/app/actions/get-promos.test.ts
    - src/components/promos/PromosScreen.tsx
    - scripts/promos-check.ts

key-decisions:
  - "Removed the Plan 03 countLivePromos function (and its scripts/promos-check.ts caller) rather than keeping it alongside getActivePromos -- countLivePromos never accounted for sport_window's window_end (D-16), so keeping both risked the tab and the smoke script silently disagreeing about which promos are live; getActivePromos is now the single source of truth for 'is this promo hedgeable right now'"
  - "getBonusBooks() is called unscoped (every usable book, not just the member's own) to build the bookNames map, since a promo's own book (Col 2) may not be one of the member's saved books even though the hedge book (Col 3) always is -- matches the plan's own action text ('getBonusBooks() (names for every usable book)')"
  - "capNote text is generated in get-promos.ts's DTO-mapping layer (not db/promos.ts), since it needs the bookNames map that's only assembled once cached odds are confirmed present"

requirements-completed: [CALC-02, CALC-03]

# Metrics
duration: 15min
completed: 2026-09-27
---

# Phase 3 Plan 15: Active Promo Rows on the Promos Tab Summary

**Reads active promos (status='active', resolved scope, D-16 expiry-checked) from Postgres, runs Plan 04's rankPromoHedges at the member's own hedge books, and renders each as a compact expandable row -- the best bet in the promo's scope, its exact hedge, stakes, guaranteed profit, and ROI/Conversion -- on the Promos tab.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-27T00:00:48-06:00 (worktree base commit)
- **Completed:** 2026-09-27T00:14:55-06:00
- **Tasks:** 2 completed
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- `getActivePromos(now)` (`src/db/promos.ts`): selects promos where `status='active'` and the scope is resolved and not expired -- honoring `expires_at`, the matched event's `event_commence_time` (event scope), or the window's `window_end` (sport_window scope, D-16) -- left-joins `users` three times via `alias()` for confirmed/corrected/cap-entered attribution, re-validates the stored `parsed` jsonb with `ScrapedPromoSchema`, and narrows every enum column against `types.ts`'s const arrays, dropping and `console.warn`-ing any row that fails either check rather than throwing.
- `scopeLabel` derivation: `"{away} @ {home}"` for event scope; `"Any {sport} game · {etDayLabel}"` for a single-ET-day sport_window, or `"Any {sport} game · Sep 25–27"` for a multi-day window (computed via ET-calendar-day-key comparison, no new dependency).
- `getPromos` (`src/app/actions/get-promos.ts`) now runs `rankPromoHedges` at the member's own hedge books (`getHedgeBookKeys(userBookSet)`, D-05) once at least one active promo and some cached odds exist, and maps each `PromoOpportunity` to a `PromoRowDTO` with every money figure as a 2-dp string. When ranking at the member's own books yields zero rows, it re-ranks at every usable book (mirroring `find-arbs.ts`'s `booksExcludedAll` pattern) to correctly distinguish `"no-books"` (rows exist elsewhere) from `"no-active"` (no rows anywhere).
- `PromoRow.tsx`/`PromoDetails.tsx`: copy the finder's `ResultRow.tsx`/`ResultDetails.tsx` Collapsible six-column grid and expanded-panel layout verbatim, adding the promo scope line, claim hint, fine-print tooltip, Auto-matched badge, an optional "opt in first" step 0, the cap-bound note, and the attribution line -- the promo stake is always rendered as text, never an editable input (D-02).
- `PromosScreen.tsx` renders `<RiskAdvisory />` directly above the row list whenever `rows.length > 0`, keeping the existing `ScrapeStatusPanel`/empty-state branches unchanged.
- 12/12 tests pass in `get-promos.test.ts` (including new no-odds, sport_window/event scopeLabel, claimHint, and no-books/no-active cases); full suite (470 tests across 42 files), typecheck, lint, and `next build --webpack` all green.

## Task Commits

Each task was committed atomically:

1. **Task 1: getActivePromos and getPromos hedge rows scoped to the member's books** - `6156b32` (feat)
2. **Task 2: Promo rows and expanded details on the Promos tab** - `d793fcb` (feat)

_No separate "Plan metadata" commit yet -- SUMMARY.md is committed as part of this same plan-completion step per the worktree executor's parallel-execution contract._

## Files Created/Modified

- `src/db/promos.ts` - Adds `ActivePromo`/`getActivePromos(now)`; per-book `getScrapeStatus` unchanged; removes the now-superseded `countLivePromos`
- `src/domain/promos/dto.ts` - Adds `PromoRowDTO`; `GetPromosResponse`'s ok branch gains `rows: PromoRowDTO[]`
- `src/app/actions/get-promos.ts` - `getPromos` now reads active promos, ranks them at the member's books, and maps opportunities to `PromoRowDTO[]`
- `src/app/actions/get-promos.test.ts` - Rewritten mocks (`getActivePromos` replaces `countLivePromos`) plus 12 tests covering every empty-state/row-mapping behavior in the plan
- `src/components/promos/PromoRow.tsx` - New: six-column Collapsible promo+hedge row
- `src/components/promos/PromoDetails.tsx` - New: expanded step-by-step panel with per-outcome payout table
- `src/components/promos/PromosScreen.tsx` - Renders `RiskAdvisory` + the row list when rows exist
- `scripts/promos-check.ts` - Updated to call `getActivePromos` instead of the removed `countLivePromos`

## Decisions Made

- Removed `countLivePromos` (Plan 03) rather than keeping it beside `getActivePromos` -- it didn't account for `window_end` (D-16), and keeping two "is this promo live" predicates risked drift between the smoke script and the actual tab.
- `getBonusBooks()` is called unscoped for the `bookNames` map (names for every usable book), while `getHedgeBookKeys(userBookSet)` stays scoped to the member's own books -- per the plan's own action text.
- `capNote` construction lives in `get-promos.ts`'s DTO-mapping layer, not `db/promos.ts`, since it needs the `bookNames` map assembled after the odds-cache check.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `scripts/promos-check.ts` broke after removing `countLivePromos`**
- **Found during:** Task 1, `npm run typecheck`
- **Issue:** `scripts/promos-check.ts` (not in this plan's `files_modified` list) imported and called `countLivePromos`, which Task 1 removed from `src/db/promos.ts` in favor of the D-16-compliant `getActivePromos`.
- **Fix:** Updated the script's import and its "Live (hedgeable) promos" log line to call `getActivePromos(new Date()).length` instead.
- **Files modified:** `scripts/promos-check.ts`
- **Verification:** `npm run typecheck` passes; the script's own live-DB behavior (never printing the DB secret, printing status by book) is otherwise unchanged.
- **Committed in:** `6156b32` (Task 1's commit) -- fixed before commit, not a follow-up.

---

**Total deviations:** 1 auto-fixed (1 blocking issue, a direct consequence of Task 1's own `countLivePromos` removal). No scope creep, no architectural change.

## Issues Encountered

- This worktree lacked `node_modules`, `.env.local`, and `.next` -- symlinked all three from the primary checkout per the parallel-execution setup instructions (never committed; unlinked before returning).
- Used `npx next build --webpack` for local build verification, matching the prior three plans' documented Turbopack-symlinked-`node_modules` workaround; production/Vercel builds are unaffected.
- `get-promos.test.ts`'s original fixtures anchored fixture events to a hardcoded past ISO instant while `get-promos.ts` calls `new Date()` internally (not an injected clock) -- fixed by anchoring `NOW_ISO` to `new Date().toISOString()` at test-file load time instead, so event `commence_time`/scope `window_end` stay in the future relative to the action's own real-time clock read regardless of when the suite runs.

## User Setup Required

None -- no external service configuration required. No network requests were made to sportsbooks or the Odds API during this plan's execution (pure code changes, mocked tests, local build/typecheck only).

## Next Phase Readiness

- `getActivePromos`/`getPromos`/`PromoRowDTO` are stable for Plan 10 (flag-back action) to extend `PromoRow.tsx`'s Col 1 with the flag-back icon button this plan intentionally deferred (autoMatched badge already renders; the button itself is explicitly out of this plan's scope per its own action text).
- `ActivePromo`'s `attribution` array already supports all three verbs (Confirmed by / Corrected by / Cap entered by) so Plans 07-09's review actions need no shape change to `db/promos.ts` when they start writing `confirmed_by_user_id`/`corrected_by_user_id`/`cap_entered_by_user_id`.
- No blockers identified for downstream plans.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `PromosScreen`'s `hasCachedOdds` prop remains accepted but unused | `src/components/promos/PromosScreen.tsx` | Pre-existing from Plan 03 (reserved for the `AppShell` call-site contract); this plan's empty-state logic comes entirely from `emptyVariant`, per this plan's own action text ("Use the hasCachedOdds prop... only if needed"). No UI work is blocked by this. |
| Flag-back icon button (D-11) not rendered on `PromoRow.tsx` | `src/components/promos/PromoRow.tsx` | Explicitly deferred to Plan 10 per this plan's own must_haves note ("the flag button is Plan 10"). The `Auto-matched` badge itself is fully wired now. |

## Self-Check: PASSED

All 8 files (2 created, 6 modified) verified present on disk; both task commit hashes (`6156b32`, `d793fcb`) verified present in `git log --oneline --all`.

---
*Phase: 03-promo-scraping-review*
*Completed: 2026-09-27*
