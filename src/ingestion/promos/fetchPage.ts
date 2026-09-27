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
/** Hard cap on the response body, enforced while streaming (WR-08) -- never buffered first. */
const MAX_RESPONSE_BYTES = 5_000_000;
/** Same-host redirects only (WR-08); a redirect to any other host is refused. */
const MAX_REDIRECTS = 3;
const NETWORK_ERROR_REASON_MAX_CHARS = 200;

function shortMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.length > NETWORK_ERROR_REASON_MAX_CHARS
    ? message.slice(0, NETWORK_ERROR_REASON_MAX_CHARS)
    : message;
}

const TOO_LARGE: FetchResult = { ok: false, reason: "response too large" };

/**
 * Reads the body as text, aborting as soon as it exceeds MAX_RESPONSE_BYTES
 * (checks content-length up front, then counts streamed bytes) so a huge or
 * hostile response never has to fit in memory first.
 */
async function readCappedBody(response: Response): Promise<FetchResult> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    return TOO_LARGE;
  }
  if (!response.body) return { ok: true, body: "" };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      return TOO_LARGE;
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  return { ok: true, body };
}

export const fetchRequest: FetchRequest = async (req) => {
  const originHost = new URL(req.url).host;
  let url = req.url;
  let method = req.method;
  let body: string | undefined = req.body ?? undefined;

  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      response = await fetch(url, {
        method,
        headers: req.headers,
        body,
        // WR-08: never let fetch follow a redirect on its own -- the request
        // (and the spec's headers) must never be bounced to another host.
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // Network error, DNS failure, or the 30s abort timeout firing.
      return { ok: false, reason: shortMessage(err) };
    }

    if (response.status < 300 || response.status >= 400) break;

    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => {});
    if (!location) return { ok: false, reason: `HTTP ${response.status} without a location` };

    const next = new URL(location, url);
    if (next.host !== originHost || next.protocol !== new URL(req.url).protocol) {
      return { ok: false, reason: `redirect to another host refused (${next.host})` };
    }
    if (hop === MAX_REDIRECTS) return { ok: false, reason: "too many redirects" };

    // 307/308 preserve the method and body; 301/302/303 become a bodiless GET (fetch spec).
    if (response.status !== 307 && response.status !== 308) {
      method = "GET";
      body = undefined;
    }
    url = next.toString();
  }

  if (!response) return { ok: false, reason: "no response" };

  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status}` };
  }

  try {
    return await readCappedBody(response);
  } catch (err) {
    return { ok: false, reason: shortMessage(err) };
  }
};
