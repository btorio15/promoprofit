import Decimal from "decimal.js";
import { promoDedupeKey } from "@/domain/promos/dedupe";
import { ScrapedPromoSchema, type ScrapedPromo } from "@/domain/promos/scraped";
import { classifyExclusion } from "./exclusions";
import { classifyNoSweat } from "./noSweat";

/**
 * Phase 9 (D-18, A-08): one-off backfill planner. Decides, for each stored live
 * promo, whether it is a mis-typed no-sweat to re-type, a duplicate to expire,
 * an uncertain one for review, or a hand-added one to list only. Pure; no I/O.
 *
 * Pass ALL live rows (including ones already typed no_sweat): those are never
 * acted on, but their dedupe keys are used to detect duplicates.
 */
export interface AuditRow {
  id: number;
  bookKey: string;
  promoType: string;
  status: string;
  addedByUserId: number | null;
  title: string;
  rawText: string;
  bonusAmount: string | null;
  dedupeKey: string;
  parsed: unknown;
}

export type BackfillAction =
  | { kind: "retype"; id: number; refundCap: string; newDedupeKey: string; newParsed: ScrapedPromo }
  | { kind: "expire_duplicate"; id: number; duplicateOfDedupeKey: string }
  | { kind: "to_review"; id: number; reason: "cash_refund" | "cap_unclear" }
  | { kind: "list_only"; id: number; title: string };

const LIVE_STATUSES = new Set(["active", "pending_review"]);

function sameAmount(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  try {
    return new Decimal(a).eq(new Decimal(b));
  } catch {
    return false;
  }
}

export function planNoSweatBackfill(rows: AuditRow[]): BackfillAction[] {
  const liveKeys = new Set(rows.filter((r) => LIVE_STATUSES.has(r.status)).map((r) => r.dedupeKey));
  const actions: BackfillAction[] = [];

  for (const row of rows) {
    if (!LIVE_STATUSES.has(row.status)) continue;
    if (row.promoType === "no_sweat") continue;

    const input = { title: row.title, text: row.rawText };
    if (classifyExclusion(input) !== null) continue;
    const detection = classifyNoSweat(input);
    if (detection.kind === "none") continue;

    // Members' own data: never rewritten, only listed.
    if (row.addedByUserId !== null) {
      actions.push({ kind: "list_only", id: row.id, title: row.title });
      continue;
    }

    if (detection.kind === "cash_refund") {
      actions.push({ kind: "to_review", id: row.id, reason: "cash_refund" });
      continue;
    }

    const cap = detection.refundCap;
    if (cap === null || !sameAmount(cap, row.bonusAmount)) {
      actions.push({ kind: "to_review", id: row.id, reason: "cap_unclear" });
      continue;
    }

    const candidate = {
      ...(typeof row.parsed === "object" && row.parsed !== null ? row.parsed : {}),
      promoType: "no_sweat",
      bonusAmount: cap,
      boostPercent: null,
      maxStake: null,
    };
    const result = ScrapedPromoSchema.safeParse(candidate);
    if (!result.success) {
      actions.push({ kind: "to_review", id: row.id, reason: "cap_unclear" });
      continue;
    }
    const newParsed = result.data as ScrapedPromo;
    const newDedupeKey = promoDedupeKey(newParsed);

    if (liveKeys.has(newDedupeKey)) {
      actions.push({ kind: "expire_duplicate", id: row.id, duplicateOfDedupeKey: newDedupeKey });
    } else {
      actions.push({ kind: "retype", id: row.id, refundCap: cap, newDedupeKey, newParsed });
    }
  }
  return actions;
}
