"use client";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createFeedTokenAction } from "@/lib/academic/actions";
import { id as t } from "@/messages/id";
import { useSafeActionState } from "@/lib/use-safe-action-state";

export function FeedLink({ hasToken }: { hasToken: boolean }) {
  const [state, action, pending] = useSafeActionState(createFeedTokenAction, undefined);

  return (
    <form action={action} className="space-y-3">
      {state?.url ? (
        <div className="space-y-2">
          <Input readOnly value={state.url} onFocus={(e) => e.currentTarget.select()} aria-label={t.academic.calendar.feedTitle} />
          <p className="text-xs text-muted-foreground">{t.academic.calendar.feedShownOnce}</p>
        </div>
      ) : hasToken ? (
        <p className="text-sm text-muted-foreground">{t.academic.calendar.feedExists}</p>
      ) : null}
      <FormMessage error={state?.error} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending
          ? t.common.loading
          : hasToken || state?.url
            ? t.academic.calendar.feedRecreate
            : t.academic.calendar.feedCreate}
      </Button>
    </form>
  );
}
