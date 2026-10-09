import type { Db, Tx } from "@/db";
import { notificationOutbox } from "@/db/schema";

export type OutboxEntry = {
  memberId: string;
  channel: "email" | "telegram" | "push";
  template: string;
  /** Unik per notifikasi; entri dengan kunci yang sama diabaikan. */
  idempotencyKey: string;
  payload?: Record<string, unknown>;
  scheduledAt?: Date;
};

/**
 * Masukkan notifikasi ke outbox. Panggil di dalam transaksi aksi terkait
 * supaya notifikasi hanya terkirim bila aksinya tersimpan.
 */
export async function enqueueNotifications(executor: Db | Tx, entries: OutboxEntry[]) {
  if (entries.length === 0) return;
  await executor
    .insert(notificationOutbox)
    .values(
      entries.map((e) => ({
        memberId: e.memberId,
        channel: e.channel,
        template: e.template,
        idempotencyKey: e.idempotencyKey,
        payload: e.payload ?? {},
        scheduledAt: e.scheduledAt ?? new Date(),
      })),
    )
    .onConflictDoNothing({ target: notificationOutbox.idempotencyKey });
}
