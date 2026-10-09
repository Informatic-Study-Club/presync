import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, type Tx } from "@/db";
import { attendance, classes, divisions, enrollments, members, sessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can, canInAnyDivision, type SessionUser } from "@/lib/authz";
import { parseScannedCard, type ScannedCard } from "@/lib/cards/token";
import { optionalSecret } from "@/lib/env";
import { id as t } from "@/messages/id";
import { broadcastAttendanceChanged } from "./realtime";
import {
  checkinCodeFromBytes,
  evaluateScan,
  evaluateSelfCheckin,
  isEligible,
  normalizeCheckinCode,
  type ScanSource,
  type SessionForAttendance,
} from "./rules";
import { type AttendanceStatus, detectRapidScans, summarizeAttendance } from "./summary";

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

type SessionRow = SessionForAttendance & {
  id: string;
  title: string;
  checkinCode: string | null;
  location: string | null;
  meetingUrl: string | null;
  offReason: string | null;
  className: string | null;
  divisionName: string | null;
};

async function loadSession(executor: Tx | ReturnType<typeof getDb>, sessionId: string): Promise<SessionRow | null> {
  const [row] = await executor
    .select({
      id: sessions.id,
      title: sessions.title,
      status: sessions.status,
      kind: sessions.kind,
      mode: sessions.mode,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      classId: sessions.classId,
      divisionId: sessions.divisionId,
      checkinCode: sessions.checkinCode,
      location: sessions.location,
      meetingUrl: sessions.meetingUrl,
      offReason: sessions.offReason,
      className: classes.name,
      divisionName: divisions.name,
    })
    .from(sessions)
    .leftJoin(classes, eq(sessions.classId, classes.id))
    .leftJoin(divisions, eq(sessions.divisionId, divisions.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return row ?? null;
}

async function allDivisionIds(): Promise<string[]> {
  return (await getDb().select({ id: divisions.id }).from(divisions)).map((d) => d.id);
}

/**
 * Hak mencatat presensi: koordinator divisi sesi atau admin. Kegiatan semua
 * divisi boleh dicatat koordinator divisi mana pun.
 */
export async function canRecord(
  user: SessionUser,
  session: Pick<SessionForAttendance, "divisionId">,
  action: "attendance.scan" | "attendance.manual" | "session.manage" = "attendance.scan",
): Promise<boolean> {
  if (session.divisionId) return can(user, action, { divisionId: session.divisionId });
  return can(user, action) || canInAnyDivision(user, action, await allDivisionIds());
}

function parseCard(raw: string): ScannedCard {
  const secret = optionalSecret("CARD_SECRET");
  if (secret) return parseScannedCard(raw, secret);
  // Tanpa CARD_SECRET, QR bertanda tangan tidak bisa diverifikasi.
  const legacy = parseScannedCard(raw, "x".repeat(32));
  return legacy.kind === "legacy" ? legacy : { kind: "invalid", reason: legacy.kind === "invalid" ? legacy.reason : "signature" };
}

// ---------------------------------------------------------------- scan

export type ScanResult = {
  kind: "recorded" | "duplicate" | "rejected";
  message: string;
  member?: { fullName: string; memberCode: string; divisionName: string; batch: string };
};

export async function recordScan(
  user: SessionUser,
  input: { sessionId: string; raw: string; source: ScanSource; deviceId: string | null },
): Promise<ScanResult> {
  const db = getDb();
  const card = parseCard(input.raw.trim().slice(0, 200));

  const result = await db.transaction(async (tx): Promise<ScanResult> => {
    const session = await loadSession(tx, input.sessionId);
    if (!session) return { kind: "rejected", message: t.errors.notFound };
    if (!(await canRecord(user, session))) return { kind: "rejected", message: t.attendance.forbidden };

    const memberCode = card.kind === "invalid" ? null : card.memberCode;
    const [member] = memberCode
      ? await tx
          .select({
            id: members.id,
            fullName: members.fullName,
            memberCode: members.memberCode,
            batch: members.batch,
            status: members.status,
            divisionId: members.divisionId,
            divisionName: divisions.name,
            cardVersion: members.cardVersion,
            legacyCardAllowed: members.legacyCardAllowed,
            cardStatus: members.cardStatus,
          })
          .from(members)
          .innerJoin(divisions, eq(members.divisionId, divisions.id))
          .where(eq(members.memberCode, memberCode))
          .limit(1)
      : [];

    const enrolled =
      member && session.classId
        ? (
            await tx
              .select({ memberId: enrollments.memberId })
              .from(enrollments)
              .where(and(eq(enrollments.classId, session.classId), eq(enrollments.memberId, member.id)))
              .limit(1)
          ).length > 0
        : false;

    const evaluation = evaluateScan({
      card,
      member: member ?? null,
      session,
      enrolled,
      source: input.source,
      now: new Date(),
    });
    const shown = member
      ? { fullName: member.fullName, memberCode: member.memberCode, divisionName: member.divisionName, batch: member.batch }
      : undefined;
    if (!evaluation.ok) {
      return { kind: "rejected", message: t.attendance.scanRejections[evaluation.reason], member: shown };
    }
    if (!member) return { kind: "rejected", message: t.attendance.scanRejections.unknown_card };

    const inserted = await tx
      .insert(attendance)
      .values({
        sessionId: session.id,
        memberId: member.id,
        status: "hadir",
        method: evaluation.method,
        recordedBy: user.id,
        deviceId: input.deviceId,
      })
      .onConflictDoNothing({ target: [attendance.sessionId, attendance.memberId] })
      .returning({ id: attendance.id });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ recordedAt: attendance.recordedAt, status: attendance.status })
        .from(attendance)
        .where(and(eq(attendance.sessionId, session.id), eq(attendance.memberId, member.id)))
        .limit(1);
      const at = existing ? timeFormat.format(existing.recordedAt) : "-";
      return { kind: "duplicate", message: t.attendance.duplicate(at), member: shown };
    }
    return { kind: "recorded", message: t.attendance.recorded, member: shown };
  });

  if (result.kind === "recorded") await broadcastAttendanceChanged(input.sessionId);
  return result;
}

// ---------------------------------------------------------------- check-in online

export async function selfCheckin(
  user: SessionUser,
  rawCode: string,
): Promise<{ ok: boolean; message: string }> {
  const code = normalizeCheckinCode(rawCode);
  if (!code) return { ok: false, message: t.attendance.checkinRejections.invalid_code };
  if (!can(user, "attendance.self_checkin", { memberId: user.id })) {
    return { ok: false, message: t.errors.forbidden };
  }

  const db = getDb();
  const outcome = await db.transaction(async (tx): Promise<{ ok: boolean; message: string; sessionId?: string }> => {
    const [found] = await tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.checkinCode, code)).limit(1);
    const session = found ? await loadSession(tx, found.id) : null;
    if (!session) return { ok: false, message: t.attendance.checkinRejections.invalid_code };

    const [member] = await tx
      .select({ status: members.status, divisionId: members.divisionId })
      .from(members)
      .where(eq(members.id, user.id))
      .limit(1);
    if (!member) return { ok: false, message: t.errors.notFound };
    const enrolled = session.classId
      ? (
          await tx
            .select({ memberId: enrollments.memberId })
            .from(enrollments)
            .where(and(eq(enrollments.classId, session.classId), eq(enrollments.memberId, user.id)))
            .limit(1)
        ).length > 0
      : false;

    const evaluation = evaluateSelfCheckin({ member, session, enrolled, now: new Date() });
    if (!evaluation.ok) return { ok: false, message: t.attendance.checkinRejections[evaluation.reason] };

    const inserted = await tx
      .insert(attendance)
      .values({ sessionId: session.id, memberId: user.id, status: "hadir", method: "self_checkin", recordedBy: user.id })
      .onConflictDoNothing({ target: [attendance.sessionId, attendance.memberId] })
      .returning({ id: attendance.id });
    if (inserted.length === 0) return { ok: false, message: t.attendance.checkin.duplicate };
    return { ok: true, message: t.attendance.checkin.success(session.title), sessionId: session.id };
  });

  if (outcome.sessionId) await broadcastAttendanceChanged(outcome.sessionId);
  return { ok: outcome.ok, message: outcome.message };
}

// ---------------------------------------------------------------- absen manual

export async function setManualAttendance(
  user: SessionUser,
  input: { sessionId: string; memberId: string; status: AttendanceStatus; note: string },
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const session = await loadSession(tx, input.sessionId);
    if (!session) return { ok: false, message: t.errors.notFound };
    if (!(await canRecord(user, session, "attendance.manual"))) {
      return { ok: false, message: t.attendance.forbidden };
    }
    const [member] = await tx
      .select({ id: members.id, divisionId: members.divisionId })
      .from(members)
      .where(eq(members.id, input.memberId))
      .limit(1);
    if (!member) return { ok: false, message: t.errors.notFound };
    const enrolled = session.classId
      ? (
          await tx
            .select({ memberId: enrollments.memberId })
            .from(enrollments)
            .where(and(eq(enrollments.classId, session.classId), eq(enrollments.memberId, member.id)))
            .limit(1)
        ).length > 0
      : false;
    if (!isEligible(session, member, enrolled)) {
      return { ok: false, message: t.attendance.scanRejections.not_eligible };
    }

    const [before] = await tx
      .select({ status: attendance.status, method: attendance.method })
      .from(attendance)
      .where(and(eq(attendance.sessionId, session.id), eq(attendance.memberId, member.id)))
      .limit(1);

    const values = {
      status: input.status,
      method: "manual" as const,
      recordedBy: user.id,
      recordedAt: new Date(),
      note: input.note,
      deviceId: null,
    };
    await tx
      .insert(attendance)
      .values({ sessionId: session.id, memberId: member.id, ...values })
      .onConflictDoUpdate({ target: [attendance.sessionId, attendance.memberId], set: values });

    await writeAudit(tx, {
      actorId: user.id,
      action: "attendance.manual",
      entityType: "attendance",
      entityId: `${session.id}:${member.id}`,
      note: input.note,
      data: { sessionId: session.id, memberId: member.id, before: before ?? null, after: input.status },
    });
    return { ok: true, message: t.attendance.session.manualSaved };
  });
  if (result.ok) await broadcastAttendanceChanged(input.sessionId);
  return result;
}

// ---------------------------------------------------------------- kode check-in

export async function regenerateCheckinCode(
  user: SessionUser,
  sessionId: string,
): Promise<{ ok: boolean; message: string }> {
  const db = getDb();
  const session = await loadSession(db, sessionId);
  if (!session) return { ok: false, message: t.errors.notFound };
  if (!(await canRecord(user, session, "session.manage"))) return { ok: false, message: t.errors.forbidden };
  if (session.mode === "offline") return { ok: false, message: t.attendance.session.notOnline };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db
        .update(sessions)
        .set({ checkinCode: checkinCodeFromBytes(randomBytes(6)), updatedAt: new Date() })
        .where(eq(sessions.id, session.id));
      return { ok: true, message: t.attendance.session.codeSaved };
    } catch (err) {
      const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ?? (err as { code?: string }).code;
      if (code !== "23505") throw err; // bentrok kode unik: coba lagi
    }
  }
  return { ok: false, message: t.common.unknownError };
}

// ---------------------------------------------------------------- dashboard sesi

export type ParticipantRow = {
  memberId: string;
  fullName: string;
  memberCode: string;
  divisionName: string;
  status: AttendanceStatus | null;
  method: string | null;
  recordedAt: Date | null;
  note: string | null;
  flagged: boolean;
};

export async function sessionDashboard(user: SessionUser, sessionId: string) {
  const db = getDb();
  const session = await loadSession(db, sessionId);
  if (!session) return null;
  if (!(await canRecord(user, session))) return null;

  const records = await db
    .select({
      id: attendance.id,
      memberId: attendance.memberId,
      status: attendance.status,
      method: attendance.method,
      recordedAt: attendance.recordedAt,
      recordedBy: attendance.recordedBy,
      deviceId: attendance.deviceId,
      note: attendance.note,
      fullName: members.fullName,
      memberCode: members.memberCode,
      divisionName: divisions.name,
    })
    .from(attendance)
    .innerJoin(members, eq(attendance.memberId, members.id))
    .innerJoin(divisions, eq(members.divisionId, divisions.id))
    .where(eq(attendance.sessionId, session.id))
    .orderBy(asc(attendance.recordedAt));

  const flagged = detectRapidScans(records);
  const byMember = new Map(records.map((r) => [r.memberId, r]));

  // Kelas: semua peserta terdaftar. Kegiatan: yang sudah tercatat.
  const roster = session.classId
    ? await db
        .select({ id: members.id, fullName: members.fullName, memberCode: members.memberCode, divisionName: divisions.name })
        .from(enrollments)
        .innerJoin(members, eq(enrollments.memberId, members.id))
        .innerJoin(divisions, eq(members.divisionId, divisions.id))
        .where(eq(enrollments.classId, session.classId))
        .orderBy(asc(members.memberCode))
    : records.map((r) => ({ id: r.memberId, fullName: r.fullName, memberCode: r.memberCode, divisionName: r.divisionName }));

  const participants: ParticipantRow[] = roster.map((m) => {
    const r = byMember.get(m.id);
    return {
      memberId: m.id,
      fullName: m.fullName,
      memberCode: m.memberCode,
      divisionName: m.divisionName,
      status: r?.status ?? null,
      method: r?.method ?? null,
      recordedAt: r?.recordedAt ?? null,
      note: r?.note ?? null,
      flagged: r ? flagged.has(r.id) : false,
    };
  });

  const counts = { hadir: 0, izin: 0, sakit: 0, tidak_hadir: 0, belum: 0 };
  for (const p of participants) {
    if (p.status) counts[p.status]++;
    else counts.belum++;
  }

  return {
    session,
    participants,
    counts,
    flaggedCount: flagged.size,
    canManage: await canRecord(user, session, "session.manage"),
  };
}

// ---------------------------------------------------------------- rekap kelas

export async function classRecap(classId: string) {
  const db = getDb();
  const classSessions = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(eq(sessions.classId, classId));
  const roster = await db
    .select({ id: members.id, fullName: members.fullName, memberCode: members.memberCode })
    .from(enrollments)
    .innerJoin(members, eq(enrollments.memberId, members.id))
    .where(eq(enrollments.classId, classId))
    .orderBy(asc(members.memberCode));
  const sessionIds = classSessions.map((s) => s.id);
  const records =
    sessionIds.length > 0
      ? await db
          .select({ sessionId: attendance.sessionId, memberId: attendance.memberId, status: attendance.status })
          .from(attendance)
          .where(inArray(attendance.sessionId, sessionIds))
      : [];

  return roster.map((m) => {
    const mine = new Map(records.filter((r) => r.memberId === m.id).map((r) => [r.sessionId, r.status]));
    return { ...m, summary: summarizeAttendance(classSessions, mine) };
  });
}
