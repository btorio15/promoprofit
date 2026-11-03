import { eq } from "drizzle-orm";
import { DEFAULT_LOW_PROFILE, type LowProfileSettings } from "@/domain/promos/lowProfile";
import { getDb } from "./client";
import { userLowProfileSettings } from "./schema";
import { isUndefinedTableErrorFor } from "./undefinedTable";

/**
 * Phase 9 (D-21): per-member Low-profile settings. The ONLY read and write
 * path for user_low_profile_settings. The scraper never imports it.
 */

const TABLE = "user_low_profile_settings";

/** True when err is the undefined-table error for user_low_profile_settings (migration 0018 not applied). */
export function isLowProfileTableMissing(err: unknown): boolean {
  return isUndefinedTableErrorFor(err, TABLE);
}

let warnedMissingTable = false;

/**
 * The member's settings, or DEFAULT_LOW_PROFILE when they have no row or the
 * table is missing. Any other error is rethrown.
 */
export async function getMemberLowProfile(userId: number): Promise<LowProfileSettings> {
  try {
    const rows = await getDb()
      .select({
        oddsCapEnabled: userLowProfileSettings.oddsCapEnabled,
        oddsCapAmerican: userLowProfileSettings.oddsCapAmerican,
        mainLinesOnly: userLowProfileSettings.mainLinesOnly,
        naturalStakes: userLowProfileSettings.naturalStakes,
      })
      .from(userLowProfileSettings)
      .where(eq(userLowProfileSettings.userId, userId));
    const row = rows[0];
    return row ? { ...row } : { ...DEFAULT_LOW_PROFILE };
  } catch (err) {
    if (isLowProfileTableMissing(err)) {
      if (!warnedMissingTable) {
        warnedMissingTable = true;
        console.warn(
          "getMemberLowProfile: user_low_profile_settings table not found (migration 0018 not applied yet); using defaults",
        );
      }
      return { ...DEFAULT_LOW_PROFILE };
    }
    throw err;
  }
}

export async function upsertMemberLowProfile(input: {
  userId: number;
  settings: LowProfileSettings;
  now: Date;
}): Promise<void> {
  const { settings } = input;
  await getDb()
    .insert(userLowProfileSettings)
    .values({
      userId: input.userId,
      oddsCapEnabled: settings.oddsCapEnabled,
      oddsCapAmerican: settings.oddsCapAmerican,
      mainLinesOnly: settings.mainLinesOnly,
      naturalStakes: settings.naturalStakes,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: userLowProfileSettings.userId,
      set: {
        oddsCapEnabled: settings.oddsCapEnabled,
        oddsCapAmerican: settings.oddsCapAmerican,
        mainLinesOnly: settings.mainLinesOnly,
        naturalStakes: settings.naturalStakes,
        updatedAt: input.now,
      },
    });
}
