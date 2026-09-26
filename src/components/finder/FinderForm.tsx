"use client";

import { useEffect, useRef, useTransition, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { findHedges } from "@/app/actions/find-hedges";
import { FinderInputSchema } from "@/domain/finder/finderInput";
import type { FindHedgesResponse } from "@/domain/finder/types";
import { STORAGE_KEYS, usePersistentString } from "@/lib/persistentState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";
import { ResultsList } from "./ResultsList";

// react-hook-form's Resolver type expects the *input* shape of the zod
// schema, not the output shape -- using the output type here trips the
// @hookform/resolvers + zod@4 overload mismatch documented in resolvers
// issue #842. See 01-RESEARCH.md "Common Pitfalls".
type FinderFormValues = z.input<typeof FinderInputSchema>;

export interface FinderFormProps {
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
  /**
   * Incremented by FinderScreen after a successful odds refresh. When it
   * changes (never on initial mount), the last successfully validated
   * search is silently re-submitted through findHedges so the results
   * (including every sport tab) recompute from the newly refreshed cache
   * (ODDS-04, D-13). The previous results stay rendered until the new
   * response arrives.
   */
  recomputeKey?: number;
}

/**
 * Bonus book + amount form. Calls the findHedges server action inside a
 * transition and keeps the last response in state (BONUS-01). Sport is no
 * longer a search input (owner-requested scope change, 01-05) -- every
 * search returns every sport's ranking, and ResultsList renders sport as a
 * client-side tab over that one response. The client-side zodResolver is
 * UX only — findHedges re-validates server-side with the same schema.
 */
export function FinderForm({ bonusBooks, hasCachedOdds, recomputeKey }: FinderFormProps) {
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState<FindHedgesResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  // State (not a ref) so writing it from inside the submit-handler's
  // transition callback never trips the "no ref writes during render"
  // hooks lint rule -- react-hook-form's handleSubmit wrapper obscures the
  // event-handler context enough that the linter can't prove a ref write
  // there is safe.
  const [lastValidValues, setLastValidValues] = useState<FinderFormValues | null>(null);
  const isFirstRecompute = useRef(true);

  // "Limit hedge amount" checkbox + amount (D-17/D-19): persisted per
  // browser via localStorage, not the DB, and not part of react-hook-form's
  // registered fields -- validated directly against FinderInputSchema's
  // maxHedgeAmount rule only when the checkbox is checked.
  const [limitHedgeStored, setLimitHedgeStored] = usePersistentString(
    STORAGE_KEYS.finderLimitHedge,
    "false",
  );
  const [maxHedgeAmount, setMaxHedgeAmount] = usePersistentString(
    STORAGE_KEYS.finderMaxHedgeAmount,
    "",
  );
  const limitHedgeChecked = limitHedgeStored === "true";
  const [maxHedgeAmountError, setMaxHedgeAmountError] = useState<string | null>(null);

  const form = useForm<FinderFormValues>({
    resolver: zodResolver(FinderInputSchema),
    defaultValues: { bookKey: "", bonusAmount: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    let payload: FinderFormValues = values;

    if (limitHedgeChecked) {
      const validation = FinderInputSchema.shape.maxHedgeAmount.safeParse(maxHedgeAmount);
      if (!validation.success) {
        setMaxHedgeAmountError(
          validation.error.issues[0]?.message ?? "Enter a max hedge amount greater than $0.",
        );
        return;
      }
      payload = { ...values, maxHedgeAmount };
    }
    setMaxHedgeAmountError(null);

    startTransition(async () => {
      const result = await findHedges(payload);
      if (result.status === "invalid") {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          const message = messages?.[0];
          if (!message) continue;
          if (field === "maxHedgeAmount") {
            setMaxHedgeAmountError(message);
          } else {
            form.setError(field as keyof FinderFormValues, { message });
          }
        }
        return;
      }
      setLastValidValues(payload);
      setHasSearched(true);
      setResponse(result);
    });
  });

  // recomputeKey fires after a refresh (never on initial mount, since the
  // first effect run is swallowed below) -- silently re-run the last valid
  // search so results and every sport tab reflect the refreshed cache.
  useEffect(() => {
    if (recomputeKey === undefined) return;
    if (isFirstRecompute.current) {
      isFirstRecompute.current = false;
      return;
    }
    if (!lastValidValues) return;

    startTransition(async () => {
      const result = await findHedges(lastValidValues);
      if (result.status !== "invalid") {
        setResponse(result);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only recomputeKey should re-trigger this
  }, [recomputeKey]);

  const hasPreviousResults =
    response?.status === "ok" &&
    Object.values(response.resultsBySport).some((results) => results.length > 0);
  const showSkeleton = isPending && !hasPreviousResults;

  return (
    <div className="flex flex-col gap-8">
      <Card className="p-6">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-[1_1_180px]">
            <Label htmlFor="bookKey">Bonus book</Label>
            <Controller
              control={form.control}
              name="bookKey"
              render={({ field }) => (
                // Always controlled: Base UI treats `undefined` as uncontrolled, so the
                // empty state must be `null` or picking a book flips control mode.
                <Select
                  value={field.value || null}
                  onValueChange={(value) => field.onChange(value ?? "")}
                >
                  <SelectTrigger id="bookKey" className="h-10 w-full">
                    <SelectValue placeholder="Choose a book" />
                  </SelectTrigger>
                  <SelectContent>
                    {bonusBooks.map((book) => (
                      <SelectItem key={book.key} value={book.key}>
                        {book.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.bookKey ? (
              <p className="text-sm text-destructive">{form.formState.errors.bookKey.message}</p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-[1_1_180px]">
            <Label htmlFor="bonusAmount">Bonus amount</Label>
            <Input
              id="bonusAmount"
              inputMode="decimal"
              className="num h-10"
              placeholder="$0.00"
              {...form.register("bonusAmount")}
            />
            {form.formState.errors.bonusAmount ? (
              <p className="text-sm text-destructive">{form.formState.errors.bonusAmount.message}</p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2 md:basis-full">
            <Label
              htmlFor="limitHedgeAmount"
              className="min-h-10 w-fit cursor-pointer gap-2 font-normal"
            >
              <Checkbox
                id="limitHedgeAmount"
                checked={limitHedgeChecked}
                onCheckedChange={(checked) => setLimitHedgeStored(checked ? "true" : "false")}
              />
              Limit hedge amount
            </Label>

            {limitHedgeChecked ? (
              <div className="flex flex-col gap-2 md:max-w-[220px]">
                <Label htmlFor="maxHedgeAmount">Max hedge amount</Label>
                <Input
                  id="maxHedgeAmount"
                  inputMode="decimal"
                  className="num h-10"
                  placeholder="$0.00"
                  value={maxHedgeAmount}
                  onChange={(event) => {
                    setMaxHedgeAmount(event.target.value);
                    if (maxHedgeAmountError) setMaxHedgeAmountError(null);
                  }}
                />
                {maxHedgeAmountError ? (
                  <p className="text-sm text-destructive">{maxHedgeAmountError}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <Button type="submit" disabled={isPending} className="h-10 w-full md:w-auto">
            Find hedges
          </Button>
        </form>
      </Card>

      {showSkeleton ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : !hasSearched ? (
        <EmptyState variant={hasCachedOdds ? "no-search" : "no-cached-odds"} />
      ) : response?.status === "no_cached_odds" ? (
        <EmptyState variant="no-cached-odds" />
      ) : response?.status === "ok" ? (
        <ResultsList response={response} />
      ) : null}
    </div>
  );
}
