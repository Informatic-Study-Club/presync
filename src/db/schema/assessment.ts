import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { classes } from "./academic";
import { members } from "./members";

// Penilaian dan sertifikat (docs/ARSITEKTUR.md bagian 10).

export const assessmentKind = pgEnum("assessment_kind", ["score", "done_flag", "attendance"]);

export const assessmentComponents = pgTable(
  "assessment_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    /** Kunci stabil untuk aturan sertifikat, misalnya "tugas_kelompok". */
    key: text("key").notNull(),
    name: text("name").notNull(),
    kind: assessmentKind("kind").notNull(),
    /** Persen; total per kelas harus 100 (diperiksa kode). */
    weight: integer("weight").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("assessment_components_class_key_unique").on(t.classId, t.key),
    check("assessment_components_weight_range", sql`${t.weight} between 0 and 100`),
    check("assessment_components_key_format", sql`${t.key} ~ '^[a-z0-9_]{2,40}$'`),
  ],
).enableRLS();

export const assessmentScores = pgTable(
  "assessment_scores",
  {
    componentId: uuid("component_id")
      .notNull()
      .references(() => assessmentComponents.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    /** Untuk jenis "score": 0-100. */
    value: numeric("value", { precision: 5, scale: 2, mode: "number" }),
    /** Untuk jenis "done_flag". */
    done: boolean("done"),
    updatedBy: uuid("updated_by").references(() => members.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.componentId, t.memberId] }),
    check("assessment_scores_value_range", sql`${t.value} is null or (${t.value} >= 0 and ${t.value} <= 100)`),
  ],
).enableRLS();

// Aturan sertifikat per kelas; isi JSON divalidasi Zod (src/lib/assessment/rules.ts).
export const certificateRules = pgTable(
  "certificate_rules",
  {
    classId: uuid("class_id")
      .primaryKey()
      .references(() => classes.id, { onDelete: "cascade" }),
    rule: jsonb("rule").$type<Record<string, unknown>>().notNull(),
    updatedBy: uuid("updated_by").references(() => members.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
).enableRLS();

export const certificateStatus = pgEnum("certificate_status", ["eligible", "not_eligible"]);

// Penimpaan status oleh koordinator, wajib catatan dan tercatat di audit_log.
export const certificateOverrides = pgTable(
  "certificate_overrides",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    status: certificateStatus("status").notNull(),
    note: text("note").notNull(),
    overriddenBy: uuid("overridden_by").references(() => members.id),
    overriddenAt: timestamp("overridden_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.memberId] })],
).enableRLS();
