"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { notificationPreferences, pushSubscriptions } from "@/db/schema";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { id as t } from "@/messages/id";
import { NOTIFICATION_CATEGORIES } from "./channels";
import { enqueueNotifications } from "./outbox";
import { pushConfigured } from "./push-adapter";
import { createLinkToken, telegramConfigured, unlinkTelegram } from "./telegram";
import { processOutbox } from "./worker";

export type ActionState = { error?: string; success?: string } | undefined;

async function requireOwnPreferences() {
  const { user } = await requireSession();
  return can(user, "notification.preferences", { memberId: user.id }) ? user : null;
}

export async function savePreferencesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireOwnPreferences();
  if (!user) return { error: t.errors.forbidden };
  const rows = NOTIFICATION_CATEGORIES.map((category) => ({
    memberId: user.id,
    category,
    email: fd.get(`${category}.email`) === "on",
    telegram: fd.get(`${category}.telegram`) === "on",
    push: fd.get(`${category}.push`) === "on",
    updatedAt: new Date(),
  }));
  await getDb()
    .insert(notificationPreferences)
    .values(rows)
    .onConflictDoUpdate({
      target: [notificationPreferences.memberId, notificationPreferences.category],
      set: {
        email: sql`excluded.email`,
        telegram: sql`excluded.telegram`,
        push: sql`excluded.push`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  revalidatePath("/notifikasi");
  return { success: t.notifications.saved };
}

export type LinkState = { error?: string; url?: string } | undefined;

export async function createTelegramLinkAction(): Promise<LinkState> {
  const user = await requireOwnPreferences();
  if (!user) return { error: t.errors.forbidden };
  if (!telegramConfigured()) return { error: t.notifications.telegram.notConfigured };
  const url = await createLinkToken(user.id);
  return url ? { url } : { error: t.notifications.telegram.notConfigured };
}

export async function unlinkTelegramAction(): Promise<ActionState> {
  const user = await requireOwnPreferences();
  if (!user) return { error: t.errors.forbidden };
  await unlinkTelegram(user.id);
  revalidatePath("/notifikasi");
  return { success: t.notifications.telegram.unlinked };
}

const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }),
});

export async function savePushSubscriptionAction(input: unknown, userAgent: string): Promise<ActionState> {
  const user = await requireOwnPreferences();
  if (!user) return { error: t.errors.forbidden };
  if (!pushConfigured()) return { error: t.notifications.push.notConfigured };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: t.notifications.push.unsupported };
  const { endpoint, keys } = parsed.data;
  await getDb()
    .insert(pushSubscriptions)
    .values({ memberId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 300) })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { memberId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 300) },
    });
  revalidatePath("/notifikasi");
  return { success: t.notifications.push.enabled };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionState> {
  const user = await requireOwnPreferences();
  if (!user) return { error: t.errors.forbidden };
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.memberId, user.id), eq(pushSubscriptions.endpoint, endpoint.slice(0, 2000))));
  revalidatePath("/notifikasi");
  return { success: t.notifications.push.disabled };
}

/** Push uji tetap lewat outbox dan worker (aturan wajib 13). */
export async function sendTestPushAction(): Promise<ActionState> {
  const user = await requireOwnPreferences();
  if (!user) return { error: t.errors.forbidden };
  if (!pushConfigured()) return { error: t.notifications.push.notConfigured };
  await enqueueNotifications(getDb(), [
    {
      memberId: user.id,
      channel: "push",
      template: "test",
      idempotencyKey: `test:${user.id}:${Date.now()}`,
      payload: { title: t.notifications.push.testTitle, body: t.notifications.push.testBody, url: "/notifikasi" },
    },
  ]);
  await processOutbox(new Date(), ["push"]);
  return { success: t.notifications.push.testSent };
}
