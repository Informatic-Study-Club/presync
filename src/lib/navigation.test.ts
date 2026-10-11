import { describe, expect, test } from "bun:test";
import type { Role, SessionUser } from "@/lib/authz";
import { activeHref, buildNavigation } from "@/lib/navigation";

const DIVS = ["div-web", "div-ml", "div-ux"];

function user(roles: Role[], coordinatorDivisionIds: string[] = []): SessionUser {
  return { id: "u1", roles: ["anggota", ...roles], coordinatorDivisionIds };
}

function hrefs(u: SessionUser): string[] {
  return buildNavigation(u, DIVS).flatMap((g) => g.items.map((i) => i.href));
}

const MEMBER_MENU = ["/", "/kalender", "/kelas", "/checkin", "/kartu", "/kas", "/laporan", "/notifikasi", "/privasi"];

describe("buildNavigation (RBAC)", () => {
  test("anggota hanya melihat menu umum", () => {
    expect(hrefs(user([]))).toEqual(MEMBER_MENU);
  });

  test("grup tanpa item disembunyikan", () => {
    const ids = buildNavigation(user([]), DIVS).map((g) => g.id);
    expect(ids).not.toContain("admin");
    expect(ids).toEqual(["utama", "keuangan", "kelola", "akun"]);
  });

  test("bendahara mendapat menu Kas, bukan menu admin", () => {
    const h = hrefs(user(["bendahara"]));
    expect(h).toContain("/kas/kelola");
    expect(h).not.toContain("/anggota/impor");
    expect(h).not.toContain("/anggota/baru");
    expect(h).not.toContain("/admin/permintaan-data");
  });

  test("koordinator melihat Anggota untuk divisinya, tanpa Kas dan Impor", () => {
    const h = hrefs(user(["koordinator"], ["div-ml"]));
    expect(h).toContain("/anggota");
    expect(h).not.toContain("/kas/kelola");
    expect(h).not.toContain("/anggota/impor");
  });

  test("koordinator tanpa divisi tidak melihat Anggota", () => {
    expect(hrefs(user(["koordinator"]))).not.toContain("/anggota");
  });

  test("admin melihat semua menu", () => {
    const h = hrefs(user(["admin"]));
    for (const href of ["/kas/kelola", "/anggota", "/anggota/baru", "/anggota/impor", "/presensi/arsip", "/admin/permintaan-data"]) {
      expect(h).toContain(href);
    }
  });
});

describe("activeHref", () => {
  const nav = buildNavigation(user(["admin"]), DIVS);

  test.each([
    ["/", "/"],
    ["/kas", "/kas"],
    ["/kas/kelola", "/kas/kelola"],
    ["/kas/verifikasi", "/kas/kelola"],
    ["/anggota/123", "/anggota"],
    ["/anggota/impor", "/anggota/impor"],
    ["/anggota/baru", "/anggota/baru"],
    ["/kelas/abc/penilaian", "/kelas"],
    ["/kegiatan/baru", "/kelas"],
    ["/presensi/sesi-1/pindai", "/kelas"],
    ["/presensi/arsip", "/presensi/arsip"],
    ["/kalender/kelola", "/kalender"],
  ])("%s menyalakan %s", (path, expected) => {
    expect(activeHref(nav, path)).toBe(expected);
  });

  test("path tak dikenal tidak menyalakan apa pun", () => {
    expect(activeHref(nav, "/tidak-ada")).toBeNull();
    expect(activeHref(nav, "/kasir")).toBeNull();
  });
});
