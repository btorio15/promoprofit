---
phase: 02-private-access-my-books
reviewed: 2026-09-26T00:00:00Z
depth: standard
files_reviewed: 67
files_reviewed_list:
  - .env.example
  - drizzle/0003_daffy_paper_doll.sql
  - package.json
  - scripts/db-check.ts
  - scripts/invite-create.ts
  - scripts/password-reset.ts
  - src/app/actions/find-arbs.test.ts
  - src/app/actions/find-arbs.ts
  - src/app/actions/find-hedges.test.ts
  - src/app/actions/find-hedges.ts
  - src/app/actions/login.test.ts
  - src/app/actions/login.ts
  - src/app/actions/logout.ts
  - src/app/actions/redeem-invite.test.ts
  - src/app/actions/redeem-invite.ts
  - src/app/actions/refresh-odds.test.ts
  - src/app/actions/refresh-odds.ts
  - src/app/actions/refresh-spreads-totals.test.ts
  - src/app/actions/refresh-spreads-totals.ts
  - src/app/actions/save-books.test.ts
  - src/app/actions/save-books.ts
  - src/app/invite/[token]/page.tsx
  - src/app/login/page.tsx
  - src/app/onboarding/books/page.tsx
  - src/app/page.tsx
  - src/app/settings/page.tsx
  - src/components/AccountMenu.tsx
  - src/components/AppHeader.tsx
  - src/components/AppShell.tsx
  - src/components/arb/ArbEmptyState.tsx
  - src/components/arb/ArbForm.tsx
  - src/components/arb/ArbResultsList.tsx
  - src/components/auth/InviteForm.tsx
  - src/components/auth/LoginForm.tsx
  - src/components/finder/EmptyState.tsx
  - src/components/finder/FinderForm.tsx
  - src/components/finder/oddsAge.test.ts
  - src/components/finder/oddsAge.ts
  - src/components/finder/OddsStatusBar.tsx
  - src/components/finder/ResultsList.tsx
  - src/components/RiskAdvisory.tsx
  - src/components/settings/BookPicker.tsx
  - src/components/settings/OnboardingBooksForm.tsx
  - src/components/settings/SettingsBooksForm.tsx
  - src/components/ui/dropdown-menu.tsx
  - src/db/queries.test.ts
  - src/db/queries.ts
  - src/db/schema.ts
  - src/domain/arb/types.ts
  - src/domain/auth/authInput.ts
  - src/domain/books/bookSelection.ts
  - src/domain/finder/types.ts
  - src/ingestion/odds/refresh.ts
  - src/ingestion/odds/refreshExtended.test.ts
  - src/ingestion/odds/refreshExtended.ts
  - src/ingestion/odds/status.test.ts
  - src/ingestion/odds/status.ts
  - src/ingestion/odds/store.ts
  - src/lib/auth/accounts.ts
  - src/lib/auth/inviteToken.test.ts
  - src/lib/auth/inviteToken.ts
  - src/lib/auth/lockout.test.ts
  - src/lib/auth/lockout.ts
  - src/lib/auth/password.ts
  - src/lib/session.test.ts
  - src/lib/session.ts
  - src/lib/sessionCookie.ts
  - src/proxy.ts
findings:
  critical: 2
  warning: 7
  info: 4
  total: 13
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-26
**Depth:** standard
**Files Reviewed:** 67
**Status:** issues_found

## Summary

Reviewed the Phase 2 auth layer (iron-session, argon2, invite redemption, login lockout, proxy.ts) and per-user book scoping.

Parts that held up:
- Every credit-spending action (`refreshOdds`, `refreshSpreadsTotals`) and every data action (`findHedges`, `findArbs`, `saveBooks`) calls `requireUser()` first. Each takes `userId` only from the session and never from input.
- The session secret is checked for length and loaded lazily.
- The invite CTE is single-use under concurrency. It uses `FOR UPDATE` plus a READ COMMITTED re-check of `used_at IS NULL`.
- Invite tokens have 256 bits of entropy and only their hash is stored.

Defects found:
- **Lockout can be bypassed.** The login lockout is a non-atomic read-then-write, so parallel requests get around it.
- **Redirect loop.** The "book lost API coverage" recovery path that the code says it handles actually loops between `/` and `/onboarding/books`.
- **Settings save always fails.** In the same case, the Settings form can never save.
- **Account enumeration.** Unknown and known emails can still be told apart, through the `locked` status and through timing.
- **No session revocation.** A password reset does not log out existing sessions.

## Critical Issues

### CR-01: Login lockout is bypassable with concurrent requests (non-atomic read-modify-write)

**File:** `src/app/actions/login.ts:46-53`, `src/lib/auth/accounts.ts:159-173`
**Issue:** Each login attempt does three separate steps with nothing tying them together:
1. Reads `lockedUntil` through `findUserByEmail`.
2. Runs argon2 `verifyPassword`.
3. Calls `recordFailedLogin`, which runs its own `SELECT failed_login_attempts` and then an `UPDATE` with a value computed in JS.

With neon-http there is no transaction around these steps. An attacker who sends N login POSTs in parallel for one email sees every request read `lockedUntil = null` and `failed_login_attempts = k`, so every request gets a real password verification. Every `recordFailedLogin` then writes `k+1`, so lost updates mean the counter barely moves. The "5 attempts, then 15-minute lock" rule (T-02-09) therefore limits nothing for a parallel attacker: guesses per window are bounded only by server concurrency, not by `MAX_FAILED_LOGIN_ATTEMPTS`. Even with an atomic increment, requests that pass the lock check before the lock is written still get verified. The attempt has to be reserved atomically before verifying.
**Fix:** Reserve the attempt atomically before calling `verifyPassword`, and refuse when the reservation fails:
```ts
// accounts.ts
export async function reserveLoginAttempt(userId: number, now: Date): Promise<boolean> {
  const lockUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60_000);
  const rows = await getDb().execute<{ id: number }>(sql`
    UPDATE users SET
      failed_login_attempts = CASE WHEN failed_login_attempts + 1 >= ${MAX_FAILED_LOGIN_ATTEMPTS} THEN 0 ELSE failed_login_attempts + 1 END,
      locked_until = CASE WHEN failed_login_attempts + 1 >= ${MAX_FAILED_LOGIN_ATTEMPTS} THEN ${lockUntil} ELSE locked_until END
    WHERE id = ${userId} AND (locked_until IS NULL OR locked_until <= ${now})
    RETURNING id`);
  return rows.rows.length > 0;   // false => locked
}
// login.ts: if (!(await reserveLoginAttempt(user.id, now))) return locked-ish response;
//           verify; on success clearFailedLogins(user.id)
```
This counts the attempt before verifying, and the row lock serializes concurrent reservations. On success the counter is cleared.

### CR-02: Infinite redirect loop between `/` and `/onboarding/books` when a user's saved books are no longer usable

**File:** `src/app/page.tsx:17-21`, `src/app/onboarding/books/page.tsx:23-26`
**Issue:** `/` redirects to onboarding when `usable ∩ savedKeys` is empty. The comment at `page.tsx:14-16` says this is meant to cover "a user whose only books later lost API coverage". `/onboarding/books`, however, checks the *raw* saved keys (`existingKeys.length > 0`) and redirects back to `/`. For a user whose saved rows all point at books that are no longer free-tier or covered, the result is `/` -> `/onboarding/books` -> `/` -> ... (ERR_TOO_MANY_REDIRECTS). The app becomes completely unusable for that user, and they can only get out by typing `/settings` by hand. Even `/settings` is broken for them (see WR-01).
**Fix:** Use the same predicate on both pages:
```ts
// onboarding/books/page.tsx
const existingKeys = await getUserBookKeys(user.userId);
const usableSaved = await getBonusBooks(new Set(existingKeys));
if (usableSaved.length > 0) redirect("/");
```
Alternatively, have `getUserBookKeys` filter to usable keys for every caller.

## Warnings

### WR-01: Settings form can never save when the user has a stale (no-longer-usable) saved book key

**File:** `src/app/settings/page.tsx:20`, `src/components/settings/SettingsBooksForm.tsx:34,44`, `src/domain/books/bookSelection.ts:22-24`
**Issue:** `initialKeys` is the raw `user_books` list and seeds `selected`, but `BookPicker` only renders rows for `getBonusBooks()` (usable books). A stale key therefore stays in `selected` with no checkbox to clear it. Every `saveBooks` call then sends that key and fails `SaveBooksInputSchema`'s allowlist refine with "Choose only books from the list.", so the user cannot change their books at all. The same root cause as CR-02 means the escape route is broken too.
**Fix:** Intersect before seeding: `initialKeys={initialKeys.filter((k) => books.some((b) => b.key === k))}` in `settings/page.tsx`. Better still, make `getUserBookKeys` return only usable keys.

### WR-02: Account enumeration via the distinct `locked` outcome

**File:** `src/app/actions/login.ts:40-48`, `src/components/auth/LoginForm.tsx:46-48`
**Issue:** T-02-10 says unknown and known emails must be indistinguishable. However, only a real account can ever return `{ status: "locked" }`. Five wrong passwords against any email show whether an account exists: a real account switches to "Too many attempts", while an unknown email stays "Incorrect email or password" forever. The locked branch also skips argon2 entirely, so it is also distinguishable by timing.
**Fix:** Give unknown emails the same lockout outcome. One option is a small `login_throttle(email_hash, attempts, locked_until)` table used for both known and unknown emails. The other is to return `invalid_credentials` for locked accounts and still run `verifyAgainstDummyHash` in the locked branch, which gives up the "locked" UX message.

### WR-03: Timing equalization is defeated by the extra DB round-trips on the known-email path

**File:** `src/app/actions/login.ts:40-54`, `src/lib/auth/accounts.ts:159-173`
**Issue:** The unknown-email path costs one argon2 verify. The known-email, wrong-password path costs one argon2 verify plus `recordFailedLogin`, which is a SELECT and an UPDATE, each a separate neon-http HTTP round-trip (tens of ms). That difference is large and consistent enough to measure remotely, which brings back the email enumeration that `verifyAgainstDummyHash` is meant to prevent. The first unknown-email call also pays for a one-time `hash()` of the dummy password.
**Fix:** Collapse failure recording into one atomic statement (see CR-01), and give the unknown-email path a matching dummy write or an equivalent fixed delay. Alternatively, pad all failure responses to a minimum wall-clock duration. Warm the dummy hash at module load.

### WR-04: No session revocation — password reset (or user deletion) doesn't invalidate existing sessions

**File:** `src/lib/session.ts:61-84`, `scripts/password-reset.ts:44-52`
**Issue:** The iron-session cookies are stateless, last 30 days, and are never checked against the DB. `requireUser()` trusts `userId` blindly. After an owner resets a compromised account's password, the attacker's existing cookie stays valid for up to 30 days. Deleting a user row also doesn't stop that user: `requireUser` still succeeds, `getUserBookKeys` returns `[]`, the user is sent to onboarding, and `saveBooks` then throws an unhandled FK violation (500).
**Fix:** Add `users.session_version integer not null default 0` and seal it into the session. In `requireUser`, `SELECT session_version FROM users WHERE id = $1` and reject (redirect to `/login`) when the row is missing or the version doesn't match. Increment it in `setPasswordByEmail`.

### WR-05: `user_books.book_key` FK references the DB `books` mirror, but validation uses the config list

**File:** `drizzle/0003_daffy_paper_doll.sql` (user_books FK), `src/db/schema.ts` (`userBooks.bookKey.references(() => books.key)`), `src/app/actions/save-books.ts:35`
**Issue:** `SaveBooksInputSchema` allows any `usableOddsBooks()` key from `src/config/books.ts`. `queries.ts` states that config, not the DB `books` table, is the source of truth, and that the two can drift "when the config changes without a re-seed". If a usable config book hasn't been seeded, `saveUserBooks` throws a Postgres FK violation that `saveBooks` doesn't catch, so the user gets an opaque server-action error instead of a field error.
**Fix:** Either drop the FK and rely on the allowlist, or catch error code `23503` in `saveBooks` and return `{ status: "invalid", fieldErrors: { bookKeys: ["..."] } }`. Also make `db:check` assert that every usable config key exists in `books`.

### WR-06: Unauthenticated argon2 hashing before invite validation (cheap CPU/memory DoS)

**File:** `src/app/actions/redeem-invite.ts:33-42`
**Issue:** `hashPassword(password)` (Argon2id, 19 MiB) runs before any check that the token is valid. Anyone can call the `redeemInvite` server action with a garbage token and a 128-char password and force a full argon2 hash on every request. No user or invite is needed, and there is no lockout on this path.
**Fix:** Call `isInviteRedeemable(hashInviteToken(token), now)` first and return `invite_invalid` early. The atomic CTE still guards the race. Only then hash the password.

### WR-07: proxy redirect uses 307, which replays unauthenticated server-action POSTs against `/login`

**File:** `src/proxy.ts:22-24`
**Issue:** `NextResponse.redirect` defaults to 307, which keeps the method and body. An unauthenticated POST (a server-action call carrying a `Next-Action` header) to `/` is redirected to `/login` as a POST and executes there, because actions are identified by header, not path. `requireUser()` still gates the protected actions, so this is not an auth bypass. It does mean the proxy doesn't block server-action traffic as its comment implies, and it gives confusing results (an RSC redirect payload instead of a clean 303).
**Fix:** `return NextResponse.redirect(new URL("/login", request.url), 303);` or, for non-GET requests, return 401 directly.

## Info

### IN-01: Lockout never escalates — sustained 5 guesses / 15 min indefinitely, and any user can be locked out by anyone

**File:** `src/lib/auth/lockout.ts:23-32`
**Issue:** The counter resets to 0 when the lock is applied, allowing about 480 guesses per day per account forever. Anyone who knows a member's email can also keep that member permanently locked out. This is acceptable for a small private app, but it should be documented.
**Fix:** Consider exponential backoff (for example, double `LOCKOUT_MINUTES` on each consecutive lock) and log lock events.

### IN-02: `password-reset` accepts the temp password on argv and mis-parses flag order

**File:** `scripts/password-reset.ts:11-15`
**Issue:** `--password <temp>` leaves the password in shell history and `ps` output. Running `npm run password:reset -- --password X user@x.com` treats `--password` as the email.
**Fix:** Take the email as the first non-flag argument, and read an explicit password from stdin or a prompt instead of argv.

### IN-03: `findHedges.booksExcludedAll` uses a weaker predicate than `findArbs`

**File:** `src/app/actions/find-hedges.ts:175-186`
**Issue:** `findArbs` re-ranks at the full book set. `findHedges` only checks that markets *exist* at every usable book, and it ignores `maxHedgeStake` and the bonus-book constraint. It could therefore show "Add more books" even when adding books would not surface a result.
**Fix:** Re-run `rankForSportKeys` with `hedgeBookKeys` set to every usable book and check `.length > 0`, as `findArbs` does.

### IN-04: `SessionData` and `SessionUser` are identical duplicate interfaces

**File:** `src/lib/session.ts:11-21`
**Issue:** The two interfaces are identical, so they can drift apart if one is edited and the other is not.
**Fix:** `export type SessionUser = SessionData;`

---

_Reviewed: 2026-09-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
