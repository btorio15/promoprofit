"use client";

import type { UnprofitablePromoRowDTO } from "@/domain/promos/dto";
import { Badge } from "@/components/ui/badge";
import { AddedPromoActions } from "./AddedPromoActions";
import { FlagMatchButton } from "./FlagMatchButton";
import { MarkUsedButton } from "./MarkUsedButton";
import { NO_PROMO_BOOK_HINT } from "./PromoRow";
import { YourCapField } from "./YourCapField";

interface UnprofitablePromoRowProps {
  row: UnprofitablePromoRowDTO;
  precision: "whole" | "cents";
  onChanged: () => void;
  /** Promos tab only: show the inline "Your cap" field on boost rows. */
  capEditable?: boolean;
  /** Present only in Promos > Active; shows Expire now / Delete on the member's own added promos. */
  addedActions?: {
    onError: (message: string) => void;
    onEdit?: (promoId: number, trigger: HTMLElement | null) => void;
  };
}

/**
 * Greyed-out, non-expandable row for an active promo whose best hedge is
 * not strictly profitable (quick-260927-edt). Rendered after every
 * profitable PromoRow. Deliberately a plain div -- not expand/collapse
 * capable, no trigger, no chevron -- and deliberately renders ONLY the
 * fields present on UnprofitablePromoRowDTO: never a promo/hedge amount,
 * a payout, a hedge book, a profit column, a rate, or "place" wording,
 * since a non-positive result is not a real opportunity.
 *
 * quick-260929-igk: a greyed row can still be marked done (recorded at
 * $0.00 with a "no hedge" snapshot); done promos move to the Done tab.
 */
export function UnprofitablePromoRow({ row, precision, onChanged, capEditable, addedActions }: UnprofitablePromoRowProps) {
  return (
    <div
      className="rounded-lg border border-border bg-secondary/40 p-4 opacity-60"
      aria-label={
        row.hasPromoBook
          ? `${row.bookName} ${row.title} — ${row.note}`
          : `${row.bookName} ${row.title} — ${row.note} (${NO_PROMO_BOOK_HINT})`
      }
    >
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant="outline">{row.promoTypeLabel}</Badge>
          <span>{row.title}</span>
          <span className="text-sm text-muted-foreground">{row.bookName}</span>
          {row.addedByYou ? <Badge variant="outline">Added by you</Badge> : null}
          {row.autoMatched ? <Badge variant="outline">Auto-matched</Badge> : null}
          {row.flaggable ? <FlagMatchButton promoId={row.promoId} onChanged={onChanged} /> : null}
          <MarkUsedButton
            mode="mark"
            promoId={row.promoId}
            precision={precision}
            expectedGuaranteedProfit={null}
            onChanged={onChanged}
          />
        </span>
        <span className="text-sm text-muted-foreground">Promo: {row.scopeLabel}</span>
        {capEditable && row.yourCap ? (
          <YourCapField
                key={row.yourCap.override ?? "none"}
                promoId={row.promoId}
                promoCap={row.yourCap.promoCap}
                override={row.yourCap.override}
                onChanged={onChanged}
              />
        ) : null}
        <span className="text-sm text-muted-foreground">{row.note}</span>
        {row.hasPromoBook ? null : <span className="text-sm text-muted-foreground">{NO_PROMO_BOOK_HINT}</span>}
        {row.addedByYou && addedActions ? (
          <div className="pt-2">
            <AddedPromoActions
              promoId={row.promoId}
              canExpire
              isDone={false}
              onChanged={onChanged}
              onError={addedActions.onError}
              onEdit={addedActions.onEdit}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
