"use client";

import type { UnprofitablePromoRowDTO } from "@/domain/promos/dto";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FlagMatchButton } from "./FlagMatchButton";
import { MarkUsedButton } from "./MarkUsedButton";
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
 *
 * quick-260927-n12 (scope change A): a used row swaps its background for
 * the same used-row-bg gradient PromoRow uses (dropping the dimmed/opacity
 * treatment, since "marked used" is a distinct, non-muted state) and gets
 * a "Marked used" badge plus the Mark used/Undo toggle.
 */
export function UnprofitablePromoRow({ row, onChanged }: UnprofitablePromoRowProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border p-4",
        row.used ? "used-row-bg" : "bg-secondary/40 opacity-60",
      )}
      aria-label={
        row.used
          ? `${row.bookName} ${row.title} — ${row.note} (Marked used)`
          : row.hasPromoBook
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
          {row.used ? <Badge variant="outline">Marked used</Badge> : null}
          <MarkUsedButton promoId={row.promoId} used={row.used} onChanged={onChanged} />
        </span>
        <span className="text-sm text-muted-foreground">Promo: {row.scopeLabel}</span>
        <span className="text-sm text-muted-foreground">{row.note}</span>
        {row.hasPromoBook ? null : <span className="text-sm text-muted-foreground">{NO_PROMO_BOOK_HINT}</span>}
      </div>
    </div>
  );
}
