import { describe, expect, test } from "bun:test";
import type { SessionUser } from "@/lib/authz";
import { buildIcsFeed } from "./ics";
import { generateRegularSessions, isWithin, overlaps } from "./schedule";
import {
  addDays,
  isDateString,
  isThursdayInJakarta,
  isTimeString,
  jakartaToUtc,
  toJakarta,
  todayInJakarta,
} from "./time";
import { canSeeCalendarEvent, canSeeSession, type Viewer } from "./visibility";

describe("waktu Asia/Jakarta", () => {
  test("WIB ke UTC dan sebaliknya", () => {
    expect(jakartaToUtc("2026-10-15", "13:30").toISOString()).toBe("2026-10-15T06:30:00.000Z");
    expect(jakartaToUtc("2026-10-15", "03:00").toISOString()).toBe("2026-10-14T20:00:00.000Z");
    expect(toJakarta(new Date("2026-10-14T20:00:00Z"))).toEqual({
      date: "2026-10-15",
      time: "03:00",
      isoWeekday: 4,
    });
  });

  test("Kamis dihitung dalam WIB, bukan UTC", () => {
    // Kamis 01:00 WIB = Rabu 18:00 UTC
    expect(isThursdayInJakarta(new Date("2026-10-14T18:00:00Z"))).toBe(true);
    expect(isThursdayInJakarta(new Date("2026-10-15T17:30:00Z"))).toBe(false); // Jumat 00:30 WIB
  });

  test("validasi tanggal dan jam", () => {
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2028-02-29")).toBe(true);
    expect(isDateString("2026-1-5")).toBe(false);
    expect(isTimeString("23:59")).toBe(true);
    expect(isTimeString("13:30:00")).toBe(true);
    expect(isTimeString("24:00")).toBe(false);
    expect(() => jakartaToUtc("2026-13-01", "10:00")).toThrow(RangeError);
  });

  test("addDays melewati batas bulan dan tahun", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("hari ini di Jakarta", () => {
    expect(todayInJakarta(new Date("2026-10-09T18:00:00Z"))).toBe("2026-10-10");
  });
});

describe("jadwal kelas rutin Kamis", () => {
  test("tujuh pertemuan mingguan mulai Kamis pertama setelah tanggal mulai", () => {
    const result = generateRegularSessions({
      firstDate: "2026-10-12", // Senin
      count: 7,
      startTime: "15:30",
      durationMinutes: 120,
      holidays: [],
    });
    expect(result.sessions.map((s) => s.date)).toEqual([
      "2026-10-15",
      "2026-10-22",
      "2026-10-29",
      "2026-11-05",
      "2026-11-12",
      "2026-11-19",
      "2026-11-26",
    ]);
    expect(result.sessions.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(result.sessions[0]?.startsAt.toISOString()).toBe("2026-10-15T08:30:00.000Z");
    expect(result.sessions[0]?.endsAt.toISOString()).toBe("2026-10-15T10:30:00.000Z");
    expect(result.sessions.every((s) => isThursdayInJakarta(s.startsAt))).toBe(true);
    expect(result.shortfall).toBe(0);
  });

  test("tanggal mulai hari Kamis langsung dipakai", () => {
    const result = generateRegularSessions({
      firstDate: "2026-10-15",
      count: 1,
      startTime: "09:00",
      durationMinutes: 60,
      holidays: [],
    });
    expect(result.sessions[0]?.date).toBe("2026-10-15");
  });

  test("libur dilewati dan pertemuan bergeser ke Kamis berikutnya", () => {
    const result = generateRegularSessions({
      firstDate: "2026-10-15",
      count: 3,
      startTime: "15:30",
      durationMinutes: 120,
      holidays: [
        { startsOn: "2026-10-22", endsOn: "2026-10-22" },
        { startsOn: "2026-10-26", endsOn: "2026-11-01" }, // libur sepekan mencakup Kamis 29
      ],
    });
    expect(result.sessions.map((s) => s.date)).toEqual(["2026-10-15", "2026-11-05", "2026-11-12"]);
    expect(result.skipped).toEqual(["2026-10-22", "2026-10-29"]);
  });

  test("batas akhir semester memotong jadwal dan melaporkan kekurangan", () => {
    const result = generateRegularSessions({
      firstDate: "2026-12-01",
      count: 7,
      startTime: "15:30",
      durationMinutes: 120,
      holidays: [],
      until: "2026-12-24",
    });
    expect(result.sessions.map((s) => s.date)).toEqual([
      "2026-12-03",
      "2026-12-10",
      "2026-12-17",
      "2026-12-24",
    ]);
    expect(result.shortfall).toBe(3);
  });

  test("nomor pertemuan bisa dilanjutkan", () => {
    const result = generateRegularSessions({
      firstDate: "2026-10-15",
      count: 2,
      startTime: "15:30",
      durationMinutes: 90,
      holidays: [],
      firstSequence: 6,
    });
    expect(result.sessions.map((s) => s.sequence)).toEqual([6, 7]);
  });

  test("input tidak valid ditolak", () => {
    expect(() =>
      generateRegularSessions({ firstDate: "2026-02-30", count: 1, startTime: "10:00", durationMinutes: 60, holidays: [] }),
    ).toThrow(RangeError);
    expect(() =>
      generateRegularSessions({ firstDate: "2026-10-15", count: 0, startTime: "10:00", durationMinutes: 60, holidays: [] }),
    ).toThrow(RangeError);
  });

  test("isWithin dan overlaps", () => {
    expect(isWithin("2026-10-22", [{ startsOn: "2026-10-20", endsOn: "2026-10-22" }])).toBe(true);
    expect(isWithin("2026-10-23", [{ startsOn: "2026-10-20", endsOn: "2026-10-22" }])).toBe(false);
    const a = { startsAt: new Date("2026-10-15T08:00:00Z"), endsAt: new Date("2026-10-15T10:00:00Z") };
    expect(overlaps(a, { startsAt: new Date("2026-10-15T09:59:00Z"), endsAt: new Date("2026-10-15T11:00:00Z") })).toBe(true);
    expect(overlaps(a, { startsAt: new Date("2026-10-15T10:00:00Z"), endsAt: new Date("2026-10-15T11:00:00Z") })).toBe(false);
  });
});

describe("cakupan kalender", () => {
  const DIV_A = "div-a";
  const DIV_B = "div-b";
  const member = (user: Partial<SessionUser>, enrolled: string[] = []): Viewer => ({
    user: { id: "u", roles: ["anggota"], coordinatorDivisionIds: [], ...user },
    divisionId: DIV_A,
    enrolledClassIds: new Set(enrolled),
  });

  test("kelas hanya untuk anggota terdaftar", () => {
    const session = { kind: "regular" as const, classId: "kelas-1", divisionId: DIV_B };
    expect(canSeeSession(member({}, ["kelas-1"]), session)).toBe(true);
    expect(canSeeSession(member({}), session)).toBe(false);
    expect(canSeeSession(member({}, ["kelas-1"]), { ...session, kind: "extra" })).toBe(true);
  });

  test("kegiatan terbuka sesuai cakupan divisi", () => {
    expect(canSeeSession(member({}), { kind: "activity", classId: null, divisionId: null })).toBe(true);
    expect(canSeeSession(member({}), { kind: "activity", classId: null, divisionId: DIV_A })).toBe(true);
    expect(canSeeSession(member({}), { kind: "activity", classId: null, divisionId: DIV_B })).toBe(false);
  });

  test("koordinator melihat semua sesi divisinya, admin melihat semua", () => {
    const session = { kind: "regular" as const, classId: "kelas-2", divisionId: DIV_B };
    expect(canSeeSession(member({ roles: ["anggota", "koordinator"], coordinatorDivisionIds: [DIV_B] }), session)).toBe(true);
    expect(canSeeSession(member({ roles: ["anggota", "koordinator"], coordinatorDivisionIds: [DIV_A] }), session)).toBe(false);
    expect(canSeeSession(member({ roles: ["anggota", "admin"] }), session)).toBe(true);
  });

  test("event kalender", () => {
    expect(canSeeCalendarEvent(member({}), { divisionId: null })).toBe(true);
    expect(canSeeCalendarEvent(member({}), { divisionId: DIV_A })).toBe(true);
    expect(canSeeCalendarEvent(member({}), { divisionId: DIV_B })).toBe(false);
    expect(canSeeCalendarEvent(member({ roles: ["anggota", "admin"] }), { divisionId: DIV_B })).toBe(true);
  });
});

describe("feed .ics", () => {
  test("sesi memakai waktu UTC, event sepanjang hari memakai DTEND eksklusif", () => {
    const ics = buildIcsFeed({
      calendarName: "Presync",
      sessions: [
        {
          id: "s1",
          title: "Web Dev #1",
          startsAt: new Date("2026-10-15T08:30:00Z"),
          endsAt: new Date("2026-10-15T10:30:00Z"),
          location: "Lab 3",
          meetingUrl: null,
          status: "scheduled",
          offReason: null,
          updatedAt: new Date("2026-10-01T00:00:00Z"),
        },
        {
          id: "s2",
          title: "Web Dev #2",
          startsAt: new Date("2026-10-22T08:30:00Z"),
          endsAt: new Date("2026-10-22T10:30:00Z"),
          location: null,
          meetingUrl: "https://meet.contoh.test/abc",
          status: "off",
          offReason: "Libur nasional",
          updatedAt: new Date("2026-10-01T00:00:00Z"),
        },
      ],
      events: [
        { id: "e1", title: "UTS", startsOn: "2026-11-02", endsOn: "2026-11-06", description: null },
      ],
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("UID:sesi-s1@presync.informaticstudyclub.com");
    expect(ics).toContain("DTSTART:20261015T083000Z");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102");
    expect(ics).toContain("DTEND;VALUE=DATE:20261107");
  });

  test("feed kosong tetap valid", () => {
    const ics = buildIcsFeed({ calendarName: "Presync", sessions: [], events: [] });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
  });
});
