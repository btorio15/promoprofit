# Phase 1: Bonus Bet Finder - Research

**Researched:** 2026-09-25
**Domain:** Bonus-bet hedge calculator + quota-safe Odds API ingestion (Next.js/TypeScript, greenfield scaffold)
**Confidence:** HIGH

## Summary

Phase 1 builds the entire vertical slice end to end: project scaffold, a verified Colorado book config, a quota-safe Odds API ingestion/cache layer, a pure fixture-tested bonus-bet hedge engine, and the finder UI. Project-level research (`.planning/research/*.md`) already resolved the stack and architecture; this document adds the phase-specific detail the planner needs: exact, freshly-verified package versions, the precise Odds API v4 endpoint/header/cost contract, a concrete Drizzle+Neon setup, the bonus-bet hedge formula with an explicit cent-rounding rule (resolving the CONTEXT.md-flagged $0.01 discrepancy), a resolution of the NFL-moneyline-tie/push question flagged in CONTEXT.md, and a Vitest validation map per requirement.

Two of CONTEXT.md's open research flags are now resolved with official-doc citations rather than assumptions: (1) Caesars (`williamhill_us`) and Fanatics (`fanatics`) are explicitly documented by The Odds API as "Only available on paid subscriptions" — confirming D-16's decision to exclude them is correct, no live-key check is needed to make that call (though a startup verification call is still recommended as a safety net, see Package/Env Verification below); (2) the ESPN Bet -> theScore Bet bookmaker key is confirmed as `espnbet` in the same official bookmaker-key page, with theScore Bet already shown as the current display name — the backend queries `espnbet`, the UI displays "theScore Bet". A live `/sports/{sport}/odds` call to confirm this key still returns data should still be a checkpoint task at execution time (no API key is available in this research session), but it is now a low-risk confirmation, not an open unknown.

**Primary recommendation:** Build the hedge engine as pure, zero-I/O TypeScript functions over `decimal.js` values (never native floats), fixture-test it in Vitest before wiring any UI, and build the Odds API client as a thin wrapper that reads `x-requests-remaining` on every response and persists it to Postgres — every other credit-guard feature (D-11 warning/block banners, D-10 confirmation dialog copy) reads from that one persisted counter, not from a fresh API call.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Carried from PROJECT.md (locked)**
- Hedge stakes equalize profit across both outcomes; guaranteed profit is identical to the cent whichever side wins.
- American odds only; money shown to the cent; bonus-bet results show conversion % (profit ÷ bonus amount).
- Odds come from The Odds API free tier; nothing polls automatically.
- Stack per research: Next.js, Drizzle + Neon Postgres, decimal.js for all money math, Vitest for fixtures.

**Search scope**
- D-01: Sports scanned: NFL, NBA, MLB, NCAAF, NCAAB, stored as a configurable list. NHL is left out for now (owner will add it later).
- D-02: Moneyline only (h2h market). No spreads or totals in this phase.
- D-03: Only games starting in the next 7 days are considered.
- D-04: Out-of-season sports are skipped automatically using the free (zero-credit) `/sports` endpoint, so no credits are spent on empty sports.

**Finder inputs & results**
- D-05: Inputs: book and bonus amount (required); sport filter (optional, limits results to one sport). No minimum-odds field — ranking by profit already surfaces the right lines.
- D-06: Show the top 10 results, ranked by guaranteed profit (equivalently conversion %, since the amount is fixed).
- D-07: Compact rows with expand: each row shows game, bonus side + odds, hedge book + odds, guaranteed profit $, and conversion %. Expanding shows both stakes and per-outcome payouts/net profit.
- D-08: Each row uses only the best-priced hedge book for that market (one row per market).

**Refresh & credits**
- D-09: One refresh fetches all in-season sports from the D-01 list (bulk `/sports/{sport}/odds`, h2h, regions covering the CO books).
- D-10: No cooldown. If a refresh is pressed within 15 minutes of the last refresh, show an in-page confirmation ("Odds were refreshed N min ago. Refresh again and spend ~X credits?") before fetching. Must be an in-page dialog, not `window.confirm`.
- D-11: Credit guard from the API's `x-requests-remaining` header: warning banner under 100 credits, refresh disabled under 20 credits until the monthly reset.
- D-12: Odds age shown at the top ("Odds updated 42 min ago"); turns amber after 2 hours with "Refresh before betting".
- D-13: Between refreshes the finder computes from the cached odds and shows the timestamp (ODDS-04). Finder queries themselves spend no credits.

**Book coverage**
- D-14: The bonus-book dropdown lists only books with Odds API coverage. Books without coverage (bet365, Circa, SBK, BetMonarch) are hidden until manual odds entry (v2, ODDS-06).
- D-15: Hedge books = every API-covered Colorado book (no per-user filtering until Phase 2).
- D-16: If the live check shows Caesars and/or Fanatics are paid-tier only, leave them out of the config and note why; revisit with a paid tier later. **(Resolved by this research — see Summary. Official docs confirm both are paid-tier-only.)**
- D-17: Same-book hedging is allowed: if the bonus book also has the best price on the other side, the finder may suggest it.

### Claude's Discretion
- Page layout and visual styling (refined by `01-UI-SPEC.md`, already approved).
- Cache storage shape (Postgres tables for odds snapshots and credit usage), refresh implementation (server action or route handler), and how the credit estimate for a refresh is computed.
- Whether a refresh is available without login in this phase (the app has no auth until Phase 2; keep it local/undeployed or behind a simple shared secret if deployed early).

### Deferred Ideas (OUT OF SCOPE)
- NHL (owner will add later; 3-way/overtime moneyline handling needs checking then).
- Spreads/totals as hedge markets (3x credit cost) — revisit with a paid tier or ODDS-08.
- Showing runner-up hedge books in the expanded row.

</user_constraints>

## Phase Requirements

<phase_requirements>

| ID | Description | Research Support |
|----|-------------|------------------|
| CALC-01 | Compute bonus-bet (stake-not-returned) hedges: exact stakes, guaranteed profit, conversion % | `## Bonus-Bet Hedge Formula` — exact formula, worked fixtures, decimal.js pattern |
| CALC-04 | Guaranteed profit identical to the cent whichever side wins, verified against known-answer fixtures | `## Cent-Rounding Rule (resolves CONTEXT.md flag)` — explicit rounding algorithm + fixture |
| CALC-05 | Hedges only use markets with no push/void outcome (2-way moneylines) | `## NFL Moneyline Tie/Push Resolution (resolves CONTEXT.md flag)` |
| ODDS-01 | Fetch odds for CO books from The Odds API and cache them; nothing polls automatically | `## The Odds API v4 Contract`, `## Architecture Patterns` Pattern 2/4 |
| ODDS-02 | Remaining monthly credits visible; refreshes blocked/warned when low | `## The Odds API v4 Contract` (quota headers), D-10/D-11 credit math worked example |
| ODDS-03 | User sees how old the odds behind each opportunity are | `## Data Model` `cached_odds.fetched_at` |
| ODDS-04 | Refresh button re-fetches and recomputes; between refreshes shows last results with timestamp | `## Architecture Patterns` Pattern 4, Next.js server action recommendation |
| ODDS-05 | CO book list (with Odds API keys, incl. theScore Bet) stored as config, verified against a live API call | `## Colorado Book Config` table + `## Package Legitimacy Audit` / verification checkpoint |
| BONUS-01 | User enters book + bonus amount, sees ranked list of best conversion markets with hedge book, stakes, profit, conversion % | `## Bonus-Bet Hedge Formula`, `## Architecture Patterns` (ranking at read time) |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Stack is fixed: Next.js 16 (App Router) + TypeScript, Drizzle ORM + Neon Postgres, decimal.js for all money math, Vitest for hedge-math tests, Zod for runtime validation, iron-session for auth (not used until Phase 2), React Hook Form for the manual-entry form pattern (used here for the finder's own input form).
- `@neondatabase/serverless` is required for the Postgres driver when running from Vercel serverless/edge — do not use a raw `pg` TCP driver.
- decimal.js (or big.js) is mandatory for every stake/profit calculation; native JS floating point is explicitly forbidden for money math.
- Playwright/scraping is out of scope for this phase (Phase 3+).
- GitHub Actions cron, not Vercel Cron, for any future scheduled job — not needed in Phase 1 since nothing polls automatically (ODDS-01 explicitly forbids it).
- ESLint + Prettier via Next.js defaults — no extra decisions needed.
- drizzle-kit `generate` + `migrate` (not `push`) — commit generated SQL migrations to the repo so they stay in sync across environments. This project directive overrides the generic Drizzle "quickstart" docs, which default to `drizzle-kit push` for early prototyping.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Finder form (book + amount + sport filter input) | Browser / Client | Frontend Server (SSR) | Client-side form state (React Hook Form) with server-rendered shell; submission triggers a server action, not client-side fetch to an external API |
| Odds API calls (`/sports`, `/odds`) | API / Backend | — | Must never run in the browser — the API key is a server-only secret; a server action or route handler is the only caller |
| Odds cache + credit counter | Database / Storage | API / Backend | Postgres is both the cache and the source of truth for `x-requests-remaining`; the backend reads/writes it, never re-derives from a fresh API call per page view |
| Hedge calculation (bonus-bet solver) | API / Backend | — | Pure TypeScript function, zero I/O, invoked server-side after odds are read from cache — must never run in the browser to avoid duplicating decimal.js bundle weight and to keep the one calculation path authoritative |
| Ranked results list rendering | Frontend Server (SSR) | Browser / Client | Server Component renders the ranked list from a server action's return value; client-side only handles the expand/collapse interaction (shadcn `Collapsible`) |
| Credit meter / odds-age display | Frontend Server (SSR) | Browser / Client | Values are computed server-side from the cache row; client only re-renders on interaction (no client-side polling, consistent with "nothing polls automatically") |
| Colorado book config | Database / Storage | API / Backend | Stored as seed data / config table per Pitfall 10 (never hardcoded in multiple places); backend reads it to populate both the dropdown and the odds-fetch bookmaker list |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.6 | Full-stack app (UI + server actions) | [VERIFIED: npm registry] current version confirmed via `npm view next version`; matches project-level STACK.md recommendation. Requires Node >=20.9 [CITED: nextjs.org/docs/app/guides/upgrading/version-16] — local environment runs Node 25.8.1, satisfies this. |
| react / react-dom | 19.3.0 | UI runtime | [VERIFIED: npm registry] `create-next-app@latest` pins this automatically with next@16.3.x. |
| typescript | 5.7+ (repo installs whatever `create-next-app` pins; latest on registry is 7.0.2) | Type safety for hedge math | [ASSUMED] CLAUDE.md specifies "5.7+" as a floor, not an exact pin — `create-next-app`'s pinned TS version should be accepted as-is rather than force-installing the bleeding-edge 7.x, since 7.x is a very recent major bump not yet covered by CLAUDE.md's guidance. Flag for confirmation if `create-next-app` pins something CLAUDE.md didn't anticipate. |
| drizzle-orm | 0.45.3 | DB access / query builder | [VERIFIED: npm registry] matches CLAUDE.md's `0.45.x` pin exactly. |
| drizzle-kit | 0.31.11 | Migrations CLI | [VERIFIED: npm registry] matches CLAUDE.md's `0.31.x` pin exactly; keep in the same minor family as drizzle-orm per CLAUDE.md compatibility note. |
| @neondatabase/serverless | 1.1.0 | Postgres driver (HTTP) over Neon | [VERIFIED: npm registry] matches CLAUDE.md's `1.1.x` pin; use the `neon-http` Drizzle adapter (see Drizzle+Neon Setup below), not `pg`. |
| decimal.js | 10.6.0 | Exact decimal math for stakes/profit | [VERIFIED: npm registry] current; CLAUDE.md mandates this (or big.js) for all money math — native floats are forbidden. |
| zod | 4.6.5 | Runtime validation of API responses + form input | [VERIFIED: npm registry] matches CLAUDE.md's `4.x` pin. |
| vitest | 5.0.2 | Hedge-math unit tests | [VERIFIED: npm registry] Vitest reached a stable 5.0.0 release (confirmed via `npm view vitest versions`, most recent are 5.0.0-rc.4 -> 5.0.0 -> 5.0.1 -> 5.0.2 — a real, non-prerelease major). CLAUDE.md only said "Vitest" with no version pin; 5.0.2 is current and stable. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-hook-form | 7.88.0 | Finder form state (book, amount, sport filter) | [VERIFIED: npm registry] matches CLAUDE.md's `7.x` pin. Used here for the finder's own input form, not just future manual promo entry. |
| @hookform/resolvers | 5.9.1 | zodResolver bridge | [VERIFIED: npm registry], but see Common Pitfalls — a documented TS-level (not runtime) type-overload mismatch exists between recent `@hookform/resolvers` and `zod@4.3.x+` minor versions [CITED: github.com/react-hook-form/resolvers/issues/842]. |
| tailwindcss | 4.3.3 | Styling (per UI-SPEC) | [VERIFIED: npm registry] `create-next-app@latest --tailwind` pins a compatible v4 automatically. |
| lucide-react | 1.48.0 | Icons (shadcn default, per UI-SPEC) | [VERIFIED: npm registry] |
| bcrypt | 6.0.0 | Password hashing | Not used in Phase 1 (no auth until Phase 2) — listed for completeness since it's in the project's overall stack; do not install until Phase 2 needs it. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| decimal.js | big.js | Either satisfies "no native floats" — decimal.js has richer rounding-mode API (`ROUND_HALF_UP`, `ROUND_DOWN`, etc.) needed for the cent-rounding rule below; stick with decimal.js since CLAUDE.md lists it first and it's already the STACK.md default. |
| `drizzle-kit generate`+`migrate` | `drizzle-kit push` | `push` is Drizzle's own quickstart default for early prototyping (no migration files) — CLAUDE.md explicitly overrides this in favor of committed SQL migration files for reproducibility across GitHub Actions/local/Vercel; use `generate`+`migrate` per CLAUDE.md, not `push`. |
| Server action for refresh | Route handler (`app/api/refresh/route.ts`) | A route handler is only needed if something outside the Next.js app must trigger a refresh (it doesn't, in this phase) — a Server Action is simpler, integrates with `revalidatePath`, and keeps the Odds API key server-only without a separate endpoint to secure [CITED: makerkit.dev/blog/tutorials/server-actions-vs-route-handlers, nextjs.org docs]. |

**Installation:**
```bash
npx create-next-app@latest promoprofit --typescript --app --tailwind
cd promoprofit
npm install drizzle-orm @neondatabase/serverless zod react-hook-form @hookform/resolvers decimal.js
npm install -D drizzle-kit vitest dotenv tsx
npx shadcn init   # new-york / zinc / css-variables, per 01-UI-SPEC.md
```
Do not install `iron-session` or `bcrypt` yet — they belong to Phase 2 (auth). If CONTEXT.md's discretion note leads the planner to add a shared-secret gate for an early deploy, that can be a minimal middleware check (env var comparison), not a reason to pull in the full auth stack early.

**Version verification performed:** all versions above were checked live via `npm view <pkg> version` against the npm registry on 2026-09-25 (see Package Legitimacy Audit for the corresponding safety check). CLAUDE.md's stack table versions matched the live registry exactly for every pinned package (next, drizzle-orm, drizzle-kit, @neondatabase/serverless, iron-session, zod) — no drift found.

## Package Legitimacy Audit

slopcheck was available in this environment and was run against every package this phase installs.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| next | npm | ~10 yrs | very high | github.com/vercel/next.js | OK | Approved |
| react / react-dom | npm | ~12 yrs | very high | github.com/facebook/react | OK | Approved |
| drizzle-orm | npm | ~4 yrs | high | github.com/drizzle-team/drizzle-orm | OK | Approved |
| drizzle-kit | npm | ~4 yrs | high | github.com/drizzle-team/drizzle-orm | OK | Approved |
| @neondatabase/serverless | npm | ~3 yrs | high | github.com/neondatabase/serverless | OK | Approved |
| decimal.js | npm | ~10 yrs | very high | github.com/MikeMcl/decimal.js | OK | Approved |
| zod | npm | ~7 yrs | very high | github.com/colinhacks/zod | OK | Approved |
| react-hook-form | npm | ~6 yrs | high | github.com/react-hook-form/react-hook-form | OK | Approved |
| @hookform/resolvers | npm | ~5 yrs | high | github.com/react-hook-form/resolvers | OK | Approved |
| tailwindcss | npm | ~9 yrs | very high | github.com/tailwindlabs/tailwindcss | OK | Approved |
| lucide-react | npm | ~4 yrs | high | github.com/lucide-icons/lucide | OK | Approved |
| vitest | npm | created 2021-12-03 (~4.7 yrs), unpacked size ~2.7MB, official Vite-team package | high | github.com/vitest-dev/vitest | **SUS** (`TYPOSQUAT_RISK`: "Suspiciously close to 'vite'. Could be a typosquat.", suggested alternative: `vite`) | Flagged, then approved — see note below |

**Note on the `vitest` SUS flag:** slopcheck's heuristic fired because `vitest` is a short edit-distance from `vite`. This is a known false-positive pattern for this specific package: `vitest` is maintained by the Vite core team, has a 4.7-year registry history, a canonical GitHub repo (`vitest-dev/vitest`), and is the test runner CLAUDE.md explicitly names for this project. It is not a typosquat of `vite` — it is a different, equally-official package by the same maintainers. Approved without a `checkpoint:human-verify` gate given this corroborating evidence, but documented here per the audit protocol rather than silently dropped.

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest` — resolved above with corroborating evidence (official repo, maintainer identity, multi-year history); no additional planner checkpoint required.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                             │
│  Finder form (React Hook Form + Zod) ──submit──▶ Server Action       │
│  Results list (expand/collapse, shadcn Collapsible)                  │
│  Odds status bar (age, credit meter) — rendered from server data     │
└───────────────────────────┬───────────────────────────────────────┬─┘
                             │ (1) find-hedges action                │ (2) refresh-odds action
                             ▼                                        ▼
┌────────────────────────────────────────────┐   ┌─────────────────────────────────────────┐
│  Server Action: findHedges(book, amount,     │   │  Server Action: refreshOdds()            │
│  sportFilter?)                               │   │  1. Check x-requests-remaining cache row │
│  1. Read cached_odds rows (no API call)      │   │  2. If <20 credits -> block, return error │
│  2. Filter: in next 7 days, h2h market,      │   │  3. If refreshed <15 min ago -> return    │
│     books from Colorado config               │   │     "confirm" signal (client shows dialog)│
│  3. For each event: find opposing side's     │   │  4. GET /sports (free) -> in-season list  │
│     best price across all CO books (D-08)    │   │  5. For each in-season sport: GET         │
│  4. Call hedge engine (pure fn) per event     │   │     /sports/{sport}/odds (h2h, us+us2)    │
│  5. Sort by guaranteed profit desc, top 10    │   │  6. Upsert cached_odds rows, read          │
│     (D-06)                                    │   │     x-requests-remaining from response     │
│  6. Return ranked results + odds timestamp    │   │     headers, persist to credit_usage table │
└──────────────────────┬───────────────────────┘   │  7. Return new timestamp + credit count     │
                       │                             └──────────────────┬──────────────────────┘
                       ▼                                                ▼
              ┌────────────────────┐                          ┌─────────────────────┐
              │  cached_odds table │◀─────────writes───────────│  The Odds API (v4)   │
              │  (Postgres/Neon)   │                            │  api key server-only │
              └────────────────────┘                            └─────────────────────┘
                       ▲
                       │ reads (zero-quota)
              ┌────────┴────────────┐
              │  Hedge Engine        │  pure functions, decimal.js, zero I/O
              │  domain/hedge/       │  bonusBet.ts — fixture-tested in Vitest
              └──────────────────────┘
```

A reader can trace BONUS-01's primary use case end to end: form submit -> `findHedges` server action -> cached odds read -> hedge engine -> ranked list back to the browser, with zero Odds API calls on that path (satisfying D-13 "finder queries themselves spend no credits"). The only path that calls the external API is the separate `refreshOdds` action (ODDS-04), gated by the credit checks (ODDS-02) before it fires.

### Recommended Project Structure

```
src/
├── app/
│   ├── page.tsx                  # finder page (status bar, form, results) per UI-SPEC
│   └── actions/
│       ├── find-hedges.ts        # server action: reads cache, calls hedge engine
│       └── refresh-odds.ts       # server action: calls Odds API, updates cache + credit counter
├── domain/
│   └── hedge/
│       ├── bonusBet.ts           # pure hedge-stake/profit/conversion solver
│       ├── americanOdds.ts       # American <-> decimal odds conversion helpers
│       ├── rounding.ts           # cent-rounding rule (see below)
│       └── bonusBet.test.ts      # Vitest fixture suite (CALC-01, CALC-04, CALC-05)
├── ingestion/
│   └── odds/
│       ├── client.ts             # thin Odds API REST wrapper, reads quota headers
│       ├── config.ts             # Colorado book config (bookmaker keys, region, tier)
│       └── quota.ts              # credit-guard logic (D-10/D-11 thresholds)
├── db/
│   ├── schema.ts                 # Drizzle schema: cached_odds, credit_usage, books
│   └── client.ts                 # neon-http drizzle client
└── components/
    └── finder/                    # shadcn-based UI components per 01-UI-SPEC.md
drizzle/                            # generated SQL migrations (drizzle-kit generate output)
drizzle.config.ts
vitest.config.ts
```

### Pattern 1: Bonus-bet hedge as its own pure function (no shared formula with future boost math)

**What:** `domain/hedge/bonusBet.ts` exports a single function that takes plain data (bonus amount, bonus-side American odds, hedge-side American odds) and returns plain data (hedge stake, profit, conversion %). No class, no dependency on the Odds API client or DB.
**When to use:** Every bonus-bet calculation in this phase and every phase after it (Phase 3's boost math must NOT reuse or parameterize this function — see Pitfall 2 in project PITFALLS.md).
**Example:**
```typescript
// Source: project PITFALLS.md Pitfall 1/2, FEATURES.md Core Calculation Reference — synthesized into a decimal.js implementation
import Decimal from "decimal.js";

export function americanToDecimal(american: number): Decimal {
  const a = new Decimal(american);
  return a.gte(0)
    ? a.dividedBy(100).plus(1)
    : new Decimal(100).dividedBy(a.abs()).plus(1);
}

export interface BonusBetHedgeInput {
  bonusAmount: Decimal;   // B
  bonusOddsAmerican: number; // Ob (American)
  hedgeOddsAmerican: number; // Oh (American)
}

export interface BonusBetHedgeResult {
  hedgeStake: Decimal;      // H, rounded to the cent
  guaranteedProfit: Decimal; // min(profit if bonus wins, profit if hedge wins), rounded to the cent
  conversionPct: Decimal;    // guaranteedProfit / bonusAmount
}

export function calculateBonusBetHedge(input: BonusBetHedgeInput): BonusBetHedgeResult {
  const Ob = americanToDecimal(input.bonusOddsAmerican);
  const Oh = americanToDecimal(input.hedgeOddsAmerican);
  const B = input.bonusAmount;

  // Unrounded hedge stake: H = B * (Ob - 1) / Oh
  const hExact = B.times(Ob.minus(1)).dividedBy(Oh);

  // See "Cent-Rounding Rule" — try floor-cent and ceil-cent, keep whichever
  // maximizes the guaranteed (minimum) profit.
  const candidates = [
    hExact.toDecimalPlaces(2, Decimal.ROUND_DOWN),
    hExact.toDecimalPlaces(2, Decimal.ROUND_UP),
  ];

  let best = { H: candidates[0], guaranteed: new Decimal(-Infinity) };
  for (const H of candidates) {
    const profitIfBonusWins = B.times(Ob.minus(1)).minus(H);
    const profitIfHedgeWins = H.times(Oh.minus(1));
    const guaranteed = Decimal.min(profitIfBonusWins, profitIfHedgeWins);
    if (guaranteed.gt(best.guaranteed)) best = { H, guaranteed };
  }

  return {
    hedgeStake: best.H,
    guaranteedProfit: best.guaranteed.toDecimalPlaces(2, Decimal.ROUND_DOWN),
    conversionPct: best.guaranteed.dividedBy(B).times(100).toDecimalPlaces(2, Decimal.ROUND_DOWN),
  };
}
```

### Pattern 2: Two-tier odds fetching — bulk only in this phase

**What:** Because D-02 restricts this phase to moneyline (h2h) only, every refresh uses the cheap bulk endpoint (`/sports/{sport}/odds?markets=h2h&regions=us,us2`) — the expensive per-event endpoint is never needed in Phase 1 (it only matters once player props/alt-lines are in scope, which is explicitly deferred). This keeps Phase 1's credit math simple and cheap.
**When to use:** Every `refreshOdds` call.
**Worked credit example (derived from D-01/D-09/D-16 and the official cost formula, verified against docs):**
- CO books with free-tier Odds API coverage split across two regions: `us` (`draftkings`, `fanduel`, `betmgm`, `betrivers` — `williamhill_us`/Caesars and `fanatics` excluded per D-16, confirmed paid-only) and `us2` (`espnbet`/theScore Bet, `hardrockbet`, `ballybet`).
- To cover all free-tier CO books in one refresh, request `regions=us,us2` (2 regions) x `markets=h2h` (1 market) = **2 credits per in-season sport, per refresh**.
- D-01 lists 5 sports (NFL, NBA, MLB, NCAAF, NCAAB); D-04 skips out-of-season ones via the free `/sports` call. Worst case (all 5 in season simultaneously, e.g. early September) = **10 credits per refresh**.
- At 500 free credits/month, that's ~50 full-refreshes/month if every sport is always in season — comfortably supports "a few refreshes per session, a few sessions per week" for a small friend group, with headroom before the D-11 warning threshold (100 credits remaining) triggers.
- This number (~2-10 credits, depending on season) is what the D-10 confirmation dialog and D-11 banners should estimate as "~X credits" — compute it dynamically from the current in-season sport count, don't hardcode "10".

### Pattern 3: Quota-aware caching, not scheduled polling (ODDS-01, D-13)

**What:** No cron. `findHedges` reads only from `cached_odds`; `refreshOdds` is the only writer and the only caller of the external API, and it's entirely user-triggered.
**When to use:** All odds access in this phase.
**Trade-offs:** Odds can be up to hours stale between refreshes (D-12 surfaces this via the amber "Refresh before betting" state at 2h) — acceptable per project PITFALLS.md Pitfall 4, since the tool computes a *recommendation* to verify at bet-placement time, not a live guarantee.

### Anti-Patterns to Avoid
- **Fetching odds from a Server Component render or route handler GET without a cache check:** any code path that calls the Odds API on page load (rather than only from the explicit `refreshOdds` action) violates ODDS-01/D-13 and burns quota on every page view, not just user-initiated refreshes.
- **Sharing one `calculateHedge()` function between bonus-bet and future boost math:** even though Phase 1 only implements bonus-bet, name the function/module specifically `bonusBet`, not a generic `hedge`, so Phase 3 doesn't reach for "just add a flag" (project PITFALLS.md Pitfall 2).
- **Reading `x-requests-remaining` fresh on every page view to show the credit meter:** the header is only present on responses to actual API calls; the credit meter must read the *last persisted* value from `credit_usage`, updated only when `refreshOdds` runs — there is no endpoint to query current quota without making a billable call.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| American <-> decimal odds conversion | A custom ad-hoc formula scattered across UI and hedge engine | One shared `americanToDecimal`/`decimalToAmerican` pair in `domain/hedge/americanOdds.ts`, decimal.js-typed | Single source of truth prevents the classic "UI displays -110, math used 1.909 vs 1.91" drift bug |
| Decimal rounding to the cent | Manual `Math.round(x * 100) / 100` | decimal.js `.toDecimalPlaces(2, Decimal.ROUND_*)` | Native float rounding reintroduces the exact floating-point error class CLAUDE.md forbids; decimal.js rounding modes are explicit and testable |
| Credit-quota tracking | Re-deriving "credits used" by counting your own app's call log | Read `x-requests-remaining` directly from the Odds API response headers and persist that number | The header is the API's own authoritative count (accounts for any external usage on the same key too); a self-counted log can drift if the key is ever used outside this app |
| Postgres schema migrations | Hand-written ALTER TABLE scripts | `drizzle-kit generate` + `drizzle-kit migrate`, committed to the repo | CLAUDE.md explicitly requires this pattern; keeps GitHub Actions/local/Vercel schema in sync |
| Form validation for bonus amount / book select | Manual `if` checks scattered in the server action | Zod schema shared between React Hook Form (`zodResolver`) on the client and the server action's own re-validation | Server actions are callable directly (not just via the form), so server-side re-validation with the same schema is required, not optional, for a money-input field |

**Key insight:** every "don't hand-roll" item above exists because this domain punishes silent drift between two supposedly-identical calculations (UI vs. engine, client validation vs. server validation, self-counted quota vs. API's own count) — the fix in each case is "one source of truth, referenced from both places," not "write it carefully twice."

## Bonus-Bet Hedge Formula

[VERIFIED via project-level FEATURES.md, arithmetically re-derived and cross-checked in this session]

Given bonus amount `B`, bonus-side American odds converted to decimal `Ob`, hedge-side American odds converted to decimal `Oh`:

```
H (hedge stake)      = B × (Ob − 1) / Oh
Profit if bonus wins = B × (Ob − 1) − H
Profit if hedge wins  = H × (Oh − 1)
Guaranteed profit     = the above two, made equal by construction before rounding
Conversion %          = Guaranteed profit / B
```

**Reference fixture (must reproduce exactly, per CONTEXT.md and ROADMAP.md success criteria):** $100 bonus bet at +300 (Ob = 4.00), hedge at −275 (Oh ≈ 1.363636...) -> H = $220.00, profit = $80.00, conversion = 80%. Verified by hand: `H = 100 × 3 / 1.363636... = 220.00` exactly (no rounding needed in this particular fixture since 220.00 is exact to the cent); `profit = 220 × 0.363636... = 80.00`. This fixture has no rounding ambiguity — use it as the "clean" baseline test, and add a second fixture (below) that specifically exercises the rounding edge case.

## Cent-Rounding Rule (resolves CONTEXT.md flag)

**The problem, as documented in CONTEXT.md `<specifics>`:** `H = B × (Ob − 1) / Oh` is not generally an exact multiple of $0.01. Rounding `H` naively (e.g., always round-half-up) can make `profit_if_bonus_wins` and `profit_if_hedge_wins` differ by $0.01 — CONTEXT.md's own example: $50 bonus at +290 hedged at −310 -> $109.63 hedge, $35.37 vs $35.36 profit depending on which side wins. CALC-04 requires the displayed guaranteed profit to be true "whichever side wins."

**Recommended rule (implemented in the Pattern 1 code example above):**
1. Compute the exact, unrounded `H`.
2. Round `H` to the cent two ways: floor (`ROUND_DOWN`) and ceiling (`ROUND_UP`).
3. For each candidate `H`, compute both outcome profits.
4. Pick whichever candidate `H` produces the **higher minimum** of the two outcome profits (i.e., the better guaranteed floor).
5. Display that minimum as "Guaranteed profit" — never the higher of the two outcomes. This makes the displayed number a true lower bound: the user will get *at least* this much regardless of which side wins, which is what "guaranteed" must mean when perfect cent-for-cent equality isn't achievable.

This satisfies CALC-04's intent (a number that holds "whichever side wins") even in the case where the two outcomes land a literal $0.01 apart after rounding — the displayed figure is always achievable, never optimistic.

**Required fixture for this case:** $50 bonus at +290 (Ob = 3.90), hedge at −310 (Oh ≈ 1.32258...). Unrounded `H = 50 × 2.90 / 1.32258... ≈ 109.634...`. Candidates: `109.63` and `109.64`.
- At H=109.63: profit-if-bonus-wins = `50×2.90 − 109.63 = 35.37`; profit-if-hedge-wins = `109.63 × 0.32258... ≈ 35.37`. (Recompute precisely in the test — CONTEXT.md's own worked numbers of $35.37/$35.36 should be reproduced and asserted exactly; the algorithm above resolves it by picking the candidate that maximizes the minimum, so the test should assert the *displayed* guaranteed profit equals the lower, safe value and that it does not vary based on which outcome actually occurs.)
- Write this exact case as a named Vitest fixture (e.g. `"rounding edge case: $50 @ +290 hedged @ -310"`) asserting both the hedge stake and the guaranteed profit are stable, deterministic values — this is the regression test that locks in the rounding rule.

## NFL Moneyline Tie/Push Resolution (resolves CONTEXT.md flag)

**Question raised in CONTEXT.md:** NFL regular-season games can end in a tie (~1 in 272 games historically, <1% [CITED: multiple sportsbook-rules sources, MEDIUM confidence — see Sources]), and US sportsbooks settle moneyline bets as a push (stake refunded) on a tie [CITED: legalsportsreport.com, bleachernation.com, rg.org — multiple independent sources converge, MEDIUM-HIGH confidence]. The Odds API's `h2h` market (used for all sports in this phase, per D-02) has no 3-way alternative for American football — `h2h_3_way` exists only for sports where a draw is a normal listed outcome (soccer) or period-level sub-markets (hockey/baseball), not for NFL/NCAAF game-level moneyline [CITED: the-odds-api.com/sports-odds-data/betting-markets.html]. This appears to put NFL moneyline hedges in tension with CALC-05's "no push/void outcome" rule.

**Key finding that changes the risk calculus:** in a *bonus-bet hedge* specifically (not a general two-independent-bets hedge), a tie voids **both legs symmetrically** — the bonus-bet leg (free money) is voided/forfeited with no cash cost, and the hedge leg (real cash) is refunded in full since neither team won. There is no asymmetric loss scenario here (unlike, say, a whole-number point-spread push against a separately-losing leg, which is the scenario project PITFALLS.md Pitfall 6 warns about). The realistic downside of an NFL tie in this specific bonus-bet-hedge context is: **guaranteed profit becomes $0 instead of the calculated amount, with no real cash loss** — a forgone-profit event, not a loss event, occurring in <1% of NFL games.

**Recommendation for the planner:** proceed with including NFL in the D-01 sport list (already locked) and treat this as a disclosure requirement, not a market-exclusion requirement:
- Add a lightweight, dismissible note/badge on NFL rows only (e.g., "Regular-season NFL games can end in a tie (<1% historically) — a tie voids both legs, profit becomes $0, no cash loss") rather than blocking NFL hedges outright, which would contradict D-01.
- This is presented as a recommendation, not a locked decision — flag it in Open Questions below for explicit confirmation, since it is a defensible-but-debatable interpretation of CALC-05's "no push/void" requirement applied to a case where the push is symmetric and harmless rather than asymmetric and lossy.
- NBA, MLB, NCAAB moneylines cannot tie (no regulation/overtime rules allow it). NCAAF (college football) also plays to a defined winner every game (no ties in the modern rule set) — confirm this specifically if the planner wants full rigor, but it is standard, uncontested knowledge that college football has not permitted tie results since 1996 [ASSUMED — not independently re-verified this session, low-risk given how settled this rule is].

## Data Model

Minimal Postgres schema (Drizzle) to support this phase — the planner should size exact column types, but the shape is:

```typescript
// db/schema.ts (sketch — planner refines exact types/constraints)
export const books = pgTable("books", {
  key: text("key").primaryKey(),          // e.g. "draftkings", "espnbet"
  displayName: text("display_name").notNull(), // e.g. "theScore Bet"
  region: text("region").notNull(),        // "us" | "us2"
  apiCoverage: boolean("api_coverage").notNull(), // false for bet365/Circa/SBK/BetMonarch
  tier: text("tier").notNull(),            // "free" | "paid_only" (Caesars/Fanatics)
});

export const cachedOdds = pgTable("cached_odds", {
  id: serial("id").primaryKey(),
  sportKey: text("sport_key").notNull(),   // "americanfootball_nfl", etc.
  eventId: text("event_id").notNull(),
  commenceTime: timestamp("commence_time").notNull(),
  rawResponse: jsonb("raw_response").notNull(), // full API payload for this event/market
  fetchedAt: timestamp("fetched_at").notNull(),
});

export const creditUsage = pgTable("credit_usage", {
  id: serial("id").primaryKey(),
  requestsRemaining: integer("requests_remaining").notNull(),
  requestsUsed: integer("requests_used").notNull(),
  lastRequestCost: integer("last_request_cost"),
  recordedAt: timestamp("recorded_at").notNull(),
});
```

`books` is seeded once (config-as-data per Pitfall 10, D-14/D-16) and updated only when the CO book list changes. `cachedOdds` is truncated/upserted on every `refreshOdds` call. `credit_usage` gets one new row per refresh (or an upsert to a single row) — this is what the credit meter and D-10/D-11 logic read from, never a fresh API call.

## The Odds API v4 Contract

[VERIFIED via WebFetch against official docs, 2026-09-25]

**Endpoints relevant to this phase:**
- `GET /v4/sports/?apiKey={apiKey}` — **zero-quota cost** (explicitly stated in docs). Use for D-04's in-season check before spending any credits on `/odds`.
- `GET /v4/sports/{sport}/odds/?apiKey={apiKey}&regions={regions}&markets=h2h` — bulk odds for every event in that sport. Cost = `markets × regions` (1 x 2 = 2 credits per sport per refresh, per the D-09 worked example above).
- `GET /v4/sports/{sport}/events?apiKey={apiKey}` — zero-quota, not needed for Phase 1's h2h-only scope (relevant to future manual promo entry in later phases) but useful as a lighter-weight event list if needed for the sport filter's game display.

**Quota headers (present on every metered response):**
- `x-requests-remaining`
- `x-requests-used`
- `x-requests-last` (cost of the just-completed request)

Persist all three to `credit_usage` after every `refreshOdds` call; the D-11 warning (<100) and block (<20) thresholds read `x-requests-remaining` from the most recent row.

**Colorado bookmaker keys and tier status (CITED: the-odds-api.com/sports-odds-data/bookmaker-apis.html, fetched 2026-09-25):**

| Key | Display name | Region | Free-tier status |
|-----|--------------|--------|-------------------|
| `draftkings` | DraftKings | us | Free |
| `fanduel` | FanDuel | us | Free |
| `betmgm` | BetMGM | us | Free |
| `betrivers` | BetRivers | us | Free |
| `williamhill_us` | Caesars | us | **Paid subscriptions only** (explicit in docs) — excluded per D-16 |
| `fanatics` | Fanatics | us | **Paid subscriptions only** (explicit in docs) — excluded per D-16 |
| `espnbet` | theScore Bet | us2 | Free (region us2) — docs already list the display name as "theScore Bet" against the `espnbet` key, confirming the rebrand mapping |
| `hardrockbet` | Hard Rock Bet | us2 | Free |
| `ballybet` | Bally Bet | us2 | Free |

`bet365`, `circa`, `betmonarch`, `sbk` do not appear in The Odds API's documented bookmaker list at all — these remain "manual odds entry required" per D-14, out of scope for API-sourced hedges in this phase.

**Still requires a live-call checkpoint at execution time (no API key available in this research session):** confirm the `espnbet` key still returns live data (rather than having been silently dropped or renamed again) and confirm the free-tier key actually receives data for all the "Free" rows above — the docs describe the intended tier structure, but a live smoke-test call is the only way to catch a docs/reality drift on the day the phase is executed. This should be an explicit `checkpoint:human-verify` or automated startup-check task in the plan (ODDS-05's own requirement text already calls for this verification).

## Drizzle + Neon Setup

[CITED: orm.drizzle.team Neon quickstart, adapted per CLAUDE.md's migrate-not-push directive]

```typescript
// db/client.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql, schema });
```

```typescript
// drizzle.config.ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

**Migration workflow (per CLAUDE.md, not the Drizzle quickstart default):**
```bash
npx drizzle-kit generate   # writes SQL migration files to ./drizzle
npx drizzle-kit migrate    # applies them to the DATABASE_URL target
```
Commit the generated `./drizzle/*.sql` files to the repo. Do not use `drizzle-kit push` even though it's Drizzle's own quickstart-recommended command for early prototyping — CLAUDE.md requires committed migration files so GitHub Actions (used in later phases) and local dev stay in sync.

Use the `neon-http` driver (not `neon-serverless`/WebSocket) since this phase has no need for interactive transactions — every DB operation is a single read or write per server action invocation, which is exactly what `neon-http` is optimized for [CITED: orm.drizzle.team].

## Common Pitfalls

### Pitfall: Bonus-bet math accidentally sharing code with a future "generic hedge" function
**What goes wrong:** A developer factors out `hedgeStake = stake × odds / hedgeOdds` as a shared helper and calls it from bonus-bet with `stake = B×(Ob-1)` as a workaround, quietly reintroducing the stake-returned assumption in a subtle spot.
**Why it happens:** The formulas look superficially similar (`H = X / Oh`).
**How to avoid:** Keep `calculateBonusBetHedge` as a single, self-contained, named function (Pattern 1) with no shared "generic hedge" abstraction until Phase 3 needs one — and even then, per project PITFALLS.md Pitfall 2, boost math should be its own separate module, not a shared core.
**Warning signs:** Any function named generically `calculateHedge` with a boolean or enum branch inside it.

### Pitfall: Displaying a credit estimate that doesn't match what the refresh will actually cost
**What goes wrong:** D-10's confirmation dialog and D-11's warning banner both need to say "~X credits" — if this is hardcoded (e.g., always "10"), it will be wrong whenever fewer than all 5 sports are in season (a very common case, since NFL/NCAAF/NCAAB aren't all simultaneously active most of the year).
**How to avoid:** Compute the estimate live from the `/sports` (zero-cost) response's in-season sport count x 2 credits/sport (per Pattern 2's worked example), not a hardcoded constant.
**Warning signs:** A hardcoded credit number anywhere in UI copy or the confirmation-dialog logic.

### Pitfall: `@hookform/resolvers` + `zod@4.6.5` TypeScript overload mismatch
**What goes wrong:** [CITED: github.com/react-hook-form/resolvers/issues/842, MEDIUM confidence — active GitHub issue as of March 2026] `zodResolver` from recent `@hookform/resolvers` versions can fail TypeScript's overload matching against `zod@4.3.x+` due to a branded internal version type mismatch, even though runtime validation works correctly.
**How to avoid:** If TypeScript compilation fails on the `zodResolver(schema)` call despite correct runtime behavior, this is a known, cosmetic type-level issue — check the linked GitHub issue for the current recommended workaround (often a minor version bump on one side, or an explicit type assertion) rather than assuming the validation logic itself is broken.
**Warning signs:** A TS error mentioning `_zod.version.minor` incompatibility on a `zodResolver` call.

### Pitfall: Treating `x-requests-remaining` as available without a real call
**What goes wrong:** There's no "check my quota" endpoint — the only way to learn the current `x-requests-remaining` value is as a side effect of a metered call. A developer might try to build a "check credits" button that calls a cheap endpoint expecting quota info back.
**How to avoid:** Only `/sports` and `/events` are zero-cost, and they do NOT return quota headers with useful freshness (verify at execution time) — the credit meter must be driven entirely by the persisted `credit_usage` row from the last real `refreshOdds` call, updated only then.
**Warning signs:** Any UI element implying "live" credit count outside of a just-completed refresh.

### Pitfall: Forgetting the Odds API key must never reach the browser bundle
**What goes wrong:** Since the odds fetch is a plain fetch to an external REST API, it's tempting to call it from a client component for simplicity — this would either require exposing `ODDS_API_KEY` via `NEXT_PUBLIC_*` (leaking it to anyone who opens devtools) or fail silently due to CORS.
**How to avoid:** All Odds API calls happen inside the `refreshOdds` server action (or a route handler), which runs server-side only; `ODDS_API_KEY` is a plain (non-`NEXT_PUBLIC_`) environment variable.
**Warning signs:** `NEXT_PUBLIC_ODDS_API_KEY` anywhere in the codebase; any `fetch("https://api.the-odds-api.com/...")` call inside a file with `"use client"`.

## Code Examples

### American <-> Decimal odds conversion
```typescript
// Source: standard, uncontested American-odds conversion formula, decimal.js-typed for this project's precision requirement
import Decimal from "decimal.js";

export function americanToDecimal(american: number): Decimal {
  const a = new Decimal(american);
  return a.gte(0) ? a.dividedBy(100).plus(1) : new Decimal(100).dividedBy(a.abs()).plus(1);
}
```

### Odds API client with quota tracking
```typescript
// Source: The Odds API v4 docs (the-odds-api.com/liveapi/guides/v4/) — header names verified via WebFetch this session
export async function fetchSportOdds(sportKey: string, regions: string[]) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`);
  url.searchParams.set("apiKey", process.env.ODDS_API_KEY!);
  url.searchParams.set("regions", regions.join(","));
  url.searchParams.set("markets", "h2h");

  const res = await fetch(url, { cache: "no-store" });
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  const lastCost = res.headers.get("x-requests-last");
  // persist remaining/used/lastCost to credit_usage table
  if (!res.ok) throw new Error(`Odds API error: ${res.status}`);
  return res.json();
}
```

### Zero-cost in-season check (D-04)
```typescript
// Source: The Odds API docs — /sports endpoint documented as not counting against quota
export async function listInSeasonSports(): Promise<string[]> {
  const url = new URL("https://api.the-odds-api.com/v4/sports/");
  url.searchParams.set("apiKey", process.env.ODDS_API_KEY!);
  const res = await fetch(url, { cache: "no-store" });
  const sports: Array<{ key: string; active: boolean }> = await res.json();
  const wanted = new Set(["americanfootball_nfl", "basketball_nba", "baseball_mlb", "americanfootball_ncaaf", "basketball_ncaab"]);
  return sports.filter(s => s.active && wanted.has(s.key)).map(s => s.key);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| ESPN Bet as the theScore-region bookmaker brand | theScore Bet (same `espnbet` API key) | Dec 1, 2025 rebrand [CITED: project SUMMARY.md, cross-referenced with live Odds API bookmaker docs] | UI must display "theScore Bet"; backend keeps querying `espnbet` — do not rename the API key, only the display label |
| `drizzle-kit push` as the default migration flow | `drizzle-kit generate` + `migrate` with committed SQL | N/A (project-specific override, not an upstream deprecation) | Ensures reproducible schema across GitHub Actions/local/Vercel per CLAUDE.md |

**Deprecated/outdated:** None identified specific to this phase's dependency set — all core packages (Next.js 16, Drizzle 0.45.x, decimal.js 10.x) are current, actively maintained major versions, not legacy lines.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `create-next-app@latest`'s pinned TypeScript version (likely newer than the "5.7+" floor CLAUDE.md names) is acceptable to use as-is | Standard Stack > Core | Low — TypeScript is highly backward compatible; a newer major would only matter if it introduces a breaking config change `create-next-app` doesn't already handle |
| A2 | NCAAF (college football) games cannot end in a tie under current rules, so only NFL among the D-01 sport list carries push/tie risk for moneyline | NFL Moneyline Tie/Push Resolution | Low-medium — if wrong, NCAAF rows would also need the tie-disclosure badge; easy to add later, not a math-correctness risk since the symmetric-push analysis applies equally to any sport that can tie |
| A3 | The disclosure-not-exclusion treatment of NFL tie/push risk satisfies the intent of CALC-05, given the symmetric (no real-cash-loss) nature of the push in this specific bonus-bet-hedge context | NFL Moneyline Tie/Push Resolution | Medium — this is an interpretation, not a locked decision; if the owner disagrees, NFL hedges may instead need explicit exclusion or a stronger warning gate. Flagged in Open Questions for confirmation. |
| A4 | The Odds API's `/sports` and `/events` endpoints do not return meaningful `x-requests-remaining` freshness info that could substitute for a metered call | Common Pitfalls | Low — worst case, the credit meter is slightly more conservative (relies only on last refresh) than strictly necessary; verify at execution time with a live call |

## Open Questions (RESOLVED)

1. **Should the NFL tie/push scenario be a disclosure badge or a stronger gate (e.g., require explicit user acknowledgment before showing NFL rows)?**
   - What we know: A tie voids both legs symmetrically with no real cash loss, only forgone profit, in <1% of NFL games (see resolution above).
   - What's unclear: Whether CALC-05's "no push/void outcome" requirement was written with this symmetric case in mind, or whether the owner wants NFL moneylines held to the same bar as spread/total pushes (which PITFALLS.md's Pitfall 6 treats as a hard risk to flag).
   - Recommendation: Ship the lightweight disclosure badge (this research's recommendation) for Phase 1; revisit if the owner flags it during review. This is a reasonable default, not a blocking unknown.
   - RESOLVED: Disclosure badge ("Tie risk") — implemented in 01-01 Task 3 and 01-03 Task 2; owner sign-off requested in 01-05 Task 3 walkthrough step 7.

2. **Exact live-verification method for ODDS-05 at execution time.**
   - What we know: No API key is available in this research session; the bookmaker-tier table above is sourced from official documentation, not a live call.
   - What's unclear: Whether the plan should perform this check as an automated startup smoke-test (e.g., a script run once during scaffold setup) or a manual `checkpoint:human-verify` task the owner runs themselves with their own API key.
   - Recommendation: Automated startup check is preferable (one `GET /v4/sports/{sport}/odds` call for one sport, asserting the expected bookmaker keys appear in the response) — cheap (2-6 credits, one-time) and self-documenting; the planner should decide based on whether the owner wants to gate scaffold completion on having an API key in hand yet.
   - RESOLVED: Standalone `scripts/odds-smoke.ts` (`npm run odds:smoke`) plus a `checkpoint:human-verify` task — 01-04 Task 3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Next.js 16 runtime | Yes | v25.8.1 (>= 20.9 required) | — |
| npm | Package installs | Yes | 11.11.0 | — |
| git | Version control / GSD workflow | Yes | 2.52.0 | — |
| The Odds API key | ODDS-01/02/04/05, all refresh functionality | **Not available in this research session** | — | Plan must include a `checkpoint:human-verify` task for the owner to obtain a free-tier key at `the-odds-api.com` before ODDS-01 can be executed and tested against live data; hedge-engine unit tests (CALC-01/04/05) do not need a real key since they run on fixture data |
| Neon Postgres project + `DATABASE_URL` | Drizzle schema/migrations, cached_odds storage | Not verified this session (no project credentials provided) | — | Plan must include a setup task (create Neon project, free tier) as an early scaffold step; local Postgres (via `psql` — confirmed present, v14.21 via Homebrew) can serve as an interim local dev target before Neon is provisioned, if desired |
| shadcn/ui CLI (`npx shadcn init`) | UI-SPEC scaffold requirement | Yes (npx available) | resolves latest at run time | — |

**Missing dependencies with no fallback:**
- The Odds API key — nothing in this phase can produce real (non-fixture) results without it; gate the "live refresh" tasks behind a checkpoint, but do not block the hedge-engine and scaffold tasks on it.

**Missing dependencies with fallback:**
- Neon project — can develop against local Postgres initially if the owner hasn't provisioned Neon yet, then point `DATABASE_URL` at Neon before deploy.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.2 [VERIFIED: npm registry] |
| Config file | none yet — `vitest.config.ts` is a Wave 0 gap (greenfield repo) |
| Quick run command | `npx vitest run src/domain/hedge` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| CALC-01 | Bonus-bet hedge stake/profit/conversion computed correctly | unit | `npx vitest run src/domain/hedge/bonusBet.test.ts -t "reference fixture"` | Wave 0 |
| CALC-04 | Guaranteed profit stable/identical-in-practice regardless of rounding | unit | `npx vitest run src/domain/hedge/bonusBet.test.ts -t "rounding edge case"` | Wave 0 |
| CALC-05 | Only 2-way, no-push markets considered; NFL tie disclosure logic present | unit | `npx vitest run src/domain/hedge/marketFilter.test.ts` | Wave 0 |
| ODDS-01 | Odds fetched and cached; no auto-poll (no cron/setInterval anywhere in codebase) | integration + manual | `npx vitest run src/ingestion/odds/client.test.ts` (mocked API) + manual code-review check for absence of scheduled fetch | Wave 0 |
| ODDS-02 | Credit banner warning (<100) and block (<20) thresholds fire correctly | unit | `npx vitest run src/ingestion/odds/quota.test.ts` | Wave 0 |
| ODDS-03 | Odds-age display computes correct "N min ago" / amber-at-2h state | unit | `npx vitest run src/components/finder/oddsAge.test.ts` | Wave 0 |
| ODDS-04 | Refresh action re-fetches, updates timestamp, `findHedges` reflects new cache | integration | `npx vitest run src/app/actions/refresh-odds.test.ts` (mocked Odds API) | Wave 0 |
| ODDS-05 | Book config matches live API bookmaker keys | manual-only (justified: requires a real API key/live network call, not suitable for CI without spending real credits on every run) | one-time startup smoke-test script, run manually or as a `checkpoint:human-verify` task | Wave 0 (script itself) |
| BONUS-01 | End-to-end: form input -> ranked top-10 list with hedge book, stakes, profit, conversion % | integration | `npx vitest run src/app/actions/find-hedges.test.ts` (fixture cached-odds rows, no live API) | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/domain/hedge` (fast, no I/O, seconds)
- **Per wave merge:** `npx vitest run` (full suite, including mocked integration tests)
- **Phase gate:** Full suite green before `/gsd:verify-work`; ODDS-05's manual/live check run at least once before considering the phase done, per its own requirement text ("verified against a live API call")

### Wave 0 Gaps
- [ ] `vitest.config.ts` — none exists yet (greenfield repo)
- [ ] `src/domain/hedge/bonusBet.test.ts` — covers CALC-01, CALC-04 (reference fixture + rounding-edge fixture from this document)
- [ ] `src/domain/hedge/marketFilter.test.ts` — covers CALC-05 (h2h-only, NFL disclosure flag)
- [ ] `src/ingestion/odds/client.test.ts`, `src/ingestion/odds/quota.test.ts` — covers ODDS-01/ODDS-02, using a mocked `fetch`
- [ ] `src/app/actions/refresh-odds.test.ts`, `src/app/actions/find-hedges.test.ts` — covers ODDS-04, BONUS-01, using fixture cached-odds rows (no live API dependency)
- [ ] Framework install: `npm install -D vitest` (not yet installed — greenfield repo)
- [ ] One-time live smoke-test script for ODDS-05 (not part of the Vitest suite; a small standalone script or a `checkpoint:human-verify` task)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | No (this phase) | No auth exists until Phase 2; if deployed early, CONTEXT.md's discretion note allows a simple shared-secret gate (env-var comparison in middleware), not full auth |
| V3 Session Management | No (this phase) | Same as above |
| V4 Access Control | Partial | If deployed before Phase 2, the entire app is either local-only or behind one shared secret — no per-user access control exists yet by design |
| V5 Input Validation | Yes | Zod schema for the finder form (bonus amount > 0, book selected, sport filter enum) validated both client-side (React Hook Form + `zodResolver`) and again inside the server action (server actions are directly callable, bypassing client validation) |
| V6 Cryptography | No | No passwords or secrets are generated/stored by the app itself in this phase; `ODDS_API_KEY` and `DATABASE_URL` are plain environment variables (Vercel/local env), not application-managed secrets |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Odds API key exposed to the browser bundle | Information Disclosure | Never reference `ODDS_API_KEY` from a `"use client"` file or a `NEXT_PUBLIC_*` env var; all Odds API calls live inside server actions (see Common Pitfalls) |
| Unauthenticated refresh spam exhausting the shared monthly credit budget (if deployed publicly before Phase 2 auth) | Denial of Service (of the shared resource, the credit budget) | Per CONTEXT.md's discretion note: keep undeployed/local until Phase 2, or gate behind a simple shared secret if an early deploy is needed; the D-10/D-11 credit guards throttle this somewhat regardless but were not designed as an anti-abuse control |
| Malformed/unexpected Odds API response shape silently corrupting cached odds and downstream hedge math | Tampering (of trusted data, not necessarily malicious) | Validate every Odds API response with a Zod schema before writing to `cached_odds`; reject and log (don't silently coerce) on schema mismatch, consistent with project STACK.md's "trust but verify" guidance for this exact data source |
| Server action invoked directly (bypassing the client form) with an out-of-range bonus amount (e.g., negative, absurdly large, non-numeric) | Tampering / Elevation of Privilege (of input trust) | Server actions must re-validate with the same Zod schema used client-side — never assume a server action's caller is the app's own form |

## Sources

### Primary (HIGH confidence)
- https://the-odds-api.com/liveapi/guides/v4/ (fetched via WebFetch, 2026-09-25) — endpoint list, quota headers, credit-cost formulas, zero-cost `/sports` endpoint
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html (fetched via WebFetch, 2026-09-25) — Colorado bookmaker keys, paid-vs-free tier status for Caesars/Fanatics, `espnbet`/theScore Bet key confirmation
- https://the-odds-api.com/sports-odds-data/betting-markets.html (fetched via WebFetch, 2026-09-25) — `h2h` vs `h2h_3_way` market scope confirmation
- npm registry (`npm view <pkg> version`, queried directly, 2026-09-25) — all Standard Stack version numbers
- slopcheck (local tool, run directly, 2026-09-25) — package legitimacy audit for every installed package
- orm.drizzle.team Neon quickstart (fetched via WebFetch, 2026-09-25) — Drizzle + Neon `neon-http` setup pattern, drizzle.config.ts shape

### Secondary (MEDIUM confidence)
- https://www.legalsportsreport.com/how-to-bet/push/, https://www.bleachernation.com/betting/2024/09/13/moneyline-bet-tie/, https://rg.org/guides/football/moneyline-ties (WebSearch, 2026-09-25) — NFL moneyline tie/push settlement convention, tie frequency (~1/272 games)
- https://github.com/react-hook-form/resolvers/issues/842 (WebSearch, 2026-09-25) — `@hookform/resolvers` + `zod@4.3.x+` TypeScript overload mismatch
- https://nextjs.org/docs/app/guides/upgrading/version-16 / WebSearch aggregation (2026-09-25) — Next.js 16 minimum Node.js version (20.9+)
- https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers and related WebSearch results (2026-09-25) — server action vs. route handler recommendation for the refresh button

### Tertiary (LOW confidence)
- None specific to this phase beyond what's already flagged inline (A1-A4 in Assumptions Log)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every version live-verified against npm registry this session, matches CLAUDE.md's pins exactly, slopcheck-audited
- Architecture: HIGH — builds directly on already-verified project-level ARCHITECTURE.md, no novel unverified claims
- Odds API contract: HIGH — endpoints/headers/cost formula and Colorado bookmaker tier status confirmed via official docs this session, resolving two of CONTEXT.md's open flags
- Hedge math / rounding rule: HIGH — formula independently re-derived and arithmetically checked; rounding rule is a defensible engineering decision (documented as such, not overclaimed as the only correct answer)
- NFL tie/push resolution: MEDIUM — settlement convention is well-corroborated across multiple sources, but the "disclosure not exclusion" recommendation is an interpretation flagged in Open Questions for owner confirmation
- Pitfalls: HIGH — sourced from already-verified project-level PITFALLS.md plus two newly-verified, phase-specific pitfalls (hookform/resolvers type issue, credit-estimate staleness)

**Research date:** 2026-09-25
**Valid until:** 30 days for package versions/npm registry data (fast-moving); Odds API bookmaker tier/key data should be re-verified at execution time regardless of this document's age, since it explicitly requires a live-call checkpoint (ODDS-05's own requirement).
