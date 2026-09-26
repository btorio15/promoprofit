"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { LoginInputSchema } from "@/domain/auth/authInput";
import { login } from "@/app/actions/login";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// react-hook-form's Resolver type expects the *input* shape of the zod
// schema, not the output shape -- see InviteForm.tsx/FinderForm.tsx for the
// same escape hatch (@hookform/resolvers + zod@4 overload mismatch,
// resolvers #842).
type FormValues = z.input<typeof LoginInputSchema>;

const INCORRECT_CREDENTIALS_MESSAGE = "Incorrect email or password.";
const LOCKED_MESSAGE = "Too many attempts — try again in a few minutes.";

/**
 * Login form (D-01, D-05, D-07). A wrong password and an unknown email both
 * show the identical generic error (T-02-10) -- the form never distinguishes
 * them. On success, login() redirects to / (thrown NEXT_REDIRECT), so there
 * is no success branch to handle here.
 */
export function LoginForm() {
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(LoginInputSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await login(values);

      if (result.status === "invalid_credentials") {
        form.setError("root", { message: INCORRECT_CREDENTIALS_MESSAGE });
        return;
      }

      if (result.status === "locked") {
        form.setError("root", { message: LOCKED_MESSAGE });
        return;
      }

      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        const message = messages?.[0];
        if (!message) continue;
        form.setError(field as keyof FormValues, { message });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {form.formState.errors.root ? (
        <Alert variant="destructive">
          <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="h-10"
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-10"
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isPending} className="h-10 w-full">
        Log in
      </Button>
    </form>
  );
}
