import { describe, expect, test } from "bun:test";
import { parseScannedCard, signCardPayload } from "@/lib/cards/token";
import {
  CHECKIN_ALPHABET,
  checkinCodeFromBytes,
  evaluateScan,
  evaluateSelfCheckin,
  inferKeyboardSource,
  isEligible,
  type MemberForAttendance,
  normalizeCheckinCode,
  type SessionForAttendance,
  windowState,
} from "./rules";
import { detectRapidScans, summarizeAttendance } from "./summary";

const SECRET = "k".repeat(32);
const START = new Date("2026-10-15T08:30:00Z");
const END = new Date("2026-10-15T10:30:00Z");
const DURING = new Date("2026-10-15T09:00:00Z");
const MIN = 60_000;

const session: SessionForAttendance = {
  status: "scheduled",
  kind: "regular",
  mode: "offline",
  startsAt: START,
  endsAt: END,
  classId: "kelas-1",
  divisionId: "div-a",
};
const member: MemberForAttendance = {
  id: "m1",
  status: "aktif",
  divisionId: "div-a",
  cardVersion: 1,
  legacyCardAllowed: true,
  cardStatus: "active",
};

function scan(raw: string, overrides: Partial<Parameters<typeof evaluateScan>[0]> = {}) {
  return evaluateScan({
    card: parseScannedCard(raw, SECRET),
    member,
    session,
    enrolled: true,
    source: "camera",
    now: DURING,
    ...overrides,
  });
}

describe("jendela waktu", () => {
  test("scan dibuka 60 menit sebelum sampai 60 menit sesudah", () => {
    const w = { beforeMin: 60, afterMin: 60 };
    expect(windowState(session, new Date(START.getTime() - 61 * MIN), w)).toBe("not_yet");
    expect(windowState(session, new Date(START.getTime() - 60 * MIN), w)).toBe("open");
    expect(windowState(session, new Date(END.getTime() + 60 * MIN), w)).toBe("open");
    expect(windowState(session, new Date(END.getTime() + 61 * MIN), w)).toBe("closed");
  });
});

describe("evaluasi scan kartu", () => {
  test("kartu lama Code 128 diterima selama legacy_card_allowed", () => {
    expect(scan("ISC2601009")).toEqual({ ok: true, method: "scan_barcode" });
  });

  test("QR bertanda tangan dengan versi terbaru diterima", () => {
    const m = { ...member, cardVersion: 2, legacyCardAllowed: false };
    expect(scan(signCardPayload(SECRET, "ISC2601009", 2), { member: m })).toEqual({ ok: true, method: "scan_qr" });
  });

  test("kode diketik koordinator tercatat sebagai manual_entry", () => {
    expect(scan("ISC2601009", { source: "typed" })).toEqual({ ok: true, method: "manual_entry" });
  });

  test.each([
    ["sesi libur", { session: { ...session, status: "off" as const } }, "session_off"],
    ["terlalu awal", { now: new Date(START.getTime() - 2 * 60 * MIN) }, "session_not_open"],
    ["terlambat", { now: new Date(END.getTime() + 2 * 60 * MIN) }, "session_closed"],
    ["kode tidak dikenal", { member: null }, "unknown_card"],
    ["kartu lama setelah terbit ulang", { member: { ...member, legacyCardAllowed: false, cardVersion: 2 } }, "legacy_not_allowed"],
    ["kartu diblokir", { member: { ...member, cardStatus: "blocked" as const } }, "card_blocked"],
    ["anggota nonaktif", { member: { ...member, status: "alumni" as const } }, "member_inactive"],
    ["tidak terdaftar di kelas", { enrolled: false }, "not_eligible"],
  ])("%s ditolak", (_label, overrides, reason) => {
    expect(scan("ISC2601009", overrides)).toEqual({ ok: false, reason: reason as never });
  });

  test("QR versi lama ditolak", () => {
    const m = { ...member, cardVersion: 3, legacyCardAllowed: false };
    expect(scan(signCardPayload(SECRET, "ISC2601009", 2), { member: m })).toEqual({ ok: false, reason: "card_outdated" });
  });

  test("format asing dan tanda tangan palsu ditolak", () => {
    expect(scan("hello")).toEqual({ ok: false, reason: "invalid_format" });
    expect(scan(signCardPayload("x".repeat(32), "ISC2601009", 1))).toEqual({ ok: false, reason: "invalid_signature" });
  });

  test("sesi selesai masih bisa dipindai dalam jendela waktu", () => {
    expect(scan("ISC2601009", { session: { ...session, status: "done" } }).ok).toBe(true);
  });
});

describe("kelayakan", () => {
  test("kegiatan sesuai cakupan divisi", () => {
    const activity = { kind: "activity" as const, divisionId: null };
    expect(isEligible(activity, member, false)).toBe(true);
    expect(isEligible({ ...activity, divisionId: "div-a" }, member, false)).toBe(true);
    expect(isEligible({ ...activity, divisionId: "div-b" }, member, false)).toBe(false);
    expect(isEligible({ kind: "extra", divisionId: "div-a" }, member, false)).toBe(false);
  });
});

describe("check-in online", () => {
  const online = { ...session, mode: "online" as const };
  test("dibuka 15 menit sebelum sampai sesi selesai", () => {
    expect(evaluateSelfCheckin({ member, session: online, enrolled: true, now: new Date(START.getTime() - 15 * MIN) })).toEqual({ ok: true });
    expect(evaluateSelfCheckin({ member, session: online, enrolled: true, now: new Date(START.getTime() - 16 * MIN) })).toEqual({ ok: false, reason: "session_not_open" });
    expect(evaluateSelfCheckin({ member, session: online, enrolled: true, now: new Date(END.getTime() + MIN) })).toEqual({ ok: false, reason: "session_closed" });
  });
  test("sesi offline tidak bisa check-in online", () => {
    expect(evaluateSelfCheckin({ member, session, enrolled: true, now: DURING })).toEqual({ ok: false, reason: "not_online" });
  });
  test("hybrid boleh, anggota tidak terdaftar ditolak", () => {
    const hybrid = { ...session, mode: "hybrid" as const };
    expect(evaluateSelfCheckin({ member, session: hybrid, enrolled: true, now: DURING })).toEqual({ ok: true });
    expect(evaluateSelfCheckin({ member, session: hybrid, enrolled: false, now: DURING })).toEqual({ ok: false, reason: "not_eligible" });
  });
});

describe("kode check-in", () => {
  test("6 karakter dari alfabet tanpa karakter ambigu", () => {
    const code = checkinCodeFromBytes(new Uint8Array([0, 1, 2, 30, 31, 255]));
    expect(code).toHaveLength(6);
    expect([...code].every((c) => CHECKIN_ALPHABET.includes(c))).toBe(true);
    expect(CHECKIN_ALPHABET).not.toMatch(/[IL0O1]/);
  });
  test("normalisasi input", () => {
    expect(normalizeCheckinCode(" ab3-k7m ")).toBe("AB3K7M");
    expect(normalizeCheckinCode("AB3K7")).toBeNull();
    expect(normalizeCheckinCode("AB0K7M")).toBeNull();
  });
});

describe("sumber input keyboard", () => {
  test("pemindai mengetik sangat cepat", () => {
    expect(inferKeyboardSource([0, 8, 15, 24, 31, 40, 48, 55, 62, 70])).toBe("scanner");
    expect(inferKeyboardSource([0, 180, 350, 520, 700])).toBe("typed");
    expect(inferKeyboardSource([0, 5])).toBe("typed");
  });
});

describe("ringkasan kehadiran", () => {
  const sessions = [
    { id: "s1", status: "done" as const },
    { id: "s2", status: "done" as const },
    { id: "s3", status: "done" as const },
    { id: "s4", status: "off" as const },
    { id: "s5", status: "scheduled" as const },
    { id: "s6", status: "done" as const },
  ];

  test("libur tidak masuk penyebut, sesi done tanpa catatan dihitung Tidak Hadir", () => {
    const summary = summarizeAttendance(
      sessions,
      new Map([
        ["s1", "hadir"],
        ["s2", "izin"],
        ["s4", "hadir"],
        ["s5", "hadir"],
        ["s6", "hadir"],
      ]),
    );
    expect(summary).toEqual({ hadir: 2, izin: 1, sakit: 0, tidakHadir: 1, counted: 4, percent: 50 });
  });

  test("belum ada sesi selesai", () => {
    expect(summarizeAttendance([{ id: "a", status: "scheduled" }], new Map()).percent).toBeNull();
  });

  test("persentase satu desimal", () => {
    const three = [
      { id: "a", status: "done" as const },
      { id: "b", status: "done" as const },
      { id: "c", status: "done" as const },
    ];
    expect(summarizeAttendance(three, new Map([["a", "hadir"]])).percent).toBe(33.3);
  });
});

describe("deteksi scan beruntun", () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 15, 9, 0, s));
  test("dua scan dari perangkat yang sama < 2 detik ditandai", () => {
    const flagged = detectRapidScans([
      { id: "a", recordedAt: at(0), method: "scan_barcode", deviceId: "d1", recordedBy: "k" },
      { id: "b", recordedAt: at(1), method: "scan_barcode", deviceId: "d1", recordedBy: "k" },
      { id: "c", recordedAt: at(10), method: "scan_barcode", deviceId: "d1", recordedBy: "k" },
      { id: "d", recordedAt: at(10), method: "scan_qr", deviceId: "d2", recordedBy: "k" },
      { id: "e", recordedAt: at(11), method: "manual", deviceId: "d2", recordedBy: "k" },
      { id: "f", recordedAt: at(11), method: "self_checkin", deviceId: null, recordedBy: "m" },
    ]);
    expect([...flagged].sort()).toEqual(["a", "b"]);
  });
});
