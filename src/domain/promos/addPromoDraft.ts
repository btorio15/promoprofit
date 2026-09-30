import Decimal from "decimal.js";
import {
  AddPromoInputSchema,
  MSG_BOOSTED_ODDS,
  MSG_BOOST_REQUIRED,
  MSG_EXPIRY_PASSED,
  MSG_GAME_INVALID,
  MSG_MAX_STAKE,
  MSG_PICK_BOOK,
  MSG_PICK_EXACT_BET,
  fieldErrorsFromIssues,
  type AddPromoInput,
  type AddedPromoEditValues,
  type AddedPromoField,
} from "./addedPromoInput";
import { EMPTY_SCOPE_DRAFT, scopeInputFromDraft, type ScopeDraft } from "./scopeDraft";
import { etDayBounds, etDayLabel } from "./etTime";
import { PROMO_MARKET_TYPES, PROMO_SIDES, type PromoMarketType, type PromoSide } from "./types";

/**
 * Phase 5: the add-promo form's draft state and its mapping to the server
 * input (AddPromoInputSchema). Pure and client-safe: no src/db imports. The
 * client runs the same schema as the server so both show the same messages.
 */

export type AddPromoFieldErrors = Partial<Record<AddedPromoField, string[]>>;

export type AddPromoType = "bonus_bet" | "profit_boost";
export type BoostMode = "percent" | "odds";
export type MaxWinningsKind = "total_payout" | "boost_extra";

export interface AddPromoDraft {
  promoType: AddPromoType;
  bookKey: string | null;
  bonusAmount: string;
  expiresEtDate: string | null;
  expiresEtTime: string;
  scope: ScopeDraft;
  minOdds: string;
  /** Profit-boost fields. */
  boostMode: BoostMode;
  boostPercent: string;
  boostedOdds: string;
  /** CorrectionMarketOption.value format, or null/"best" for no pin. */
  pinValue: string | null;
  maxStake: string;
  maxWinnings: string;
  maxWinningsKind: MaxWinningsKind;
  /** null = the default "When the last game starts". */
  boostExpiresEtDate: string | null;
  boostExpiresEtTime: string;
}

const BOOST_DEFAULTS = {
  promoType: "bonus_bet" as AddPromoType,
  boostMode: "percent" as BoostMode,
  boostPercent: "",
  boostedOdds: "",
  pinValue: null as string | null,
  maxStake: "",
  maxWinnings: "",
  maxWinningsKind: "total_payout" as MaxWinningsKind,
  boostExpiresEtDate: null as string | null,
  boostExpiresEtTime: "23:59",
};

export const DEFAULT_EXPIRY_TIME = "23:59";
export const DEFAULT_EXPIRY_DAYS_AHEAD = 7;
export const EXPIRY_DAY_COUNT = 30;

const MSG_BONUS_REQUIRED = "Enter the bonus amount.";
const MSG_ODDS = "Enter odds like +250 or -110.";

const ET_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's calendar date in ET. */
function etToday(now: Date): { y: number; m: number; d: number } {
  const parts = ET_DATE_PARTS.formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** The ET calendar day `offset` days after today, as YYYY-MM-DD (calendar arithmetic, DST-safe). */
function etDatePlus(now: Date, offset: number): string {
  const { y, m, d } = etToday(now);
  const shifted = new Date(Date.UTC(y, m - 1, d + offset));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export interface ExpiryDayOption {
  etDate: string;
  label: string;
}

/** The next 30 ET days starting today, labelled like "Sat, Oct 4". */
export function expiryDayOptions(now: Date): ExpiryDayOption[] {
  const out: ExpiryDayOption[] = [];
  for (let i = 0; i < EXPIRY_DAY_COUNT; i++) {
    const etDate = etDatePlus(now, i);
    const bounds = etDayBounds(etDate);
    out.push({ etDate, label: bounds ? etDayLabel(bounds.start) : etDate });
  }
  return out;
}

export interface ExpiryTimeOption {
  value: string;
  label: string;
}

function timeLabel(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${suffix}`;
}

/** Every 30 minutes 12:00 AM..11:30 PM, plus 11:59 PM (end of day). */
export function expiryTimeOptions(): ExpiryTimeOption[] {
  const out: ExpiryTimeOption[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      out.push({ value: `${pad(hour)}:${pad(minute)}`, label: timeLabel(hour, minute) });
    }
  }
  out.push({ value: DEFAULT_EXPIRY_TIME, label: timeLabel(23, 59) });
  return out;
}

/** A fresh bonus-bet draft: expires in 7 days at end of day ET. */
export function emptyBonusDraft(now: Date): AddPromoDraft {
  return {
    bookKey: null,
    bonusAmount: "",
    expiresEtDate: etDatePlus(now, DEFAULT_EXPIRY_DAYS_AHEAD),
    expiresEtTime: DEFAULT_EXPIRY_TIME,
    scope: EMPTY_SCOPE_DRAFT,
    minOdds: "",
    ...BOOST_DEFAULTS,
  };
}

/** Static draft (no expiry day until a clock is available). */
export const EMPTY_BONUS_DRAFT: AddPromoDraft = {
  bookKey: null,
  bonusAmount: "",
  expiresEtDate: null,
  expiresEtTime: DEFAULT_EXPIRY_TIME,
  scope: EMPTY_SCOPE_DRAFT,
  minOdds: "",
  ...BOOST_DEFAULTS,
};

const ET_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A stored UTC instant -> its ET calendar day (YYYY-MM-DD) and 24h wall time (HH:MM). */
function etDateAndTime(iso: string): { date: string; time: string } {
  const parts = ET_PARTS_FORMATTER.formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

function signedOdds(value: number | null): string {
  if (value === null) return "";
  return value > 0 ? `+${value}` : String(value);
}

/** Draft prefilled from a member's own stored promo (edit mode). Money stays the stored 2-dp strings. */
export function draftFromEditValues(values: AddedPromoEditValues): AddPromoDraft {
  const expires = values.expiresAt ? etDateAndTime(values.expiresAt) : null;
  const isBoost = values.promoType === "profit_boost";

  let scope: ScopeDraft = EMPTY_SCOPE_DRAFT;
  if (values.scopeKind === "event" && values.eventId) {
    scope = { ...EMPTY_SCOPE_DRAFT, mode: "game", eventId: values.eventId };
  } else if (values.scopeKind === "sport_window" && values.sportKey && values.windowStart && values.windowEnd) {
    scope = {
      ...EMPTY_SCOPE_DRAFT,
      mode: "league",
      sportKey: values.sportKey,
      fromEtDate: etDateAndTime(values.windowStart).date,
      throughEtDate: etDateAndTime(values.windowEnd).date,
    };
  }

  const pinValue =
    isBoost && values.marketType && values.side
      ? `${values.marketType}|${values.marketType === "moneyline" || values.line === null ? "ml" : String(values.line)}|${values.side}`
      : null;

  return {
    ...BOOST_DEFAULTS,
    promoType: isBoost ? "profit_boost" : "bonus_bet",
    bookKey: values.bookKey,
    bonusAmount: values.bonusAmount ?? "",
    // Bonus bets always carry an expiry; a boost's expiry is optional (null = default).
    expiresEtDate: isBoost ? null : (expires?.date ?? null),
    expiresEtTime: !isBoost && expires ? expires.time : DEFAULT_EXPIRY_TIME,
    scope,
    minOdds: signedOdds(values.minOddsAmerican),
    boostMode: values.boostedOddsAmerican !== null ? "odds" : "percent",
    boostPercent: values.boostPercent ?? "",
    boostedOdds: signedOdds(values.boostedOddsAmerican),
    pinValue,
    maxStake: values.maxStake ?? "",
    maxWinnings: values.maxWinnings ?? "",
    maxWinningsKind: values.maxWinningsKind === "boost_extra" ? "boost_extra" : "total_payout",
    boostExpiresEtDate: isBoost && expires ? expires.date : null,
    boostExpiresEtTime: isBoost && expires ? expires.time : BOOST_DEFAULTS.boostExpiresEtTime,
  };
}

/** "+250" / "-110" / "250" -> integer; anything else -> null. Regex + parseInt only. */
export function parseOddsText(text: string): number | null {
  const trimmed = text.trim();
  if (!/^[+-]?\d{1,6}$/.test(trimmed)) return null;
  return parseInt(trimmed, 10);
}

export type BonusPayloadResult = { payload: AddPromoInput } | { fieldErrors: AddPromoFieldErrors };

/** Draft -> server input, or the field errors to show (same messages as the server). */
export function bonusPayloadFromDraft(draft: AddPromoDraft): BonusPayloadResult {
  const errors: AddPromoFieldErrors = {};

  if (!draft.bookKey) errors.bookKey = [MSG_PICK_BOOK];
  const amount = draft.bonusAmount.trim();
  if (amount === "") errors.bonusAmount = [MSG_BONUS_REQUIRED];
  if (!draft.expiresEtDate) errors.expires = [MSG_EXPIRY_PASSED];

  const oddsText = draft.minOdds.trim();
  let minOdds: number | undefined;
  if (oddsText !== "") {
    const parsedOdds = parseOddsText(oddsText);
    if (parsedOdds === null) errors.minOddsAmerican = [MSG_ODDS];
    else minOdds = parsedOdds;
  }

  if (Object.keys(errors).length > 0) return { fieldErrors: errors };

  const candidate = {
    promoType: "bonus_bet",
    bookKey: draft.bookKey,
    bonusAmount: amount,
    expires: { etDate: draft.expiresEtDate, etTime: draft.expiresEtTime },
    scope: scopeInputFromDraft(draft.scope),
    ...(minOdds !== undefined ? { minOddsAmerican: minOdds } : {}),
  };

  const parsed = AddPromoInputSchema.safeParse(candidate);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  return { payload: parsed.data };
}

/** D-03: switching Type keeps Book, scope and min odds; the other type's own values are dropped. */
export function switchPromoType(draft: AddPromoDraft, next: AddPromoType): AddPromoDraft {
  if (draft.promoType === next) return draft;
  if (next === "profit_boost") {
    return { ...draft, promoType: next, bonusAmount: "" };
  }
  return {
    ...draft,
    promoType: next,
    boostMode: BOOST_DEFAULTS.boostMode,
    boostPercent: "",
    boostedOdds: "",
    pinValue: null,
    maxStake: "",
    maxWinnings: "",
    maxWinningsKind: BOOST_DEFAULTS.maxWinningsKind,
    boostExpiresEtDate: null,
    boostExpiresEtTime: BOOST_DEFAULTS.boostExpiresEtTime,
  };
}

export interface ParsedPin {
  marketType: PromoMarketType;
  line: number | null;
  side: PromoSide;
}

/**
 * "spread|-3.5|home" -> {spread, -3.5, home}; "moneyline|ml|away" -> line null.
 * The line is a half-point market descriptor, not money: a strict text check
 * then Decimal -> number.
 */
export function parsePinValue(value: string | null): ParsedPin | null {
  if (!value || value === "best") return null;
  const parts = value.split("|");
  if (parts.length !== 3) return null;
  const [marketType, lineText, side] = parts;
  if (!(PROMO_MARKET_TYPES as readonly string[]).includes(marketType)) return null;
  if (!(PROMO_SIDES as readonly string[]).includes(side)) return null;
  if (marketType === "moneyline") {
    if (lineText !== "ml") return null;
    return { marketType: "moneyline", line: null, side: side as PromoSide };
  }
  if (!/^-?\d+\.5$/.test(lineText)) return null;
  return {
    marketType: marketType as PromoMarketType,
    line: new Decimal(lineText).toNumber(),
    side: side as PromoSide,
  };
}

/** Draft -> server input for a profit boost, or the field errors to show. */
export function boostPayloadFromDraft(draft: AddPromoDraft): BonusPayloadResult {
  const errors: AddPromoFieldErrors = {};

  if (!draft.bookKey) errors.bookKey = [MSG_PICK_BOOK];

  let boost: { mode: "percent"; boostPercent: string } | { mode: "odds"; boostedOddsAmerican: number } | null = null;
  if (draft.boostMode === "percent") {
    const percent = draft.boostPercent.trim();
    if (percent === "") errors.boostPercent = [MSG_BOOST_REQUIRED];
    else boost = { mode: "percent", boostPercent: percent };
  } else {
    const parsedOdds = parseOddsText(draft.boostedOdds);
    if (parsedOdds === null) errors.boostedOddsAmerican = [MSG_BOOSTED_ODDS];
    else boost = { mode: "odds", boostedOddsAmerican: parsedOdds };
  }

  const maxStake = draft.maxStake.trim();
  if (maxStake === "") errors.maxStake = [MSG_MAX_STAKE];

  const scopeInput = scopeInputFromDraft(draft.scope);
  if (scopeInput === null) errors.scope = [MSG_GAME_INVALID];

  const pin = parsePinValue(draft.pinValue);
  if (scopeInput !== null && draft.boostMode === "odds" && !(scopeInput.kind === "event" && pin !== null)) {
    errors.pinned = [MSG_PICK_EXACT_BET];
  }

  const oddsText = draft.minOdds.trim();
  let minOdds: number | undefined;
  if (oddsText !== "") {
    const parsedMin = parseOddsText(oddsText);
    if (parsedMin === null) errors.minOddsAmerican = [MSG_ODDS];
    else minOdds = parsedMin;
  }

  if (Object.keys(errors).length > 0 || boost === null || scopeInput === null) return { fieldErrors: errors };

  const winningsText = draft.maxWinnings.trim();
  const candidate = {
    promoType: "profit_boost",
    bookKey: draft.bookKey,
    boost,
    scope: scopeInput.kind === "event" ? { ...scopeInput, pinned: pin } : scopeInput,
    maxStake,
    ...(winningsText !== "" ? { maxWinnings: { amount: winningsText, kind: draft.maxWinningsKind } } : {}),
    ...(minOdds !== undefined ? { minOddsAmerican: minOdds } : {}),
    ...(draft.boostExpiresEtDate
      ? { expires: { etDate: draft.boostExpiresEtDate, etTime: draft.boostExpiresEtTime } }
      : {}),
  };

  const parsed = AddPromoInputSchema.safeParse(candidate);
  if (!parsed.success) return { fieldErrors: fieldErrorsFromIssues(parsed.error.issues) };
  return { payload: parsed.data };
}

/** Dispatches on the draft's Type. */
export function payloadFromDraft(draft: AddPromoDraft): BonusPayloadResult {
  return draft.promoType === "profit_boost" ? boostPayloadFromDraft(draft) : bonusPayloadFromDraft(draft);
}
