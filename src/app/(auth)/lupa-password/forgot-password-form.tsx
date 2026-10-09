"use client";

import Link from "next/link";
import { useActionState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Turnstile } from "@/components/auth/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/lib/auth/actions";
import { id as t } from "@/messages/id";

export function ForgotPasswordForm({ siteKey }: { siteKey: string }) {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Turnstile siteKey={siteKey} resetSignal={state} />
      <FormMessage error={state?.error} success={state?.success} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.loading : t.auth.forgotSubmit}
      </Button>
      <p className="text-center text-sm">
        <Link href="/masuk" className="text-muted-foreground underline-offset-4 hover:underline">
          {t.auth.backToLogin}
        </Link>
      </p>
    </form>
  );
}
