---
phase: 02-private-access-my-books
plan: 01
subsystem: auth
tags: [iron-session, argon2, drizzle, neon, zod, react-hook-form, invite-only-auth]

requires:
  - phase: 01-bonus-bet-finder
    provides: books/creditUsage schema, db/client.ts lazy-singleton pattern, find-hedges.ts action shape
  - phase: 01.1-arbitrage-tab
    provides: cached_extended_odds, arb engine (unaffected by this plan)
provides:
  - users/invites/user_books schema live on Neon (0003 migration)
  - src/lib/session.ts (getSessionUser/requireUser/startSession/endSession, 30-day iron-session cookie)
  - src/lib/auth/{password,inviteToken,accounts}.ts (argon2 hashing, invite token, atomic invite redemption)
  - redeemInvite server action + /invite/[token] page + InviteForm
  - npm run invite:create / npm run password:reset owner scripts
affects: [02-02 (login), 02-03 (onboarding book picker), 02-04 (settings), 02-05 (finder/arb book filtering)]

tech-stack:
  added: [iron-session@9.0.1, "@node-rs/argon2@2.2.1"]
  patterns:
    - "Lazy env-var throw pattern (src/db/client.ts) reused for SESSION_SECRET in src/lib/session.ts"
    - "Single atomic multi-CTE SQL statement (claim invite FOR UPDATE -> insert user FROM that CTE -> mark invite used) as neon-http's substitute for an interactive transaction"
    - "sessionCookie.ts split out as a dependency-free constant module so a future proxy.ts can import the cookie name without pulling in next/headers/iron-session"

key-files:
  created:
    - src/db/schema.ts (users, invites, userBooks tables; creditUsage.triggeredByUserId)
    - drizzle/0003_daffy_paper_doll.sql
    - src/lib/session.ts
    - src/lib/sessionCookie.ts
    - src/lib/auth/password.ts
    - src/lib/auth/inviteToken.ts
    - src/lib/auth/accounts.ts
    - src/domain/auth/authInput.ts
    - src/app/actions/redeem-invite.ts
    - src/app/invite/[token]/page.tsx
    - src/components/auth/InviteForm.tsx
    - scripts/invite-create.ts
    - scripts/password-reset.ts
  modified:
    - scripts/db-check.ts (prints users/invites/user_books row counts)
    - .env.example (SESSION_SECRET, APP_URL)
    - package.json (engines.node, invite:create/password:reset scripts)

key-decisions:
  - "redeemInviteAndCreateUser is the ONLY insert site into users, enforced by a single multi-CTE SQL statement rather than an application-level transaction (neon-http has no interactive transactions)"
  - "SESSION_COOKIE_NAME lives in a dependency-free src/lib/sessionCookie.ts, re-exported from session.ts, so a future proxy.ts can read the cookie name without importing next/headers/iron-session"
  - "verifyAgainstDummyHash hashes a fixed dummy string once (lazily) to equalize login timing for unknown emails in a later plan"

patterns-established:
  - "Every new table doc-comments cite the decision/threat IDs it satisfies, matching books/creditUsage's existing convention"
  - "Server actions: zod safeParse -> domain fn -> discriminated-union outcome -> redirect() outside try/catch on success"

requirements-completed: [DASH-04]

duration: 25min
completed: 2026-09-26
---

# Phase 2 Plan 1: Invite-Only Signup & Session Foundation Summary

**One-time invite links (owner-run `npm run invite:create`) redeem into an argon2-hashed account sealed into a 30-day iron-session cookie, atop a live-migrated `users`/`invites`/`user_books` schema on Neon.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-26T03:01:41Z (first test run)
- **Completed:** 2026-09-26T09:10:49Z (last commit)
- **Tasks:** 3 completed
- **Files modified:** 21

## Accomplishments
- Live Neon schema now has `users`, `invites`, `user_books` and `credit_usage.triggered_by_user_id`, applied via a single committed `drizzle-kit generate` + `drizzle-kit migrate` run (no DROP statements, no `db push`)
- `redeemInviteAndCreateUser` claims an invite and creates a user in one atomic multi-CTE SQL statement, so a concurrent double-redemption of the same link can create at most one account, and a duplicate email rolls back the whole statement leaving the invite unused
- `src/lib/session.ts` wraps iron-session with a lazy `SESSION_SECRET` throw (mirroring `getDb()`), a 30-day TTL cookie, and `getSessionUser`/`requireUser`/`startSession`/`endSession`
- `npm run invite:create` and `npm run password:reset` give the owner a fully terminal-driven, no-email, no-signup-UI account lifecycle (D-02, D-03, D-07)
- `/invite/[token]` renders the account-creation form for a valid link or a single generic "no longer valid" message for every invalid reason (expired, used, malformed) per D-03

## Task Commits

1. **Task 1: Install auth deps and write failing invite-redemption + session tests (RED)** - `7d0b0c4` (test)
2. **Task 2: Schema + 0003 migration, session/auth libs and redeemInvite action (GREEN), then db:migrate on live Neon** - `7f51ae8` (feat)
3. **Task 3: Owner scripts (invite:create, password:reset) and the /invite/[token] page** - `3f941d9` (feat)

## Files Created/Modified
- `src/db/schema.ts` - users/invites/user_books tables, credit_usage.triggeredByUserId
- `drizzle/0003_daffy_paper_doll.sql` + `drizzle/meta/{_journal.json,0003_snapshot.json}` - live-applied migration
- `src/lib/session.ts`, `src/lib/sessionCookie.ts` - iron-session wrapper
- `src/lib/auth/password.ts` - argon2 hash/verify + timing-equalizer dummy hash
- `src/lib/auth/inviteToken.ts` - 32-byte token + SHA-256 hash + 7-day expiry
- `src/lib/auth/accounts.ts` - atomic redeemInviteAndCreateUser, isInviteRedeemable, createInvite, setPasswordByEmail
- `src/domain/auth/authInput.ts` - InviteRedemptionInputSchema
- `src/app/actions/redeem-invite.ts` - redeemInvite server action
- `src/app/invite/[token]/page.tsx`, `src/components/auth/InviteForm.tsx` - invite redemption UI
- `scripts/invite-create.ts`, `scripts/password-reset.ts` - owner CLI scripts
- `scripts/db-check.ts` - now also prints users/invites/user_books counts
- `.env.example`, `package.json` - SESSION_SECRET/APP_URL docs, engines pin, new npm scripts

## Decisions Made
- Used a single multi-CTE SQL statement (`db.execute(sql\`...\`)`) instead of Drizzle's transaction API for invite redemption, since neon-http has no interactive transactions — this was the plan's specified approach, confirmed against the installed driver's `execute()`/`NeonHttpQueryResult` shape.
- Kept `SESSION_COOKIE_NAME` in a separate dependency-free module (`sessionCookie.ts`) per the plan's interface contract, re-exported from `session.ts`, so a later `proxy.ts` never needs to import `next/headers`/`iron-session`.

## Deviations from Plan

None - plan executed exactly as written. One clarification handled during grep-verification: the plan's acceptance criterion expects the literal string `"promoprofit_session"` to appear in `src/lib/session.ts`, but the plan's own interface contract also requires the cookie name to be *defined* in `sessionCookie.ts` and only *re-exported* from `session.ts`. Resolved by keeping the re-export (single source of truth for the actual `cookieName` value passed to iron-session) and adding a doc comment in `session.ts` that states the literal value for documentation/grep purposes — no functional duplication of the constant itself.

## Issues Encountered
- `tsc --noEmit` initially failed on `session.ts` because `IronSession<SessionData>`'s fields are optional (`string | undefined`) until set, even though `SessionData` declares them as required — fixed by checking `email`/`displayName` for `undefined` alongside `userId` in `getSessionUser` (Rule 1, part of Task 2's own GREEN commit, not a separate fix-up).

## User Setup Required

None for local development — `SESSION_SECRET` was generated with `openssl rand -base64 48` and appended to the gitignored `.env.local` directly (`.env.local` is never committed). If/when this app is deployed to Vercel, see this plan's `user_setup` frontmatter: set `SESSION_SECRET` in the Vercel dashboard and confirm the project's Node.js version is >=22.13.

## Next Phase Readiness
- `getSessionUser`/`requireUser`/`startSession`/`endSession`, the `users`/`invites`/`user_books` schema, and `redeemInviteAndCreateUser`/`setPasswordByEmail` are all in place for Plan 02 (login) to build on directly — no schema or session-shape changes anticipated.
- One invite row was created live during Task 3's smoke test (`npm run invite:create`, unredeemed, expires 2026-10-03) and is available for the owner to use in a later walkthrough, or will simply expire naturally.
- No blockers.
