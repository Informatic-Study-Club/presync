import { RRule } from "rrule";
import { addMinutes, isDateString, jakartaToUtc } from "./time";

// Pembuatan jadwal kelas rutin: mingguan hari Kamis (rrule), melewati tanggal
// libur kalender akademik (docs/ARSITEKTUR.md bagian 8).

export type DateRange = { startsOn: string; endsOn: string };

export type PlannedSession = {
  sequence: number;
  /** Tanggal Kamis di Jakarta, "YYYY-MM-DD". */
  date: string;
  startsAt: Date;
  endsAt: Date;
};

export type ScheduleResult = {
  sessions: PlannedSession[];
  /** Kamis yang dilewati karena libur. */
  skipped: string[];
  /** Jumlah pertemuan yang tidak muat sebelum batas akhir (`until`). */
  shortfall: number;
};

const MAX_WEEKS = 104;

export function isWithin(date: string, ranges: readonly DateRange[]): boolean {
  return ranges.some((r) => date >= r.startsOn && date <= r.endsOn);
}

export function generateRegularSessions(input: {
  /** Tanggal mulai; Kamis pertama pada/setelah tanggal ini dipakai. */
  firstDate: string;
  count: number;
  startTime: string;
  durationMinutes: number;
  holidays: readonly DateRange[];
  /** Batas akhir inklusif, misalnya akhir semester. */
  until?: string;
  /** Nomor pertemuan pertama (untuk melanjutkan jadwal). */
  firstSequence?: number;
}): ScheduleResult {
  if (!isDateString(input.firstDate)) throw new RangeError(`Tanggal tidak valid: ${input.firstDate}`);
  if (input.until && !isDateString(input.until)) throw new RangeError(`Tanggal tidak valid: ${input.until}`);
  if (!Number.isInteger(input.count) || input.count < 1) throw new RangeError("Jumlah pertemuan minimal 1");

  const [y, m, d] = input.firstDate.split("-").map(Number) as [number, number, number];
  // rrule dipakai dengan tanggal "mengambang" di UTC; jam ditambahkan sesudahnya.
  const rule = new RRule({
    freq: RRule.WEEKLY,
    byweekday: [RRule.TH],
    dtstart: new Date(Date.UTC(y, m - 1, d)),
    count: MAX_WEEKS,
  });

  const sessions: PlannedSession[] = [];
  const skipped: string[] = [];
  let sequence = input.firstSequence ?? 1;

  for (const occurrence of rule.all()) {
    if (sessions.length >= input.count) break;
    const date = occurrence.toISOString().slice(0, 10);
    if (input.until && date > input.until) break;
    if (isWithin(date, input.holidays)) {
      skipped.push(date);
      continue;
    }
    const startsAt = jakartaToUtc(date, input.startTime);
    sessions.push({
      sequence: sequence++,
      date,
      startsAt,
      endsAt: addMinutes(startsAt, input.durationMinutes),
    });
  }

  return { sessions, skipped, shortfall: input.count - sessions.length };
}

export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
