---
quick_id: 261022-hxb
slug: trust-ai-reader-over-parser
date: 2026-10-22
type: quick
---

# Quick 261022-hxb: Trust the AI reader over the parser

Owner (2026-10-22, after DK 1150292 "NBA 1st Quarter Player Props 30% Profit Boost" went to review): "let's trust the AI over the parser for now and see how it goes".

## Task
In `reconcileCandidate` (src/ingestion/promos/reconcile.ts), when the reader is high-confidence:
- reader not usable -> skip the candidate (reason from the reader: prop / live_only / sgp / new_customer / its clear skipReason, else not_a_promo), `reviewSuppressed: "reader_not_usable"` so it never reaches review;
- reader disagrees on type/amounts with a clean verbatim guard -> use the reader's type and amounts (schema-validated), else review.
Medium/low confidence keeps the old review routing. Verbatim guard, guard_drop and multi-game review rules unchanged. Log both overrides in readerPass. Supersedes T-kc5-02 ("a pattern-kept candidate is never dropped").
