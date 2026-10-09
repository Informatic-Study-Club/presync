import "server-only";
import { and, asc, count, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { emailSuppressions, members, notificationOutbox, pushSubscriptions, telegramLinks } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailSendError, sendEmail } from "./email-adapter";
import { sendPush } from "./push-adapter";
import { isExpired } from "./reminders";
import { jakartaDayStart, MAX_ATTEMPTS, retryDelayMs, STALE_CLAIM_MS, selectEmailBatch } from "./schedule";
import { sendTelegramMessage, TelegramSendError } from "./telegram-adapter";
import {
  type ArrearsPayload,
  activationEmail,
  arrearsEmail,
  arrearsPush,
  arrearsTelegram,
  type EmailContent,
  type PushContent,
  type ReminderPayload,
  reminderEmail,
  reminderPush,
  reminderTelegram,
} from "./templates";

// Worker outbox untuk semua kanal (aturan wajib 13). Dijalankan cron harian
// Vercel dan workflow GitHub Actions tiap 15 menit.

export type WorkerResult = { sent: number; skipped: number; retried: number; failed: number };
type Channel = "email" | "telegram" | "push";

/** Telegram dan push tanpa kuota harian, tapi dibatasi per putaran. */
const NON_EMAIL_BATCH = 300;

type Claimed = {
  id: number;
  channel: Channel;
  template: string;
  attempts: number;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  email: string;
  fullName: string;
  memberStatus: "aktif" | "nonaktif" | "alumni";
  memberId: string;
};

class SkipNotification extends Error {}
class PermanentFailure extends Error {}

// ---------------------------------------------------------------- isi pesan

async function activationContent(item: Claimed): Promise<EmailContent> {
  const admin = createSupabaseAdminClient();
  const { data: user } = await admin.auth.admin.getUserById(item.memberId);
  if (user.user?.last_sign_in_at) throw new SkipNotification("Akun sudah aktif");
  // Tautan dibuat saat kirim, karena token Supabase cepat kedaluwarsa.
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: item.email });
  if (error || !data.properties?.hashed_token) {
    throw new EmailSendError(`Gagal membuat tautan aktivasi: ${error?.message ?? "-"}`, true);
  }
  const link = new URL("/auth/confirm", serverEnv().APP_URL);
  link.searchParams.set("token_hash", data.properties.hashed_token);
  link.searchParams.set("type", "recovery");
  link.searchParams.set("next", "/atur-password");
  return activationEmail({ name: item.fullName, link: link.toString() });
}

async function emailContent(item: Claimed): Promise<EmailContent> {
  switch (item.template) {
    case "activation":
      return activationContent(item);
    case "session_reminder":
      return reminderEmail(item.payload as ReminderPayload);
    case "arrears_digest":
      return arrearsEmail(item.payload as ArrearsPayload);
    default:
      throw new PermanentFailure(`Template email tidak dikenal: ${item.template}`);
  }
}

function telegramContent(item: Claimed): string {
  switch (item.template) {
    case "session_reminder":
      return reminderTelegram(item.payload as ReminderPayload);
    case "arrears_digest":
      return arrearsTelegram(item.payload as ArrearsPayload);
    default:
      throw new PermanentFailure(`Template Telegram tidak dikenal: ${item.template}`);
  }
}

function pushContent(item: Claimed): PushContent {
  switch (item.template) {
    case "session_reminder":
      return reminderPush(item.payload as ReminderPayload);
    case "arrears_digest":
      return arrearsPush(item.payload as ArrearsPayload);
    case "test":
      return item.payload as PushContent;
    default:
      throw new PermanentFailure(`Template push tidak dikenal: ${item.template}`);
  }
}

// ---------------------------------------------------------------- klaim antrean

const claimedColumns = {
  id: notificationOutbox.id,
  channel: notificationOutbox.channel,
  template: notificationOutbox.template,
  attempts: notificationOutbox.attempts,
  idempotencyKey: notificationOutbox.idempotencyKey,
  payload: notificationOutbox.payload,
  email: members.email,
  fullName: members.fullName,
  memberStatus: members.status,
  memberId: members.id,
};

async function resetStaleClaims(now: Date) {
  // Klaim macet (worker sebelumnya terhenti) diantrekan lagi. Kirim ganda
  // email dicegah Idempotency-Key di Resend.
  await getDb()
    .update(notificationOutbox)
    .set({ status: "queued", claimedAt: null, sentAt: null })
    .where(and(eq(notificationOutbox.status, "sending"), lt(notificationOutbox.claimedAt, new Date(now.getTime() - STALE_CLAIM_MS))));
}

async function claim(channel: Channel, now: Date): Promise<Claimed[]> {
  return getDb().transaction(async (tx) => {
    const queued = await tx
      .select({ id: notificationOutbox.id, template: notificationOutbox.template })
      .from(notificationOutbox)
      .where(
        and(eq(notificationOutbox.channel, channel), eq(notificationOutbox.status, "queued"), lte(notificationOutbox.scheduledAt, now)),
      )
      .orderBy(asc(notificationOutbox.scheduledAt), asc(notificationOutbox.id))
      .limit(channel === "email" ? 500 : NON_EMAIL_BATCH)
      .for("update", { skipLocked: true });

    let ids: number[];
    if (channel === "email") {
      const sentToday = and(
        eq(notificationOutbox.channel, "email"),
        inArray(notificationOutbox.status, ["sent", "sending"]),
        gte(notificationOutbox.sentAt, jakartaDayStart(now)),
      );
      const [total] = await tx.select({ n: count() }).from(notificationOutbox).where(sentToday);
      const [activation] = await tx
        .select({ n: count() })
        .from(notificationOutbox)
        .where(and(sentToday, eq(notificationOutbox.template, "activation")));
      ids = selectEmailBatch(queued, { sentToday: total?.n ?? 0, activationSentToday: activation?.n ?? 0 });
    } else {
      ids = queued.map((q) => q.id);
    }
    if (ids.length === 0) return [];

    // sent_at diisi saat klaim agar kuota email langsung terhitung.
    await tx
      .update(notificationOutbox)
      .set({ status: "sending", claimedAt: now, sentAt: now })
      .where(inArray(notificationOutbox.id, ids));
    return tx
      .select(claimedColumns)
      .from(notificationOutbox)
      .innerJoin(members, eq(notificationOutbox.memberId, members.id))
      .where(inArray(notificationOutbox.id, ids))
      .orderBy(asc(notificationOutbox.id));
  });
}

// ---------------------------------------------------------------- kirim

async function deliver(item: Claimed): Promise<string | null> {
  const db = getDb();
  switch (item.channel) {
    case "email": {
      const [suppressed] = await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, item.email)).limit(1);
      if (suppressed) throw new SkipNotification(`Alamat diblokir: ${suppressed.reason}`);
      const { providerMessageId } = await sendEmail({
        to: item.email,
        content: await emailContent(item),
        idempotencyKey: item.idempotencyKey,
      });
      return providerMessageId;
    }
    case "telegram": {
      const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.memberId, item.memberId)).limit(1);
      if (!link) throw new SkipNotification("Telegram belum tertaut");
      try {
        await sendTelegramMessage(link.chatId, telegramContent(item));
      } catch (err) {
        if (err instanceof TelegramSendError && err.gone) {
          await db.delete(telegramLinks).where(eq(telegramLinks.memberId, item.memberId));
          throw new SkipNotification("Bot diblokir; tautan Telegram diputus");
        }
        throw err;
      }
      return null;
    }
    case "push": {
      const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.memberId, item.memberId));
      if (subs.length === 0) throw new SkipNotification("Tidak ada perangkat terdaftar");
      const content = pushContent(item);
      let delivered = 0;
      for (const sub of subs) {
        if ((await sendPush(sub, content)) === "gone") {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          delivered++;
        }
      }
      if (delivered === 0) throw new SkipNotification("Semua langganan perangkat kedaluwarsa");
      return null;
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof PermanentFailure) return false;
  if (err instanceof EmailSendError || err instanceof TelegramSendError) return err.retryable;
  return true;
}

async function processChannel(channel: Channel, now: Date, result: WorkerResult) {
  const db = getDb();
  for (const item of await claim(channel, now)) {
    const done = (values: Partial<typeof notificationOutbox.$inferInsert>) =>
      db.update(notificationOutbox).set(values).where(eq(notificationOutbox.id, item.id));
    try {
      if (item.memberStatus !== "aktif") throw new SkipNotification("Anggota tidak aktif");
      if (isExpired(item.payload, new Date())) throw new SkipNotification("Kedaluwarsa");
      const providerMessageId = await deliver(item);
      await done({ status: "sent", sentAt: new Date(), providerMessageId, lastError: null });
      result.sent++;
    } catch (err) {
      if (err instanceof SkipNotification) {
        await done({ status: "skipped", sentAt: null, lastError: err.message });
        result.skipped++;
        continue;
      }
      const attempts = item.attempts + 1;
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      if (isRetryable(err) && attempts < MAX_ATTEMPTS) {
        await done({
          status: "queued",
          attempts,
          sentAt: null,
          claimedAt: null,
          scheduledAt: new Date(Date.now() + retryDelayMs(attempts)),
          lastError: message,
        });
        result.retried++;
      } else {
        await done({ status: "failed", attempts, sentAt: null, lastError: message });
        result.failed++;
      }
    }
  }
}

export async function processOutbox(now = new Date(), channels: Channel[] = ["email", "telegram", "push"]) {
  await resetStaleClaims(now);
  const results: Record<Channel, WorkerResult> = {
    email: { sent: 0, skipped: 0, retried: 0, failed: 0 },
    telegram: { sent: 0, skipped: 0, retried: 0, failed: 0 },
    push: { sent: 0, skipped: 0, retried: 0, failed: 0 },
  };
  for (const channel of channels) await processChannel(channel, now, results[channel]);
  return results;
}
