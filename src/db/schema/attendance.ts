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
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sessions } from "./academic";
import { members } from "./members";
import { divisions } from "./organization";

// Presensi (docs/ARSITEKTUR.md bagian 9).

export const attendanceStatus = pgEnum("attendance_status", [
  "hadir",
  "izin",
  "sakit",
  "tidak_hadir",
]);

export const attendanceMethod = pgEnum("attendance_method", [
  "scan_barcode",
  "scan_qr",
  "manual_entry",
  "self_checkin",
  "manual",
]);

export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    status: attendanceStatus("status").notNull(),
    method: attendanceMethod("method").notNull(),
    /** Pencatat; sama dengan member_id untuk check-in mandiri. */
    recordedBy: uuid("recorded_by").references(() => members.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    /** Penanda perangkat pemindai, untuk deteksi kejanggalan. */
    deviceId: text("device_id"),
    note: text("note"),
  },
  (t) => [
    unique("attendance_session_member_unique").on(t.sessionId, t.memberId),
    // Absen manual wajib catatan (aturan wajib 9 dan ARSITEKTUR bagian 9).
    check("attendance_manual_note", sql`${t.method} <> 'manual' or ${t.note} is not null`),
    index("attendance_member_idx").on(t.memberId),
    index("attendance_session_recorded_idx").on(t.sessionId, t.recordedAt),
  ],
).enableRLS();

// Arsip ringkasan kehadiran dari Google Sheets: riwayat lama tidak bertanggal,
// jadi disimpan sebagai jumlah per anggota per program (ARSITEKTUR bagian 7).
export const attendanceArchives = pgTable(
  "attendance_archives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id),
    /** Nama program, misalnya "Web Development 2026 (Google Sheets)". */
    program: text("program").notNull(),
    hadir: integer("hadir").notNull().default(0),
    izin: integer("izin").notNull().default(0),
    sakit: integer("sakit").notNull().default(0),
    tidakHadir: integer("tidak_hadir").notNull().default(0),
    /** Ada pertemuan yang belum terisi; jangan dipakai di laporan sebelum dicek. */
    needsVerification: boolean("needs_verification").notNull().default(false),
    note: text("note"),
    importedBy: uuid("imported_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("attendance_archives_member_program_unique").on(t.memberId, t.program),
    check(
      "attendance_archives_counts",
      sql`${t.hadir} >= 0 and ${t.izin} >= 0 and ${t.sakit} >= 0 and ${t.tidakHadir} >= 0`,
    ),
  ],
).enableRLS();
