import { z } from "zod";
import Decimal from "decimal.js";
import type { PromoRowDTO, UnprofitablePromoRowDTO } from "./dto";
import { PROMO_TYPES, type PromoType } from "./types";
import { promoTitle } from "./promoRowDto";
import { DonePairSnapshotSchema, isPairMemberSnapshot, toDonePairDTO, type DonePairDTO } from "./pairSnapshot";

export type { DonePairDTO } from "./pairSnapshot";

/**
 * quick-260929-igk: the frozen "mark done" snapshot. Pure module (no src/db
 * imports). A snapshot is built ONLY on the server from a fresh recompute of
 * the member's own row (never from client numbers) and is the sole source the
 * Done tab renders from -- live odds are never consulted for a done promo.
 * Versioned + zod-validated on read so a future shape change cannot crash
 * the Done tab (T-igk-05).
 */

const SnapshotRowSchema = z.object({
  rowKey: z.string(),
  promoId: z.number(),
  promoType: z.enum(PROMO_TYPES),
  promoTypeLabel: z.enum(["Boost", "Bonus bet"]),
  sportLabel: z.string(),
  commenceTime: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  marketBadge: z.string(),
  scopeLabel: z.string(),
  candidatesEvaluated: z.number(),
  autoMatched: z.boolean(),
  finePrintNote: z.string().nullable(),
  claimHint: z.string().nullable(),
  tieRisk: z.boolean(),
  sameBook: z.boolean(),
  promo: z.object({
    bookKey: z.string(),
    bookName: z.string(),
    selectionLabel: z.string(),
    oddsAmerican: z.number(),
    oddsDerived: z.boolean(),
  }),
  hedge: z.object({
    bookKey: z.string(),
    bookName: z.string(),
    selectionLabel: z.string(),
    oddsAmerican: z.number(),
  }),
  promoStake: z.string(),
  hedgeStake: z.string(),
  totalStaked: z.string(),
  promoPayout: z.string(),
  hedgePayout: z.string(),
  netIfPromoWins: z.string(),
  netIfHedgeWins: z.string(),
  guaranteedProfit: z.string(),
  rateLabel: z.enum(["ROI", "Conversion"]),
  ratePct: z.string(),
  capNote: z.string().nullable(),
  attribution: z.string().nullable(),
  worstCase: z.boolean(),
  hasPromoBook: z.boolean(),
});

export type SnapshotRow = z.infer<typeof SnapshotRowSchema>;

/** Compile-time guard: the stored row shape must stay assignable to the live row DTO. */
export const _rowShapeGuard = (r: SnapshotRow): PromoRowDTO => r;

export const DonePromoSnapshotSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["hedge", "no_hedge"]),
  recordedAt: z.string(),
  precision: z.enum(["whole", "cents"]),
  oddsFetchedAt: z.object({ moneyline: z.string().nullable(), spreadsTotals: z.string().nullable() }),
  promo: z.object({
    id: z.number(),
    bookKey: z.string(),
    bookName: z.string(),
    promoType: z.enum(PROMO_TYPES),
    promoTypeLabel: z.enum(["Boost", "Bonus bet"]),
    title: z.string(),
    scopeLabel: z.string(),
    boostPercent: z.string().nullable(),
    boostedOddsAmerican: z.number().nullable(),
    baseOddsAmerican: z.number().nullable(),
    bonusAmount: z.string().nullable(),
    maxStake: z.string().nullable(),
    winningsCap: z.object({ kind: z.string(), amount: z.string() }).nullable(),
    minOddsAmerican: z.number().nullable(),
  }),
  row: SnapshotRowSchema.nullable(),
  note: z.string().nullable(),
});

export type DonePromoSnapshot = z.infer<typeof DonePromoSnapshotSchema>;

/** The promo's own terms at mark-done time (title is the display title, e.g. "10% profit boost"). */
export interface DonePromoTerms {
  id: number;
  bookKey: string;
  promoType: PromoType;
  title: string;
  boostPercent: string | null;
  boostedOddsAmerican: number | null;
  baseOddsAmerican: number | null;
  bonusAmount: string | null;
  maxStake: string | null;
  winningsCap: { kind: string; amount: string } | null;
  minOddsAmerican: number | null;
}

export type DoneSnapshotInput =
  | { kind: "hedge"; terms: DonePromoTerms; row: PromoRowDTO }
  | { kind: "no_hedge"; terms: DonePromoTerms; row: UnprofitablePromoRowDTO };

export function buildDoneSnapshot(
  input: DoneSnapshotInput,
  ctx: {
    now: Date;
    precision: "whole" | "cents";
    oddsFetchedAt: { moneyline: Date | null; spreadsTotals: Date | null };
  },
): { snapshot: DonePromoSnapshot; profitExtracted: string } {
  const { terms } = input;
  const common = {
    version: 1 as const,
    recordedAt: ctx.now.toISOString(),
    precision: ctx.precision,
    oddsFetchedAt: {
      moneyline: ctx.oddsFetchedAt.moneyline ? ctx.oddsFetchedAt.moneyline.toISOString() : null,
      spreadsTotals: ctx.oddsFetchedAt.spreadsTotals ? ctx.oddsFetchedAt.spreadsTotals.toISOString() : null,
    },
  };
  const promoTerms = {
    id: terms.id,
    bookKey: terms.bookKey,
    promoType: terms.promoType,
    boostPercent: terms.boostPercent,
    boostedOddsAmerican: terms.boostedOddsAmerican,
    baseOddsAmerican: terms.baseOddsAmerican,
    bonusAmount: terms.bonusAmount,
    maxStake: terms.maxStake,
    winningsCap: terms.winningsCap ? { kind: terms.winningsCap.kind, amount: terms.winningsCap.amount } : null,
    minOddsAmerican: terms.minOddsAmerican,
  };

  if (input.kind === "hedge") {
    const { row } = input;
    const stored: SnapshotRow = { ...row };
    return {
      snapshot: {
        ...common,
        kind: "hedge",
        promo: {
          ...promoTerms,
          bookName: row.promo.bookName,
          promoTypeLabel: row.promoTypeLabel,
          title: terms.title,
          scopeLabel: row.scopeLabel,
        },
        row: stored,
        note: null,
      },
      profitExtracted: new Decimal(row.guaranteedProfit).toFixed(2),
    };
  }

  const { row } = input;
  return {
    snapshot: {
      ...common,
      kind: "no_hedge",
      promo: {
        ...promoTerms,
        bookName: row.bookName,
        promoTypeLabel: row.promoTypeLabel,
        title: row.title,
        scopeLabel: row.scopeLabel,
      },
      row: null,
      note: row.note,
    },
    profitExtracted: "0.00",
  };
}

/** One Done-tab row, built only from the saved snapshot (never live odds). */
export interface DonePromoDTO {
  rowKey: string;
  promoId: number;
  /** ISO timestamp of when the member marked it done. */
  completedAt: string;
  kind: "hedge" | "no_hedge" | "legacy" | "pair";
  bookName: string;
  promoTypeLabel: "Boost" | "Bonus bet";
  title: string;
  scopeLabel: string | null;
  profitExtracted: string;
  row: SnapshotRow | null;
  note: string | null;
  recordedPrecision: "whole" | "cents" | null;
  /** Set only for kind "pair" (both legs, stakes and the paired profit). */
  pair: DonePairDTO | null;
}

export interface DoneCompletionInput {
  promoId: number;
  completedAt: Date;
  snapshot: unknown;
  profitExtracted: string;
  promoBookKey: string;
  promoType: string;
  promoParsed: unknown;
  /** Promo term columns, used only to title legacy rows when parsed has no string title. */
  promoBoostPercent?: string | null;
  promoBoostedOddsAmerican?: number | null;
  promoBonusAmount?: string | null;
}

function legacyTitle(c: DoneCompletionInput): string {
  const parsed = c.promoParsed;
  if (parsed && typeof parsed === "object" && "title" in parsed) {
    const title = (parsed as { title: unknown }).title;
    if (typeof title === "string" && title.trim() !== "") return title;
  }
  if (
    c.promoBoostPercent !== undefined ||
    c.promoBonusAmount !== undefined ||
    c.promoBoostedOddsAmerican !== undefined
  ) {
    return promoTitle({
      promoType: c.promoType === "profit_boost" ? "profit_boost" : "bonus_bet",
      boostPercent: c.promoBoostPercent ?? null,
      boostedOddsAmerican: c.promoBoostedOddsAmerican ?? null,
      bonusAmount: c.promoBonusAmount ?? null,
    });
  }
  return `Promo #${c.promoId}`;
}

export function toDonePromoDTO(c: DoneCompletionInput, bookNames: ReadonlyMap<string, string>): DonePromoDTO {
  const base = { rowKey: `done-${c.promoId}`, promoId: c.promoId, completedAt: c.completedAt.toISOString() };
  const legacy = (note: string, profitExtracted: string): DonePromoDTO => ({
    ...base,
    kind: "legacy",
    bookName: bookNames.get(c.promoBookKey) ?? c.promoBookKey,
    promoTypeLabel: c.promoType === "profit_boost" ? "Boost" : "Bonus bet",
    title: legacyTitle(c),
    scopeLabel: null,
    profitExtracted,
    row: null,
    note,
    recordedPrecision: null,
    pair: null,
  });

  if (c.snapshot === null || c.snapshot === undefined) {
    return legacy("Marked done before profit tracking", "0.00");
  }

  const pairParsed = DonePairSnapshotSchema.safeParse(c.snapshot);
  if (pairParsed.success) {
    const pair = toDonePairDTO(pairParsed.data);
    return {
      ...base,
      kind: "pair",
      bookName: `${pair.legA.bookName} + ${pair.legB.bookName}`,
      promoTypeLabel: pair.legA.promoTypeLabel,
      title: pair.pairTypeLabel,
      scopeLabel: `${pair.awayTeam} @ ${pair.homeTeam}`,
      profitExtracted: c.profitExtracted,
      row: null,
      note: null,
      recordedPrecision: pairParsed.data.precision,
      pair,
    };
  }

  const parsed = DonePromoSnapshotSchema.safeParse(c.snapshot);
  if (!parsed.success) {
    return legacy("Saved details unavailable", c.profitExtracted);
  }

  const snap = parsed.data;
  return {
    ...base,
    kind: snap.kind,
    bookName: snap.promo.bookName,
    promoTypeLabel: snap.promo.promoTypeLabel,
    title: snap.promo.title,
    scopeLabel: snap.promo.scopeLabel,
    profitExtracted: c.profitExtracted,
    row: snap.row,
    note: snap.note,
    recordedPrecision: snap.precision,
    pair: null,
  };
}

/**
 * Done-tab rows: a marked pair is ONE entry (from its pair snapshot); the
 * partner's "pair_member" marker row is dropped so it never shows or counts.
 */
export function toDoneRows(completions: DoneCompletionInput[], bookNames: ReadonlyMap<string, string>): DonePromoDTO[] {
  return completions.filter((c) => !isPairMemberSnapshot(c.snapshot)).map((c) => toDonePromoDTO(c, bookNames));
}

/** Exact-cent sum (decimal.js, never float). */
export function sumProfitExtracted(rows: { profitExtracted: string }[]): string {
  return rows.reduce((sum, r) => sum.plus(r.profitExtracted), new Decimal(0)).toFixed(2);
}

/** Optimistic-concurrency check: did the row still show the same profit (to the cent)? null = greyed row. */
export function isSameDisplayedProfit(expected: string | null, current: string | null): boolean {
  if (expected === null || current === null) return expected === current;
  return new Decimal(expected).equals(new Decimal(current));
}
