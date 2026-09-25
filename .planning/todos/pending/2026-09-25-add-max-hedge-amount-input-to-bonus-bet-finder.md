---
created: 2026-09-25T20:04:33.353Z
title: Add max hedge amount input to bonus-bet finder
area: ui
files:
  - src/components/finder/FinderForm.tsx
  - src/domain/finder/finderInput.ts
  - src/domain/hedge/rankBonusBetHedges.ts
---

## Problem

The bonus-bet finder (Phase 1) ranks hedges purely by guaranteed profit and assumes the user can fund whatever hedge stake the math requires. Converting a large bonus bet at plus odds can require a big cash hedge (e.g. a $100 bonus at +300 needs a ~$290+ hedge; larger bonuses can need $800+). A user who doesn't have that capital on hand sees top results they can't actually place. Requested by the owner during Phase 1 execution — deferred, not part of Phase 1.

## Solution

Add an optional "Max hedge amount" input to the finder form (validated in `FinderInputSchema`, decimal/cents like other money inputs). Options:
- Filter out results whose required hedge stake exceeds the cap, and/or
- Re-rank so affordable options come first, showing the over-cap ones de-emphasized.
- Possibly offer a partial/scaled hedge when the cap is below the full hedge (profit is then no longer fully guaranteed — must be clearly labeled with worst-case outcome; math must stay exact via decimal.js).
Also consider an empty state when nothing fits under the cap. Candidate for Phase 2+ (e.g. alongside the feed/filters work).
