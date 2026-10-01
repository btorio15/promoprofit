"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import Link from "next/link";
import { InviteRedemptionInputSchema } from "@/domain/auth/authInput";
import { redeemInvite } from "@/app/actions/redeem-invite";
import { safeAction } from "@/lib/safeAction";
import { resolveInviteOutcome } from "./authFormOutcome";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// react-hook-form's Resolver type expects the *input* shape of the zod
// schema, not the output shape -- see FinderForm.tsx for the same escape
// hatch (@hookform/resolvers + zod@4 overload mismatch, resolvers #842).
type FormValues = z.input<typeof InviteRedemptionInputSchema>;

const EMAIL_TAKEN_MESSAGE = "An account with this email already exists.";

export interface InviteFormProps {
  token: string;
}

/**
 * Invite redemption form (D-04). token is a default value only -- never a
 * visible field -- so the user can't tamper with it client-side (the server
 * action re-validates and hashes it regardless).
 */
export function InviteForm({ token }: InviteFormProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(InviteRedemptionInputSchema),
    defaultValues: { token, displayName: "", email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const call = await safeAction(() => redeemInvite({ ...values, token }), "redeemInvite");
      const outcome = resolveInviteOutcome(call);
      if (outcome.kind === "root-error") {
        form.setError("root", { message: outcome.message });
        return;
      }

      for (const [field, messages] of Object.entries(outcome.fieldErrors)) {
        const message = messages?.[0];
        if (!message) continue;
        form.setError(field as keyof FormValues, { message });
      }
    });
  });

  const emailError = form.formState.errors.email?.message;
  const isEmailTaken = emailError === EMAIL_TAKEN_MESSAGE;

  return (
    <form method="post" onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
      {form.formState.errors.root ? (
        <Alert variant="destructive">
          <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" className="h-10" {...form.register("displayName")} />
        {form.formState.errors.displayName ? (
          <p className="text-sm text-destructive">{form.formState.errors.displayName.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="h-10"
          {...form.register("email")}
        />
        {emailError ? (
          <p className="text-sm text-destructive">
            {emailError}
            {isEmailTaken ? (
              <>
                {" "}
                <Link href="/login" className="underline underline-offset-4">
                  Log in
                </Link>{" "}
                instead.
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          className="h-10"
          {...form.register("password")}
        />
        <p className="text-sm text-muted-foreground">Use at least 8 characters.</p>
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isPending} className="h-10 w-full">
        Create account
      </Button>
    </form>
  );
}
