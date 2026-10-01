"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import {
  runPromoSportsRefresh,
  type AltSpreadEventPicker,
  type PromoRefreshOutcome,
} from "@/ingestion/odds/refreshExtended";
import { getActivePromos, type ActivePromo } from "@/db/promos";
import { getCachedEvents, getCachedExtendedEvents, getHedgeBookKeys, getUserBookKeys } from "@/db/queries";
import { getPromoCompletions } from "@/db/promoTracking";
import { pickLeagueWideAltSpreadEventIds } from "@/domain/promos/leagueWideAltTargets";
import { buildAltSpreadRequests, NO_ALT_SPREAD_REQUESTS, type AltSpreadRequests } from "@/domain/promos/altSpreads";
import { estimatePromoAltGames, promoRefreshSportKeys } from "@/domain/promos/promoRefreshScope";

const RefreshPromosInputSchema = z.object({ confirmed: z.boolean() });

const NO_PROMOS_MESSAGE = "No active promos to refresh.";

/**
 * refreshPromos (quick-261001-jbc): "Refresh promos" on the status bar.
 * Refreshes h2h+spreads+totals only for the sports the member's visible,
 * non-Done promos cover, then the best-game alt-spread shortcut. Login-only:
 * requireUser() is the first statement, before input parsing, the refresh
 * lock, the credit gate or any Odds API call (T-jbc-01). Everything it
 * refreshes is derived server-side from the viewer's own promos -- the only
 * client input is `confirmed` (T-jbc-02). The pressing member's userId is
 * threaded through as triggeredByUserId so the shared-credit spend is
 * attributed (D-07). Structural copy of refresh-spreads-totals.ts, which
 * stays untouched for the Arbitrage tab's full search.
 */
export async function refreshPromos(input: unknown): Promise<PromoRefreshOutcome> {
  const user = await requireUser();

  const parsed = RefreshPromosInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid refresh request" };
  }

  let feedPromos: ActivePromo[];
  let userBookKeys: string[];
  try {
    const [activePromos, completions, bookKeys] = await Promise.all([
      getActivePromos(new Date(), user.userId),
      getPromoCompletions(user.userId),
      getUserBookKeys(user.userId),
    ]);
    const doneIds = new Set(completions.map((c) => c.promoId));
    // Same set the Promos tab ranks: active minus the member's Done promos.
    feedPromos = activePromos.filter((p) => !doneIds.has(p.id));
    userBookKeys = bookKeys;
  } catch {
    return { status: "error", message: "Couldn't load your promos to refresh. Try again." };
  }

  if (feedPromos.length === 0) {
    return { status: "no_promos", message: NO_PROMOS_MESSAGE };
  }

  // A pinned "any" promo resolves to its pinned event's sport from the cached
  // events (cheap DB read, 0 credits). A read failure just means "unknown",
  // which falls back to every sport -- the confirm dialog quotes that cost.
  const sportByEvent = new Map<string, string>();
  try {
    const [ml, ext] = await Promise.all([getCachedEvents(), getCachedExtendedEvents()]);
    for (const e of [...ml.events, ...ext.events]) sportByEvent.set(e.id, e.sport_key);
  } catch {
    sportByEvent.clear();
  }

  const sportKeys = promoRefreshSportKeys(feedPromos, { sportOfEvent: (id) => sportByEvent.get(id) });
  const altGameEstimate = estimatePromoAltGames(feedPromos);

  let altSpreads: AltSpreadRequests = NO_ALT_SPREAD_REQUESTS;
  let pickAltSpreadEventIds: AltSpreadEventPicker | undefined;
  if (parsed.data.confirmed) {
    altSpreads = buildAltSpreadRequests(feedPromos);
    try {
      const hedgeBookKeys = new Set(await getHedgeBookKeys(new Set(userBookKeys)));
      pickAltSpreadEventIds = (fresh) =>
        pickLeagueWideAltSpreadEventIds(feedPromos, {
          moneylineEvents: fresh.moneylineEvents,
          extendedEvents: fresh.extendedEvents,
          hedgeBookKeys,
          precision: "cents",
          now: fresh.now,
        });
    } catch {
      pickAltSpreadEventIds = undefined;
    }
  }

  const outcome = await runPromoSportsRefresh({
    confirmed: parsed.data.confirmed,
    triggeredByUserId: user.userId,
    sportKeys,
    altGameEstimate,
    altSpreads,
    pickAltSpreadEventIds,
  });

  if (outcome.status === "ok") {
    revalidatePath("/");
  }

  return outcome;
}
