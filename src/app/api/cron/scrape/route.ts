import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDailyRunStatus } from "@/db/dailyRunStatus";
import { dispatchScrapeWorkflow } from "@/lib/githubDispatch";

/**
 * Vercel Cron target (D-01, D-03, D-05). Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` automatically. The proxy exempts
 * /api/cron/ from the session-cookie check, so this route authenticates
 * itself and fails closed. A duplicate delivery is guarded (WR-01): if today's
 * morning observe already ran, dispatch without forcing the odds refresh so
 * Odds API credits are not spent twice. The DB check fails open toward a
 * single forced dispatch. No retries.
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

  let forceMorningObserve = true;
  try {
    const status = await getDailyRunStatus();
    if (status.observeDone) forceMorningObserve = false;
  } catch (err) {
    console.error("cron/scrape status check failed:", err instanceof Error ? err.message : "unknown error");
  }

  const result = await dispatchScrapeWorkflow({
    token,
    forceMorningObserve,
    repo: process.env.GH_REPO || undefined,
  });
  if (result.ok) return Response.json({ dispatched: true });

  console.error("cron/scrape failed: dispatch status", result.status ?? "network");
  return Response.json({ dispatched: false }, { status: 502 });
}
