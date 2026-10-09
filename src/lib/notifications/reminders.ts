import { addDays, toJakarta } from "@/lib/academic/time";

// Pemilihan sesi untuk pengingat. "h1" dijalankan cron harian Vercel,
// "1h" dijalankan GitHub Actions tiap 15 menit (cron Vercel Hobby hanya harian).

export type ReminderKind = "h1" | "1h";

export type ReminderSession = {
  id: string;
  status: "scheduled" | "done" | "off";
  startsAt: Date;
};

const MINUTE = 60_000;
/** Jendela "1 jam sebelum": mulai 45-75 menit lagi, cocok dengan jadwal 15 menit. */
export const ONE_HOUR_WINDOW = { fromMin: 45, toMin: 75 };

export function selectSessionsForReminder<T extends ReminderSession>(
  sessions: readonly T[],
  kind: ReminderKind,
  now: Date,
): T[] {
  return sessions.filter((s) => {
    if (s.status !== "scheduled") return false;
    if (kind === "h1") {
      return toJakarta(s.startsAt).date === addDays(toJakarta(now).date, 1);
    }
    const diff = s.startsAt.getTime() - now.getTime();
    return diff > ONE_HOUR_WINDOW.fromMin * MINUTE && diff <= ONE_HOUR_WINDOW.toMin * MINUTE;
  });
}

export function reminderKey(kind: ReminderKind, sessionId: string, memberId: string): string {
  return `reminder:${kind}:${sessionId}:${memberId}`;
}

/** Pengingat yang terlambat (sesi sudah mulai) tidak lagi berguna. */
export function isExpired(payload: { expiresAt?: unknown }, now: Date): boolean {
  if (typeof payload.expiresAt !== "string") return false;
  const at = Date.parse(payload.expiresAt);
  return Number.isFinite(at) && now.getTime() > at;
}

/** Digest tunggakan dikirim tiap Senin (WIB). */
export function isDigestDay(now: Date): boolean {
  return toJakarta(now).isoWeekday === 1;
}
