/**
 * Phase 9 (D-18): one-off re-check of stored promos for mis-typed no-sweats
 * (e.g. DraftKings "NFL London No Sweat", row 94, stored as a bonus bet).
 *
 * Default is a DRY RUN: prints the plan and writes nothing.
 * `--apply` performs the writes. Run --apply only with the owner's OK.
 *
 * Usage: npm run promos:audit-no-sweat [-- --apply]
 */
import { and, eq, isNull, ne } from "drizzle-orm";
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

  // WR-03: every status is loaded (not just live rows) because promos.dedupe_key is
  // UNIQUE across all statuses; the planner only acts on live rows but checks
  // every key so a retype never collides with an expired/dismissed row.
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
    .from(promos);

  // The promos table has no title column; the title lives in the parsed JSON.
  const rows: AuditRow[] = stored.map((r) => {
    const t = (r.parsed as { title?: unknown } | null)?.title;
    return { ...r, title: typeof t === "string" ? t : "" };
  });
  const actions = planNoSweatBackfill(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));

  console.log(apply ? "MODE: APPLY (writing changes)" : "MODE: DRY RUN (nothing is written)");
  const liveCount = rows.filter((r) => r.status === "active" || r.status === "pending_review").length;
  console.log(`Checked ${liveCount} live promo(s); ${actions.length} need attention.\n`);
  for (const a of actions) {
    const r = byId.get(a.id);
    console.log(`  #${a.id}  ${r?.bookKey ?? "?"}  "${r?.title ?? ""}"  ->  ${describeAction(a)}`);
  }

  const counts = { retype: 0, expire_duplicate: 0, to_review: 0, list_only: 0 };
  const failed: { id: number; message: string }[] = [];

  if (apply) {
    // neon-http has no multi-statement transaction here, so each row is written on
    // its own; a failure (e.g. a unique dedupe_key violation) is caught per row and
    // reported instead of aborting the rest of the backfill half-applied (WR-03).
    for (const a of actions) {
      try {
        await applyAction(db, a);
        counts[a.kind] += 1;
      } catch (err) {
        failed.push({ id: a.id, message: describeError(err) });
      }
    }
  } else {
    for (const a of actions) counts[a.kind] += 1;
  }

  console.log(
    `\n${apply ? "Applied" : "Would apply"}: ${counts.retype} re-typed, ${counts.expire_duplicate} expired as duplicates, ${counts.to_review} sent to review, ${counts.list_only} listed only.`,
  );
  if (failed.length > 0) {
    console.log(`\n${failed.length} row(s) could not be written and were left unchanged:`);
    for (const f of failed) console.log(`  #${f.id}  ${f.message}`);
    process.exitCode = 1;
  }
  if (!apply) console.log("Re-run with --apply (after the owner's OK) to write these changes.");
}

/** Postgres unique_violation is SQLSTATE 23505 (on the error or its cause). */
function describeError(err: unknown): string {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  const message = err instanceof Error ? err.message : String(err);
  return code === "23505" ? `unique dedupe_key conflict (${message})` : message;
}

async function applyAction(db: ReturnType<typeof getDb>, a: BackfillAction): Promise<void> {
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

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
