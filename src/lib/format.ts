/**
 * Display formatters for the finder UI. Money is always a fixed 2-dp
 * decimal string on the way in (never a JS number/float) — these
 * formatters work on the string representation directly.
 */

const KICKOFF_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * "220.00" -> "$220.00"; "1234.5" -> "$1,234.50"; "0.00" -> "$0.00".
 * Splits the integer part and inserts thousands commas manually so the
 * value never passes through a native float conversion.
 */
export function formatUsd(value: string): string {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, decimalPartRaw = ""] = unsigned.split(".");
  const decimalPart = `${decimalPartRaw}00`.slice(0, 2);
  const withCommas = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${withCommas}.${decimalPart}`;
}

/** 300 -> "+300"; -275 -> "−275" (U+2212 minus, not a hyphen). */
export function formatAmerican(odds: number): string {
  if (odds >= 0) return `+${odds}`;
  return `−${Math.abs(odds)}`;
}

/** "80.00" -> "80.00%". Appends only — value is already a 2-dp string. */
export function formatPct(value: string): string {
  return `${value}%`;
}

/** ISO timestamp -> "Sun 11:00 AM" in America/Denver time. */
export function formatKickoff(isoString: string): string {
  return KICKOFF_FORMATTER.format(new Date(isoString));
}
