import "server-only";
import { inArray } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { emailSuppressions, members, notificationPreferences, pushSubscriptions, telegramLinks } from "@/db/schema";
import { type NotificationCategory, resolveChannels } from "./channels";
import { enqueueNotifications, type OutboxEntry } from "./outbox";

export type NotifyInput = {
  memberIds: readonly string[];
  category: NotificationCategory;
  template: string;
  /** Kunci idempotensi dasar per anggota; nama kanal ditambahkan otomatis. */
  key: (memberId: string) => string;
  payload: (memberId: string) => Record<string, unknown>;
  scheduledAt?: Date;
};

/**
 * Sebar notifikasi ke outbox sesuai preferensi dan kanal yang tersedia per
 * anggota (satu baris per kanal). Mengembalikan jumlah baris per kanal.
 */
export async function notifyMembers(executor: Db | Tx, input: NotifyInput) {
  const ids = [...new Set(input.memberIds)];
  const counts = { email: 0, telegram: 0, push: 0 };
  if (ids.length === 0) return counts;

  const [prefRows, linkRows, subRows, memberRows] = await Promise.all([
    executor.select().from(notificationPreferences).where(inArray(notificationPreferences.memberId, ids)),
    executor.select({ memberId: telegramLinks.memberId }).from(telegramLinks).where(inArray(telegramLinks.memberId, ids)),
    executor.select({ memberId: pushSubscriptions.memberId }).from(pushSubscriptions).where(inArray(pushSubscriptions.memberId, ids)),
    executor.select({ id: members.id, email: members.email }).from(members).where(inArray(members.id, ids)),
  ]);
  const emails = memberRows.map((m) => m.email);
  const suppressed = new Set(
    emails.length > 0
      ? (await executor.select({ email: emailSuppressions.email }).from(emailSuppressions).where(inArray(emailSuppressions.email, emails))).map(
          (r) => r.email,
        )
      : [],
  );
  const emailOf = new Map(memberRows.map((m) => [m.id, m.email]));
  const linked = new Set(linkRows.map((r) => r.memberId));
  const subscribed = new Set(subRows.map((r) => r.memberId));

  const entries: OutboxEntry[] = [];
  for (const memberId of ids) {
    const pref = prefRows.find((p) => p.memberId === memberId && p.category === input.category) ?? null;
    const channels = resolveChannels(input.category, pref, {
      telegramLinked: linked.has(memberId),
      pushSubscribed: subscribed.has(memberId),
      emailSuppressed: suppressed.has(emailOf.get(memberId) ?? ""),
    });
    for (const channel of channels) {
      counts[channel]++;
      entries.push({
        memberId,
        channel,
        template: input.template,
        idempotencyKey: `${input.key(memberId)}:${channel}`,
        payload: input.payload(memberId),
        scheduledAt: input.scheduledAt,
      });
    }
  }
  // Batch agar satu INSERT tidak terlalu besar.
  for (let i = 0; i < entries.length; i += 500) {
    await enqueueNotifications(executor, entries.slice(i, i + 500));
  }
  return counts;
}
