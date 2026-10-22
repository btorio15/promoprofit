---
quick_id: 261022-hxb
slug: trust-ai-reader-over-parser
status: complete
date: 2026-10-22
---

# Quick 261022-hxb Summary

High-confidence reader verdicts now win over the parser: "not usable" skips the promo (suppressed from review, reason from the reader), and a disagreement on type or amounts takes the reader's values when the verbatim guard is clean. Medium/low confidence still goes to review. New tests (b2, f2, f3); three existing tests now pin the medium-confidence review path. npm test 1984 passed, lint clean, tsc clean apart from the stale generated .next file. Commit 49eaaff.
