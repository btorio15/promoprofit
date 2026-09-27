import type { HttpRequestSpec } from "@/domain/promos/scraped";

/**
 * Polite HTTP fetch for the promo scraper (PROMO-03, D-09). This is the
 * ONLY network call the scraper ever makes -- render_mode is "http" for all
 * three target books (03-RECON.md Scraper Contract), so this is plain
 * `fetch`, never a browser.
 *
 * D-09: never add cookies, an Authorization header, a proxy agent, or any
 * forged anti-bot header (e.g. FanDuel's PerimeterX `x-px-context` --
 * 03-RECON.md's FanDuel section confirms the promotions API returns 200
 * without it; forging that header is out of scope regardless of whether it
 * "works"). Only the headers a BookScraper's own request spec supplies are
 * ever sent. Node's global `fetch` (undici) has no cookie jar and never
 * sends `credentials` unless explicitly requested, so a response's
 * `Set-Cookie` is never read or persisted here.
 */

export type FetchResult = { ok: true; body: string } | { ok: false; reason: string };
export type FetchRequest = (req: HttpRequestSpec) => Promise<FetchResult>;

const TIMEOUT_MS = 30_000;
const MAX_RESPONSE_CHARS = 5_000_000;
const NETWORK_ERROR_REASON_MAX_CHARS = 200;

function shortMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > NETWORK_ERROR_REASON_MAX_CHARS
    ? message.slice(0, NETWORK_ERROR_REASON_MAX_CHARS)
    : message;
}

export const fetchRequest: FetchRequest = async (req) => {
  let response: Response;
  try {
    response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body ?? undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Network error, DNS failure, or the 30s abort timeout firing.
    return { ok: false, reason: shortMessage(err) };
  }

  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status}` };
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    return { ok: false, reason: shortMessage(err) };
  }

  if (body.length > MAX_RESPONSE_CHARS) {
    return { ok: false, reason: "response too large" };
  }

  return { ok: true, body };
};
