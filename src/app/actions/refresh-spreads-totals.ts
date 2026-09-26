"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { runSpreadsTotalsRefresh, type ExtendedRefreshOutcome } from "@/ingestion/odds/refreshExtended";

const RefreshSpreadsTotalsInputSchema = z.object({ confirmed: z.boolean() });

/**
 * refreshSpreadsTotals: the only user-triggered path that spends Odds API
 * credits for spreads/totals (SC2, D-13, D-14). Structural copy of
 * refresh-odds.ts's action -- same input validation shape, same
 * revalidate-on-ok behavior -- calling the extended orchestration instead.
 */
export async function refreshSpreadsTotals(input: unknown): Promise<ExtendedRefreshOutcome> {
  const parsed = RefreshSpreadsTotalsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid refresh request" };
  }

  const outcome = await runSpreadsTotalsRefresh({ confirmed: parsed.data.confirmed });

  if (outcome.status === "ok") {
    revalidatePath("/");
  }

  return outcome;
}
