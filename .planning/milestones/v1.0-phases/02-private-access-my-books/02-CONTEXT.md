# Phase 2: Private Access & My Books - Context

**Gathered:** 2026-09-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Only the owner and invited friends can use the app. Each user logs in, picks the Colorado books they actually have, and the app only ever suggests bets at those books: the bonus-bet finder (bonus-book dropdown and hedge suggestions) and the Arbitrage tab (both legs). The finder gains the same account-risk advisory the Arbitrage tab already shows (CALC-06). The credit-spending server actions (Refresh odds, Search spreads & totals) become login-only, closing review finding WR-05 from Phase 01.1.

Requirements: DASH-04, DASH-02, BONUS-02, CALC-06.

Not in this phase: promos, scraping, the opportunities feed (Phases 3–5); an admin UI; email sending of any kind; deployment decisions beyond "auth now exists".

</domain>

<decisions>
## Implementation Decisions

### Accounts & login
- **D-01:** Friends join through a **one-time invite link**. There is no public signup page and no route that creates a user without a valid invite token.
- **D-02:** The owner creates invites with a **script that prints the link** (e.g. `npm run invite:create`). No in-app admin UI. The owner's own first account is created the same way (bootstrap by redeeming an invite).
- **D-03:** An invite is **single-use and expires after 7 days** if unused. A used or expired link shows a clear "this invite is no longer valid" message.
- **D-04:** The invite page asks for **email, display name, and password**. The link itself is the credential; no email is ever sent (email is only a login identifier).
- **D-05:** Login is **email + password**. Emails are matched case-insensitively.
- **D-06:** Sessions last **30 days** (iron-session sealed cookie per CLAUDE.md stack). Logout is available from the header account menu (D-10).
- **D-07:** Forgotten passwords are **reset by the owner via a script** that sets a new temporary password. No self-serve reset, no email flow.

### My Books setup
- **D-08:** Right after redeeming an invite, the user goes through a **"pick your books" step** before reaching the app. Books stay editable later in settings.
- **D-09:** Nothing is pre-ticked; the user **must select at least one book** (the step and the settings page both enforce ≥1).
- **D-10:** The picker lists **only the 7 API-covered free-tier books** (DraftKings, FanDuel, BetMGM, BetRivers, theScore Bet, Hard Rock, Bally) — the ones the app can actually use. Non-covered CO books are not shown.
- **D-11:** Book settings live on a **settings page reached from a header account menu** (which also holds logout and shows the display name). Not a third top-level tab.
- **D-12:** The book selection is **stored in the database per user** (DASH-02: persists across sessions and devices).

### Where my books apply
- **D-13:** The finder's **bonus-book dropdown lists only the user's books**.
- **D-14:** Finder **hedge suggestions only use the user's books** (BONUS-02; replaces Phase 1 D-15 "every API-covered book").
- **D-15:** **Same-book hedges stay allowed with the existing "Same book" badge** (unchanged from Phase 1), as long as that book is one of the user's books.
- **D-16:** The **Arbitrage tab only shows arbs where both legs are at the user's books** (the deferred "arbs filtered to my books" from Phase 01.1).
- **D-17:** The arb **"Multiple books" popover lists only the user's books** that tie the best price.
- **D-18:** Games/markets the user's books can't cover are **simply hidden**. When nothing qualifies, the empty state suggests adding more books (link to settings).
- **D-19:** Changing books **recomputes on the next view** of the finder or Arbitrage tab from cached odds — no credits spent, no re-fetch.

### Shared vs per-user state
- **D-20:** **Any logged-in user** may spend the shared Odds API credits (Refresh odds and Search spreads & totals), with the existing meter, low-credit block, confirm steps and refresh lock unchanged. Logged-out requests to these actions are rejected server-side (closes WR-05).
- **D-21:** Each credit spend **records which user triggered it**, and the odds-age / status area shows it (e.g. "last refreshed by Mike").
- **D-22:** Stake, precision and hedge-cap settings **stay in browser localStorage** (Phase 01.1 D-03 unchanged). Only the book selection goes in the DB.
- **D-23:** The finder gets the **same neutral standing account-risk advisory as the Arbitrage tab**, placed above the finder results (CALC-06), for a consistent look.

### Claude's Discretion
- Password hashing library (bcrypt vs `@node-rs/argon2`, per CLAUDE.md), minimum password rules, and login attempt rate limiting.
- Invite token format/length and storage (hashed vs plain), exact script names and flags.
- Route protection mechanism (Next.js middleware vs per-page/server-action checks) — but every server action and page must require a session except login and invite redemption.
- What logged-out visitors see (redirect to login is the expected default).
- Exact copy for invite errors, empty states and the "last refreshed by" line, following the Phase 1 / 01.1 UI-SPEC tone.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §"Phase 2: Private Access & My Books" — goal and success criteria
- `.planning/REQUIREMENTS.md` — DASH-04, DASH-02, BONUS-02, CALC-06
- `.planning/PROJECT.md` — constraints (private, small group, no public signup) and Key Decisions

### Stack decisions
- `CLAUDE.md` §"Auth: Private, invite-only access" — iron-session 9.x + manually managed `users` table, bcrypt/argon2; Auth.js explicitly not used
- `CLAUDE.md` §"Version Compatibility" — iron-session v8+ App Router API only

### Prior phase decisions this phase changes or builds on
- `.planning/phases/01-bonus-bet-finder/01-CONTEXT.md` — D-15 (hedge books = all API books "until Phase 2"), book config as single source of truth
- `.planning/phases/01.1-arbitrage-tab/01.1-CONTEXT.md` — D-03 (localStorage prefs), D-06/D-07 (different books, Multiple books), deferred "arbs filtered to my books"
- `.planning/phases/01.1-arbitrage-tab/01.1-REVIEW.md` §WR-05 — credit-spending actions have no auth
- `.planning/phases/01-bonus-bet-finder/01-UI-SPEC.md` and `.planning/phases/01.1-arbitrage-tab/01.1-UI-SPEC.md` — design system, advisory component and copy tone to reuse

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/books.ts` (`COLORADO_BOOKS`, `usableOddsBooks()`): source of the 7 selectable books for the picker.
- `src/db/queries.ts` `getBonusBooks()` / `getHedgeBookKeys()`: currently return all usable books — the natural seam to take the session user's selection.
- `src/components/arb/ArbForm.tsx`: contains the standing account-risk advisory to reuse on the finder (D-23).
- `src/components/ui/checkbox.tsx`: shadcn Checkbox already installed (Phase 01.1) for the book picker.
- `src/lib/persistentState.ts`: localStorage helper — stays for stake/precision/cap (D-22).

### Established Patterns
- Server actions in `src/app/actions/*` (`find-hedges`, `find-arbs`, `refresh-odds`, `refresh-spreads-totals`) take zod-validated input and return DTOs with money as 2-dp strings; each needs a session check.
- `findArbs`/`findHedges` already take an `allowedBookKeys` set through the market filters — per-user filtering plugs in there.
- Drizzle schema in `src/db/schema.ts` (`books`, `cached_odds`, `cached_extended_odds`, `credit_usage`, `refresh_lock`); migrations via `npm run db:generate` + `db:migrate` (never push).
- `credit_usage` ledger is where per-user attribution (D-21) attaches.

### Integration Points
- `src/app/page.tsx` / `src/components/AppShell.tsx`: header gains the account menu; page must require a session.
- New routes: login, invite redemption (`/invite/[token]`), book-picker step, settings.
- New tables: users, invites, user books (and a user reference on `credit_usage`).

</code_context>

<specifics>
## Specific Ideas

- "Last refreshed by Mike" style attribution next to the odds age.
- The invite link is texted by the owner; the flow must work without any email infrastructure.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-private-access-my-books*
*Context gathered: 2026-09-26*
