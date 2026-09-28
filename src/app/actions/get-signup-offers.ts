"use server";

import { requireUser } from "@/lib/session";
import { getUserBookKeys } from "@/db/queries";
import { getActiveSignupOffers } from "@/db/signupOffers";
import { groupSignupOffersForMember, type GetSignupOffersResponse } from "@/domain/promos/signupOffers";

/**
 * quick-260928-mgi (owner decision 3, T-mgi-01): takes NO arguments --
 * userId comes ONLY from requireUser()'s session, mirroring save-books.ts's
 * IDOR-closing discipline. Uses the raw saved keys (getUserBookKeys), not
 * getUsableUserBooks, because "books the member has" here is about accounts
 * they hold, not odds coverage -- a sign-up offer is worth showing/hiding
 * based on account ownership alone.
 */
export async function getSignupOffers(): Promise<GetSignupOffersResponse> {
  const user = await requireUser();
  const owned = new Set(await getUserBookKeys(user.userId));
  const rows = await getActiveSignupOffers(new Date());
  return groupSignupOffersForMember(rows, owned);
}
