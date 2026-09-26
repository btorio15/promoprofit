import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { OnboardingBooksForm } from "@/components/settings/OnboardingBooksForm";
import { getBonusBooks, getUsableUserBooks } from "@/db/queries";
import { requireUser } from "@/lib/session";

// Unauthenticated visitors never reach this page (requireUser redirects to
// /login first) and its own book-selection check reads live DB state, so it
// must never be prerendered.
export const dynamic = "force-dynamic";

/**
 * "Pick your books" onboarding step (D-08). Reached right after invite
 * redemption (redeem-invite.ts redirects here) and any time a logged-in
 * user has zero usable saved books (src/app/page.tsx redirects here too,
 * covering a book losing API coverage after the fact). Bounces to / only
 * when the user already has at least one USABLE saved book -- the same
 * predicate as / (CR-02), so the two pages can never redirect to each
 * other in a loop.
 */
export default async function OnboardingBooksPage() {
  const user = await requireUser();

  const usableSaved = await getUsableUserBooks(user.userId);
  if (usableSaved.length > 0) {
    redirect("/");
  }

  const books = await getBonusBooks();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="mx-auto w-full max-w-[480px]">
        <Card className="p-6">
          <h1 className="text-xl font-semibold">Pick your books</h1>
          <p className="text-base">
            Select every Colorado sportsbook you have an account with. The finder and Arbitrage
            tab will only ever suggest bets at these books.
          </p>
          <OnboardingBooksForm books={books} />
        </Card>
      </div>
    </div>
  );
}
