"use client";

import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { createTelegramLinkAction, unlinkTelegramAction } from "@/lib/notifications/actions";
import { id as t } from "@/messages/id";
import { useSafeActionState } from "@/lib/use-safe-action-state";

const tg = t.notifications.telegram;

export function TelegramLink({ linked }: { linked: boolean }) {
  const [link, createLink, creating] = useSafeActionState(createTelegramLinkAction, undefined);
  const [unlinkState, unlink, unlinking] = useSafeActionState(unlinkTelegramAction, undefined);

  return (
    <div className="space-y-3 text-sm">
      <p className={linked ? "" : "text-muted-foreground"}>{linked ? tg.linked : tg.notLinked}</p>
      {link?.url ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">{tg.linkHint}</p>
          <Button size="sm" render={<a href={link.url} target="_blank" rel="noreferrer" />} nativeButton={false}>
            {tg.openBot}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form action={createLink}>
          <Button type="submit" variant={linked ? "outline" : "default"} size="sm" disabled={creating}>
            {creating ? t.common.loading : tg.link}
          </Button>
        </form>
        {linked ? (
          <form action={unlink}>
            <Button type="submit" variant="outline" size="sm" disabled={unlinking}>
              {tg.unlink}
            </Button>
          </form>
        ) : null}
      </div>
      <FormMessage error={link?.error ?? unlinkState?.error} success={unlinkState?.success} />
    </div>
  );
}
