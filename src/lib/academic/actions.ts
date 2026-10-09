"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import {
  academicYears,
  calendarEvents,
  calendarFeedTokens,
  classes,
  enrollments,
  members,
  sessions,
  terms,
} from "@/db/schema";
import { can } from "@/lib/authz";
import { requireSession } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env";
import { id as t } from "@/messages/id";
import { hashFeedToken } from "./feed";
import { holidaysFor } from "./queries";
import { generateRegularSessions } from "./schedule";
import { addMinutes, isThursdayInJakarta, jakartaToUtc } from "./time";
import {
  academicYearSchema,
  activitySchema,
  calendarEventSchema,
  classSchema,
  extraSessionSchema,
  sessionStatusSchema,
  sessionUpdateSchema,
  termSchema,
} from "./validation";

export type ActionState = { error?: string; success?: string } | undefined;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? t.auth.invalidInput;
}

/** Terjemahkan pelanggaran constraint Postgres menjadi pesan untuk pengguna. */
function constraintMessage(err: unknown): string | null {
  const candidates = [err, (err as { cause?: unknown } | null)?.cause];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const code = "code" in c ? String(c.code) : "";
    const constraint = "constraint_name" in c ? String(c.constraint_name) : "";
    if (code === "23P01") return t.academic.errors.overlap;
    if (constraint === "sessions_regular_on_thursday") return t.academic.errors.notThursday;
    if (code === "23505") return t.academic.errors.duplicateName;
  }
  return null;
}

async function guard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    const message = constraintMessage(err);
    if (message) return { error: message };
    throw err;
  }
}

// ---------------------------------------------------------------- kalender akademik (admin)

async function requireCalendarManager() {
  const { user } = await requireSession();
  return can(user, "calendar.manage") ? user : null;
}

export async function createAcademicYearAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await requireCalendarManager())) return { error: t.errors.forbidden };
  const parsed = academicYearSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await guard(() => getDb().insert(academicYears).values(parsed.data));
  if (result && "error" in result) return result;
  revalidatePath("/kalender/kelola");
  return { success: t.academic.manage.saved };
}

export async function createTermAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await requireCalendarManager())) return { error: t.errors.forbidden };
  const parsed = termSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const [year] = await getDb()
    .select()
    .from(academicYears)
    .where(eq(academicYears.id, parsed.data.academicYearId))
    .limit(1);
  if (!year) return { error: t.errors.notFound };
  if (parsed.data.startsOn < year.startsOn || parsed.data.endsOn > year.endsOn) {
    return { error: t.academic.errors.outsideTerm };
  }
  await getDb().insert(terms).values(parsed.data);
  revalidatePath("/kalender/kelola");
  return { success: t.academic.manage.saved };
}

export async function createCalendarEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireCalendarManager();
  if (!user) return { error: t.errors.forbidden };
  const parsed = calendarEventSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  await getDb().insert(calendarEvents).values({ ...parsed.data, createdBy: user.id });
  revalidatePath("/kalender/kelola");
  revalidatePath("/kalender");
  return { success: t.academic.manage.saved };
}

export async function deleteCalendarEventAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await requireCalendarManager())) return { error: t.errors.forbidden };
  const id = z.uuid().safeParse(fd.get("eventId"));
  if (!id.success) return { error: t.auth.invalidInput };
  await getDb().delete(calendarEvents).where(eq(calendarEvents.id, id.data));
  revalidatePath("/kalender/kelola");
  revalidatePath("/kalender");
  return { success: t.academic.manage.deleted };
}

// ---------------------------------------------------------------- kelas

export async function createClassAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = classSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  if (!can(user, "class.manage", { divisionId: input.divisionId })) return { error: t.errors.forbidden };

  const db = getDb();
  const [term] = await db.select().from(terms).where(eq(terms.id, input.termId)).limit(1);
  if (!term) return { error: t.errors.notFound };
  if (input.firstDate < term.startsOn || input.firstDate > term.endsOn) {
    return { error: t.academic.errors.outsideTerm };
  }

  const plan = generateRegularSessions({
    firstDate: input.firstDate,
    count: input.plannedSessions,
    startTime: input.startTime,
    durationMinutes: input.durationMinutes,
    holidays: await holidaysFor(input.divisionId, { startsOn: term.startsOn, endsOn: term.endsOn }),
    until: term.endsOn,
  });
  if (plan.sessions.length === 0) return { error: t.academic.errors.noSessions };

  const result = await guard(() =>
    db.transaction(async (tx) => {
      const [cls] = await tx
        .insert(classes)
        .values({
          divisionId: input.divisionId,
          termId: input.termId,
          name: input.name,
          description: input.description,
          plannedSessions: input.plannedSessions,
          defaultStartTime: input.startTime,
          defaultDurationMinutes: input.durationMinutes,
          defaultMode: input.mode,
          defaultLocation: input.location,
          defaultMeetingUrl: input.meetingUrl,
          createdBy: user.id,
        })
        .returning({ id: classes.id });
      if (!cls) throw new Error("Kelas gagal dibuat");
      await tx.insert(sessions).values(
        plan.sessions.map((s) => ({
          classId: cls.id,
          divisionId: input.divisionId,
          kind: "regular" as const,
          mode: input.mode,
          title: `${input.name} #${s.sequence}`,
          sequence: s.sequence,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          location: input.mode === "online" ? null : input.location,
          meetingUrl: input.mode === "offline" ? null : input.meetingUrl,
          createdBy: user.id,
        })),
      );
      return cls.id;
    }),
  );
  if (typeof result !== "string") return result;

  revalidatePath("/kelas");
  const query = new URLSearchParams({
    pertemuan: String(plan.sessions.length),
    libur: String(plan.skipped.length),
    kurang: String(plan.shortfall),
  });
  redirect(`/kelas/${result}?${query.toString()}`);
}

async function loadClass(classId: string) {
  const [cls] = await getDb()
    .select({ id: classes.id, divisionId: classes.divisionId, name: classes.name })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return cls ?? null;
}

async function loadSession(sessionId: string) {
  const [s] = await getDb()
    .select({ id: sessions.id, kind: sessions.kind, classId: sessions.classId, divisionId: sessions.divisionId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return s ?? null;
}

function revalidateSessionPaths(classId: string | null) {
  revalidatePath("/kalender");
  revalidatePath(classId ? `/kelas/${classId}` : "/kelas");
}

export async function updateSessionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = sessionUpdateSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  const target = await loadSession(input.sessionId);
  if (!target) return { error: t.errors.notFound };
  const resource = target.divisionId ? { divisionId: target.divisionId } : undefined;
  if (!can(user, "session.manage", resource)) return { error: t.errors.forbidden };

  const startsAt = jakartaToUtc(input.date, input.startTime);
  if (target.kind === "regular" && !isThursdayInJakarta(startsAt)) {
    return { error: t.academic.errors.notThursday };
  }
  const result = await guard(() =>
    getDb()
      .update(sessions)
      .set({
        startsAt,
        endsAt: addMinutes(startsAt, input.durationMinutes),
        mode: input.mode,
        location: input.mode === "online" ? null : input.location,
        meetingUrl: input.mode === "offline" ? null : input.meetingUrl,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, target.id)),
  );
  if (result && "error" in result) return result;
  revalidateSessionPaths(target.classId);
  return { success: t.academic.classes.sessionSaved };
}

export async function setSessionStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = sessionStatusSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const target = await loadSession(parsed.data.sessionId);
  if (!target) return { error: t.errors.notFound };
  const resource = target.divisionId ? { divisionId: target.divisionId } : undefined;
  if (!can(user, "session.manage", resource)) return { error: t.errors.forbidden };

  const result = await guard(() =>
    getDb()
      .update(sessions)
      .set({
        status: parsed.data.status,
        offReason: parsed.data.status === "off" ? parsed.data.offReason : null,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, target.id)),
  );
  if (result && "error" in result) return result;
  revalidateSessionPaths(target.classId);
  return { success: t.academic.classes.statusSaved };
}

export async function addExtraSessionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = extraSessionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  const cls = await loadClass(input.classId);
  if (!cls) return { error: t.errors.notFound };
  if (!can(user, "class.manage", { divisionId: cls.divisionId })) return { error: t.errors.forbidden };

  const startsAt = jakartaToUtc(input.date, input.startTime);
  const result = await guard(() =>
    getDb()
      .insert(sessions)
      .values({
        classId: cls.id,
        divisionId: cls.divisionId,
        kind: "extra",
        mode: input.mode,
        title: input.title,
        startsAt,
        endsAt: addMinutes(startsAt, input.durationMinutes),
        location: input.mode === "online" ? null : input.location,
        meetingUrl: input.mode === "offline" ? null : input.meetingUrl,
        createdBy: user.id,
      }),
  );
  if (result && "error" in result) return result;
  revalidateSessionPaths(cls.id);
  return { success: t.academic.classes.extraAdded };
}

export async function createActivityAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = activitySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const input = parsed.data;
  // Kegiatan semua divisi (divisionId kosong) hanya untuk admin.
  const resource = input.divisionId ? { divisionId: input.divisionId } : undefined;
  if (!can(user, "session.manage", resource)) return { error: t.errors.forbidden };

  const startsAt = jakartaToUtc(input.date, input.startTime);
  await getDb()
    .insert(sessions)
    .values({
      divisionId: input.divisionId,
      kind: "activity",
      mode: input.mode,
      title: input.title,
      startsAt,
      endsAt: addMinutes(startsAt, input.durationMinutes),
      location: input.mode === "online" ? null : input.location,
      meetingUrl: input.mode === "offline" ? null : input.meetingUrl,
      createdBy: user.id,
    });
  revalidateSessionPaths(null);
  return { success: t.academic.classes.activityCreated };
}

// ---------------------------------------------------------------- pendaftaran kelas

const enrollSchema = z.object({ classId: z.uuid(), memberIds: z.array(z.uuid()).min(1).max(500) });

export async function enrollMembersAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = enrollSchema.safeParse({ classId: fd.get("classId"), memberIds: fd.getAll("memberIds") });
  if (!parsed.success) return { error: t.auth.invalidInput };
  const cls = await loadClass(parsed.data.classId);
  if (!cls) return { error: t.errors.notFound };
  if (!can(user, "class.manage", { divisionId: cls.divisionId })) return { error: t.errors.forbidden };

  const db = getDb();
  // Hanya anggota aktif divisi kelas ini yang bisa didaftarkan.
  const eligible = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        inArray(members.id, parsed.data.memberIds),
        eq(members.divisionId, cls.divisionId),
        eq(members.status, "aktif"),
      ),
    );
  if (eligible.length === 0) return { error: t.auth.invalidInput };

  const inserted = await db
    .insert(enrollments)
    .values(eligible.map((m) => ({ classId: cls.id, memberId: m.id, enrolledBy: user.id })))
    .onConflictDoNothing()
    .returning({ memberId: enrollments.memberId });
  revalidatePath(`/kelas/${cls.id}`);
  return { success: t.academic.classes.enrolledSaved(inserted.length) };
}

export async function unenrollMemberAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { user } = await requireSession();
  const parsed = z.object({ classId: z.uuid(), memberId: z.uuid() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: t.auth.invalidInput };
  const cls = await loadClass(parsed.data.classId);
  if (!cls) return { error: t.errors.notFound };
  if (!can(user, "class.manage", { divisionId: cls.divisionId })) return { error: t.errors.forbidden };

  await getDb()
    .delete(enrollments)
    .where(and(eq(enrollments.classId, cls.id), eq(enrollments.memberId, parsed.data.memberId)));
  revalidatePath(`/kelas/${cls.id}`);
  return { success: t.academic.classes.unenrolled };
}

// ---------------------------------------------------------------- feed .ics

export type FeedState = { error?: string; url?: string } | undefined;

/** Buat (atau ganti) token feed kalender. Token asli hanya dikembalikan sekali. */
export async function createFeedTokenAction(): Promise<FeedState> {
  const { user } = await requireSession();
  if (!can(user, "calendar.read")) return { error: t.errors.forbidden };
  const token = randomBytes(32).toString("base64url");
  await getDb()
    .insert(calendarFeedTokens)
    .values({ memberId: user.id, tokenHash: hashFeedToken(token) })
    .onConflictDoUpdate({
      target: calendarFeedTokens.memberId,
      set: { tokenHash: hashFeedToken(token), createdAt: new Date() },
    });
  return { url: `${serverEnv().APP_URL}/kalender/feed/${token}.ics` };
}
