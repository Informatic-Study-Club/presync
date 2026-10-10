import { id as t } from "@/messages/id";

// Breadcrumb dari path halaman. Setiap rute menyebut induknya, sehingga
// halaman bertingkat (misalnya pemindai sesi) tetap menunjukkan jalur menu.
// Segmen dinamis ditulis ":id" dan diganti nilai sebenarnya saat membuat href.

export type Crumb = { label: string; href: string };

type RouteDef = { label: string; parent?: string };

const b = t.breadcrumb;

const ROUTES: Record<string, RouteDef> = {
  "/": { label: t.nav.home },
  "/kalender": { label: t.nav.calendar, parent: "/" },
  "/kalender/kelola": { label: b.manage, parent: "/kalender" },
  "/kelas": { label: t.nav.classes, parent: "/" },
  "/kelas/baru": { label: b.newClass, parent: "/kelas" },
  "/kelas/:id": { label: b.classDetail, parent: "/kelas" },
  "/kelas/:id/penilaian": { label: b.assessment, parent: "/kelas/:id" },
  "/kegiatan/baru": { label: b.newActivity, parent: "/kelas" },
  "/presensi/:id": { label: b.sessionAttendance, parent: "/kelas" },
  "/presensi/:id/pindai": { label: b.scanner, parent: "/presensi/:id" },
  "/presensi/arsip": { label: t.nav.archive, parent: "/" },
  "/checkin": { label: t.nav.checkin, parent: "/" },
  "/kartu": { label: t.nav.myCard, parent: "/" },
  "/kas": { label: t.nav.bills, parent: "/" },
  "/kas/kelola": { label: t.nav.finance, parent: "/" },
  "/kas/verifikasi": { label: b.verify, parent: "/kas/kelola" },
  "/kas/buku": { label: b.ledger, parent: "/kas/kelola" },
  "/kas/tunggakan": { label: b.arrears, parent: "/kas/kelola" },
  "/anggota": { label: t.nav.members, parent: "/" },
  "/anggota/impor": { label: t.nav.import, parent: "/anggota" },
  "/anggota/:id": { label: b.memberProfile, parent: "/anggota" },
  "/laporan": { label: t.nav.reports, parent: "/" },
  "/notifikasi": { label: t.nav.notifications, parent: "/" },
  "/privasi": { label: t.nav.privacy, parent: "/" },
  "/admin/permintaan-data": { label: t.nav.dataRequests, parent: "/" },
};

/** Cocokkan path dengan pola; segmen statis menang atas ":id". */
function matchRoute(pathname: string): { pattern: string; params: string[] } | null {
  const segments = pathname.split("/").filter(Boolean);
  let best: { pattern: string; params: string[]; dynamic: number } | null = null;
  for (const pattern of Object.keys(ROUTES)) {
    const parts = pattern.split("/").filter(Boolean);
    if (parts.length !== segments.length) continue;
    const params: string[] = [];
    let dynamic = 0;
    const ok = parts.every((part, i) => {
      if (part === ":id") {
        params.push(segments[i] ?? "");
        dynamic += 1;
        return true;
      }
      return part === segments[i];
    });
    if (ok && (!best || dynamic < best.dynamic)) best = { pattern, params, dynamic };
  }
  return best ? { pattern: best.pattern, params: best.params } : null;
}

function fill(pattern: string, id: string | undefined): string {
  return id === undefined ? pattern : pattern.replace(":id", id);
}

/** Jalur dari Beranda sampai halaman ini. Path tak dikenal: hanya Beranda. */
export function buildBreadcrumbs(pathname: string): Crumb[] {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const match = matchRoute(clean);
  if (!match) return [{ label: t.nav.home, href: "/" }];

  const id = match.params[0];
  const chain: Crumb[] = [];
  let pattern: string | undefined = match.pattern;
  // Batas langkah menjaga dari induk melingkar karena salah ketik di ROUTES.
  for (let guard = 0; pattern && guard < 10; guard++) {
    const route: RouteDef | undefined = ROUTES[pattern];
    if (!route) break;
    chain.unshift({ label: route.label, href: fill(pattern, id) });
    pattern = route.parent;
  }
  return chain;
}
