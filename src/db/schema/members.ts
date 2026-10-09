import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { divisions } from "./organization";

export const memberStatus = pgEnum("member_status", [
  "aktif",
  "nonaktif",
  "alumni",
]);

export const cardStatus = pgEnum("card_status", ["active", "blocked"]);

export const members = pgTable(
  "members",
  {
    // Sama dengan auth.users.id. Tidak cascade: data kas dan presensi harus tetap ada.
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id),
    // Permanen: tidak boleh diubah atau dipakai ulang (aturan wajib 7).
    memberCode: varchar("member_code", { length: 10 }).notNull().unique(),
    fullName: text("full_name").notNull(),
    // Disimpan huruf kecil oleh kode server.
    email: text("email").notNull().unique(),
    // Format +628xxxxxxxxx, lihat src/lib/members/phone.ts.
    phone: text("phone").notNull().unique(),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id),
    batch: varchar("batch", { length: 2 }).notNull(),
    status: memberStatus("status").notNull().default("aktif"),
    cardVersion: integer("card_version").notNull().default(1),
    legacyCardAllowed: boolean("legacy_card_allowed").notNull().default(true),
    cardStatus: cardStatus("card_status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("members_code_format", sql`${t.memberCode} ~ '^ISC[0-9]{7}$'`),
    check("members_phone_format", sql`${t.phone} ~ '^\\+628[0-9]{8,11}$'`),
    check("members_email_lowercase", sql`${t.email} = lower(${t.email})`),
    check("members_batch_format", sql`${t.batch} ~ '^[0-9]{2}$'`),
    check("members_card_version_positive", sql`${t.cardVersion} >= 1`),
    index("members_division_idx").on(t.divisionId),
  ],
).enableRLS();

// Counter nomor urut kode ID per batch (docs/ARSITEKTUR.md bagian 6). Baris
// dikunci (SELECT ... FOR UPDATE) setiap kali kode baru diterbitkan.
export const memberCodeCounters = pgTable(
  "member_code_counters",
  {
    batch: varchar("batch", { length: 2 }).primaryKey(),
    lastSeq: integer("last_seq").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("member_code_counters_batch_format", sql`${t.batch} ~ '^[0-9]{2}$'`),
    check(
      "member_code_counters_last_seq_range",
      sql`${t.lastSeq} between 0 and 999`,
    ),
  ],
).enableRLS();

export const importStatus = pgEnum("import_status", ["completed", "failed"]);

// Riwayat impor anggota, termasuk percobaan yang gagal.
export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdBy: uuid("created_by").references(() => members.id),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    totalRows: integer("total_rows").notNull(),
    importedRows: integer("imported_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    status: importStatus("status").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("import_batches_created_at_idx").on(t.createdAt)],
).enableRLS();

export const dataRequestKind = pgEnum("data_request_kind", [
  "deletion",
  "correction",
]);
export const dataRequestStatus = pgEnum("data_request_status", [
  "pending",
  "done",
  "rejected",
]);

// Permintaan penghapusan atau koreksi data pribadi (selaras UU PDP).
export const dataRequests = pgTable(
  "data_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    kind: dataRequestKind("kind").notNull(),
    reason: text("reason").notNull(),
    status: dataRequestStatus("status").notNull().default("pending"),
    handledBy: uuid("handled_by").references(() => members.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("data_requests_status_idx").on(t.status, t.createdAt),
    index("data_requests_member_idx").on(t.memberId),
  ],
).enableRLS();
