---
quick_id: 261104-prg
type: quick
autonomous: true
---

# Quick 261104-prg: "Intro offers" header on Opportunities

Owner request (2026-11-04): move the BetMGM intro offer (promo #144, a hand-added no-sweat "up to $1,500" the owner entered to test) out of the promos list, keeping it on the Opportunities tab under a new header. An early slice of Phase 10 D-11 (section below promos); Phase 10 will later rank scraped intro offers into this same section.

## Mechanism (no migration)
- Mark a promo as an intro offer with an optional `introOffer: true` key in its `parsed` JSON (promos.parsed is jsonb). Add `introOffer: z.boolean().optional()` to the parsed schema(s) the readers use (ScrapedPromoSchema / the no-sweat mapping), so the flag survives reads; default false. Do NOT change scrapers or the add-promo form.
- Carry it to the row DTOs (guaranteed PromoRowDTO and NoSweatRowDTO) as `introOffer: boolean`.

## Feed behaviour
- In `get-opportunities.ts` / `OpportunitiesScreen.tsx`: rows with `introOffer` are removed from the promos list (and its Top 5 / sort / "Can't price yet" / "Not worth it" lists) and rendered in a new section headed **"Intro offers"** placed after the promo sections (and after promo pairs, if shown), using the same row components (NoSweatRow / PromoRow). Sub-copy: "One-time sign-up offers at new books. Kept separate from your promos." Always sorted by estimated/guaranteed profit, highest first, ignoring the Sort switch. Section hidden when empty.
- Intro offers never feed the promo pair finder.
- Intro-offer profit must not appear in the Dashboard profit graph or the "available" totals (no-sweats are already excluded as estimates; make sure a guaranteed-type intro offer would be excluded too).

## Data change (owner-requested)
- One-off script `scripts/mark-intro-offer.ts <promoId>` (tsx --env-file=.env.local) that sets `parsed = parsed || '{"introOffer": true}'` for that id only when `added_by_user_id IS NOT NULL OR` it exists; print before/after. The orchestrator runs it for #144 after review; the executor must NOT run it against the live DB.

## Tests
- DTO/feed split: an intro-offer row goes to the intro section, not promos; non-flagged rows unaffected; pair finder ignores intro offers.
- Full `npx vitest run`, `npm run typecheck`, `npm run lint`.
