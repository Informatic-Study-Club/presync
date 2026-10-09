"use client";

import { type ReactNode, useActionState } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { id as t } from "@/messages/id";

type State = { error?: string; success?: string } | undefined;

// Form Server Action sederhana: isi form dari children, pesan hasil, tombol kirim.
export function ActionForm({
  action,
  submitLabel,
  variant = "default",
  children,
  className,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  submitLabel: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  children?: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      <FormMessage error={state?.error} success={state?.success} />
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? t.common.loading : submitLabel}
      </Button>
    </form>
  );
}
