// Konversi waktu Asia/Jakarta (WIB, UTC+7, tanpa daylight saving).
// Tanggal kalender ditulis sebagai string "YYYY-MM-DD", jam sebagai "HH:MM".

const OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

export function isDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function isTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

/** "2026-10-15" + "13:30" (WIB) -> Date UTC. */
export function jakartaToUtc(date: string, time: string): Date {
  if (!isDateString(date)) throw new RangeError(`Tanggal tidak valid: ${date}`);
  const t = TIME_RE.exec(time);
  if (!t) throw new RangeError(`Jam tidak valid: ${time}`);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, Number(t[1]), Number(t[2])) - OFFSET_MS);
}

export type JakartaParts = { date: string; time: string; isoWeekday: number };

export function toJakarta(value: Date): JakartaParts {
  const shifted = new Date(value.getTime() + OFFSET_MS);
  const iso = shifted.toISOString();
  const day = shifted.getUTCDay();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), isoWeekday: day === 0 ? 7 : day };
}

export function isThursdayInJakarta(value: Date): boolean {
  return toJakarta(value).isoWeekday === 4;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000);
}

/** Tanggal hari ini di Jakarta. */
export function todayInJakarta(now = new Date()): string {
  return toJakarta(now).date;
}
