import { describe, expect, test } from "bun:test";
import type { SheetRow } from "@/lib/members/import/parse";
import { type ArchiveMember, planArchiveImport } from "./archive";

const members = new Map<string, ArchiveMember>([
  ["ISC2601001", { id: "m1", divisionId: "d1", fullName: "Anggota Satu" }],
  ["ISC2601002", { id: "m2", divisionId: "d1", fullName: "Anggota Dua" }],
  ["ISC2601003", { id: "m3", divisionId: "d2", fullName: "Anggota Tiga" }],
]);

function table(rows: string[][]): SheetRow[] {
  return rows.map((cells, i) => ({ rowNumber: i + 1, cells }));
}

describe("impor arsip kehadiran", () => {
  test("format ringkasan", () => {
    const plan = planArchiveImport(
      table([
        ["kode_id", "nama", "Hadir", "Izin", "Sakit", "Tidak Hadir"],
        ["ISC2601001", "x", "5", "1", "", "1"],
      ]),
      members,
    );
    expect(plan.ok && plan.mode).toBe("summary");
    expect(plan.ok && plan.rows[0]).toMatchObject({
      memberId: "m1",
      counts: { hadir: 5, izin: 1, sakit: 0, tidakHadir: 1 },
      needsVerification: false,
      errors: [],
    });
  });

  test("format per pertemuan dengan nilai H/I/S/A", () => {
    const plan = planArchiveImport(
      table([
        ["kode_id", "P1", "P2", "P3", "P4", "P5", "P6", "P7"],
        ["ISC2601001", "H", "h", "I", "S", "A", "Hadir", "v"],
      ]),
      members,
    );
    expect(plan.ok && plan.rows[0]?.counts).toEqual({ hadir: 4, izin: 1, sakit: 1, tidakHadir: 1 });
  });

  test("pertemuan yang kosong untuk semua baris dianggap belum terisi (contoh ML-1)", () => {
    const plan = planArchiveImport(
      table([
        ["kode_id", "p1", "p2", "p3"],
        ["ISC2601001", "", "H", "H"],
        ["ISC2601002", "", "A", "H"],
      ]),
      members,
    );
    if (!plan.ok) throw new Error("plan gagal");
    expect(plan.rows[0]?.counts).toEqual({ hadir: 2, izin: 0, sakit: 0, tidakHadir: 0 });
    expect(plan.rows.every((r) => r.needsVerification)).toBe(true);
    expect(plan.rows[0]?.note).toContain("p1");
  });

  test("sel kosong sebagian membuat baris itu perlu verifikasi", () => {
    const plan = planArchiveImport(
      table([
        ["kode_id", "p1", "p2"],
        ["ISC2601001", "H", ""],
        ["ISC2601002", "H", "H"],
      ]),
      members,
    );
    if (!plan.ok) throw new Error("plan gagal");
    expect(plan.rows[0]?.needsVerification).toBe(true);
    expect(plan.rows[1]?.needsVerification).toBe(false);
  });

  test("kode tidak dikenal, ganda, dan nilai asing ditolak per baris", () => {
    const plan = planArchiveImport(
      table([
        ["kode_id", "p1"],
        ["ISC2699999", "H"],
        ["ISC2601002", "X"],
        ["ISC2601003", "H"],
        ["ISC2601003", "H"],
        ["", "H"],
      ]),
      members,
    );
    if (!plan.ok) throw new Error("plan gagal");
    expect(plan.rows.map((r) => r.errors.length > 0)).toEqual([true, true, true, true, true]);
    expect(plan.validCount).toBe(0);
  });

  test("angka ringkasan tidak valid ditolak", () => {
    const plan = planArchiveImport(table([["kode_id", "hadir"], ["ISC2601001", "-1"]]), members);
    expect(plan.ok && plan.rows[0]?.errors.length).toBe(1);
  });

  test("tanpa kolom kode atau kolom hitungan ditolak", () => {
    expect(planArchiveImport(table([["nama", "hadir"], ["x", "1"]]), members).ok).toBe(false);
    expect(planArchiveImport(table([["kode_id", "nama"], ["ISC2601001", "x"]]), members).ok).toBe(false);
  });
});
