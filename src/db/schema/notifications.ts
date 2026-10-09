import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
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

// Kategori notifikasi yang bisa diatur anggota. Email akun (aktivasi, reset
// password) selalu dikirim dan tidak masuk sini.
export const notificationCategory = pgEnum("notification_category", ["session_reminder", "finance"]);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    category: notificationCategory("category").notNull(),
    email: boolean("email").notNull(),
    telegram: boolean("telegram").notNull(),
    push: boolean("push").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.category] })],
).enableRLS();

export const telegramLinks = pgTable(
  "telegram_links",
  {
    memberId: uuid("member_id")
      .primaryKey()
      .references(() => members.id, { onDelete: "cascade" }),
    chatId: bigint("chat_id", { mode: "number" }).notNull().unique(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
).enableRLS();

// Token penautan sekali pakai (t.me/<bot>?start=<token>). Hanya hash disimpan.
export const telegramLinkTokens = pgTable(
  "telegram_link_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [index("telegram_link_tokens_member_idx").on(t.memberId)],
).enableRLS();

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_member_idx").on(t.memberId)],
).enableRLS();

// Alamat yang bounce atau melaporkan spam (webhook Resend): tidak dikirimi lagi.
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    email: text("email").primaryKey(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
).enableRLS();
