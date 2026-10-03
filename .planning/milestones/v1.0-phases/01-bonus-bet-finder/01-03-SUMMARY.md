---
phase: 01-bonus-bet-finder
plan: 03
subsystem: ui
tags: [nextjs, react-hook-form, zod, base-ui, tailwindcss-v4, shadcn]

# Dependency graph
requires:
  - phase: 01-bonus-bet-finder (Plan 01)
    provides: FinderResultDTO/FindHedgesResponse/FinderInputSchema contracts, SPORTS config, hedge engine
  - phase: 01-bonus-bet-finder (Plan 02)
    provides: findHedges server action, getBonusBooks/getOddsFreshness queries, live seeded Neon DB
provides:
  - Finder page (src/app/page.tsx, force-dynamic server component) with header + FinderForm
  - FinderForm (client): RHF + zodResolver(FinderInputSchema) form (book Select, amount Input,
    sport ToggleGroup) calling findHedges in a transition, server fieldErrors mapped back via setError
  - ResultsList/ResultRow/ResultDetails: ranked compact rows (mobile card / md+ fixed-column grid),
    Collapsible expand panel with Display-size profit restatement, A/B bet steps, and the
    Outcome/Stake/Payout/Net profit table
  - Same-book Badge+Tooltip (D-17) and neutral NFL Tie-risk Badge+Tooltip (CALC-05 disclosure)
  - EmptyState: verbatim UI-SPEC copy for no-search / no-cached-odds / no-results, shared by
    FinderForm and ResultsList
  - src/lib/format.ts: formatUsd/formatAmerican/formatPct/formatKickoff (string-based, no float money math)
  - globals.css: emerald accent (--primary/--ring), red --destructive, amber --warning tokens,
    .num tabular-mono utility, OS-preference-only dark mode, Geist Sans font-sans wiring fix
affects: [01-04, 01-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "z.input<typeof Schema> (not z.infer/output) as the react-hook-form generic when the schema
       has a .default() field — avoids the @hookform/resolvers + zod@4 overload mismatch (resolvers
       issue #842) without touching the shared FinderInputSchema/FinderInput contract"
    - "FinderForm owns all client interaction state (form, transition, last response) and renders
       the results section itself; page.tsx stays a thin server component that only loads dropdown
       data — client components never import @/db or @/domain/hedge directly, only the server
       action and shared DTO/config types (T-01-12 mitigation)"
    - "EmptyState is a single variant-keyed component (no-search/no-cached-odds/no-results) so the
       three UI-SPEC empty-state copy blocks live in one place, reused by both FinderForm (pre-search
       and no-cached-odds) and ResultsList (zero-result search)"
    - "Base UI (not Radix) component composition: TooltipTrigger's `render` prop point at the Badge
       element so nested-button HTML validity isn't violated when badges sit inside the row's
       CollapsibleTrigger <button>"

key-files:
  created:
    - src/lib/format.ts
    - src/lib/format.test.ts
    - src/components/finder/FinderForm.tsx
    - src/components/finder/ResultsList.tsx
    - src/components/finder/ResultRow.tsx
    - src/components/finder/ResultDetails.tsx
    - src/components/finder/EmptyState.tsx
  modified:
    - src/app/layout.tsx (title -> "PromoProfit — Bonus bet finder")
    - src/app/globals.css (accent/destructive/warning tokens, .num utility, dark mode strategy, font-sans fix)
    - src/app/page.tsx (replaced create-next-app boilerplate with the finder page)

key-decisions:
  - "Dark mode implemented as a pure @media (prefers-color-scheme: dark) override of Tailwind's
     dark: variant, not the class-based .dark selector shadcn scaffolded — UI-SPEC requires OS
     preference with no manual toggle in Phase 1, and this avoids needing a client-side
     class-toggling script (and its flash-of-wrong-theme risk) to reach the same outcome"
  - "Fixed a pre-existing scaffold bug while touching globals.css: --font-sans was mapped to
     var(--font-sans) (circular/undefined) instead of var(--font-geist-sans), so Geist Sans was
     never actually applied to body text since Plan 01 (Rule 1 — bug, not scope creep, since the
     UI-SPEC's typography contract requires Geist Sans and this task already owns globals.css)"
  - "Task 1 shipped a self-contained (non-expandable) ResultRow so the 'thin usable slice' had no
     forward dependency on Task 2's EmptyState/ResultDetails files, matching the plan's staged file lists"

requirements-completed: [BONUS-01, CALC-01, CALC-05]

# Metrics
duration: 15min
completed: 2026-09-25
---

# Phase 1 Plan 03: Finder Screen UI Summary

**Finder page wired end-to-end to the live Neon-cached fixture odds: book+amount+sport form, ranked compact rows, expand-to-stakes panel, Same-book/NFL-tie badges, and every UI-SPEC empty/validation state, verified against the exact $80.00/80.00% DraftKings fixture.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-25T19:34:00Z (approx, first file reads)
- **Completed:** 2026-09-25T19:46:45Z
- **Tasks:** 2
- **Files modified:** 7 created, 3 modified

## Accomplishments

- A user can open `/`, pick DraftKings, enter 100, press "Find hedges," and see the ranked rows
  led by the fixture's Utah Jazz +300 / Denver Nuggets −275 FanDuel hedge at exactly $80.00 / 80.00%
  — verified by calling `findHedges` directly against the live seeded Neon DB, matching the plan's
  `<done>` criteria for both tasks
- Every compact row expands independently (Collapsible, whole row is the 44px+ trigger) into the
  Display-size profit restatement, the A/bonus-leg + B/hedge-leg steps, and a per-outcome
  Outcome/Stake/Payout/Net profit table — all values are DTO strings run through `formatUsd`, no
  client-side arithmetic
- Same-book and NFL tie-risk are surfaced as neutral (non-accent) badges with tooltips, matching
  D-17 and the CALC-05 "disclosure, not exclusion" research recommendation
- All three UI-SPEC empty/pre-search states ("Enter a book and bonus amount...", "No odds cached
  yet", "No qualifying markets right now") render verbatim from a single shared `EmptyState` component
- `npm run build` succeeds with `.env.local` removed entirely (page is `force-dynamic`, confirmed
  by temporarily moving the real `.env.local` aside and rebuilding)

## Task Commits

Each task was committed atomically:

1. **Task 1: Thin finder slice: page, form, and ranked compact rows wired to findHedges** - `cec7bd1` (feat)
2. **Task 2: Expand panel, sport filter, same-book and NFL tie badges, and all empty/validation states** - `02303b3` (feat)

**Plan metadata:** (this commit, following SUMMARY.md)

## Files Created/Modified

- `src/lib/format.ts` / `format.test.ts` - formatUsd/formatAmerican/formatPct/formatKickoff (TDD, string-based, no Number()/parseFloat)
- `src/app/page.tsx` - force-dynamic server component loading getBonusBooks/getOddsFreshness
- `src/app/layout.tsx` - metadata title update
- `src/app/globals.css` - UI-SPEC color tokens, `.num` utility, OS-only dark mode, font-sans fix
- `src/components/finder/FinderForm.tsx` - RHF + zodResolver form, sport ToggleGroup, transition-based findHedges call, skeleton/empty-state wiring
- `src/components/finder/ResultsList.tsx` - heading/caption/column header, zero-result EmptyState
- `src/components/finder/ResultRow.tsx` - Collapsible compact row, Same-book/Tie-risk badges+tooltips
- `src/components/finder/ResultDetails.tsx` - expanded panel: headline, A/B steps, per-outcome table
- `src/components/finder/EmptyState.tsx` - the three verbatim UI-SPEC empty-state copy blocks

## Decisions Made

- `z.input<typeof FinderInputSchema>` used as the RHF generic (not the exported `FinderInput`
  output type) to route around the `@hookform/resolvers` + `zod@4` overload mismatch flagged in
  01-RESEARCH.md, without changing the shared schema/DTO contract Plan 02 already built against.
- Dark mode driven purely by `@media (prefers-color-scheme: dark)` instead of shadcn's scaffolded
  class-based `.dark` selector — functionally equivalent to the UI-SPEC's "OS preference, no
  toggle" requirement, simpler, and avoids a client-side theme-class script.
- ResultRow's mobile layout uses a linear flex stack rather than the mockup's literal
  `grid-template-areas` (game/chev, bonus, hedge, profit/conv) — satisfies the UI-SPEC's functional
  requirement (stacked micro-layout, 44px tap target, all five data points visible) without
  reproducing the mockup's exact area names, which aren't load-bearing for any acceptance criterion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `--font-sans` theme token was circular/undefined, so Geist Sans was never applied to body text**
- **Found during:** Task 1, while editing `globals.css` per the plan's explicit color/typography instructions
- **Issue:** The Plan 01 scaffold's `@theme inline` block mapped `--font-sans: var(--font-sans)` (self-referential) instead of `var(--font-geist-sans)`, so the `font-sans` utility (applied to `<html>` in `@layer base`) never actually resolved to the Geist font next/font loads — a pre-existing, invisible bug from Plan 01 that the UI-SPEC's Geist Sans typography requirement makes directly relevant to this task's own file.
- **Fix:** Changed the mapping to `--font-sans: var(--font-geist-sans)`.
- **Files modified:** src/app/globals.css
- **Verification:** `npm run build` and `npm run lint` green; no other token depends on the old (broken) value.
- **Committed in:** cec7bd1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 correctness bug in code this task already had to touch)
**Impact on plan:** Necessary so the UI-SPEC's "Geist Sans for UI text" requirement is actually true on screen, not just declared in the font loader. No scope creep — the fix is a single line inside the file this task's own action text specifies editing.

## Issues Encountered

None. Both `npx tsc --noEmit` and `npm run lint` were clean on the first pass after each task; no fix-attempt-limit issues arose.

## User Setup Required

None - no new external service configuration required. Reuses the Neon `DATABASE_URL` already provisioned in Plan 02's `.env.local`.

## Next Phase Readiness

- Plan 04 (odds ingestion / live Odds API refresh) can wire a "Refresh odds" action into the same
  page without touching the finder's own components — `hasCachedOdds`/`getOddsFreshness` are
  already threaded through `page.tsx` -> `FinderForm`.
- Plan 05 can extend `FinderFormProps` with the optional prop referenced in this plan's interfaces
  section without any signature-breaking change to the current props.
- No blockers. One open item carried forward (not a blocker): the odds status bar (age display,
  credit meter, refresh button) described in 01-UI-SPEC.md's "Layout & Responsive Behavior" is out
  of this plan's scope (its `requirements` are `[BONUS-01, CALC-01, CALC-05]`, no `ODDS-*` IDs) and
  is expected to land in Plan 04/05.

---
*Phase: 01-bonus-bet-finder*
*Completed: 2026-09-25*

## Self-Check: PASSED

All key files (src/lib/format.ts, src/lib/format.test.ts, src/components/finder/FinderForm.tsx,
src/components/finder/ResultsList.tsx, src/components/finder/ResultRow.tsx,
src/components/finder/ResultDetails.tsx, src/components/finder/EmptyState.tsx, src/app/page.tsx,
src/app/layout.tsx, src/app/globals.css) confirmed present on disk. Both task commits
(cec7bd1, 02303b3) confirmed present in git history.
