"use client";

import { type FormEvent, type ReactNode, startTransition, useEffect, useRef } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { id as t } from "@/messages/id";
import { useSafeActionState } from "@/lib/use-safe-action-state";

type State = { error?: string; success?: string } | undefined;

// Form Server Action sederhana: isi form dari children, pesan hasil, tombol kirim.
//
// React 19 mengosongkan form setelah action yang dipasang di prop `action`
// selesai, termasuk saat server menolak isian. Pengguna lalu kehilangan
// ketikannya dan pengiriman ulang tampak "tidak ada perubahan". Karena itu
// action dipanggil manual: isian tetap saat galat, dan form dikosongkan
// (kembali ke nilai default terbaru) hanya bila berhasil.
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
  const [state, formAction, pending] = useSafeActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className={className ?? "space-y-3"}>
      {children}
      <FormMessage error={state?.error} success={state?.success} />
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? t.common.loading : submitLabel}
      </Button>
    </form>
  );
}
