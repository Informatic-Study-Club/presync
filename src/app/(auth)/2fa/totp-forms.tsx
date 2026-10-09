"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startTotpEnrollmentAction, verifyTotpAction } from "@/lib/auth/actions";
import { id as t } from "@/messages/id";

export function VerifyTotpForm({ factorId }: { factorId: string }) {
  const [state, formAction, pending] = useActionState(verifyTotpAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="factorId" value={factorId} />
      <div className="space-y-2">
        <Label htmlFor="code">{t.mfa.code}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
        />
      </div>
      <FormMessage error={state?.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.loading : t.mfa.verify}
      </Button>
    </form>
  );
}

export function EnrollTotp() {
  const [enrollment, startAction, starting] = useActionState(
    startTotpEnrollmentAction,
    undefined,
  );

  if (!enrollment?.factorId) {
    return (
      <form action={startAction} className="space-y-4">
        <FormMessage error={enrollment?.error} />
        <Button type="submit" className="w-full" disabled={starting}>
          {starting ? t.common.loading : t.mfa.setupTitle}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {/* qr_code dari Supabase berupa data URL SVG, bukan URL eksternal. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={enrollment.qrCode}
        alt={t.mfa.qrAlt}
        className="mx-auto size-48 rounded-md bg-white p-2"
      />
      <div className="space-y-1 text-sm">
        <p className="text-muted-foreground">{t.mfa.secretLabel}</p>
        <code className="block break-all rounded bg-muted p-2 font-mono text-xs">
          {enrollment.secret}
        </code>
      </div>
      <VerifyTotpForm factorId={enrollment.factorId} />
    </div>
  );
}
