import { describe, expect, test } from "bun:test";
import type { AttendanceSummary } from "@/lib/attendance/summary";
import { evaluateCertificate, finalStatus, type ScoreEntry } from "./evaluate";
import {
  certificateRuleSchema,
  componentKey,
  EMPTY_RULE,
  parseRule,
  parseScoreInput,
  totalWeight,
  totalWeightWith,
  WEB_DEV_TEMPLATE,
} from "./rules";

const { components, rule } = WEB_DEV_TEMPLATE;

function attendance(hadir: number, izin: number, sakit = 0, tidakHadir = 0): AttendanceSummary {
  const counted = hadir + izin + sakit + tidakHadir;
  return {
    hadir,
    izin,
    sakit,
    tidakHadir,
    counted,
    percent: counted > 0 ? Math.round((hadir / counted) * 1000) / 10 : null,
  };
}

function scores(kelompok: number | null, individu: number | null, project: number | null): Map<string, ScoreEntry> {
  return new Map([
    ["tugas_kelompok", { value: kelompok, done: null }],
    ["tugas_individu", { value: individu, done: null }],
    ["project_akhir", { value: project, done: null }],
  ]);
}

describe("templat Web Development", () => {
  test("bobot total 100 dan aturan valid", () => {
    expect(totalWeight(components)).toBe(100);
    expect(certificateRuleSchema.parse(rule)).toEqual(rule);
  });
});

describe("evaluateCertificate: kasus Web Dev", () => {
  test("lolos: semua tugas terisi, izin <= 3, skor >= 70", () => {
    // 0,2*80 + 0,2*75 + 0,4*85 + 0,2*(6/7*100) = 16 + 15 + 34 + 17,14 = 82,14
    const result = evaluateCertificate(rule, components, scores(80, 75, 85), attendance(6, 1));
    expect(result.status).toBe("eligible");
    expect(result.finalScore).toBeCloseTo(82.14, 2);
    expect(result.reasons).toEqual([]);
  });

  test("bobot absen ikut dihitung (rumus Sheets lama melewatkannya)", () => {
    // Tanpa absen: 16 + 15 + 34 = 65 (< 70). Dengan absen 100%: 85.
    const result = evaluateCertificate(rule, components, scores(80, 75, 85), attendance(7, 0));
    expect(result.componentValues.absensi).toBe(100);
    expect(result.finalScore).toBe(85);
    expect(result.status).toBe("eligible");
  });

  test("tidak lolos: izin 4 melebihi batas 3", () => {
    const result = evaluateCertificate(rule, components, scores(90, 90, 90), attendance(3, 4));
    expect(result.status).toBe("not_eligible");
    expect(result.reasons).toContain("izin 4 melebihi batas 3");
  });

  test("izin tepat 3 masih boleh", () => {
    const result = evaluateCertificate(rule, components, scores(90, 90, 90), attendance(4, 3));
    expect(result.reasons.some((r) => r.startsWith("izin"))).toBe(false);
  });

  test("tidak lolos: tugas belum terisi", () => {
    const result = evaluateCertificate(rule, components, scores(90, null, 90), attendance(7, 0));
    expect(result.status).toBe("not_eligible");
    expect(result.reasons).toContain("Tugas individu belum selesai/terisi");
  });

  test("tidak lolos: skor di bawah 70", () => {
    // 0,2*60 + 0,2*60 + 0,4*60 + 0,2*(5/7*100) = 12 + 12 + 24 + 14,29 = 62,29
    const result = evaluateCertificate(rule, components, scores(60, 60, 60), attendance(5, 0, 1, 1));
    expect(result.finalScore).toBeCloseTo(62.29, 2);
    expect(result.reasons).toContain("skor 62,29 di bawah minimal 70");
  });

  test("skor tepat 70 lolos", () => {
    // 0,2*70 + 0,2*70 + 0,4*70 + 0,2*70 dengan kehadiran 70%? Gunakan absen 10 dari 10 = 100:
    // 14 + 14 + 0,4*x + 20 = 70 -> x = 55
    const result = evaluateCertificate(rule, components, scores(70, 70, 55), attendance(10, 0));
    expect(result.finalScore).toBe(70);
    expect(result.status).toBe("eligible");
  });

  test("beberapa alasan sekaligus", () => {
    const result = evaluateCertificate(rule, components, scores(null, null, 10), attendance(1, 5));
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
  });
});

describe("evaluateCertificate: aturan lain", () => {
  test("done_flag dan kehadiran minimal", () => {
    const defs = [
      { key: "tugas", name: "Tugas", kind: "done_flag" as const, weight: 50 },
      { key: "absen", name: "Absen", kind: "attendance" as const, weight: 50 },
    ];
    const r = { ...EMPTY_RULE, requireAllComponents: ["tugas"], minAttendancePercent: 75 };
    const done = new Map([["tugas", { value: null, done: true }]]);
    expect(evaluateCertificate(r, defs, done, attendance(6, 2)).reasons).toEqual([]); // tepat 75% lolos
    expect(evaluateCertificate(r, defs, done, attendance(5, 3)).reasons).toEqual(["kehadiran 62,5% di bawah minimal 75%"]);
    expect(evaluateCertificate(r, defs, new Map(), attendance(8, 0)).reasons).toEqual(["Tugas belum selesai/terisi"]);
  });

  test("belum ada sesi selesai", () => {
    const r = { ...EMPTY_RULE, minAttendancePercent: 50 };
    expect(evaluateCertificate(r, [], new Map(), attendance(0, 0)).reasons).toEqual(["belum ada sesi selesai untuk dihitung"]);
  });

  test("tanpa aturan dan tanpa komponen: lolos", () => {
    expect(evaluateCertificate(EMPTY_RULE, [], new Map(), attendance(0, 0)).status).toBe("eligible");
  });

  test("bobot tidak 100 membuat tidak lolos", () => {
    const defs = [{ key: "a", name: "A", kind: "score" as const, weight: 60 }];
    const result = evaluateCertificate(EMPTY_RULE, defs, new Map([["a", { value: 100, done: null }]]), attendance(1, 0));
    expect(result.reasons).toEqual(["total bobot komponen belum 100%"]);
  });

  test("penimpaan status", () => {
    expect(finalStatus({ status: "not_eligible" }, { status: "eligible" })).toBe("eligible");
    expect(finalStatus({ status: "eligible" }, null)).toBe("eligible");
  });
});

describe("utilitas", () => {
  test("kunci komponen", () => {
    expect(componentKey("Tugas Kelompok 1")).toBe("tugas_kelompok_1");
    expect(componentKey("  UI/UX - Final  ")).toBe("uiux_final");
    expect(componentKey("!!!")).toBe("komponen");
  });

  test("input nilai", () => {
    expect(parseScoreInput("85")).toBe(85);
    expect(parseScoreInput("85,5")).toBe(85.5);
    expect(parseScoreInput("85.25")).toBe(85.25);
    expect(parseScoreInput("")).toBeNull();
    expect(parseScoreInput("101")).toBeUndefined();
    expect(parseScoreInput("-1")).toBeUndefined();
    expect(parseScoreInput("abc")).toBeUndefined();
  });

  test("aturan rusak di database dianggap kosong", () => {
    expect(parseRule({ maxIzin: "tiga" })).toEqual(EMPTY_RULE);
    expect(parseRule({ maxIzin: 3 })).toEqual({ ...EMPTY_RULE, maxIzin: 3 });
  });
});

describe("totalWeightWith", () => {
  const comps = [
    { id: "a", weight: 30 },
    { id: "b", weight: 50 },
    { id: "c", weight: 20 },
  ];

  test("mengganti bobot satu komponen", () => {
    expect(totalWeightWith(comps, "b", 40)).toBe(90);
    expect(totalWeightWith(comps, "b", 60)).toBe(110);
  });

  test("id tak dikenal tidak mengubah total", () => {
    expect(totalWeightWith(comps, "x", 99)).toBe(100);
  });
});
