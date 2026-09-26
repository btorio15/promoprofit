import { getBonusBooks, getOddsFreshness } from "@/db/queries";
import { getOddsStatus } from "@/ingestion/odds/status";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/session";

// Never prerendered at build time — this page always reads live cached
// odds, and `next build` must succeed without a DATABASE_URL.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireUser();

  const [bonusBooks, freshness, status] = await Promise.all([
    getBonusBooks(),
    getOddsFreshness(),
    getOddsStatus(),
  ]);

  return (
    <AppShell
      status={status}
      bonusBooks={bonusBooks}
      hasCachedOdds={freshness !== null}
      displayName={user.displayName}
    />
  );
}
