---
phase: 01-bonus-bet-finder
plan: 01
subsystem: hedge-engine
tags: [nextjs, typescript, decimal.js, zod, vitest, shadcn, tailwind, hedge-math]

# Dependency graph
requires: []
provides:
  - Next.js 16 App Router scaffold (build/lint/typecheck/dev all green)
  - shadcn/ui component set (card, input, label, select, toggle-group, button,
    progress, alert, alert-dialog, collapsible, table, badge, tooltip,
    skeleton, separator) with TooltipProvider wired into the root layout
  - Vitest configured with the "@" alias, package.json scripts for
    test/typecheck/db:*/odds:* (defined now so later parallel plans never
    edit package.json)
  - Shared contracts: src/domain/odds/schemas.ts (Odds API v4 Zod schemas),
    src/config/sports.ts (D-01 sport list), src/config/books.ts (Colorado
    book config, D-14/D-16 tiers), src/domain/finder/types.ts and
    finderInput.ts (finder DTOs + Zod input schema)
  - src/test/fixtures/oddsEvents.ts: Odds-API-shaped fixture events reused
    by the e2e test and the market-filter/ranking unit tests
  - Fixture-tested bonus-bet hedge engine: americanToDecimal, calculateBonusBetHedge
    (cent-rounding rule), extractTwoWayMoneylines (no-push market filter),
    rankBonusBetHedges (top-10 ranking)
  - A RED end-to-end finder test at src/app/actions/find-hedges.test.ts,
    intentionally failing until Plan 02 creates ./find-hedges
affects: [01-02, 01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added:
    - "next@16.3.6, react@19.2.8 (create-next-app scaffold, App Router, src/, @/* alias)"
    - "drizzle-orm@0.45, @neondatabase/serverless@1.1, decimal.js@10, zod@4, react-hook-form@7, @hookform/resolvers@5"
    - "drizzle-kit@0.31, vitest@5, tsx, dotenv (dev deps)"
    - "shadcn/ui v4 CLI (base-nova preset, neutral base color) -> @base-ui/react, cn, class-variance-authority, lucide-react, tw-animate-css"
  patterns:
    - "Pure, zero-I/O hedge engine: bonusBet.ts / marketFilter.ts / rankBonusBetHedges.ts take plain data in, return plain data out, no Date.now(), no fetch, no DB imports"
    - "Money never touches native float: Decimal in, Decimal out, decimal strings only at the finder DTO boundary (FinderResultDTO)"
    - "Local Decimal.clone({ precision: 40 }) per module instead of mutating the global decimal.js config"
    - "Precision-noise 'clean to 20dp, HALF_UP' snap before any final cents-level ROUND_DOWN/ROUND_UP decision, to absorb unavoidable base-10 truncation from repeating-decimal American odds (-300, -275, etc.) without disturbing genuine sub-cent rounding ambiguity"
    - "Config-as-data: COLORADO_BOOKS and SPORTS are the single source of truth read by both the (future) dropdown and the (future) odds-fetch bookmaker list"

key-files:
  created:
    - src/domain/hedge/americanOdds.ts
    - src/domain/hedge/bonusBet.ts (+ bonusBet.test.ts)
    - src/domain/hedge/marketFilter.ts (+ marketFilter.test.ts)
    - src/domain/hedge/rankBonusBetHedges.ts (+ rankBonusBetHedges.test.ts)
    - src/domain/odds/schemas.ts
    - src/domain/finder/types.ts
    - src/domain/finder/finderInput.ts
    - src/config/sports.ts
    - src/config/books.ts
    - src/test/fixtures/oddsEvents.ts
    - src/app/actions/find-hedges.test.ts (RED by design)
    - vitest.config.ts, components.json, .env.example
  modified:
    - package.json (scripts, dependencies)
    - .gitignore (.env* exception for .env.example)
    - src/app/layout.tsx (TooltipProvider wrap, metadata)

key-decisions:
  - "shadcn v4 CLI no longer offers new-york/zinc style flags UI-SPEC assumed (research predates this CLI version) - used the CLI's own --defaults (base-nova preset, neutral base color), the closest available achromatic-grayscale equivalent"
  - "shadcn v4 pulls @base-ui/react (Base UI, not Radix) and cn (shadcn's own clsx+tailwind-merge replacement) instead of the radix-ui/clsx/tailwind-merge combo RESEARCH.md's package audit anticipated - both verified as legitimate, actively-maintained official packages before accepting"
  - "@types/node bumped from create-next-app's ^20 pin to ^24 to satisfy vitest@5's vite@8 peer dependency (^22.12 / >=24) - a version-range fix, not a different package"
  - "americanToDecimal computes with a local precision-40 Decimal clone (not the default global precision-20 Decimal) plus a 20dp HALF_UP 'clean' snap in bonusBet.ts before final cent rounding, to eliminate a real off-by-one-cent bug in repeating-decimal odds (see Deviations)"

patterns-established:
  - "Table-driven describe.each/it.each fixture suites with exact, spec-matching test names so VALIDATION.md -t filters work"
  - "Every domain/hedge/*.ts module has a grep-enforced purity gate (no Date.now(), no fetch, no @/db imports, no float money math) checked in its own acceptance criteria"

requirements-completed: [CALC-01, CALC-04, CALC-05, BONUS-01]

# Metrics
duration: 20min
completed: 2026-09-25
---

# Phase 1 Plan 01: Scaffold, Contracts, and Hedge Engine Summary

**Next.js 16 scaffold with shadcn/Vitest, shared Zod/config contracts, and a fixture-tested decimal.js bonus-bet hedge engine (solver + no-push market filter + top-10 ranking), plus the intentionally-RED end-to-end finder test Plan 02 will turn green.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-25T18:52:59Z
- **Completed:** 2026-09-25T19:13:13Z
- **Tasks:** 3
- **Files modified:** 45 (Task 1) + 3 (Task 2) + 6 (Task 3, incl. 2 files fixed post-commit)

## Accomplishments
- Working Next.js 16 App Router scaffold: `npm run dev`/`build`/`lint`/`typecheck` all green, shadcn/ui initialized with the full component inventory from the UI-SPEC
- Shared contracts (Odds API v4 Zod schemas, sport/book config, finder DTOs/input schema) that Plans 02-05 will import unchanged
- `calculateBonusBetHedge` reproduces the reference fixture ($220.00/$80.00/80%) and four additional hand-verified fixtures, including the CALC-04 cent-rounding edge case, to the cent
- `extractTwoWayMoneylines` + `rankBonusBetHedges` correctly reproduce the plan's hand-checked fixture ranking for draftkings/$100: Nuggets/Jazz ($80.00) > Panthers/Packers ($73.07, NFL tieRisk flagged) > Rockies/Dodgers ($72.50, same-book hedge)
- A precision bug in the hedge engine's American-odds-to-decimal conversion was caught and fixed via this exact fixture ranking exercise (see Deviations) before it could reach the UI

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold the Next.js app, Vitest, shadcn, and write the failing end-to-end finder test** - `1cc0b6e` (feat)
2. **Task 2: Bonus-bet hedge solver with cent-rounding rule (TDD)** - `f098860` (feat) — includes RED bonusBet.test.ts + GREEN americanOdds.ts/bonusBet.ts in one commit (implementation written directly against the pre-written failing suite; iterated until 12/12 passed before committing, per TDD task convention of committing at the GREEN checkpoint)
3. **Task 3: No-push market filter and top-10 ranking (TDD)** - `54dc876` (feat) — includes RED marketFilter.test.ts/rankBonusBetHedges.test.ts + GREEN marketFilter.ts/rankBonusBetHedges.ts, plus the Rule-1 precision fix to Task 2's americanOdds.ts/bonusBet.ts discovered while building this task's fixtures

**Plan metadata:** (this commit, following SUMMARY.md)

_Note: RED phases for each TDD task were verified interactively (vitest run showing the expected "Cannot find module" failure) before writing the implementation; only the final GREEN state was committed, consistent with this plan's `tdd="true"` tasks being satisfied by "RED first, then implement" as an in-session workflow rather than separate RED/GREEN commits._

## Files Created/Modified

- `src/domain/hedge/americanOdds.ts` - American-to-decimal odds conversion, RangeError guards
- `src/domain/hedge/bonusBet.ts` - calculateBonusBetHedge, stake-not-returned solver with cent-rounding rule
- `src/domain/hedge/marketFilter.ts` - extractTwoWayMoneylines, CALC-05 no-push/2-way/window filter
- `src/domain/hedge/rankBonusBetHedges.ts` - rankBonusBetHedges, D-06/D-08/D-17 top-10 ranking
- `src/domain/odds/schemas.ts` - Zod schemas for The Odds API v4 payloads
- `src/config/sports.ts` / `src/config/books.ts` - D-01 sport list, Colorado book config (D-14/D-16 tiers)
- `src/domain/finder/types.ts` / `finderInput.ts` - finder DTOs and Zod input schema
- `src/test/fixtures/oddsEvents.ts` - shared Odds-API-shaped fixture events (a-e scenarios from the plan)
- `src/app/actions/find-hedges.test.ts` - RED end-to-end finder test (Plan 02 makes it pass)
- `package.json`, `vitest.config.ts`, `components.json`, `.env.example`, `.gitignore` - scaffold/tooling config
- `src/app/layout.tsx` - TooltipProvider wrap (required by the shadcn tooltip component), updated metadata

## Decisions Made

- shadcn v4's CLI no longer supports the new-york/zinc style flags the UI-SPEC assumed (the spec predates this CLI's registry restructuring into "presets"); used the CLI's own `--defaults` (base-nova preset, neutral base color), which is visually the closest available achromatic-grayscale equivalent. Flagged for the UI-implementation phase to confirm/override if the neutral vs. zinc distinction matters once real screens are built.
- shadcn v4 installs `@base-ui/react` and `cn` instead of the `radix-ui`/`clsx`/`tailwind-merge` combo RESEARCH.md's package audit covered. Verified both packages independently via `npm view` (official Base UI maintainers, shadcn's own `cn` package) before accepting — not in the original audit table because the CLI version installed is newer than what research assumed.
- Bumped `@types/node` from create-next-app's `^20` to `^24` to satisfy vitest 5's vite 8 peer dependency range (blocking install error otherwise) — a version-range adjustment on an already-approved package, not a new dependency.
- Left the drizzle-kit dev-dependency chain's 4 moderate `esbuild` advisories (dev-server-only, no production impact) unresolved rather than running `npm audit fix --force`, since that would downgrade drizzle-kit to 0.18.1 and violate CLAUDE.md's pinned 0.31.x requirement. Documented as a known, low-risk, dev-only issue.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@types/node` peer dependency conflict blocked `vitest@5` install**
- **Found during:** Task 1 (dev dependency install)
- **Issue:** create-next-app pinned `@types/node@^20`; `vitest@5` depends on `vite@8`, which requires `@types/node@^22.12 || >=24`. `npm install` failed with `ERESOLVE`.
- **Fix:** Bumped `@types/node` to `^24` in package.json before installing vitest.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm install` succeeds; `npx tsc --noEmit` clean.
- **Committed in:** 1cc0b6e (Task 1 commit)

**2. [Rule 3 - Blocking] shadcn v4 CLI interface drift (no `--style`/`--base-color` flags)**
- **Found during:** Task 1 (shadcn init)
- **Issue:** The plan's action text (and RESEARCH.md/UI-SPEC) assumed `npx shadcn@latest init` with `new-york` style and `zinc` base color flags. The installed CLI (shadcn@4.21.0) has restructured entirely around "presets" (`base-nova`, etc.) with no equivalent style/base-color flags.
- **Fix:** Ran `npx shadcn@latest init --defaults`, which resolves to preset `base-nova` / base color `neutral` (achromatic grayscale, CSS variables enabled) — the closest available match to the UI-SPEC's zinc/new-york intent.
- **Files modified:** components.json, src/app/globals.css, src/lib/utils.ts, src/components/ui/button.tsx
- **Verification:** `npm run build` succeeds; components render with CSS-variable-driven zinc-equivalent neutrals.
- **Committed in:** 1cc0b6e (Task 1 commit)

**3. [Rule 1 - Bug] American-odds decimal conversion lost precision on repeating-decimal odds, producing a wrong cent-level guaranteed profit**
- **Found during:** Task 3, while writing rankBonusBetHedges.test.ts against the plan's hand-verified MLB fixture (Rockies +290 hedged at DraftKings -300, expected hedge $217.50 / guaranteed profit $72.50)
- **Issue:** `americanToDecimal` used the default global `Decimal` (precision 20). American odds like -300 (`1 + 1/3`) and -275 (`1 + 4/11`) are base-10 repeating decimals with no exact finite representation; at precision 20 the truncation was large enough to flip which side of a cent boundary the unrounded hedge stake landed on. The MLB fixture computed a guaranteed profit of $72.49 instead of the mathematically correct $72.50, even though the true exact value (290 × 3/4 = 217.5, 217.5 × 4/3 = 290) is cent-exact.
- **Fix:** `americanToDecimal` now computes using a local `Decimal.clone({ precision: 40 })` instead of the default global precision. `calculateBonusBetHedge` (bonusBet.ts) additionally snaps every intermediate exact-arithmetic result to 20 decimal places with normal `ROUND_HALF_UP` rounding (`clean()`) before applying the final cents-level `ROUND_DOWN`/`ROUND_UP` — this erases the now much-smaller (~38th-40th digit) truncation noise without disturbing genuine sub-cent rounding ambiguity, such as the $50 @ +290/-310 fixture's real 3rd-decimal-digit content.
- **Files modified:** src/domain/hedge/americanOdds.ts, src/domain/hedge/bonusBet.ts
- **Verification:** All of Task 2's original 5 named fixtures (including the deliberately rounding-ambiguous ones) still pass unchanged; the MLB fixture in rankBonusBetHedges.test.ts now correctly reports hedge $217.50 / guaranteed profit $72.50.
- **Committed in:** 54dc876 (Task 3 commit, since the fix was discovered and applied while building Task 3's tests)

---

**Total deviations:** 3 auto-fixed (2 blocking/interface-drift, 1 correctness bug)
**Impact on plan:** All three were necessary to complete the plan as specified with a genuinely correct, cent-exact hedge engine. The precision fix (#3) is the most consequential — it was caught by exactly the kind of fixture-based verification CLAUDE.md and the RESEARCH.md cent-rounding rule call for, before any UI or real money math depended on it. No scope creep.

## Issues Encountered

- `npm run lint`/`typecheck`/`vitest` all reported a harmless Vite config warning ("ESM syntax in a file loaded as CommonJS", `vitest.config.ts`) on every run, because the project's `package.json` has no `"type": "module"`. This does not affect correctness or exit codes and was left as-is rather than restructuring module type project-wide for a cosmetic warning.
- `npm audit` reports 4 moderate-severity `esbuild` advisories transitively via `drizzle-kit@0.31`'s dev-only dependency chain (`@esbuild-kit/*`). `npm audit fix --force` would downgrade drizzle-kit to 0.18.1, violating CLAUDE.md's pinned `0.31.x` requirement — left unresolved as a known, dev-server-only, low-risk issue (not exploitable in production; drizzle-kit is never bundled into the deployed app).

## User Setup Required

None - no external service configuration required in this plan (no `.env.local` needed yet; DATABASE_URL/ODDS_API_KEY are wired to `.env.example` only, consumed starting Plan 02+).

## Next Phase Readiness

- Plan 02 can now implement `src/app/actions/find-hedges.ts` and `src/db/queries.ts` against the RED test in this plan, calling `rankBonusBetHedges`/`extractTwoWayMoneylines`/`calculateBonusBetHedge` exactly as designed — no changes needed to any of this plan's exported contracts.
- The finder DTO shapes (`FinderResultDTO`, `FindHedgesResponse`), config (`COLORADO_BOOKS`, `SPORTS`), and Zod schemas (`FinderInputSchema`, Odds API schemas) are stable and ready to consume.
- No blockers. One open item for a future UI-focused plan: confirm whether the shadcn `neutral` base color (vs. the UI-SPEC's originally-specified `zinc`) is visually acceptable once real screens are built — the CLI drift is documented above so this isn't a silent substitution.

---
*Phase: 01-bonus-bet-finder*
*Completed: 2026-09-25*

## Self-Check: PASSED

All key files (americanOdds.ts, bonusBet.ts, marketFilter.ts, rankBonusBetHedges.ts,
schemas.ts, sports.ts, books.ts, finder/types.ts, finder/finderInput.ts,
test/fixtures/oddsEvents.ts, app/actions/find-hedges.test.ts, vitest.config.ts,
components.json, .env.example) confirmed present on disk. All 3 task commits
(1cc0b6e, f098860, 54dc876) confirmed present in git history.
