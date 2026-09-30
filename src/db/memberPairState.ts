import { loadMemberFeedContext } from "./feedContext";
import type { ActivePromo } from "./promos";
import type { DonePromoTerms } from "@/domain/promos/doneSnapshot";
import { promoTitle } from "@/domain/promos/promoRowDto";
import { rankPromoHedges } from "@/domain/promos/rankPromoHedges";
import { findPairCandidates, singleProfitMap } from "@/domain/promos/pairPromos";
import { toPairRowDTO, type PairRowDTO } from "@/domain/promos/pairRowDto";
import { DonePairSnapshotSchema } from "@/domain/promos/pairSnapshot";
import type { StakePrecision } from "@/domain/hedge/arbMath";

/**
 * Phase 4 Plan 07: one promo pair's CURRENT row for ONE member, computed with
 * the same feed context Opportunities uses, so it equals the PairRowDTO the
 * feed showed. `userId` MUST come from the session, never from client input.
 *
 * Both promos must be active, not already done by this member, and at the
 * member's books (pre-check instead of relying on any ON CONFLICT). A pair
 * this member already marked (double tap) is reported as already_done_pair.
 */
export type MemberPairState =
  | { kind: "not_active" }
  | { kind: "already_done_pair"; profitExtracted: string }
  | {
      kind: "pair";
      /** null: the pair no longer exists or no longer beats hedging separately. */
      row: PairRowDTO | null;
      termsA: DonePromoTerms;
      termsB: DonePromoTerms;
      oddsFetchedAt: { moneyline: Date | null; spreadsTotals: Date | null };
    };

function termsOf(promo: ActivePromo): DonePromoTerms {
  return {
    id: promo.id,
    bookKey: promo.bookKey,
    promoType: promo.promoType,
    title: promoTitle(promo),
    boostPercent: promo.boostPercent,
    boostedOddsAmerican: promo.boostedOddsAmerican,
    baseOddsAmerican: promo.baseOddsAmerican,
    bonusAmount: promo.bonusAmount,
    maxStake: promo.maxStake,
    winningsCap: promo.winningsCap,
    minOddsAmerican: promo.minOddsAmerican,
  };
}

export async function computeMemberPairState(args: {
  userId: number;
  promoIdA: number;
  promoIdB: number;
  precision: StakePrecision;
  now: Date;
}): Promise<MemberPairState> {
  const { userId, promoIdA, promoIdB, precision, now } = args;
  const ctx = await loadMemberFeedContext({ userId, precision, now });

  // Double tap: this exact pair is already recorded for this member.
  const wanted = [promoIdA, promoIdB].sort((x, y) => x - y);
  for (const c of ctx.completions) {
    if (c.promoId !== promoIdA && c.promoId !== promoIdB) continue;
    const parsed = DonePairSnapshotSchema.safeParse(c.snapshot);
    if (!parsed.success) continue;
    const ids = [...parsed.data.pairPromoIds].sort((x, y) => x - y);
    if (ids[0] === wanted[0] && ids[1] === wanted[1]) {
      return { kind: "already_done_pair", profitExtracted: c.profitExtracted };
    }
  }

  const promoA = ctx.feedPromos.find((p) => p.id === promoIdA);
  const promoB = ctx.feedPromos.find((p) => p.id === promoIdB);
  if (!promoA || !promoB) return { kind: "not_active" };
  if (!ctx.userBookSet.has(promoA.bookKey) || !ctx.userBookSet.has(promoB.bookKey)) return { kind: "not_active" };

  const singles = rankPromoHedges(ctx.feedPromos, ctx.rankOpts);
  const candidates = findPairCandidates([promoA, promoB], singleProfitMap(singles), {
    ...ctx.rankOpts,
    memberBookKeys: ctx.userBookSet,
  });
  const row = candidates[0] ? toPairRowDTO(candidates[0], ctx.bookNames) : null;

  // Order the terms the way the row orders the legs (A = row.promoIdA).
  const swap = row !== null && row.promoIdA === promoIdB;
  return {
    kind: "pair",
    row,
    termsA: termsOf(swap ? promoB : promoA),
    termsB: termsOf(swap ? promoA : promoB),
    oddsFetchedAt: { moneyline: ctx.oddsFetchedAt, spreadsTotals: ctx.extendedOddsFetchedAt },
  };
}
