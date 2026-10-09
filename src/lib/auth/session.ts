import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import {
  divisionCoordinators,
  divisions,
  memberRoles,
  members,
} from "@/db/schema";
import { type Role, requiresTwoFactor, type SessionUser } from "@/lib/authz";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentMember = {
  id: string;
  fullName: string;
  memberCode: string;
  batch: string;
  status: "aktif" | "nonaktif" | "alumni";
  divisionId: string;
  divisionName: string;
};

export type Session = {
  user: SessionUser;
  member: CurrentMember;
  /** Tingkat autentikasi sesi: "aal1" (password) atau "aal2" (plus TOTP). */
  aal: string;
};

/** Klaim JWT yang sudah diverifikasi, atau null bila belum login. */
export const getAuthClaims = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims;
});

export async function loadSessionUser(memberId: string): Promise<{
  user: SessionUser;
  member: CurrentMember;
} | null> {
  const db = getDb();
  const [memberRows, roleRows, coordinatorRows] = await Promise.all([
    db
      .select({
        id: members.id,
        fullName: members.fullName,
        memberCode: members.memberCode,
        batch: members.batch,
        status: members.status,
        divisionId: members.divisionId,
        divisionName: divisions.name,
      })
      .from(members)
      .innerJoin(divisions, eq(members.divisionId, divisions.id))
      .where(eq(members.id, memberId))
      .limit(1),
    db
      .select({ role: memberRoles.role })
      .from(memberRoles)
      .where(eq(memberRoles.memberId, memberId)),
    db
      .select({ divisionId: divisionCoordinators.divisionId })
      .from(divisionCoordinators)
      .where(eq(divisionCoordinators.memberId, memberId)),
  ]);

  const member = memberRows[0];
  if (!member) return null;

  const roles: Role[] = ["anggota", ...roleRows.map((r) => r.role)];
  return {
    member,
    user: {
      id: member.id,
      roles,
      coordinatorDivisionIds: coordinatorRows.map((r) => r.divisionId),
    },
  };
}

/** Sesi lengkap (klaim + data anggota + peran), atau null. */
export const getSession = cache(async (): Promise<Session | null> => {
  const claims = await getAuthClaims();
  if (!claims) return null;
  const loaded = await loadSessionUser(claims.sub);
  if (!loaded) return null;
  return { ...loaded, aal: claims.aal };
});

/**
 * Wajib di setiap halaman, Server Action, dan Route Handler yang butuh login.
 * Mengalihkan ke /masuk bila belum login atau akun tidak aktif, dan ke /2fa
 * bila peran wajib 2FA tetapi sesi belum aal2.
 */
export async function requireSession(): Promise<Session> {
  const claims = await getAuthClaims();
  if (!claims) redirect("/masuk");

  const session = await getSession();
  if (!session) redirect("/masuk?galat=akun");
  if (session.member.status !== "aktif") redirect("/masuk?galat=nonaktif");

  if (requiresTwoFactor(session.user) && session.aal !== "aal2") {
    redirect("/2fa");
  }
  return session;
}

/**
 * Untuk Route Handler (unduhan file): sesi aktif dengan 2FA terpenuhi, atau
 * null. Route Handler membalas 401 alih-alih mengalihkan halaman.
 */
export async function routeSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session || session.member.status !== "aktif") return null;
  if (requiresTwoFactor(session.user) && session.aal !== "aal2") return null;
  return session;
}
