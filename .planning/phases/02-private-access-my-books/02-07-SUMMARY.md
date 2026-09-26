---
phase: 02-private-access-my-books
plan: 07
subsystem: auth
tags: [drizzle, postgres, neon-http, vitest, login-lockout, concurrency]

# Dependency graph
requires:
  - phase: 02-private-access-my-books (plan 02)
    provides: DB-backed login lockout columns (failed_login_attempts, locked_until) and lockout.ts constants/pure functions
provides:
  - "reserveLoginAttempt(userId, now): single atomic conditional UPDATE ... RETURNING id that reserves a login attempt before argon2 runs"
  - "login.ts reordered so a locked account can never reach verifyPassword, even under concurrent requests or a stale findUserByEmail snapshot"
  - "Statement-shape test proving the compiled SQL and bound params of reserveLoginAttempt"
  - "Concurrency test proving 20 parallel wrong-password login() calls yield exactly 5 verifies / 5 invalid_credentials / 15 locked"
affects: [phase-03-promo-scraping, any-future-auth-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reserve-before-verify: count a rate-limited action atomically in SQL before the expensive/security-sensitive operation runs, instead of read-then-write from JS"
    - "Statement-shape testing: compile a mocked drizzle SQL call with `new PgDialect().sqlToQuery(arg)` to assert exact WHERE/RETURNING clauses and bound params without a live DB"

key-files:
  created:
    - src/lib/auth/accounts.test.ts
  modified:
    - src/lib/auth/accounts.ts
    - src/app/actions/login.ts
    - src/app/actions/login.test.ts

key-decisions:
  - "reserveLoginAttempt's CASE arithmetic mirrors nextFailedLoginState exactly (5th counted attempt locks and resets to 0) so sequential behavior is byte-for-byte unchanged; only the concurrent case differs (bounded to MAX_FAILED_LOGIN_ATTEMPTS instead of unbounded)"
  - "recordFailedLogin deleted entirely rather than kept alongside reserveLoginAttempt -- there is now exactly one way to record a failed attempt, closing the lost-update path CR-01/T-02-G2 described"
  - "WR-02 (enumeration via distinct 'locked' status) and WR-03 (timing) intentionally left untouched per plan scope -- user-facing login copy and status shape are identical to before this plan"

requirements-completed: [DASH-04]

# Metrics
duration: 9min
completed: 2026-09-26
---

# Phase 2 Plan 07: Atomic Login Lockout (CR-01 Gap Closure) Summary

**Replaced the non-atomic read-verify-write login lockout with a single conditional `UPDATE ... WHERE (locked_until IS NULL OR locked_until <= now) RETURNING id` that reserves the attempt before argon2 ever runs, closing the concurrent-bypass gap found in 02-REVIEW.md CR-01.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-26T13:39:16-06:00 (prior commit) / work began ~13:40
- **Completed:** 2026-09-26T13:48:06-06:00
- **Tasks:** 2 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `reserveLoginAttempt(userId, now)` in `src/lib/auth/accounts.ts` reserves a login attempt in exactly one `getDb().execute()` call — the increment/lock-set arithmetic runs inside a SQL `CASE` under Postgres's row lock, never computed from a JS-read value. `recordFailedLogin` (the old SELECT-then-UPDATE) is deleted.
- `login.ts` now calls `reserveLoginAttempt(user.id, now)` before `verifyPassword`; a `false` result returns `{ status: "locked" }` immediately, without ever touching argon2 — including when the pre-fetched `findUserByEmail` snapshot said `lockedUntil: null` (stale-snapshot case, covered by a dedicated test).
- New concurrency test in `login.test.ts`: 20 parallel `login()` calls with a wrong password against one in-memory account row resolve to exactly `MAX_FAILED_LOGIN_ATTEMPTS` (5) `verifyPassword` calls, 5 `invalid_credentials`, 15 `locked`, and the row ends locked for `LOCKOUT_MINUTES` (15 min) — proving the gap-1 must-have from `02-VERIFICATION.md` holds under concurrency, not just sequentially.
- New statement-shape test suite for `reserveLoginAttempt` (`accounts.test.ts`) compiles the mocked drizzle SQL call via `new PgDialect().sqlToQuery(...)` and asserts: exactly one `execute` call, the `UPDATE ... WHERE id = ... AND (locked_until IS NULL OR locked_until <= ...) RETURNING id` shape, two `CASE WHEN failed_login_attempts + 1 >= ...` clauses, and the correct bound params (userId, now, now+15min, MAX_FAILED_LOGIN_ATTEMPTS).

## Task Commits

Each task was committed atomically:

1. **Task 1: Atomic reserveLoginAttempt in accounts.ts (replaces recordFailedLogin)** - `6f9a26c` (feat)
2. **Task 2: login.ts reserves before verifying + concurrency test proving the 5-attempt cap** - `8347c1e` (fix)

**Plan metadata:** (this commit, docs: complete plan)

_Both tasks were tdd="true"; per the plan's single continuous RED→GREEN action block per task, each task landed as one commit containing both the failing test and the implementation that makes it pass (verified RED before writing the fix in both cases — see TDD Gate Compliance below)._

## Files Created/Modified

- `src/lib/auth/accounts.ts` - `reserveLoginAttempt` added (single atomic UPDATE...RETURNING); `recordFailedLogin` deleted; unused `nextFailedLoginState` import dropped
- `src/lib/auth/accounts.test.ts` - New: statement-shape tests for `reserveLoginAttempt` (6 tests)
- `src/app/actions/login.ts` - Reordered to `reserveLoginAttempt` before `verifyPassword`; `isLockedOut`/`recordFailedLogin` imports removed
- `src/app/actions/login.test.ts` - Mocks updated from `recordFailedLogin` to `reserveLoginAttempt`; added stale-snapshot test and the 20-parallel concurrency test

## Decisions Made

- Kept `reserveLoginAttempt`'s lock semantics identical to `nextFailedLoginState` (5th counted failure locks and resets counter to 0) so sequential login behavior is unchanged — only concurrent behavior changes (now correctly bounded).
- Left `isLockedOut`/`nextFailedLoginState` exported from `lockout.ts` unchanged (still covered by `lockout.test.ts`, and `nextFailedLoginState`/`isLockedOut` are reused directly inside the new concurrency test's row-locked-UPDATE model).
- No schema change — reused the existing `users.failed_login_attempts` / `users.locked_until` columns, per plan scope.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' RED phases were confirmed failing against the pre-change code (`reserveLoginAttempt is not a function` for Task 1; `No "recordFailedLogin" export is defined` for Task 2, since the old login.ts still called it) before implementing the GREEN fix.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. No schema/migration change.

## TDD Gate Compliance

Both tasks used `tdd="true"` with a single continuous RED→GREEN action block (per the plan's own task structure, not the general two-commit RED/GREEN convention). For each task the RED test was run and confirmed failing before the implementation was written, then the GREEN implementation was verified passing, and both landed together in one commit per task (`feat` for Task 1, `fix` for Task 2). This matches the plan's `<action>` blocks, which specify one continuous RED-then-GREEN sequence ending in a single verify step per task, not two separate commits.

## Next Phase Readiness

- CR-01 (BLOCKER) from `02-REVIEW.md` is closed: the 5-attempt/15-minute lockout now holds under concurrent requests, evidenced by an automated 20-parallel test, not just a manual claim.
- Full suite (280/280), typecheck, and lint all pass with no regressions.
- `02-VERIFICATION.md` gap 1 ("After 5 consecutive failed attempts ... refused for 15 minutes") can be re-verified and marked resolved.
- CR-02 (redirect loop) and its related WR-01 remain open — tracked as a separate gap-closure plan, out of scope for 02-07.
- WR-02/WR-03 (enumeration via "locked" status/timing) remain explicitly out of scope per this plan's stated boundaries.

---
*Phase: 02-private-access-my-books*
*Completed: 2026-09-26*

## Self-Check: PASSED

All created/modified files found on disk; both task commits (`6f9a26c`, `8347c1e`) confirmed present in git log.
