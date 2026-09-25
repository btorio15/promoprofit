<!-- GSD:project-start source:PROJECT.md -->
## Project

**PromoProfit**

PromoProfit is a web dashboard that scans popular Colorado sportsbooks for promotions (bonus bets and profit/odds boosts) and calculates the guaranteed profit available by hedging each promo against competing books. It's built for the owner and a small private group of friends who convert sportsbook promos into locked-in profit, and it filters hedge opportunities to the books each user actually has accounts with.

**Core Value:** Given a promo, instantly show the max-profit hedge across the user's books — with exact stakes and the guaranteed profit — correctly, every time.

### Constraints

- **Budget**: Free tier of the odds API only (~500 requests/month on The Odds API) — odds must be fetched on demand / cached aggressively, not polled continuously
- **Geography**: Colorado sportsbooks only
- **Hedge venues**: Regulated sportsbooks only
- **Access**: Private, small group — no public signup
- **Correctness**: Stake/profit math must be exact and account for promo mechanics (stake-not-returned for bonus bets, boost caps/max stake)
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js (App Router) | 16.3.x | Full-stack web app (UI + API routes) | Single deployable for a small dashboard: React UI, server-side API routes for odds-fetch/hedge-calc, and server actions all in one repo. Standard default for solo/small-group TypeScript web apps in 2026; deploys to Vercel free tier with zero config. HIGH confidence (verified via official Next.js blog — 16.3.6 current, Active LTS). |
| TypeScript | 5.7+ | Type safety for hedge math | Hedge/stake calculations involve exact decimal math across promo types (bonus bet vs. boost) — a typo in a formula is a real-money bug. Types catch API-shape drift (odds API responses) at compile time. Non-negotiable for correctness-critical arithmetic. HIGH confidence. |
| Drizzle ORM | 0.45.x (+ drizzle-kit 0.31.x) | Database access / schema / migrations | Verified current on npm. Chosen over Prisma: ~7KB runtime vs. Prisma's 1MB+, no codegen step (faster iteration for a fast-moving small project), native support for Postgres serverless drivers (Neon, node-postgres) without a paid proxy (Prisma requires Prisma Accelerate for edge/serverless). SQL-like query builder makes it easy to hand-write the promo/hedge queries precisely. MEDIUM-HIGH confidence (version verified; ORM tradeoff synthesized from multiple 2026 comparison sources, consistent conclusions). |
| PostgreSQL (via Neon) | 16/17 (Neon managed) | Persistence: users, books, promos, cached odds snapshots | Neon's free tier gives real Postgres, scale-to-zero, ~100 compute-hours/month (doubled from 50 after Databricks acquisition), 0.5GB storage — plenty for a handful of users and cached odds JSON. Unlike Supabase free tier (pauses after 7 days idle, requires a keep-alive ping), Neon wakes on connection with no separate "unpause" step, which fits a tool used sporadically by a few friends. MEDIUM confidence (free-tier specifics from multiple 2026 comparison blogs, not Neon's own pricing page directly — verify before committing). |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Playwright | 1.63.x | Scrape sportsbook promo pages | Use for the "hybrid promo discovery" scraper. Industry-standard headless-browser automation in 2026, handles JS-rendered promo pages that simple HTTP scraping (fetch + cheerio) cannot. Run scrapers **only** from a scheduled GitHub Actions job (see Hosting), never from a request-time serverless function — Playwright's Chromium binary is too large/slow for Vercel's function limits. |
| `@neondatabase/serverless` | 1.1.x | Postgres driver over HTTP/WebSocket | Use instead of a raw TCP driver (`pg`) when running queries from Vercel serverless/edge functions — avoids connection-pool exhaustion issues serverless functions have with traditional Postgres connections. Pairs directly with Drizzle's Neon adapter. |
| iron-session | 9.0.x | Encrypted, stateless session cookies | Use for private auth (see Auth section below) instead of a full auth framework — this app has no OAuth/social-login requirement and a fixed, tiny user list, so a stateless sealed-cookie session is simpler to reason about than an adapter-backed auth library. |
| bcrypt (or `@node-rs/argon2`) | latest | Password hashing | Use when storing the small number of user passwords (owner creates accounts manually; no public signup). argon2 is the more modern default if native binary builds aren't a deployment concern (GitHub Actions/Vercel both fine); bcrypt is the safer choice if you want zero native-build friction. |
| Zod | 4.x | Runtime validation of odds-API responses and manual promo-entry forms | The odds API and scraped promo data are both "trust but verify" — Zod schemas catch malformed/changed API responses before they corrupt hedge math, and validate the manual promo-entry form (book, type, amount/boost %, market, max stake). |
| React Hook Form | 7.x | Manual promo-entry form state | Standard pairing with Zod (`@hookform/resolvers/zod`) for the manual-entry form that PROJECT.md calls out as a first-class path (promo pages are inconsistent/brittle to scrape). |
| decimal.js (or `big.js`) | latest | Exact decimal math for stakes/profit | **Do not use native JS floating point for money math.** Hedge stake formulas involve division and percentage math (boost %, conversion %) where float rounding errors compound into wrong displayed profit. Use a fixed-point/decimal library for every stake/profit calculation, format to cents only at display time. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| Vitest | Unit-testing the hedge-calculator math | This is the one part of the app that must be provably correct — write table-driven tests for bonus-bet and profit-boost formulas against known-correct hand-calculated examples before wiring up the UI. |
| drizzle-kit | Schema migrations | `drizzle-kit generate` + `drizzle-kit migrate`; commit generated SQL migrations to the repo so GitHub Actions and local dev stay in sync. |
| ESLint + Prettier (Next.js defaults) | Lint/format | Next.js 16's `create-next-app` scaffolds this; no extra decisions needed. |
## Installation
# Core
# Scraper (separate workspace/script, not bundled into the Next.js app)
# Dev dependencies
## Odds API: The Odds API (recommended)
| Region key | Bookmakers relevant to Colorado (per docs) |
|---|---|
| `us` | DraftKings (`draftkings`), FanDuel (`fanduel`), BetMGM (`betmgm`), Caesars (`williamhill_us`), Fanatics (`fanatics`), BetRivers (`betrivers`) |
| `us2` | Hard Rock Bet (`hardrockbet`), theScore Bet (`espnbet` key — see note below), Bally Bet (`ballybet`) |
### Alternatives considered
## Scraping: Playwright — feasibility assessment
- Major sportsbooks (DraftKings, FanDuel, BetMGM, Caesars) are large commercial operators highly likely to run enterprise bot-detection (Cloudflare, Akamai, PerimeterX, DataDome) given the value of their odds/promo data and the regulated-gambling compliance requirements around scraping/automation.
- Plain Playwright is trivially fingerprinted (`navigator.webdriver`, missing plugins, HeadlessChrome UA string). Stealth plugins (`playwright-extra` + stealth plugin) only address fingerprint-level detection — they do **not** solve IP reputation, TLS/JA3 fingerprinting, or behavioral analysis that advanced anti-bot systems use.
- Node.js stealth tooling is described as less actively maintained than the Python `playwright-stealth` ecosystem as of 2026 — if scraping becomes a priority, a Python scraper script (invoked from the same GitHub Actions cron) may be more reliable than Node/Playwright stealth plugins.
- Promo pages specifically are often gated behind app-only views or logged-in states (per PROJECT.md), which is a harder problem than public-page scraping regardless of anti-bot tooling — you may need each user's own logged-in session/cookies to see their personalized promos, which raises ToS and credential-security questions beyond pure technical feasibility.
## Hosting & Scheduled Jobs
| Component | Recommendation | Why |
|---|---|---|
| Web app (Next.js) | **Vercel Hobby (free)** | Zero-config deploy for Next.js, generous free tier for low-traffic private apps, automatic HTTPS/preview deploys. |
| Scheduled odds-fetch / promo-scrape jobs | **GitHub Actions scheduled workflow (`on: schedule`, cron syntax), not Vercel Cron** | Vercel's Hobby plan limits cron jobs to **once per day, max 2 jobs per project** (verified, HIGH confidence, from Vercel's own docs/limits page) — too infrequent and inflexible for triggering scrapes or writing cache-refresh snapshots. GitHub Actions gives ~2,000 free minutes/month on private repos (unlimited on public repos), enough for a script that runs every 1-2 hours around the clock, and can run Playwright directly (unlike a Vercel serverless function, which has tight size/timeout limits unsuited to a full Chromium browser). Have the Actions job write results directly into the shared Neon Postgres DB; the Next.js app just reads from the DB — this decouples scraping cadence from the web app's hosting limits entirely. |
| Database | **Neon (free tier)** | See Core Technologies row above. |
| Caching | **Postgres itself (a `cached_odds` table with `fetched_at` + TTL), not a separate Redis** | At this scale (a handful of users, sporadic use, ~83-166 API requests/month budget) a dedicated cache layer like Upstash Redis (free tier: 500K commands/month, 256MB) is unnecessary complexity — Postgres reads are fast enough, and storing the raw cached API response alongside a timestamp is simpler to reason about and debug than adding a second data store. Revisit only if you outgrow Neon's free compute-hours. |
## Auth: Private, invite-only access
- The app has no requirement for OAuth/social login, password reset flows, or self-serve signup — PROJECT.md explicitly states "no public signup," owner + a few known friends.
- Auth.js v5 (`next-auth@beta`, currently `5.0.0-beta.32`) is the standard choice *when* you need OAuth providers, database session adapters, or multi-provider flows — none of which apply here. Its Drizzle adapter requires 4 additional tables (users/accounts/sessions/verification_tokens) sized for a general-purpose auth system, which is more surface area than this project needs.
- Note for context: Lucia (a popular lightweight auth library) was **deprecated by its maintainer in March 2025** and is now positioned as a reference implementation rather than an installable library — reinforcing that "roll a small, understood session layer" is a legitimate, currently-recommended pattern for small apps in 2026, not a shortcut to be embarrassed about.
- iron-session (v8+ supports the Next.js App Router natively, current version 9.0.x) stores session data in a signed+encrypted cookie — stateless, nothing to look up server-side, minimal code. Combine with bcrypt-hashed passwords in a simple `users(id, email, password_hash, display_name)` table that the owner seeds manually (via a script or direct DB insert) for each friend, with no signup UI at all.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| Next.js (App Router) on Vercel | SvelteKit / Remix / plain Vite+Express | If the group already has strong opinions/experience in one of these — PROJECT.md states no stack preference, so default to the largest ecosystem (Next.js) for the most Stack Overflow/AI-assistant coverage when debugging. |
| Drizzle ORM | Prisma | If you want a visual DB browser (Prisma Studio) and are fine with the codegen step and heavier bundle — reasonable if the team is more familiar with Prisma already. |
| Neon Postgres | Supabase Postgres | If you want built-in auth/storage/realtime bundled with the DB — but Supabase free projects **pause after 7 days of inactivity** and need a keep-alive ping, a poor fit for a tool used sporadically by a few friends. Turso (libSQL/SQLite) is another option with a very generous free tier (100 DBs, 5GB storage) but is a worse fit than Postgres for relational hedge/promo data with joins across users/books/promos. |
| GitHub Actions cron | Vercel Cron (paid Pro plan) or a dedicated always-on server (Fly.io/Render) | If the project graduates beyond a free-tier hobby tool and needs sub-hourly, guaranteed-timing scraping — GitHub Actions' schedule can be delayed under high platform load and isn't guaranteed to the minute. |
| iron-session + manual user table | Auth.js v5 | If the project later adds OAuth (e.g., "sign in with Google") or grows past a handful of manually-managed users. |
| The Odds API | SportsGameOdds / OddsPapi / SharpAPI | If, after verifying live bookmaker coverage, The Odds API is missing a book your group actually uses — these alternatives' free-tier claims are currently unverified (see note above) and should be checked directly against their docs before switching. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Native JS floating-point math (`number` type) for stake/profit calculations | Float rounding errors on percentage/division math compound into visibly wrong "guaranteed profit" numbers — unacceptable for a tool whose entire value is exact correctness | `decimal.js` or `big.js`, format to currency only at display/render time |
| Vercel Cron for scraping/odds-fetch scheduling (on Hobby plan) | Hard-capped at once/day, 2 jobs per project — too infrequent to be useful, and Vercel serverless functions aren't sized for running full Playwright/Chromium | GitHub Actions scheduled workflow writing to the shared Postgres DB |
| Prisma on Vercel Edge/serverless without Prisma Accelerate | Requires a paid proxy service to work outside Node.js runtime, adds cost/complexity for no benefit at this scale | Drizzle ORM with `@neondatabase/serverless` |
| Auth.js/NextAuth or Clerk for a 3-5 person invite-only tool | Disproportionate operational surface (OAuth flows, adapter tables, external service dependency) for a fixed, owner-managed user list | iron-session + manually-seeded `users` table |
| Polling the odds API on a fixed schedule (e.g., every 15 min, 24/7) | Free tier is only 500 credits/month (~83-166 full requests) — scheduled polling at any meaningful frequency will exhaust the quota before it's useful | Fetch on-demand when a user opens a promo, cache aggressively in Postgres with a short TTL |
| Scraping sportsbook **odds** pages directly (vs. promo pages) | Explicitly out of scope per PROJECT.md; odds are the API's job, and odds pages are typically better-protected than promo/marketing pages | The Odds API for hedge-side odds; Playwright only for promo discovery |
## Stack Patterns by Variant
- Lean entirely on the manual promo-entry form as the primary/only promo-discovery path for v1
- Keep the Playwright/GitHub Actions scraping pipeline as an optional, per-book add-on attempted opportunistically, not a blocking dependency for shipping
- Migrate from iron-session + manual seeding to Auth.js v5 with an invite-code-gated Credentials or magic-link provider
- At that point also reconsider Upstash Redis for caching if Neon's free compute-hours become a bottleneck
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|------------------|-------|
| next@16.3.x | react@19.3.x, react-dom@19.3.x | Next.js 16 uses the React 19.2+ line by default; `create-next-app` pins compatible versions automatically. |
| drizzle-orm@0.45.x | drizzle-kit@0.31.x | Keep both in the same minor-version family; mismatches between the ORM and CLI kit are a common source of migration-generation bugs. |
| drizzle-orm | @neondatabase/serverless@1.1.x | Use Drizzle's `neon-http` or `neon-serverless` driver adapter (matching whichever Neon package/mode you use) — do not mix the raw `pg` driver adapter with the Neon serverless client. |
| iron-session@9.0.x | Next.js App Router (`cookies()` from `next/headers`) | v8+ is the App-Router-compatible line; do not use v6/v7 docs/examples, which target the Pages Router API. |
| next-auth@5.0.0-beta.32 | — | Noted for completeness only — not the recommended choice here; still in beta as of this research, another reason to avoid it for a project that values low maintenance overhead. |
## Sources
- https://the-odds-api.com/liveapi/guides/v4/ — credit-cost formula, region parameters (HIGH confidence, official docs)
- https://the-odds-api.com/#get-access — free tier: 500 credits/month, feature inclusions (HIGH confidence, official pricing page)
- https://the-odds-api.com/manage/faqs.html — credit reset timing (HIGH confidence, official FAQ)
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html — US region bookmaker keys (MEDIUM confidence — official page, but live API roster should be re-verified)
- https://the-odds-api.com/sports-odds-data/betting-markets.html — market list and per-event player-props endpoint note (HIGH confidence, official docs)
- https://the-odds-api.com/guide/rate-limit.html — 30 req/sec on paid plans, no free-tier-specific number published (MEDIUM confidence)
- WebSearch: "ESPN Bet theScore Bet Colorado 2026 Penn Entertainment relaunch" — theScore Bet rebrand, Colorado availability confirmed (MEDIUM-HIGH, multiple industry-press sources: igamingbusiness.com, espnpressroom.com, thescorebethelp.zendesk.com)
- WebSearch: "Colorado legal sportsbooks list 2026" — CO book list including bet365, Circa, BetMonarch not in Odds API docs (MEDIUM confidence, sportsbook-review aggregator sites)
- WebSearch: "best free sports odds API 2026 comparison" — competitor claims for OddsJam/SportsGameOdds/OddsPapi/SharpAPI (LOW confidence — sourced from competitors' own marketing content, not verified against live docs)
- https://vercel.com/docs/cron-jobs/manage-cron-jobs and related Vercel limits pages — Hobby plan 1x/day, 2 jobs/project cron limit (HIGH confidence, official Vercel docs referenced by multiple corroborating sources)
- WebSearch: "GitHub Actions scheduled workflow free tier" — ~2,000 min/month free on private repos, Playwright compatibility (MEDIUM confidence, community dev blogs, internally consistent across sources)
- WebSearch: "Playwright 2026 anti-bot detection" — stealth plugin limitations, Node vs. Python stealth ecosystem maturity (MEDIUM confidence, multiple 2026 scraping-vendor blogs, consistent conclusions)
- WebSearch: "Lucia auth deprecated 2025" — Lucia deprecated March 2025, repositioned as reference implementation (MEDIUM-HIGH confidence, corroborated across GitHub discussion thread and multiple blog posts)
- WebSearch: "Supabase free tier Postgres project pause / Neon vs Turso free tier" — Supabase 7-day pause, Neon ~100 compute-hrs/month, Turso 100 DBs/5GB (MEDIUM confidence, 2026 comparison blogs, not first-party pricing pages)
- WebSearch: "Drizzle ORM vs Prisma 2026" — bundle size, edge/serverless compatibility tradeoffs (MEDIUM-HIGH confidence, multiple independent comparison sources reaching consistent conclusions)
- WebSearch: "Auth.js NextAuth v5 2026 Next.js 16 Drizzle adapter" — Auth.js v5 still beta, Drizzle adapter table requirements (MEDIUM confidence, dev.to/community sources plus authjs.dev official docs)
- npm registry (`registry.npmjs.org`, queried directly) — exact current versions: next@16.3.6, react@19.3.0, drizzle-orm@0.45.3, drizzle-kit@0.31.11, playwright@1.63.0, iron-session@9.0.1, next-auth@5.0.0-beta.32, @neondatabase/serverless@1.1.0, zod@4.6.5 (HIGH confidence, first-party registry data)
- WebSearch: "Upstash Redis free tier 2026" — 500K commands/month, 256MB (MEDIUM confidence, comparison blogs, not Upstash's own pricing page directly)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
