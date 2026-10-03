---
phase: 02-private-access-my-books
reviewed: 2026-09-26T00:00:00Z
depth: standard
review_type: re-review (gap closure 02-07, 02-08, 02-09)
files_reviewed: 13
files_reviewed_list:
  - src/app/actions/login.test.ts
  - src/app/actions/login.ts
  - src/app/book-routing.test.ts
  - src/app/onboarding/books/page.tsx
  - src/app/page.tsx
  - src/app/settings-navigation.test.ts
  - src/app/settings/page.tsx
  - src/components/AppHeader.tsx
  - src/components/settings/SettingsBooksForm.tsx
  - src/db/queries.test.ts
  - src/db/queries.ts
  - src/lib/auth/accounts.test.ts
  - src/lib/auth/accounts.ts
findings:
  critical: 0
  warning: 7
  info: 6
  total: 13
status: issues_found
---

# Phase 02: Code Review Report (Re-review after gap closure)

**Reviewed:** 2026-09-26
**Depth:** standard
**Files Reviewed:** 13 (the files changed in `6f9a26c^..HEAD`)
**Status:** issues_found

## Summary

This re-review covers gap-closure plans 02-07 (CR-01, atomic lockout reservation), 02-08 (CR-02/WR-01, shared "usable saved books" predicate) and 02-09 (settings back-navigation).

- **CR-01 is resolved.** `reserveLoginAttempt` is one conditional `UPDATE ... WHERE (locked_until IS NULL OR locked_until <= $now) RETURNING id` statement. Postgres takes a row lock for it. Under READ COMMITTED, a queued concurrent UPDATE re-checks both the WHERE clause and the `SET` expressions against the newly committed row version, so the counter cannot lose updates. Once the 5th reservation writes `locked_until`, every queued request gets zero rows back.
  - Boundary traced from a zero counter: reservations 1-4 set the counter to 1-4 and return true. Reservation 5 sets `failed_login_attempts=0` and `locked_until=now+15m`, and still returns true, so its password is verified. If that 5th password is wrong, the response is `invalid_credentials` and the account is now locked. Reservation 6 and later return false (`locked`) without argon2 running.
  - A correct password on any reserved attempt, including the 5th, calls `clearFailedLogins`, which clears both columns.
  - At the expiry boundary, `<=` matches `isLockedOut`'s `>`.
  - `locked_until` is `timestamptz`, so the raw `Date` parameter serializes correctly.
  - Net effect: at most `MAX_FAILED_LOGIN_ATTEMPTS` argon2 verifications per lock window, even under parallel requests.
- **CR-02 and WR-01 are resolved.** `/`, `/onboarding/books` and `/settings` all use `getUsableUserBooks`, so there is no redirect loop. Settings seeds only usable keys, so Save can succeed. `find-hedges` and `find-arbs` still call `getUserBookKeys`, but they pass the result straight into `getBonusBooks(new Set(...))`, which is the same intersection, so that is correct.
- **02-09 links:** all new links use the hard-coded `href="/"`. No user-controlled redirect target exists, so there is no open redirect.

No new Critical issues. New findings:
- **WR-08:** the "atomic" concurrency test exercises a JS mock, not the SQL.
- **IN-05 / IN-06:** minor dead code, and a small concurrency subtlety.

Prior findings in files this round did not touch (WR-04 to WR-07, IN-01 to IN-04) are unchanged and still open. WR-02 and WR-03 are only partly addressed.

## Prior Findings Status

| ID | Title | Status |
|----|-------|--------|
| CR-01 | Lockout bypassable with concurrent requests | **RESOLVED** (02-07) |
| CR-02 | Redirect loop `/` <-> `/onboarding/books` | **RESOLVED** (02-08) |
| WR-01 | Settings can't save with stale saved key | **RESOLVED** (02-08) |
| WR-02 | Account enumeration via `locked` outcome | **STILL OPEN** |
| WR-03 | Timing gap between known and unknown email paths | **PARTIALLY RESOLVED** (2 extra round-trips reduced to 1) |
| WR-04 | No session revocation | **STILL OPEN** (files unchanged) |
| WR-05 | `user_books` FK vs. config allowlist drift | **STILL OPEN** (files unchanged) |
| WR-06 | Unauthenticated argon2 before invite validation | **STILL OPEN** (files unchanged) |
| WR-07 | proxy 307 replays server-action POSTs | **STILL OPEN** (files unchanged) |
| IN-01 | Lockout never escalates / anyone can lock anyone out | **STILL OPEN** |
| IN-02 | `password-reset` password on argv | **STILL OPEN** (files unchanged) |
| IN-03 | `findHedges.booksExcludedAll` weaker predicate | **STILL OPEN** (files unchanged) |
| IN-04 | Duplicate `SessionData`/`SessionUser` | **STILL OPEN** (files unchanged) |

## Resolved Findings

### CR-01 (RESOLVED): Login lockout bypassable with concurrent requests

**File:** `src/lib/auth/accounts.ts:172-180`, `src/app/actions/login.ts:47-50`
**Resolution:** `login` now calls `reserveLoginAttempt(user.id, now)` before `verifyPassword`, and returns `locked` when the reservation fails. The single-statement UPDATE is atomic, as the boundary trace in the Summary shows. `recordFailedLogin` has been removed. The stale `findUserByEmail` snapshot of `lockedUntil` no longer affects the decision.

### CR-02 (RESOLVED): Infinite redirect loop between `/` and `/onboarding/books`

**File:** `src/app/page.tsx:19-22`, `src/app/onboarding/books/page.tsx:24-27`, `src/db/queries.ts:63-66`
**Resolution:** Both pages now branch on `getUsableUserBooks(userId).length`, which is the same predicate, so they can never both redirect.

### WR-01 (RESOLVED): Settings form could never save with a stale key

**File:** `src/app/settings/page.tsx:30-31`
**Resolution:** `initialKeys` is now derived from `getUsableUserBooks`, so a stale key is never placed into `selected`. Any save replaces the whole row set through `saveUserBooks`, which also removes stale rows from the DB.

## Warnings

### WR-02 (STILL OPEN): Account enumeration via the distinct `locked` outcome

**File:** `src/app/actions/login.ts:47-50`
**Issue:** Only a real account can return `{ status: "locked" }`. After 5 wrong passwords, a known email starts returning "Too many attempts" while an unknown email returns `invalid_credentials` forever. The locked branch also skips argon2, so it responds noticeably faster than the unknown-email branch, which runs `verifyAgainstDummyHash`. The 02-07 change moved this branch but left the behavior unchanged.
**Fix:** One option is to call `await verifyAgainstDummyHash(password)` in the `!reserved` branch and return `invalid_credentials`, accepting the loss of the "locked" message. The other is to throttle by email hash in a table covering both known and unknown emails, so unknown emails also reach a `locked` state.

### WR-03 (PARTIALLY RESOLVED): Known-email path still costs one more DB round-trip than unknown-email path

**File:** `src/app/actions/login.ts:41-54`
**Issue:**
- An unknown email costs `findUserByEmail` plus one argon2 verify.
- A known email with a wrong password costs `findUserByEmail` plus `reserveLoginAttempt` (a neon-http HTTP round-trip, roughly 10-50 ms) plus one argon2 verify.

The gap dropped from two extra round-trips to one, but it is still a consistent difference that can be measured remotely and used to enumerate emails. The first unknown-email call also still pays the one-time dummy `hash()`.
**Fix:** Give the unknown-email branch a matching round-trip, for example a no-op `UPDATE users SET id = id WHERE false`, or a comparable `SELECT`. Alternatively, pad every failure response to a fixed minimum duration. Also warm the dummy hash at module load.

### WR-04 (STILL OPEN): No session revocation

**File:** `src/lib/session.ts:61-84`, `scripts/password-reset.ts:44-52`
**Issue:** Unchanged. The stateless 30-day cookie is never checked against the DB. A password reset or a user deletion does not invalidate existing sessions.
**Fix:** Add `users.session_version`, seal it into the session, check it in `requireUser`, and increment it in `setPasswordByEmail`.

### WR-05 (STILL OPEN): `user_books.book_key` FK vs. config allowlist

**File:** `src/db/schema.ts` (`userBooks.bookKey`), `src/app/actions/save-books.ts:35`
**Issue:** Unchanged. If a usable config book is missing from the `books` table, `saveUserBooks` throws an uncaught FK violation. This matters more now: `SettingsBooksForm.handleSave` (`src/components/settings/SettingsBooksForm.tsx:47-63`) has no try/catch inside `startTransition`, so the throw becomes an unhandled rejection or error boundary instead of the inline error.
**Fix:** Catch `23503` in `saveBooks` and return `{ status: "invalid", fieldErrors: { bookKeys: [...] } }`. Alternatively, drop the FK. Wrap the client call in try/catch and call `setError`.

### WR-06 (STILL OPEN): Unauthenticated argon2 hashing before invite validation

**File:** `src/app/actions/redeem-invite.ts:33-42`
**Fix:** Pre-check with `isInviteRedeemable(hashInviteToken(token), now)` before calling `hashPassword`.

### WR-07 (STILL OPEN): proxy redirect uses 307

**File:** `src/proxy.ts:22-24`
**Fix:** `NextResponse.redirect(new URL("/login", request.url), 303)`, or return 401 for non-GET requests.

### WR-08 (NEW): The CR-01 concurrency test exercises a JS mock, not the atomic SQL

**File:** `src/app/actions/login.test.ts:168-207`, `src/lib/auth/accounts.test.ts`
**Issue:** The test "20 parallel wrong-password attempts ... exactly 5 verifies" replaces `reserveLoginAttempt` with a synchronous JS closure built from `isLockedOut` and `nextFailedLoginState`. It therefore shows only that `login` calls reserve before verify. It proves nothing about whether the real statement is atomic, which is the actual CR-01 risk. `accounts.test.ts` only checks the compiled SQL text. Two consequences:
1. A regression that brings back a read-then-write, or that drops the `locked_until` guard from WHERE, could pass both suites. For example, a CASE that no longer resets the counter would still contain the substrings being checked.
2. The lock rule now exists twice, once as SQL CASE expressions in `accounts.ts` and once as `nextFailedLoginState` in `lockout.ts`. The test's model uses the JS version, so if the SQL and JS drift apart, no test fails.

**Fix:** Add a DB-backed integration test that runs against a Neon branch or local Postgres (it can be skipped when `DATABASE_URL` is unset). It should fire N concurrent `reserveLoginAttempt` calls and assert exactly 5 `true` results and a non-null `locked_until`. Alternatively, derive the SQL thresholds and the test model from a single source, and assert the exact compiled CASE and WHERE clauses rather than substrings.

## Info

### IN-01 (STILL OPEN): Lockout never escalates, and anyone can lock anyone out

**File:** `src/lib/auth/accounts.ts:176-177`
**Issue:** The SQL version keeps the reset-to-0 behavior: 5 guesses per 15 minutes indefinitely, about 480 per day per account. Anyone who knows a member's email can keep that member locked out permanently.
**Fix:** Use exponential backoff on consecutive locks, and log lock events.

### IN-02 (STILL OPEN): `password-reset` takes the temp password on argv and mis-parses flag order

**File:** `scripts/password-reset.ts:11-15`

### IN-03 (STILL OPEN): `findHedges.booksExcludedAll` uses a weaker predicate than `findArbs`

**File:** `src/app/actions/find-hedges.ts:175-186`

### IN-04 (STILL OPEN): `SessionData` and `SessionUser` are identical duplicate interfaces

**File:** `src/lib/session.ts:11-21`

### IN-05 (NEW): Production dead code left by the CR-01 refactor

**File:** `src/lib/auth/lockout.ts:10-30`, `src/lib/auth/accounts.ts:7-15,143-145`
**Issue:**
- `isLockedOut` and `nextFailedLoginState` no longer have any production callers; only tests import them. They still read as the source of truth for the lockout rule, but the real rule now lives in the SQL in `reserveLoginAttempt`.
- `findUserByEmail` still selects `failedLoginAttempts` and `lockedUntil` into `UserRecord`, and `login` never reads them. That invites a future caller to trust the stale snapshot again, which is exactly what 02-07 removed.

**Fix:** Delete the two helpers, or mark them test-only models. Drop the two lockout columns from `findUserByEmail` and `UserRecord`.

### IN-06 (NEW): Unconditional `clearFailedLogins` erases concurrent attacker reservations and locks

**File:** `src/lib/auth/accounts.ts:181-184`, `src/app/actions/login.ts:56`
**Issue:** `clearFailedLogins` sets `failed_login_attempts=0` and `locked_until=NULL` without any condition. Suppose the legitimate owner logs in successfully while an attacker's parallel attempts are in flight. The owner's clear can land after the attacker's 5th reservation has set the lock, which wipes the lock and gives the attacker a new budget of 5. This is a low-impact race, because the attacker needs the real user to log in during the attack. It is worth knowing about, since the atomicity guarantee documented in `accounts.ts:158-171` does not cover it.
**Fix:** This is acceptable as designed for a small private group. If it needs tightening, only clear the counter when the row is not locked by a later reservation, for example by tracking `last_reservation_at`, or accept the race and document it.

---

_Reviewed: 2026-09-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
