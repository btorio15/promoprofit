import { redirect } from "next/navigation";
import { getOddsFreshness, getUsableUserBooks } from "@/db/queries";
import { getOddsStatus } from "@/ingestion/odds/status";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/session";

// Never prerendered at build time — this page always reads live cached
// odds, and `next build` must succeed without a DATABASE_URL.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();

  // A brand-new user has no saved books yet, and a user whose only books
  // later lost API coverage would otherwise see an empty dropdown with no
  // way out -- both send them to the one-time picker instead (D-08, D-13).
  // getUsableUserBooks is the SAME predicate /onboarding/books uses to
  // redirect back here, so the two pages can never disagree (CR-02).
  const bonusBooks = await getUsableUserBooks(user.userId);
  if (bonusBooks.length === 0) {
    redirect("/onboarding/books");
  }

  const [freshness, status] = await Promise.all([getOddsFreshness(), getOddsStatus()]);

  return (
    <AppShell
      status={status}
      bonusBooks={bonusBooks}
      hasCachedOdds={freshness !== null}
      displayName={user.displayName}
    />
  );
}
