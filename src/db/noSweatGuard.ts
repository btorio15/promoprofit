import { getTrackedNoSweat } from "./trackedNoSweats";
import { getPromoCompletions } from "./promoTracking";

/**
 * D-14: a hand-added no-sweat the acting member is tracking (a tracked_no_sweats
 * row, any state) or has marked done (a promo_completions row) can no longer be
 * edited, expired or deleted -- the tracked bet and the saved result point at
 * it. Only no-sweats are guarded; completions of other promo types keep their
 * existing behaviour. Scoped to the session user, never input.
 */
export async function isNoSweatTrackedOrDone(userId: number, promoId: number): Promise<boolean> {
  if ((await getTrackedNoSweat(userId, promoId)) !== null) return true;
  const completions = await getPromoCompletions(userId);
  return completions.some((c) => c.promoId === promoId && c.promoType === "no_sweat");
}
