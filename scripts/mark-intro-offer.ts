/**
 * quick-261104-prg: one-off. Marks ONE promo as an intro offer by merging
 * {"introOffer": true} into its parsed JSON. Prints before/after.
 *
 *   npx tsx --env-file=.env.local scripts/mark-intro-offer.ts <promoId>
 */
import { neon } from "@neondatabase/serverless";

async function main() {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id) || id <= 0) throw new Error("usage: mark-intro-offer.ts <promoId>");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  const before = await sql`SELECT id, book_key, promo_type, parsed->>'title' AS title, parsed->'introOffer' AS intro_offer FROM promos WHERE id = ${id}`;
  console.log("before:", JSON.stringify(before));
  if (before.length === 0) throw new Error(`promo ${id} not found`);

  await sql`UPDATE promos SET parsed = parsed || '{"introOffer": true}'::jsonb WHERE id = ${id}`;

  const after = await sql`SELECT id, book_key, promo_type, parsed->>'title' AS title, parsed->'introOffer' AS intro_offer FROM promos WHERE id = ${id}`;
  console.log("after:", JSON.stringify(after));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
