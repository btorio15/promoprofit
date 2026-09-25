# Architecture Research

**Domain:** Sportsbook promo-conversion / hedge calculator (odds comparison + arbitrage-style math over promos)
**Researched:** 2026-09-25
**Confidence:** HIGH (The Odds API mechanics, quota model) / MEDIUM (matching + promo pipeline, synthesized from domain patterns — no single authoritative "matched betting app architecture" reference exists for this niche)

## Standard Architecture

This is not a high-frequency trading system — it's a personal/small-group tool gated by a ~500-credit/month free API quota, so the architecture optimizes for **correctness and quota discipline**, not real-time throughput. The generic "arbitrage platform" literature (OddsJam-style marketing content) describes continuous low-latency pipelines that do NOT apply here — ignore that pattern; it would exhaust the free tier in hours.

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         PROMO INGESTION                              │
│  ┌────────────────┐        ┌──────────────────────┐                  │
│  │ Per-book        │        │ Manual entry form     │                  │
│  │ scrapers        │        │ (event picker from    │                  │
│  │ (best-effort)   │        │  free /events cache)   │                  │
│  └────────┬────────┘        └──────────┬────────────┘                  │
│           │  raw candidate              │ trusted, pre-matched        │
│           ▼                             │                             │
│  ┌─────────────────────────┐            │                             │
│  │ Event/Market Matcher     │            │                             │
│  │ (fuzzy team+date match   │            │                             │
│  │  + human confirm queue)  │            │                             │
│  └────────────┬─────────────┘            │                             │
│               └──────────────┬───────────┘                             │
└──────────────────────────────┼─────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          NORMALIZATION LAYER                          │
│   Book registry · Sport/Market registry · Canonical odds format       │
│   (promo records and odds records both map into this shared schema)   │
└───────────────┬──────────────────────────────────┬────────────────────┘
                │                                    │
                ▼                                    ▼
┌───────────────────────────────┐   ┌────────────────────────────────────┐
│      PROMO STORE (DB)          │   │        ODDS INGESTION LAYER        │
│  promos, event_matches,        │   │  The Odds API client + quota       │
│  book_registry, users,         │   │  tracker + cache (bulk /odds for   │
│  book_preferences               │   │  main lines, per-event /odds for   │
└───────────────┬─────────────────┘   │  player props/alt lines)           │
                │                     └──────────────────┬──────────────────┘
                │                                         │
                ▼                                         ▼
        ┌───────────────────────────────────────────────────────┐
        │              HEDGE OPTIMIZATION ENGINE                 │
        │  Pure calc: bonus-bet solver, boost solver.             │
        │  Input: promo + candidate opposing odds (filtered to    │
        │  user's selected books). No I/O.                        │
        └───────────────────────┬───────────────────────────────┘
                                 ▼
        ┌───────────────────────────────────────────────────────┐
        │           OPPORTUNITY RANKING (read-time)               │
        │  active promos × matched odds × book prefs → sorted     │
        │  by guaranteed profit. Computed on read, not stored.    │
        └───────────────────────┬───────────────────────────────┘
                                 ▼
        ┌───────────────────────────────────────────────────────┐
        │      WEB DASHBOARD (auth-gated, small user group)       │
        │  Opportunities list · Promo entry/review · Book prefs   │
        └───────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|-------------------------|
| Scrapers | Best-effort discovery of promo candidates from book promo pages | Scheduled job per book, outputs raw/unconfirmed promo rows; expected to break often, treated as a hint source, not source of truth |
| Manual entry form | Reliable, guaranteed-coverage promo input | Form with dropdowns sourced from cached `/events` (zero-quota), so the user picks a real event instead of typing team names — sidesteps fuzzy matching entirely for this path |
| Event/Market Matcher | Resolve a promo's fuzzy event reference (scraped text or ambiguous manual text) to a canonical Odds API `event_id` + `market_key` | Team-name alias table + date-window match against cached `/events`; always routes through a human confirmation step before a match is trusted — never auto-publish |
| Normalization Layer | Shared vocabulary: book registry, sport/market registry, canonical odds format (American) | A set of small lookup tables/enums + conversion functions; both promo and odds ingestion map into this before touching the hedge engine |
| Odds Ingestion Layer | Fetch and cache odds from The Odds API, on demand, under quota | Two-tier client: cheap bulk per-sport calls for h2h/spreads/totals (covers all events in one call), expensive per-event calls only for player props/alt lines; wraps every call with quota-header tracking |
| Promo Store / DB | Persist promos, matches, registries, users, book preferences | Relational DB (Postgres/SQLite-class) — this data is small and relational, not a scale concern |
| Hedge Optimization Engine | Compute exact stakes and guaranteed profit for bonus bets and boosts | Pure functions, no I/O, unit-testable against fixture data independent of live API |
| Opportunity Ranking | Combine promos + odds + user's book selection into a ranked list | Computed at read time from cached odds, never persisted as a stale derived value |
| Web Dashboard | Present opportunities, promo entry/review, book preference settings | Standard server-rendered or SPA dashboard behind auth |
| Auth Layer | Gate access to a small private user list; identify user for book-preference filtering | Lightweight session-based auth, invite-only user table — not a general-purpose multi-tenant auth system |

## Recommended Project Structure

```
src/
├── ingestion/
│   ├── odds/                 # The Odds API client, quota tracker, cache
│   │   ├── client.ts         # thin REST wrapper, reads x-requests-* headers
│   │   ├── cache.ts          # TTL cache keyed by sport+market+region / event+market
│   │   └── quota.ts          # monthly credit budget tracker + guardrails
│   ├── promos/
│   │   ├── scrapers/         # one module per book, isolated & swappable
│   │   └── manual/           # manual entry validation + event-picker data source
│   └── matching/
│       ├── aliases.ts        # team name alias table (curated, CO books)
│       └── matcher.ts        # fuzzy match + confirmation-queue logic
├── domain/
│   ├── registry/             # books, sports, markets — canonical enums/tables
│   ├── normalize/             # odds format conversion, promo → canonical mapping
│   └── hedge/                 # PURE calculation engine, zero I/O
│       ├── bonusBet.ts
│       ├── profitBoost.ts
│       └── hedge.test.ts     # fixture-driven correctness tests (core value)
├── ranking/
│   └── opportunities.ts      # combine promos + odds + book prefs, sort by profit
├── data/
│   └── db/                   # schema, migrations, repositories
├── auth/
│   └── session.ts            # lightweight private-group auth
└── web/
    ├── pages/ (or routes/)   # dashboard, promo form, opportunities, settings
    └── components/
```

### Structure Rationale

- **`ingestion/` is split into three independent subsystems** (odds, promos, matching) because they fail independently: the odds API can rate-limit, scrapers can break, and matching can be ambiguous — none of these failures should take down the others.
- **`domain/hedge/` is isolated with zero I/O** because correctness ("Core Value" per PROJECT.md) is the entire point of this app. Keeping the solver pure and fixture-testable means the odds math can be verified without live API calls or a database, and regressions are caught immediately.
- **`domain/registry/` and `domain/normalize/` sit between ingestion and everything else** — both promo data (from scrapers/manual entry) and odds data (from the API) are messy and inconsistently shaped at the source; normalizing both into one canonical schema before they reach the hedge engine means the engine only ever deals with one clean shape.
- **`ranking/` is separate from `domain/hedge/`** because ranking is a read-time aggregation concern (sort/filter), while hedging is a calculation concern — keeping them apart avoids the ranking logic accidentally depending on I/O timing.

## Architectural Patterns

### Pattern 1: Dropdown-first promo entry (avoid fuzzy matching on the primary path)

**What:** The manual entry form does not let the user free-type an event; it presents a searchable dropdown of upcoming events, populated by a cached, zero-cost call to The Odds API's `/events` endpoint. Choosing from the dropdown means the promo is matched to a canonical `event_id` at entry time — the fuzzy matcher is never invoked.
**When to use:** Every manual promo entry. This should be the default and expected path.
**Trade-offs:** Requires the event list to be kept fresh (cheap, since `/sports` and `/events` cost zero quota per The Odds API docs) but eliminates an entire class of "wrong event matched → wrong hedge math" bugs for the majority of promos.

**Example:**
```typescript
// GET /events is free (0 quota cost) — safe to refresh frequently
const events = await oddsClient.listEvents(sportKey); // cached, zero-cost
// form renders events as a typeahead; user selects one → event_id captured directly
promo.event_id = selectedEvent.id;
promo.match_confidence = "exact"; // no fuzzy match needed
```

### Pattern 2: Two-tier odds fetching (bulk vs per-event) to protect quota

**What:** The Odds API charges `markets × regions` credits per call. The bulk `/sports/{sport}/odds` endpoint returns odds for ALL events in that sport for that cost — so it's the cheap default for main markets (h2h, spreads, totals). The per-event `/sports/{sport}/events/{id}/odds` endpoint is required for player props and alternate lines, but it charges `markets × regions` **per event**, making it far more expensive at any scale.
**When to use:** Use the bulk endpoint for the "opportunities" board and any promo on a main market. Only call the per-event endpoint when a specific promo's market requires it, and only on-demand (e.g., user opens that promo's detail view), never in a background sweep.
**Trade-offs:** Player-prop promos cost noticeably more quota per lookup — this should be visible in the quota tracker so the user can decide whether checking a prop-based promo is "worth" the credits.

**Example:**
```typescript
// Cheap: covers every event in the sport for 1 call
const bulk = await oddsClient.getOdds(sportKey, { markets: ["h2h"], regions: ["us"] });
// cost = markets(1) × regions(1) = 1 credit, for ALL events

// Expensive: only when the promo market isn't in bulk (e.g. player_points)
const propOdds = await oddsClient.getEventOdds(sportKey, eventId, {
  markets: ["player_points"], regions: ["us"],
});
// cost = markets(1) × regions(1) PER EVENT — call sparingly, cache hard
```

### Pattern 3: Human-confirmed matching for anything not entered via dropdown

**What:** Scraped promo candidates (and any manual entry that falls back to free text) go through the fuzzy matcher (team-name alias table + commence-time window), but the match is written as `status: pending_review` and surfaced in a review queue. It only becomes an active, hedge-calculated promo after a human confirms the matched event.
**When to use:** Any promo whose event reference did not come from a direct dropdown selection against the API's canonical event list.
**Trade-offs:** Adds a manual step, but a silent mismatch (e.g., matching "Nuggets vs Lakers" to the wrong night's game, or the wrong Lakers game if there are back-to-backs) directly produces wrong stakes and wrong guaranteed-profit numbers — this is the single highest-value correctness guard in the system given the domain's "correctness must be exact" constraint.

### Pattern 4: Quota-aware caching, not scheduled polling

**What:** No cron job continuously refreshes odds. Instead, every odds fetch checks a TTL cache first; cache misses trigger a live call, which updates both the cache and a running monthly credit counter (read from the API's own `x-requests-remaining`/`x-requests-used`/`x-requests-last` response headers). If remaining quota drops below a safety threshold, the ingestion layer degrades gracefully (serves stale cached odds with an "as of" timestamp, or blocks per-event calls first since those are the most expensive).
**When to use:** All odds fetching, always.
**Trade-offs:** Odds shown may lag a few minutes behind live lines (acceptable for a hedge calculator used to lock in a promo, not for live in-play betting).

## Data Flow

### Promo → Opportunity Flow

```
[Scraper hint] or [Manual entry, dropdown-matched]
    ↓
[Normalize: book, type, value, market, max_stake]
    ↓
[If not dropdown-matched: fuzzy Match Engine → pending_review]
    ↓ (human confirms)
[Promo record: event_id + market_key resolved, status=active]
    ↓
[User opens Opportunities view]
    ↓
[Odds Ingestion: cache check → (miss) bulk or per-event fetch from The Odds API]
    ↓
[Normalize odds into canonical American-odds shape, tag by book]
    ↓
[Filter candidate opposing books to the viewing user's book_preferences]
    ↓
[Hedge Engine: bonus-bet or boost solver → stakes + guaranteed profit]
    ↓
[Opportunity Ranking: sort all active promos by guaranteed profit]
    ↓
[Dashboard renders ranked list; promo detail shows exact stake breakdown]
```

### Key Data Flows

1. **Promo confirmation is a one-time write, odds are a repeated read:** once `promo.event_id` is resolved and confirmed, that mapping never needs to be recomputed — only the odds for that event/market are re-fetched (cached) each time the opportunity is viewed. This separation is what keeps quota usage low: matching costs zero quota (uses free `/events`), only odds lookups cost quota.
2. **Book-preference filtering happens after odds normalization, before hedge calculation:** the hedge engine should never see odds from books the viewing user doesn't have — filter early so the "best opposing line" search space is already correct.
3. **Nothing computed by the Hedge Engine is persisted as the source of truth:** guaranteed-profit numbers are always derived at read time from (promo + cached odds), so a promo's displayed profit updates automatically when the underlying cached odds refresh, without a separate invalidation step.

## Scaling Considerations

This app has ~1-20 users by design (PROJECT.md: owner + a few friends, private). Traditional scaling tiers do not apply — the real constraint is API quota, not load.

| Scale | Architecture Adjustments |
|-------|---------------------------|
| Current (1-20 users, ~500 credits/mo) | On-demand + cached fetching only; quota tracker with hard guardrails; per-event (player prop) calls minimized |
| If quota becomes the bottleneck | Upgrade The Odds API tier ($/mo) before adding architectural complexity — this is a config change, not a redesign |
| If promo volume grows a lot (many books/scrapers) | Scrapers already isolated per-book; add more without touching matching/hedge/ranking layers |

### Scaling Priorities

1. **First (and really only) bottleneck: Odds API quota.** Every architectural decision above (bulk-over-per-event, dropdown-first matching, TTL caching, on-demand not polling) exists specifically to protect the free tier. This is the one place to keep spending design effort.
2. **Second, much smaller concern: scraper maintenance burden.** Book promo pages change frequently and scrapers will break; the architecture already treats scrapers as a best-effort hint source feeding the same review queue as ambiguous manual entries, so a broken scraper degrades gracefully rather than corrupting data.

## Anti-Patterns

### Anti-Pattern 1: Scheduled/cron polling of the odds API

**What people do:** Set up a cron job to refresh all odds every N minutes "to keep the dashboard fresh," modeled on real-time arbitrage platform marketing content.
**Why it's wrong:** At `markets × regions` credits per call across multiple sports, a polling loop exhausts a ~500 credit/month free tier in hours to days, leaving nothing for actual on-demand use.
**Instead:** Fetch odds only when a user action requires them (viewing opportunities, refreshing a specific promo), backed by a TTL cache, with quota tracked via the API's own usage headers.

### Anti-Pattern 2: Auto-trusting fuzzy-matched events

**What people do:** Let a string-similarity match against team names automatically resolve a scraped promo to an event_id and immediately start calculating hedges against it.
**Why it's wrong:** Team name collisions, doubleheaders, and back-to-back games make silent mismatches likely; a wrong event match produces confidently-wrong stake and profit numbers — the opposite of this app's core value ("correctly, every time").
**Instead:** Route anything not directly selected from the canonical event list through a human confirmation queue before it's eligible for hedge calculation.

### Anti-Pattern 3: Coupling the hedge math to the database/API layer

**What people do:** Write the bonus-bet/boost solver as methods on an ORM model or inline in an API route handler, mixing calculation with fetching/persistence.
**Why it's wrong:** Makes the highest-stakes logic in the app (the actual money math) hard to unit test in isolation and easy to silently break while refactoring ingestion or UI code.
**Instead:** Keep the solver as pure functions taking plain data (promo terms + odds list) and returning plain data (stakes + profit), tested against fixture cases independent of any live system.

### Anti-Pattern 4: Persisting computed profit/opportunity values

**What people do:** Store `guaranteed_profit` on the promo row after computing it once, to avoid recomputation.
**Why it's wrong:** Odds move; a stored value goes stale the moment the underlying line changes, and nothing forces an update, so the dashboard can show a profit number that's no longer achievable.
**Instead:** Recompute ranking/profit at read time from the promo plus the current cached odds snapshot (which itself carries a `last_update` timestamp to show the user how fresh the number is).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|----------------------|-------|
| The Odds API | REST, API key as query param; `region=us`/`us2` for Colorado-legal books | `/sports` and `/events` are zero-quota — use them freely for matching and event discovery. `/odds` (bulk) costs `markets × regions`. Per-event `/odds` (needed for player props/alt lines) costs `markets × regions` **per event** — the expensive path. Track quota via `x-requests-remaining`, `x-requests-used`, `x-requests-last` response headers after every call. |
| Book promo pages (scrape targets) | Scheduled scraper per book, best-effort | Expect breakage; treat output as unconfirmed candidates only, never as directly-trusted promo data |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|----------------|-------|
| Ingestion ↔ Domain/Normalize | Plain data objects (no shared mutable state) | Ingestion modules output raw/candidate records; normalize layer is the only place format conversion happens |
| Matching Engine ↔ Promo Store | Writes a `pending_review` status until human-confirmed | Never let matcher output flow directly into the hedge engine |
| Odds Ingestion ↔ Hedge Engine | Odds Ingestion supplies already-normalized, cached odds; Hedge Engine has no knowledge of the API, caching, or quota | Keeps the calculation core testable and swappable if the odds provider ever changes |
| Auth ↔ Everything else | Session/user id passed down to Ranking layer to apply `book_preferences` filter | Book filtering is the only place user identity affects business logic; everything else can be treated as shared/global data |

## Sources

- [Odds API Documentation V4](https://the-odds-api.com/liveapi/guides/v4/) — event/bookmaker/market structure, quota formula, free `/sports` and `/events` endpoints (HIGH confidence, official docs)
- [The Odds API Free Tier: 500 Credits Is Not 500 Requests](https://oddspapi.io/blog/the-odds-api-free-tier-limits/) — third-party confirmation of quota-per-request behavior (MEDIUM confidence, cross-checked against official docs)
- [The Odds API error codes / usage headers](https://the-odds-api.com/liveapi/guides/v4/api-error-codes.html) — `x-requests-remaining`/`x-requests-used`/`x-requests-last` header behavior (HIGH confidence, official docs)
- General arbitrage-platform architecture write-ups (e.g., Idea Usher blog posts on building OddsJam-style platforms) were reviewed but largely describe real-time/high-frequency exchange architectures aimed at production SaaS scale — **not representative** of this project's quota-constrained, low-user-count context, and were used only to confirm the generic layering concept (ingest → normalize → match → calculate → rank), not any specific technical recommendation (LOW confidence, discounted accordingly).

---
*Architecture research for: Sportsbook promo-conversion / hedge calculator (PromoProfit)*
*Researched: 2026-09-25*
