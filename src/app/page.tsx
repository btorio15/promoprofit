import { getBonusBooks, getOddsFreshness } from "@/db/queries";
import { getOddsStatus } from "@/ingestion/odds/status";
import { FinderForm } from "@/components/finder/FinderForm";
import { OddsStatusBar } from "@/components/finder/OddsStatusBar";
import { CreditBanner } from "@/components/finder/CreditBanner";
import { Separator } from "@/components/ui/separator";

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
    <>
      <OddsStatusBar status={status} />
      <Separator />
      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col gap-8 px-4 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Bonus bet finder</h1>
          <p className="text-sm text-muted-foreground">
            Find the best market to convert a bonus bet, and the best Colorado
            book to hedge it at.
          </p>
        </header>
        <CreditBanner status={status} />
        <FinderForm bonusBooks={bonusBooks} hasCachedOdds={freshness !== null} />
      </main>
    </>
  );
}
