"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { getSignupOffers } from "@/app/actions/get-signup-offers";
import type { GetSignupOffersResponse, SignupOfferGroupDTO } from "@/domain/promos/signupOffers";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { etDayLabel } from "@/domain/promos/etTime";

/**
 * "Sign-up offers" tab (quick-260928-mgi, owner decision 3, 03-UI-SPEC.md
 * conventions). Informational only -- no hedge math, no profit numbers.
 * Follows PromosScreen's fetch-on-mount pattern: a useTransition call to
 * getSignupOffers, a thrown error clears the response and shows an error
 * state with a retry. No props -- it doesn't depend on odds or
 * recomputeKey (T-mgi-08: this tab never reads cached odds or ranking).
 */
export function SignupOffersScreen() {
  const [response, setResponse] = useState<GetSignupOffersResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showOwned, setShowOwned] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  function runGetSignupOffers() {
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      let result: GetSignupOffersResponse;
      try {
        result = await getSignupOffers();
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error("getSignupOffers failed:", err);
        setResponse(null);
        setLoadFailed(true);
        return;
      }
      if (requestId !== requestIdRef.current) return;
      setLoadFailed(false);
      setResponse(result);
    });
  }

  useEffect(() => {
    runGetSignupOffers();
  }, []);

  const showSkeleton = isPending && response === null;
  const hasOwnedOffers = response?.status === "ok" && response.ownedGroups.length > 0;
  const visibleGroups: Array<SignupOfferGroupDTO & { owned: boolean }> =
    response?.status === "ok"
      ? [
          ...response.groups.map((group) => ({ ...group, owned: false })),
          ...(showOwned ? response.ownedGroups.map((group) => ({ ...group, owned: true })) : []),
        ]
      : [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Sign-up offers</h1>
        <p className="text-sm text-muted-foreground">
          New-customer offers at sportsbooks you haven&apos;t added yet. For reference only, with no hedge math.
        </p>
        {hasOwnedOffers ? (
          <Label htmlFor="signup-show-owned" className="mt-2 min-h-10 w-fit cursor-pointer gap-2 font-normal">
            <Checkbox
              id="signup-show-owned"
              checked={showOwned}
              onCheckedChange={(checked) => setShowOwned(checked === true)}
            />
            Show books I already have
          </Label>
        ) : null}
      </header>

      {showSkeleton ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : loadFailed && !isPending ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>Couldn&apos;t load sign-up offers.</span>
            <Button type="button" variant="secondary" className="h-10" onClick={runGetSignupOffers}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : response?.status === "ok" && response.empty === "none" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
          <h3 className="text-xl font-semibold">No sign-up offers right now</h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            The scraper hasn&apos;t found any new-customer offers. New ones appear automatically after the next
            scheduled scrape.
          </p>
        </div>
      ) : response?.status === "ok" && response.empty === "have-all" && !showOwned ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-6">
          <h3 className="text-xl font-semibold">You already have every book with a sign-up offer</h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            Every sportsbook with a current new-customer offer is already in your book list.
          </p>
          <div>
            <Button variant="outline" nativeButton={false} render={<Link href="/settings" />}>
              Manage your books
            </Button>
          </div>
        </div>
      ) : response?.status === "ok" ? (
        <div className="flex flex-col gap-8">
          {visibleGroups.map((group) => (
            <section key={group.bookKey} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{group.bookName}</h2>
                {group.owned ? <Badge variant="outline">You have this book</Badge> : null}
              </div>
              <div className="flex flex-col gap-3">
                {group.offers.map((offer) => (
                  <div key={offer.id} className="rounded-lg border border-border bg-secondary p-4">
                    <p className="text-base">{offer.title}</p>
                    {offer.bonusLabel !== null ? (
                      <p className="text-sm">
                        <span className="num">{offer.bonusLabel}</span> in bonus bets
                      </p>
                    ) : null}
                    <p className="text-sm text-muted-foreground">{offer.description}</p>
                    {offer.expiresAt !== null ? (
                      <p className="text-sm text-muted-foreground">Expires {etDayLabel(offer.expiresAt)}</p>
                    ) : null}
                    {offer.link !== null ? (
                      <a
                        href={offer.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        View on {group.bookName}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
