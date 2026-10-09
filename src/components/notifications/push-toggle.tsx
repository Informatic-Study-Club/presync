"use client";

import { useEffect, useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  sendTestPushAction,
} from "@/lib/notifications/actions";
import { id as t } from "@/messages/id";

const p = t.notifications.push;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type Support = "checking" | "unsupported" | "ready";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [support, setSupport] = useState<Support>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [message, setMessage] = useState<{ error?: string; success?: string }>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function detect(): Promise<PushSubscription | null | "unsupported"> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return "unsupported";
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      return registration.pushManager.getSubscription();
    }
    detect()
      .catch(() => "unsupported" as const)
      .then((result) => {
        if (cancelled) return;
        if (result === "unsupported") {
          setSupport("unsupported");
          return;
        }
        setSubscription(result);
        setSupport("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!vapidPublicKey) return <p className="text-sm text-muted-foreground">{p.notConfigured}</p>;
  if (support === "checking") return <p className="text-sm text-muted-foreground">{t.common.loading}</p>;
  if (support === "unsupported") return <p className="text-sm text-muted-foreground">{p.unsupported}</p>;

  function enable() {
    startTransition(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage({ error: p.denied });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey as string),
      });
      const result = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
      if (result?.error) await sub.unsubscribe();
      else setSubscription(sub);
      setMessage(result);
    });
  }

  function disable() {
    startTransition(async () => {
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscription(null);
      setMessage(await removePushSubscriptionAction(endpoint));
    });
  }

  function test() {
    startTransition(async () => setMessage(await sendTestPushAction()));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {subscription ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={disable} disabled={pending}>
              {p.disable}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={test} disabled={pending}>
              {p.test}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" onClick={enable} disabled={pending}>
            {p.enable}
          </Button>
        )}
      </div>
      <FormMessage error={message?.error} success={message?.success} />
    </div>
  );
}
