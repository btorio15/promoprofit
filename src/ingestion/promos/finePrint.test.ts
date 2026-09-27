import { describe, expect, it } from "vitest";
import {
  extractFinePrintNote,
  htmlToText,
  parseMaxStake,
  parseMaxWinnings,
  parseMinOdds,
} from "./finePrint";

describe("parseMaxStake", () => {
  it("parses a dollar amount near max/wager/bet wording", () => {
    expect(parseMaxStake("Maximum Bet: $20")).toEqual({ status: "parsed", value: "20.00" });
    expect(parseMaxStake("Maximum Bet: $10")).toEqual({ status: "parsed", value: "10.00" });
    expect(parseMaxStake("BOOSTED UP TO MAX $25 WAGER")).toEqual({
      status: "parsed",
      value: "25.00",
    });
    expect(parseMaxStake("Max wager $50.")).toEqual({ status: "parsed", value: "50.00" });
  });

  it("is unparsed when a max wager is mentioned with no dollar amount (D-18, FanDuel)", () => {
    expect(
      parseMaxStake(
        "valid for use on ANY wager, -200 or Longer, for any College Football Games on September 26th, 2026, up to a maximum wager. Log in for more details.",
      ),
    ).toEqual({ status: "unparsed" });
    expect(parseMaxStake("Max. Betting limits apply")).toEqual({ status: "unparsed" });
  });

  it("is absent when there is no max-stake mention at all", () => {
    expect(parseMaxStake("Opt-in required.")).toEqual({ status: "absent" });
  });

  it("prefers a numeric max-stake line over a number-less mention elsewhere (DraftKings shape)", () => {
    expect(parseMaxStake("BOOSTED UP TO MAX $25 WAGER\nMax betting limits apply.")).toEqual({
      status: "parsed",
      value: "25.00",
    });
  });

  it("truncates input longer than 4000 chars before regex matching", () => {
    const padding = "x".repeat(4100);
    const result = parseMaxStake(`${padding}\nMaximum Bet: $20`);
    expect(result).toEqual({ status: "absent" });
  });
});

describe("parseMinOdds", () => {
  it("normalizes Bally's '-+100' typo to +100", () => {
    expect(parseMinOdds("Minimum Odds: -+100")).toEqual({ status: "parsed", value: 100 });
  });

  it("parses a plain negative minimum odds value", () => {
    expect(parseMinOdds("Minimum Odds: -150")).toEqual({ status: "parsed", value: -150 });
  });

  it("parses 'X or longer' wording", () => {
    expect(parseMinOdds("Total bet odds must be -200 or longer.")).toEqual({
      status: "parsed",
      value: -200,
    });
    expect(parseMinOdds("-200 or Longer")).toEqual({ status: "parsed", value: -200 });
  });

  it("is unparsed when min odds is mentioned with no number", () => {
    expect(parseMinOdds("min odds apply")).toEqual({ status: "unparsed" });
  });

  it("is absent when there is no min-odds mention", () => {
    expect(parseMinOdds("Any Wager")).toEqual({ status: "absent" });
  });
});

describe("parseMaxWinnings", () => {
  it("parses a dollar amount near max winnings wording", () => {
    expect(parseMaxWinnings("Max winnings $500", "net_winnings")).toEqual({
      status: "parsed",
      value: { amount: "500.00", kind: "net_winnings" },
    });
  });

  it("is unparsed when max winnings is mentioned with no dollar amount", () => {
    expect(parseMaxWinnings("Maximum boosted winnings limited", "boost_extra")).toEqual({
      status: "unparsed",
    });
  });

  it("is absent when there is no max-winnings mention (none of the recon strings have one)", () => {
    expect(parseMaxWinnings("Maximum Bet: $20", "boost_extra")).toEqual({ status: "absent" });
    expect(parseMaxWinnings("BOOSTED UP TO MAX $25 WAGER", "boost_extra")).toEqual({
      status: "absent",
    });
    expect(
      parseMaxWinnings(
        "valid for use on ANY wager, -200 or Longer, for any College Football Games on September 26th, 2026, up to a maximum wager. Log in for more details.",
        "boost_extra",
      ),
    ).toEqual({ status: "absent" });
  });
});

describe("extractFinePrintNote", () => {
  it("strips cap/min-odds sentences and keeps the rest", () => {
    expect(extractFinePrintNote("Opt-in required. Max wager $50. Colorado only.")).toBe(
      "Opt-in required. Colorado only.",
    );
  });

  it("returns null when nothing remains after stripping", () => {
    expect(extractFinePrintNote("Maximum Bet: $20.")).toBeNull();
  });

  it("truncates to at most 160 chars", () => {
    const long = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const note = extractFinePrintNote(long);
    expect(note === null || note.length <= 160).toBe(true);
  });
});

describe("htmlToText", () => {
  it("strips tags, decodes entities, and turns p/li/br into newlines", () => {
    const html =
      "<p><b>Leap into the Endzone with a 10% Profit Boost! </b></p><p><b></b></p>" +
      "<p><b>Offer Details:</b></p><p>• 10% Profit Boost </p><p>• Maximum Bet: $20</p>" +
      "<p>• Minimum Odds: -+100</p><p>• Any Wager</p><p>• LA Rams vs. DEN Broncos</p>";
    const text = htmlToText(html);
    expect(text).toContain("10% Profit Boost");
    expect(text).toContain("Maximum Bet: $20");
    expect(text).toContain("Minimum Odds: -+100");
    expect(text).toContain("Any Wager");
    expect(text).toContain("LA Rams vs. DEN Broncos");
  });

  it("decodes &amp; to &", () => {
    expect(htmlToText("Profit Boost T&amp;Cs Apply")).toContain("T&Cs Apply");
  });

  it("converts <br> to a newline", () => {
    expect(htmlToText("Line one<br>Line two")).toBe("Line one\nLine two");
  });

  it("truncates input longer than 20000 chars before tag stripping", () => {
    const html = `<p>${"a".repeat(20050)}</p>`;
    const text = htmlToText(html);
    expect(text.length).toBeLessThanOrEqual(20000);
  });
});
