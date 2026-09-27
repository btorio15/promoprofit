---
phase: 02-private-access-my-books
verified: 2026-09-26T20:30:00Z
status: passed
score: 13/13 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/13
  gaps_closed:
    - "After 5 consecutive failed attempts for an account, logins are refused for 15 minutes (CR-01 — concurrency bypass)"
    - "Books picked at onboarding persist and the user always has a working path to reach or fix their book selection (CR-02 / WR-01 — redirect loop / stale settings keys)"
  gaps_remaining: []
  regressions: []
deferred: []
human_verification: []
---

# Phase 2: Private Access & My Books Verification Report (Re-verification)

**Phase Goal:** Only the owner and invited friends can access the app, each selects the books they actually have, and the bonus-bet finder's hedge suggestions only ever use those books
**User Story (from 02-06-PLAN.md):** As a member of the owner's private betting group, I want to join with an invite link, log in, and pick the Colorado sportsbooks I actually have, so that only our group can use the app and its shared odds credits, and the bonus-bet finder and Arbitrage tab only ever suggest bets at books I can actually place.
**Verified:** 2026-09-26
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 02-07, 02-08, 02-09)

## What Changed Since the Previous Verification

The previous verification (2026-09-26, `gaps_found`, 11/13) found two BLOCKER-level defects in `02-REVIEW.md` (CR-01, CR-02+WR-01). Three gap-closure plans executed since then:

- **02-07** — replaced the non-atomic read-verify-write lockout with `reserveLoginAttempt`, a single conditional `UPDATE ... WHERE (locked_until IS NULL OR locked_until <= now) RETURNING id` called before `verifyPassword` ever runs.
- **02-08** — added `getUsableUserBooks(userId)` as the single "usable saved books" predicate and switched `/`, `/onboarding/books`, and `/settings` to it, so the redirect conditions between `/` and `/onboarding/books` are provably complementary and Settings can never seed an unclearable stale key.
- **02-09** — (owner-reported, not in the original gap list) made the header wordmark and Settings page link back to `/`, closing a dead-end the owner found during the 02-06 walkthrough; owner approved a live click-through.

This re-verification does not trust the SUMMARY.md narratives for these three plans — every claim below was checked directly against the current source tree, or by re-running the commands myself.

## Re-Check of Previously Failed Truths

### Truth 4 (was FAILED): "After 5 consecutive failed attempts, logins are refused for 15 minutes, counter survives cold starts"

**Now: VERIFIED.**

- `src/lib/auth/accounts.ts:167-178` — `reserveLoginAttempt(userId, now)` is a single `db.execute()` call containing one `UPDATE users SET ... WHERE id = $userId AND (locked_until IS NULL OR locked_until <= $now) RETURNING id`. The increment/lock-set logic is expressed as SQL `CASE` expressions evaluated by Postgres against the row it just locked for the UPDATE — there is no JS-computed intermediate value and no separate read step. `recordFailedLogin` (the old SELECT-then-UPDATE) no longer exists in the file (confirmed via full-file read).
- `src/app/actions/login.ts:47-50` — `login()` calls `reserveLoginAttempt(user.id, now)` immediately after `findUserByEmail`, and returns `{ status: "locked" }` on `false` *before* `verifyPassword` is ever reached. The stale `findUserByEmail` snapshot's `lockedUntil` field is never read for the lock decision.
- Postgres takes a row lock for the duration of an `UPDATE` statement; under READ COMMITTED a second concurrent `UPDATE` on the same row blocks until the first commits, then re-evaluates its own `WHERE`/`CASE` clauses against the newly committed row. A single-statement conditional UPDATE like this is a standard, sound atomic-counter pattern — this is not merely "well tested," it is provably atomic from the SQL shape itself.
- `git log` confirms two real commits closing this: `6f9a26c` (feat: atomic reserveLoginAttempt) and `8347c1e` (fix: login reserves before verifying).
- Caveat (non-blocking, tracked as `02-REVIEW.md` WR-08): the new "20 parallel logins" test in `login.test.ts` mocks `reserveLoginAttempt` with a synchronous JS closure, so it proves `login()` calls reserve-before-verify but does not itself exercise real Postgres concurrency. This is a test-quality gap, not a code gap — the atomicity guarantee comes from the single-statement SQL shape I read directly, not from that test. `02-REVIEW.md` (re-review, dated same day) independently reaches the same conclusion and marks CR-01 RESOLVED with 0 criticals remaining.

### Truth 8 (was FAILED): "Books picked at onboarding persist across logout/login and scope the finder dropdown, hedge suggestions and arb legs; the user always has a working path to reach or fix their book selection"

**Now: VERIFIED.**

- `src/db/queries.ts:63-66` — `getUsableUserBooks(userId)` composes `getUserBookKeys` (raw saved keys) with `getBonusBooks(new Set(savedKeys))` (usable-books filter), returning the intersection in config order. This is the *only* place the intersection logic is defined.
- `src/app/page.tsx:19-22` — `Home()` redirects to `/onboarding/books` when `(await getUsableUserBooks(user.userId)).length === 0`.
- `src/app/onboarding/books/page.tsx:24-27` — redirects back to `/` when `(await getUsableUserBooks(user.userId)).length > 0`.
- These two predicates are now the literal same function call with complementary `=== 0` / `> 0` conditions — a redirect loop is structurally impossible (previously `/` used the filtered/usable count while `/onboarding/books` used the raw saved-key count, which is what caused the loop).
- `src/app/settings/page.tsx:30-31` — `initialKeys` is now derived from `getUsableUserBooks(user.userId)`, not the raw `getUserBookKeys`, so a stale (no-longer-usable) saved key is never seeded into the form's `selected` set and can never block `Save changes` again.
- `src/app/book-routing.test.ts` (new, 143 lines) is a table-driven test over empty/stale-only/mixed saved-book states for all three pages, plus a spy asserting none of the three pages call `getUserBookKeys` directly anymore (only `getUsableUserBooks`). Read directly — it is a real behavioral test, not a stub.
- Additionally (owner-reported, addressed by 02-09, not part of the original CR-02/WR-01 gap but reinforcing this same truth): `src/components/AppHeader.tsx` wordmark is now a `next/link` `Link` to `/`, and `/settings` has an explicit "Back to PromoProfit" link above the heading and inside the save-success alert (`src/app/settings/page.tsx:38-44`, `src/components/settings/SettingsBooksForm.tsx:88-95`). `src/app/settings-navigation.test.ts` (read directly) proves via `renderToStaticMarkup` that both links exist, point to `/`, and the back-link precedes the `<h1>Settings</h1>`. The owner completed a live click-through and replied "approved" (documented in 02-09-SUMMARY.md; this was a `checkpoint:human-verify` gate that already executed and resolved during the plan, not a deferred item for this verification).
- `git log` confirms real commits: `eb54a2e`/`cee63e3` (getUsableUserBooks + routing switch), `47d32a7`/`fcf2550` (nav links).

## Full Must-Haves Re-Check (all 13 truths)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Only invited users can log in through an invite-only login page; no public signup path (ROADMAP SC1 / DASH-04) | VERIFIED | `grep -rn "insert(users)\|INSERT INTO users" src` → single hit, `src/lib/auth/accounts.ts:66` inside `redeemInviteAndCreateUser`'s atomic `FOR UPDATE` CTE. No signup route in `src/app`. Unchanged since prior verification. |
| 2 | Logged-out visitor to any page other than /login or /invite/<token> is redirected to /login | VERIFIED | `src/proxy.ts` cookie-presence check + `requireUser()` as first statement of every protected page/action. Unchanged. |
| 3 | Case-insensitive email login; wrong password/unknown email show identical generic message | VERIFIED | `login.ts:41-45` — unknown email path runs `verifyAgainstDummyHash` and returns `invalid_credentials`; wrong-password path (line 52-55) returns the same status. Unchanged. |
| 4 | After 5 consecutive failed attempts, logins refused for 15 minutes, counter survives cold starts | **VERIFIED (was FAILED)** | See "Re-Check of Previously Failed Truths" above — atomic `reserveLoginAttempt`, called before `verifyPassword`, confirmed by direct code read + `git log` + independent `02-REVIEW.md` re-review (CR-01 RESOLVED, 0 criticals). |
| 5 | Reused/expired/made-up invite link always shows "This invite is no longer valid" | VERIFIED | Unchanged; not touched by gap-closure plans. |
| 6 | Redeeming the same invite twice (even concurrently) creates at most one account | VERIFIED | Unchanged; `redeemInviteAndCreateUser`'s `FOR UPDATE` CTE untouched by this round. |
| 7 | Owner can reset a forgotten password via `npm run password:reset -- <email>` | VERIFIED | Unchanged; `scripts/password-reset.ts` not modified by 02-07/08/09. |
| 8 | User can select CO sportsbooks on a persistent settings screen; selection remembered; user always has a working recovery path (ROADMAP SC2 / DASH-02) | **VERIFIED (was FAILED)** | See "Re-Check" above — `getUsableUserBooks` shared predicate across `/`, `/onboarding/books`, `/settings`; loop structurally impossible; stale keys droppable via Save; plus new discoverable back-navigation. |
| 9 | Settings reachable from header account menu, shows "Signed in as {displayName} ({email})" | VERIFIED | `src/components/AccountMenu.tsx` (read directly, unchanged except surrounding header link) routes to `/settings`; `settings/page.tsx:47-49` renders exact copy. |
| 10 | Saving books never spends Odds API credits or re-fetches odds | VERIFIED | `saveUserBooks` (queries.ts:77-86) is a pure `db.batch` delete/insert; no odds-fetch import in `save-books.ts`. Unchanged. |
| 11 | Bonus-bet finder hedge suggestions only surface user-selected books (ROADMAP SC3 / BONUS-02) | VERIFIED | `find-hedges.ts:88,98-99,114` — `requireUser()` first, `getUserBookKeys` → `getBonusBooks`/`getHedgeBookKeys` scope both legs. Re-confirmed by direct grep this pass; unchanged by gap-closure plans. |
| 12 | Arbitrage tab rows only appear when both legs are at the user's books; "Multiple books" popover lists only the user's tied books | VERIFIED | `find-arbs.ts:95,105,109-110` — same `requireUser()` + book-key scoping. Re-confirmed by direct grep this pass. |
| 13 | User sees a brief account-risk advisory near hedge results (ROADMAP SC4 / CALC-06) | VERIFIED | `RiskAdvisory.tsx` rendered by both `FinderForm.tsx:239` and `ArbForm.tsx:280`. Re-confirmed by direct grep this pass. |

**Score:** 13/13 truths verified (both prior failures closed; no regressions in the other 11)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/auth/accounts.ts` | atomic `reserveLoginAttempt`, `recordFailedLogin` removed | VERIFIED | Full-file read; single-statement conditional UPDATE, no dead read-then-write path remains |
| `src/app/actions/login.ts` | reserve-before-verify ordering | VERIFIED | `reserveLoginAttempt` called at line 47, `verifyPassword` at line 52 — correct order, confirmed by direct read and by `login.test.ts`'s `invocationCallOrder` assertion |
| `src/db/queries.ts` | `getUsableUserBooks` shared predicate | VERIFIED | Present, composes existing functions, used by all 3 pages |
| `src/app/page.tsx`, `src/app/onboarding/books/page.tsx`, `src/app/settings/page.tsx` | consistent usable-books predicate | VERIFIED | All three call `getUsableUserBooks`; none call `getUserBookKeys` directly (confirmed by `book-routing.test.ts`'s spy and by direct grep) |
| `src/components/AppHeader.tsx` | wordmark links to `/` | VERIFIED | `<Link href="/">` present, confirmed by direct read and `settings-navigation.test.ts` |
| `src/app/book-routing.test.ts`, `src/app/settings-navigation.test.ts`, `src/lib/auth/accounts.test.ts`, `login.test.ts` (concurrency case) | new tests proving the fixes | VERIFIED (substantive) | All four files read directly; real assertions against real behavior, not stubs. One caveat noted (WR-08: concurrency test uses a JS model, not a live-DB integration test) — non-blocking, documented above. |
| `.planning/phases/02-private-access-my-books/02-REVIEW.md` | updated re-review confirming CR-01/CR-02/WR-01 resolved | VERIFIED | `findings: {critical: 0, warning: 7, info: 6}`, `status: issues_found` (warnings/info only, no criticals) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/app/actions/login.ts` | `reserveLoginAttempt` | called before `verifyPassword` | WIRED | Line order confirmed; `login.test.ts` asserts call order explicitly |
| `src/app/page.tsx` | `src/app/onboarding/books/page.tsx` | `getUsableUserBooks` complementary predicate | WIRED (was NOT WIRED CORRECTLY) | Both pages call the identical function with `=== 0` / `> 0` conditions — no longer independently maintained conditions |
| `src/app/settings/page.tsx` | `SettingsBooksForm` | `initialKeys` from `getUsableUserBooks` | WIRED | Stale keys excluded at the source; Save can no longer be unconditionally blocked |
| `src/components/AppHeader.tsx` / `src/app/settings/page.tsx` | `/` | `next/link` `Link href="/"` | WIRED | Three independent links now exist (header, settings top, save-success alert); confirmed by `settings-navigation.test.ts`'s "at least 2 anchors" assertion and direct source read |
| `src/app/actions/find-hedges.ts` / `find-arbs.ts` | `getHedgeBookKeys(userBookSet)` | session user's `user_books` | WIRED | Unchanged, re-confirmed this pass |

### Behavioral Spot-Checks (re-run by this verifier, not taken from SUMMARY claims)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npm test` | `Test Files 29 passed (29)` / `Tests 294 passed (294)` | PASS |
| Typecheck passes | `npm run typecheck` | exit 0, no output | PASS |
| Lint passes | `npm run lint` | exit 0, no output | PASS |
| Production build succeeds | `npm run build` | Compiled successfully; all 5 app routes built (`/`, `/invite/[token]`, `/login`, `/onboarding/books`, `/settings`) | PASS |
| Live DB schema/data check | `npm run db:check` | 7 bonus books, 13 seeded book rows, Users: 1, Invites: 2, User books: 6 | PASS |
| Only one `INSERT INTO users` path exists | `grep -rn "insert(users)\|INSERT INTO users" src` | Single hit: `src/lib/auth/accounts.ts:66` | PASS |
| No debt markers in phase-touched files | `grep -nE "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across the 13 files in `02-REVIEW.md`'s `files_reviewed_list` | No matches | PASS |
| reserveLoginAttempt is a single atomic statement (spot-check of CR-01 fix) | Direct read of `src/lib/auth/accounts.ts:167-178` | One `db.execute()` call, one `UPDATE ... RETURNING`, no read-then-write | PASS |
| `/`, `/onboarding/books`, `/settings` all use the same predicate (spot-check of CR-02/WR-01 fix) | Direct read of all three page files | All three call `getUsableUserBooks`; none call `getUserBookKeys` directly | PASS |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` files exist in the repo, and neither PLAN nor SUMMARY nor VALIDATION for this phase reference a probe-based verification scheme. Same as prior verification.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| DASH-04 | 02-01, 02-02, 02-03, 02-06, 02-07 | Only invited users (owner + friends) can log in; no public signup | SATISFIED (was: satisfied with caveat) | Invite-only account creation and route gating solid (unchanged); the concurrency-bypass caveat from the prior verification is now closed by 02-07's atomic `reserveLoginAttempt` |
| DASH-02 | 02-04, 02-06, 02-08, 02-09 | User can select which CO sportsbooks they have; selection persists | SATISFIED (was: blocked for stale-book edge case) | `getUsableUserBooks` closes the stale-key dead-end; discoverable back-navigation added by 02-09 |
| BONUS-02 | 02-04, 02-05, 02-06 | Bonus-bet finder hedge suggestions only use user-selected books | SATISFIED | Unchanged; re-confirmed this pass |
| CALC-06 | 02-03, 02-06 | User sees an account-risk advisory near hedge results | SATISFIED | Unchanged; re-confirmed this pass |

No orphaned requirements: REQUIREMENTS.md's "Requirement → Phase" table maps all four IDs to Phase 2 and marks all four "Complete," matching the four IDs declared across the phase's plan frontmatter (including the gap-closure plans' `requirements-completed` fields: `[DASH-04]` for 02-07, `[DASH-02]` for 02-08 and 02-09).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/actions/login.test.ts` | 168-207 | CR-01 concurrency test mocks `reserveLoginAttempt` with a JS closure, not a live-DB integration test | ⚠️ Warning (`02-REVIEW.md` WR-08) | Doesn't itself prove real-Postgres atomicity (that comes from the single-statement SQL shape, verified separately by direct code read); a future regression that reintroduces read-then-write inside `reserveLoginAttempt` while keeping its function signature could pass this test |
| `src/app/actions/login.ts` | 47-50 | `{ status: "locked" }` remains a distinct, only-real-account outcome | ⚠️ Warning (`02-REVIEW.md` WR-02, carried forward) | Account enumeration via lockout state + timing — pre-existing, not introduced or worsened by gap-closure plans |
| `src/lib/session.ts` | 61-84 | No `session_version`/revocation check | ⚠️ Warning (`02-REVIEW.md` WR-04, carried forward) | Password reset doesn't invalidate existing sessions — pre-existing, unchanged by this round |
| `src/lib/auth/lockout.ts` | 10-30 | `isLockedOut`/`nextFailedLoginState` have no production callers after the CR-01 refactor | ℹ️ Info (`02-REVIEW.md` IN-05, new) | Dead code risk (a future caller could trust a stale snapshot again) — cosmetic, not a functional gap |
| `src/lib/auth/accounts.ts` | 181-184 | `clearFailedLogins` is unconditional (no guard against a concurrent attacker's later lock) | ℹ️ Info (`02-REVIEW.md` IN-06, new) | Low-impact race requiring the real user to log in during an active attack — accepted as designed for a small private group per the review |

No TBD/FIXME/XXX markers found in the 13 phase-touched files. All items above are Warning/Info severity per the independent `02-REVIEW.md` re-review (0 Critical), and none contradicts any of the phase's 13 observable truths or its 4 requirement IDs — they are hardening opportunities beyond the phase's declared scope, not gaps in what Phase 2 promised.

### Human Verification Required

None. All 13 truths and all 4 requirement IDs were checked directly against source (not taken from SUMMARY.md claims), and the automated suite/typecheck/lint/build/db-check were all re-run by this verifier with matching results. The one owner-facing UI change since the last verification (02-09's navigation links) already went through its own `checkpoint:human-verify` gate during execution — the owner completed the live click-through and replied "approved," which is documented in `02-09-SUMMARY.md` and does not need to be re-surfaced here. The remaining open findings (WR-02 through WR-08, IN-01 through IN-06) are code-level hardening items outside this phase's declared must-haves, independently triaged as non-blocking by `02-REVIEW.md`.

### Gaps Summary

Both BLOCKER gaps from the previous verification are closed and independently confirmed by direct code inspection in this pass, not by trusting SUMMARY.md narratives:

1. **CR-01 (was BLOCKER, now RESOLVED)** — `reserveLoginAttempt` is a single atomic conditional `UPDATE ... RETURNING`, called before `verifyPassword`, with the old non-atomic `recordFailedLogin` deleted. The 5-attempt/15-minute lockout now holds under concurrent requests by construction (a single SQL statement's row-lock semantics), not merely by a sequential test.

2. **CR-02 / WR-01 (was BLOCKER, now RESOLVED)** — `getUsableUserBooks` is now the single predicate all three routes (`/`, `/onboarding/books`, `/settings`) use, so the redirect loop is structurally impossible and a stale saved book key can always be cleared via Settings. An additional owner-reported dead-end (no way back from Settings to the main page) was also closed via 02-09, with an owner-approved live click-through.

The independent `02-REVIEW.md` re-review (dated the same day, reviewing exactly the files these three plans touched) reaches the same conclusion: 0 Critical findings remain, 7 Warnings and 6 Info items remain (some pre-existing, two new from the refactor itself), none of which block the phase goal or any of the four requirement IDs (DASH-04, DASH-02, BONUS-02, CALC-06).

The full automated suite grew from 272 to 294 tests (22 new tests across the three gap-closure plans) and all pass on a fresh re-run by this verifier, alongside clean typecheck, lint, build, and a live `db:check` against the real Neon database. No regressions were found in any of the 11 previously-passing truths.

**Phase 2 goal is achieved: only the owner and invited friends can access the app (with a lockout that now genuinely holds under concurrency), each selects the books they actually have (with no dead-end for any saved-books state, and a discoverable way back to the main app from Settings), and the bonus-bet finder's and Arbitrage tab's hedge suggestions only ever use those books.** Ready to proceed to Phase 3.

---

_Verified: 2026-09-26_
_Verifier: Claude (gsd-verifier)_
