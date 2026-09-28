import Decimal from "decimal.js";
import type { PromoReading } from "./promoReading";

/**
 * quick-260928-kc5 (T-kc5-01): pure verbatim-number guard. The model can
 * never put an invented, relabeled, or double-counted number into money
 * math -- every numeric field the reader returns is checked against the
 * entry's own source text before reconcile.ts ever sees it. A failure sets
 * the field to null and records it in droppedFields; nothing else about the
 * reading changes.
 */
export const READER_NUMERIC_FIELDS = ["boostPercent", "bonusAmount", "maxStake", "maxWinnings", "minOddsAmerican"] as const;
export type ReaderNumericField = (typeof READER_NUMERIC_FIELDS)[number];

/** An evidence string longer than this can't be trusted to point at one
 * number -- it could be a whole sentence with several numbers in it. */
export const EVIDENCE_MAX_CHARS = 80;

export type GuardedReading = Omit<PromoReading, "evidence"> & {
  droppedFields: ReaderNumericField[];
};

/** Numeric tokens: optional sign, digits with optional comma grouping,
 * optional decimal part. Commas are stripped before comparison. */
const NUMERIC_TOKEN_RE = /[+-]?\d[\d,]*(?:\.\d+)?/g;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function wellFormedMoneyValue(raw: string): string | null {
  let v = raw.trim();
  if (v.startsWith("$")) v = v.slice(1);
  if (v.endsWith("%")) v = v.slice(0, -1);
  v = v.replace(/,/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(v)) return null;
  try {
    return new Decimal(v).toFixed(2);
  } catch {
    return null;
  }
}

/** "$25" preceded, allowing one optional space between "$" and the token. */
function precededByDollar(text: string, tokenStart: number): boolean {
  return /\$\s?$/.test(text.slice(0, tokenStart));
}

/** "50%" followed, allowing one optional space between the token and "%". */
function followedByPercent(text: string, tokenEnd: number): boolean {
  return /^\s?%/.test(text.slice(tokenEnd));
}

interface FieldProof {
  normalizedValue: string | number;
  position: number;
}

function checkField(
  field: ReaderNumericField,
  rawValue: string | number,
  evidenceRaw: string | null,
  normalizedSource: string,
): FieldProof | null {
  // 1. well-formedness + normalization.
  let normalizedValue: string | number;
  let decimalValue: Decimal | null = null;
  if (field === "minOddsAmerican") {
    const v = rawValue as number;
    if (!Number.isInteger(v) || Math.abs(v) < 100) return null;
    normalizedValue = v;
  } else {
    const wellFormed = wellFormedMoneyValue(rawValue as string);
    if (wellFormed === null) return null;
    normalizedValue = wellFormed;
    decimalValue = new Decimal(wellFormed);
  }

  // 2. evidence present and a verbatim substring of the source.
  if (!evidenceRaw || evidenceRaw.trim().length === 0) return null;
  const normEvidence = normalizeWhitespace(evidenceRaw).toLowerCase();
  if (normEvidence.length === 0) return null;

  // 3. evidence length cap.
  if (normEvidence.length > EVIDENCE_MAX_CHARS) return null;

  const sourceIndex = normalizedSource.indexOf(normEvidence);
  if (sourceIndex === -1) return null;

  // 4. field-bound proof: scan evidence's numeric tokens for one that proves this field.
  const tokenRe = new RegExp(NUMERIC_TOKEN_RE.source, "g");
  let match: RegExpExecArray | null;
  let provingOffset: number | null = null;

  while ((match = tokenRe.exec(normEvidence)) !== null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;
    const isSigned = token.startsWith("+") || token.startsWith("-");
    const strippedToken = token.replace(/,/g, "");

    let tokenDecimal: Decimal | null = null;
    if (field !== "minOddsAmerican") {
      try {
        tokenDecimal = new Decimal(strippedToken);
      } catch {
        continue;
      }
    }

    if (field === "boostPercent") {
      if (isSigned) continue;
      if (!tokenDecimal!.equals(decimalValue!)) continue;
      if (!followedByPercent(normEvidence, end)) continue;
      if (!normEvidence.includes("boost")) continue;
      provingOffset = start;
      break;
    }

    if (field === "bonusAmount" || field === "maxStake" || field === "maxWinnings") {
      if (isSigned) continue;
      if (!tokenDecimal!.equals(decimalValue!)) continue;
      if (!precededByDollar(normEvidence, start)) continue;
      provingOffset = start;
      break;
    }

    // minOddsAmerican
    const numericToken = Number(strippedToken);
    if (Number.isNaN(numericToken) || numericToken !== normalizedValue) continue;
    if (followedByPercent(normEvidence, end)) continue;
    if (precededByDollar(normEvidence, start)) continue;
    provingOffset = start;
    break;
  }

  if (provingOffset === null) return null;

  return { normalizedValue, position: sourceIndex + provingOffset };
}

/**
 * Guards every numeric field of `reading` against `sourceText` (the same
 * readerText() the model was shown). Returns a copy of the reading with
 * `evidence` removed and `droppedFields` added; any field that fails any
 * check becomes null. One source occurrence can never back two fields --
 * when two fields resolve to the same absolute source position, both are
 * dropped.
 */
export function guardReading(reading: PromoReading, sourceText: string): GuardedReading {
  const normalizedSource = normalizeWhitespace(sourceText).toLowerCase();
  const droppedFields: ReaderNumericField[] = [];
  const proven = new Map<ReaderNumericField, FieldProof>();

  const result: Record<string, unknown> = { ...reading };
  delete result.evidence;

  for (const field of READER_NUMERIC_FIELDS) {
    const rawValue = reading[field];
    if (rawValue === null) {
      result[field] = null;
      continue;
    }

    const evidenceRaw = reading.evidence[field];
    const proof = checkField(field, rawValue, evidenceRaw, normalizedSource);
    if (proof === null) {
      result[field] = null;
      droppedFields.push(field);
    } else {
      result[field] = proof.normalizedValue;
      proven.set(field, proof);
    }
  }

  const fieldsAtPosition = new Map<number, ReaderNumericField[]>();
  for (const [field, proof] of proven) {
    const list = fieldsAtPosition.get(proof.position) ?? [];
    list.push(field);
    fieldsAtPosition.set(proof.position, list);
  }
  for (const fields of fieldsAtPosition.values()) {
    if (fields.length > 1) {
      for (const field of fields) {
        result[field] = null;
        if (!droppedFields.includes(field)) droppedFields.push(field);
      }
    }
  }

  result.droppedFields = droppedFields;
  return result as GuardedReading;
}
