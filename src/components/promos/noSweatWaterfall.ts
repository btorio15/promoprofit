import Decimal from "decimal.js";
import type { NoSweatRowDTO } from "@/domain/promos/noSweatRowDto";
import { signedUsd } from "./noSweatRowView";

export type WaterfallKind = "in" | "out" | "estimate";

export interface WaterfallStep {
  label: string;
  amount: string;
  kind: WaterfallKind;
  leftPct: number;
  widthPct: number;
  connectorPct: number;
}

export interface WaterfallNet {
  amount: string;
  label: string;
  estimate: boolean;
  leftPct: number;
  widthPct: number;
  connectorPct: number;
}

export interface Waterfall {
  title: string;
  steps: WaterfallStep[];
  net: WaterfallNet;
}

type Input = Pick<NoSweatRowDTO, "qualifying" | "hedge" | "refundValue" | "profitIfWin" | "profitIfLose">;

interface RawStep {
  label: string;
  amount: Decimal;
  kind: WaterfallKind;
}

/** "+$150.00" / "−$112.00" / "≈+$70.00". */
export function formatStepAmount(amount: string, kind: WaterfallKind): string {
  return netLabel(amount, kind === "estimate");
}

export function netLabel(amount: string, estimate: boolean): string {
  const negative = amount.startsWith("-");
  const body = negative ? signedUsd(amount) : `+${signedUsd(amount)}`;
  return estimate ? `≈${body}` : body;
}

export function estimateLegendLabel(ratePct: string): string {
  const n = Number(ratePct);
  const rate = Number.isInteger(n) ? n.toFixed(0) : ratePct;
  return `estimate (bonus bet at ${rate}%)`;
}

export function buildNoSweatWaterfalls(dto: Input): { zeroPct: number; win: Waterfall; lose: Waterfall } {
  const stake = new Decimal(dto.qualifying.stake);
  const hedgeStake = new Decimal(dto.hedge.stake);
  const winRaw: RawStep[] = [
    { label: "Your bet", amount: new Decimal(dto.qualifying.winnings), kind: "in" },
    { label: "Hedge", amount: hedgeStake.neg(), kind: "out" },
  ];
  const loseRaw: RawStep[] = [
    { label: "Hedge", amount: new Decimal(dto.hedge.payout).minus(hedgeStake), kind: "in" },
    { label: "Your bet", amount: stake.neg(), kind: "out" },
    { label: "Refund", amount: new Decimal(dto.refundValue), kind: "estimate" },
  ];
  const winNet = new Decimal(dto.profitIfWin);
  const loseNet = new Decimal(dto.profitIfLose);

  const totals = (raw: RawStep[]) => {
    let run = new Decimal(0);
    return raw.map((s) => {
      const start = run;
      run = run.plus(s.amount);
      return { start, end: run };
    });
  };
  const winT = totals(winRaw);
  const loseT = totals(loseRaw);

  const points = [
    new Decimal(0),
    winNet,
    loseNet,
    ...winT.flatMap((t) => [t.start, t.end]),
    ...loseT.flatMap((t) => [t.start, t.end]),
  ];
  const lo = Decimal.min(...points);
  const hi = Decimal.max(...points);
  const span = hi.equals(lo) ? new Decimal(1) : hi.minus(lo);
  const pct = (v: Decimal) => v.minus(lo).div(span).times(100).toNumber();
  const width = (a: Decimal, b: Decimal) => Decimal.max(a, b).minus(Decimal.min(a, b)).div(span).times(100).toNumber();
  const zeroPct = pct(new Decimal(0));

  const build = (
    title: string,
    raw: RawStep[],
    t: { start: Decimal; end: Decimal }[],
    net: Decimal,
    netAmount: string,
    estimate: boolean,
  ): Waterfall => {
    const steps = raw.map((s, i) => ({
      label: s.label,
      amount: s.amount.toFixed(2),
      kind: s.kind,
      leftPct: pct(Decimal.min(t[i].start, t[i].end)),
      widthPct: width(t[i].start, t[i].end),
      connectorPct: pct(t[i].start),
    }));
    const zero = new Decimal(0);
    return {
      title,
      steps,
      net: {
        amount: netAmount,
        label: netLabel(netAmount, estimate),
        estimate,
        leftPct: pct(Decimal.min(zero, net)),
        widthPct: width(zero, net),
        connectorPct: pct(t[t.length - 1].end),
      },
    };
  };

  const name = dto.qualifying.selectionLabel;
  return {
    zeroPct,
    win: build(`${name} win`, winRaw, winT, winNet, dto.profitIfWin, false),
    lose: build(`${name} lose`, loseRaw, loseT, loseNet, dto.profitIfLose, true),
  };
}
