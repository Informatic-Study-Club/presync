// Satu-satunya tempat pengecekan izin (aturan wajib 3). Fungsi murni, tanpa
// akses database: data yang dibutuhkan (peran, cakupan divisi, pemilik
// resource) disiapkan pemanggil. Tolak bila ragu.

export const ROLES = ["admin", "koordinator", "bendahara", "anggota"] as const;
export type Role = (typeof ROLES)[number];

/** Peran yang wajib memakai 2FA (TOTP). */
export const PRIVILEGED_ROLES: readonly Role[] = [
  "admin",
  "koordinator",
  "bendahara",
];

export type SessionUser = {
  id: string;
  /** Selalu memuat "anggota", ditambah peran dari member_roles. */
  roles: readonly Role[];
  /** Divisi yang dikoordinasi (division_coordinators). */
  coordinatorDivisionIds: readonly string[];
};

export type Resource = {
  /** Anggota pemilik resource (profil, kartu, presensi, tagihan, nilai). */
  memberId?: string;
  /** Divisi tempat resource berada. */
  divisionId?: string;
  /** Untuk kontak anggota: true bila anggota tersebut punya tunggakan. */
  hasArrears?: boolean;
};

export const ACTIONS = [
  // Anggota dan organisasi
  "member.list",
  "member.read",
  "member.read_contact",
  "member.update",
  "member.import",
  "role.manage",
  "division.manage",
  "audit.read",
  // Kartu
  "card.view",
  "card.print",
  "card.reissue",
  // Kalender, kelas, sesi
  "calendar.read",
  "calendar.manage",
  "class.manage",
  "session.manage",
  // Presensi
  "attendance.scan",
  "attendance.manual",
  "attendance.self_checkin",
  "attendance.read",
  // Penilaian dan sertifikat
  "assessment.manage",
  "assessment.read",
  "certificate.override",
  // Laporan
  "report.attendance",
  "report.members",
  // Kas
  "finance.read",
  "finance.manage",
  "finance.verify",
  "finance.report",
  "invoice.read",
  "payment.submit",
  // Notifikasi
  "notification.preferences",
] as const;
export type Action = (typeof ACTIONS)[number];

/** Aksi koordinator, hanya untuk resource di divisi yang dikoordinasinya. */
const COORDINATOR_DIVISION_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "member.list",
  "member.read",
  "member.read_contact",
  "card.view",
  "card.print",
  "class.manage",
  "session.manage",
  "attendance.scan",
  "attendance.manual",
  "attendance.read",
  "assessment.manage",
  "assessment.read",
  "certificate.override",
  "report.attendance",
  "report.members",
]);

/** Modul kas untuk bendahara (tanpa syarat divisi). */
const TREASURER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "finance.read",
  "finance.manage",
  "finance.verify",
  "finance.report",
  "invoice.read",
]);

/** Aksi anggota atas resource miliknya sendiri. */
const OWN_RESOURCE_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "member.read",
  "card.view",
  "attendance.self_checkin",
  "attendance.read",
  "assessment.read",
  "invoice.read",
  "payment.submit",
  "notification.preferences",
]);

/** Aksi yang boleh untuk semua anggota tanpa resource tertentu. */
const ANY_MEMBER_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "calendar.read",
]);

function canAsCoordinator(
  user: SessionUser,
  action: Action,
  resource: Resource | undefined,
): boolean {
  if (!COORDINATOR_DIVISION_ACTIONS.has(action)) return false;
  const divisionId = resource?.divisionId;
  return (
    divisionId !== undefined && user.coordinatorDivisionIds.includes(divisionId)
  );
}

function canAsTreasurer(action: Action, resource: Resource | undefined): boolean {
  if (TREASURER_ACTIONS.has(action)) return true;
  // Bendahara hanya melihat kontak anggota yang menunggak.
  return action === "member.read_contact" && resource?.hasArrears === true;
}

function canAsMember(
  user: SessionUser,
  action: Action,
  resource: Resource | undefined,
): boolean {
  if (ANY_MEMBER_ACTIONS.has(action)) return true;
  return (
    OWN_RESOURCE_ACTIONS.has(action) &&
    resource?.memberId !== undefined &&
    resource.memberId === user.id
  );
}

export function can(
  user: SessionUser | null | undefined,
  action: Action,
  resource?: Resource,
): boolean {
  if (!user) return false;
  for (const role of user.roles) {
    switch (role) {
      case "admin":
        return true;
      case "koordinator":
        if (canAsCoordinator(user, action, resource)) return true;
        break;
      case "bendahara":
        if (canAsTreasurer(action, resource)) return true;
        break;
      case "anggota":
        if (canAsMember(user, action, resource)) return true;
        break;
    }
  }
  return false;
}

export function requiresTwoFactor(user: SessionUser): boolean {
  return user.roles.some((r) => PRIVILEGED_ROLES.includes(r));
}

export class ForbiddenError extends Error {
  constructor(action: Action) {
    super(`Tidak berwenang: ${action}`);
    this.name = "ForbiddenError";
  }
}

/** Lempar ForbiddenError bila tidak berwenang. Dipakai di Server Actions. */
export function assertCan(
  user: SessionUser | null | undefined,
  action: Action,
  resource?: Resource,
): asserts user is SessionUser {
  if (!can(user, action, resource)) throw new ForbiddenError(action);
}
