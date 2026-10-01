import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { dispatchScrapeWorkflow } from "@/lib/githubDispatch";

/**
 * Vercel Cron target (D-01, D-03, D-05). Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET` automatically. The proxy exempts
 * /api/cron/ from the session-cookie check, so this route authenticates
 * itself and fails closed. Duplicate cron deliveries are accepted (rare;
 * the workflow concurrency group serializes runs). No retries.
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
    repo: process.env.GH_REPO || undefined,
  });
  if (result.ok) return Response.json({ dispatched: true });

  console.error("cron/scrape failed: dispatch status", result.status ?? "network");
  return Response.json({ dispatched: false }, { status: 502 });
}
