import { getBonusBooks, getOddsFreshness } from "@/db/queries";
import { getOddsStatus } from "@/ingestion/odds/status";
import { FinderScreen } from "@/components/finder/FinderScreen";

// Never prerendered at build time — this page always reads live cached
// odds, and `next build` must succeed without a DATABASE_URL.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [bonusBooks, freshness, status] = await Promise.all([
    getBonusBooks(),
    getOddsFreshness(),
    getOddsStatus(),
  ]);

  return (
    <FinderScreen status={status} bonusBooks={bonusBooks} hasCachedOdds={freshness !== null} />
  );
}
