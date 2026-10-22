import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dispatchScrapeWorkflow } from "@/lib/githubDispatch";

/**
 * Morning scrape trigger for Vercel Cron (vercel.json, 13:17 UTC = 7:17 AM
 * MDT). Restored in quick-261022-hzb: GitHub's own schedule was starting the
 * "morning" run hours late (around 1:30 PM MT), so promos posted overnight
 * were missing all morning. Vercel's Hobby cron fires on time.
 *
 * It dispatches the Scrape promos workflow as a promo scrape ONLY
 * (skip_morning_observe): the three GitHub scheduled runs already do the odds
 * refresh, so this trigger adds no Odds API spending (D-17).
 *
 * Authentication: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The
 * proxy exempts /api/cron/ from the session-cookie check, so this route
 * authenticates itself and fails closed. No retries.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return unauthorized();

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return unauthorized();
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    console.error("cron/scrape failed: GH_DISPATCH_TOKEN is not set");
    return Response.json({ dispatched: false }, { status: 500 });
  }

  const result = await dispatchScrapeWorkflow({
    token,
    forceMorningObserve: false,
    repo: process.env.GH_REPO || undefined,
  });
  if (result.ok) return Response.json({ dispatched: true });

  console.error("cron/scrape failed: dispatch status", result.status ?? "network");
  return Response.json({ dispatched: false }, { status: 502 });
}
