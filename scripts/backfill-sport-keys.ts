/**
 * One-off backfill: give promos with no sport (and no matched game) the sport
 * their own text names, using the same rules the scraper now applies
 * (sportFromPromoText). Dry run by default; pass --apply to write.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-sport-keys.ts
 *   npx tsx --env-file=.env.local scripts/backfill-sport-keys.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { sportFromPromoText } from "../src/ingestion/promos/sportHints";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  const rows = await sql`
    select id, promo_type, status, parsed->>'title' as title, raw_text
    from promos
    where sport_key is null and scope_kind is null
    order by id
  `;

  const tally = new Map<string, number>();
  const updates: { id: number; sportKey: string }[] = [];
  for (const row of rows) {
    const hint = sportFromPromoText(String(row.title ?? ""), String(row.raw_text ?? ""));
    const label = hint.kind === "supported" ? hint.sportKey : hint.kind === "unsupported" ? `unsupported:${hint.label}` : "unknown";
    tally.set(label, (tally.get(label) ?? 0) + 1);
    if (hint.kind === "supported") updates.push({ id: Number(row.id), sportKey: hint.sportKey });
  }

  console.log(`promos with no sport and no matched game: ${rows.length}`);
  for (const [label, count] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label}: ${count}`);
  }

  if (!apply) {
    console.log(`dry run: would set a sport on ${updates.length} promos. Re-run with --apply to write.`);
    return;
  }

  for (const update of updates) {
    await sql`update promos set sport_key = ${update.sportKey} where id = ${update.id} and sport_key is null and scope_kind is null`;
  }
  console.log(`updated ${updates.length} promos`);
}

main().catch((err) => {
  console.error("backfill-sport-keys failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
