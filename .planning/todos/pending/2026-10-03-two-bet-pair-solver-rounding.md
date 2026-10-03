---
created: 2026-10-03T18:30:00Z
title: 2-bet pair solver can be a cent short of optimal at whole-dollar stakes
area: general
files:
  - src/domain/hedge/pairMath.ts
---

## Problem
Found by 261003-fxf oracle tests: for DK -150 (100% boost, cap 24) vs +130 (100% boost, cap 16), whole precision, solveBoostBoostPairUnfiltered returns $15.99 while a brute-force whole-dollar scan finds $16.00. Pre-existing; left unchanged on purpose in 261003-fxf.

## Solution
TBD — widen the 2-bet stake search (like the 3-bet per-(sa,sb) balancing) and add an oracle-agreement test; low priority (≤ 1¢).
