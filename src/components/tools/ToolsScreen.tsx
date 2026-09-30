"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinderScreen } from "@/components/finder/FinderScreen";
import { SignupOffersScreen } from "@/components/signup/SignupOffersScreen";

export interface ToolsScreenProps {
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
  recomputeKey: number;
}

/**
 * Tools tab (D-01): the bonus-bet finder and the sign-up offers list under
 * second-level sub-tabs. Both panels stay mounted so a finder result
 * survives switching sub-tabs (and top-level tabs).
 */
export function ToolsScreen({ bonusBooks, hasCachedOdds, recomputeKey }: ToolsScreenProps) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Tools</h1>
        <p className="text-sm text-muted-foreground">Calculators and extras.</p>
      </header>

      <Tabs defaultValue="bonus">
        <TabsList variant="line" aria-label="Select a tool">
          <TabsTrigger value="bonus" className="min-h-11 whitespace-nowrap">
            Bonus bets
          </TabsTrigger>
          <TabsTrigger value="signup" className="min-h-11 whitespace-nowrap">
            Sign-up offers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bonus" keepMounted className="pt-2">
          <FinderScreen bonusBooks={bonusBooks} hasCachedOdds={hasCachedOdds} recomputeKey={recomputeKey} />
        </TabsContent>

        <TabsContent value="signup" keepMounted className="pt-2">
          <SignupOffersScreen />
        </TabsContent>
      </Tabs>
    </div>
  );
}
