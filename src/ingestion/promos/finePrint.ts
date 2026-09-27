import Decimal from "decimal.js";
import type { WinningsCapKind } from "@/domain/promos/types";

/**
 * Plain-text extraction of the fine-print cap/min-odds fields recon found
 * verbatim across all three books (03-RECON.md "Observed Promos"). No DOM
 * library is used: htmlToText is a small tag-stripper for short, trusted-
 * shape marketing JSON fields (Bally description/terms, FanDuel
 * description) whose output is only fed to the linear regexes below --
 * never rendered as HTML (T-03-05-02). Every regex here is simple and
 * linear with no nested quantifiers (ReDoS guard). Amounts normalize to
 * 2dp strings via decimal.js, never parseFloat (project-wide money-math
 * rule -- see CLAUDE.md "What NOT to Use").
 */

export type CapParse<T> = { status: "parsed"; value: T } | { status: "unparsed" } | { status: "absent" };

const MAX_INPUT_CHARS = 4000;
const MAX_HTML_CHARS = 20000;

/** A max/bet/wager/stake mention doesn't need to be adjacent -- DraftKings
 * puts the dollar figure between them ("MAX $25 WAGER") -- so presence of
 * both keywords ANYWHERE in the same line is enough to call it a genuine
 * cap statement, even before we know whether a number was present. */
const HAS_MAX_RE = /\bmax(?:imum)?\b/i;
const HAS_BET_WAGER_STAKE_RE = /\b(?:bet|wager|stake)/i; // no trailing \b: matches "Betting" too
const HAS_WINNINGS_PAYOUT_PROFIT_RE = /\b(?:winnings|payout|profit)/i;

function isMaxStakeMention(line: string): boolean {
  return HAS_MAX_RE.test(line) && HAS_BET_WAGER_STAKE_RE.test(line);
}

function isMaxWinningsMention(line: string): boolean {
  return HAS_MAX_RE.test(line) && HAS_WINNINGS_PAYOUT_PROFIT_RE.test(line);
}

const MAX_STAKE_AMOUNT_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)/;
const MAX_WINNINGS_AMOUNT_RE = /\$\s*([\d,]+(?:\.\d{1,2})?)/;

const MIN_ODDS_MENTION_RE = /\bmin(?:imum)?\.?\s*odds\b/i;
// Bally's own typo ("-+100") means +100 -- both sign characters win, meaning
// positive (see D-17/03-RECON.md Observed Promos row 1).
const MIN_ODDS_AFTER_LABEL_RE = /\bmin(?:imum)?\.?\s*odds\.?\s*:?\s*([+-]{1,2}\d+)/i;
const MIN_ODDS_OR_LONGER_RE = /([+-]{1,2}\d+)\s*or\s*longer/i;

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function normalizeMoney(rawDigits: string): string {
  return new Decimal(rawDigits.replace(/,/g, "")).toFixed(2);
}

function normalizeOddsSign(signChars: string, digits: string): number {
  const value = parseInt(digits, 10);
  const hasMinus = signChars.includes("-");
  const hasPlus = signChars.includes("+");
  if (hasMinus && hasPlus) return value; // sic typo ("-+100") -> positive
  if (hasMinus) return -value;
  return value;
}

export function parseMaxStake(text: string): CapParse<string> {
  const truncated = truncate(text, MAX_INPUT_CHARS);
  const lines = truncated.split("\n");

  for (const line of lines) {
    if (isMaxStakeMention(line)) {
      const amountMatch = MAX_STAKE_AMOUNT_RE.exec(line);
      if (amountMatch) {
        return { status: "parsed", value: normalizeMoney(amountMatch[1]) };
      }
    }
  }

  for (const line of lines) {
    if (isMaxStakeMention(line)) {
      return { status: "unparsed" };
    }
  }

  return { status: "absent" };
}

export function parseMaxWinnings(
  text: string,
  kind: WinningsCapKind,
): CapParse<{ amount: string; kind: WinningsCapKind }> {
  const truncated = truncate(text, MAX_INPUT_CHARS);
  const lines = truncated.split("\n");

  for (const line of lines) {
    if (isMaxWinningsMention(line)) {
      const amountMatch = MAX_WINNINGS_AMOUNT_RE.exec(line);
      if (amountMatch) {
        return { status: "parsed", value: { amount: normalizeMoney(amountMatch[1]), kind } };
      }
    }
  }

  for (const line of lines) {
    if (isMaxWinningsMention(line)) {
      return { status: "unparsed" };
    }
  }

  return { status: "absent" };
}

export function parseMinOdds(text: string): CapParse<number> {
  const truncated = truncate(text, MAX_INPUT_CHARS);

  const labelMatch = MIN_ODDS_AFTER_LABEL_RE.exec(truncated);
  if (labelMatch) {
    const digits = labelMatch[1].replace(/[+-]/g, "");
    return { status: "parsed", value: normalizeOddsSign(labelMatch[1], digits) };
  }

  const orLongerMatch = MIN_ODDS_OR_LONGER_RE.exec(truncated);
  if (orLongerMatch) {
    const digits = orLongerMatch[1].replace(/[+-]/g, "");
    return { status: "parsed", value: normalizeOddsSign(orLongerMatch[1], digits) };
  }

  if (MIN_ODDS_MENTION_RE.test(truncated)) {
    return { status: "unparsed" };
  }

  return { status: "absent" };
}

function isCapSentence(sentence: string): boolean {
  return (
    isMaxStakeMention(sentence) ||
    isMaxWinningsMention(sentence) ||
    MIN_ODDS_MENTION_RE.test(sentence) ||
    MIN_ODDS_OR_LONGER_RE.test(sentence)
  );
}

export function extractFinePrintNote(text: string): string | null {
  const truncated = truncate(text, MAX_INPUT_CHARS);
  const sentences = truncated.split(/(?<=[.!?])\s+/).map((s) => s.trim());

  const kept = sentences.filter((sentence) => sentence.length > 0 && !isCapSentence(sentence));

  if (kept.length === 0) return null;

  const note = kept.join(" ").trim();
  if (note.length === 0) return null;

  return note.length > 160 ? note.slice(0, 160) : note;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function htmlToText(html: string): string {
  const truncated = truncate(html, MAX_HTML_CHARS);

  let text = truncated
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/li>/gi, "")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(char);
  }

  return text.replace(/^\n+/, "").replace(/\n{2,}/g, "\n").trim();
}
