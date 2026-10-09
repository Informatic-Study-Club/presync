import { describe, expect, test } from "bun:test";
import { activitySchema, classSchema, sessionStatusSchema } from "./validation";

const UUID = "11111111-1111-4111-8111-111111111111";
const baseClass = {
  divisionId: UUID,
  termId: UUID,
  name: "Web Dev Dasar",
  plannedSessions: "7",
  firstDate: "2026-10-12",
  startTime: "15:30",
  durationMinutes: "120",
};

describe("validasi kelas dan sesi", () => {
  test("offline wajib lokasi", () => {
    expect(classSchema.safeParse({ ...baseClass, mode: "offline", location: "", meetingUrl: "" }).success).toBe(false);
    const ok = classSchema.safeParse({ ...baseClass, mode: "offline", location: "Lab 3", meetingUrl: "" });
    expect(ok.success).toBe(true);
    expect(ok.data?.meetingUrl).toBeNull();
    expect(ok.data?.plannedSessions).toBe(7);
  });

  test("online wajib tautan https, hybrid wajib keduanya", () => {
    expect(classSchema.safeParse({ ...baseClass, mode: "online", location: "", meetingUrl: "" }).success).toBe(false);
    expect(classSchema.safeParse({ ...baseClass, mode: "online", meetingUrl: "http://meet.test/x" }).success).toBe(false);
    expect(classSchema.safeParse({ ...baseClass, mode: "online", meetingUrl: "https://meet.test/x" }).success).toBe(true);
    expect(classSchema.safeParse({ ...baseClass, mode: "hybrid", location: "Lab", meetingUrl: "" }).success).toBe(false);
    expect(classSchema.safeParse({ ...baseClass, mode: "hybrid", location: "Lab", meetingUrl: "https://meet.test/x" }).success).toBe(true);
  });

  test("tanggal, jam, dan jumlah pertemuan divalidasi", () => {
    const venue = { mode: "offline", location: "Lab" };
    expect(classSchema.safeParse({ ...baseClass, ...venue, firstDate: "2026-02-30" }).success).toBe(false);
    expect(classSchema.safeParse({ ...baseClass, ...venue, startTime: "25:00" }).success).toBe(false);
    expect(classSchema.safeParse({ ...baseClass, ...venue, plannedSessions: "0" }).success).toBe(false);
  });

  test("status libur wajib alasan", () => {
    expect(sessionStatusSchema.safeParse({ sessionId: UUID, status: "off", offReason: "" }).success).toBe(false);
    expect(sessionStatusSchema.safeParse({ sessionId: UUID, status: "off", offReason: "Libur nasional" }).success).toBe(true);
    expect(sessionStatusSchema.safeParse({ sessionId: UUID, status: "done", offReason: "" }).success).toBe(true);
  });

  test("kegiatan tanpa divisi berarti semua divisi", () => {
    const parsed = activitySchema.safeParse({
      divisionId: "",
      title: "Makrab ISC",
      date: "2026-11-07",
      startTime: "08:00",
      durationMinutes: "480",
      mode: "offline",
      location: "Aula",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.divisionId).toBeNull();
  });
});
