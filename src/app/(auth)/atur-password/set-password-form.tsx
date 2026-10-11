"use client";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPasswordAction } from "@/lib/auth/actions";
import { id as t } from "@/messages/id";
import { useSafeActionState } from "@/lib/use-safe-action-state";

export function SetPasswordForm() {
  const [state, formAction, pending] = useSafeActionState(setPasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{t.auth.newPassword}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">{t.auth.confirmPassword}</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>
      <FormMessage error={state?.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.loading : t.common.save}
      </Button>
    </form>
  );
}
