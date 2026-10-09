import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { enrollments, memberArrears, members, sessions } from "@/db/schema";
import { toJakarta } from "@/lib/academic/time";
import { serverEnv } from "@/lib/env";
import { formatRupiah } from "@/lib/finance/money";
import { notifyMembers } from "./dispatch";
import { isDigestDay, type ReminderKind, reminderKey, selectSessionsForReminder } from "./reminders";
import type { ArrearsPayload, ReminderPayload } from "./templates";

const HOUR = 60 * 60 * 1000;

/** Antrekan pengingat sesi untuk anggota yang terdaftar/berada dalam cakupan. */
export async function enqueueSessionReminders(kind: ReminderKind, now = new Date()) {
  const db = getDb();
  const candidates = await db
    .select({
      id: sessions.id,
      status: sessions.status,
      startsAt: sessions.startsAt,
      title: sessions.title,
      kind: sessions.kind,
      classId: sessions.classId,
      divisionId: sessions.divisionId,
      location: sessions.location,
      meetingUrl: sessions.meetingUrl,
    })
    .from(sessions)
    .where(and(eq(sessions.status, "scheduled"), gte(sessions.startsAt, now), lte(sessions.startsAt, new Date(now.getTime() + 48 * HOUR))));

  const selected = selectSessionsForReminder(candidates, kind, now);
  const appUrl = serverEnv().APP_URL;
  let total = 0;

  for (const s of selected) {
    const recipients = s.classId
      ? await db
          .select({ id: members.id })
          .from(enrollments)
          .innerJoin(members, eq(enrollments.memberId, members.id))
          .where(and(eq(enrollments.classId, s.classId), eq(members.status, "aktif")))
      : await db
          .select({ id: members.id })
          .from(members)
          // Kegiatan: anggota aktif divisinya, atau semua anggota aktif bila tanpa divisi.
          .where(s.divisionId ? and(eq(members.status, "aktif"), eq(members.divisionId, s.divisionId)) : eq(members.status, "aktif"));

    const payload: ReminderPayload & { expiresAt: string } = {
      kind,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      location: s.location,
      meetingUrl: s.meetingUrl,
      url: `${appUrl}/kalender`,
      expiresAt: s.startsAt.toISOString(),
    };
    const counts = await notifyMembers(db, {
      memberIds: recipients.map((r) => r.id),
      category: "session_reminder",
      template: "session_reminder",
      key: (memberId) => reminderKey(kind, s.id, memberId),
      payload: () => payload,
    });
    total += counts.email + counts.telegram + counts.push;
  }
  return { sessions: selected.length, notifications: total };
}

/** Digest tunggakan mingguan (Senin WIB) untuk anggota yang menunggak. */
export async function enqueueArrearsDigest(now = new Date()) {
  if (!isDigestDay(now)) return { skipped: true, notifications: 0 };
  const db = getDb();
  const rows = await db.select().from(memberArrears);
  const byMember = new Map(rows.map((r) => [r.memberId, r]));
  const week = toJakarta(now).date;
  const appUrl = serverEnv().APP_URL;

  const counts = await notifyMembers(db, {
    memberIds: rows.map((r) => r.memberId),
    category: "finance",
    template: "arrears_digest",
    key: (memberId) => `arrears:${week}:${memberId}`,
    payload: (memberId): ArrearsPayload => {
      const r = byMember.get(memberId);
      return { count: r?.invoiceCount ?? 0, totalLabel: formatRupiah(r?.totalAmount ?? 0), url: `${appUrl}/kas` };
    },
  });
  return { skipped: false, notifications: counts.email + counts.telegram + counts.push };
}
