import { z } from "zod";

/**
 * Phase 9 (D-21, D-22): a member's "Low-profile" settings. Pure module (no
 * src/db imports). Defaults apply when the member has no saved row.
 */

export type LowProfileSettings = {
  oddsCapEnabled: boolean;
  oddsCapAmerican: number;
  mainLinesOnly: boolean;
  naturalStakes: boolean;
};

export const DEFAULT_LOW_PROFILE: LowProfileSettings = {
  oddsCapEnabled: true,
  oddsCapAmerican: 300,
  mainLinesOnly: false,
  naturalStakes: false,
};

/** Qualifying odds longer than this earn a "long_odds" warning. */
export const LONG_ODDS_THRESHOLD_AMERICAN = 300;

export const LOW_PROFILE_WARNINGS = ["long_odds", "alternate_line", "exact_cent_stake"] as const;
export type LowProfileWarning = (typeof LOW_PROFILE_WARNINGS)[number];

const CAP_MESSAGE = "Enter odds of +100 or longer, like 300.";

/** Strict: no userId field (IDOR guard) -- the owner is always the session user. */
export const SetLowProfileInputSchema = z.strictObject({
  oddsCapEnabled: z.boolean(),
  oddsCapAmerican: z.number({ error: CAP_MESSAGE }).int(CAP_MESSAGE).min(100, CAP_MESSAGE).max(100000, CAP_MESSAGE),
  mainLinesOnly: z.boolean(),
  naturalStakes: z.boolean(),
});
export type SetLowProfileInput = z.infer<typeof SetLowProfileInputSchema>;

export function toRankLowProfile(s: LowProfileSettings): {
  maxQualifyingOddsAmerican: number | null;
  mainLinesOnly: boolean;
  naturalStakes: boolean;
} {
  return {
    maxQualifyingOddsAmerican: s.oddsCapEnabled ? s.oddsCapAmerican : null,
    mainLinesOnly: s.mainLinesOnly,
    naturalStakes: s.naturalStakes,
  };
}
