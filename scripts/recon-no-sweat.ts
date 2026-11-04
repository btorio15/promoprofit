/**
 * Dev-only recon (phase 09, A-07): fetch today's public promo lists for
 * DraftKings, FanDuel and Bally Bet using each scraper's OWN listRequest
 * (plain HTTP, no login, no stealth, no proxies) and save sanitised dated
 * fixtures. Not wired into package.json or CI.
 *   npx tsx scripts/recon-no-sweat.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetchRequest } from "../src/ingestion/promos/fetchPage";
import { draftkingsScraper } from "../src/ingestion/promos/books/draftkings";
import { fanduelScraper } from "../src/ingestion/promos/books/fanduel";
import { ballybetScraper } from "../src/ingestion/promos/books/ballybet";
import type { HttpRequestSpec } from "../src/domain/promos/scraped";

const OUT_DIR = path.join(process.cwd(), "src/test/fixtures/promos");
const NO_SWEAT_RE = /no[- ]sweat|bet back|second chance|money back|stake back|refund/i;
const SECRET_KEY_RE = /cookie|session|auth|token(?!s?$)/i;
const BALLY_DETAIL_BASE = "https://dx-config-service.eks00.prod.na00.aws.ballys.tech/view";
const MAX_BALLY_DETAILS = 6;

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());

function sanitise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitise);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) continue;
      out[k] = sanitise(v);
    }
    return out;
  }
  return value;
}

function serialise(body: string): { text: string; json: unknown | null } {
  try {
    const json = sanitise(JSON.parse(body));
    return { text: JSON.stringify(json, null, 2) + "\n", json };
  } catch {
    return { text: body, json: null };
  }
}

/** Every object in the tree that has a string title/headline; used for the summary. */
function collectTitled(value: unknown, acc: Array<Record<string, unknown>> = []) {
  if (Array.isArray(value)) value.forEach((v) => collectTitled(v, acc));
  else if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.title === "string" || typeof o.promotionHeadline === "string") acc.push(o);
    Object.values(o).forEach((v) => collectTitled(v, acc));
  }
  return acc;
}

function titleOf(o: Record<string, unknown>): string {
  return String(o.title ?? o.promotionHeadline ?? "");
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const books = [
    { key: "draftkings", scraper: draftkingsScraper },
    { key: "fanduel", scraper: fanduelScraper },
    { key: "ballybet", scraper: ballybetScraper },
  ];

  for (const { key, scraper } of books) {
    const res = await fetchRequest(scraper.listRequest);
    if (!res.ok) {
      console.log(`[${key}] FAILED: ${res.reason}`);
      continue;
    }
    const { text, json } = serialise(res.body);
    const file = path.join(OUT_DIR, `${key}-promos-${today}.json`);
    writeFileSync(file, text);
    const titled = json === null ? [] : collectTitled(json);
    const hits = titled.filter((o) => NO_SWEAT_RE.test(JSON.stringify(o)));
    console.log(`[${key}] saved ${file} (${titled.length} titled entries)`);
    for (const h of hits) console.log(`  no-sweat-like: ${titleOf(h)}`);

    if (key === "ballybet" && json !== null) {
      const seen = new Set<string>();
      for (const h of hits) {
        const link = h.link as { url?: unknown } | undefined;
        const m = typeof link?.url === "string" ? /\/promotions\/([^/?#]+)/.exec(link.url) : null;
        const slug = m ? m[1] : null;
        if (!slug || seen.has(slug) || seen.size >= MAX_BALLY_DETAILS) continue;
        seen.add(slug);
        const req: HttpRequestSpec = {
          ...scraper.listRequest,
          url: `${BALLY_DETAIL_BASE}/${slug}`,
        };
        const d = await fetchRequest(req);
        if (!d.ok) {
          console.log(`  [ballybet detail ${slug}] FAILED: ${d.reason}`);
          continue;
        }
        const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
        const dfile = path.join(OUT_DIR, `ballybet-promo-detail-${safeSlug}.json`);
        writeFileSync(dfile, serialise(d.body).text);
        console.log(`  saved detail ${dfile}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
