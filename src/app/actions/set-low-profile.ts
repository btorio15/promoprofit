"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { SetLowProfileInputSchema } from "@/domain/promos/lowProfile";
import { isLowProfileTableMissing, upsertMemberLowProfile } from "@/db/lowProfile";

/**
 * Phase 9 (D-21, T-09-40, T-09-44): save the CURRENT member's Low-profile
 * settings. requireUser() is the first statement; the strict schema has no
 * userId field, so the row owner is only ever the session user.
 */
export type SetLowProfileResponse =
  | { status: "ok" }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; message: string };

export async function setLowProfileAction(input: unknown): Promise<SetLowProfileResponse> {
  const user = await requireUser();

  const parsed = SetLowProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "invalid", message: parsed.error.issues[0]?.message ?? "Enter odds of +100 or longer, like 300." };
  }

  try {
    await upsertMemberLowProfile({ userId: user.userId, settings: parsed.data, now: new Date() });
  } catch (err) {
    if (isLowProfileTableMissing(err)) {
      return { status: "unavailable", message: "Couldn't save your Low-profile settings. Try again." };
    }
    throw err;
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { status: "ok" };
}
