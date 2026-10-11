import { id as t } from "@/messages/id";

// Aturan ubah dan hapus tahun ajaran serta semester sebagai fungsi murni
// (dites di calendar-edit.test.ts). Tanggal berupa string "YYYY-MM-DD",
// jadi perbandingan string sama dengan perbandingan tanggal.

export type DateSpan = { startsOn: string; endsOn: string };

const e = t.academic.errors;

export function spanContains(outer: DateSpan, inner: DateSpan): boolean {
  return inner.startsOn >= outer.startsOn && inner.endsOn <= outer.endsOn;
}

/** Rentang tahun ajaran baru harus tetap mencakup semua semesternya. */
export function yearChangeError(next: DateSpan, terms: readonly DateSpan[]): string | null {
  return terms.every((term) => spanContains(next, term)) ? null : e.termsOutsideYear;
}

/**
 * Semester harus di dalam tahun ajarannya dan tetap mencakup semua sesi kelas
 * di semester itu (tanggal sesi pertama dan terakhir, Asia/Jakarta).
 */
export function termChangeError(
  next: DateSpan,
  year: DateSpan,
  sessions: { first: string; last: string } | null,
): string | null {
  if (!spanContains(year, next)) return e.termOutsideYear;
  if (sessions && !spanContains(next, { startsOn: sessions.first, endsOn: sessions.last })) {
    return e.sessionsOutsideTerm;
  }
  return null;
}

export function yearDeleteError(termCount: number): string | null {
  return termCount > 0 ? e.yearHasTerms : null;
}

export function termDeleteError(classCount: number): string | null {
  return classCount > 0 ? e.termHasClasses : null;
}
