import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { PushToggle } from "@/components/notifications/push-toggle";
import { TelegramLink } from "@/components/notifications/telegram-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { optionalSecret } from "@/lib/env";
import { savePreferencesAction } from "@/lib/notifications/actions";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/channels";
import { notificationSettings } from "@/lib/notifications/settings";
import { id as t } from "@/messages/id";

export const metadata: Metadata = { title: t.notifications.title };

const n = t.notifications;
const CHANNELS = ["email", "telegram", "push"] as const;

export default async function NotificationsPage() {
  const { user } = await requireSession();
  const settings = await notificationSettings(user.id);
  const available = {
    email: !settings.emailSuppressed,
    telegram: settings.telegramLinked,
    push: settings.pushDevices > 0,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{n.title}</h1>
        <p className="text-sm text-muted-foreground">{n.description}</p>
      </div>

      {settings.emailSuppressed ? (
        <Alert variant="destructive">
          <AlertDescription>{n.emailSuppressed}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{n.telegram.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <TelegramLink linked={settings.telegramLinked} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{n.push.title}</CardTitle>
            <CardDescription>{n.push.devices(settings.pushDevices)}</CardDescription>
          </CardHeader>
          <CardContent>
            <PushToggle vapidPublicKey={optionalSecret("VAPID_PUBLIC_KEY") ?? null} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{n.title}</CardTitle>
          <CardDescription>{n.reminderEmailHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={savePreferencesAction} submitLabel={n.save} className="space-y-4 text-sm">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <fieldset key={category} className="space-y-2 rounded-lg border p-3">
                <legend className="px-1 font-medium">{n.categories[category]}</legend>
                <div className="flex flex-wrap gap-4">
                  {CHANNELS.map((channel) => (
                    <label key={channel} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name={`${category}.${channel}`}
                        defaultChecked={settings.preferences[category][channel]}
                      />
                      {n.channels[channel]}
                      {!available[channel] ? (
                        <span className="text-xs text-muted-foreground">({n.unavailable})</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
