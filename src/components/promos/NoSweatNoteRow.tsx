"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { NoSweatNoteRowDTO } from "@/domain/promos/noSweatRowDto";
import { formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { AddedPromoActions } from "./AddedPromoActions";
import { noteCopy } from "./noSweatRowView";

interface NoSweatNoteRowProps {
  dto: NoSweatNoteRowDTO;
  onChanged: () => void;
  addedActions?: {
    onError: (message: string) => void;
    onEdit?: (promoId: number, trigger: HTMLElement | null) => void;
  };
}

/**
 * Non-expandable muted row for a no-sweat that can't be priced, isn't worth
 * it, or is blocked by Low-profile settings (D-10, D-11). No dollar figure
 * beyond the refund cap and no Track button.
 */
export function NoSweatNoteRow({ dto, onChanged, addedActions }: NoSweatNoteRowProps) {
  const note = noteCopy(dto.note, dto.bookName);
  return (
    <div
      className="rounded-lg border border-border bg-secondary/40 p-4 opacity-60"
      aria-label={`${dto.bookName} ${dto.title} — ${note}`}
    >
      <div className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-base">
          <Badge variant="outline">No-sweat</Badge>
          <span>{dto.title}</span>
          <span className="text-sm text-muted-foreground">{dto.bookName}</span>
          {dto.addedByYou ? <Badge variant="outline">Added by you</Badge> : null}
        </span>
        {dto.scopeLabel ? <span className="text-sm text-muted-foreground">Promo: {dto.scopeLabel}</span> : null}
        <span className="text-sm text-muted-foreground">
          Most you get back <span className="num">{formatUsd(dto.refundCap)}</span>
        </span>
        {dto.expiresAt ? (
          <span className="text-sm text-muted-foreground">
            Expires{" "}
            {new Date(dto.expiresAt).toLocaleDateString("en-US", {
              timeZone: "America/Denver",
              month: "short",
              day: "numeric",
            })}
          </span>
        ) : null}
        <span className="flex items-center gap-1 text-sm text-warning">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {note}
        </span>
        {dto.note === "low_profile_blocked" ? (
          <Link href="/settings" className="text-sm underline underline-offset-2">
            Change Low-profile settings
          </Link>
        ) : null}
        {dto.addedByYou && addedActions ? (
          <div className="pt-2">
            <AddedPromoActions
              promoId={dto.promoId}
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
