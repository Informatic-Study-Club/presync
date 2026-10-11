import { describe, expect, test } from "bun:test";
import { buildBreadcrumbs } from "@/lib/breadcrumbs";

const labels = (path: string) => buildBreadcrumbs(path).map((c) => c.label);
const hrefs = (path: string) => buildBreadcrumbs(path).map((c) => c.href);

describe("buildBreadcrumbs", () => {
  test("beranda hanya satu langkah", () => {
    expect(labels("/")).toEqual(["Beranda"]);
  });

  test("halaman menu langsung di bawah Beranda", () => {
    expect(labels("/kalender")).toEqual(["Beranda", "Kalender"]);
    expect(labels("/laporan")).toEqual(["Beranda", "Laporan"]);
  });

  test("sub-halaman Kas mengikuti menu Kas, bukan Tagihan", () => {
    expect(labels("/kas/buku")).toEqual(["Beranda", "Kas", "Buku kas"]);
    expect(hrefs("/kas/buku")).toEqual(["/", "/kas/kelola", "/kas/buku"]);
  });

  test("segmen statis menang atas :id", () => {
    expect(labels("/anggota/impor")).toEqual(["Beranda", "Anggota", "Impor"]);
    expect(labels("/anggota/baru")).toEqual(["Beranda", "Anggota", "Tambah Anggota"]);
    expect(labels("/kelas/baru")).toEqual(["Beranda", "Kelas", "Kelas baru"]);
    expect(labels("/presensi/arsip")).toEqual(["Beranda", "Arsip Presensi"]);
  });

  test("rute dinamis bertingkat membawa id ke induknya", () => {
    expect(buildBreadcrumbs("/kelas/abc/penilaian")).toEqual([
      { label: "Beranda", href: "/" },
      { label: "Kelas", href: "/kelas" },
      { label: "Detail kelas", href: "/kelas/abc" },
      { label: "Penilaian", href: "/kelas/abc/penilaian" },
    ]);
    expect(hrefs("/presensi/s1/pindai")).toEqual(["/", "/kelas", "/presensi/s1", "/presensi/s1/pindai"]);
  });

  test("garis miring di akhir diabaikan", () => {
    expect(labels("/anggota/")).toEqual(["Beranda", "Anggota"]);
  });

  test("path tak dikenal kembali ke Beranda", () => {
    expect(labels("/tidak-ada/sama-sekali")).toEqual(["Beranda"]);
  });
});
