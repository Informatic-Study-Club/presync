import { describe, expect, test } from "bun:test";
import { spanContains, termChangeError, termDeleteError, yearChangeError, yearDeleteError } from "./calendar-edit";

const year = { startsOn: "2026-08-01", endsOn: "2027-07-31" };
const ganjil = { startsOn: "2026-09-01", endsOn: "2027-01-31" };

describe("spanContains", () => {
  test("batas inklusif", () => {
    expect(spanContains(year, year)).toBe(true);
    expect(spanContains(year, ganjil)).toBe(true);
    expect(spanContains(ganjil, year)).toBe(false);
  });
});

describe("yearChangeError", () => {
  test("rentang baru masih mencakup semester", () => {
    expect(yearChangeError({ startsOn: "2026-09-01", endsOn: "2027-06-30" }, [ganjil])).toBeNull();
  });

  test("semester jatuh di luar rentang baru ditolak", () => {
    expect(yearChangeError({ startsOn: "2026-10-01", endsOn: "2027-06-30" }, [ganjil])).not.toBeNull();
  });

  test("tahun tanpa semester bebas diubah", () => {
    expect(yearChangeError({ startsOn: "2030-01-01", endsOn: "2030-12-31" }, [])).toBeNull();
  });
});

describe("termChangeError", () => {
  const sessions = { first: "2026-09-10", last: "2026-12-17" };

  test("di dalam tahun ajaran dan mencakup semua sesi", () => {
    expect(termChangeError({ startsOn: "2026-09-01", endsOn: "2026-12-31" }, year, sessions)).toBeNull();
  });

  test("keluar dari tahun ajaran ditolak", () => {
    expect(termChangeError({ startsOn: "2026-07-01", endsOn: "2026-12-31" }, year, null)).not.toBeNull();
  });

  test("memotong sesi kelas yang sudah ada ditolak", () => {
    expect(termChangeError({ startsOn: "2026-09-01", endsOn: "2026-11-30" }, year, sessions)).not.toBeNull();
    expect(termChangeError({ startsOn: "2026-09-15", endsOn: "2026-12-31" }, year, sessions)).not.toBeNull();
  });

  test("semester tanpa sesi cukup di dalam tahun ajaran", () => {
    expect(termChangeError({ startsOn: "2027-02-01", endsOn: "2027-06-30" }, year, null)).toBeNull();
  });
});

describe("hapus", () => {
  test("tahun ajaran hanya bila belum punya semester", () => {
    expect(yearDeleteError(0)).toBeNull();
    expect(yearDeleteError(2)).not.toBeNull();
  });

  test("semester hanya bila belum punya kelas", () => {
    expect(termDeleteError(0)).toBeNull();
    expect(termDeleteError(1)).not.toBeNull();
  });
});
