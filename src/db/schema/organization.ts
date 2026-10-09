import { sql } from "drizzle-orm";
import {
  check,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { members } from "./members";

// Peran yang diberikan secara eksplisit. Setiap anggota otomatis berperan
// "anggota", jadi peran itu tidak disimpan di tabel ini.
export const grantedRole = pgEnum("granted_role", [
  "admin",
  "koordinator",
  "bendahara",
]);

export const divisions = pgTable(
  "divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("divisions_slug_format", sql`${t.slug} ~ '^[a-z0-9-]+$'`)],
).enableRLS();

export const memberRoles = pgTable(
  "member_roles",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: grantedRole("role").notNull(),
    grantedBy: uuid("granted_by").references(() => members.id),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.role] })],
).enableRLS();

export const divisionCoordinators = pgTable(
  "division_coordinators",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id")
      .notNull()
      .references(() => divisions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.divisionId] })],
).enableRLS();
