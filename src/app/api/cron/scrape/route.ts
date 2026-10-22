import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dispatchScrapeWorkflow } from "@/lib/githubDispatch";

/**
 * Scrape + odds trigger for Vercel Cron (quick-261022-i3j). The day has three
 * standard runs, each a promo scrape plus one moneyline odds refresh and
 * profit recording, at 7 AM, 12 PM and 5 PM Mountain Standard Time:
 *   - 14:00 UTC (?slot=morning) and 19:00 UTC (?slot=midday): Vercel Cron
 *     (Hobby allows two daily jobs), which fires on time;
 *   - 00:00 UTC (5 PM): the GitHub Actions schedule in scrape-promos.yml,
 *     which can start late.
 * The cron times are fixed in UTC, so during daylight time (Mar-Nov) each run
 * lands an hour later in Mountain time (8 AM, 1 PM, 6 PM).
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
    forceMorningObserve: true,
    repo: process.env.GH_REPO || undefined,
  });
  if (result.ok) return Response.json({ dispatched: true });

  console.error("cron/scrape failed: dispatch status", result.status ?? "network");
  return Response.json({ dispatched: false }, { status: 502 });
}
