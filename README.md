# PromoProfit

PromoProfit is a private web app for a small group of friends that ranks guaranteed-profit
betting opportunities at Colorado sportsbooks — including a bonus-bet finder that takes a
bonus bet at one book and finds the best market to convert it on and the best book to hedge
it at, with exact stakes computed to the cent from cached odds.

## Local run

Requirements: Node >= 20.9.

```bash
npm install
cp .env.example .env.local
# fill in DATABASE_URL (Neon pooled connection string) and ODDS_API_KEY in .env.local
npm run db:migrate
npm run db:seed          # add `-- --fixtures` to also seed demo odds without an Odds API key
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run test` — run the Vitest suite (hedge math, server actions, etc.)
- `npm run odds:smoke` — one-off sanity check against The Odds API using `ODDS_API_KEY`
- `npm run odds:refresh` — fetch fresh odds and cache them in Postgres (spends API credits)
- `npm run db:check` — print the seeded book list and cached-odds freshness/count

## Status

The app has no authentication until Phase 2 (Private Access & My Books). Until then it must
stay local/undeployed — the refresh button spends the shared Odds API credit budget
(~500 credits/month on the free tier), and there is nothing gating access to it yet.
