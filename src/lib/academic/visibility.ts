import type { SessionUser } from "@/lib/authz";

// Cakupan data kalender: siapa melihat sesi dan event mana. Fungsi murni;
// datanya disiapkan pemanggil (docs/ARSITEKTUR.md bagian 8).

export type Viewer = {
  user: SessionUser;
  /** Divisi anggota itu sendiri. */
  divisionId: string;
  /** Kelas tempat anggota terdaftar. */
  enrolledClassIds: ReadonlySet<string>;
};

export type SessionScope = {
  kind: "regular" | "extra" | "activity";
  classId: string | null;
  /** Kosong = kegiatan untuk semua divisi. */
  divisionId: string | null;
};

function isAdmin(viewer: Viewer) {
  return viewer.user.roles.includes("admin");
}

function coordinates(viewer: Viewer, divisionId: string | null) {
  return (
    divisionId !== null &&
    viewer.user.roles.includes("koordinator") &&
    viewer.user.coordinatorDivisionIds.includes(divisionId)
  );
}

/**
 * Kelas rutin dan tambahan hanya untuk anggota terdaftar (plus koordinator
 * divisinya dan admin). Kegiatan terbuka sesuai cakupan divisinya.
 */
export function canSeeSession(viewer: Viewer, session: SessionScope): boolean {
  if (isAdmin(viewer) || coordinates(viewer, session.divisionId)) return true;
  if (session.kind === "activity") {
    return session.divisionId === null || session.divisionId === viewer.divisionId;
  }
  return session.classId !== null && viewer.enrolledClassIds.has(session.classId);
}

export function canSeeCalendarEvent(viewer: Viewer, event: { divisionId: string | null }): boolean {
  return (
    event.divisionId === null ||
    event.divisionId === viewer.divisionId ||
    isAdmin(viewer) ||
    coordinates(viewer, event.divisionId)
  );
}
