# Walking Skeleton — PromoProfit

**Phase:** 1
**Generated:** 2026-09-25

## Capability Proven End-to-End

A user opens the local app, picks the book holding a bonus bet, enters the amount, and sees a ranked, cent-exact hedge list. The list is computed server-side by a pure decimal.js engine over Colorado odds that a user-triggered refresh pulled from The Odds API into Neon Postgres.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 App Router, TypeScript, `src/` dir, `@/*` alias | One deployable for UI plus server actions. Server actions keep the Odds API key and DB server-only (CLAUDE.md stack). |
| UI kit | shadcn/ui (new-york, zinc, CSS variables), Tailwind v4, lucide-react, Geist Sans/Mono | Locked by the approved 01-UI-SPEC.md. Phase 4's feed reuses the same tokens. Emerald accent is reserved for money the user keeps. |
| Server boundary | Server Actions (`src/app/actions/*.ts`, `"use server"`), each re-validating input with Zod | No separate API routes needed. Actions are directly callable, so server-side validation is mandatory. |
| Data layer | Neon Postgres + Drizzle ORM 0.45 (`drizzle-orm/neon-http`), lazy `getDb()` | Serverless-safe driver. Lazy client means `next build` and Vitest never need DATABASE_URL. |
| Migrations | `drizzle-kit generate` + `drizzle-kit migrate`, SQL committed in `./drizzle` | CLAUDE.md/RESEARCH.md: reproducible across local, GitHub Actions (Phase 3), and Vercel. Never `push`. |
| Money math | decimal.js only; money crosses to the client as 2-dp strings; formatting is string-based | CLAUDE.md forbids float money math. Floor-cent payouts plus max-min stake selection keep the displayed guaranteed profit a true lower bound (CALC-04). |
| Hedge engine | Pure, zero-I/O modules in `src/domain/hedge/` (`bonusBet.ts`, `marketFilter.ts`, `rankBonusBetHedges.ts`) | Reused by Phase 3 (boosts, as a separate module and not a flag) and Phase 4 (feed, tandem). Fixture-tested in Vitest. |
| Config as source of truth | `src/config/books.ts` (Colorado books, Odds API keys, tier) and `src/config/sports.ts` (D-01 list), seeded into the `books` table | One place to edit the book list. Later phases join `books` (e.g. Phase 2 user book selection). |
| Odds ingestion | `src/ingestion/odds/` holds client (Zod-validated), quota gate (pure), store (atomic `db.batch`), and refresh orchestration. Uses `bookmakers=` (7 free-tier keys = 1 credit per in-season sport) | Quota-safe. Only one code path spends credits (`runOddsRefresh`), and only on explicit user action. |
| Caching | Postgres `cached_odds` (one row per event, raw JSON + `fetched_at`) and `credit_usage` (from `x-requests-*` headers) | No Redis at this scale. The credit meter reads the persisted counter, never a live call. |
| Scheduling | None. Refresh only via the UI button or `npm run odds:refresh` | ODDS-01 forbids polling. Future scheduled work (Phase 3 scraping) uses GitHub Actions, never Vercel Cron. |
| Auth | None in Phase 1 | Phase 2 adds iron-session with an owner-seeded users table. Until then the app stays local. |
| Deployment target | Local full-stack run: `npm run db:migrate && npm run db:seed && npm run dev` against Neon (documented in README) | An unauthenticated deploy would expose the shared credit budget (T-01-15). The Vercel deploy lands with Phase 2 auth. |
| Tests | Vitest 5 (`src/**/*.test.ts`, node env, `@` alias), with module mocks for `@/db/queries` and `@/ingestion/odds/*` | Fast, credential-free suite. Live verification is isolated to `npm run odds:smoke` (ODDS-05). |
| Directory layout | `src/app` (routes, actions), `src/components/{ui,finder}`, `src/domain/{hedge,odds,finder}`, `src/ingestion/odds`, `src/db`, `src/config`, `src/lib`, `scripts/`, `drizzle/` | Domain is pure, ingestion does I/O, and app is the delivery layer. Later phases add `src/domain/boost`, `src/ingestion/promos`, and so on alongside. |

## Stack Touched in Phase 1

- [ ] Project scaffold (framework, build, lint, test runner): Plan 01
- [ ] Routing, at least one real route: `/` finder page (Plan 03)
- [ ] Database, at least one real read AND one real write: seed/refresh writes `books`, `cached_odds`, `credit_usage`; `findHedges` and the status bar read them (Plans 02, 04, 05)
- [ ] UI, at least one interactive element wired to the server: Find hedges calls `findHedges`, Refresh odds calls `refreshOdds` (Plans 03, 05)
- [ ] Deployment: documented local full-stack run command in README.md (Plan 02)

## Out of Scope (Deferred to Later Slices)

- Login, invite-only access, per-user book selection, account-risk advisory (Phase 2)
- Profit-boost math and caps, promo scraping, review queue (Phase 3)
- Opportunities feed, tandem/competing-promo hedges (Phase 4)
- Group-added promos (Phase 5)
- NHL; spreads/totals; runner-up hedge books in the expanded row (CONTEXT.md deferred)
- Manual odds for bet365/Circa/SBK/BetMonarch (ODDS-06); Caesars/Fanatics (paid tier, D-16)
- Hosted deployment (with Phase 2 auth)

## Subsequent Slice Plan

- Phase 2: A logged-in group member sees finder hedges limited to the books they selected.
- Phase 3: Scraped boost and bonus promos appear, with boost math and caps and a review queue for uncertain matches.
- Phase 4: The opportunities feed ranks every promo opportunity (including tandems), filtered to the user's books.
- Phase 5: Group members hand-add promos that feed the same feed.
