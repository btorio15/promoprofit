"use client";

import { useTransition, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { findHedges } from "@/app/actions/find-hedges";
import { FinderInputSchema } from "@/domain/finder/finderInput";
import type { FindHedgesResponse } from "@/domain/finder/types";
import { SPORTS } from "@/config/sports";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./EmptyState";
import { ResultsList } from "./ResultsList";

// react-hook-form's Resolver type expects the *input* shape of the zod
// schema (sportKey optional, pre-.default()), not the output shape
// (`FinderInput`, sportKey required) — using the output type here trips
// the @hookform/resolvers + zod@4 overload mismatch documented in
// resolvers issue #842. See 01-RESEARCH.md "Common Pitfalls".
type FinderFormValues = z.input<typeof FinderInputSchema>;
type SportFilterValue = "all" | (typeof SPORTS)[number]["key"];

export interface FinderFormProps {
  bonusBooks: { key: string; displayName: string }[];
  hasCachedOdds: boolean;
}

/**
 * Bonus book + amount + sport filter form. Calls the findHedges server
 * action inside a transition and keeps the last response in state
 * (BONUS-01). The client-side zodResolver is UX only — findHedges
 * re-validates server-side with the same schema.
 */
export function FinderForm({ bonusBooks, hasCachedOdds }: FinderFormProps) {
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState<FindHedgesResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const form = useForm<FinderFormValues>({
    resolver: zodResolver(FinderInputSchema),
    defaultValues: { bookKey: "", bonusAmount: "", sportKey: "all" },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await findHedges(values);
      if (result.status === "invalid") {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          const message = messages?.[0];
          if (message) {
            form.setError(field as keyof FinderFormValues, { message });
          }
        }
        return;
      }
      setHasSearched(true);
      setResponse(result);
    });
  });

  const hasPreviousResults = response?.status === "ok" && response.results.length > 0;
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
                <Select value={field.value || undefined} onValueChange={field.onChange}>
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

          <div className="flex min-w-0 flex-[2_1_340px] flex-col gap-2">
            <Label>Sport</Label>
            <Controller
              control={form.control}
              name="sportKey"
              render={({ field }) => (
                <ToggleGroup
                  aria-label="Sport filter"
                  value={[(field.value ?? "all") as SportFilterValue]}
                  onValueChange={(values: SportFilterValue[]) =>
                    field.onChange(values[0] ?? "all")
                  }
                >
                  <ToggleGroupItem value="all">All sports</ToggleGroupItem>
                  {SPORTS.map((sport) => (
                    <ToggleGroupItem key={sport.key} value={sport.key}>
                      {sport.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
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
