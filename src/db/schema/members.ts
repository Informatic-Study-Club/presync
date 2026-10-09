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
