"use client";

import Link from "next/link";
import { FormMessage } from "@/components/auth/form-message";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/auth/actions";
import { id as t } from "@/messages/id";
import { useSafeActionState } from "@/lib/use-safe-action-state";

export function LoginForm({
  siteKey,
  next,
  initialError,
}: {
  siteKey: string;
  next?: string;
  initialError?: string;
}) {
  const [state, formAction, pending] = useSafeActionState(
    loginAction,
    initialError ? { error: initialError } : undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-2">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t.auth.password}</Label>
          <Link
            href="/lupa-password"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {t.auth.forgotPassword}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Turnstile siteKey={siteKey} action="login" resetSignal={state} />
      <FormMessage error={state?.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.loading : t.auth.login}
      </Button>
    </form>
  );
}
