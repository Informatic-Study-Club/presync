import { describe, expect, test } from "bun:test";
import {
  classDeleteBlocker,
  regularSessionTitle,
  rescheduleOnSameDate,
  upcomingSessionPatches,
} from "./class-edit";
import { isThursdayInJakarta, jakartaToUtc, toJakarta } from "./time";

describe("rescheduleOnSameDate", () => {
  test("jam berubah, tanggal Kamis tetap", () => {
    const original = jakartaToUtc("2026-11-12", "15:30");
    const r = rescheduleOnSameDate(original, "19:00", 90);
    expect(toJakarta(r.startsAt)).toMatchObject({ date: "2026-11-12", time: "19:00" });
    expect(toJakarta(r.endsAt).time).toBe("20:30");
    expect(isThursdayInJakarta(r.startsAt)).toBe(true);
  });

  test("tanggal dibaca dalam WIB, bukan UTC", () => {
    // 06.30 WIB = 23.30 UTC hari sebelumnya.
    const original = jakartaToUtc("2026-11-12", "06:30");
    expect(toJakarta(rescheduleOnSameDate(original, "08:00", 60).startsAt).date).toBe("2026-11-12");
  });
});

describe("upcomingSessionPatches", () => {
  const now = jakartaToUtc("2026-11-15", "12:00");
  const rows = [
    { id: "lewat", sequence: 1, startsAt: jakartaToUtc("2026-11-12", "15:30"), status: "scheduled" as const },
    { id: "selesai", sequence: 2, startsAt: jakartaToUtc("2026-11-19", "15:30"), status: "done" as const },
    { id: "libur", sequence: 3, startsAt: jakartaToUtc("2026-11-26", "15:30"), status: "off" as const },
    { id: "nanti", sequence: 4, startsAt: jakartaToUtc("2026-12-03", "15:30"), status: "scheduled" as const },
  ];

  test("hanya sesi terjadwal yang belum dimulai", () => {
    const patches = upcomingSessionPatches(
      rows,
      { mode: "offline", location: "Lab 2", meetingUrl: null, startTime: "16:00", durationMinutes: 120 },
      now,
    );
    expect(patches.map((p) => p.id)).toEqual(["nanti"]);
    expect(toJakarta(patches[0]!.startsAt)).toMatchObject({ date: "2026-12-03", time: "16:00" });
  });

  test("lokasi dan tautan mengikuti mode", () => {
    const [online] = upcomingSessionPatches(
      rows,
      { mode: "online", location: "Lab 2", meetingUrl: "https://meet.example/x", startTime: "16:00", durationMinutes: 60 },
      now,
    );
    expect(online).toMatchObject({ mode: "online", location: null, meetingUrl: "https://meet.example/x" });
    const [offline] = upcomingSessionPatches(
      rows,
      { mode: "offline", location: "Lab 2", meetingUrl: "https://meet.example/x", startTime: "16:00", durationMinutes: 60 },
      now,
    );
    expect(offline).toMatchObject({ location: "Lab 2", meetingUrl: null });
  });
});

describe("regularSessionTitle", () => {
  test("nama kelas dan nomor pertemuan", () => {
    expect(regularSessionTitle("Web Dev Dasar", 3)).toBe("Web Dev Dasar #3");
    expect(regularSessionTitle("Web Dev Dasar", null)).toBe("Web Dev Dasar");
  });
});

describe("classDeleteBlocker", () => {
  test("kelas kosong boleh dihapus", () => {
    expect(classDeleteBlocker({ attendance: 0, scores: 0, overrides: 0 })).toBeNull();
  });

  test("ada presensi atau nilai: tidak boleh", () => {
    expect(classDeleteBlocker({ attendance: 1, scores: 0, overrides: 0 })).toBe("attendance");
    expect(classDeleteBlocker({ attendance: 0, scores: 3, overrides: 0 })).toBe("scores");
    expect(classDeleteBlocker({ attendance: 0, scores: 0, overrides: 1 })).toBe("scores");
  });
});
