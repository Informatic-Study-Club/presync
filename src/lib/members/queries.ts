import "server-only";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import {
  dataRequests,
  divisionCoordinators,
  divisions,
  importBatches,
  memberRoles,
  members,
} from "@/db/schema";
import { can, type SessionUser } from "@/lib/authz";

/** Daftar divisi; di-dedupe per request karena layout dan halaman sama-sama memakainya. */
export const listDivisions = cache(async () => {
  return getDb()
    .select({ id: divisions.id, name: divisions.name, slug: divisions.slug })
    .from(divisions)
    .orderBy(asc(divisions.name));
});

/** Divisi yang anggotanya boleh dilihat user (member.list). */
export async function visibleDivisions(user: SessionUser) {
  const all = await listDivisions();
  return all.filter((d) => can(user, "member.list", { divisionId: d.id }));
}

export type MemberFilters = {
  q?: string;
  divisionId?: string;
  batch?: string;
  status?: "aktif" | "nonaktif" | "alumni";
};

export type MemberListItem = {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  /** null bila user tidak berwenang melihat nomor HP. */
  phone: string | null;
  divisionId: string;
  divisionName: string;
  batch: string;
  status: "aktif" | "nonaktif" | "alumni";
};

export async function listMembers(
  user: SessionUser,
  filters: MemberFilters,
): Promise<MemberListItem[]> {
  const allowed = (await visibleDivisions(user)).map((d) => d.id);
  const divisionIds = filters.divisionId
    ? allowed.filter((id) => id === filters.divisionId)
    : allowed;
  if (divisionIds.length === 0) return [];

  const conditions: SQL[] = [inArray(members.divisionId, divisionIds)];
  if (filters.batch) conditions.push(eq(members.batch, filters.batch));
  if (filters.status) conditions.push(eq(members.status, filters.status));
  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const search = or(
      ilike(members.fullName, pattern),
      ilike(members.email, pattern),
      ilike(members.memberCode, pattern),
    );
    if (search) conditions.push(search);
  }

  const rows = await getDb()
    .select({
      id: members.id,
      memberCode: members.memberCode,
      fullName: members.fullName,
      email: members.email,
      phone: members.phone,
      divisionId: members.divisionId,
      divisionName: divisions.name,
      batch: members.batch,
      status: members.status,
    })
    .from(members)
    .innerJoin(divisions, eq(members.divisionId, divisions.id))
    .where(and(...conditions))
    .orderBy(asc(members.memberCode))
    .limit(1000);

  return rows.flatMap((m) => {
    const resource = { memberId: m.id, divisionId: m.divisionId, hasArrears: false };
    if (!can(user, "member.read", resource)) return [];
    return [{ ...m, phone: can(user, "member.read_contact", resource) ? m.phone : null }];
  });
}

export async function listBatches(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ batch: members.batch })
    .from(members)
    .orderBy(asc(members.batch));
  return rows.map((r) => r.batch);
}

export type MemberProfile = MemberListItem & {
  cardVersion: number;
  legacyCardAllowed: boolean;
  cardStatus: "active" | "blocked";
  createdAt: Date;
  roles: ("admin" | "koordinator" | "bendahara")[];
  coordinatorDivisionIds: string[];
};

/** Profil anggota, atau null bila tidak ada atau tidak berwenang. */
export async function getMemberProfile(
  user: SessionUser,
  memberId: string,
): Promise<MemberProfile | null> {
  const db = getDb();
  const [m] = await db
    .select({
      id: members.id,
      memberCode: members.memberCode,
      fullName: members.fullName,
      email: members.email,
      phone: members.phone,
      divisionId: members.divisionId,
      divisionName: divisions.name,
      batch: members.batch,
      status: members.status,
      cardVersion: members.cardVersion,
      legacyCardAllowed: members.legacyCardAllowed,
      cardStatus: members.cardStatus,
      createdAt: members.createdAt,
    })
    .from(members)
    .innerJoin(divisions, eq(members.divisionId, divisions.id))
    .where(eq(members.id, memberId))
    .limit(1);
  if (!m) return null;

  const resource = { memberId: m.id, divisionId: m.divisionId, hasArrears: false };
  if (!can(user, "member.read", resource)) return null;

  const [roleRows, coordRows] = await Promise.all([
    db.select({ role: memberRoles.role }).from(memberRoles).where(eq(memberRoles.memberId, m.id)),
    db
      .select({ divisionId: divisionCoordinators.divisionId })
      .from(divisionCoordinators)
      .where(eq(divisionCoordinators.memberId, m.id)),
  ]);

  return {
    ...m,
    phone: can(user, "member.read_contact", resource) ? m.phone : null,
    roles: roleRows.map((r) => r.role),
    coordinatorDivisionIds: coordRows.map((r) => r.divisionId),
  };
}

/** Data kartu untuk dicetak, hanya anggota yang boleh dicetak user. */
export async function cardsForPrint(
  user: SessionUser,
  filter: { memberIds?: string[]; divisionId?: string; batch?: string },
) {
  const conditions: SQL[] = [eq(members.status, "aktif")];
  if (filter.memberIds) conditions.push(inArray(members.id, filter.memberIds));
  if (filter.divisionId) conditions.push(eq(members.divisionId, filter.divisionId));
  if (filter.batch) conditions.push(eq(members.batch, filter.batch));

  const rows = await getDb()
    .select({
      id: members.id,
      memberCode: members.memberCode,
      fullName: members.fullName,
      divisionId: members.divisionId,
      divisionName: divisions.name,
      batch: members.batch,
      cardVersion: members.cardVersion,
      legacyCardAllowed: members.legacyCardAllowed,
      cardStatus: members.cardStatus,
    })
    .from(members)
    .innerJoin(divisions, eq(members.divisionId, divisions.id))
    .where(and(...conditions))
    .orderBy(asc(members.memberCode))
    .limit(500);

  return rows.filter(
    (m) =>
      m.cardStatus === "active" &&
      (can(user, "card.print", { memberId: m.id, divisionId: m.divisionId }) ||
        can(user, "card.view", { memberId: m.id, divisionId: m.divisionId })),
  );
}

export async function recentImports() {
  return getDb()
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      status: importBatches.status,
      importedRows: importBatches.importedRows,
      skippedRows: importBatches.skippedRows,
      totalRows: importBatches.totalRows,
      error: importBatches.error,
      createdAt: importBatches.createdAt,
      createdByName: members.fullName,
    })
    .from(importBatches)
    .leftJoin(members, eq(importBatches.createdBy, members.id))
    .orderBy(desc(importBatches.createdAt))
    .limit(20);
}

export async function dataRequestsOf(memberId: string) {
  return getDb()
    .select()
    .from(dataRequests)
    .where(eq(dataRequests.memberId, memberId))
    .orderBy(desc(dataRequests.createdAt));
}

export async function allDataRequests() {
  return getDb()
    .select({
      id: dataRequests.id,
      kind: dataRequests.kind,
      reason: dataRequests.reason,
      status: dataRequests.status,
      resolutionNote: dataRequests.resolutionNote,
      createdAt: dataRequests.createdAt,
      handledAt: dataRequests.handledAt,
      memberId: members.id,
      memberName: members.fullName,
      memberCode: members.memberCode,
    })
    .from(dataRequests)
    .innerJoin(members, eq(dataRequests.memberId, members.id))
    .orderBy(asc(dataRequests.status), desc(dataRequests.createdAt))
    .limit(200);
}
