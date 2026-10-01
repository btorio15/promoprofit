# Quick Task 261001-dhn: Per-member max-stake cap override for profit boosts - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Task Boundary

A member's sportsbook account can have a lower max-stake limit than the book's public promo page (owner's DraftKings College Football 50% boost, promo #20: public text "MAX $25 WAGER", owner's account shows $20). Today the only way to change a scraped promo's cap is a direct DB edit, and scraped promos are shared by all members.

Add a per-member "Your cap" override for profit boosts: the member types their own max stake on a Promos-tab row; it saves immediately and the row's stakes / guaranteed profit recompute in place, with no confirm dialog and no full page reload. The override applies only to that member, everywhere their rankings are computed (Promos tab, Opportunities feed, promo pairs, profit totals/observations as appropriate, mark-done snapshot). Scrapes never touch it.

</domain>

<decisions>
## Implementation Decisions (locked — owner, 2026-10-01)

- Per member, NOT shared: one member's cap never changes another member's numbers. (Owner: "let users type their own cap".)
- Inline field on the Promos tab profit-boost rows (scraped promos AND member-added promos — for added promos it simply overrides for the adder too, or the planner may route added promos to their existing edit form; Claude's discretion, keep it simple).
- Saves instantly: no confirm dialog, no full page reload. Use the existing client refetch pattern (e.g. recomputeKey / re-running the promos action) or optimistic update — row shows recomputed numbers right after save.
- A way to clear the override (back to the promo's own cap).
- Effective cap = the member's override when set, otherwise the promo's max_stake. Allow override to be lower OR higher than the scraped value (owner's account may have a different limit either way) — but bounded (> 0, sane max, exact cents, decimal.js).
- Scrapes never overwrite or delete overrides (separate table keyed by user + promo).
- Storage: new additive table (e.g. `user_promo_caps(user_id, promo_id, max_stake, updated_at)`, PK (user_id, promo_id), FKs ON DELETE cascade). Generate the drizzle migration file; DO NOT apply it to the live Neon DB — applying is a blocking human checkpoint requiring the owner's explicit OK.
- Security: server action requires the session user, strict input {promoId, maxStake|null}, ownership = session user only, promo must be visible to the viewer (promoVisibilityCondition / viewer-scoped getActivePromos), only profit_boost promos.
- Money math via decimal.js only.

### Out of scope
- Restoring flagged promo #20 from the review queue (owner will Confirm it in the "Needs a look" queue, then set Your cap = 20).
- Overriding max winnings / min odds / boost %.
- Bonus bets (no stake cap concept to override).

</decisions>

<canonical_refs>
## Canonical References

- `src/db/schema.ts` (promos, promo_completions patterns), `drizzle/0010_added_promos.sql` (additive migration style)
- `src/db/promos.ts` (getActivePromos, promoVisibilityCondition), `src/db/feedContext.ts`, `src/app/actions/get-promos.ts`, `src/app/actions/get-opportunities.ts`
- `src/domain/promos/rankPromoHedges.ts` (where maxStake feeds the boost solver)
- `src/lib/safeAction.ts` (260930-iaw: wrap client action calls)
- Promos tab row components under `src/components/promos/`
- `.planning/phases/05-group-added-promos/05-SECURITY.md` (visibility / IDOR patterns to mirror)

</canonical_refs>
