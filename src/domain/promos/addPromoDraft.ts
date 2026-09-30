import {
  AddPromoInputSchema,
  MSG_EXPIRY_PASSED,
  MSG_PICK_BOOK,
  fieldErrorsFromIssues,
  type AddPromoInput,
  type AddedPromoField,
} from "./addedPromoInput";
import { EMPTY_SCOPE_DRAFT, scopeInputFromDraft, type ScopeDraft } from "./scopeDraft";
import { etDayBounds, etDayLabel } from "./etTime";

/**
 * Phase 5: the add-promo form's draft state and its mapping to the server
 * input (AddPromoInputSchema). Pure and client-safe: no src/db imports. The
 * client runs the same schema as the server so both show the same messages.
 */

export type AddPromoFieldErrors = Partial<Record<AddedPromoField, string[]>>;

export interface AddPromoDraft {
  bookKey: string | null;
  bonusAmount: string;
  expiresEtDate: string | null;
  expiresEtTime: string;
  scope: ScopeDraft;
  minOdds: string;
}

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
};

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
