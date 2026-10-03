# Phase 2: Private Access & My Books - Research

**Researched:** 2026-09-26
**Domain:** Invite-only auth (iron-session + password hashing) on Next.js 16 App Router, per-user book-selection persistence, and threading a per-user "allowed books" set through an existing hedge/arb engine
**Confidence:** HIGH

## Summary

This phase adds five new screens (login, invite redemption, book-picker onboarding, settings, header account menu) and a `users`/`invites`/`user_books` schema on top of a codebase that already has a fully working hedge engine, arb engine, odds cache, and credit-usage ledger from Phases 1 and 1.1. Nothing about the hedge math changes — the entire job is (1) build a small, hand-rolled session/auth layer per CLAUDE.md's explicit "no Auth.js" directive, and (2) thread a per-user `allowedBookKeys: Set<string>` into the two places that currently hardcode "every API-covered book" (`getBonusBooks()` / `getHedgeBookKeys()` in `src/db/queries.ts`), which the engine already accepts as a parameter (`MarketFilterOptions.allowedBookKeys`) — no engine code changes required, only call-site changes in `findHedges`/`findArbs`.

The auth stack is exactly what CLAUDE.md prescribes: iron-session 9.0.1 (confirmed current on npm, requires Node >=22.13 — verify this against the Vercel project's Node version setting, see Common Pitfalls) for the sealed-cookie session, and `@node-rs/argon2` for password hashing — its documented defaults (19 MiB memory, t=2, p=1, Argon2id) exactly match OWASP's 2026 baseline minimum with zero manual tuning, and it ships prebuilt platform binaries (napi-rs), unlike the `argon2` or `bcrypt` packages which require a C compiler at install time — a meaningfully better fit for Vercel's build environment than CLAUDE.md's own "if native binary builds aren't a concern" caveat suggested.

One finding CLAUDE.md's original research did not have (it's a Next.js 16.3+ development that postdates most training-era knowledge): **Next.js 16 renamed `middleware.ts` to `proxy.ts`** (the exported function is now `proxy`, and it always runs on the Node.js runtime, never Edge). `middleware.ts` still works but is documented as deprecated. Since this project has no Edge-runtime code anywhere and CONTEXT.md leaves the route-protection mechanism to Claude's discretion, **use `proxy.ts`**, not `middleware.ts`, for the redirect-to-login behavior — building on the deprecated convention on a brand-new Next.js 16 app would be immediately stale.

**Primary recommendation:** iron-session 9.0.1 sealed cookie + `@node-rs/argon2` password hashing + a `proxy.ts` network boundary for page-level redirect-to-login, backed by **explicit per-server-action session checks** (proxy.ts alone is defense-in-depth, not sufficient — CONTEXT.md D-20 requires every credit-spending action to reject logged-out requests server-side regardless of how the page was reached). Add three tables (`users`, `invites`, `user_books`) plus one nullable FK column (`credit_usage.triggered_by_user_id`) to the existing Drizzle schema; extend `getBonusBooks()`/`getHedgeBookKeys()` to accept the caller's `Set<string>` of selected book keys and intersect with `usableOddsBooks()`, rather than returning "every usable book" unconditionally.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Invite-only login / session issuance | API / Backend (Server Actions) | Frontend Server (SSR) reads session via `cookies()` | Password verification and session sealing must happen server-side; iron-session's `getIronSession(await cookies(), opts)` is the App Router pattern, callable from both Server Actions and Server Components |
| Route protection (redirect unauthenticated to `/login`) | Frontend Server (`proxy.ts`) | API / Backend (per-action re-check) | `proxy.ts` is the single choke point for page navigation; server actions need their own check because they can theoretically be invoked without a full page load and because CONTEXT.md D-20 explicitly requires action-level enforcement (closing WR-05) |
| Book selection storage | Database / Storage (`user_books` table) | API / Backend (`db/queries.ts` reads) | DASH-02 requires cross-device persistence — must be DB-backed, not localStorage (unlike stake/precision/cap prefs, D-22) |
| Hedge/arb book filtering | API / Backend (`findHedges`/`findArbs` server actions) | Database / Storage (`user_books` read feeding `allowedBookKeys`) | The domain engine (`marketFilter.ts`, `rankArbs.ts`) is already tier-agnostic and pure — it takes `allowedBookKeys` as a parameter. The API tier is responsible for resolving "this session's user's books" into that set before calling the pure engine |
| Credit-spend attribution ("Refreshed by X") | Database / Storage (`credit_usage.triggered_by_user_id`) | API / Backend (`ingestion/odds/status.ts` join) | The ledger already exists (Phase 1); this phase only adds a nullable FK and a join at read time |
| Account-risk advisory (CALC-06) | Browser / Client (React component, static copy) | — | Pure presentational reuse of the existing `Alert` from `ArbForm.tsx` — no new tier |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Accounts & login**
- D-01: Friends join through a one-time invite link. No public signup page, no route creates a user without a valid invite token.
- D-02: Owner creates invites with a script that prints the link (e.g. `npm run invite:create`). No in-app admin UI. Owner's own first account is created the same way (bootstrap by redeeming an invite).
- D-03: An invite is single-use and expires after 7 days if unused. A used or expired link shows a clear "this invite is no longer valid" message.
- D-04: The invite page asks for email, display name, and password. The link itself is the credential; no email is ever sent.
- D-05: Login is email + password. Emails are matched case-insensitively.
- D-06: Sessions last 30 days (iron-session sealed cookie per CLAUDE.md stack). Logout is available from the header account menu (D-10).
- D-07: Forgotten passwords are reset by the owner via a script that sets a new temporary password. No self-serve reset, no email flow.

**My Books setup**
- D-08: Right after redeeming an invite, the user goes through a "pick your books" step before reaching the app. Books stay editable later in settings.
- D-09: Nothing is pre-ticked; the user must select at least one book (the step and the settings page both enforce ≥1).
- D-10: The picker lists only the 7 API-covered free-tier books (DraftKings, FanDuel, BetMGM, BetRivers, theScore Bet, Hard Rock, Bally) — non-covered CO books are not shown.
- D-11: Book settings live on a settings page reached from a header account menu (which also holds logout and shows the display name). Not a third top-level tab.
- D-12: The book selection is stored in the database per user (DASH-02: persists across sessions and devices).

**Where my books apply**
- D-13: The finder's bonus-book dropdown lists only the user's books.
- D-14: Finder hedge suggestions only use the user's books (BONUS-02; replaces Phase 1 D-15 "every API-covered book").
- D-15: Same-book hedges stay allowed with the existing "Same book" badge (unchanged from Phase 1), as long as that book is one of the user's books.
- D-16: The Arbitrage tab only shows arbs where both legs are at the user's books (deferred from Phase 01.1).
- D-17: The arb "Multiple books" popover lists only the user's books that tie the best price.
- D-18: Games/markets the user's books can't cover are simply hidden. Empty state suggests adding more books (link to settings).
- D-19: Changing books recomputes on the next view of the finder or Arbitrage tab from cached odds — no credits spent, no re-fetch.

**Shared vs per-user state**
- D-20: Any logged-in user may spend the shared Odds API credits (Refresh odds and Search spreads & totals), with the existing meter, low-credit block, confirm steps and refresh lock unchanged. Logged-out requests to these actions are rejected server-side (closes WR-05).
- D-21: Each credit spend records which user triggered it, and the odds-age/status area shows it (e.g. "last refreshed by Mike").
- D-22: Stake, precision and hedge-cap settings stay in browser localStorage (Phase 01.1 D-03 unchanged). Only the book selection goes in the DB.
- D-23: The finder gets the same neutral standing account-risk advisory as the Arbitrage tab, placed above the finder results (CALC-06).

### Claude's Discretion
- Password hashing library (bcrypt vs `@node-rs/argon2`, per CLAUDE.md), minimum password rules, and login attempt rate limiting.
- Invite token format/length and storage (hashed vs plain), exact script names and flags.
- Route protection mechanism (Next.js middleware vs per-page/server-action checks) — but every server action and page must require a session except login and invite redemption.
- What logged-out visitors see (redirect to login is the expected default).
- Exact copy for invite errors, empty states and the "last refreshed by" line, following the Phase 1 / 01.1 UI-SPEC tone.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-04 | Only invited users (owner + friends) can log in; there is no public signup | Invite-token schema, iron-session login flow, `proxy.ts` route protection, per-action session checks — see Architecture Patterns and Code Examples |
| DASH-02 | User can select which Colorado sportsbooks they have accounts with, and the selection persists | `user_books` table design, settings page read/write pattern — see Standard Stack and Architecture Patterns |
| BONUS-02 | Bonus-bet finder hedge suggestions only use books the user has selected | `getBonusBooks(userBookKeys)` / `getHedgeBookKeys(userBookKeys)` extension, `allowedBookKeys` seam already in `marketFilter.ts` — see Don't Hand-Roll and Code Examples |
| CALC-06 | User sees a brief account-risk advisory explaining that precise stakes and promo-only play can lead to account limiting | Verbatim reuse of `ArbForm.tsx`'s existing `Alert` component in `FinderForm`/`FinderScreen` — see Architecture Patterns |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Auth MUST use iron-session + a manually-seeded `users` table — Auth.js/NextAuth/Clerk explicitly forbidden ("disproportionate operational surface... for a fixed, owner-managed user list").
- Password hashing: bcrypt or `@node-rs/argon2` — CLAUDE.md leaves the exact choice open but names only these two.
- Never use native JS floating-point for money math — not directly relevant to this phase (no new money math), but any credit/count arithmetic touching money-adjacent display must still route through the existing `decimal.js`/`formatUsd` helpers.
- Drizzle ORM + `@neondatabase/serverless`, migrations via `drizzle-kit generate` + `drizzle-kit migrate` — never `db push`. New tables in this phase must follow this exact workflow.
- Zod for runtime validation of forms (login, invite redemption, settings) — pair with `@hookform/resolvers/zod` per existing `FinderForm.tsx`/`ArbForm.tsx` precedent (note: `ArbForm.tsx` does NOT use react-hook-form, it uses plain controlled state with a Zod `safeParse` on every change — `FinderForm.tsx` uses react-hook-form + zodResolver; auth forms are closer to `FinderForm.tsx`'s "one submit button" shape).
- No public signup — enforced structurally by requiring a valid invite token for the only account-creation route.
- decimal.js is not applicable to this phase's own logic (no new stake/profit math) but must not be bypassed by it either.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| iron-session | 9.0.1 | Encrypted, stateless session cookie | [VERIFIED: npm registry, `npm view iron-session version`] Matches CLAUDE.md's pinned choice exactly. App Router pattern: `getIronSession(await cookies(), options)` in Server Components/Actions [CITED: github.com/vvo/iron-session README]. **Requires Node >=22.13.0** [CITED: npm registry `engines` field] — see Common Pitfalls. |
| @node-rs/argon2 | 2.2.1 | Password hashing (Argon2id) | [VERIFIED: npm registry] Ships prebuilt binaries for `linux-x64-gnu`, `darwin-arm64`, etc. via napi-rs (no C compiler needed at install time) — a strictly better fit for Vercel builds than plain `bcrypt` or `argon2` (both require node-gyp). Default params (memory 19456 KiB, t=2, p=1, Argon2id, 32-byte output) [CITED: github.com/napi-rs/node-rs README] match OWASP's 2026 documented baseline minimum for Argon2id exactly [CITED: OWASP Password Storage Cheat Sheet, cheatsheetseries.owasp.org] — no manual parameter tuning required. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (built-in) | n/a | Invite token generation | Use `randomBytes(32).toString("base64url")` (or similar) for invite tokens — no new dependency. The codebase already uses `randomUUID()` from `node:crypto` in `ingestion/odds/refresh.ts` for the refresh-lock holder ID, establishing precedent for built-in `node:crypto` over a package. |
| Zod | 4.6.5 (already installed) | Validate login/invite/settings form input | Already the project standard; reuse the `FinderInputSchema`/`ArbInputSchema` pattern — a schema per form, `safeParse` server-side inside the action regardless of client-side `zodResolver` use. |
| shadcn `dropdown-menu` | latest (via `npx shadcn add dropdown-menu`) | `AccountMenu` (Settings / Log out) | Already specified in 02-UI-SPEC.md's Component Inventory as the one new shadcn block this phase needs. Official registry — no safety gate required. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@node-rs/argon2` | `bcrypt` (native, 6.0.0) | bcrypt has no memory-cost parameter, making resource usage more predictable, but requires node-gyp/C-compiler at install (works on Vercel but is a heavier build step); also weaker against GPU/ASIC cracking than Argon2id. Use if the team specifically wants bcrypt's simpler mental model over Argon2id's stronger guarantees. |
| `@node-rs/argon2` | `bcryptjs` (pure JS) | Zero native-build dependency at all, but meaningfully slower and not memory-hard — reasonable fallback ONLY if `@node-rs/argon2`'s prebuilt binaries ever fail to resolve for the deploy target (unlikely on Vercel's standard Linux x64 runners). |
| `proxy.ts` | Per-page/per-layout `redirect()` calls only, no network-boundary file | Works, but duplicates the "check session, redirect to /login" logic on every protected route instead of centralizing it once; `proxy.ts` is the framework's own recommended pattern for exactly this. |
| Normalized `user_books` join table | `books text[]` or `jsonb` column on `users` | An array/jsonb column avoids a join, but loses FK integrity to `books.key` and is harder to query with Drizzle's typed `inArray`/`eq` helpers; the existing schema already favors normalized tables (`books`, `credit_usage`) over denormalized blobs — stay consistent. |

**Installation:**
```bash
npm install iron-session @node-rs/argon2
npx shadcn add dropdown-menu
```

**Version verification:** confirmed via `npm view <package> version` against the live registry on 2026-09-26 (see table above). `@node-rs/argon2`'s per-platform optional dependencies (`@node-rs/argon2-darwin-arm64`, `@node-rs/argon2-linux-x64-gnu`, etc., all pinned to 2.2.1) were also confirmed present on the registry.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| iron-session | npm | ~7 yrs (v1 released 2019) | high (widely used in Next.js ecosystem) | github.com/vvo/iron-session | [OK] | Approved |
| @node-rs/argon2 | npm | ~5 yrs (napi-rs project) | high (part of the well-known napi-rs/node-rs monorepo, also used by Prisma's own benchmarking) | github.com/napi-rs/node-rs | [OK] | Approved |

`slopcheck install iron-session @node-rs/argon2 bcrypt zod` reported `[OK]` for all four packages (bcrypt and zod checked as comparison baselines, not for installation). Note: slopcheck's `install` subcommand performs a real `npm install` as its verification mechanism — during this research session it was run in a scratch context and its resulting `package.json`/`package-lock.json`/`node_modules` changes were reverted (`git checkout -- package.json package-lock.json`) before completing this document, so the repo is unaffected. **The planner should install these two packages fresh as an explicit task step**, not assume they're already present.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │  GET /  (or any protected page)
  ▼
proxy.ts  ──── no session cookie? ──► redirect /login
  │ (session present, Node runtime)
  ▼
Page (Server Component)
  │  await getIronSession(await cookies(), opts)  → { userId, email, displayName }
  │  await getUserBookKeys(userId)  (DB read, user_books table)
  ▼
AppShell (adds AppHeader + AccountMenu above existing OddsStatusBar)
  │
  ├─► FinderForm ──findHedges(input)──► server action
  │                                        │ re-checks session (defense-in-depth, D-20)
  │                                        │ resolves session.userId → user_books → Set<bookKey>
  │                                        │ intersects with usableOddsBooks()
  │                                        ▼
  │                              extractTwoWayMoneylines({ allowedBookKeys, ... })  [UNCHANGED pure fn]
  │                                        ▼
  │                              rankBonusBetHedges(...)  [UNCHANGED pure fn]
  │
  └─► ArbForm ──findArbs(input)──► server action (same allowedBookKeys resolution) ──► rankArbs [UNCHANGED]

Login page ──login(email, password)──► server action
  │  lowercase email lookup in users
  │  @node-rs/argon2 verify(hash, password)
  │  failed_login_attempts / locked_until check+increment (DB-backed, serverless-safe)
  │  on success: getIronSession(...).save() with 30-day ttl
  ▼
redirect: has the user selected ≥1 book (user_books count)?
  │  NO  → /onboarding/books
  │  YES → /  (main app)

Invite redemption /invite/[token] ──redeemInvite(token, email, displayName, password)──► server action
  │  hash(token) lookup in invites (single-use, expiresAt check)
  │  hash(password) via @node-rs/argon2
  │  insert users row, mark invite used_at/used_by_user_id
  │  getIronSession(...).save()
  ▼
redirect: /onboarding/books  (always, per D-08 — never straight to /)
```

### Recommended Project Structure
```
src/
├── app/
│   ├── login/page.tsx                  # unauthenticated, no AppHeader/OddsStatusBar
│   ├── invite/[token]/page.tsx         # unauthenticated
│   ├── onboarding/books/page.tsx       # authenticated, pre-book-picker gate
│   ├── settings/page.tsx               # authenticated
│   ├── actions/
│   │   ├── login.ts                    # "use server" — login + rate-limit check
│   │   ├── logout.ts                   # "use server" — session.destroy()
│   │   ├── redeem-invite.ts            # "use server" — invite validation + user creation
│   │   ├── save-books.ts               # "use server" — user_books upsert, ≥1 validation
│   │   ├── find-hedges.ts              # MODIFIED: resolve session → allowedBookKeys
│   │   ├── find-arbs.ts                # MODIFIED: resolve session → allowedBookKeys
│   │   ├── refresh-odds.ts             # MODIFIED: require session, thread userId to recordCreditUsage
│   │   └── refresh-spreads-totals.ts   # MODIFIED: same as refresh-odds
│   └── proxy.ts                        # NEW (Next.js 16 network boundary, not middleware.ts)
├── components/
│   ├── AppHeader.tsx                   # NEW — wordmark + AccountMenu
│   ├── AccountMenu.tsx                 # NEW — shadcn dropdown-menu
│   └── settings/BookPicker.tsx         # NEW — shared checkbox-list, used by onboarding + settings
├── lib/
│   └── session.ts                      # NEW — getSession()/requireSession() helpers wrapping iron-session
├── db/
│   ├── schema.ts                       # MODIFIED — add users, invites, user_books; add credit_usage.triggered_by_user_id
│   └── queries.ts                      # MODIFIED — getBonusBooks(userBookKeys), getHedgeBookKeys(userBookKeys), NEW getUserBookKeys(userId), NEW saveUserBooks(userId, keys)
└── scripts/
    ├── invite-create.ts                # NEW — npm run invite:create
    └── password-reset.ts               # NEW — npm run password:reset
```

### Pattern 1: Session helper wrapping iron-session
**What:** A single `src/lib/session.ts` module exporting `getSession()` (returns session or null) and `requireSession()` (throws/redirects if absent) so every page and server action shares one source of truth for the session shape and cookie options.
**When to use:** Every protected page (in the Server Component body) and every server action (as its first line).
**Example:**
```typescript
// Source: iron-session README (github.com/vvo/iron-session) + Next.js App Router cookies() docs
import { cookies } from "next/headers";
import { getIronSession, type IronSession } from "iron-session";

export interface SessionData {
  userId: number;
  email: string;
  displayName: string;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET!, // >=32 chars, server-only env var
  cookieName: "promoprofit_session",
  ttl: 60 * 60 * 24 * 30, // 30 days (D-06)
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

// Server actions call this and branch on session.userId === undefined;
// pages call this and redirect() to /login if absent.
```

### Pattern 2: `proxy.ts` network boundary (Next.js 16)
**What:** The renamed `middleware.ts` — a Node-runtime-only file that decides whether a request may reach the app at all.
**When to use:** Redirect any request to a protected route (everything except `/login`, `/invite/[token]`, and static assets) to `/login` when no session cookie is present. This is a fast, cookie-presence-only check (no DB call) — the authoritative session validity check still happens per-page/per-action via Pattern 1, since a stale/tampered cookie fails iron-session's unseal, not a presence check.
**Example:**
```typescript
// Source: Next.js docs — File-system conventions: proxy.js (nextjs.org/docs/app/api-reference/file-conventions/proxy)
// and nextjs.org/docs/messages/middleware-to-proxy
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/invite"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const hasSession = request.cookies.has("promoprofit_session");
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```
**Note:** `middleware.ts` still works in Next.js 16 (deprecated, not removed) — do NOT use it for a brand-new file in a project already on 16.3.6; use `proxy.ts` from the start [CITED: nextjs.org/docs/messages/middleware-to-proxy].

### Pattern 3: Per-user book filtering — extend existing query functions, don't add a parallel path
**What:** `getBonusBooks()` and `getHedgeBookKeys()` currently take no arguments and return every usable book unconditionally (Phase 1 D-15, now superseded by D-14). Extend them to accept the caller's selected book keys and intersect, rather than creating new parallel "getBonusBooksForUser" functions that could drift from the originals.
**When to use:** Every call site in `find-hedges.ts` and `find-arbs.ts`.
**Example:**
```typescript
// Source: pattern derived from existing src/db/queries.ts (read during this research)
export async function getUserBookKeys(userId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ bookKey: userBooks.bookKey }).from(userBooks).where(eq(userBooks.userId, userId));
  return rows.map((r) => r.bookKey);
}

// getBonusBooks/getHedgeBookKeys now intersect with the caller-supplied set:
export async function getBonusBooks(allowedKeys?: ReadonlySet<string>): Promise<BookOption[]> {
  const usable = usableOddsBooks();
  const filtered = allowedKeys ? usable.filter((b) => allowedKeys.has(b.key)) : usable;
  return filtered.map((b) => ({ key: b.key, displayName: b.displayName }));
}
```
Then in `find-hedges.ts`/`find-arbs.ts`: resolve the session's `userId` → `getUserBookKeys(userId)` → `new Set(...)` → pass into `getBonusBooks(allowedKeys)`/`getHedgeBookKeys(allowedKeys)`. **No change needed inside `extractTwoWayMoneylines`, `rankBonusBetHedges`, `rankArbs`, or `MultipleBooksPopover`** — they already consume `allowedBookKeys`/derive `tiedBookKeys` from whatever set is handed to them (confirmed by reading `marketFilter.ts` and `rankArbs.ts` during this research).

### Anti-Patterns to Avoid
- **Building a custom rate-limiter with an in-memory `Map`:** Vercel serverless functions do not guarantee a warm, shared process between invocations — an in-memory failed-attempt counter will reset unpredictably and give a false sense of protection. Persist `failed_login_attempts`/`locked_until` on the `users` row instead (see Don't Hand-Roll).
- **Checking session validity only in `proxy.ts` and skipping the per-action check:** CONTEXT.md D-20 explicitly requires server actions to reject logged-out requests themselves (this is literally what closes WR-05 from the 01.1 review) — `proxy.ts` alone is a UX nicety (fast redirect on page load), not the security boundary.
- **Storing the invite token in plaintext in the `invites` table:** even though the link itself is the only credential (D-04), a DB compromise (e.g. leaked Neon connection string, SQL injection via some future feature) would let an attacker enumerate live, unused invite links. Hash the token (e.g. SHA-256) before storing; compare hashes on redemption, same as a password hash comparison — cheap insurance, standard practice.
- **A `books text[]`/`jsonb` column on `users` instead of a normalized `user_books` table:** loses referential integrity to `books.key` and breaks the pattern the rest of the schema already uses.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session cookie encryption/signing | A custom AES-GCM + HMAC cookie scheme | iron-session's `getIronSession`/`.save()`/`.destroy()` | This is exactly the class of security-critical, easy-to-get-subtly-wrong code CLAUDE.md's own reasoning for choosing iron-session over "roll your own" already accepted — don't re-introduce the risk by hand-rolling the sealing step it exists to replace. |
| Password hashing | `crypto.pbkdf2` or a manual salted-SHA-256 scheme | `@node-rs/argon2`'s `hash()`/`verify()` | Argon2id's memory-hardness is specifically what defeats GPU/ASIC cracking; a hand-rolled PBKDF2 wrapper is strictly weaker and just as much code to write and test. |
| Login throttling / brute-force protection | An in-memory sliding-window rate limiter | Two columns on `users` (`failed_login_attempts int`, `locked_until timestamptz`), incremented/checked inside the `login` server action | Simplest thing that's actually correct in a serverless environment (see Anti-Patterns) — no new infra, no Redis, matches CLAUDE.md's explicit rejection of Upstash Redis at this project's scale. |
| Invite token generation | A custom short-code generator (e.g. 6-digit codes) | `node:crypto.randomBytes(32).toString("base64url")` | 32 random bytes is standard practice for a bearer-token-style credential (this token IS the account's create-credential per D-04) — a short/guessable code would be a real vulnerability given the single-use link has no companion password check on lookup. |
| Case-insensitive email matching | A Postgres `citext` extension enablement, or `LOWER(email) = LOWER($1)` scattered across every query | Always store `email` pre-lowercased at write time (login, invite redemption, owner scripts); query on the raw indexed column | Avoids provisioning a Postgres extension on Neon for a problem solvable entirely in the application layer; keeps the existing schema's simplicity (no other table uses extensions). |

**Key insight:** every "hard part" of this phase (crypto, session sealing, throttling logic) already has an established, correctly-scoped answer either in the installed stack (iron-session) or in a two-column schema change — there is no part of this phase that legitimately needs new custom security code beyond wiring these together.

## Common Pitfalls

### Pitfall 1: iron-session 9.x requires Node >=22.13.0
**What goes wrong:** `npm install iron-session` succeeds with a non-fatal `EBADENGINE` warning on an older Node, but if the actual runtime (local dev, GitHub Actions, or the Vercel deployment's configured Node version) is below 22.13, session sealing/unsealing could behave unpredictably or the package could fail to load entirely in a stricter environment.
**Why it happens:** iron-session v9 dropped support for older Node versions and is ESM-only.
**How to avoid:** Before installing, confirm three environments: (1) local dev machine — this session's check found `node --version` → v25.8.1, fine; (2) Vercel project's Project Settings → Node.js Version — Vercel's default for new projects is 22.x, which satisfies >=22.13, but this should be explicitly confirmed/set, not assumed; (3) any GitHub Actions workflow that runs `npm run typecheck`/`npm test` on this code needs a `node-version: '22'` (or higher) step. Add an `"engines": { "node": ">=22.13.0" }` field to `package.json` so a mismatch fails loudly in CI rather than silently at runtime.
**Warning signs:** `EBADENGINE` npm warnings during install; cryptic cookie-unsealing errors in production that don't reproduce locally.

### Pitfall 2: `proxy.ts` matcher accidentally blocking the invite redemption route's sub-paths or static assets
**What goes wrong:** An overly broad matcher (e.g. matching literally everything) redirects `/invite/[token]`'s own page assets or API routes it depends on, or blocks `/_next/static` chunks, breaking the login/invite pages themselves.
**Why it happens:** The example matcher pattern is easy to get subtly wrong, and `proxy.ts` runs before Next.js's own routing resolves what's actually a page vs. an asset.
**How to avoid:** Use the standard exclusion matcher (`/((?!_next/static|_next/image|favicon.ico).*)`) and explicitly allow-list `/login` and `/invite` by prefix inside the function body (as shown in Pattern 2), rather than trying to encode the entire public/private split into the matcher regex alone.
**Warning signs:** Login or invite pages render with no CSS/JS, or redirect-loop to `/login` from `/login` itself.

### Pitfall 3: Server Actions bypass `proxy.ts`'s page-load redirect but NOT its Origin-header CSRF check
**What goes wrong:** Assuming `proxy.ts`'s redirect-to-login also protects server actions triggered from an already-open (stale) authenticated page after the session cookie is manually deleted or expires client-side without a page reload.
**Why it happens:** `proxy.ts`/middleware intercepts the POST request a Server Action makes, but if the matcher only checks cookie *presence* (not validity) and the browser still holds a now-expired-but-present cookie, the request passes the boundary and reaches the action.
**How to avoid:** This is exactly why Pattern 1's `requireSession()` must run inside every server action, not just at the `proxy.ts` boundary — iron-session's unseal will fail/return an empty session for an expired or tampered cookie even when the cookie header is technically present, and only the in-action check catches that.
**Warning signs:** A logged-out (session-expired) user's stale tab can still trigger `refreshOdds`/`findHedges` if only presence-checked at the boundary.

### Pitfall 4: Storing per-user book selection as denormalized JSON invites drift with `books`/`config/books.ts`
**What goes wrong:** If `user_books` stores book keys without a real FK to `books.key`, a future book-config change (e.g. a book losing API coverage, as already happened historically with the ESPN Bet → theScore Bet rebrand noted in `src/config/books.ts`) can leave stale/orphaned keys in a user's selection that silently no-op instead of erroring.
**Why it happens:** JSON/array columns don't enforce referential integrity the way a proper FK + join does.
**How to avoid:** Define `user_books.book_key` as a real FK to `books.key` (`references(() => books.key)`), consistent with how the rest of the schema already treats `books` as the anchor table.
**Warning signs:** A user's settings page shows fewer checked boxes than expected after a book-config change, or the finder silently shows zero results with no clear cause.

### Pitfall 5: Forgetting D-19's "no re-fetch on book change" constraint when wiring the settings save
**What goes wrong:** A naive implementation calls `revalidatePath("/")` after saving book selection, which is correct, but if it also accidentally triggers `runOddsRefresh()` (e.g. copy-pasting from `refresh-odds.ts`'s action shape), it would spend Odds API credits on every settings save.
**Why it happens:** `revalidatePath` and "refresh odds" are easy to conflate since both are called "refresh" colloquially in this codebase.
**How to avoid:** The settings save action should only write `user_books` and call `revalidatePath("/")` (or rely on the next server-rendered page load) — it must never import or call anything from `ingestion/odds/refresh.ts`.
**Warning signs:** Credit meter drops after a "Save changes" click with no odds actually refreshed.

## Code Examples

### Argon2id hash + verify (password creation and login)
```typescript
// Source: github.com/napi-rs/node-rs (argon2 package README)
import { hash, verify } from "@node-rs/argon2";

// Invite redemption / password reset script:
const passwordHash = await hash(plainPassword); // defaults = OWASP 2026 baseline minimum

// Login action:
const isValid = await verify(user.passwordHash, submittedPassword);
```

### iron-session save/destroy in a Server Action
```typescript
// Source: github.com/vvo/iron-session README (App Router pattern)
"use server";
import { getSession } from "@/lib/session";

export async function login(email: string, password: string) {
  // ...lookup user, verify password, check lockout...
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.displayName = user.displayName;
  await session.save();
}

export async function logout() {
  const session = await getSession();
  session.destroy();
}
```

### Extending the existing DTO shape for D-21 attribution (no schema surprise)
```typescript
// Source: pattern derived from existing src/ingestion/odds/status.ts (read during this research)
// credit_usage gains: triggered_by_user_id integer references(() => users.id) — nullable, so
// legacy rows (recorded before this phase) and any future user-deletion never break the read.
// getOddsStatus() left-joins users to resolve triggered_by_user_id -> displayName, and the
// resulting OddsStatus DTO gains an optional `refreshedByDisplayName?: string` field that
// OddsStatusBar renders only when present (D-21's explicit "no placeholder" rule).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `middleware.ts` as the Next.js network-boundary file | `proxy.ts` (same capability, renamed export/file, Node-runtime-only) | Next.js 16 (2026) | `middleware.ts` still works but is deprecated; a new file in a 16.3.6 project should be `proxy.ts` from day one to avoid an immediate migration debt. |
| bcrypt as the default "safe" password hash | Argon2id as the OWASP-recommended default, with bcrypt as a defensible fallback only | Ongoing through 2024-2026, now essentially settled guidance | Argon2id's memory-hardness resists GPU/ASIC cracking meaningfully better; `@node-rs/argon2`'s prebuilt binaries remove the historical "argon2 is a pain to deploy" objection. |

**Deprecated/outdated:**
- `middleware.ts`: not removed in Next.js 16, but documented as deprecated in favor of `proxy.ts` — do not use for new code.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vercel's project-level Node.js version setting for this specific project is (or will be set to) 22.x, satisfying iron-session's `>=22.13.0` engine requirement | Common Pitfalls, Standard Stack | If the project is still on Vercel's Node 20.x default from an earlier setup, iron-session could fail at runtime in production even though local dev (Node 25.8.1) and `npm install` succeed silently — this must be explicitly verified/set in Vercel Project Settings before or during this phase's execution, not assumed. |
| A2 | A per-user `failed_login_attempts`/`locked_until` pair of columns on `users` is sufficient rate-limiting for a 3-5 person trusted group, with no IP-based or global rate limiting | Don't Hand-Roll, Common Pitfalls | Low risk given the threat model (private, invite-only, small group) explicitly stated in PROJECT.md/CLAUDE.md, but if the app is ever exposed more broadly this would need revisiting — flagged in UI-SPEC copy as "Claude's discretion — defaulted" already, so this is consistent with an already-accepted assumption, not a new one. |
| A3 | SHA-256 hashing (not a slow KDF) is sufficient for invite tokens, since the token is generated with full entropy (32 random bytes) and is not a user-chosen low-entropy secret like a password | Don't Hand-Roll (Anti-Patterns) | If wrong, an attacker with DB read access could feasibly reverse a weakly-hashed high-entropy token via brute force — but 32 random bytes (256 bits of entropy) makes brute force infeasible regardless of hash speed, so this is standard practice (same reasoning applies to API keys/session tokens generally, not just passwords). |

**If this table is empty:** N/A — see entries above.

## Open Questions (RESOLVED)

1. **Should `credit_usage.triggered_by_user_id` be `ON DELETE SET NULL` or `ON DELETE RESTRICT`?**
   - What we know: There is no user-deletion feature anywhere in this phase or the roadmap (owner manages users manually via scripts, per D-02/D-07; no delete script was requested).
   - What's unclear: Whether a future phase might add user deletion/deactivation.
   - Recommendation: Use `ON DELETE SET NULL` (matches the "no attribution suffix when unknown" fallback D-21 already specifies) — it's the safer default and costs nothing now, since it only matters if deletion is ever added.
   - RESOLVED: Adopted `onDelete: "set null"` in 02-01-PLAN.md Task 2.

2. **Exact invite token transport format for the printed link (e.g. `https://promoprofit.vercel.app/invite/<token>` vs. a shorter path)?**
   - What we know: D-02 says the script "prints the link"; the specifics of the app's deployed base URL aren't in CONTEXT.md.
   - What's unclear: Whether the script should read a `NEXT_PUBLIC_APP_URL`-style env var or just print the token/path for the owner to prepend manually.
   - Recommendation: Add an `APP_URL` env var (server-only, since it's only read by a CLI script, not the browser) read by `scripts/invite-create.ts`; fall back to printing just the path (`/invite/<token>`) with a note to prepend the deployed domain if the env var is unset. This keeps the script usable in local dev (no deployed URL yet) without blocking on infra decisions out of this phase's scope ("deployment decisions beyond 'auth now exists'" is explicitly out of scope per CONTEXT.md's Phase Boundary).
   - RESOLVED: Adopted `APP_URL` with `/invite/<token>` path fallback in 02-01-PLAN.md Task 3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | iron-session 9.x (`engines: >=22.13.0`) | ✓ (local) | v25.8.1 confirmed via `node --version` | — |
| npm registry access | `npm install iron-session @node-rs/argon2` | ✓ | npm 11.11.0 confirmed locally | — |
| Neon Postgres | New `users`/`invites`/`user_books` tables via `drizzle-kit generate`/`migrate` | ✓ (existing `DATABASE_URL` in `.env.local`, provisioned in Phase 1) | Postgres 18.6 (per STATE.md Phase 1 note) | — |
| Vercel project Node.js version setting | iron-session runtime compatibility in production | **UNVERIFIED — see Assumption A1** | — | Explicitly set Project Settings → Node.js Version → 22.x before/during this phase's deploy step |

**Missing dependencies with no fallback:**
- None — the Vercel Node version item has a clear, low-effort fallback (an explicit settings change), not a blocker.

**Missing dependencies with fallback:**
- Vercel Node.js version (see above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 (already configured, `vitest.config.ts` at repo root) |
| Config file | `vitest.config.ts` — `include: ["src/**/*.test.ts"]`, `@` alias to `src/` |
| Quick run command | `npx vitest run src/app/actions/login.test.ts` (or the relevant new test file) |
| Full suite command | `npm test` (runs `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-04 | Login rejects wrong password, locks after N attempts, accepts correct credentials, invite redemption rejects expired/used/invalid tokens | unit | `npx vitest run src/app/actions/login.test.ts src/app/actions/redeem-invite.test.ts` | ❌ Wave 0 |
| DASH-02 | Book selection persists across a simulated re-fetch (settings save writes `user_books`, a subsequent read returns the same set) | unit | `npx vitest run src/db/queries.test.ts` (extend existing file) | Existing file, ❌ new cases needed |
| BONUS-02 | `findHedges`/`findArbs` never return a leg at a book outside the mocked session user's selected books | unit | `npx vitest run src/app/actions/find-hedges.test.ts src/app/actions/find-arbs.test.ts` | Existing files, ❌ new cases needed (extend the existing `vi.mock("@/db/queries", ...)` pattern already used in `find-hedges.test.ts`) |
| CALC-06 | Finder screen renders the same advisory text as the Arbitrage tab | unit/snapshot | manual visual check (no component-render test harness — e.g. React Testing Library — is installed in this project; existing tests are all pure-function/server-action tests, not component tests) | manual-only — justified: no RTL/jsdom test infra exists yet in this codebase, and adding one for a single static string is disproportionate; verify via the phase's manual verification pass instead |

### Sampling Rate
- **Per task commit:** run the specific new/modified test file(s) via `npx vitest run <file>`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/app/actions/login.test.ts` — covers DASH-04 (login success/failure/lockout)
- [ ] `src/app/actions/redeem-invite.test.ts` — covers DASH-04 (invite validation states)
- [ ] `src/db/queries.test.ts` — extend with `getUserBookKeys`/`saveUserBooks` cases, covers DASH-02
- [ ] Extend `src/app/actions/find-hedges.test.ts` and `find-arbs.test.ts` mocks to inject a session-scoped book set, covers BONUS-02
- [ ] No new test framework needed — Vitest + the existing `vi.mock`/`vi.hoisted` pattern (seen in `find-hedges.test.ts`) covers every automatable case in this phase

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | `@node-rs/argon2` (Argon2id) password hashing; DB-backed failed-attempt lockout; iron-session sealed cookie (AES-256-GCM under the hood) for session tokens |
| V3 Session Management | yes | iron-session `ttl` (30 days per D-06), `httpOnly`/`secure`/`sameSite: lax` cookie options, `session.destroy()` on logout |
| V4 Access Control | yes | `proxy.ts` network boundary + per-server-action `requireSession()` checks (defense-in-depth, closes WR-05); invite-token single-use + 7-day expiry enforced server-side on every redemption attempt |
| V5 Input Validation | yes | Zod schemas for login/invite/settings forms, following the exact `safeParse` pattern already used in `find-hedges.ts`/`find-arbs.ts` |
| V6 Cryptography | yes | Never hand-roll: iron-session owns cookie sealing, `@node-rs/argon2` owns password hashing, `node:crypto.randomBytes` owns invite-token entropy — no custom crypto code anywhere in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Invite-link enumeration/guessing | Spoofing | 32-byte (256-bit) random token via `node:crypto.randomBytes`; hashed at rest; single-use + 7-day expiry; generic "no longer valid" error that doesn't distinguish expired/used/malformed (per D-03's own UI-SPEC copy decision) |
| Credential stuffing / brute-force login | Spoofing, DoS | DB-backed `failed_login_attempts`/`locked_until` per-user lockout (persists correctly across serverless cold starts, unlike an in-memory limiter) |
| Session fixation / cookie theft | Spoofing, Information Disclosure | `httpOnly` (no JS access), `secure` in production, `sameSite: lax`; iron-session's cookie is encrypted+signed so tampering is detected, not just discouraged |
| CSRF on state-changing actions (save books, refresh odds, logout) | Tampering | Next.js Server Actions' built-in Origin-vs-Host header check rejects cross-origin POSTs by default [CITED: nextjs.org/blog/security-nextjs-server-components-actions] — no manual CSRF token needed for same-origin Server Actions as used throughout this codebase |
| Privilege confusion (any logged-in user can spend shared credits, D-20) | Elevation of Privilege (accepted by design) | This is an explicit, documented product decision (D-20), not a gap — the mitigation is attribution (D-21), not restriction |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view <pkg> version`, queried directly 2026-09-26) — iron-session@9.0.1, @node-rs/argon2@2.2.1, bcrypt@6.0.0, zod@4.6.5, and @node-rs/argon2's full per-platform optionalDependencies list
- npm registry `engines` field query — iron-session requires `node: '>=22.13.0'`
- Codebase reads (this session): `src/db/schema.ts`, `src/db/queries.ts`, `src/config/books.ts`, `src/domain/hedge/marketFilter.ts`, `src/domain/hedge/rankArbs.ts`, `src/app/actions/find-hedges.ts`, `src/app/actions/find-arbs.ts`, `src/ingestion/odds/refresh.ts`, `src/ingestion/odds/store.ts`, `src/components/AppShell.tsx`, `src/components/arb/ArbForm.tsx`, `src/components/finder/{FinderForm,OddsStatusBar,EmptyState}.tsx`, `src/app/page.tsx`, `scripts/seed.ts`, `drizzle.config.ts`, `vitest.config.ts`, `components.json`, `package.json`, `.env.example`
- `slopcheck install iron-session @node-rs/argon2 bcrypt zod` — all four `[OK]`, run 2026-09-26 (side-effect `npm install` reverted via `git checkout`)

### Secondary (MEDIUM confidence)
- github.com/vvo/iron-session README (fetched via WebFetch) — App Router `getIronSession`/`cookies()` pattern, `nextProxyCookies` for proxy.ts, `ttl` configuration for 30-day sessions
- github.com/napi-rs/node-rs README (fetched via WebFetch) — `@node-rs/argon2` API (`hash`/`verify`, both async) and documented default parameters
- nextjs.org/docs/messages/middleware-to-proxy and nextjs.org/docs/app/api-reference/file-conventions/proxy (via WebSearch synthesis) — Next.js 16's `middleware.ts` → `proxy.ts` rename, Node-runtime-only, deprecated-not-removed status
- cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html (via WebSearch synthesis) — Argon2id baseline minimum parameters (m=19456 KiB, t=2, p=1)
- nextjs.org/blog/security-nextjs-server-components-actions (via WebSearch synthesis) — Server Actions' built-in Origin-vs-Host CSRF protection

### Tertiary (LOW confidence)
- None used for load-bearing claims in this document — all package/API claims were cross-checked against at least an official README or the live npm registry.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version confirmed live against npm registry; API shapes confirmed against official READMEs, not training-data recall alone
- Architecture: HIGH — every integration seam (allowedBookKeys, getBonusBooks/getHedgeBookKeys, credit_usage attribution point) was confirmed by reading the actual current source files, not inferred
- Pitfalls: HIGH for the iron-session Node-version and proxy.ts items (both directly sourced); MEDIUM for the login-rate-limiting recommendation (sound engineering judgment for a serverless target, but no single authoritative source prescribes this exact schema shape)

**Research date:** 2026-09-26
**Valid until:** 30 days (stable domain — auth patterns and this codebase's own architecture move slowly; re-verify iron-session's Node engine requirement and the Vercel Node-version setting sooner if the phase's execution is delayed past that window, since Next.js/Node compatibility matrices shift faster than the rest of this research)
