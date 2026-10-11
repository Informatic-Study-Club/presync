import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  academicYears,
  calendarEvents,
  calendarFeedTokens,
  classes,
  divisions,
  enrollments,
  members,
  sessions,
  terms,
} from "@/db/schema";
import { can, type SessionUser } from "@/lib/authz";
import type { Session } from "@/lib/auth/session";
import type { DateRange } from "./schedule";
import { canSeeCalendarEvent, canSeeSession, type Viewer } from "./visibility";

export async function loadViewer(session: Pick<Session, "user" | "member">): Promise<Viewer> {
  const rows = await getDb()
    .select({ classId: enrollments.classId })
    .from(enrollments)
    .where(eq(enrollments.memberId, session.user.id));
  return {
    user: session.user,
    divisionId: session.member.divisionId,
    enrolledClassIds: new Set(rows.map((r) => r.classId)),
  };
}

// ---------------------------------------------------------------- kalender akademik

export async function listAcademicYears() {
  return getDb().select().from(academicYears).orderBy(desc(academicYears.startsOn));
}

export async function listTerms() {
  return getDb()
    .select({
      id: terms.id,
      name: terms.name,
      startsOn: terms.startsOn,
      endsOn: terms.endsOn,
      yearName: academicYears.name,
    })
    .from(terms)
    .innerJoin(academicYears, eq(terms.academicYearId, academicYears.id))
    .orderBy(desc(terms.startsOn));
}

export async function listCalendarEvents(limit = 200) {
  return getDb()
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      kind: calendarEvents.kind,
      startsOn: calendarEvents.startsOn,
      endsOn: calendarEvents.endsOn,
      divisionId: calendarEvents.divisionId,
      divisionName: divisions.name,
      description: calendarEvents.description,
    })
    .from(calendarEvents)
    .leftJoin(divisions, eq(calendarEvents.divisionId, divisions.id))
    .orderBy(desc(calendarEvents.startsOn))
    .limit(limit);
}

/** Tanggal libur yang berlaku untuk divisi tertentu dalam rentang. */
export async function holidaysFor(divisionId: string, range: DateRange): Promise<DateRange[]> {
  return getDb()
    .select({ startsOn: calendarEvents.startsOn, endsOn: calendarEvents.endsOn })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.kind, "holiday"),
        or(isNull(calendarEvents.divisionId), eq(calendarEvents.divisionId, divisionId)),
        lte(calendarEvents.startsOn, range.endsOn),
        gte(calendarEvents.endsOn, range.startsOn),
      ),
    );
}

// ---------------------------------------------------------------- agenda

export type AgendaSession = {
  id: string;
  title: string;
  kind: "regular" | "extra" | "activity";
  mode: "offline" | "online" | "hybrid";
  status: "scheduled" | "done" | "off";
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  meetingUrl: string | null;
  offReason: string | null;
  classId: string | null;
  divisionId: string | null;
  updatedAt: Date;
};

export type AgendaEvent = {
  id: string;
  title: string;
  kind: "holiday" | "exam" | "activity" | "deadline";
  startsOn: string;
  endsOn: string;
  description: string | null;
  divisionId: string | null;
};

/** Sesi dan event kalender yang boleh dilihat viewer dalam rentang waktu. */
export async function agendaFor(viewer: Viewer, from: Date, to: Date) {
  const db = getDb();
  const [sessionRows, eventRows] = await Promise.all([
    db
      .select({
        id: sessions.id,
        title: sessions.title,
        kind: sessions.kind,
        mode: sessions.mode,
        status: sessions.status,
        startsAt: sessions.startsAt,
        endsAt: sessions.endsAt,
        location: sessions.location,
        meetingUrl: sessions.meetingUrl,
        offReason: sessions.offReason,
        classId: sessions.classId,
        divisionId: sessions.divisionId,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(and(gte(sessions.endsAt, from), lte(sessions.startsAt, to)))
      .orderBy(asc(sessions.startsAt)),
    db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        kind: calendarEvents.kind,
        startsOn: calendarEvents.startsOn,
        endsOn: calendarEvents.endsOn,
        description: calendarEvents.description,
        divisionId: calendarEvents.divisionId,
      })
      .from(calendarEvents)
      .where(
        and(
          lte(calendarEvents.startsOn, to.toISOString().slice(0, 10)),
          gte(calendarEvents.endsOn, from.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(calendarEvents.startsOn)),
  ]);

  return {
    sessions: sessionRows.filter((s) => canSeeSession(viewer, s)) as AgendaSession[],
    events: eventRows.filter((e) => canSeeCalendarEvent(viewer, e)) as AgendaEvent[],
  };
}

// ---------------------------------------------------------------- kelas

export async function managedDivisions(user: SessionUser) {
  const all = await getDb()
    .select({ id: divisions.id, name: divisions.name })
    .from(divisions)
    .orderBy(asc(divisions.name));
  return all.filter((d) => can(user, "class.manage", { divisionId: d.id }));
}

export async function listClasses(viewer: Viewer, options: { includeArchived?: boolean } = {}) {
  const db = getDb();
  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      divisionId: classes.divisionId,
      divisionName: divisions.name,
      termName: terms.name,
      yearName: academicYears.name,
      plannedSessions: classes.plannedSessions,
      archivedAt: classes.archivedAt,
    })
    .from(classes)
    .innerJoin(divisions, eq(classes.divisionId, divisions.id))
    .innerJoin(terms, eq(classes.termId, terms.id))
    .innerJoin(academicYears, eq(terms.academicYearId, academicYears.id))
    .where(options.includeArchived ? undefined : isNull(classes.archivedAt))
    .orderBy(desc(terms.startsOn), asc(divisions.name), asc(classes.name));

  const visible = rows.filter(
    (c) => can(viewer.user, "class.manage", { divisionId: c.divisionId }) || viewer.enrolledClassIds.has(c.id),
  );
  if (visible.length === 0) return [];
  const ids = visible.map((c) => c.id);

  const [doneCounts, enrolledCounts] = await Promise.all([
    db
      .select({ classId: sessions.classId, n: count() })
      .from(sessions)
      .where(and(inArray(sessions.classId, ids), eq(sessions.kind, "regular"), eq(sessions.status, "done")))
      .groupBy(sessions.classId),
    db
      .select({ classId: enrollments.classId, n: count() })
      .from(enrollments)
      .where(inArray(enrollments.classId, ids))
      .groupBy(enrollments.classId),
  ]);
  const done = new Map(doneCounts.map((r) => [r.classId, r.n]));
  const enrolled = new Map(enrolledCounts.map((r) => [r.classId, r.n]));

  return visible.map((c) => ({ ...c, doneSessions: done.get(c.id) ?? 0, enrolled: enrolled.get(c.id) ?? 0 }));
}

export async function getClassDetail(viewer: Viewer, classId: string) {
  const db = getDb();
  const [cls] = await db
    .select({
      id: classes.id,
      name: classes.name,
      description: classes.description,
      divisionId: classes.divisionId,
      divisionName: divisions.name,
      termId: classes.termId,
      termName: terms.name,
      termStartsOn: terms.startsOn,
      termEndsOn: terms.endsOn,
      plannedSessions: classes.plannedSessions,
      defaultStartTime: classes.defaultStartTime,
      defaultDurationMinutes: classes.defaultDurationMinutes,
      defaultMode: classes.defaultMode,
      defaultLocation: classes.defaultLocation,
      defaultMeetingUrl: classes.defaultMeetingUrl,
      archivedAt: classes.archivedAt,
    })
    .from(classes)
    .innerJoin(divisions, eq(classes.divisionId, divisions.id))
    .innerJoin(terms, eq(classes.termId, terms.id))
    .where(eq(classes.id, classId))
    .limit(1);
  if (!cls) return null;

  const canManage = can(viewer.user, "class.manage", { divisionId: cls.divisionId });
  if (!canManage && !viewer.enrolledClassIds.has(cls.id)) return null;

  const sessionRows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.classId, cls.id))
    .orderBy(asc(sessions.startsAt));

  const enrolledRows = await db
    .select({ id: members.id, fullName: members.fullName, memberCode: members.memberCode })
    .from(enrollments)
    .innerJoin(members, eq(enrollments.memberId, members.id))
    .where(eq(enrollments.classId, cls.id))
    .orderBy(asc(members.memberCode));

  const candidates = canManage
    ? await db
        .select({ id: members.id, fullName: members.fullName, memberCode: members.memberCode })
        .from(members)
        .where(
          and(
            eq(members.divisionId, cls.divisionId),
            eq(members.status, "aktif"),
            enrolledRows.length > 0 ? notInArray(members.id, enrolledRows.map((m) => m.id)) : sql`true`,
          ),
        )
        .orderBy(asc(members.memberCode))
    : [];

  return { ...cls, canManage, sessions: sessionRows, enrolled: canManage ? enrolledRows : [], candidates };
}

export async function listActivities(viewer: Viewer, from: Date) {
  const rows = await getDb()
    .select({
      id: sessions.id,
      title: sessions.title,
      kind: sessions.kind,
      classId: sessions.classId,
      divisionId: sessions.divisionId,
      divisionName: divisions.name,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      status: sessions.status,
      mode: sessions.mode,
      location: sessions.location,
      meetingUrl: sessions.meetingUrl,
    })
    .from(sessions)
    .leftJoin(divisions, eq(sessions.divisionId, divisions.id))
    .where(and(eq(sessions.kind, "activity"), gte(sessions.endsAt, from)))
    .orderBy(asc(sessions.startsAt))
    .limit(100);
  return rows.filter((s) => canSeeSession(viewer, s));
}

export async function hasFeedToken(memberId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ memberId: calendarFeedTokens.memberId })
    .from(calendarFeedTokens)
    .where(eq(calendarFeedTokens.memberId, memberId))
    .limit(1);
  return Boolean(row);
}
