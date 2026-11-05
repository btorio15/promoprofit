# Quick 261104-prg Summary: "Intro offers" header on Opportunities

Promos flagged `parsed.introOffer: true` (no migration) leave the promos list, pairs, Top 5 and totals and render under a new "Intro offers" section on Opportunities, sorted by profit regardless of the Sort switch.

## What changed
- `scraped.ts`: optional `introOffer` on the parsed schema and `ScrapedPromo` type.
- `db/promos.ts`: `ActivePromo` and `ActiveNoSweatPromo` carry `introOffer` from the parsed JSON.
- `db/feedContext.ts`: `feedPromos` excludes intro offers (so the pair finder, member and group recorders, and the Dashboard profit graph and totals never see them); new `introPromos` list. `promoObservations.ts` and `get-promos.ts` also exclude them (Promos tab).
- Row DTOs (`PromoRowDTO`, `NoSweatRowDTO`, note DTO) carry `introOffer`.
- `get-opportunities.ts`: builds `introOffers` (guaranteed rows ranked separately plus no-sweat rows), sorted by profit descending; intro no-sweats removed from the promos source and from can't-price / not-worth-it notes; an intro-only screen is not "empty".
- `OpportunitiesScreen.tsx`: new "Intro offers" section after promo sections and pairs, using PromoRow / NoSweatRow, hidden when empty.
- `domain/opportunities/introOffers.ts` (+ test): pure `splitIntroOffers`; schema test for the flag.
- `scripts/mark-intro-offer.ts <promoId>`: one-off that merges `{"introOffer": true}` into `parsed`, prints before/after. NOT run against the live DB.

## Verification
`npx vitest run` 2549 passed, `npm run typecheck` clean, `npm run lint` 0 errors (12 pre-existing warnings).

## Deviations
- `introOffer` is optional (not required) on ActivePromo / ActiveNoSweatPromo / note DTO to avoid touching many test fixtures.
- Tests cover the split helper and schema flag; feed-level behaviour is structural (filtered in feedContext) and not covered by a new integration test.

## Orchestrator follow-up
Run `npx tsx --env-file=.env.local scripts/mark-intro-offer.ts 144` after review.
