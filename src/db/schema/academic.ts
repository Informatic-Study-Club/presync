import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { members } from "./members";
import { divisions } from "./organization";

// Kalender akademik, kelas, dan sesi (docs/ARSITEKTUR.md bagian 8).
// Tanggal tanpa jam memakai `date` (kalender Asia/Jakarta); waktu sesi
// memakai timestamptz (aturan wajib 10).

export const academicYears = pgTable(
  "academic_years",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("academic_years_range", sql`${t.endsOn} > ${t.startsOn}`)],
).enableRLS();

export const terms = pgTable(
  "terms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    name: text("name").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("terms_range", sql`${t.endsOn} > ${t.startsOn}`),
    index("terms_year_idx").on(t.academicYearId),
  ],
).enableRLS();

export const calendarEventKind = pgEnum("calendar_event_kind", [
  "holiday",
  "exam",
  "activity",
  "deadline",
]);

// Event sepanjang hari. Event "holiday" membuat sesi rutin Kamis dilewati.
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    kind: calendarEventKind("kind").notNull(),
    startsOn: date("starts_on").notNull(),
    /** Inklusif. Sama dengan startsOn untuk event satu hari. */
    endsOn: date("ends_on").notNull(),
    /** Kosong = berlaku untuk semua divisi. */
    divisionId: uuid("division_id").references(() => divisions.id),
    description: text("description"),
    createdBy: uuid("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("calendar_events_range", sql`${t.endsOn} >= ${t.startsOn}`),
    index("calendar_events_range_idx").on(t.startsOn, t.endsOn),
  ],
).enableRLS();

export const sessionMode = pgEnum("session_mode", ["offline", "online", "hybrid"]);

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id),
    name: text("name").notNull(),
    description: text("description"),
    plannedSessions: integer("planned_sessions").notNull().default(7),
    // Kelas rutin selalu hari Kamis; jam dan durasi default bisa diubah per sesi.
    defaultStartTime: time("default_start_time").notNull(),
    defaultDurationMinutes: integer("default_duration_minutes").notNull().default(120),
    defaultMode: sessionMode("default_mode").notNull().default("offline"),
    defaultLocation: text("default_location"),
    defaultMeetingUrl: text("default_meeting_url"),
    createdBy: uuid("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("classes_planned_sessions_range", sql`${t.plannedSessions} between 1 and 52`),
    check("classes_duration_range", sql`${t.defaultDurationMinutes} between 15 and 720`),
    index("classes_division_idx").on(t.divisionId),
    index("classes_term_idx").on(t.termId),
  ],
).enableRLS();

export const enrollments = pgTable(
  "enrollments",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    enrolledBy: uuid("enrolled_by").references(() => members.id),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.classId, t.memberId] }),
    index("enrollments_member_idx").on(t.memberId),
  ],
).enableRLS();

export const sessionKind = pgEnum("session_kind", ["regular", "extra", "activity"]);
// scheduled = dijadwalkan, done = selesai, off = libur/dibatalkan.
export const sessionStatus = pgEnum("session_status", ["scheduled", "done", "off"]);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Kosong untuk kegiatan yang tidak terikat kelas. */
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    /** Kosong = kegiatan untuk semua divisi. */
    divisionId: uuid("division_id").references(() => divisions.id),
    kind: sessionKind("kind").notNull(),
    mode: sessionMode("mode").notNull(),
    status: sessionStatus("status").notNull().default("scheduled"),
    title: text("title").notNull(),
    /** Pertemuan ke-n untuk sesi rutin. */
    sequence: integer("sequence"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    checkinCode: text("checkin_code"),
    offReason: text("off_reason"),
    createdBy: uuid("created_by").references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("sessions_range", sql`${t.endsAt} > ${t.startsAt}`),
    check("sessions_class_required", sql`${t.kind} = 'activity' or ${t.classId} is not null`),
    check(
      "sessions_mode_fields",
      sql`(${t.mode} = 'online' or ${t.location} is not null) and (${t.mode} = 'offline' or ${t.meetingUrl} is not null)`,
    ),
    check("sessions_off_reason", sql`${t.status} <> 'off' or ${t.offReason} is not null`),
    // Kode check-in online unik selama masih diisi (NULL boleh berulang).
    uniqueIndex("sessions_checkin_code_unique").on(t.checkinCode),
    index("sessions_class_idx").on(t.classId, t.startsAt),
    index("sessions_starts_at_idx").on(t.startsAt),
  ],
).enableRLS();

// Token feed .ics per anggota (Google/Apple Calendar tidak mengirim cookie).
// Yang disimpan hanya hash SHA-256; token asli ditampilkan sekali.
export const calendarFeedTokens = pgTable(
  "calendar_feed_tokens",
  {
    memberId: uuid("member_id")
      .primaryKey()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
).enableRLS();
