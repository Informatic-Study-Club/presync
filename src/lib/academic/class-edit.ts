import { addMinutes, jakartaToUtc, toJakarta } from "./time";

// Ubah, arsipkan, dan hapus kelas sebagai fungsi murni (dites di
// class-edit.test.ts). Pemanggil menyiapkan data dari database.

export type Venue = {
  mode: "offline" | "online" | "hybrid";
  location: string | null;
  meetingUrl: string | null;
};

export type UpcomingSession = {
  id: string;
  sequence: number | null;
  startsAt: Date;
  status: "scheduled" | "done" | "off";
};

export type SessionPatch = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  mode: Venue["mode"];
  location: string | null;
  meetingUrl: string | null;
};

/** Judul sesi rutin, sama dengan saat kelas dibuat. */
export function regularSessionTitle(className: string, sequence: number | null): string {
  return sequence === null ? className : `${className} #${sequence}`;
}

/** Jam baru pada tanggal yang sama (Asia/Jakarta), jadi hari Kamis tetap Kamis. */
export function rescheduleOnSameDate(
  startsAt: Date,
  startTime: string,
  durationMinutes: number,
): { startsAt: Date; endsAt: Date } {
  const next = jakartaToUtc(toJakarta(startsAt).date, startTime);
  return { startsAt: next, endsAt: addMinutes(next, durationMinutes) };
}

/**
 * Perubahan untuk sesi rutin yang masih dijadwalkan dan belum dimulai.
 * Sesi selesai, libur, atau sudah lewat tidak disentuh supaya riwayat tetap.
 */
export function upcomingSessionPatches(
  rows: readonly UpcomingSession[],
  defaults: Venue & { startTime: string; durationMinutes: number },
  now: Date,
): SessionPatch[] {
  return rows
    .filter((s) => s.status === "scheduled" && s.startsAt.getTime() > now.getTime())
    .map((s) => ({
      id: s.id,
      ...rescheduleOnSameDate(s.startsAt, defaults.startTime, defaults.durationMinutes),
      mode: defaults.mode,
      location: defaults.mode === "online" ? null : defaults.location,
      meetingUrl: defaults.mode === "offline" ? null : defaults.meetingUrl,
    }));
}

export type ClassUsage = {
  attendance: number;
  scores: number;
  overrides: number;
};

/**
 * Kelas hanya boleh dihapus bila belum punya data yang harus diaudit. Hapus
 * kelas ikut menghapus sesi (cascade), dan presensi ikut terhapus bersama
 * sesinya. Kelas yang sudah berjalan diarsipkan saja.
 */
export function classDeleteBlocker(usage: ClassUsage): "attendance" | "scores" | null {
  if (usage.attendance > 0) return "attendance";
  if (usage.scores > 0 || usage.overrides > 0) return "scores";
  return null;
}
