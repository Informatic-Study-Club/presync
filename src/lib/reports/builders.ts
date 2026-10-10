import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import { attendance, classes, divisions, enrollments, members, sessions, terms } from "@/db/schema";
import { jakartaToUtc, toJakarta, todayInJakarta } from "@/lib/academic/time";
import { classAssessment } from "@/lib/assessment/service";
import { classRecap } from "@/lib/attendance/service";
import { type AttendanceStatus, summarizeAttendance } from "@/lib/attendance/summary";
import type { Session } from "@/lib/auth/session";
import { can, canInAnyDivision } from "@/lib/authz";
import { formatRupiah } from "@/lib/finance/money";
import { arrearsList, ledgerForMonth } from "@/lib/finance/service";
import { listDivisions, listMembers } from "@/lib/members/queries";
import { id as t } from "@/messages/id";
import { checkRange, MAX_REPORT_ROWS, type Report, type ReportColumn, type ReportRow } from "./model";

export type BuildResult = { ok: true; report: Report } | { ok: false; status: 400 | 403 | 404; error: string };

const r = t.reports;
const c = r.cols;
const forbidden: BuildResult = { ok: false, status: 403, error: t.errors.forbidden };
const notFound: BuildResult = { ok: false, status: 404, error: t.errors.notFound };

function base(session: Session, slug: string, title: string, period: string): Omit<Report, "columns" | "rows" | "meta"> {
  return { slug, title, period, generatedBy: session.member.fullName, generatedAt: new Date() };
}

function limitRows(report: Report): BuildResult {
  if (report.rows.length > MAX_REPORT_ROWS) {
    return { ok: false, status: 400, error: r.errors.tooManyRows(MAX_REPORT_ROWS) };
  }
  return { ok: true, report };
}

function rangeError(from: string, to: string): BuildResult | null {
  const check = checkRange(from, to);
  if (check.ok) return null;
  return { ok: false, status: 400, error: check.reason === "order" ? r.errors.order : r.errors.tooLong };
}

const SUMMARY_COLUMNS: ReportColumn[] = [
  { key: "hadir", label: c.hadir, type: "number" },
  { key: "izin", label: c.izin, type: "number" },
  { key: "sakit", label: c.sakit, type: "number" },
  { key: "tidakHadir", label: c.tidakHadir, type: "number" },
  { key: "counted", label: c.counted, type: "number" },
  { key: "percent", label: c.percent, type: "percent" },
];

// ---------------------------------------------------------------- kehadiran per kelas

export async function attendanceByClass(session: Session, classId: string): Promise<BuildResult> {
  const [cls] = await getDb()
    .select({ id: classes.id, name: classes.name, divisionId: classes.divisionId, divisionName: divisions.name, termName: terms.name })
    .from(classes)
    .innerJoin(divisions, eq(classes.divisionId, divisions.id))
    .innerJoin(terms, eq(classes.termId, terms.id))
    .where(eq(classes.id, classId))
    .limit(1);
  if (!cls) return notFound;
  if (!can(session.user, "report.attendance", { divisionId: cls.divisionId })) return forbidden;

  const recap = await classRecap(cls.id);
  const counted = recap[0]?.summary.counted ?? 0;
  return limitRows({
    ...base(session, `kehadiran-${cls.name}`, r.attendanceClass.title, `${cls.termName}`),
    meta: [
      { label: r.attendanceClass.cls, value: cls.name },
      { label: c.division, value: cls.divisionName },
      { label: r.attendanceClass.sessionsDone, value: String(counted) },
    ],
    columns: [
      { key: "code", label: c.code, type: "text" },
      { key: "name", label: c.name, type: "text", width: 2.5 },
      ...SUMMARY_COLUMNS,
    ],
    rows: recap.map((m) => ({ code: m.memberCode, name: m.fullName, ...m.summary })),
  });
}

// ---------------------------------------------------------------- kehadiran per divisi dan periode

function periodBounds(from: string, to: string) {
  return { start: jakartaToUtc(from, "00:00"), end: jakartaToUtc(to, "23:59") };
}

export async function attendanceByDivision(session: Session, divisionId: string, from: string, to: string): Promise<BuildResult> {
  const range = rangeError(from, to);
  if (range) return range;
  if (!can(session.user, "report.attendance", { divisionId })) return forbidden;
  const db = getDb();
  const [division] = await db.select({ name: divisions.name }).from(divisions).where(eq(divisions.id, divisionId)).limit(1);
  if (!division) return notFound;

  const { start, end } = periodBounds(from, to);
  const sessionRows = await db
    .select({ id: sessions.id, status: sessions.status, classId: sessions.classId })
    .from(sessions)
    .innerJoin(classes, eq(sessions.classId, classes.id))
    .where(and(eq(classes.divisionId, divisionId), gte(sessions.startsAt, start), lte(sessions.startsAt, end)));
  const classIds = [...new Set(sessionRows.flatMap((s) => (s.classId ? [s.classId] : [])))];
  const enrolled =
    classIds.length > 0
      ? await db
          .select({ classId: enrollments.classId, memberId: members.id, code: members.memberCode, name: members.fullName })
          .from(enrollments)
          .innerJoin(members, eq(enrollments.memberId, members.id))
          .where(inArray(enrollments.classId, classIds))
      : [];
  const sessionIds = sessionRows.map((s) => s.id);
  const records =
    sessionIds.length > 0
      ? await db
          .select({ sessionId: attendance.sessionId, memberId: attendance.memberId, status: attendance.status })
          .from(attendance)
          .where(inArray(attendance.sessionId, sessionIds))
      : [];

  const membersById = new Map<string, { code: string; name: string; classIds: Set<string> }>();
  for (const e of enrolled) {
    const entry = membersById.get(e.memberId) ?? { code: e.code, name: e.name, classIds: new Set<string>() };
    entry.classIds.add(e.classId);
    membersById.set(e.memberId, entry);
  }
  const rows: ReportRow[] = [...membersById.entries()]
    .sort((a, b) => a[1].code.localeCompare(b[1].code))
    .map(([memberId, m]) => {
      const mine = sessionRows.filter((s) => s.classId && m.classIds.has(s.classId));
      const recordMap = new Map(records.filter((x) => x.memberId === memberId).map((x) => [x.sessionId, x.status]));
      return { code: m.code, name: m.name, ...summarizeAttendance(mine, recordMap) };
    });

  return limitRows({
    ...base(session, `kehadiran-${division.name}-${from}-${to}`, r.attendanceDivision.title, r.period(from, to)),
    meta: [{ label: c.division, value: division.name }],
    columns: [
      { key: "code", label: c.code, type: "text" },
      { key: "name", label: c.name, type: "text", width: 2.5 },
      ...SUMMARY_COLUMNS,
    ],
    rows,
  });
}

// ---------------------------------------------------------------- riwayat kehadiran anggota

export async function attendanceByMember(session: Session, memberId: string, from: string, to: string): Promise<BuildResult> {
  const range = rangeError(from, to);
  if (range) return range;
  const db = getDb();
  const [member] = await db
    .select({ id: members.id, code: members.memberCode, name: members.fullName, divisionId: members.divisionId, divisionName: divisions.name })
    .from(members)
    .innerJoin(divisions, eq(members.divisionId, divisions.id))
    .where(eq(members.id, memberId))
    .limit(1);
  if (!member) return notFound;
  const allowed =
    can(session.user, "report.attendance", { divisionId: member.divisionId }) ||
    can(session.user, "attendance.read", { memberId: member.id, divisionId: member.divisionId });
  if (!allowed) return forbidden;

  const { start, end } = periodBounds(from, to);
  const classIds = (await db.select({ classId: enrollments.classId }).from(enrollments).where(eq(enrollments.memberId, member.id))).map(
    (e) => e.classId,
  );
  const scope = or(
    classIds.length > 0 ? inArray(sessions.classId, classIds) : undefined,
    and(eq(sessions.kind, "activity"), or(isNull(sessions.divisionId), eq(sessions.divisionId, member.divisionId))),
  );
  const sessionRows = await db
    .select({ id: sessions.id, title: sessions.title, kind: sessions.kind, status: sessions.status, startsAt: sessions.startsAt })
    .from(sessions)
    .where(and(gte(sessions.startsAt, start), lte(sessions.startsAt, end), scope))
    .orderBy(asc(sessions.startsAt));
  const records =
    sessionRows.length > 0
      ? await db
          .select({ sessionId: attendance.sessionId, status: attendance.status, method: attendance.method })
          .from(attendance)
          .where(and(eq(attendance.memberId, member.id), inArray(attendance.sessionId, sessionRows.map((s) => s.id))))
      : [];
  const byId = new Map(records.map((x) => [x.sessionId, x]));

  const rows: ReportRow[] = sessionRows.map((s) => {
    const record = byId.get(s.id);
    const status: string =
      s.status === "off"
        ? t.academic.sessionStatus.off
        : record
          ? t.attendanceStatus[record.status]
          : s.status === "done"
            ? t.attendanceStatus.tidak_hadir
            : "-";
    return {
      date: toJakarta(s.startsAt).date,
      session: s.title,
      kind: t.academic.sessionKind[s.kind],
      status,
      method: record ? t.attendance.methods[record.method] : null,
    };
  });
  const summary = summarizeAttendance(
    sessionRows,
    new Map(records.map((x) => [x.sessionId, x.status as AttendanceStatus])),
  );

  return limitRows({
    ...base(session, `kehadiran-${member.code}-${from}-${to}`, r.attendanceMember.title, r.period(from, to)),
    meta: [
      { label: c.code, value: member.code },
      { label: c.name, value: member.name },
      { label: c.division, value: member.divisionName },
      { label: c.percent, value: summary.percent === null ? "-" : `${summary.percent.toLocaleString("id-ID")}%` },
      { label: c.hadir, value: String(summary.hadir) },
      { label: c.izin, value: String(summary.izin) },
      { label: c.sakit, value: String(summary.sakit) },
      { label: c.tidakHadir, value: String(summary.tidakHadir) },
    ],
    columns: [
      { key: "date", label: c.date, type: "text" },
      { key: "session", label: c.session, type: "text", width: 3 },
      { key: "kind", label: c.kind, type: "text", width: 1.5 },
      { key: "status", label: c.status, type: "text" },
      { key: "method", label: c.method, type: "text", width: 1.5 },
    ],
    rows,
  });
}

// ---------------------------------------------------------------- kas

export async function financeMonthly(session: Session, month: string): Promise<BuildResult> {
  if (!can(session.user, "finance.report")) return forbidden;
  const ledger = await ledgerForMonth(month);
  const s = ledger.statement;
  return limitRows({
    ...base(session, `kas-${month}`, r.finance.title, r.periodMonth(month)),
    meta: [
      { label: c.opening, value: formatRupiah(s.opening) },
      { label: c.income, value: formatRupiah(s.income) },
      { label: c.expense, value: formatRupiah(s.expense) },
      { label: c.closing, value: formatRupiah(s.closing) },
    ],
    columns: [
      { key: "date", label: c.date, type: "text" },
      { key: "description", label: c.description, type: "text", width: 3 },
      { key: "category", label: c.category, type: "text", width: 1.5 },
      { key: "income", label: c.income, type: "rupiah", width: 1.3 },
      { key: "expense", label: c.expense, type: "rupiah", width: 1.3 },
    ],
    rows: ledger.entries.map((e) => ({
      date: e.occurredOn,
      description: e.description,
      category: e.categoryName,
      income: e.kind === "income" ? e.amount : null,
      expense: e.kind === "expense" ? e.amount : null,
    })),
    totals: { description: r.total, income: s.income, expense: s.expense },
  });
}

export async function arrearsReport(session: Session): Promise<BuildResult> {
  if (!can(session.user, "finance.report")) return forbidden;
  const rows = await arrearsList(session.user);
  const today = todayInJakarta();
  const showPhone = rows.some((x) => x.phone !== null);
  return limitRows({
    ...base(session, `tunggakan-${today}`, r.finance.arrearsTitle, r.periodAsOf(today)),
    meta: [],
    columns: [
      { key: "code", label: c.code, type: "text" },
      { key: "name", label: c.name, type: "text", width: 2.5 },
      { key: "division", label: c.division, type: "text", width: 1.5 },
      { key: "invoices", label: c.invoices, type: "number" },
      { key: "total", label: c.total, type: "rupiah", width: 1.3 },
      { key: "oldest", label: c.oldest, type: "text", width: 1.3 },
      ...(showPhone ? [{ key: "phone", label: c.phone, type: "text" as const, width: 1.5 }] : []),
    ],
    rows: rows.map((x) => ({
      code: x.memberCode,
      name: x.fullName,
      division: x.divisionName,
      invoices: x.invoiceCount,
      total: x.totalAmount,
      oldest: x.oldestDueOn,
      phone: x.phone,
    })),
    totals: {
      name: r.total,
      invoices: rows.reduce((sum, x) => sum + x.invoiceCount, 0),
      total: rows.reduce((sum, x) => sum + x.totalAmount, 0),
    },
  });
}

// ---------------------------------------------------------------- daftar anggota

export async function membersReport(
  session: Session,
  filters: { divisionId?: string; batch?: string; status?: "aktif" | "nonaktif" | "alumni" },
): Promise<BuildResult> {
  if (filters.divisionId && !can(session.user, "report.members", { divisionId: filters.divisionId })) return forbidden;
  const divisionIds = (await listDivisions()).map((d) => d.id);
  if (!canInAnyDivision(session.user, "report.members", divisionIds)) return forbidden;
  // listMembers sudah membatasi ke divisi yang boleh dilihat dan menyembunyikan No. HP.
  const rows = (await listMembers(session.user, filters)).filter((m) =>
    can(session.user, "report.members", { divisionId: m.divisionId }),
  );
  const showPhone = rows.some((m) => m.phone !== null);
  const scope = [filters.batch ? `${c.batch} ${filters.batch}` : null, filters.status ? t.memberStatus[filters.status] : null]
    .filter(Boolean)
    .join(" · ");
  return limitRows({
    ...base(session, `anggota-${todayInJakarta()}`, r.membersList.title, r.periodAsOf(todayInJakarta())),
    meta: [
      ...(scope ? [{ label: c.status, value: scope }] : []),
      { label: c.total, value: r.membersList.count(rows.length) },
    ],
    columns: [
      { key: "code", label: c.code, type: "text" },
      { key: "name", label: c.name, type: "text", width: 2.5 },
      { key: "division", label: c.division, type: "text", width: 1.5 },
      { key: "batch", label: c.batch, type: "text", width: 0.6 },
      { key: "status", label: c.status, type: "text", width: 0.8 },
      { key: "email", label: c.email, type: "text", width: 2.2 },
      ...(showPhone ? [{ key: "phone", label: c.phone, type: "text" as const, width: 1.5 }] : []),
    ],
    rows: rows.map((m) => ({
      code: m.memberCode,
      name: m.fullName,
      division: m.divisionName,
      batch: m.batch,
      status: t.memberStatus[m.status],
      email: m.email,
      phone: m.phone,
    })),
  });
}

// ---------------------------------------------------------------- penerima sertifikat

export async function certificateRecipients(session: Session, classId: string): Promise<BuildResult> {
  const data = await classAssessment(session.user, classId);
  if (!data) return forbidden;
  const recipients = data.results.filter((x) => x.status === "eligible");
  return limitRows({
    ...base(session, `sertifikat-${data.cls.name}`, r.certificates.title, data.cls.termName),
    meta: [
      { label: r.attendanceClass.cls, value: data.cls.name },
      { label: c.division, value: data.cls.divisionName },
      { label: c.total, value: t.assessment.summary(recipients.length, data.results.length) },
    ],
    columns: [
      { key: "code", label: c.code, type: "text" },
      { key: "name", label: c.name, type: "text", width: 2.5 },
      { key: "score", label: t.assessment.finalScore, type: "number" },
      { key: "note", label: t.assessment.reasons, type: "text", width: 2.5 },
    ],
    rows: recipients.map((x) => ({
      code: x.memberCode,
      name: x.fullName,
      score: x.evaluation.finalScore,
      note: x.override ? `${t.assessment.overridden}: ${x.override.note}` : null,
    })),
  });
}
