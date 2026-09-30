"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runSpreadsTotalsRefresh, type ExtendedRefreshOutcome } from "@/ingestion/odds/refreshExtended";
import { getActivePromos } from "@/db/promos";
import type { AltSpreadPin } from "@/domain/promos/altSpreads";

const RefreshSpreadsTotalsInputSchema = z.object({ confirmed: z.boolean() });

/**
 * refreshSpreadsTotals: the only user-triggered path that spends Odds API
 * credits for spreads/totals (SC2, D-13, D-14). Login-only (D-20, closes
 * 01.1 review WR-05): requireUser() is the first statement, before input
 * parsing, the refresh lock, the credit gate or any Odds API call. Its
 * userId is threaded through as triggeredByUserId so every shared-credit
 * spend is attributed (D-21). Structural copy of refresh-odds.ts's action --
 * same input validation shape, same revalidate-on-ok behavior -- calling
 * the extended orchestration instead.
 */
export async function refreshSpreadsTotals(input: unknown): Promise<ExtendedRefreshOutcome> {
  const user = await requireUser();

  const parsed = RefreshSpreadsTotalsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid refresh request" };
  }

  // Alt-line pins come only from the member's own visible promos, loaded
  // server-side (never from client input, T-gam-01), and only on a
  // confirmed press. A load failure must not block the main refresh.
  let altSpreadPins: AltSpreadPin[] = [];
  if (parsed.data.confirmed) {
    try {
      const promos = await getActivePromos(new Date(), user.userId);
      for (const promo of promos) {
        const pinned = promo.pinned;
        if (
          pinned &&
          pinned.marketType === "spread" &&
          pinned.line !== null &&
          (pinned.side === "home" || pinned.side === "away")
        ) {
          altSpreadPins.push({ eventId: pinned.eventId, line: pinned.line, side: pinned.side });
        }
      }
    } catch {
      altSpreadPins = [];
    }
  }

  const outcome = await runSpreadsTotalsRefresh({
    confirmed: parsed.data.confirmed,
    triggeredByUserId: user.userId,
    altSpreadPins,
  });

  if (outcome.status === "ok") {
    revalidatePath("/");
  }

  return outcome;
}
