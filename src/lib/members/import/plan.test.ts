import { describe, expect, test } from "bun:test";
import { formatMemberCode } from "../member-code";
import {
  type BatchState,
  type ImportContext,
  matchDivision,
  normalizeBatch,
  planImport,
  type RawImportRow,
} from "./plan";

const DIVISIONS = [
  { id: "d-web", name: "Web Development", slug: "web-development" },
  { id: "d-ml", name: "Machine Learning", slug: "machine-learning" },
  { id: "d-ui", name: "UI/UX", slug: "ui-ux" },
];

function ctx(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    divisions: DIVISIONS,
    existingEmails: new Set(),
    existingPhones: new Set(),
    existingCodes: new Set(),
    batches: new Map(),
    currentYear: "26",
    ...overrides,
  };
}

function batchState(partial: Partial<BatchState>): BatchState {
  return { lastSeq: 0, yearCounts: {}, seqToCode: new Map(), ...partial };
}

let counter = 0;
function row(
  values: Partial<Record<"nama" | "email" | "no_hp" | "divisi" | "batch" | "kode_id", string>>,
  rowNumber?: number,
): RawImportRow {
  counter += 1;
  const n = rowNumber ?? counter + 1;
  return {
    rowNumber: n,
    values: {
      nama: `Anggota ${n}`,
      email: `anggota${n}@contoh.com`,
      no_hp: `0812${String(n).padStart(8, "0")}`,
      divisi: "Web Development",
      batch: "01",
      ...values,
    },
  };
}

describe("matchDivision dan normalizeBatch", () => {
  test.each([
    ["Web Development", "d-web"],
    ["web development", "d-web"],
    ["web-development", "d-web"],
    ["Web Dev", "d-web"],
    ["Machine Learning", "d-ml"],
    ["ML", "d-ml"],
    ["UI/UX", "d-ui"],
    ["ui ux", "d-ui"],
    ["UI-UX", "d-ui"],
  ])("%p -> %p", (input, id) => {
    expect(matchDivision(input, DIVISIONS)?.id).toBe(id);
  });

  test("divisi asing atau kosong tidak cocok", () => {
    expect(matchDivision("Data Science", DIVISIONS)).toBeNull();
    expect(matchDivision("", DIVISIONS)).toBeNull();
  });

  test("batch", () => {
    expect(normalizeBatch("01")).toBe("01");
    expect(normalizeBatch(" 1 ")).toBe("01");
    expect(normalizeBatch("12")).toBe("12");
    expect(normalizeBatch("00")).toBeNull();
    expect(normalizeBatch("001")).toBeNull();
    expect(normalizeBatch("A1")).toBeNull();
    expect(normalizeBatch("")).toBeNull();
  });
});

describe("planImport: validasi baris", () => {
  test("baris valid dengan kode dari file", () => {
    const plan = planImport(
      [
        {
          rowNumber: 2,
          values: {
            nama: "  Budi   Santoso ",
            email: " Budi@Contoh.COM ",
            no_hp: "0812-3456-7890",
            divisi: "UI/UX",
            batch: "1",
            kode_id: "ISC2601009",
          },
        },
      ],
      ctx(),
    );
    expect(plan.rows[0]?.errors).toEqual([]);
    expect(plan.rows[0]?.member).toEqual({
      fullName: "Budi Santoso",
      email: "budi@contoh.com",
      phone: "+6281234567890",
      divisionId: "d-ui",
      divisionName: "UI/UX",
      batch: "01",
      memberCode: "ISC2601009",
      codeSource: "file",
    });
    expect(plan.counters).toEqual([{ batch: "01", lastSeq: 9 }]);
    expect(plan.okCount).toBe(1);
  });

  test("kolom wajib kosong atau salah ditolak", () => {
    const plan = planImport(
      [row({ nama: "  ", email: "bukan-email", no_hp: "021555", divisi: "Data", batch: "x" })],
      ctx(),
    );
    const r = plan.rows[0];
    expect(r?.member).toBeNull();
    expect(r?.errors).toHaveLength(5);
    expect(plan.errorCount).toBe(1);
  });

  test("kode tidak valid dan batch tidak cocok ditolak", () => {
    const plan = planImport(
      [row({ kode_id: "ISC26010" }), row({ kode_id: "ISC2602001", batch: "01" })],
      ctx(),
    );
    expect(plan.rows[0]?.errors.join()).toContain("ISC + 7 digit");
    expect(plan.rows[1]?.errors.join()).toContain("Digit batch");
  });

  test("duplikat email, HP, dan kode di dalam file ditolak di semua baris terkait", () => {
    const plan = planImport(
      [
        row({ email: "sama@contoh.com", kode_id: "ISC2601001" }, 2),
        row({ email: "SAMA@contoh.com", kode_id: "ISC2601002" }, 3),
        row({ no_hp: "081200000099", kode_id: "ISC2601003" }, 4),
        row({ no_hp: "+6281200000099", kode_id: "ISC2601004" }, 5),
        row({ kode_id: "ISC2601010" }, 6),
        row({ kode_id: "ISC2601010" }, 7),
      ],
      ctx(),
    );
    expect(plan.rows.map((r) => r.member)).toEqual([null, null, null, null, null, null]);
    expect(plan.rows[0]?.errors).toContain("Email sama dengan baris 3.");
    expect(plan.rows[1]?.errors).toContain("Email sama dengan baris 2.");
    expect(plan.rows[3]?.errors).toContain("No. HP sama dengan baris 4.");
    expect(plan.rows[5]?.errors).toContain("kode_id sama dengan baris 6.");
  });

  test("bentrok dengan data yang sudah ada ditolak", () => {
    const plan = planImport(
      [row({ email: "lama@contoh.com", no_hp: "081211112222", kode_id: "ISC2601001" })],
      ctx({
        existingEmails: new Set(["lama@contoh.com"]),
        existingPhones: new Set(["+6281211112222"]),
        existingCodes: new Set(["ISC2601001"]),
      }),
    );
    expect(plan.rows[0]?.errors).toEqual([
      "Email sudah terdaftar.",
      "No. HP sudah terdaftar.",
      "kode_id sudah dipakai anggota lain.",
    ]);
    expect(plan.counters).toEqual([]);
  });

  test("nama dirapikan dicatat, huruf kapital semua diberi peringatan", () => {
    const plan = planImport(
      [row({ nama: "Budi  Santoso", kode_id: "ISC2601001" }), row({ nama: "SITI AMINAH", kode_id: "ISC2601002" })],
      ctx(),
    );
    expect(plan.rows[0]?.infos).toHaveLength(1);
    expect(plan.rows[0]?.warnings).toEqual([]);
    expect(plan.rows[1]?.warnings).toHaveLength(1);
    expect(plan.rows[1]?.member?.fullName).toBe("SITI AMINAH");
    expect(plan.okCount).toBe(1);
    expect(plan.warningCount).toBe(1);
  });
});

describe("planImport: kode ID", () => {
  test("data awal: urutan 1-84 tanpa 21, dua baris tanpa kode mendapat 085 dan 086", () => {
    const rows: RawImportRow[] = [];
    let n = 2;
    for (let seq = 1; seq <= 84; seq++) {
      if (seq === 21) continue;
      if (seq === 40) rows.push(row({ kode_id: "" }, n++)); // tanpa kode di tengah
      rows.push(row({ kode_id: formatMemberCode({ year: "26", batch: "01", seq }) }, n++));
    }
    rows.push(row({ kode_id: "" }, n++)); // tanpa kode di akhir

    const plan = planImport(rows, ctx());
    expect(plan.errorCount).toBe(0);
    const auto = plan.rows.filter((r) => r.member?.codeSource === "auto");
    expect(auto.map((r) => r.member?.memberCode)).toEqual(["ISC2601085", "ISC2601086"]);
    expect(auto[0]!.rowNumber).toBeLessThan(auto[1]!.rowNumber);
    expect(plan.counters).toEqual([{ batch: "01", lastSeq: 86 }]);
  });

  test("prefiks tahun minoritas diberi peringatan, tetap diimpor", () => {
    const plan = planImport(
      [
        row({ kode_id: "ISC2601001" }),
        row({ kode_id: "ISC2601002" }),
        row({ kode_id: "ISC2501003" }),
      ],
      ctx(),
    );
    expect(plan.rows[2]?.member?.memberCode).toBe("ISC2501003");
    expect(plan.rows[2]?.warnings.join()).toContain("ISC25");
    expect(plan.rows[2]?.warnings.join()).toContain("ISC26");
    expect(plan.rows[0]?.warnings).toEqual([]);
    expect(plan.warningCount).toBe(1);
  });

  test("prefiks mayoritas juga memperhitungkan anggota yang sudah ada", () => {
    const plan = planImport(
      [row({ kode_id: "ISC2501050" }), row({ kode_id: "" })],
      ctx({ batches: new Map([["01", batchState({ lastSeq: 49, yearCounts: { "26": 10 } })]]) }),
    );
    expect(plan.rows[0]?.warnings.join()).toContain("ISC26");
    expect(plan.rows[1]?.member?.memberCode).toBe("ISC2601051");
  });

  test("kode otomatis melanjutkan counter di database", () => {
    const plan = planImport(
      [row({ kode_id: "" })],
      ctx({ batches: new Map([["01", batchState({ lastSeq: 90, yearCounts: { "26": 80 } })]]) }),
    );
    expect(plan.rows[0]?.member?.memberCode).toBe("ISC2601091");
    expect(plan.counters).toEqual([{ batch: "01", lastSeq: 91 }]);
  });

  test("nomor dari baris yang ditolak tetap dicadangkan", () => {
    const plan = planImport(
      [row({ kode_id: "ISC2601095", email: "salah" }), row({ kode_id: "" })],
      ctx(),
    );
    expect(plan.rows[0]?.member).toBeNull();
    expect(plan.rows[1]?.member?.memberCode).toBe("ISC2601096");
    expect(plan.counters).toEqual([{ batch: "01", lastSeq: 96 }]);
  });

  test("baris ditolak tanpa kode tidak memakai nomor", () => {
    const plan = planImport(
      [row({ kode_id: "", email: "salah" }), row({ kode_id: "" })],
      ctx(),
    );
    expect(plan.rows[1]?.member?.memberCode).toBe("ISC2601001");
  });

  test("batch baru memakai tahun berjalan", () => {
    const plan = planImport([row({ batch: "02", kode_id: "" })], ctx({ currentYear: "27" }));
    expect(plan.rows[0]?.member?.memberCode).toBe("ISC2702001");
  });

  test("nomor urut habis ditolak", () => {
    const plan = planImport(
      [row({ kode_id: "" })],
      ctx({ batches: new Map([["01", batchState({ lastSeq: 999 })]]) }),
    );
    expect(plan.rows[0]?.member).toBeNull();
    expect(plan.rows[0]?.errors.join()).toContain("999");
  });

  test("nomor urut sama dengan kode lain di batch yang sama diberi peringatan", () => {
    const plan = planImport(
      [row({ kode_id: "ISC2601023" })],
      ctx({
        batches: new Map([
          ["01", batchState({ lastSeq: 23, yearCounts: { "25": 1 }, seqToCode: new Map([[23, "ISC2501023"]]) })],
        ]),
      }),
    );
    expect(plan.rows[0]?.member?.memberCode).toBe("ISC2601023");
    expect(plan.rows[0]?.warnings.join()).toContain("ISC2501023");
  });

  test("urutan baris dipakai walau input tidak berurutan", () => {
    const plan = planImport(
      [row({ kode_id: "" }, 9), row({ kode_id: "" }, 3)],
      ctx(),
    );
    expect(plan.rows.map((r) => [r.rowNumber, r.member?.memberCode])).toEqual([
      [3, "ISC2601001"],
      [9, "ISC2601002"],
    ]);
  });
});
