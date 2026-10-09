import { describe, expect, test } from "bun:test";
import {
  formatMemberCode,
  isValidMemberCode,
  parseMemberCode,
  yearDigits,
} from "./member-code";
import { isNormalizedPhone, normalizePhone } from "./phone";

describe("kode ID anggota", () => {
  test("mem-parse kode valid", () => {
    expect(parseMemberCode("ISC2601009")).toEqual({ year: "26", batch: "01", seq: 9 });
    expect(parseMemberCode("ISC2501083")).toEqual({ year: "25", batch: "01", seq: 83 });
  });

  test("menolak format salah", () => {
    for (const code of [
      "",
      "ISC260109",
      "ISC26010009",
      "isc2601009",
      "ISC2601000", // urutan 0 tidak pernah diterbitkan
      " ISC2601009",
      "ISC2601009 ",
      "ISX2601009",
      "ISC26A1009",
    ]) {
      expect(isValidMemberCode(code)).toBe(false);
    }
  });

  test("format menghasilkan lebar tetap 10 karakter", () => {
    expect(formatMemberCode({ year: "26", batch: "01", seq: 85 })).toBe("ISC2601085");
    expect(formatMemberCode({ year: "26", batch: "01", seq: 1 })).toBe("ISC2601001");
    expect(formatMemberCode({ year: "26", batch: "02", seq: 999 })).toBe("ISC2602999");
  });

  test("format menolak nilai di luar batas", () => {
    expect(() => formatMemberCode({ year: "26", batch: "01", seq: 0 })).toThrow(RangeError);
    expect(() => formatMemberCode({ year: "26", batch: "01", seq: 1000 })).toThrow(RangeError);
    expect(() => formatMemberCode({ year: "26", batch: "01", seq: 1.5 })).toThrow(RangeError);
    expect(() => formatMemberCode({ year: "2026", batch: "01", seq: 1 })).toThrow(RangeError);
    expect(() => formatMemberCode({ year: "26", batch: "1", seq: 1 })).toThrow(RangeError);
  });

  test("parse lalu format kembali ke kode semula", () => {
    const code = "ISC2601084";
    const parts = parseMemberCode(code);
    expect(parts).not.toBeNull();
    expect(formatMemberCode(parts!)).toBe(code);
  });

  test("tahun memakai zona Asia/Jakarta", () => {
    // 31 Des 2025 18:00 UTC = 1 Jan 2026 01:00 WIB
    expect(yearDigits(new Date("2025-12-31T18:00:00Z"))).toBe("26");
    expect(yearDigits(new Date("2025-12-31T16:00:00Z"))).toBe("25");
  });
});

describe("normalisasi nomor HP", () => {
  test.each([
    ["081234567890", "+6281234567890"],
    ["6281234567890", "+6281234567890"],
    ["+6281234567890", "+6281234567890"],
    ["81234567890", "+6281234567890"],
    ["0812-3456-7890", "+6281234567890"],
    ["0812 3456 7890", "+6281234567890"],
    ["+62 812.3456.7890", "+6281234567890"],
    ["(0812) 3456 7890", "+6281234567890"],
    ["0812 3456 7890", "+6281234567890"],
    ["08123456789", "+628123456789"],
    ["0812345678901", "+62812345678901"],
  ])("%p -> %p", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test.each([
    [""],
    ["abc"],
    ["0212345678"], // telepon rumah, bukan seluler
    ["+6221234567"],
    ["0812345"], // terlalu pendek
    ["08123456789012345"], // terlalu panjang
    ["+1 555 123 4567"],
    ["0812-3456-789x"],
    ["++6281234567890"],
  ])("menolak %p", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  test("isNormalizedPhone hanya menerima format akhir", () => {
    expect(isNormalizedPhone("+6281234567890")).toBe(true);
    expect(isNormalizedPhone("081234567890")).toBe(false);
  });
});
