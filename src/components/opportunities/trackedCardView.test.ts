import { describe, expect, it } from "vitest";
import {
  PUSH_COPY,
  WAITING_COPY,
  awaitingHeading,
  correctionPreview,
  outcomeChip,
  parseOddsInput,
  refundPreview,
  statusLine,
} from "./trackedCardView";
import { formatKickoff } from "@/lib/format";

const good = { qualifyingStake: "25.00", qualifyingOdds: "+150", hedgeStake: "20.00", hedgeOdds: "-160" };

describe("trackedCardView", () => {
  it("status line before kickoff", () => {
    const iso = "2026-11-08T18:00:00.000Z";
    expect(statusLine({ commenceTime: iso })).toBe(`Game starts ${formatKickoff(iso)}. Come back after it ends.`);
  });

  it("awaiting heading", () => {
    expect(awaitingHeading({ refundAmount: "25.00" })).toBe(
      "Your bet lost. Turn your $25.00 bonus bet into cash.",
    );
  });

  it.each([
    [good, "won", "Profit would be +$17.50"],
    [{ ...good, qualifyingStake: "" }, "won", null],
    [{ ...good, qualifyingStake: "abc" }, "won", null],
    [{ ...good, hedgeOdds: "50" }, "won", null],
    [good, "push", null],
  ] as const)("correctionPreview %#", (input, outcome, expected) => {
    expect(correctionPreview({}, input, outcome)).toBe(expected);
  });

  it.each([
    ["+150", 150],
    ["-160", -160],
    ["150", 150],
    ["50", null],
    ["abc", null],
    ["", null],
  ] as const)("parseOddsInput(%s)", (raw, expected) => {
    expect(parseOddsInput(raw)).toBe(expected);
  });

  it("refund preview", () => {
    expect(refundPreview("25.00", "30.00")).toBe("You'd get back $25.00.");
    expect(refundPreview("25.00", "10")).toBe("You'd get back $10.00.");
    expect(refundPreview("25.00", "x")).toBeNull();
  });

  it("static copy and chips", () => {
    expect(WAITING_COPY).toBe("Still waiting on this one. It counts as $0.00 until you tell us how it went.");
    expect(PUSH_COPY).toBe("No money changes hands, so this counts as $0.00.");
    expect(outcomeChip("won")).toBe("Won");
    expect(outcomeChip("lost")).toBe("Lost, refund converted");
    expect(outcomeChip("push")).toBe("Push");
    expect(outcomeChip("void")).toBe("Voided");
  });
});
