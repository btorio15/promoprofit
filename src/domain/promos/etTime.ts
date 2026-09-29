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

/** Extends an ET day window's end to expiresAt when expiresAt is later than
 * the window end by at most 12h (a "9/26 college football" slate includes
 * late West-coast kickoffs after midnight ET, and the book's token stays
 * valid until expiresAt). Otherwise returns the window unchanged. */
export function extendToExpiry(
  window: { start: string; end: string },
  expiresAt: string | null,
): { start: string; end: string } {
  if (expiresAt === null) return window;

  const dayEndMs = new Date(window.end).getTime();
  const expiresMs = new Date(expiresAt).getTime();
  const diffMs = expiresMs - dayEndMs;

  if (diffMs > 0 && diffMs <= TWELVE_HOURS_MS) {
    return { start: window.start, end: expiresAt };
  }

  return window;
}

/** ET day window, but the end extends to expiresAt when expiresAt is later
 * than the ET-day end by at most 12h (see extendToExpiry). */
export function slateWindow(
  dateText: string,
  expiresAt: string | null,
): { start: string; end: string } | null {
  const dayWindow = etDayWindow(dateText);
  if (!dayWindow) return null;
  return extendToExpiry(dayWindow, expiresAt);
}

// ---------------------------------------------------------------------------
// Multi-date phrases ("September 29th and September 30th, 2026")
// ---------------------------------------------------------------------------

/** Longest span a promo phrase may cover: 7 calendar days (last - first = 6).
 * Mirrors correctionOptions' DEFAULT_WINDOW_DAYS (7) locally -- importing it
 * would create an import cycle (correctionOptions imports this module). */
const MAX_SPAN_DAYS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

const SPAN_DATE_RE = /([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/y;
const SPAN_CONNECTOR_RE =
  /\s*(,\s*and\b|,|&|\band\b|-|–|—|\bthrough\b|\bthru\b|\bto\b|\buntil\b)\s*/y;
const TRAILING_JUNK_RE = /(?:[\s,.;:!?&\-–—]+|\s+(?:and|to|until|through|thru))$/i;

const ET_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
});

interface SpanDate {
  month: number;
  day: number;
  year: number | null;
  /** Connector that joined this date to the previous one. */
  connector: "list" | "range" | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function etDateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad2(month)}-${pad2(day)}`;
}

/**
 * "September 29th and September 30th, 2026" -> first/last ET calendar day.
 * Accepts date lists ("," / "and" / "&") of CONSECUTIVE days and ranges
 * ("-", en/em dash, through, thru, to, until) with end > start. Fails closed
 * (null) on anything else: other words, gaps in a list, descending dates,
 * impossible dates (WR-12), a yearless date with no year source, or a span
 * longer than 7 days -- a wrong window would over-reach onto unnamed days.
 * A yearless date takes the year of the next explicit-year date in the phrase
 * (minus 1 if its month is later), else the ET year of expiresAt.
 */
export function parseEtDateSpan(
  spanText: string,
  expiresAt: string | null,
): { startEtDate: string; endEtDate: string; dayCount: number } | null {
  let text = spanText.trim();
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(TRAILING_JUNK_RE, "");
  }
  if (text.length === 0) return null;

  const dates: SpanDate[] = [];
  let pos = 0;
  let connector: SpanDate["connector"] = null;
  while (pos < text.length) {
    SPAN_DATE_RE.lastIndex = pos;
    const m = SPAN_DATE_RE.exec(text);
    if (!m) return null;
    const month = MONTH_NAMES[m[1].toLowerCase()];
    if (month === undefined) return null;
    dates.push({
      month,
      day: parseInt(m[2], 10),
      year: m[3] !== undefined ? parseInt(m[3], 10) : null,
      connector,
    });
    pos = SPAN_DATE_RE.lastIndex;
    if (pos >= text.length) break;

    SPAN_CONNECTOR_RE.lastIndex = pos;
    const c = SPAN_CONNECTOR_RE.exec(text);
    if (!c) return null;
    const word = c[1].toLowerCase();
    connector = /^(?:-|–|—|through|thru|to|until)$/.test(word) ? "range" : "list";
    pos = SPAN_CONNECTOR_RE.lastIndex;
    if (pos >= text.length) return null;
  }
  if (dates.length === 0) return null;

  // Resolve years right to left so a yearless date can borrow from the next
  // explicit-year date in the phrase.
  let expiresYear: number | null = null;
  let expiresMs: number | null = null;
  if (expiresAt !== null) {
    const t = new Date(expiresAt);
    if (!Number.isNaN(t.getTime())) {
      expiresYear = parseInt(ET_YEAR_FORMATTER.format(t), 10);
      expiresMs = t.getTime();
    }
  }
  const years: number[] = new Array<number>(dates.length).fill(0);
  let nextExplicit: { year: number; month: number } | null = null;
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = dates[i];
    if (d.year !== null) {
      years[i] = d.year;
      nextExplicit = { year: d.year, month: d.month };
    } else if (nextExplicit !== null) {
      years[i] = d.month > nextExplicit.month ? nextExplicit.year - 1 : nextExplicit.year;
    } else {
      if (expiresYear === null || expiresMs === null) return null;
      let year = expiresYear;
      if (isRealCalendarDate(year, d.month, d.day)) {
        const bounds = computeEtDayBounds(year, d.month, d.day);
        if (new Date(bounds.start).getTime() > expiresMs) year -= 1;
      }
      years[i] = year;
    }
  }

  const dayNumbers: number[] = [];
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    if (!isRealCalendarDate(years[i], d.month, d.day)) return null;
    dayNumbers.push(Date.UTC(years[i], d.month - 1, d.day) / DAY_MS);
  }
  for (let i = 1; i < dates.length; i++) {
    const gap = dayNumbers[i] - dayNumbers[i - 1];
    if (gap <= 0) return null;
    if (dates[i].connector === "list" && gap !== 1) return null;
  }
  const spanDays = dayNumbers[dayNumbers.length - 1] - dayNumbers[0];
  if (spanDays > MAX_SPAN_DAYS) return null;

  const first = dates[0];
  const last = dates[dates.length - 1];
  return {
    startEtDate: etDateString(years[0], first.month, first.day),
    endEtDate: etDateString(years[dates.length - 1], last.month, last.day),
    dayCount: spanDays + 1,
  };
}
