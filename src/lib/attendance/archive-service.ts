import "server-only";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { attendanceArchives, members } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assertCan, type SessionUser } from "@/lib/authz";
import { fileHash } from "@/lib/members/import/service";
import { readSpreadsheet } from "@/lib/members/import/parse";
import { id as t } from "@/messages/id";
import { type ArchiveMember, type ArchivePlan, planArchiveImport } from "./archive";

async function membersByCode(): Promise<Map<string, ArchiveMember>> {
  const rows = await getDb()
    .select({ code: members.memberCode, id: members.id, divisionId: members.divisionId, fullName: members.fullName })
    .from(members);
  return new Map(rows.map((r) => [r.code, { id: r.id, divisionId: r.divisionId, fullName: r.fullName }]));
}

async function plan(file: { name: string; data: Uint8Array }): Promise<ArchivePlan> {
  const read = await readSpreadsheet(file.name, file.data);
  if (!read.ok) return read;
  return planArchiveImport(read.table, await membersByCode());
}

export async function previewArchive(user: SessionUser, file: { name: string; data: Uint8Array }) {
  assertCan(user, "member.import");
  return { plan: await plan(file), hash: fileHash(file.data) };
}

export async function commitArchive(
  user: SessionUser,
  program: string,
  file: { name: string; data: Uint8Array },
  expectedHash: string,
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  assertCan(user, "member.import");
  if (fileHash(file.data) !== expectedHash) return { ok: false, error: t.import.fileErrors.hashMismatch };
  const result = await plan(file);
  if (!result.ok) return result;
  const valid = result.rows.filter((r) => r.errors.length === 0 && r.memberId && r.divisionId);
  if (valid.length === 0) return { ok: false, error: t.import.fileErrors.noValidRows };

  await getDb().transaction(async (tx) => {
    await tx
      .insert(attendanceArchives)
      .values(
        valid.map((r) => ({
          memberId: r.memberId as string,
          divisionId: r.divisionId as string,
          program,
          hadir: r.counts.hadir,
          izin: r.counts.izin,
          sakit: r.counts.sakit,
          tidakHadir: r.counts.tidakHadir,
          needsVerification: r.needsVerification,
          note: r.note,
          importedBy: user.id,
        })),
      )
      .onConflictDoUpdate({
        target: [attendanceArchives.memberId, attendanceArchives.program],
        set: {
          hadir: sql`excluded.hadir`,
          izin: sql`excluded.izin`,
          sakit: sql`excluded.sakit`,
          tidakHadir: sql`excluded.tidak_hadir`,
          needsVerification: sql`excluded.needs_verification`,
          note: sql`excluded.note`,
          importedBy: user.id,
          createdAt: new Date(),
        },
      });
    await writeAudit(tx, {
      actorId: user.id,
      action: "attendance.archive_import",
      entityType: "attendance_archive",
      entityId: program,
      note: file.name,
      data: { rows: valid.length, skipped: result.rows.length - valid.length, mode: result.mode },
    });
  });
  return { ok: true, saved: valid.length };
}

export async function archivePrograms() {
  return getDb()
    .select({
      program: attendanceArchives.program,
      rows: count(),
      needsVerification: sql<number>`count(*) filter (where ${attendanceArchives.needsVerification})`.mapWith(Number),
      importedAt: sql<Date>`max(${attendanceArchives.createdAt})`.mapWith((v: string) => new Date(v)),
    })
    .from(attendanceArchives)
    .groupBy(attendanceArchives.program)
    .orderBy(desc(sql`max(${attendanceArchives.createdAt})`), asc(attendanceArchives.program));
}

export async function archivesOfMember(memberId: string) {
  return getDb()
    .select()
    .from(attendanceArchives)
    .where(eq(attendanceArchives.memberId, memberId))
    .orderBy(asc(attendanceArchives.program));
}
