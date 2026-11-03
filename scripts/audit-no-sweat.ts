/**
 * Phase 9 (D-18): one-off re-check of stored promos for mis-typed no-sweats
 * (e.g. DraftKings "NFL London No Sweat", row 94, stored as a bonus bet).
 *
 * Default is a DRY RUN: prints the plan and writes nothing.
 * `--apply` performs the writes. Run --apply only with the owner's OK.
 *
 * Usage: npm run promos:audit-no-sweat [-- --apply]
 */
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { promos } from "../src/db/schema";
import { planNoSweatBackfill, type AuditRow, type BackfillAction } from "../src/ingestion/promos/noSweatAudit";

function describeAction(a: BackfillAction): string {
  switch (a.kind) {
    case "retype":
      return `re-type as no-sweat (refund cap $${a.refundCap})`;
    case "expire_duplicate":
      return "expire (a no-sweat copy of this promo already exists)";
    case "to_review":
      return a.reason === "cash_refund" ? "send to review (refund looks like cash)" : "send to review (refund cap unclear)";
    case "list_only":
      return "hand-added by a member: list only, not changed";
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = getDb();

  const stored = await db
    .select({
      id: promos.id,
      bookKey: promos.bookKey,
      promoType: promos.promoType,
      status: promos.status,
      addedByUserId: promos.addedByUserId,
      rawText: promos.rawText,
      bonusAmount: promos.bonusAmount,
      dedupeKey: promos.dedupeKey,
      parsed: promos.parsed,
    })
    .from(promos)
    .where(inArray(promos.status, ["active", "pending_review"]));

  // The promos table has no title column; the title lives in the parsed JSON.
  const rows: AuditRow[] = stored.map((r) => {
    const t = (r.parsed as { title?: unknown } | null)?.title;
    return { ...r, title: typeof t === "string" ? t : "" };
  });
  const actions = planNoSweatBackfill(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));

  console.log(apply ? "MODE: APPLY (writing changes)" : "MODE: DRY RUN (nothing is written)");
  console.log(`Checked ${rows.length} live promo(s); ${actions.length} need attention.\n`);
  for (const a of actions) {
    const r = byId.get(a.id);
    console.log(`  #${a.id}  ${r?.bookKey ?? "?"}  "${r?.title ?? ""}"  ->  ${describeAction(a)}`);
  }

  const counts = { retype: 0, expire_duplicate: 0, to_review: 0, list_only: 0 };

  if (apply) {
    for (const a of actions) {
      counts[a.kind] += 1;
      if (a.kind === "retype") {
        await db
          .update(promos)
          .set({
            promoType: "no_sweat",
            bonusAmount: a.refundCap,
            boostPercent: null,
            maxStake: null,
            parsed: a.newParsed,
            dedupeKey: a.newDedupeKey,
          })
          .where(and(eq(promos.id, a.id), ne(promos.promoType, "no_sweat"), isNull(promos.addedByUserId)));
      } else if (a.kind === "expire_duplicate") {
        await db.update(promos).set({ status: "expired" }).where(and(eq(promos.id, a.id), isNull(promos.addedByUserId)));
      } else if (a.kind === "to_review") {
        await db
          .update(promos)
          .set({ status: "pending_review", reviewReason: "classify" })
          .where(and(eq(promos.id, a.id), isNull(promos.addedByUserId)));
      }
    }
  } else {
    for (const a of actions) counts[a.kind] += 1;
  }

  console.log(
    `\n${apply ? "Applied" : "Would apply"}: ${counts.retype} re-typed, ${counts.expire_duplicate} expired as duplicates, ${counts.to_review} sent to review, ${counts.list_only} listed only.`,
  );
  if (!apply) console.log("Re-run with --apply (after the owner's OK) to write these changes.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
