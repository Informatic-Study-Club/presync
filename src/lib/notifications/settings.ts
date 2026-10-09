import "server-only";
import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailSuppressions, members, notificationPreferences, pushSubscriptions, telegramLinks } from "@/db/schema";
import { type ChannelPrefs, DEFAULT_PREFERENCES, NOTIFICATION_CATEGORIES, type NotificationCategory } from "./channels";

export async function notificationSettings(memberId: string) {
  const db = getDb();
  const [prefRows, [link], [devices], [member]] = await Promise.all([
    db.select().from(notificationPreferences).where(eq(notificationPreferences.memberId, memberId)),
    db.select({ linkedAt: telegramLinks.linkedAt }).from(telegramLinks).where(eq(telegramLinks.memberId, memberId)).limit(1),
    db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.memberId, memberId)),
    db.select({ email: members.email }).from(members).where(eq(members.id, memberId)).limit(1),
  ]);
  const [suppressed] = member
    ? await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, member.email)).limit(1)
    : [];

  const preferences = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((category) => {
      const row = prefRows.find((p) => p.category === category);
      const prefs: ChannelPrefs = row
        ? { email: row.email, telegram: row.telegram, push: row.push }
        : DEFAULT_PREFERENCES[category];
      return [category, prefs];
    }),
  ) as Record<NotificationCategory, ChannelPrefs>;

  return {
    preferences,
    telegramLinked: Boolean(link),
    pushDevices: devices?.n ?? 0,
    emailSuppressed: Boolean(suppressed),
  };
}
