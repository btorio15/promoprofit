/**
 * Gambling tax settings, kept here rather than hardcoded in the tax math so
 * they can change if the law does. Values are the owner's reading of the
 * rules and have not been verified against the current statute. Confirm them
 * with a tax professional before relying on any tax figure.
 */
export const TAX_CONFIG = {
  /** Share of gambling losses deductible against winnings (the 2026 figure the owner cited). */
  lossDeductionPct: "0.90",
  /** Losses are deductible only when the taxpayer itemizes. */
  requiresItemizing: true,
} as const;
