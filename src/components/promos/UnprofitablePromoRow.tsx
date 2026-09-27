"use client";

import type { UnprofitablePromoRowDTO } from "@/domain/promos/dto";
import { Badge } from "@/components/ui/badge";
import { FlagMatchButton } from "./FlagMatchButton";
import { NO_PROMO_BOOK_HINT } from "./PromoRow";

interface UnprofitablePromoRowProps {
  row: UnprofitablePromoRowDTO;
  onChanged: () => void;
}

/**
 * Greyed-out, non-expandable row for an active promo whose best hedge is
 * not strictly profitable (quick-260927-edt). Rendered after every
 * profitable PromoRow. Deliberately a plain div -- not expand/collapse
 * capable, no trigger, no chevron -- and deliberately renders ONLY the
 * fields present on UnprofitablePromoRowDTO: never a promo/hedge amount,
 * a payout, a hedge book, a profit column, a rate, or "place" wording,
 * since a non-positive result is not a real opportunity.
 */
export function UnprofitablePromoRow({ row, onChanged }: UnprofitablePromoRowProps) {
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
          {row.autoMatched ? (
            <>
              <Badge variant="outline">Auto-matched</Badge>
              <FlagMatchButton promoId={row.promoId} onChanged={onChanged} />
            </>
          ) : null}
        </span>
        <span className="text-sm text-muted-foreground">Promo: {row.scopeLabel}</span>
        <span className="text-sm text-muted-foreground">{row.note}</span>
        {row.hasPromoBook ? null : <span className="text-sm text-muted-foreground">{NO_PROMO_BOOK_HINT}</span>}
      </div>
    </div>
  );
}
