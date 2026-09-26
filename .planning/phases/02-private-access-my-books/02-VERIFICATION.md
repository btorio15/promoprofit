---
phase: 02-private-access-my-books
verified: 2026-09-26T19:30:00Z
status: gaps_found
score: 11/13 must-haves verified
overrides_applied: 0
gaps:
  - truth: "After 5 consecutive failed attempts for an account, logins are refused for 15 minutes with 'Too many attempts — try again in a few minutes.'"
    status: failed
    reason: "Lockout is a non-atomic read-then-write (findUserByEmail -> verifyPassword -> recordFailedLogin's own SELECT+UPDATE). Confirmed in code (src/lib/auth/accounts.ts:159-176, src/app/actions/login.ts:40-54): nothing serializes concurrent requests for the same email, so N parallel login POSTs all read the pre-attempt state, all get a real argon2 verify, and the counter suffers lost updates. The 5-attempts/15-minute rule holds only for sequential attempts (which is all the test suite exercises — no concurrency test exists in login.test.ts or lockout.test.ts). Unpatched: no commit after the 02-REVIEW.md finding (CR-01, 2026-09-26) touches login.ts or accounts.ts."
    artifacts:
      - path: "src/app/actions/login.ts"
        issue: "Lines 40-54: read lockedUntil, verify password, then record failure — three unsynchronized steps, no row lock or atomic increment before verifyPassword runs"
      - path: "src/lib/auth/accounts.ts"
        issue: "recordFailedLogin (159-176) does its own SELECT then UPDATE with a JS-computed value — lost-update race under concurrency"
    missing:
      - "Atomic 'reserve attempt before verifying' UPDATE (e.g. the reserveLoginAttempt() fix proposed in 02-REVIEW.md CR-01) so concurrent requests for one account can't all pass the lock check simultaneously"
      - "A concurrency-level test (parallel login attempts against one account) proving the 5-attempt cap actually holds"
  - truth: "Books picked at onboarding persist across logout/login and scope the finder dropdown, hedge suggestions and arb legs; the user always has a working path to reach or fix their book selection"
    status: failed
    reason: "Confirmed dead-end: src/app/page.tsx redirects to /onboarding/books when usable-and-selected books are empty (bonusBooks.length === 0, i.e. getBonusBooks(new Set(userBookKeys))), but src/app/onboarding/books/page.tsx redirects back to / whenever the RAW saved key list is non-empty (existingKeys.length > 0), without checking usability. A user whose every saved book key later drops out of usableOddsBooks() (config change / lost API coverage — a scenario page.tsx's own comment says it exists to handle) gets / -> /onboarding/books -> / -> ... forever (ERR_TOO_MANY_REDIRECTS). The one other route that could rescue them, /settings, is also broken in the same state: SettingsBooksForm seeds `selected` from the unfiltered getUserBookKeys() result, BookPicker only renders checkboxes for usable books, so the stale key can never be unchecked and every saveBooks call fails SaveBooksInputSchema's allowlist refine ('Choose only books from the list.'). No route recovers a user in this state without direct DB intervention. Unpatched: no commit after 02-REVIEW.md (CR-02 / WR-01, 2026-09-26) touches page.tsx, onboarding/books/page.tsx, or settings/page.tsx."
    artifacts:
      - path: "src/app/page.tsx"
        issue: "Line 17-20: redirect predicate is usable-and-selected (getBonusBooks(new Set(userBookKeys)).length === 0)"
      - path: "src/app/onboarding/books/page.tsx"
        issue: "Line 23-26: redirect-back predicate is raw saved-key count (existingKeys.length > 0) — inconsistent with page.tsx, causing the loop"
      - path: "src/app/settings/page.tsx"
        issue: "Line 20: initialKeys passed to SettingsBooksForm unfiltered, so a stale key can never be cleared via the UI (WR-01), removing the only other escape route"
    missing:
      - "Same usable-books predicate on both / and /onboarding/books (e.g. onboarding checks getBonusBooks(new Set(existingKeys)).length > 0, not existingKeys.length > 0)"
      - "Settings seeds initialKeys filtered to keys that still exist in the usable-books list, so a stale key can be dropped via Save"
deferred: []
human_verification: []
---

# Phase 2: Private Access & My Books — Verification Report

**Phase Goal:** Only the owner and invited friends can access the app, each selects the books they actually have, and the bonus-bet finder's hedge suggestions only ever use those books
**User Story (from 02-06-PLAN.md, valid per `user-story.validate`):** As a member of the owner's private betting group, I want to join with an invite link, log in, and pick the Colorado sportsbooks I actually have, so that only our group can use the app and its shared odds credits, and the bonus-bet finder and Arbitrage tab only ever suggest bets at books I can actually place.
**Verified:** 2026-09-26
**Status:** gaps_found
**Re-verification:** No — initial verification

**Note on MVP-mode goal format:** ROADMAP.md's Phase 2 `Goal:` field is written in requirement-summary form, not the "As a … I want to … so that …." user-story format `mode: mvp` normally expects (`user-story.validate` returns `valid: false` for it). A valid, matching user story does exist in `02-06-PLAN.md`'s "## Phase Goal" section (validated `true` above) and was used to frame this report. This is a documentation-sync gap in ROADMAP.md, not a functional gap — flagged as informational only, not a blocker.

## User Flow Coverage

| Step | Expected | Evidence | Status |
|------|----------|----------|--------|
| Join with an invite link | Opening a valid invite link shows the join form; submitting creates exactly one account, starts a session, sends the user to /onboarding/books | `src/app/invite/[token]/page.tsx`, `src/lib/auth/accounts.ts` (`redeemInviteAndCreateUser` — single atomic multi-CTE `FOR UPDATE` statement; only INSERT INTO users in the codebase, confirmed via repo-wide grep) | VERIFIED |
| Log in | Email+password logs in; wrong/unknown shows one generic message; only invited accounts exist | `src/app/actions/login.ts`, `src/proxy.ts` (redirects every path except `/login` and `/invite/*` when no session cookie) | VERIFIED (see gap: 5-attempt lockout bypassable under concurrency) |
| Pick the books I have | "Pick your books" step lists the 7 usable books, nothing pre-ticked, persists to `user_books` | `src/app/onboarding/books/page.tsx`, `src/components/settings/BookPicker.tsx`, `src/app/actions/save-books.ts`, `src/db/queries.ts` (`getUserBookKeys`/`saveUserBooks`) | VERIFIED for the normal case; FAILED for the stale/unusable-book edge case (see gap) |
| Outcome: only our group can use the app and its credits | No signup route exists; every credit-spending action requires a session | `find -type d src/app` shows only `/`, `/invite/[token]`, `/login`, `/onboarding/books`, `/settings`; `refresh-odds.ts`/`refresh-spreads-totals.ts` call `requireUser()` first (per 02-03-SUMMARY.md and code) | VERIFIED |
| Outcome: finder/Arbitrage only suggest bets at books I can actually place | `findHedges`/`findArbs` scope both legs (and the arb "Multiple books" tie list) to the session user's `user_books` | `src/app/actions/find-hedges.ts:88,98-99,114`, `src/app/actions/find-arbs.ts:95,105,110,120` — `requireUser()` is the first statement in both, before Zod parsing; `getUserBookKeys`/`getBonusBooks`/`getHedgeBookKeys` scope every downstream call | VERIFIED |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Only invited users can log in through an invite-only login page; there is no public signup path (ROADMAP SC1 / DASH-04) | VERIFIED | No signup route in `src/app`; `redeemInviteAndCreateUser` is the sole `INSERT INTO users`, gated on an unexpired, unused invite via `FOR UPDATE` CTE; `src/proxy.ts` redirects every path except `/login`, `/invite/*` when no session cookie present |
| 2 | Logged-out visitor to any page other than /login or /invite/<token> is redirected to /login | VERIFIED | `src/proxy.ts` presence-only cookie check + `requireUser()` as first statement of every protected page/action (`src/app/page.tsx:12`, `onboarding/books/page.tsx:21`, `settings/page.tsx:18`, `find-hedges.ts:88`, `find-arbs.ts:95`, `refresh-odds.ts`, `refresh-spreads-totals.ts`) |
| 3 | A user can log in with case-insensitive email + password; wrong password/unknown email show the identical generic message | VERIFIED | `login.ts:40-53`; emails stored lowercased/trimmed per `authInput.ts`; `verifyAgainstDummyHash` equalizes the unknown-email path; both return `invalid_credentials` |
| 4 | After 5 consecutive failed attempts, logins are refused for 15 minutes, counter survives cold starts | **FAILED** | Counter is DB-backed (survives cold starts) but the read-check-write sequence across `login.ts` + `accounts.ts` is non-atomic — bypassable by concurrent requests (CR-01, unpatched). See gap. |
| 5 | Reused/expired/made-up invite link always shows "This invite is no longer valid", same message for every reason | VERIFIED | `redeem-invite.ts` / `InviteForm.tsx` return a single `invite_invalid` branch for all three cases; `redeemInviteAndCreateUser`'s CTE returns zero rows for any of the three, mapped to one status |
| 6 | Redeeming the same invite twice (even concurrently) creates at most one account | VERIFIED | Single atomic multi-CTE statement with `FOR UPDATE` on the invite row (`accounts.ts:59-82`); covered by `redeem-invite.test.ts` |
| 7 | The owner can reset a forgotten password via `npm run password:reset -- <email>` | VERIFIED | `scripts/password-reset.ts`, `setPasswordByEmail` (clears lockout columns too) |
| 8 | User can select which Colorado sportsbooks they have on a persistent settings screen; selection remembered across sessions (ROADMAP SC2 / DASH-02) | VERIFIED for the steady-state case; **FAILED** for the stale-book edge case | `getUserBookKeys`/`saveUserBooks` round-trip correctly (covered by `queries.test.ts`, `save-books.test.ts`); but see gap — when a saved book key drops out of the usable list, Settings can never save again and onboarding/`/` loop forever |
| 9 | Settings reachable from header account menu, shows "Signed in as {displayName} ({email})" | VERIFIED | `AccountMenu.tsx:40` routes to `/settings`; `settings/page.tsx:30` renders the exact copy |
| 10 | Saving books never spends Odds API credits or re-fetches odds | VERIFIED | `saveUserBooks` (queries.ts) is a pure `db.batch` delete/insert against `user_books`; no odds-fetch import in `save-books.ts` |
| 11 | Bonus-bet finder hedge suggestions only surface user-selected books (ROADMAP SC3 / BONUS-02) | VERIFIED | `find-hedges.ts:88,98-99,114` — `requireUser()` first, `getUserBookKeys` → `getBonusBooks`/`getHedgeBookKeys` scope both bonus and hedge legs; rejected out-of-selection bookKey returns a field error |
| 12 | Arbitrage tab rows only appear when both legs are at the user's books; "Multiple books" popover lists only the user's tied books | VERIFIED | `find-arbs.ts:95,105,110,120` — same `requireUser()` + `getUserBookKeys`/`getHedgeBookKeys` scoping feeds `buildMarkets`/`rankArbs`'s `allowedBookKeys`/`tiedBookKeys` |
| 13 | User sees a brief account-risk advisory near hedge results (ROADMAP SC4 / CALC-06) | VERIFIED | `src/components/RiskAdvisory.tsx` is a single shared component rendered by both `FinderForm.tsx:239` (after a search) and `ArbForm.tsx:280` |

**Score:** 11/13 truths verified (2 failed — both correspond to unresolved CRITICAL findings in `02-REVIEW.md`)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | users/invites/userBooks tables, creditUsage.triggeredByUserId | VERIFIED | Present; migration `drizzle/0003_daffy_paper_doll.sql` applied to live Neon (`npm run db:check` shows Users: 1, Invites: 2, User books: 6) |
| `src/lib/session.ts` | iron-session helpers | VERIFIED | `getSessionUser`/`requireUser`/`startSession`/`endSession` present, used throughout |
| `src/proxy.ts` | network-boundary redirect | VERIFIED | Exists, matcher excludes static assets, cookie-presence check |
| `src/app/actions/login.ts` | login action with lockout | ORPHANED LOGIC — present but the lockout mechanic is broken under concurrency (see gap 1) |
| `src/db/queries.ts` | getUserBookKeys/saveUserBooks/getBonusBooks/getHedgeBookKeys | VERIFIED | All four exported and exercised by `queries.test.ts` |
| `src/app/actions/save-books.ts` | saveBooks action | VERIFIED for valid selections; FAILS unconditionally for a user with any stale saved key (see gap 2) |
| `src/components/settings/BookPicker.tsx` | shared 7-row checkbox list | VERIFIED | Used by both `OnboardingBooksForm` and `SettingsBooksForm` |
| `src/app/actions/find-hedges.ts` / `find-arbs.ts` | session-scoped search | VERIFIED | `requireUser()` first, book-set scoping confirmed by direct code read |
| `src/components/finder/EmptyState.tsx` / `arb/ArbEmptyState.tsx` | no-books-covered variant | VERIFIED | "No games at your books right now" + "Manage your books" link to `/settings`, wired via `booksExcludedAll` in both `ResultsList.tsx` and `ArbResultsList.tsx` |
| `.planning/phases/02-private-access-my-books/02-VALIDATION.md` | filled per-task verification map, nyquist_compliant: true | VERIFIED | Frontmatter has `nyquist_compliant: true`, `status: complete`, all rows green, owner approval recorded 2026-09-26 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/app/page.tsx` | `src/lib/session.ts requireUser` | first statement of `Home()` | WIRED | `const user = await requireUser();` is line 12 |
| `src/app/actions/refresh-odds.ts` | `requireUser` | before any lock/gate/credit call | WIRED | Confirmed per 02-03-SUMMARY.md and file inspection |
| `src/app/actions/save-books.ts` | `saveUserBooks(user.userId, ...)` | userId from `requireUser()` only | WIRED | No client-supplied userId field in `SaveBooksInputSchema` |
| `src/app/actions/find-hedges.ts` | `getHedgeBookKeys(userBookSet)` | session user's `user_books` set | WIRED | Line 114, after `requireUser()`/`getUserBookKeys` |
| `src/app/actions/find-arbs.ts` | `getHedgeBookKeys(userBookSet)` → `rankArbs tiedBookKeys` | same pattern | WIRED | Lines 105-120 |
| `src/app/page.tsx` | `src/app/onboarding/books/page.tsx` | redirect when `bonusBooks.length === 0` | **NOT WIRED CORRECTLY** | Round-trip is inconsistent with onboarding's own redirect-back predicate — produces an infinite loop for the stale-book case (CR-02) |
| `src/components/AccountMenu.tsx` | `/settings` | Settings menu item | WIRED | `router.push("/settings")` |
| `src/components/finder/FinderForm.tsx` / `ArbForm.tsx` | `RiskAdvisory` | shared component import | WIRED | Rendered in both after/near results |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `src/app/page.tsx` | `bonusBooks` | `getBonusBooks(new Set(userBookKeys))` reading live `user_books` + `books` config | Yes | FLOWING |
| `src/app/actions/find-hedges.ts` | `hedgeBookKeys` | `getHedgeBookKeys(userBookSet)` from live `user_books` row for `user.userId` | Yes | FLOWING |
| `src/app/settings/page.tsx` | `initialKeys` | `getUserBookKeys(user.userId)` — raw, unfiltered by usability | Yes (real data), but stale entries are unrecoverable via UI | FLOWING, with the WR-01 defect noted above |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npm test` | `Test Files 26 passed (26)` / `Tests 272 passed (272)` | PASS |
| Typecheck passes | `npm run typecheck` | exit 0, no output | PASS |
| Lint passes | `npm run lint` | exit 0, no output | PASS |
| Production build succeeds | `npm run build` | Compiled successfully; all 5 app routes built (`/`, `/invite/[token]`, `/login`, `/onboarding/books`, `/settings`) | PASS |
| Live DB schema/seed check | `npm run db:check` | 7 bonus books, 13 seeded book rows, Users: 1, Invites: 2, User books: 6 — matches SUMMARY claims | PASS |
| Only one `INSERT INTO users` path exists | `grep -rn "insert(users)\|INSERT INTO users" src` | Single hit: `src/lib/auth/accounts.ts:66` (inside `redeemInviteAndCreateUser`) | PASS |
| No debt markers in phase-touched files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across all 67 files listed in `02-REVIEW.md` | No matches | PASS |
| Concurrent-login race exists (spot-check of CR-01 claim) | Manual code read of `login.ts`/`accounts.ts`; no concurrency test present in `login.test.ts`/`lockout.test.ts` | Confirmed non-atomic read-then-write; no test covers it | FAIL (confirms gap, not a regression I introduced) |
| Redirect-loop precondition exists (spot-check of CR-02 claim) | Manual code read of `page.tsx` (`bonusBooks.length === 0`) vs `onboarding/books/page.tsx` (`existingKeys.length > 0`) | Predicates provably inconsistent | FAIL (confirms gap) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files exist in the repo, and neither PLAN nor SUMMARY nor VALIDATION for this phase reference a probe-based verification scheme. Verification instead relied on the automated suite (`npm test`), `db:check`, `typecheck`, `lint`, and `build`, all re-run directly by this verifier (not taken from SUMMARY claims).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| DASH-04 | 02-01, 02-02, 02-03, 02-06 | Only invited users (owner + friends) can log in; no public signup | SATISFIED, with a caveat | Invite-only account creation and route gating are solid; the specific "5 failed attempts → 15 min lock" sub-behavior is bypassable under concurrency (CR-01) |
| DASH-02 | 02-04, 02-06 | User can select which CO sportsbooks they have; selection persists | SATISFIED for the steady-state case, BLOCKED for the stale-book edge case | `user_books` round-trip works and is tested; the recovery path for a user whose saved books lose usability is broken end-to-end (CR-02, WR-01) |
| BONUS-02 | 02-04, 02-05, 02-06 | Bonus-bet finder hedge suggestions only use user-selected books | SATISFIED | `find-hedges.ts`/`find-arbs.ts` scope every leg to the session user's `user_books`; verified directly in code, not just via SUMMARY claim |
| CALC-06 | 02-03, 02-06 | User sees an account-risk advisory near hedge results | SATISFIED | Single shared `RiskAdvisory.tsx`, rendered on both Finder and Arbitrage tabs |

No orphaned requirements: REQUIREMENTS.md's "Requirement → Phase" table maps all four IDs to Phase 2 and marks all four "Complete," matching exactly the four IDs declared across the phase's plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/actions/login.ts` + `src/lib/auth/accounts.ts` | 40-54 / 159-176 | Non-atomic read-then-write (TOCTOU) on the lockout counter | 🛑 Blocker | Defeats the brute-force lockout control under concurrent requests (CR-01, unpatched since review) |
| `src/app/page.tsx` + `src/app/onboarding/books/page.tsx` | 17-20 / 23-26 | Inconsistent redirect predicates (filtered-usable vs. raw-saved) between two pages that redirect to each other | 🛑 Blocker | Infinite redirect loop with no self-service recovery for a user whose saved books all lose usability (CR-02, unpatched since review) |
| `src/app/settings/page.tsx` / `SettingsBooksForm.tsx` | 20 / 34,44 | `initialKeys` seeded unfiltered while `BookPicker` only renders usable-book rows | ⚠️ Warning | Same root cause as the blocker above (WR-01) — Settings can never save for an affected user |
| `src/app/actions/login.ts` / `LoginForm.tsx` | 40-48 / 46-48 | `{ status: "locked" }` is a distinct, only-real-account outcome | ⚠️ Warning | Account enumeration via lockout state + timing (WR-02/WR-03) — not a new finding from this verification pass, carried from 02-REVIEW.md |
| `src/lib/session.ts` | 61-84 | No `session_version`/revocation check | ⚠️ Warning | Password reset doesn't invalidate existing sessions (WR-04) — carried from 02-REVIEW.md, not independently re-derived here but confirmed present (no session_version column in schema.ts) |

No TBD/FIXME/XXX markers found in any of the 67 files the code review touched — the debt-marker gate is clean.

### Human Verification Required

None. All four ROADMAP success criteria and the plan-level must-haves were checked directly against source and by re-running the automated suite/build/lint/typecheck/db:check myself (not taken from SUMMARY.md's claims). The owner's 02-06 walkthrough already covered the user-facing UX (invite bootstrap, book selection, logout/login persistence, shared advisory) and nothing additional needs human eyes — the two remaining issues (concurrent-login race, stale-book redirect loop) are code-level defects that are conclusively demonstrable by static/code-path analysis, not matters of taste or visual judgment.

### Gaps Summary

The phase delivers the steady-state version of all four ROADMAP success criteria correctly and the 272/272 suite, typecheck, lint, and production build all pass on re-run (not just per SUMMARY claim). Requirements DASH-04, DASH-02, BONUS-02, and CALC-06 are each substantively implemented and wired, and BONUS-02 in particular (the phase's most safety-critical scoping requirement — hedge suggestions must never point a user at a book they don't have) is solid: `requireUser()` gates both `findHedges`/`findArbs` before any parsing, and every downstream book-key set is derived from the session user's `user_books` row, confirmed by direct code read rather than trusting the SUMMARY narrative.

However, `02-REVIEW.md` (dated the same day as this verification) found two CRITICAL, unresolved defects, and git history confirms no commit since the review touches the affected files:

1. **CR-01 — login lockout is bypassable by concurrent requests.** The specific must-have declared in `02-02-PLAN.md` ("After 5 consecutive failed attempts... refused for 15 minutes... survives serverless cold starts") only holds for sequential attempts. This is a stated security control for a private, invite-gated app (CLAUDE.md: "Access: Private, small group") and it doesn't do what it claims under realistic concurrent-request conditions — no test in the suite exercises concurrency, which is exactly why 272/272 green didn't catch it.

2. **CR-02 — infinite redirect loop with no recovery path.** The must-have "Right after redeeming an invite... the user lands on 'Pick your books'" / "Books picked at onboarding persist... and scope the finder" assumes a working round-trip between `/` and `/onboarding/books`. That round-trip is provably broken for a foreseeable edge case (a saved book losing API/free-tier coverage — a scenario the code's own comments say it's designed to handle) and, compounded by WR-01, the only other escape hatch (`/settings`) is broken in the identical state. A user who lands in this state cannot use the app at all without direct database intervention by the owner.

Both failures are inside the phase's own declared scope (not deferred to a later ROADMAP phase — Phases 3-5 are exclusively about promo scraping, the opportunities feed, and group-added promos, none of which touch auth hardening or book-selection recovery). Given the small-and-trusted-but-real user base this app is built for, and that CLAUDE.md explicitly calls out "Correctness" as a project constraint, these are treated as BLOCKER gaps rather than accepted deviations. No override has been recorded for either finding.

**This looks like unfinished follow-up work, not an accepted design tradeoff.** If the team judges either finding an acceptable risk for v1 (e.g., "our friend group is 4 people, brute force isn't a real threat" or "the free-tier book list won't change before Phase 3"), add explicit overrides to this file's frontmatter with a name and timestamp, for example:

```yaml
overrides:
  - must_have: "After 5 consecutive failed attempts, logins are refused for 15 minutes"
    reason: "Small trusted friend group — concurrent brute force is not a realistic threat for v1; will harden before wider access"
    accepted_by: "{your name}"
    accepted_at: "{ISO timestamp}"
  - must_have: "Books picked at onboarding persist and the user always has a working recovery path"
    reason: "Book config is not expected to change before Phase 3; accepting the edge case for now, will fix alongside Phase 3 book-list work"
    accepted_by: "{your name}"
    accepted_at: "{ISO timestamp}"
```

Otherwise, route CR-01 and CR-02 (plus WR-01, same root cause as CR-02) through `/gsd:plan-phase --gaps` for a closure plan before advancing to Phase 3.

---

_Verified: 2026-09-26_
_Verifier: Claude (gsd-verifier)_
