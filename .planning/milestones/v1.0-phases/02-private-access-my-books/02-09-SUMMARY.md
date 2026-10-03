---
phase: 02-private-access-my-books
plan: 09
subsystem: ui
tags: [nextjs, next-link, navigation, gap-closure]

# Dependency graph
requires:
  - phase: 02-private-access-my-books
    provides: AppHeader (Plan 01/06), SettingsPage + getUsableUserBooks routing (Plan 08)
provides:
  - AppHeader "PromoProfit" wordmark as a next/link Link to "/", fixing every header-bearing page at once
  - Explicit "Back to PromoProfit" link on /settings above the Settings heading
  - "Back to PromoProfit" link inside the save-success Alert in SettingsBooksForm
  - src/app/settings-navigation.test.ts proving both the header link and the settings back link render server-side
  - 02-UI-SPEC.md amended to record the wordmark-is-now-a-link decision and the two new copywriting rows
affects: [phase-03-promo-scraping, phase-04-opportunities-feed]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Hard-coded literal href=\"/\" for all navigation-home links — no user-controlled redirect target introduced"]

key-files:
  created:
    - src/app/settings-navigation.test.ts
  modified:
    - src/components/AppHeader.tsx
    - src/app/settings/page.tsx
    - src/components/settings/SettingsBooksForm.tsx
    - .planning/phases/02-private-access-my-books/02-UI-SPEC.md

key-decisions:
  - "All hrefs added are the hard-coded literal \"/\" (no query-param or user-controlled redirect target), closing the open-redirect threat (T-02-G8) at the source rather than via sanitization"
  - "Wordmark link and the two back links carry no new data or auth exposure — requireUser() gating and the 02-08 usable-books gate on \"/\" are unaffected, so linking home cannot bypass onboarding (T-02-G10 accepted, no mitigation needed)"

patterns-established:
  - "Plain muted-text back-link idiom (Label-size, lucide ArrowLeft icon, min-h-10 tap target, no underline/accent styling) for secondary in-page navigation, reserving the single accent button for the primary CTA per UI-SPEC Color rule 7"

requirements-completed: [DASH-02]

# Metrics
duration: 12min
completed: 2026-09-26
---

# Phase 02 Plan 09: Settings Navigation Gap Closure Summary

**Header wordmark and /settings now link back to "/" via three additions (header Link, settings back-link, save-success Alert link), closing the owner-reported dead-end with a server-render test and an approved live click-through of all six verification steps.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-26T20:00:26Z (approx, following completion of 02-08-PLAN.md)
- **Completed:** 2026-09-26T20:12:00Z (approx, including owner checkpoint)
- **Tasks:** 3 completed (2 auto + 1 checkpoint)
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `AppHeader`'s "PromoProfit" wordmark is now a `next/link` `Link` to `/`, fixing navigation on every header-bearing page in one place (no more premise that "there is no other page to navigate home to")
- `/settings` shows an explicit "Back to PromoProfit" link (muted, ArrowLeft icon, min-h-10 tap target) above the "Settings" heading, discoverable even for users who don't know the wordmark is clickable
- A successful save in `SettingsBooksForm` now reads "Your books were updated. Back to PromoProfit", giving the user an obvious next step instead of a dead end
- New `src/app/settings-navigation.test.ts` proves via `renderToStaticMarkup` that the header anchor and the settings back-link both exist, both point to `/`, and the back-link precedes the `<h1>Settings</h1>` in document order
- `02-UI-SPEC.md` amended: the header wordmark bullet, the Settings page section, and the copywriting table now record the link (removing the now-false "plain text, not a link" premise)
- Owner completed the live click-through (steps 1-6: header link, settings back-link, save-success link, verifying the main page reflects a book change) and replied "approved"

## Task Commits

Each task was committed atomically (TDD RED → GREEN, then a plain feat commit):

1. **Task 1: Header wordmark link + Settings back link (with server-render test)**
   - `b95519e` (test) — add failing server-render test for settings navigation back links
   - `47d32a7` (feat) — header wordmark link + settings back link (DASH-02)
2. **Task 2: Back link in the save-success Alert + UI-SPEC amendment + full gates**
   - `fcf2550` (feat) — back link in save-success alert + UI-SPEC amendment (DASH-02)
3. **Task 3: Owner confirms Settings is no longer a dead end** — checkpoint, no code commit; owner replied "approved" after completing click-through steps 1-6 on the local dev server

_Note: Task 1 used `tdd="true"`; it has a RED (`test`) commit confirmed failing before the header/settings changes, followed by a GREEN (`feat`) commit that made all 4 behavior assertions pass._

## Files Created/Modified
- `src/components/AppHeader.tsx` - Wordmark span replaced with `<Link href="/">` (same `text-xl font-semibold` styling, no underline); component stays hook-free
- `src/app/settings/page.tsx` - Added a `Link href="/"` with an `ArrowLeft` icon and "Back to PromoProfit" text as the first child of the settings column, above the heading
- `src/components/settings/SettingsBooksForm.tsx` - Save-success `AlertDescription` now reads "Your books were updated." followed by an underlined `Link href="/"` reading "Back to PromoProfit", visible only while `saved` is true
- `src/app/settings-navigation.test.ts` (new) - Server-render test (no JSX, `React.createElement` + `renderToStaticMarkup`) asserting the header anchor, the settings back-link, their document order, and the total anchor count on `/settings`
- `.planning/phases/02-private-access-my-books/02-UI-SPEC.md` - Amended header wordmark bullet, added a Settings back-link bullet, extended the save-success bullet, added two copywriting table rows

## Decisions Made
- Chose the three-piece fix (header Link + explicit settings back-link + save-success link) over a single fix, since the header wordmark alone would still leave a first-time user unsure it's clickable, and the plan's D-11/D-12 idiom favors discoverable plain-text links over relying on implicit conventions
- Kept every added href as the literal string `"/"` — no dynamic or query-derived redirect target — closing the open-redirect threat (T-02-G8) by construction rather than by validation
- Left `/onboarding/books` header-less with no back link, per D-08: it's a gated one-time step and, after Plan 02-08, Continue is its only exit with no loop risk

## Deviations from Plan

None - plan executed exactly as written across both auto tasks. Full gates (`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`) were run in Task 2 as specified and all passed before the checkpoint.

## Issues Encountered

None. The RED test failed as expected before the GREEN commit; no debugging beyond the plan's specified `vi.mock` setup was required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

DASH-02 is now closed: `/settings` has two independent one-click routes back to the main page (header wordmark, explicit back-link) plus a third after a successful save, all covered by `src/app/settings-navigation.test.ts` and confirmed live by the owner. This was the last plan in Phase 2 (wave 2, depends_on 02-08). Phase 2 itself is not being marked complete here — re-verification runs next per the orchestrator's instructions.

---
*Phase: 02-private-access-my-books*
*Completed: 2026-09-26*
