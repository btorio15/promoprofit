import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dispatchScrapeWorkflow } from "@/lib/githubDispatch";

/**
 * Scrape trigger for an outside scheduler (cron-job.org or similar), which
 * calls this route three times a day. Each call dispatches the Scrape promos
 * workflow with the odds refresh and profit snapshot forced on, so every
 * trigger produces a snapshot. Authentication: `Authorization: Bearer
 * $CRON_SECRET`. The proxy exempts /api/cron/ from the session-cookie check,
 * so this route authenticates itself and fails closed. No retries.
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
