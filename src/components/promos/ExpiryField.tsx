"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { expiryDayOptions, expiryTimeOptions } from "@/domain/promos/addPromoDraft";

interface ExpiryFieldProps {
  idPrefix: string;
  etDate: string | null;
  etTime: string;
  onChange: (next: { etDate: string | null; etTime: string }) => void;
  helper?: string;
  error?: string;
  disabled?: boolean;
  /** Boosts: adds a first "When the last game starts" day (etDate null = no expiry entered). */
  allowDefault?: boolean;
}

const DEFAULT_DAY_VALUE = "__default";
const DEFAULT_DAY_LABEL = "When the last game starts";

/** "Expires": next-30-days select plus a time select (defaults to 11:59 PM ET). */
export function ExpiryField({ idPrefix, etDate, etTime, onChange, helper, error, disabled, allowDefault }: ExpiryFieldProps) {
  const days = useMemo(() => expiryDayOptions(new Date()), []);
  const times = useMemo(() => expiryTimeOptions(), []);
  const dayId = `${idPrefix}-expires-day`;
  const timeId = `${idPrefix}-expires-time`;
  const errorId = `${idPrefix}-expires-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={dayId}>Expires</Label>
      <div className="grid grid-cols-2 gap-4">
        <Select
          value={allowDefault ? (etDate ?? DEFAULT_DAY_VALUE) : (etDate ?? undefined)}
          onValueChange={(v) => onChange({ etDate: v === DEFAULT_DAY_VALUE ? null : (v ?? null), etTime })}
        >
          <SelectTrigger
            id={dayId}
            className="h-11 w-full"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          >
            <SelectValue placeholder="Pick a day">
              {(value: string | null) =>
                value === DEFAULT_DAY_VALUE
                  ? DEFAULT_DAY_LABEL
                  : (days.find((d) => d.etDate === value)?.label ?? "Pick a day")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowDefault ? <SelectItem value={DEFAULT_DAY_VALUE}>{DEFAULT_DAY_LABEL}</SelectItem> : null}
            {days.map((d) => (
              <SelectItem key={d.etDate} value={d.etDate}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {allowDefault && etDate === null ? null : (
        <Select value={etTime} onValueChange={(v) => onChange({ etDate, etTime: v ?? etTime })}>
          <SelectTrigger id={timeId} className="h-11 w-full" disabled={disabled} aria-label="Expiry time (Eastern Time)">
            <SelectValue>
              {(value: string | null) => times.find((t) => t.value === value)?.label ?? ""}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {times.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        )}
      </div>
      {allowDefault && etDate === null ? (
        <p className="text-sm text-muted-foreground">Ends when the last game starts</p>
      ) : null}
      {helper ? <p className="text-sm text-muted-foreground">{helper}</p> : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
