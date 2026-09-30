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
}

/** "Expires": next-30-days select plus a time select (defaults to 11:59 PM ET). */
export function ExpiryField({ idPrefix, etDate, etTime, onChange, helper, error, disabled }: ExpiryFieldProps) {
  const days = useMemo(() => expiryDayOptions(new Date()), []);
  const times = useMemo(() => expiryTimeOptions(), []);
  const dayId = `${idPrefix}-expires-day`;
  const timeId = `${idPrefix}-expires-time`;
  const errorId = `${idPrefix}-expires-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={dayId}>Expires</Label>
      <div className="grid grid-cols-2 gap-4">
        <Select value={etDate ?? undefined} onValueChange={(v) => onChange({ etDate: v ?? null, etTime })}>
          <SelectTrigger
            id={dayId}
            className="h-11 w-full"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          >
            <SelectValue placeholder="Pick a day">
              {(value: string | null) => days.find((d) => d.etDate === value)?.label ?? "Pick a day"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {days.map((d) => (
              <SelectItem key={d.etDate} value={d.etDate}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={etTime} onValueChange={(v) => onChange({ etDate, etTime: v ?? etTime })}>
          <SelectTrigger id={timeId} className="h-11 w-full" disabled={disabled} aria-label="Expiry time">
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
      </div>
      {helper ? <p className="text-sm text-muted-foreground">{helper}</p> : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
