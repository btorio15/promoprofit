"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { runOddsRefresh, type RefreshOutcome } from "@/ingestion/odds/refresh";

const RefreshInputSchema = z.object({ confirmed: z.boolean() });

/**
 * refreshOdds: the only user-triggered path that spends Odds API credits
 * (ODDS-01, ODDS-04). Revalidates "/" on success so the finder page picks
 * up the new cache on next render.
 */
export async function refreshOdds(input: unknown): Promise<RefreshOutcome> {
  const parsed = RefreshInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid refresh request" };
  }

  const outcome = await runOddsRefresh({ confirmed: parsed.data.confirmed });

  if (outcome.status === "ok") {
    revalidatePath("/");
  }

  return outcome;
}
