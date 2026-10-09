import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { members } from "./members";

export const notificationChannel = pgEnum("notification_channel", [
  "email",
  "telegram",
  "push",
]);

// "sending" = sudah diklaim worker dan sedang dikirim.
export const notificationStatus = pgEnum("notification_status", [
  "queued",
  "sending",
  "sent",
  "failed",
  "skipped",
]);

// Semua notifikasi lewat tabel ini (aturan wajib 13); worker yang mengirim
// lewat adapter kanal. Lihat docs/ARSITEKTUR.md bagian 12.
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    // Mencegah kirim ganda saat retry; juga dikirim ke provider.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    channel: notificationChannel("channel").notNull(),
    template: text("template").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: notificationStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notification_outbox_queue_idx").on(t.status, t.scheduledAt),
    index("notification_outbox_sent_idx").on(t.channel, t.sentAt),
    index("notification_outbox_member_idx").on(t.memberId),
  ],
).enableRLS();
