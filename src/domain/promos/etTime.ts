/**
 * Eastern-time helpers shared by the parsers, describe.ts (Plan 07) and the
 * Correct action (Plan 09). Lives in src/domain/promos (not
 * src/ingestion/promos) so src/app never needs to import src/ingestion
 * (boundary test, Plan 06). Pure, no I/O. Books state promo times in ET
 * (03-RECON.md displayed_time_zone) -- these helpers convert America/
 * New_York wall time to UTC ISO without a new dependency: Intl.DateTimeFormat
 * (timeZone "America/New_York", timeZoneName "shortOffset") supplies the
 * real EDT/EST offset for a given calendar date, since the offset changes
 * with US daylight-saving transitions and cannot be hardcoded.
 */

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "shortOffset",
});

const ET_DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** America/New_York's UTC offset, in minutes, for the given ET calendar
 * date (negative = behind UTC, e.g. -240 for EDT, -300 for EST). Uses noon
 * UTC on that date as the probe instant -- comfortably inside the target
 * calendar day in either direction, so it never lands on the wrong side of
 * a DST transition for the date being asked about. */
function getEtOffsetMinutes(year: number, month: number, day: number): number {
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  const parts = OFFSET_FORMATTER.formatToParts(probe);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
  const match = /GMT([+-]\d{1,2})(?::?(\d{2}))?/.exec(offsetPart);
  if (!match) return -300; // fallback: EST

  const hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  return hours * 60 + (hours < 0 ? -minutes : minutes);
}

interface DateComponents {
  year: number;
  month: number;
  day: number;
}

const SLASH_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const MONTH_NAME_DATE_RE = /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/;

/**
 * WR-12: true only for a real calendar date. Date.UTC silently rolls
 * impossible dates over (Feb 31 -> Mar 3, month 13 -> next January), so
 * round-trip the components and reject any that changed.
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function validDate(components: DateComponents): DateComponents | null {
  return isRealCalendarDate(components.year, components.month, components.day) ? components : null;
}

function parseDateOnly(text: string): DateComponents | null {
  const trimmed = text.trim();

  const slashMatch = SLASH_DATE_RE.exec(trimmed);
  if (slashMatch) {
    return validDate({
      month: parseInt(slashMatch[1], 10),
      day: parseInt(slashMatch[2], 10),
      year: parseInt(slashMatch[3], 10),
    });
  }

  const monthMatch = MONTH_NAME_DATE_RE.exec(trimmed);
  if (monthMatch) {
    const monthNum = MONTH_NAMES[monthMatch[1].toLowerCase()];
    if (monthNum === undefined) return null;
    return validDate({
      month: monthNum,
      day: parseInt(monthMatch[2], 10),
      year: parseInt(monthMatch[3], 10),
    });
  }

  return null;
}

function computeEtDayBounds(year: number, month: number, day: number): { start: string; end: string } {
  const offsetMinutes = getEtOffsetMinutes(year, month, day);
  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMinutes * 60000;
  const endMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMinutes * 60000;
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

/** "2026-09-27" -> that ET calendar day as ISO. */
export function etDayBounds(etDate: string): { start: string; end: string } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(etDate.trim());
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  if (!isRealCalendarDate(year, month, day)) return null;
  return computeEtDayBounds(year, month, day);
}

/** "Sun, Sep 27" in America/New_York, from a UTC ISO instant. */
export function etDayLabel(iso: string): string {
  return ET_DAY_LABEL_FORMATTER.format(new Date(iso));
}

/** "September 27, 2026 at 12:00 AM ET" -> ISO (UTC). */
export function parseEtDateTime(text: string): string | null {
  const match = /^(.+?)\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s+ET$/i.exec(text.trim());
  if (!match) return null;

  const dateComponents = parseDateOnly(match[1]);
  if (!dateComponents) return null;

  let hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);
  const meridiem = match[4].toUpperCase();
  if (hour === 12) hour = 0;
  if (meridiem === "PM") hour += 12;

  const offsetMinutes = getEtOffsetMinutes(dateComponents.year, dateComponents.month, dateComponents.day);
  const utcMs =
    Date.UTC(dateComponents.year, dateComponents.month - 1, dateComponents.day, hour, minute, 0, 0) -
    offsetMinutes * 60000;
  return new Date(utcMs).toISOString();
}

/** "9/27/2026", "September 26th, 2026" -> ET calendar-day window as ISO. */
export function etDayWindow(dateText: string): { start: string; end: string } | null {
  const dateComponents = parseDateOnly(dateText);
  if (!dateComponents) return null;
  return computeEtDayBounds(dateComponents.year, dateComponents.month, dateComponents.day);
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/** ET day window, but the end extends to expiresAt when expiresAt is later
 * than the ET-day end by at most 12h (a "9/26 college football" slate
 * includes late West-coast kickoffs after midnight ET, and the book's
 * token stays valid until expiresAt). */
export function slateWindow(
  dateText: string,
  expiresAt: string | null,
): { start: string; end: string } | null {
  const dayWindow = etDayWindow(dateText);
  if (!dayWindow) return null;
  if (expiresAt === null) return dayWindow;

  const dayEndMs = new Date(dayWindow.end).getTime();
  const expiresMs = new Date(expiresAt).getTime();
  const diffMs = expiresMs - dayEndMs;

  if (diffMs > 0 && diffMs <= TWELVE_HOURS_MS) {
    return { start: dayWindow.start, end: expiresAt };
  }

  return dayWindow;
}
