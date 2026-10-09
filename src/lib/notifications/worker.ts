import "server-only";
import { and, asc, count, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { members, notificationOutbox } from "@/db/schema";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EmailSendError, sendEmail } from "./email-adapter";
import {
  jakartaDayStart,
  MAX_ATTEMPTS,
  retryDelayMs,
  STALE_CLAIM_MS,
  selectEmailBatch,
} from "./schedule";
import { activationEmail, type EmailContent } from "./templates";

// Worker outbox, dijalankan oleh cron harian (src/app/api/cron/harian).
// Tahap ini baru menangani kanal email; Telegram dan web push di tahap 6.

export type WorkerResult = { sent: number; skipped: number; retried: number; failed: number };

type Claimed = {
  id: number;
  template: string;
  attempts: number;
  idempotencyKey: string;
  email: string;
  fullName: string;
  memberStatus: "aktif" | "nonaktif" | "alumni";
  memberId: string;
};

class SkipNotification extends Error {}

async function buildEmail(item: Claimed): Promise<EmailContent> {
  switch (item.template) {
    case "activation": {
      const admin = createSupabaseAdminClient();
      const { data: user } = await admin.auth.admin.getUserById(item.memberId);
      if (user.user?.last_sign_in_at) throw new SkipNotification("Akun sudah aktif");
      // Tautan dibuat saat kirim, karena token Supabase cepat kedaluwarsa.
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: item.email,
      });
      if (error || !data.properties?.hashed_token) {
        throw new EmailSendError(`Gagal membuat tautan aktivasi: ${error?.message ?? "-"}`, true);
      }
      const link = new URL("/auth/confirm", serverEnv().APP_URL);
      link.searchParams.set("token_hash", data.properties.hashed_token);
      link.searchParams.set("type", "recovery");
      link.searchParams.set("next", "/atur-password");
      return activationEmail({ name: item.fullName, link: link.toString() });
    }
    default:
      throw new EmailSendError(`Template tidak dikenal: ${item.template}`, false);
  }
}

async function claimEmails(now: Date): Promise<Claimed[]> {
  const db = getDb();

  // Klaim yang macet (worker sebelumnya terhenti) diantrekan lagi. Kirim
  // ganda dicegah Idempotency-Key di Resend.
  await db
    .update(notificationOutbox)
    .set({ status: "queued", claimedAt: null, sentAt: null })
    .where(
      and(
        eq(notificationOutbox.status, "sending"),
        lt(notificationOutbox.claimedAt, new Date(now.getTime() - STALE_CLAIM_MS)),
      ),
    );

  return db.transaction(async (tx) => {
    const dayStart = jakartaDayStart(now);
    const sentToday = and(
      eq(notificationOutbox.channel, "email"),
      inArray(notificationOutbox.status, ["sent", "sending"]),
      gte(notificationOutbox.sentAt, dayStart),
    );
    const [total] = await tx.select({ n: count() }).from(notificationOutbox).where(sentToday);
    const [activation] = await tx
      .select({ n: count() })
      .from(notificationOutbox)
      .where(and(sentToday, eq(notificationOutbox.template, "activation")));

    const queued = await tx
      .select({ id: notificationOutbox.id, template: notificationOutbox.template })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.channel, "email"),
          eq(notificationOutbox.status, "queued"),
          lte(notificationOutbox.scheduledAt, now),
        ),
      )
      .orderBy(asc(notificationOutbox.scheduledAt), asc(notificationOutbox.id))
      .limit(500)
      .for("update", { skipLocked: true });

    const ids = selectEmailBatch(queued, {
      sentToday: total?.n ?? 0,
      activationSentToday: activation?.n ?? 0,
    });
    if (ids.length === 0) return [];

    // sent_at diisi saat klaim agar kuota langsung terhitung; diperbarui
    // lagi saat benar-benar terkirim.
    await tx
      .update(notificationOutbox)
      .set({ status: "sending", claimedAt: now, sentAt: now })
      .where(inArray(notificationOutbox.id, ids));

    return tx
      .select({
        id: notificationOutbox.id,
        template: notificationOutbox.template,
        attempts: notificationOutbox.attempts,
        idempotencyKey: notificationOutbox.idempotencyKey,
        email: members.email,
        fullName: members.fullName,
        memberStatus: members.status,
        memberId: members.id,
      })
      .from(notificationOutbox)
      .innerJoin(members, eq(notificationOutbox.memberId, members.id))
      .where(inArray(notificationOutbox.id, ids))
      .orderBy(asc(notificationOutbox.id));
  });
}

export async function processEmailOutbox(now = new Date()): Promise<WorkerResult> {
  const db = getDb();
  const result: WorkerResult = { sent: 0, skipped: 0, retried: 0, failed: 0 };

  for (const item of await claimEmails(now)) {
    const done = (values: Partial<typeof notificationOutbox.$inferInsert>) =>
      db.update(notificationOutbox).set(values).where(eq(notificationOutbox.id, item.id));

    try {
      if (item.memberStatus !== "aktif") throw new SkipNotification("Anggota tidak aktif");
      const content = await buildEmail(item);
      const { providerMessageId } = await sendEmail({
        to: item.email,
        content,
        idempotencyKey: item.idempotencyKey,
      });
      await done({ status: "sent", sentAt: new Date(), providerMessageId, lastError: null });
      result.sent++;
    } catch (err) {
      if (err instanceof SkipNotification) {
        await done({ status: "skipped", sentAt: null, lastError: err.message });
        result.skipped++;
        continue;
      }
      const attempts = item.attempts + 1;
      const retryable = !(err instanceof EmailSendError) || err.retryable;
      const message = err instanceof Error ? err.message : String(err);
      if (retryable && attempts < MAX_ATTEMPTS) {
        await done({
          status: "queued",
          attempts,
          sentAt: null,
          claimedAt: null,
          scheduledAt: new Date(Date.now() + retryDelayMs(attempts)),
          lastError: message.slice(0, 500),
        });
        result.retried++;
      } else {
        await done({ status: "failed", attempts, sentAt: null, lastError: message.slice(0, 500) });
        result.failed++;
      }
    }
  }
  return result;
}
