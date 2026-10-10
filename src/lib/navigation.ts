import { type Action, can, canInAnyDivision, type SessionUser } from "@/lib/authz";
import { id as t } from "@/messages/id";

// Menu aplikasi berbasis izin (RBAC). Setiap item menyebut aksi yang
// dibutuhkan; yang tampil hanya item yang lolos can(). Menu hanya petunjuk:
// setiap halaman tetap memeriksa izinnya sendiri.

export type NavIcon =
  | "home"
  | "calendar"
  | "classes"
  | "checkin"
  | "card"
  | "bills"
  | "finance"
  | "members"
  | "import"
  | "archive"
  | "reports"
  | "notifications"
  | "privacy"
  | "dataRequests";

type Requirement =
  | { kind: "always" }
  | { kind: "action"; action: Action }
  /** Aksi berbasis divisi: cukup berwenang di salah satu divisi. */
  | { kind: "anyDivision"; action: Action };

type NavItemDef = {
  href: string;
  label: string;
  icon: NavIcon;
  requires: Requirement;
  /** Awalan path lain yang juga menandai item ini aktif. */
  match?: readonly string[];
};

type NavGroupDef = { id: string; label: string; items: readonly NavItemDef[] };

export type NavItem = Omit<NavItemDef, "requires">;
export type NavGroup = { id: string; label: string; items: NavItem[] };

const always: Requirement = { kind: "always" };

const NAV: readonly NavGroupDef[] = [
  {
    id: "utama",
    label: t.nav.groups.main,
    items: [
      { href: "/", label: t.nav.home, icon: "home", requires: always },
      { href: "/kalender", label: t.nav.calendar, icon: "calendar", requires: always },
      { href: "/kelas", label: t.nav.classes, icon: "classes", requires: always, match: ["/kegiatan", "/presensi/"] },
      { href: "/checkin", label: t.nav.checkin, icon: "checkin", requires: always },
      { href: "/kartu", label: t.nav.myCard, icon: "card", requires: always },
    ],
  },
  {
    id: "keuangan",
    label: t.nav.groups.finance,
    items: [
      { href: "/kas", label: t.nav.bills, icon: "bills", requires: always },
      {
        href: "/kas/kelola",
        label: t.nav.finance,
        icon: "finance",
        requires: { kind: "action", action: "finance.read" },
        match: ["/kas/verifikasi", "/kas/buku", "/kas/tunggakan"],
      },
    ],
  },
  {
    id: "kelola",
    label: t.nav.groups.manage,
    items: [
      { href: "/anggota", label: t.nav.members, icon: "members", requires: { kind: "anyDivision", action: "member.list" } },
      { href: "/anggota/impor", label: t.nav.import, icon: "import", requires: { kind: "action", action: "member.import" } },
      { href: "/presensi/arsip", label: t.nav.archive, icon: "archive", requires: { kind: "action", action: "member.import" } },
      { href: "/laporan", label: t.nav.reports, icon: "reports", requires: always },
    ],
  },
  {
    id: "admin",
    label: t.nav.groups.admin,
    items: [
      {
        href: "/admin/permintaan-data",
        label: t.nav.dataRequests,
        icon: "dataRequests",
        requires: { kind: "action", action: "privacy.manage" },
      },
    ],
  },
  {
    id: "akun",
    label: t.nav.groups.account,
    items: [
      { href: "/notifikasi", label: t.nav.notifications, icon: "notifications", requires: always },
      { href: "/privasi", label: t.nav.privacy, icon: "privacy", requires: always },
    ],
  },
];

function allowed(user: SessionUser, req: Requirement, divisionIds: readonly string[]): boolean {
  switch (req.kind) {
    case "always":
      return true;
    case "action":
      return can(user, req.action);
    case "anyDivision":
      return canInAnyDivision(user, req.action, divisionIds);
  }
}

/** Grup menu yang boleh dilihat user; grup tanpa item disembunyikan. */
export function buildNavigation(user: SessionUser, divisionIds: readonly string[]): NavGroup[] {
  return NAV.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items
      .filter((item) => allowed(user, item.requires, divisionIds))
      .map((item) => ({ href: item.href, label: item.label, icon: item.icon, match: item.match })),
  })).filter((group) => group.items.length > 0);
}

/**
 * Item yang aktif untuk sebuah path: kecocokan terpanjang menang, supaya
 * /kas/kelola tidak ikut menyalakan /kas, dan / hanya aktif di beranda.
 */
export function activeHref(groups: readonly NavGroup[], pathname: string): string | null {
  let best: { href: string; length: number } | null = null;
  for (const item of groups.flatMap((g) => g.items)) {
    for (const prefix of [item.href, ...(item.match ?? [])]) {
      const hit =
        prefix === "/"
          ? pathname === "/"
          : pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
      if (hit && (!best || prefix.length > best.length)) {
        best = { href: item.href, length: prefix.length };
      }
    }
  }
  return best?.href ?? null;
}
