"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runOddsRefresh, type RefreshOutcome } from "@/ingestion/odds/refresh";

const RefreshInputSchema = z.object({ confirmed: z.boolean() });

/**
 * refreshOdds: the only user-triggered path that spends Odds API credits
 * (ODDS-01, ODDS-04). Login-only (D-20, closes 01.1 review WR-05):
 * requireUser() is the first statement, before input parsing, the refresh
 * lock, the credit gate or any Odds API call, so a logged-out request never
 * touches any of those. Its userId is threaded through as
 * triggeredByUserId so every shared-credit spend is attributed to the
 * member who caused it (D-21). Revalidates "/" on success so the finder
 * page picks up the new cache on next render.
 */
export async function refreshOdds(input: unknown): Promise<RefreshOutcome> {
  const user = await requireUser();

  const parsed = RefreshInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid refresh request" };
  }

  const outcome = await runOddsRefresh({
    confirmed: parsed.data.confirmed,
    triggeredByUserId: user.userId,
  });

  if (outcome.status === "ok") {
    revalidatePath("/");
  }

  return outcome;
}
